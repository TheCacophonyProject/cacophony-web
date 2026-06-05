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
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  NonAttribute,
} from "sequelize";
import { ModelStaticCommon } from "./index.js";
import type {
  GroupId,
  GroupInvitationId,
  UserId,
} from "@typedefs/api/common.js";
import { Group } from "@models/Group.js";

export class GroupInvites extends ModelStaticCommon<GroupInvites> {
  declare id: CreationOptional<GroupInvitationId>;
  declare createdAt: CreationOptional<Date>;
  declare email: string;
  declare invitedBy: ForeignKey<UserId>;
  declare GroupId: ForeignKey<GroupId>;
  declare owner: CreationOptional<boolean>;
  declare admin: CreationOptional<boolean>;
  declare Group?: NonAttribute<Group>;
  declare static associations: {
    Group: BelongsTo<Group>;
  };
  static addAssociations() {
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
    email: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    },
    invitedBy: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    owner: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    admin: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  };
  GroupInvites.init(attributes, {
    tableName: "GroupInvites",
    name: {
      singular: "GroupInvite",
      plural: "GroupInvites",
    },
    sequelize: sequelizeInstance,
    freezeTableName: true,
    updatedAt: false, // Don't create updatedAt
  });
  return GroupInvites;
};
