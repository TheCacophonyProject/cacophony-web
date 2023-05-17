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

import type { FindOptions } from "sequelize";
import Sequelize from "sequelize";
import type { ModelCommon, ModelStaticCommon } from "./index.js";
import type { TrackTag, TrackTagId} from "./TrackTag.js";
import { additionalTags, filteredTags } from "./TrackTag.js";
import type { Recording } from "./Recording.js";
import type { RecordingId, TrackId } from "@typedefs/api/common.js";
import type { TrackTagData } from "@/../types/api/trackTag.js";

export interface Track extends Sequelize.Model, ModelCommon<Track> {
  id: TrackId;
  RecordingId: RecordingId;
  AlgorithmId: number | null;
  data: any;
  automatic: boolean;
  filtered: boolean;
  // NOTE: Implicitly created by sequelize associations.
  getRecording: () => Promise<Recording>;
  updateIsFiltered: () => any;
  // Track Tags
  TrackTags?: TrackTag[];
  getTrackTag: (trackTagId: TrackTagId) => Promise<TrackTag>;
  addTag: (
    what: string,
    confidence: number,
    automatic: boolean,
    data: any,
    userId?: number
  ) => Promise<TrackTag>;
  getTrackTags: (options: FindOptions) => Promise<TrackTag[]>;
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
    filtered: DataTypes.BOOLEAN,
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
    const trackTag = await sequelize.transaction(async function (t) {
      const trackTags = (await models.TrackTag.findAll({
        where: {
          UserId: tag.UserId,
          automatic: tag.automatic,
          TrackId: trackId,
        },
        transaction: t,
      })) as TrackTag[];
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
    await this.updateIsFiltered();
    return trackTag;
  };

  //add or replace a tag, such that this track only has 1 animal tag by this user
  //and no duplicate tags
  Track.prototype.updateTag = async function (
    tagId: TrackTagId,
    data: TrackTagData
  ): Promise<TrackTag | void> {
    const trackId = this.id;
    const trackTag = await sequelize.transaction(async (t) => {
      const tag = (await models.TrackTag.findByPk(tagId, {
        transaction: t,
      })) as TrackTag;
      if (!tag || tag.TrackId !== trackId) {
        return null;
      }
      tag.data = {
        ...(typeof tag.data !== "string" && tag.data),
        ...data,
      };
      await tag.save({ transaction: t });
      return tag;
    });
    return trackTag;
  };

  // Adds a tag to a track and checks if any alerts need to be sent. All trackTags
  // should be added this way
  Track.prototype.addTag = async function (
    what,
    confidence,
    automatic,
    data,
    userId = null
  ): Promise<TrackTag> {
    const tag = (await this.createTrackTag({
      what,
      confidence,
      automatic,
      data,
      UserId: userId,
    })) as TrackTag;
    await this.updateIsFiltered();
    return tag;
  };
  // Return a specific track tag for the track.
  Track.prototype.getTrackTag = async function (trackTagId) {
    const trackTag = await models.TrackTag.findByPk(trackTagId);
    if (!trackTag) {
      return null;
    }

    // Ensure track tag belongs to this track.
    if ((trackTag as TrackTag).TrackId !== this.id) {
      return null;
    }

    return trackTag as TrackTag;
  };

  Track.prototype.updateIsFiltered = async function () {
    const trackId = this.id;
    return sequelize.transaction(async function (t) {
      const track = await models.Track.findByPk(trackId, {
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      const tags = await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: null,
        },
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      await track.update({ filtered: isFiltered(tags) }, { transaction: t });
    });
  };

  Track.prototype.updateIsFiltered = async function () {
    const trackId = this.id;
    return sequelize.transaction(async function (t) {
      const track = await models.Track.findByPk(trackId, {
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      const tags = await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: null,
        },
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      await track.update({ filtered: isFiltered(tags) }, { transaction: t });
    });
  };

  // Archive Track for soft-delete
  Track.prototype.archive = async function () {
    const trackId = this.id;
    return sequelize.transaction(async function (t) {
      const track = await models.Track.findByPk(trackId, {
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      const tags = await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: null,
        },
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      await track.update({ archivedAt: Date.now() }, { transaction: t });
      for (let i = 0; i < tags.length; i++) {
        await tags[i].update({ archivedAt: Date.now() }, { transaction: t });
      }
    });
  };

  // Retrieve Track from Archive
  Track.prototype.unarchive = async function () {
    const trackId = this.id;
    return sequelize.transaction(async function (t) {
      const track = await models.Track.findByPk(trackId, {
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      const tags = await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: {
            [Sequelize.Op.ne]: null,
          },
        },
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      });
      await track.update({ archivedAt: null }, { transaction: t });
      for (let i = 0; i < tags.length; i++) {
        await tags[i].update({ archivedAt: null }, { transaction: t });
      }
    });
  };

  // Archives tags for reprocessing
  Track.prototype.archiveTags = async function () {
    await models.TrackTag.update(
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
    await this.updateIsFiltered();
  };
  return Track;
}

function isFiltered(tags): boolean {
  // any human tag that isn't filtered 2
  //  or any ai master tag that isn't filtered

  // filtered if
  // any human tag that is filtered
  // no animal human tags
  const userTags = tags.filter((tag) => !tag.automatic);

  if (userTags.length > 0) {
    // any animal non filtered user tag, means not filtered
    if (
      userTags.some(
        (tag) =>
          !additionalTags.includes(tag.what) &&
          !filteredTags.some((filteredTag) => filteredTag == tag.what)
      )
    ) {
      return false;
    }

    //any user filtered tag means filtered
    if (
      userTags.some((tag) =>
        filteredTags.some((filteredTag) => filteredTag == tag.what)
      )
    ) {
      return true;
    }
  }
  // if ai master tag is filtered this track is filtered
  const masterTag = tags.find(
    (tag) =>
      tag.automatic &&
      ((tag.data?.name && tag.data.name == "Master") ||
        (tag.data && tag.data == "Master"))
  );
  if (masterTag) {
    return !!filteredTags.some((filteredTag) => filteredTag == masterTag.what);
  }
  return true;
}
