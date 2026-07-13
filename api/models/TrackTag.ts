/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2019  The Cacophony Project

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

import type { TrackId, UserId } from "@typedefs/api/common.js";
import Sequelize, {
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  NonAttribute,
} from "sequelize";
import { ModelStaticCommon } from "./index.js";
import LabelPaths from "../classifications/label_paths.json" with { type: "json" };
import { TrackTagUserData } from "@models/TrackTagUserData.js";
export const AI_MASTER = "Master";
export type TrackTagId = number;
import { Track } from "@models/Track.js";
import { User } from "@models/User.js";

export interface TrackTagData {
  name: string;
  all_class_confidences: null | Record<string, number>;
  classify_time: number;
  message?: string;
  userTagsConflict?: boolean;
}

export class TrackTag extends ModelStaticCommon<TrackTag> {
  declare id: CreationOptional<TrackTagId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare what: string;
  declare confidence: number;
  declare automatic: boolean;

  declare TrackId: ForeignKey<TrackId>;
  declare UserId?: ForeignKey<UserId>;

  declare archivedAt: CreationOptional<Date>;
  declare path: CreationOptional<string>;
  declare used: CreationOptional<boolean>;
  declare model: CreationOptional<string>;

  declare User?: NonAttribute<User>;
  declare Track?: NonAttribute<Track>;

  declare static associations: {
    Track: BelongsTo<Track>;
    User: BelongsTo<User>;
  };

  TrackTagUserDatum?: NonAttribute<TrackTagUserData>;
  data?: NonAttribute<TrackTagData>;

  static additionalTags = Object.freeze([
    "poor tracking",
    "part",
    "interesting",
  ]);

  static apiSettableFields = Object.freeze(["what", "confidence", "data"]);
  static userGetAttributes = Object.freeze(
    TrackTag.apiSettableFields.concat(["id"]),
  );

  isAdditionalTag() {
    return TrackTag.additionalTags.includes(this.what);
  }

  static addPath(trackTag: TrackTag) {
    if (
      (trackTag.path === null && trackTag.what) ||
      (trackTag.path && trackTag.what && !trackTag.path.endsWith(trackTag.what))
    ) {
      // All paths are lower case, and spaces are replaced with underscores. eg. all.path_name.example
      const what = (trackTag.what as string).toLowerCase();
      const path =
        what in LabelPaths
          ? (LabelPaths as Record<string, string>)[what]
          : `all.${what.replace(" ", "_")}`;
      this.sequelize.query(
        `UPDATE "TrackTags"
           SET "path" = text2ltree(:path)
           WHERE "id" = :id`,
        { replacements: { path, id: trackTag.id } },
      );
    }
  }

  static filteredTags = Object.freeze(["false-positive", "noise"]);

  static addAssociations() {
    this.belongsTo(Track);
    this.belongsTo(User);
    this.hasOne(TrackTagUserData);
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

    what: DataTypes.STRING,
    path: DataTypes.STRING, // ltree path
    confidence: DataTypes.FLOAT,
    automatic: DataTypes.BOOLEAN,
    archivedAt: DataTypes.DATE,
    used: {
      // This tag is used in visit calculations/canonical tag search.
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null as string | null,
    },
  };
  TrackTag.init(attributes, {
    tableName: "TrackTags",
    name: {
      singular: "TrackTag",
      plural: "TrackTags",
    },
    sequelize: sequelizeInstance,
    hooks: {
      afterUpdate: TrackTag.addPath,
      afterCreate: TrackTag.addPath,
    },
  });
  return TrackTag;
};
