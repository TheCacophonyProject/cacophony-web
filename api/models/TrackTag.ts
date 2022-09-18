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

import { TrackId, UserId } from "@typedefs/api/common";
import Sequelize from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import { User } from "./User";
import LabelPaths from "../classifications/label_paths.json";
export const AI_MASTER = "Master";
export type TrackTagId = number;

export interface TrackTagData {
  name: string;
  all_class_confidences: null | Record<string, number>;
  classify_time: number;
  message?: string;
  gender?: "male" | "female" | null;
  maturity?: "juvenile" | "adult" | null;
}

export interface TrackTag extends Sequelize.Model, ModelCommon<TrackTag> {
  isAdditionalTag: () => boolean;
  id: TrackTagId;
  TrackId: TrackId;
  what: string;
  automatic: boolean;
  UserId: UserId;
  User: User;
  confidence: number;
  data: string | TrackTagData;
  archivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export const additionalTags = Object.freeze([
  "poor tracking",
  "part",
  "interesting",
]);
export const filteredTags = Object.freeze(["false-positive"]);

export interface TrackTagStatic extends ModelStaticCommon<TrackTag> {}
export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): TrackTagStatic {
  const TrackTag = sequelize.define("TrackTag", {
    what: DataTypes.STRING,
    path: DataTypes.STRING, // ltree path
    confidence: DataTypes.FLOAT,
    automatic: DataTypes.BOOLEAN,
    data: DataTypes.JSONB,
    archivedAt: DataTypes.DATE,
  }) as unknown as TrackTagStatic;

  //---------------
  // CLASS METHODS
  //---------------
  TrackTag.addAssociations = function (models) {
    models.TrackTag.belongsTo(models.Track);
    models.TrackTag.belongsTo(models.User);
  };

  TrackTag.apiSettableFields = Object.freeze(["what", "confidence", "data"]);

  TrackTag.userGetAttributes = Object.freeze(
    TrackTag.apiSettableFields.concat(["id"])
  );
  const addPath = (trackTag) => {
    // All paths are lower case, and spaces are replaced with underscores. eg. all.path_name.example
    const what = (trackTag.what as string).toLowerCase();
    const path =
      what in LabelPaths ? LabelPaths[what] : `all.${what.replace(" ", "_")}`;
    sequelize.query(
      `UPDATE "TrackTags" SET "path" = text2ltree(:path) WHERE "id" = :id`,
      { replacements: { path, id: trackTag.id } }
    );
  };

  TrackTag.afterUpdate("Add path", addPath);
  TrackTag.afterCreate("Add path", addPath);

  //---------------
  // INSTANCE
  //---------------

  TrackTag.prototype.isAdditionalTag = function () {
    return additionalTags.includes(this.what);
  };
  return TrackTag;
}
