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
import { ModelCommon, ModelStaticCommon } from "./index";
import { User } from "./User";
import Sequelize from "sequelize";
import util from "./util/util";
import {
  ApiRecordingTagRequest,
  ApiRecordingTagResponse,
} from "@typedefs/api/tag";
import { TagId } from "@typedefs/api/common";
import { RecordingPermission, AcceptableTag } from "@typedefs/api/consts";
import logging from "@log";

export interface Tag
  extends ApiRecordingTagResponse,
    Sequelize.Model,
    ModelCommon<Tag> {}

export interface TagStatic extends ModelStaticCommon<Tag> {
  buildSafely: (fields: ApiRecordingTagRequest) => Tag;
  getFromId: (id: TagId, user: User, attributes: any) => Promise<Tag>;
  userGetAttributes: readonly string[];
  acceptableTags: Set<AcceptableTag>;
  deleteFromId: (id: TagId, user: User) => Promise<boolean>;
}

export const AcceptableTags = new Set(Object.values(AcceptableTag));

export default function (sequelize, DataTypes): TagStatic {
  const name = "Tag";
  const attributes = {
    what: {
      type: DataTypes.STRING,
    },
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0x0100,
    },
  };

  const Tag = sequelize.define(name, attributes);

  //---------------
  // CLASS METHODS
  //---------------
  const Recording = sequelize.models.Recording;

  Tag.buildSafely = function (fields: ApiRecordingTagRequest) {
    return Tag.build(_.pick(fields, Tag.apiSettableFields));
  };

  Tag.addAssociations = function (models) {
    models.Tag.belongsTo(models.User, { as: "tagger" });
    models.Tag.belongsTo(models.Recording);
  };

  Tag.getFromId = function (id, user, attributes) {
    return util.getFromId(id, user, attributes);
  };

  Tag.deleteModelInstance = function (id: TagId, user: User) {
    return util.deleteModelInstance(id, user);
  };

  Tag.deleteFromId = async function (id: TagId, user: User) {
    const tag = await this.findByPk(id);
    if (tag == null) {
      logging.warning("Didn't find tag");
      return true;
    }
    // FIXME - How about we validate *before* we get the resource?
    const recording = await Recording.get(
      user,
      tag.RecordingId,
      RecordingPermission.TAG
    );

    if (recording == null) {
      logging.warning("Didn't find recording %s", tag.RecordingId);
      return false;
    }

    await tag.destroy();
    return true;
  };

  Tag.acceptableTags = AcceptableTags;

  Tag.userGetAttributes = Object.freeze([
    "id",
    "what",
    "detail",
    "confidence",
    "startTime",
    "duration",
    "automatic",
    "version",
    "createdAt",
    "taggerId",
  ]);

  Tag.apiSettableFields = Object.freeze([
    "what",
    "detail",
    "confidence",
    "startTime",
    "duration",
    "automatic",
    "version",
  ]);

  return Tag;
}
