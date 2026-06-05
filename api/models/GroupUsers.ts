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

import Sequelize, { CreationOptional, DataTypes, ForeignKey } from "sequelize";
import { ModelStaticCommon } from "./index.js";
import type { ApiGroupUserSettings } from "@typedefs/api/group.js";
import { GroupId, UserId } from "@typedefs/api/common.js";
import { User } from "@models/User.js";
import { Group } from "@models/Group.js";

export class GroupUsers extends ModelStaticCommon<GroupUsers> {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // FIXME: Admin is NULLable in the DB
  declare admin: CreationOptional<boolean>;
  declare owner: CreationOptional<boolean>;
  declare GroupId: ForeignKey<GroupId>;
  declare UserId: ForeignKey<UserId>;
  declare settings?: CreationOptional<ApiGroupUserSettings>;
  declare removedAt?: CreationOptional<Date>;
  declare transferredBytes: CreationOptional<number>;
  declare transferredItems: CreationOptional<number>;
  declare pending: CreationOptional<"requested" | "invited">;

  static addAssociations() {
    this.belongsTo(User);
    this.belongsTo(Group);
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,

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
      defaultValue: null as "requested" | "invited" | null,
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
  GroupUsers.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "GroupUsers",
    name: {
      singular: "GroupUser",
      plural: "GroupUsers",
    },
  });
  return GroupUsers;
};
