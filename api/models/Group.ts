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
import { GroupId, UserId, StationId, LatLng } from "@typedefs/api/common";
import { ApiGroupSettings } from "@typedefs/api/group";

const retireMissingStations = (
  existingStations: Station[],
  newStationsByName: Record<string, CreateStationData>,
  userId: UserId
): Promise<Station>[] => {
  const retirePromises = [];
  const numExisting = existingStations.length;
  for (let i = 0; i < numExisting; i++) {
    const station = existingStations.pop();
    if (!newStationsByName.hasOwnProperty(station.name)) {
      station.retiredAt = new Date();
      station.lastUpdatedById = userId;
      retirePromises.push(station.save());
    } else {
      existingStations.unshift(station);
    }
  }
  return retirePromises;
};

const EPSILON = 0.000000000001;

export const canonicalLatLng = (
  location: LatLng | { coordinates: [number, number] } | [number, number]
): LatLng => {
  if (Array.isArray(location)) {
    return { lat: location[0], lng: location[1] };
  } else if (location.hasOwnProperty("coordinates")) {
    // Lat lng is stored in the database as lng/lat (X,Y).
    // If we get lat/lng in this format we are getting it from the DB.
    return {
      lat: (location as { coordinates: [number, number] }).coordinates[1],
      lng: (location as { coordinates: [number, number] }).coordinates[0],
    };
  }
  return location as LatLng;
};

export const locationsAreEqual = (
  a: LatLng | { coordinates: [number, number] },
  b: LatLng | { coordinates: [number, number] }
): boolean => {
  const canonicalA = canonicalLatLng(a);
  const canonicalB = canonicalLatLng(b);
  // NOTE: We need to compare these numbers with an epsilon value, otherwise we get floating-point precision issues.
  return (
    Math.abs(canonicalA.lat - canonicalB.lat) < EPSILON &&
    Math.abs(canonicalA.lng - canonicalB.lng) < EPSILON
  );
};

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
    // Group id, and after date
    GroupId: group.id,
    recordingDateTime: dateRange,
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
  groupname: string;
  lastRecordingTime?: Date;
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
  addUserToGroup: (
    group: Group,
    userToAdd: User,
    admin: boolean
  ) => Promise<string>;
  removeUserFromGroup: (group: Group, userToRemove: User) => Promise<boolean>;
  getFromId: (id: GroupId) => Promise<Group>;
  getIdFromName: (groupname: string) => Promise<GroupId | null>;

  addStationsToGroup: (
    authUserId: UserId,
    stationsToAdd: CreateStationData[],
    shouldRetireMissingStations: boolean,
    group?: Group,
    existingStations?: Station[],
    applyToRecordingsFromDate?: Date,
    applyToRecordingsUntilDate?: Date
  ) => Promise<{
    stationIdsAddedOrUpdated: StationId[];
    updatedRecordingsPerStation: Record<StationId, number>;
    warnings?: string;
  }>;
}

