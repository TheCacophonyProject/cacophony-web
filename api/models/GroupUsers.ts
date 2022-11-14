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

import Sequelize from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import { ApiGroupUserSettings } from "@typedefs/api/group";

export interface GroupUsers extends Sequelize.Model, ModelCommon<GroupUsers> {
  admin: boolean;
  owner: boolean;
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

  GroupUsers.addAssociations = function () {};

  //---------------
  // CLASS METHODS
  //---------------

  return GroupUsers;
}
