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
import type { ModelCommon, ModelStaticCommon } from "./index.js";
import type { GroupId, UserId } from "@typedefs/api/common.js";

export interface GroupInvites
  extends Sequelize.Model,
    ModelCommon<GroupInvites> {
  GroupId: GroupId;
  email: string;
  createdAt: Date;
  invitedBy: UserId;
  owner: boolean;
  admin: boolean;
}

export interface GroupInvitesStatic extends ModelStaticCommon<GroupInvites> {}

export default function (sequelize: Sequelize.Sequelize): GroupInvitesStatic {
  const name = "GroupInvites";

  const attributes = {
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

  const GroupInvites = sequelize.define(name, attributes, {
    freezeTableName: true,
    createdAt: true, // Don't create createdAt
    updatedAt: false, // Don't create updatedAt
  }) as unknown as GroupInvitesStatic;

  //---------------
  // CLASS METHODS
  //---------------
  GroupInvites.addAssociations = function (models) {
    models.GroupInvites.belongsTo(models.Group);
  };

  return GroupInvites;
}