export default function (sequelize, DataTypes): GroupStatic {
  const name = "Group";

  const attributes = {
    groupname: {
      type: DataTypes.STRING,
      unique: true,
    },
    lastRecordingTime: {
      type: DataTypes.DATE,
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
  };

  /**
   * Adds a user to a Group, if the given user has permission to do so.
   * The user must be a group admin to do this.
   */
  Group.addUserToGroup = async function (group, userToAdd, admin) {
    // Get association if already there and update it.
    const groupUser = await models.GroupUsers.findOne({
      where: {
        GroupId: group.id,
        UserId: userToAdd.id,
      },
    });
    if (groupUser !== null) {
      if (groupUser.admin !== admin) {
        groupUser.admin = admin; // Update admin value.
        await groupUser.save();
        return "Updated, user was made admin for group.";
      } else {
        return "No change, user already added.";
      }
    }
    await group.addUser(userToAdd, { through: { admin: admin } });
    return "Added user to group.";
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
      },
    });
    if (groupUser === null) {
      return false;
    }
    await groupUser.destroy();
    return true;
  };

  /**
   * Add stations to a group.
   * This will update any changes to position of existing stations.
   * If there are existing stations that are not in the new set, those stations will be retired.
   * Any new stations will be added.
   *
   * If there is an `applyToRecordingFromDate` Date provided, recordings belonging to this group
   * will be matched against the new list of stations to see if they fall within the station radius.
   *
   * As designed, this will *always* be a bulk import operation of external data from trap.nz
   *
   * Returns ids of updated or added stations
   *
   */
  Group.addStationsToGroup = async function (
    authUserId: UserId,
    stationsToAdd,
    shouldRetireMissingStations = false,
    group,
    alreadyExistingStations,
    applyToRecordingsFromDate,
    applyToRecordingsUntilDate
  ): Promise<{
    stationIdsAddedOrUpdated: StationId[];
    updatedRecordingsPerStation: Record<StationId, number>;
    warnings?: string;
  }> {
    let existingStations: Station[] = alreadyExistingStations;
    if (!existingStations && group) {
      existingStations = await group.getStations({
        where: {
          // Filter out retired stations.
          retiredAt: {
            [Op.eq]: null,
          },
        },
      });
    }
    // Enforce name uniqueness to group here:

    const existingStationsByName: Record<string, Station> = {};
    const newStationsByName: Record<string, CreateStationData> = {};
    const stationOpsPromises: Promise<any>[] = [];
    for (const station of stationsToAdd) {
      newStationsByName[station.name] = station;
    }

    // Make sure existing stations that are not in the current update are retired, and removed from
    // the list of existing stations that we are comparing with.
    // NOTE: This mutates `existingStations` to remove retired stations
    const retiredStations = shouldRetireMissingStations
      ? retireMissingStations(existingStations, newStationsByName, authUserId)
      : [];

    for (const station of existingStations) {
      existingStationsByName[station.name] = station;
    }

    // Make sure no two stations are too close to each other:
    const tooCloseWarning = checkThatStationsAreNotTooCloseTogether([
      ...existingStations,
      ...stationsToAdd,
    ]);

    // Add new stations, or update lat/lng if station with same name but different lat lng.
    const addedOrUpdatedStations = [];
    const allStations = [];
    for (const [name, newStation] of Object.entries(newStationsByName)) {
      let stationToAddOrUpdate;
      if (!existingStationsByName.hasOwnProperty(name)) {
        stationToAddOrUpdate = new models.Station({
          name: newStation.name,
          location: [newStation.lat, newStation.lng],
          lastUpdatedById: authUserId,
        });
        addedOrUpdatedStations.push(stationToAddOrUpdate);
        stationOpsPromises.push(
          new Promise((resolve) => {
            stationToAddOrUpdate.save().then(() => {
              group.addStation(stationToAddOrUpdate).then(() => {
                resolve(null);
              });
            });
          })
        );
      } else {
        // Update lat/lng if it has changed but the name is the same
        stationToAddOrUpdate = existingStationsByName[newStation.name];
        if (stationLocationHasChanged(stationToAddOrUpdate, newStation)) {
          // NOTE - Casting this as "any" because station.location has a special setter function
          (stationToAddOrUpdate as any).location = [
            newStation.lat,
            newStation.lng,
          ];
          stationToAddOrUpdate.lastUpdatedById = authUserId;
          addedOrUpdatedStations.push(stationToAddOrUpdate);
          stationOpsPromises.push(stationToAddOrUpdate.save());
        }
      }
      allStations.push(stationToAddOrUpdate);
    }
    await Promise.all([...stationOpsPromises, ...retiredStations]);
    let updatedRecordings = [];
    if (applyToRecordingsFromDate) {
      // After adding stations, we need to apply any station matches to recordings from a start date:
      updatedRecordings =
        await updateExistingRecordingsForGroupWithMatchingStationsFromDate(
          authUserId,
          group,
          applyToRecordingsFromDate,
          allStations,
          applyToRecordingsUntilDate
        );
      updatedRecordings = await Promise.all(updatedRecordings);
    }
    const result: {
      stationIdsAddedOrUpdated: StationId[];
      updatedRecordingsPerStation: Record<StationId, number>;
      warnings?: string;
    } = {
      stationIdsAddedOrUpdated: addedOrUpdatedStations.map(({ id }) => id),
      updatedRecordingsPerStation: updatedRecordings
        .map(({ station }) => ({ stationId: station.id }))
        .reduce((acc, item) => {
          if (!acc.hasOwnProperty(item.stationId)) {
            acc[item.stationId] = 1;
          } else {
            acc[item.stationId]++;
          }
          return acc;
        }, {}),
    };
    if (tooCloseWarning !== null) {
      result.warnings = tooCloseWarning;
    }
    return result;
  };

  Group.getFromId = async function (id) {
    return this.findByPk(id);
  };

  Group.getFromName = async function (name): Promise<Group | null> {
    return this.findOne({ where: { groupname: name } });
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
