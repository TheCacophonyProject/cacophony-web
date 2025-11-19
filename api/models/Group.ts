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

import Sequelize, {
  BelongsToMany,
  BelongsToManyAddAssociationMixin,
  BelongsToManyGetAssociationsMixin,
  CreationOptional,
  DataTypes,
  HasMany,
  HasManyAddAssociationMixin,
  HasManyGetAssociationsMixin,
  NonAttribute,
} from "sequelize";
import { Op } from "sequelize";
import { ModelStaticCommon } from "./index.js";
import { User } from "./User.js";
import type { CreateStationData, Station } from "./Station.js";
import type { GroupId, StationId, UserId } from "@typedefs/api/common.js";
import type { ApiGroupSettings } from "@typedefs/api/group.js";
import { locationsAreEqual } from "@models/util/locationUtils.js";
import { GroupUsers } from "@models/GroupUsers.js";
import { Recording } from "@models/Recording.js";
import { Device } from "@models/Device.js";

export const stationLocationHasChanged = (
  oldStation: Station,
  newStation: CreateStationData,
) => !locationsAreEqual(oldStation.location, newStation);

export class Group extends ModelStaticCommon<Group> {
  declare id: CreationOptional<GroupId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // FIXME: Maybe this shouldn't actually be CreationOptional, but the field is NULLable
  declare groupName: CreationOptional<string>;
  declare settings: CreationOptional<ApiGroupSettings>;
  declare lastThermalRecordingTime: CreationOptional<Date>;
  declare lastAudioRecordingTime: CreationOptional<Date>;
  declare addUser: BelongsToManyAddAssociationMixin<User, UserId>;
  declare getUsers: BelongsToManyGetAssociationsMixin<User>; // , UserId, GroupUsers
  declare getStations: HasManyGetAssociationsMixin<Station>;

  declare Users?: NonAttribute<User[]>;

  declare static associations: {
    Users: BelongsToMany<User>;
    Stations: HasMany<Station>;
    Recordings: HasMany<Recording>;
    Devices: HasMany<Device>;
  };

  static addAssociations() {
    const models = this.sequelize.models;
    this.hasMany(models.Device);
    this.belongsToMany(models.User, { through: models.GroupUsers });
    this.hasMany(models.Recording);
    this.hasMany(models.Station);
    this.hasMany(models.GroupInvites);
  }

  /**
   * Adds a user to a Group, if the given user has permission to do so.
   * The user must be a group admin to do this.
   */
  static async addOrUpdateGroupUser(
    group: Group,
    userToAdd: User,
    admin: boolean,
    owner: boolean,
    pending: "invited" | "requested" | null,
  ): Promise<{
    action: string;
    added: boolean;
    permissionChanges: {
      oldAdmin: boolean;
      oldOwner: boolean;
      newAdmin: boolean;
      newOwner: boolean;
    };
  }> {
    // Get association if already there and update it.
    const models = this.sequelize.models;
    const groupUser = (await models.GroupUsers.findOne({
      where: {
        GroupId: group.id,
        UserId: userToAdd.id,
      },
    })) as GroupUsers | null;
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
      // FIXME: This may be broken now?
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
  }

  /**
   * Removes a user from a Group
   */
  static async removeUserFromGroup(group: Group, userToRemove: User) {
    // Get association if already there and update it.
    const groupUser = (await this.sequelize.models.GroupUsers.findOne({
      where: {
        GroupId: group.id,
        UserId: userToRemove.id,
        removedAt: { [Op.eq]: null },
      },
    })) as GroupUsers | null;

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
  }

  static async getFromName(name: string): Promise<Group | null> {
    return this.findOne({ where: { groupName: name } });
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,

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

  Group.init(attributes, {
    tableName: "Groups",
    name: {
      plural: "Groups",
      singular: "Group",
    },
    sequelize: sequelizeInstance,
  });
  return Group;
};
