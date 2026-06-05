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

import _ from "lodash";
import { ModelStaticCommon } from "./index.js";
import Sequelize, {
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  NonAttribute,
} from "sequelize";
import type { ApiRecordingTagRequest } from "@typedefs/api/tag.js";
import { AcceptableTag } from "@typedefs/api/consts.js";
import { RecordingId, TagId, UserId } from "@typedefs/api/common.js";
import { User } from "@models/User.js";
import { Recording } from "@models/Recording.js";
export const AcceptableTags = new Set(Object.values(AcceptableTag));
export class Tag extends ModelStaticCommon<Tag> {
  declare id: CreationOptional<TagId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare startTime: CreationOptional<number>;
  declare duration: CreationOptional<number>;
  declare confidence: CreationOptional<number>;
  declare taggerId: ForeignKey<UserId>;
  declare RecordingId: ForeignKey<RecordingId>;
  declare detail: CreationOptional<string>;
  declare automatic: CreationOptional<boolean>;
  declare version: CreationOptional<number>;
  declare comment: CreationOptional<string>;

  declare tagger?: NonAttribute<User>;
  declare Recording?: NonAttribute<Recording>;

  declare static associations: {
    tagger: BelongsTo<User>;
    Recording: BelongsTo<Recording>;
  };

  static acceptableTags = AcceptableTags;
  static apiSettableFields = Object.freeze([
    "detail",
    "confidence",
    "startTime",
    "duration",
    "automatic",
    "version",
    "comment",
  ]);
  static userGetAttributes = [
    "id",
    "detail",
    "confidence",
    "startTime",
    "duration",
    "automatic",
    "version",
    "createdAt",
    "taggerId",
    "comment",
  ];

  static addAssociations() {
    this.belongsTo(User, { as: "tagger" });
    this.belongsTo(Recording);
  }

  static buildSafely(fields: ApiRecordingTagRequest) {
    return this.build(_.pick(fields, this.apiSettableFields));
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

    detail: {
      type: DataTypes.STRING,
    },
    confidence: {
      // 0: Not sure at all; 1: 100% positive
      type: DataTypes.FLOAT,
    },
    startTime: {
      // Start time of the tag in the linked recording in seconds
      type: DataTypes.FLOAT,
    },
    duration: {
      // duration of the tag
      type: DataTypes.FLOAT,
    },
    automatic: {
      // True if the tag was automatically generated.
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0x0100,
    },
  };
  Tag.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Tags",
    name: {
      plural: "Tags",
      singular: "Tag",
    },
  });
  return Tag;
};
