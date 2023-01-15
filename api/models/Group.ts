/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import Sequelize, { Op } from "sequelize";
import models, { ModelCommon, ModelStaticCommon } from "./index";
import { User } from "./User";
import { CreateStationData, Station } from "./Station";
import { Recording } from "./Recording";
import {
  latLngApproxDistance,
  MIN_STATION_SEPARATION_METERS,
  tryToMatchRecordingToStation,
} from "@api/V1/recordingUtil";
import { Device } from "./Device";
import { GroupId, UserId } from "@typedefs/api/common";
import { ApiGroupSettings } from "@typedefs/api/group";
import { locationsAreEqual } from "./util/util";

export const stationLocationHasChanged = (
  oldStation: Station,
  newStation: CreateStationData
) => !locationsAreEqual(oldStation.location, newStation);

export const checkThatStationsAreNotTooCloseTogether = (
  stations: Array<CreateStationData | Station>
): string | null => {
  const allStations = stations.map((s) => {
    if (s.hasOwnProperty("lat")) {
      return s as CreateStationData;
    } else {
      return {
        name: (s as Station).name,
        ...(s as Station).location,
      };
    }
  });
  const tooClosePairs: Record<
    string,
    { station: CreateStationData; others: CreateStationData[] }
  > = {};
  for (const a of allStations) {
    for (const b of allStations) {
      if (a !== b && a.name !== b.name) {
        if (latLngApproxDistance(a, b) < MIN_STATION_SEPARATION_METERS) {
          if (!tooClosePairs.hasOwnProperty(a.name)) {
            tooClosePairs[a.name] = { station: a, others: [] };
          }
          if (
            !tooClosePairs[a.name].others.find((item) => item.name === b.name)
          ) {
            tooClosePairs[a.name].others.push(b);
          }
        }
      }
    }
  }
  if (Object.values(tooClosePairs).length !== 0) {
    const pairs = {};
    let warnings = "Stations too close together: ";
    for (const { station, others } of Object.values(tooClosePairs)) {
      for (const other of others) {
        const first = station.name < other.name;
        const key = first
          ? `${station.name}_${other.name}`
          : `${other.name}_${station.name}`;
        if (!pairs.hasOwnProperty(key)) {
          warnings += `\n'${station.name}', '${
            other.name
          }': ${latLngApproxDistance(
            station,
            other
          )}m apart, must be at least ${MIN_STATION_SEPARATION_METERS}m apart.`;
          pairs[key] = true;
        }
      }
    }
    return warnings;
  }
  return null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const updateExistingRecordingsForGroupWithMatchingStationsFromDate = async (
  authUserId: UserId,
  group: Group,
  fromDate: Date,
  stations: Station[],
  untilDate?: Date
): Promise<Promise<{ station: Station; recording: Recording }>[]> => {
  // Now addedStations are properly resolved with ids:
  // Now we can look for all recordings in the group back to startDate, and check if any of them
  // should be assigned to any of our stations.

  let dateRange: any = {
    [Op.gte]: fromDate.toISOString(),
  };
  if (untilDate) {
    dateRange = {
      [Op.and]: [
        {
          [Op.gte]: fromDate.toISOString(),
        },
        {
          [Op.lt]: untilDate.toISOString(),
        },
      ],
    };
  }

  // Get recordings for group starting at date:
  const builder = new models.Recording.queryBuilder().init(authUserId, {
    where: {
      // Group id, and after date
      GroupId: group.id,
      recordingDateTime: dateRange,
    },
  });
  builder.query.distinct = true;
  delete builder.query.limit;
  const recordingsFromStartDate: Recording[] = await models.Recording.findAll(
    builder.get()
  );
  const recordingOpPromises = [];
  // Find matching recordings to apply stations to from `applyToRecordingsFromDate`
  for (const recording of recordingsFromStartDate) {
    // NOTE: This await call won't actually block, since we're passing all the stations in.
    const matchingStation = await tryToMatchRecordingToStation(
      recording,
      stations
    );
    if (matchingStation !== null) {
      recordingOpPromises.push(
        new Promise((resolve) => {
          recording.setStation(matchingStation).then(() => {
            resolve({
              station: matchingStation,
              recording,
            });
          });
        })
      );
    }
  }
  return recordingOpPromises;
};

export interface Group extends Sequelize.Model, ModelCommon<Group> {
  id: GroupId;
  groupName: string;
  lastThermalRecordingTime?: Date;
  lastAudioRecordingTime?: Date;
  settings?: ApiGroupSettings;
  addUser: (userToAdd: User, through: any) => Promise<void>;
  addStation: (stationToAdd: Station) => Promise<Station>;
  getUsers: (options?: {
    through?: any;
    where?: any;
    include?: any;
    attributes?: string[];
  }) => Promise<User[]>;
  getDevices: (options?: {
    where?: any;
    attributes?: string[];
  }) => Promise<Device[]>;

  getStations: (options?: {
    where?: any;
    attributes?: string[];
  }) => Promise<Station[]>;
}
export interface GroupStatic extends ModelStaticCommon<Group> {
  addOrUpdateGroupUser: (
    group: Group,
    userToAdd: User,
    admin: boolean,
    owner: boolean,
    pending: "invited" | "requested" | null
  ) => Promise<{
    action: string;
    added: boolean;
    permissionChanges: {
      oldAdmin: boolean;
      oldOwner: boolean;
      newAdmin: boolean;
      newOwner: boolean;
    };
  }>;
  removeUserFromGroup: (
    group: Group,
    userToRemove: User
  ) => Promise<{ removed: boolean; wasPending: boolean }>;
  getFromId: (id: GroupId) => Promise<Group>;
  getIdFromName: (groupName: string) => Promise<GroupId | null>;
}

export default function (sequelize, DataTypes): GroupStatic {
  const name = "Group";

  const attributes = {
    groupName: {
      type: DataTypes.STRING,
      unique: true,
    },
    lastThermalRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastAudioRecordingTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  };

  const Group = sequelize.define(name, attributes) as unknown as GroupStatic;

  Group.apiSettableFields = [];

  //---------------
  // Class methods
  //---------------
  const models = sequelize.models;

  Group.addAssociations = function (models) {
    models.Group.hasMany(models.Device);
    models.Group.belongsToMany(models.User, { through: models.GroupUsers });
    models.Group.hasMany(models.Recording);
    models.Group.hasMany(models.Station);
    models.Group.hasMany(models.GroupInvites);
  };

  /**
   * Adds a user to a Group, if the given user has permission to do so.
   * The user must be a group admin to do this.
   */
  Group.addOrUpdateGroupUser = async function (
    group,
    userToAdd,
    admin,
    owner,
    pending
  ) {
    // Get association if already there and update it.
    const groupUser = await models.GroupUsers.findOne({
      where: {
        GroupId: group.id,
        UserId: userToAdd.id,
      },
    });
    if (groupUser !== null && groupUser.removedAt === null) {
      const wasAdmin = groupUser.admin;
      const wasOwner = groupUser.owner;
      const prevPending = groupUser.pending;
      const permissionChanges = {
        oldAdmin: wasAdmin,
        oldOwner: wasOwner,
        newAdmin: admin,
        newOwner: owner,
      };
      if (wasAdmin !== admin) {
        groupUser.admin = admin;
      }
      if (wasOwner !== owner) {
        groupUser.owner = owner;
      }
      let addedPendingUser = false;
      if (prevPending !== null && prevPending !== pending) {
        groupUser.pending = pending;
        if (pending === null) {
          addedPendingUser = true;
        }
      }
      if (wasOwner !== owner || wasAdmin !== admin || prevPending !== pending) {
        await groupUser.save();
        return {
          action: "Updated, user group permissions changed.",
          permissionChanges,
          added: addedPendingUser,
        };
      }
      return {
        action: "No change, user already added with identical permissions",
        permissionChanges,
        added: false,
      };
    }
    if (groupUser && groupUser.removedAt !== null) {
      // Group user was previously removed, so we pretend we're recreating it.
      await groupUser.update({
        admin,
        owner,
        pending: null,
        removedAt: null,
      });
      return {
        action: "Added user to group.",
        permissionChanges: {
          oldAdmin: false,
          oldOwner: false,
          newAdmin: admin,
          newOwner: owner,
        },
        added: true,
      };
    }
    if (groupUser === null) {
      await group.addUser(userToAdd, { through: { admin, owner, pending } });
    }
    return {
      action: "Added user to group.",
      permissionChanges: {
        oldAdmin: false,
        oldOwner: false,
        newAdmin: admin,
        newOwner: owner,
      },
      added: true,
    };
  };

  /**
   * Removes a user from a Group
   */
  Group.removeUserFromGroup = async function (group, userToRemove) {
    // Get association if already there and update it.
    const groupUser = await models.GroupUsers.findOne({
      where: {
        GroupId: group.id,
        UserId: userToRemove.id,
        removedAt: { [Op.eq]: null },
      },
    });

    if (groupUser === null) {
      return { removed: false, wasPending: false };
    }

    if (groupUser.pending !== null) {
      // The group user hadn't yet accepted the invitation to this group, so we don't need to do anything.
      await groupUser.destroy();
      return { removed: true, wasPending: true };
    }
    // NOTE: We just mark the group user as removed, and will do actual removal at a later date
    //  (after the next billing cycle - we need to keep this user around until then so that we
    //   can attribute their resource usage to the group during billing).
    await groupUser.update({
      removedAt: new Date(),
    });
    return { removed: true, wasPending: false };
  };

  Group.getFromId = async function (id) {
    return this.findByPk(id);
  };

  Group.getFromName = async function (name): Promise<Group | null> {
    return this.findOne({ where: { groupName: name } });
  };

  // NOTE: It doesn't seem that there are any consumers of this function right now.
  Group.getIdFromName = async function (name): Promise<GroupId | null> {
    const group = await Group.getFromName(name);
    return (group && group.getDataValue("id")) || null;
  };

  //------------------
  // Instance methods
  //------------------

  return Group;
}
