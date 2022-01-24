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

import Sequelize from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import { TrackTag, TrackTagId } from "./TrackTag";
import { Recording } from "./Recording";
import { RecordingId, TrackId } from "@typedefs/api/common";
import logger from "@log";

export interface Track extends Sequelize.Model, ModelCommon<Track> {
  RecordingId: RecordingId;
  getTrackTag: (trackTagId: TrackTagId) => Promise<TrackTag>;
  id: TrackId;
  AlgorithmId: number | null;
  data: any;
  automatic: boolean;
  addTag: (
    what: string,
    confidence: number,
    automatic: boolean,
    data: any,
    userId?: number
  ) => Promise<TrackTag>;
  // NOTE: Implicitly created by sequelize associations.
  getRecording: () => Promise<Recording>;

  TrackTags?: TrackTag[];
  replaceTag: (tag: TrackTag) => Promise<any>;
}
export interface TrackStatic extends ModelStaticCommon<Track> {
  archiveTags: () => Promise<any>;
}

export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): TrackStatic {
  const Track = sequelize.define("Track", {
    data: DataTypes.JSONB,
    archivedAt: DataTypes.DATE,
  }) as unknown as TrackStatic;

  //---------------
  // CLASS
  //---------------
  Track.addAssociations = function (models) {
    models.Track.belongsTo(models.Recording);
    models.Track.belongsTo(models.DetailSnapshot, {
      as: "Algorithm",
      foreignKey: "AlgorithmId",
    });
    models.Track.hasMany(models.TrackTag);
  };

  const models = sequelize.models;

  Track.apiSettableFields = Object.freeze(["algorithm", "data", "archivedAt"]);

  Track.userGetAttributes = Object.freeze(
    Track.apiSettableFields.concat(["id"])
  );

  //add or replace a tag, such that this track only has 1 animal tag by this user
  //and no duplicate tags
  Track.prototype.replaceTag = async function (
    tag: TrackTag
  ): Promise<TrackTag | void> {
    const trackId = this.id;
    return sequelize.transaction(async function (t) {
      const trackTags = await models.TrackTag.findAll({
        where: {
          UserId: tag.UserId,
          automatic: tag.automatic,
          TrackId: trackId,
        },
        transaction: t,
      });
      const existingTag = trackTags.find(
        (uTag: TrackTag) => uTag.what === tag.what
      );
      if (existingTag) {
        return;
      } else if (trackTags.length > 0 && !tag.isAdditionalTag()) {
        const existingAnimalTags = trackTags.filter(
          (uTag) => !uTag.isAdditionalTag()
        );
        for (let i = 0; i < existingAnimalTags.length; i++) {
          await existingAnimalTags[i].destroy({ transaction: t });
        }
      }
      await tag.save({ transaction: t });
      return tag;
    });
  };

  // Adds a tag to a track and checks if any alerts need to be sent. All trackTags
  // should be added this way
  Track.prototype.addTag = async function (
    what,
    confidence,
    automatic,
    data,
    userId = null
  ) {
    const tag = await this.createTrackTag({
      what,
      confidence,
      automatic,
      data,
      UserId: userId,
    });
    return tag;
  };
  // Return a specific track tag for the track.
  Track.prototype.getTrackTag = async function (trackTagId) {
    const trackTag = await models.TrackTag.findByPk(trackTagId);
    if (!trackTag) {
      return null;
    }

    // Ensure track tag belongs to this track.
    if (trackTag.TrackId !== this.id) {
      return null;
    }

    return trackTag;
  };

  // Archives tags for reprocessing
  Track.prototype.archiveTags = async function () {
    models.TrackTag.update(
      {
        archivedAt: Date.now(),
      },
      {
        where: {
          TrackId: this.id,
          automatic: true,
        },
      }
    );
  };
  return Track;
}
