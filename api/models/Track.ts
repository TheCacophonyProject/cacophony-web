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
import type { TrackTag, TrackTagId } from "./TrackTag.js";
import { AI_MASTER } from "./TrackTag.js";
import { additionalTags, filteredTags } from "./TrackTag.js";
import type { Recording } from "./Recording.js";
import type { RecordingId, TrackId } from "@typedefs/api/common.js";
import type { TrackTagData } from "@/../types/api/trackTag.js";
import { openS3 } from "@models/util/util.js";
import { promisify } from "util";
import zlib from "zlib";
import {
  PutObjectCommand,
  type PutObjectCommandInput,
  type S3Client,
} from "@aws-sdk/client-s3";
import config from "@config";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const saveTrackTagData = async (
  trackTagId: TrackTagId,
  newData: TrackTagData,
  existingData = {},
  client: S3Client | null = null
) => {
  const updatedData = {
    ...(typeof existingData !== "string" && existingData),
    ...newData,
  };
  const key = `TrackTag/${trackTagId}`;
  const body = await gzip(Buffer.from(JSON.stringify(updatedData), "utf-8"));
  if (client) {
    const length = body.length || 0; //"length" in body ? body.length : 0;
    const payload: PutObjectCommandInput = {
      Key: key,
      Body: body,
      Bucket: config.s3Local.bucket,
      ContentLength: length,
    };
    return client.send(new PutObjectCommand(payload));
  } else {
    await openS3().upload(key, body);
  }
};

const getTrackTagData = async (trackTagId: TrackTagId) => {
  try {
    const data = await openS3().getObject(`TrackTag/${trackTagId}`);
    const compressedData = await data.Body.transformToByteArray();
    const uncompressed = await gunzip(compressedData);
    return JSON.parse(uncompressed.toString("utf-8"));
  } catch (e) {
    return {};
  }
};

export const saveTrackData = async (
  trackId: TrackId,
  newData: any,
  existingData = {},
  client: S3Client | null = null
) => {
  if (typeof newData !== "object") {
    return;
  }
  const updatedData = {
    ...(typeof existingData !== "string" && existingData),
    ...newData,
  };
  if (Object.keys(updatedData).length !== 0) {
    const body = await gzip(Buffer.from(JSON.stringify(updatedData), "utf-8"));
    const key = `Track/${trackId}`;
    if (client) {
      const length = body.length || 0; //"length" in body ? body.length : 0;
      const payload: PutObjectCommandInput = {
        Key: key,
        Body: body,
        Bucket: config.s3Local.bucket,
        ContentLength: length,
      };
      return client.send(new PutObjectCommand(payload));
    } else {
      await openS3().upload(key, body);
    }
  }
};

export const getTrackData = async (trackId: TrackId) => {
  try {
    const data = await openS3().getObject(`Track/${trackId}`);
    const compressedData = await data.Body.transformToByteArray();
    const uncompressed = await gunzip(compressedData);
    return JSON.parse(uncompressed.toString("utf-8"));
  } catch (e) {
    return {};
  }
};

export interface Track extends Sequelize.Model, ModelCommon<Track> {
  id: TrackId;
  RecordingId: RecordingId;
  AlgorithmId: number | null;
  data: any;
  automatic: boolean;
  startSeconds: number;
  endSeconds: number;
  filtered: boolean;
  // NOTE: Implicitly created by sequelize associations.
  getRecording: () => Promise<Recording>;
  updateIsFiltered: () => Promise<void>;
  // Track Tags
  TrackTags?: TrackTag[];
  getTrackTag: (trackTagId: TrackTagId) => Promise<TrackTag>;
  addTag: (
    what: string,
    confidence: number,
    automatic: boolean,
    data: TrackTagData | "",
    userId?: number,
    updateFiltered?: boolean
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
    startSeconds: {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    endSeconds: {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    minFreqHz: {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null,
    },
    maxFreqHz: {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null,
    },
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
      await saveTrackData(trackId, tag.data);
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
      // TODO:M: Is this correct and/or used?  Seems like it should update the object storage JSON.

      await saveTrackTagData(tagId, data, tag.data);

      // TODO:M - eventually we don't really need this DB transaction, right?
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
    what: string,
    confidence: number,
    automatic: boolean,
    data: TrackTagData | "",
    userId = null,
    updateFiltered = true
  ): Promise<TrackTag> {
    const modelName =
      data !== "" && typeof data === "object" && data.hasOwnProperty("name")
        ? data.name
        : null;
    const used = userId !== null || modelName === AI_MASTER;
    const tag = (await this.createTrackTag({
      what,
      confidence,
      automatic,
      data, // TODO:M: remove this after initial migration
      model: modelName,
      UserId: userId,
      used,
    })) as TrackTag;
    if (modelName && Object.keys(data).length > 0) {
      // Save the additional Track metadata to object storage
      await saveTrackTagData(tag.id, data as TrackTagData);
    }

    if (updateFiltered) {
      await this.updateIsFiltered();
    }
    return tag;
  };
  // Return a specific track tag for the track.
  Track.prototype.getTrackTag = async function (trackTagId: TrackTagId) {
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
      const tags = (await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: null,
        },
        lock: (t as any).LOCK.UPDATE,
        transaction: t,
      })) as TrackTag[];
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

const isFiltered = (tags: TrackTag[]): boolean => {
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
          !additionalTags.includes(tag.what) && !filteredTags.includes(tag.what)
      )
    ) {
      return false;
    }

    //any user filtered tag means filtered
    if (userTags.some((tag) => filteredTags.includes(tag.what))) {
      return true;
    }
  }
  // if ai master tag is filtered this track is filtered
  // TODO:M: replace with model column
  const masterTag = tags.find(
    (tag) =>
      tag.automatic &&
      ((typeof tag.data === "object" && tag.data.name === "Master") ||
        (tag.data && tag.data === "Master"))
  );
  if (masterTag) {
    return filteredTags.some((filteredTag) => filteredTag === masterTag.what);
  }
  return true;
};
