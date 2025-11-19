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

import {
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  HasMany,
  HasManyCreateAssociationMixin,
  HasManyGetAssociationsMixin,
  NonAttribute,
  Transaction,
} from "sequelize";
import Sequelize from "sequelize";
import { ModelStaticCommon } from "./index.js";
import { TrackTag, TrackTagId } from "./TrackTag.js";
import { AI_MASTER } from "./TrackTag.js";
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
import { DetailSnapshot, DetailSnapshotId } from "@models/DetailSnapshot.js";
import { ApiTrackDataRequest } from "@typedefs/api/track.js";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class Track extends ModelStaticCommon<Track> {
  declare id: CreationOptional<TrackId>;
  declare createdAt: CreationOptional<Date>;

  // FIXME: Do we ever update tracks?
  declare updatedAt: CreationOptional<Date>;
  declare RecordingId: ForeignKey<RecordingId>;
  declare AlgorithmId: ForeignKey<DetailSnapshotId>;
  declare archivedAt: CreationOptional<Date>;
  declare filtered: CreationOptional<boolean>;
  declare startSeconds: CreationOptional<number>;
  declare endSeconds: CreationOptional<number>;
  declare minFreqHz: CreationOptional<number>;
  declare maxFreqHz: CreationOptional<number>;
  declare data: NonAttribute<ApiTrackDataRequest>;
  declare thumbnailScore: NonAttribute<number>;

  declare getTrackTags: HasManyGetAssociationsMixin<TrackTag>;

  declare TrackTags?: NonAttribute<TrackTag[]>;
  declare Recording?: NonAttribute<Recording>;

  declare static associations: {
    Recording: BelongsTo<Recording>;
    Algorithm: BelongsTo<DetailSnapshot>;
    TrackTags: HasMany<TrackTag>;
  };

  declare createTrackTag: HasManyCreateAssociationMixin<TrackTag, "TrackId">;

  static apiSettableFields = Object.freeze(["algorithm", "archivedAt"]);
  static userGetAttributes = Object.freeze([...Track.apiSettableFields, "id"]);

  static async getTrackData(trackId: TrackId) {
    try {
      const data = await openS3().getObject(`Track/${trackId}`);
      const compressedData = await data.Body.transformToByteArray();
      const uncompressed = await gunzip(compressedData);
      return JSON.parse(uncompressed.toString("utf-8"));
    } catch (_e) {
      return {};
    }
  }

  static async getTrackTagData(trackTagId: TrackTagId) {
    try {
      const data = await openS3().getObject(`TrackTag/${trackTagId}`);
      const compressedData = await data.Body.transformToByteArray();
      const uncompressed = await gunzip(compressedData);
      return JSON.parse(uncompressed.toString("utf-8"));
    } catch (_e) {
      return {};
    }
  }

  static async saveTrackData(
    trackId: TrackId,
    newData: unknown,
    existingData = {},
    client: S3Client | null = null,
  ) {
    if (typeof newData !== "object") {
      return;
    }
    const updatedData = {
      ...(typeof existingData !== "string" && existingData),
      ...newData,
    };
    if (Object.keys(updatedData).length !== 0) {
      const body = await gzip(
        new TextEncoder().encode(JSON.stringify(updatedData)),
      );
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
  }

  private async saveTrackTagData(
    trackTagId: TrackTagId,
    newData: TrackTagData,
    existingData = {},
    client: S3Client | null = null,
  ) {
    const models = this.sequelize.models;
    const updatedData = {
      ...(typeof existingData !== "string" && existingData),
      ...newData,
    };
    if ("gender" in updatedData || "maturity" in updatedData) {
      const existing = await models.TrackTagUserData.findByPk(trackTagId, {
        attributes: ["gender", "maturity"],
      });
      const userData = {
        gender: updatedData.gender || null,
        maturity: updatedData.maturity || null,
      };
      if (existing) {
        await existing.update(userData);
      }
      console.log(
        "Creating TrackTAgUserData: ",
        userData,
        " for TrackTagId: ",
        trackTagId,
        "",
      );
      await models.TrackTagUserData.create({
        TrackTagId: trackTagId,
        ...updatedData,
      });
    }
    const key = `TrackTag/${trackTagId}`;
    const body = await gzip(
      new TextEncoder().encode(JSON.stringify(updatedData)),
    );
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

  //add or replace a tag, such that this track only has 1 animal tag by this user
  //and no duplicate tags
  async replaceTag(
    tag: TrackTag,
    userData?: TrackTagData,
  ): Promise<TrackTag | void> {
    const trackId = this.id;
    const trackTag = await this.sequelize.transaction(
      async (transaction: Transaction) => {
        const trackTags = (await this.sequelize.models.TrackTag.findAll({
          where: {
            UserId: tag.UserId,
            automatic: tag.automatic,
            TrackId: trackId,
          },
          transaction,
        })) as TrackTag[];
        const existingTag = trackTags.find(
          (uTag: TrackTag) => uTag.what === tag.what,
        );
        if (existingTag) {
          return;
        } else if (trackTags.length > 0 && !tag.isAdditionalTag()) {
          const existingAnimalTags = trackTags.filter(
            (uTag) => !uTag.isAdditionalTag(),
          );
          await Promise.all(
            existingAnimalTags.map(async (tag: TrackTag) =>
              tag.destroy({ transaction }),
            ),
          );
        }
        return await tag.save({ transaction });
      },
    );
    if (userData) {
      await this.saveTrackTagData(trackTag.id, userData);
    }
    await this.updateIsFiltered();
    return trackTag;
  }

  // Update tag data
  async updateTag(
    tagId: TrackTagId,
    data: TrackTagData,
  ): Promise<TrackTag | void> {
    const trackId = this.id;
    const tag = (await this.sequelize.models.TrackTag.findByPk(
      tagId,
    )) as TrackTag;
    if (!tag || tag.TrackId !== trackId) {
      return null;
    }
    await this.saveTrackTagData(tagId, data, tag.data);
    return tag;
  }

  // Adds a tag to a track and checks if any alerts need to be sent. All trackTags
  // should be added this way
  async addTag(
    what: string,
    confidence: number,
    automatic: boolean,
    data: TrackTagData | "",
    userId = null,
    updateFiltered = true,
  ): Promise<TrackTag> {
    const modelName =
      data !== "" && typeof data === "object" && "name" in data
        ? data.name
        : null;
    const used = userId !== null || modelName === AI_MASTER;
    const tag = (await this.createTrackTag({
      what,
      confidence,
      automatic,
      model: modelName,
      UserId: userId,
      used,
    })) as TrackTag;
    if (modelName) {
      // Save the additional Track metadata to object storage
      await this.saveTrackTagData(tag.id, data as TrackTagData);
    }

    if (updateFiltered) {
      await this.updateIsFiltered();
    }
    return tag;
  }
  // Return a specific track tag for the track.
  async getTrackTag(trackTagId: TrackTagId) {
    const trackTag = await this.sequelize.models.TrackTag.findByPk(trackTagId);
    if (!trackTag) {
      return null;
    }

    // Ensure track tag belongs to this track.
    if ((trackTag as TrackTag).TrackId !== this.id) {
      return null;
    }

    return trackTag as TrackTag;
  }

  async updateIsFiltered() {
    const trackId = this.id;
    const models = this.sequelize.models;
    return this.sequelize.transaction(async (transaction: Transaction) => {
      const track = await models.Track.findByPk(trackId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const tags = (await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: null,
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
      })) as TrackTag[];
      await track.update({ filtered: isFiltered(tags) }, { transaction });
    });
  }

  // Archive Track for soft-delete
  async archive() {
    const trackId = this.id;
    const models = this.sequelize.models;
    return this.sequelize.transaction(async (transaction: Transaction) => {
      const track = await models.Track.findByPk(trackId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const tags = (await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: null,
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
      })) as TrackTag[];
      await Promise.all([
        track.update({ archivedAt: new Date() }, { transaction }),
        ...tags.map((tag) =>
          tag.update({ archivedAt: new Date() }, { transaction }),
        ),
      ]);
    });
  }

  // Retrieve Track from Archive
  async unarchive() {
    const trackId = this.id;
    const models = this.sequelize.models;
    return this.sequelize.transaction(async (transaction: Transaction) => {
      const track = await models.Track.findByPk(trackId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      const tags = (await models.TrackTag.findAll({
        where: {
          TrackId: trackId,
          archivedAt: {
            [Sequelize.Op.ne]: null,
          },
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
      })) as TrackTag[];
      await Promise.all([
        track.update({ archivedAt: null }, { transaction }),
        ...tags.map((tag) => tag.update({ archivedAt: null }, { transaction })),
      ]);
    });
  }

  // Archives tags for reprocessing
  async archiveTags() {
    await this.sequelize.models.TrackTag.update(
      {
        archivedAt: Date.now(),
      },
      {
        where: {
          TrackId: this.id,
          automatic: true,
        },
      },
    );
    await this.updateIsFiltered();
  }

  static addAssociations() {
    const models = this.sequelize.models;
    this.belongsTo(models.Recording);
    this.belongsTo(models.DetailSnapshot, {
      as: "Algorithm",
      foreignKey: "AlgorithmId",
    });
    this.hasMany(models.TrackTag);
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,

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
  };
  Track.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Tracks",
    name: {
      singular: "Track",
      plural: "Tracks",
    },
  });
  return Track;
};
//
// export interface Track extends Sequelize.Model, ModelCommon<Track> {
//   id: TrackId;
//   RecordingId: RecordingId;
//   AlgorithmId: number | null;
//   automatic: boolean;
//   startSeconds: number;
//   endSeconds: number;
//   minFreqHz: number | null;
//   maxFreqHz: number | null;
//   data: TrackTagData;
//   filtered: boolean;
//   // NOTE: Implicitly created by sequelize associations.
//   getRecording: () => Promise<Recording>;
//   archiveTags: () => Promise<void>;
//   unarchive: () => Promise<void>;
//   updateIsFiltered: () => Promise<void>;
//   archive: () => Promise<void>;
//   // Track Tags
//   TrackTags?: TrackTag[];
//   getTrackTag: (trackTagId: TrackTagId) => Promise<TrackTag>;
//   addTag: (
//     what: string,
//     confidence: number,
//     automatic: boolean,
//     data: TrackTagData | "",
//     userId?: number,
//     updateFiltered?: boolean,
//   ) => Promise<TrackTag>;
//   getTrackTags: (options: FindOptions) => Promise<TrackTag[]>;
//   replaceTag: (tag: TrackTag) => Promise<TrackTag | void>;
// }
// export type TrackStatic = ModelStaticCommon<Track>;
//
// export default function (
//   sequelize: Sequelize.Sequelize,
//   DataTypes,
// ): TrackStatic {
//   const Track = sequelize.define("Track", {
//     archivedAt: DataTypes.DATE,
//     startSeconds: {
//       type: Sequelize.FLOAT,
//       allowNull: false,
//       defaultValue: 0,
//     },
//     endSeconds: {
//       type: Sequelize.FLOAT,
//       allowNull: false,
//       defaultValue: 0,
//     },
//     minFreqHz: {
//       type: Sequelize.FLOAT,
//       allowNull: true,
//       defaultValue: null,
//     },
//     maxFreqHz: {
//       type: Sequelize.FLOAT,
//       allowNull: true,
//       defaultValue: null,
//     },
//     filtered: DataTypes.BOOLEAN,
//   }) as unknown as TrackStatic;
//
//   //---------------
//   // CLASS
//   //---------------
//   Track.addAssociations = function (models) {
//     models.Track.belongsTo(models.Recording);
//     models.Track.belongsTo(models.DetailSnapshot, {
//       as: "Algorithm",
//       foreignKey: "AlgorithmId",
//     });
//     models.Track.hasMany(models.TrackTag);
//   };
//
//   const models = sequelize.models as unknown as ModelsDictionary;
//
//   Track.apiSettableFields = Object.freeze(["algorithm", "archivedAt"]);
//
//   Track.userGetAttributes = Object.freeze(
//     Track.apiSettableFields.concat(["id"]),
//   );
//   //
//   // //add or replace a tag, such that this track only has 1 animal tag by this user
//   // //and no duplicate tags
//   // Track.prototype.replaceTag = async function (
//   //   tag: TrackTag,
//   //   userData?: TrackTagData,
//   // ): Promise<TrackTag | void> {
//   //   const trackId = this.id;
//   //   const trackTag = await sequelize.transaction(async function (t) {
//   //     const trackTags = (await models.TrackTag.findAll({
//   //       where: {
//   //         UserId: tag.UserId,
//   //         automatic: tag.automatic,
//   //         TrackId: trackId,
//   //       },
//   //       transaction: t,
//   //     })) as TrackTag[];
//   //     const existingTag = trackTags.find(
//   //       (uTag: TrackTag) => uTag.what === tag.what,
//   //     );
//   //     if (existingTag) {
//   //       return;
//   //     } else if (trackTags.length > 0 && !tag.isAdditionalTag()) {
//   //       const existingAnimalTags = trackTags.filter(
//   //         (uTag) => !uTag.isAdditionalTag(),
//   //       );
//   //       await Promise.all(
//   //         existingAnimalTags.map(async (tag: TrackTag) =>
//   //           tag.destroy({ transaction: t }),
//   //         ),
//   //       );
//   //     }
//   //     return await tag.save({ transaction: t });
//   //   });
//   //   if (userData) {
//   //     await saveTrackTagData(models, trackTag.id, userData);
//   //   }
//   //   await this.updateIsFiltered();
//   //   return trackTag;
//   // };
//   //
//   // // Update tag data
//   // Track.prototype.updateTag = async function (
//   //   tagId: TrackTagId,
//   //   data: TrackTagData,
//   // ): Promise<TrackTag | void> {
//   //   const trackId = this.id;
//   //   const tag = (await models.TrackTag.findByPk(tagId)) as TrackTag;
//   //   if (!tag || tag.TrackId !== trackId) {
//   //     return null;
//   //   }
//   //   await saveTrackTagData(models, tagId, data, tag.data);
//   //   return tag;
//   // };
//   //
//   // // Adds a tag to a track and checks if any alerts need to be sent. All trackTags
//   // // should be added this way
//   // Track.prototype.addTag = async function (
//   //   what: string,
//   //   confidence: number,
//   //   automatic: boolean,
//   //   data: TrackTagData | "",
//   //   userId = null,
//   //   updateFiltered = true,
//   // ): Promise<TrackTag> {
//   //   const modelName =
//   //     data !== "" && typeof data === "object" && "name" in data
//   //       ? data.name
//   //       : null;
//   //   const used = userId !== null || modelName === AI_MASTER;
//   //   const tag = (await this.createTrackTag({
//   //     what,
//   //     confidence,
//   //     automatic,
//   //     model: modelName,
//   //     UserId: userId,
//   //     used,
//   //   })) as TrackTag;
//   //   if (modelName) {
//   //     // Save the additional Track metadata to object storage
//   //     await saveTrackTagData(models, tag.id, data as TrackTagData);
//   //   }
//   //
//   //   if (updateFiltered) {
//   //     await this.updateIsFiltered();
//   //   }
//   //   return tag;
//   // };
//   // // Return a specific track tag for the track.
//   // Track.prototype.getTrackTag = async function (trackTagId: TrackTagId) {
//   //   const trackTag = await models.TrackTag.findByPk(trackTagId);
//   //   if (!trackTag) {
//   //     return null;
//   //   }
//   //
//   //   // Ensure track tag belongs to this track.
//   //   if ((trackTag as TrackTag).TrackId !== this.id) {
//   //     return null;
//   //   }
//   //
//   //   return trackTag as TrackTag;
//   // };
//   //
//   // Track.prototype.updateIsFiltered = async function () {
//   //   const trackId = this.id;
//   //   return sequelize.transaction(async function (t: Transaction) {
//   //     const track = await models.Track.findByPk(trackId, {
//   //       lock: t.LOCK.UPDATE,
//   //       transaction: t,
//   //     });
//   //     const tags = (await models.TrackTag.findAll({
//   //       where: {
//   //         TrackId: trackId,
//   //         archivedAt: null,
//   //       },
//   //       lock: t.LOCK.UPDATE,
//   //       transaction: t,
//   //     })) as TrackTag[];
//   //     await track.update({ filtered: isFiltered(tags) }, { transaction: t });
//   //   });
//   // };
//   //
//   // // Archive Track for soft-delete
//   // Track.prototype.archive = async function () {
//   //   const trackId = this.id;
//   //   return sequelize.transaction(async (t: Transaction) => {
//   //     const track = await models.Track.findByPk(trackId, {
//   //       lock: t.LOCK.UPDATE,
//   //       transaction: t,
//   //     });
//   //     const tags = await models.TrackTag.findAll({
//   //       where: {
//   //         TrackId: trackId,
//   //         archivedAt: null,
//   //       },
//   //       lock: t.LOCK.UPDATE,
//   //       transaction: t,
//   //     });
//   //     await Promise.all([
//   //       track.update({ archivedAt: Date.now() }, { transaction: t }),
//   //       ...tags.map((tag) =>
//   //         tag.update({ archivedAt: Date.now() }, { transaction: t }),
//   //       ),
//   //     ]);
//   //   });
//   // };
//   //
//   // // Retrieve Track from Archive
//   // Track.prototype.unarchive = async function () {
//   //   const trackId = this.id;
//   //   return sequelize.transaction(async (t: Transaction) => {
//   //     const track = await models.Track.findByPk(trackId, {
//   //       lock: t.LOCK.UPDATE,
//   //       transaction: t,
//   //     });
//   //     const tags = await models.TrackTag.findAll({
//   //       where: {
//   //         TrackId: trackId,
//   //         archivedAt: {
//   //           [Sequelize.Op.ne]: null,
//   //         },
//   //       },
//   //       lock: t.LOCK.UPDATE,
//   //       transaction: t,
//   //     });
//   //     await Promise.all([
//   //       track.update({ archivedAt: null }, { transaction: t }),
//   //       ...tags.map((tag) =>
//   //         tag.update({ archivedAt: null }, { transaction: t }),
//   //       ),
//   //     ]);
//   //   });
//   // };
//   //
//   // // Archives tags for reprocessing
//   // Track.prototype.archiveTags = async function () {
//   //   await models.TrackTag.update(
//   //     {
//   //       archivedAt: Date.now(),
//   //     },
//   //     {
//   //       where: {
//   //         TrackId: this.id,
//   //         automatic: true,
//   //       },
//   //     },
//   //   );
//   //   await this.updateIsFiltered();
//   // };
// }

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
          !TrackTag.additionalTags.includes(tag.what) &&
          !TrackTag.filteredTags.includes(tag.what),
      )
    ) {
      return false;
    }

    //any user filtered tag means filtered
    if (userTags.some((tag) => TrackTag.filteredTags.includes(tag.what))) {
      return true;
    }
  }
  // if ai master tag is filtered this track is filtered
  const masterTag = tags.find(
    (tag) => tag.automatic && tag.model === AI_MASTER,
  );
  if (masterTag) {
    return TrackTag.filteredTags.some(
      (filteredTag) => filteredTag === masterTag.what,
    );
  }
  return true;
};
