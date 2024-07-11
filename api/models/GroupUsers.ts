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

import type Sequelize from "sequelize";
import type { ModelCommon, ModelStaticCommon } from "./index.js";
import type { ApiGroupUserSettings } from "@typedefs/api/group.js";

export interface GroupUsers extends Sequelize.Model, ModelCommon<GroupUsers> {
  admin: boolean;
  owner: boolean;
  pending: "requested" | "invited";
  settings?: ApiGroupUserSettings;
  transferredItems: number;
  transferredBytes: number;
  removedAt?: Date;
}
export interface GroupUsersStatic extends ModelStaticCommon<GroupUsers> {}

export default function (sequelize, DataTypes): GroupUsersStatic {
  const name = "GroupUsers";

  const attributes = {
    admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    owner: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    pending: {
      type: DataTypes.ENUM("requested", "invited"),
      allowNull: true,
      defaultValue: null,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    transferredItems: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    transferredBytes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    removedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  };

  const GroupUsers = sequelize.define(
    name,
    attributes
  ) as unknown as GroupUsersStatic;
  const models = sequelize.models;
  GroupUsers.addAssociations = function () {
    // models.Group.hasMany(models.Device);
    // models.Group.belongsToMany(models.User, { through: models.GroupUsers });
    // models.Group.hasMany(models.Recording);
    // models.Group.hasMany(models.Station);
    // models.Group.hasMany(models.GroupInvites);
    models.GroupUsers.belongsTo(models.User);
    models.GroupUsers.belongsTo(models.Group);
  };

  //---------------
  // CLASS METHODS
  //---------------

  return GroupUsers;
}
