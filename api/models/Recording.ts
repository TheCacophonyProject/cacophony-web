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
import mime from "mime";
import moment from "moment-timezone";
import type { FindOptions, Includeable } from "sequelize";
import Sequelize from "sequelize";
import { v4 as uuidv4 } from "uuid";
import config from "../config.js";
import _ from "lodash";
import type { User } from "./User.js";
import type { ModelCommon, ModelStaticCommon } from "./index.js";
import type { Tag, TagStatic } from "./Tag.js";
import type { Device, DeviceStatic } from "./Device.js";
import type { Group } from "./Group.js";
import { saveTrackData, type Track } from "./Track.js";

import type { TrackTag } from "./TrackTag.js";
import type { Station } from "./Station.js";
import type {
  DeviceId,
  GroupId,
  LatLng,
  RecordingId,
  StationId,
  TrackId,
  UserId,
} from "@typedefs/api/common.js";
import {
  AcceptableTag,
  RecordingProcessingState,
  RecordingType,
  TagMode,
} from "@typedefs/api/consts.js";
import type { DeviceBatteryChargeState } from "@typedefs/api/device.js";
import type {
  ApiAudioRecordingMetadataResponse,
  ApiThermalRecordingMetadataResponse,
  CacophonyIndex,
} from "@typedefs/api/recording.js";
import labelPath from "../classifications/label_paths.json" assert { type: "json" };
import type { DetailSnapshotId } from "@models/DetailSnapshot.js";
import { locationField } from "@models/util/util.js";
import type { ApiTrackPosition } from "@typedefs/api/track.js";

// Mapping
export const mapPosition = (position: any): ApiTrackPosition => {
  if (Array.isArray(position)) {
    return {
      x: position[1][0],
      y: position[1][1],
      width: position[1][2] - position[1][0],
      height: position[1][3] - position[1][1],
      frameTime: position[0],
    };
  } else {
    return {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      order: position.frame_number ?? position.order,
      mass: position.mass,
      blank: position.blank,
    };
  }
};

type SqlString = string;

type AllTagModes = TagMode | AcceptableTag;
// local
const validTagModes = new Set([
  ...Object.values(TagMode),
  ...Object.values(AcceptableTag),
]);

export type RecordingQueryOptions = Partial<{
  where: SqlString | Sequelize.WhereOptions;
  tagMode: TagMode;
  tags: string[]; // AcceptableTag[]
  offset: number;
  limit: number;
  order: any;
  viewAsSuperUser: boolean;
  checkIsGroupAdmin: boolean;
  hideFiltered: boolean;
  exclusive: boolean;
  includeAttributes: boolean;
  attributes: string[];
  filterModel: string | false;
}>;

const MaxProcessingRetries = 1;
interface RecordingQueryBuilder {
  new (): RecordingQueryBuilder;
  findInclude: (modelType: ModelStaticCommon<any>) => Includeable[];
  init: (
    user: UserId,
    options: RecordingQueryOptions
  ) => RecordingQueryBuilderInstance;
  handleTagMode: (
    tagMode: TagMode,
    tagWhatsIn: string[],
    exclusive: boolean
  ) => SqlString;
  recordingTaggedWith: (
    tagModes: string[],
    sql: SqlString,
    exclusive: boolean
  ) => SqlString;
  trackTaggedWith: (
    tags: string[],
    sql: SqlString,
    exclusive: boolean
  ) => SqlString;
  notTagOfType: (
    tags: string[],
    sql: SqlString,
    exclusive: boolean
  ) => SqlString;
  tagOfType: (tags: string[], sql: SqlString, exclusive: boolean) => SqlString;
  selectByTag: (tags: string[], exclusive: boolean, tagPath?: string) => any;
}

interface RecordingQueryBuilderInstance {
  addAudioEvents: (
    before?: string,
    after?: string
  ) => RecordingQueryBuilderInstance;
  get: () => FindOptions;
  addColumn: (name: string) => RecordingQueryBuilderInstance;
  query: any;
}

export interface RecordingProcessingMetadata {
  // Only set during recording processing?
}

export interface Recording extends Sequelize.Model, ModelCommon<Recording> {
  // Recording columns.
  id: RecordingId;
  type: RecordingType;
  duration: number;
  recordingDateTime: Date;
  location?: LatLng;
  relativeToDawn: number;
  relativeToDusk: number;
  version: string;
  additionalMetadata:
    | ApiThermalRecordingMetadataResponse
    | ApiAudioRecordingMetadataResponse;
  cacophonyIndex: CacophonyIndex[];
  comment: string;
  public: boolean;
  uploader: "user" | "device";
  uploaderId: UserId | DeviceId;
  rawFileKey: string;
  rawMimeType: string;
  rawFileHash: string;
  fileKey: string;
  fileSize: number;
  rawFileSize: number;
  fileMimeType: string;
  processingStartTime: string;
  processingEndTime: string;
  processingMeta: RecordingProcessingMetadata;
  processing: boolean;
  processingState: RecordingProcessingState;
  passedFilter: boolean;
  jobKey: string;
  batteryLevel: number;
  batteryCharging: DeviceBatteryChargeState;
  airplaneModeOn: boolean;
  deletedAt: Date | null;
  deletedBy: UserId | null;
  redacted: boolean;

  DeviceId: DeviceId;
  GroupId: GroupId;
  StationId: StationId;
  currentStateStartTime: Date | null;
  processingFailedCount: number;
  // Recording columns end

  getFileBaseName: () => string;
  getRawFileName: () => string;
  getFileName: () => string;
  getRawFileExt: () => string;
  getFileExt: () => string;
  getDevice: () => Promise<Device>;
  getGroup: () => Promise<Group>;

  getActiveTracksTagsAndTagger: () => Promise<any>;
  retryFailed: () => Promise<Recording>;
  reprocess: () => Promise<Recording>;
  filterData: (options: any) => void;
  // NOTE: Implicitly created by sequelize associations (along with other
  //  potentially undocumented extension methods).
  getTrack: (id: TrackId) => Promise<Track | null>;
  getTracks: (options?: FindOptions) => Promise<Track[]>;
  // createTrack: ({
  //   data,
  //   start_s,
  //   end_s,
  //   AlgorithmId,
  //   filtered,
  //   archivedAt,
  // }: {
  //   data: any;
  //   start_s: number;
  //   end_s: number;
  //   AlgorithmId: DetailSnapshotId;
  //   filtered?: boolean;
  //   archivedAt?: Date;
  // }) => Promise<Track>;
  addTrack: ({
    data,
    startSeconds,
    endSeconds,
    minFreqHz,
    maxFreqHz,
    AlgorithmId,
    filtered,
    archivedAt,
  }: {
    data: any;
    startSeconds: number;
    endSeconds: number;
    minFreqHz: number | null;
    maxFreqHz: number | null;
    AlgorithmId: DetailSnapshotId;
    filtered?: boolean;
    archivedAt?: Date;
  }) => Promise<Track>;
  setStation: (station: Station) => Promise<void>;

  getNextState: () => RecordingProcessingState;
  isFailed: () => boolean;
  Station?: Station;
  Group?: Group;
  Tags?: Tag[];
  Tracks?: Track[];
  Device?: Device;
}

type CptvFile = "string";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type JwtToken<T> = string;
type Seconds = number;
type Rectangle = [number, number, number, number];
export interface LimitedTrack {
  TrackId: TrackId;
  data: {
    start_s: number;
    end_s: number;
    positions: [Seconds, Rectangle][];
    num_frames: number;
  };
  tags: string[];
  needsTagging: boolean;
}

interface TagLimitedRecording {
  RecordingId: RecordingId;
  DeviceId: DeviceId;
  tracks: LimitedTrack[];
  recordingJWT: JwtToken<CptvFile>;
  tagJWT: JwtToken<TrackTag>;
  fileSize: number;
}

export interface RecordingStatic extends ModelStaticCommon<Recording> {
  buildSafely: (fields: Record<string, any>) => Recording;
  isValidTagMode: (mode: TagMode) => boolean;
  processingAttributes: string[];
  processingStates: {
    [RecordingType.TrailCamImage]: string[];
    [RecordingType.InfraredVideo]: string[];
    [RecordingType.ThermalRaw]: string[];
    [RecordingType.Audio]: string[];
  };
  uploadedState: (type: RecordingType) => RecordingProcessingState;
  finishedState: (type: RecordingType) => RecordingProcessingState;

  getOneForProcessing: (
    type: RecordingType,
    state: RecordingProcessingState
  ) => Promise<Recording>;
  userGetAttributes: readonly string[];
  queryGetAttributes: readonly string[];
  queryBuilder: RecordingQueryBuilder;
  updateOne: (user: User, id: RecordingId, updates: any) => Promise<boolean>;
  makeFilterOptions: (user: User, options?: { latLongPrec?: number }) => any;
  getRecordingWithUntaggedTracks: (
    biasDeviceId?: DeviceId
  ) => Promise<TagLimitedRecording>;
}

const Op = Sequelize.Op;
export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): RecordingStatic {
  const name = "Recording";
  const maxQueryResults = 10000;
  const attributes = {
    // recording metadata.
    type: DataTypes.STRING,
    duration: DataTypes.FLOAT,
    recordingDateTime: DataTypes.DATE,
    location: locationField(),
    relativeToDawn: DataTypes.INTEGER,
    relativeToDusk: DataTypes.INTEGER,
    version: DataTypes.STRING,
    additionalMetadata: DataTypes.JSONB,
    cacophonyIndex: DataTypes.JSONB,
    comment: DataTypes.STRING,
    deletedAt: DataTypes.DATE,
    deletedBy: DataTypes.INTEGER,
    redacted: DataTypes.BOOLEAN,
    public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // Raw file data.
    rawFileKey: DataTypes.STRING,
    rawMimeType: DataTypes.STRING,
    rawFileHash: DataTypes.STRING,
    rawFileSize: DataTypes.INTEGER,

    // Processing fields. Fields set by and for the processing.
    fileKey: DataTypes.STRING,
    fileSize: DataTypes.INTEGER,
    fileMimeType: DataTypes.STRING,
    processingStartTime: DataTypes.DATE,
    processingEndTime: DataTypes.DATE,
    processing: DataTypes.BOOLEAN,
    processingMeta: DataTypes.JSONB,
    processingState: DataTypes.STRING,
    passedFilter: DataTypes.BOOLEAN,
    jobKey: DataTypes.STRING,

    // Battery relevant fields.
    batteryLevel: DataTypes.DOUBLE,
    batteryCharging: DataTypes.STRING,
    airplaneModeOn: DataTypes.BOOLEAN,
    processingFailedCount: DataTypes.INTEGER,
    currentStateStartTime: DataTypes.DATE,

    // Uploader info:
    uploader: DataTypes.ENUM("device", "user"),
    uploaderId: DataTypes.INTEGER,
  };

  const Recording = sequelize.define(
    name,
    attributes
  ) as unknown as RecordingStatic;

  //---------------
  // CLASS METHODS
  //---------------
  const models = sequelize.models;

  Recording.buildSafely = function (fields: Record<string, any>): Recording {
    return Recording.build(
      _.pick(fields, Recording.apiSettableFields)
    ) as Recording;
  };

  Recording.addAssociations = function (models) {
    models.Recording.belongsTo(models.Group);
    models.Recording.belongsTo(models.Device);
    models.Recording.belongsTo(models.Station);
    models.Recording.hasMany(models.Tag);
    models.Recording.hasMany(models.Track);
  };

  Recording.isValidTagMode = function (mode: TagMode) {
    return validTagModes.has(mode);
  };

  /**
   * Return a recording for processing under a transaction
   * and sets the processingStartTime and jobKey for recording
   * arguments given.
   */
  Recording.getOneForProcessing = async function (type, state) {
    let includeQ = [];
    const where = {
      type: type,
      deletedAt: { [Op.eq]: null },
      [Op.or]: [
        {
          processingState: state,
          processing: { [Op.or]: [null, false] },
        },
        {
          [Op.or]: [
            {
              currentStateStartTime: {
                [Op.lt]: Sequelize.literal("NOW() - INTERVAL '30 minutes'"),
              },
              processingState: state,
              processing: true,
              processingFailedCount: { [Op.lt]: MaxProcessingRetries },
            },

            {
              processingFailedCount: { [Op.lte]: MaxProcessingRetries },
              //retry a failed recording
              currentStateStartTime: {
                [Op.lt]: Sequelize.literal("NOW() - INTERVAL '12 hours'"),
              },
              processingState: `${state}.failed`,
            },
          ],
        },
      ],
    };
    if (state == RecordingProcessingState.Finished) {
      //check if any tracks have been made in the last day by users that haven't had AI run against it
      where[Op.and] = Sequelize.literal(
        `	 not exists( select 1 from "TrackTags" where "automatic" = true and "TrackId"= "Tracks"."id" limit 1)`
      );
      includeQ = [
        {
          model: models.Track,
          where: {
            archivedAt: null,
            createdAt: {
              [Op.gt]: Sequelize.literal("NOW() - INTERVAL '1 day'"),
            },
          },
          attributes: [],
        },
      ];
    }
    return sequelize
      .transaction(async (transaction) => {
        const recording = await Recording.findOne({
          subQuery: false,
          where: where,
          include: includeQ,
          attributes: [
            ...(models.Recording as RecordingStatic).processingAttributes,
            [
              Sequelize.literal(`exists(
          	select
          		1
          	from
          		"Alerts"
          	where
          		"StationId" = "Recording"."StationId" or
          		"DeviceId" = "Recording"."DeviceId"
          	limit 1)`),
              "hasAlert",
            ],
          ],
          order: [
            ["processing", "DESC NULLS FIRST"],
            ["processingFailedCount", "ASC NULLS FIRST"], //only do these after all others
            Sequelize.literal(`"hasAlert" DESC`),
            Sequelize.literal(
              `"Recording"."recordingDateTime" > now() - interval '1 day' DESC`
            ),
            ["uploader", "DESC NULLS LAST"],
            ["recordingDateTime", "asc"],
            ["id", "asc"], // Adding another order is a "fix" for a bug in postgresql causing the query to be slow
          ],
          // @ts-ignore
          skipLocked: true,
          lock: (transaction as any).LOCK.UPDATE,
          transaction,
        });
        if (!recording) {
          return recording;
        }
        const now = new Date();
        if (!recording.processingStartTime) {
          recording.processingStartTime = now.toISOString();
        }
        if (recording.isFailed()) {
          recording.processingState = recording.processingState.replace(
            ".failed",
            ""
          );
        }

        if (recording.processing) {
          recording.processingFailedCount += 1;
        }
        recording.currentStateStartTime = now.toISOString();
        recording.processingEndTime = null;
        recording.jobKey = uuidv4();
        recording.processing = true;
        await recording.save({
          transaction,
        });
        return recording;
      })
      .then((result) => result)
      .catch(() => {
        return null;
      });
  };

  Recording.makeFilterOptions = function (user: User, options: any) {
    if (!options) {
      options = {};
    }
    if (typeof options.latLongPrec !== "number") {
      options.latLongPrec = 100;
    }
    if (!user.hasGlobalWrite()) {
      options.latLongPrec = Math.max(options.latLongPrec, 100);
    }
    return options;
  };

  //------------------
  // INSTANCE METHODS
  //------------------
  Recording.prototype.isFailed = function (): boolean {
    return this.processingState.endsWith(".failed");
  };

  Recording.prototype.getNextState = function (): RecordingProcessingState {
    const jobs = Recording.processingStates[this.type];
    let nextState;
    if (this.processingState == RecordingProcessingState.Reprocess) {
      nextState = Recording.finishedState(this.type);
    } else if (this.processingState == RecordingProcessingState.ReTrack) {
      nextState = RecordingProcessingState.Analyse;
    } else if (
      this.processingState == RecordingProcessingState.TrackAndAnalyse
    ) {
      nextState = RecordingProcessingState.Finished;
    } else {
      const job_index = jobs.indexOf(this.processingState);
      if (job_index == -1) {
        throw new Error(`Recording state unknown - ${this.processState}`);
      } else if (job_index < jobs.length - 1) {
        nextState = jobs[job_index + 1];
      } else {
        nextState = this.processingState;
      }
    }
    return nextState;
  };

  Recording.prototype.setStation = async function (station: { id: number }) {
    this.StationId = station.id;
    return this.save();
  };

  Recording.prototype.getFileBaseName = function (): string {
    return moment(new Date(this.recordingDateTime))
      .tz(config.timeZone)
      .format("YYYYMMDD-HHmmss");
  };

  Recording.prototype.getRawFileName = function () {
    return this.getFileBaseName() + this.getRawFileExt();
  };

  Recording.prototype.getFileName = function () {
    return this.getFileBaseName() + this.getFileExt();
  };

  Recording.prototype.getRawFileExt = function () {
    if (this.rawMimeType == "application/x-cptv") {
      return ".cptv";
    }
    const ext = mime.getExtension(this.rawMimeType);
    if (ext) {
      return "." + ext;
    }
    switch (this.type) {
      case "thermalRaw":
        return ".cptv";
      case "audio":
        return ".mpga";
      default:
        return "";
    }
  };

  /* eslint-disable indent */
  Recording.prototype.getActiveTracksTagsAndTagger =
    async function (): Promise<any> {
      return await this.getTracks({
        where: {
          archivedAt: null,
        },
        include: [
          {
            model: models.TrackTag,
            where: {
              archivedAt: null,
            },
            include: [
              {
                model: models.User,
                attributes: ["userName"],
              },
            ],
            required: false,
          },
        ],
      });
    };

  Recording.prototype.getFileExt = function () {
    if (this.fileMimeType == "application/x-cptv") {
      return ".cptv";
    }
    const ext = mime.getExtension(this.fileMimeType);
    if (ext) {
      return "." + ext;
    }
    return "";
  };

  Recording.prototype.filterData = function (options: { latLongPrec: any }) {
    if (this.location) {
      this.location.coordinates = reduceLatLonPrecision(
        this.location,
        options.latLongPrec
      );
    }
  };

  function reduceLatLonPrecision(latLng: LatLng, precision: number): LatLng {
    const resolution = (precision * 360) / 40000000;
    const half_resolution = resolution / 2;
    const reducePrecision = (val) => {
      val = val - (val % resolution);
      if (val > 0) {
        val += half_resolution;
      } else {
        val -= half_resolution;
      }
      return val;
    };
    return {
      lat: reducePrecision(latLng.lat),
      lng: reducePrecision(latLng.lng),
    };
  }

  // retry processing this recording
  Recording.prototype.retryFailed = async function () {
    if (!this.processingState.endsWith(".failed")) {
      return false;
    }
    await this.update({
      processingState: this.processingState.replace(".failed", ""),
    });
    return true;
  };

  // reprocess a recording and set all active tracks to archived
  Recording.prototype.reprocess = async function () {
    const tags = await this.getTags();
    if (tags.length > 0) {
      const meta = this.additionalMetadata || {};
      // FIXME What happens if we reprocess more than once?
      //  :We lose initial archived tags.
      meta["oldTags"] = tags;
      this.additionalMetadata = meta;
      await this.save();
    }

    await models.Tag.destroy({
      where: {
        RecordingId: this.id,
      },
    });
    const tracks = await this.getTracks();
    for (const track of tracks) {
      await track.archiveTags();
    }

    await this.update({
      processingStartTime: null,
      processingEndTime: null,
      processing: false,
      processingFailedCount: 0,
      processingState: RecordingProcessingState.Reprocess,
    });
  };

  // Return a specific track for the recording.
  Recording.prototype.getTrack = async function (
    trackId: TrackId
  ): Promise<Track | null> {
    const track = await models.Track.findByPk(trackId);
    if (!track) {
      return null;
    }

    // Ensure track belongs to this recording.
    if ((track as Track).RecordingId !== this.id) {
      return null;
    }
    return track as Track;
  };

  Recording.prototype.addTrack = async function ({
    data,
    startSeconds,
    endSeconds,
    minFreqHz,
    maxFreqHz,
    AlgorithmId,
    filtered,
    archivedAt,
  }: {
    data: any;
    startSeconds: number;
    endSeconds: number;
    minFreqHz: number | null;
    maxFreqHz: number | null;
    AlgorithmId: DetailSnapshotId;
    filtered?: boolean;
    archivedAt?: Date;
  }): Promise<Track> {
    const track = await this.createTrack({
      startSeconds,
      endSeconds,
      minFreqHz,
      maxFreqHz,
      AlgorithmId,
      filtered,
      archivedAt,
    });
    await saveTrackData(track.id, data);
    return track;
  };

  Recording.queryBuilder = function () {} as unknown as RecordingQueryBuilder;
  Recording.queryBuilder.prototype.init = function (
    userId: UserId,
    options: RecordingQueryOptions
  ) {
    const {
      tagMode,
      tags,
      viewAsSuperUser,
      exclusive,
      hideFiltered,
      offset = 0,
      order = [
        // Sort by recordingDatetime but handle the case of the
        // timestamp being missing and fallback to sorting by id.
        [Sequelize.col("recordingDateTime"), "DESC"],
        ["id", "DESC"],
      ],
      includeAttributes = true,
    } = options;
    const where =
      typeof options.where === "string"
        ? JSON.parse(options.where)
        : options.where ?? {};
    const limit = options.limit
      ? Math.min(options.limit, maxQueryResults)
      : 300;

    // Don't include deleted recordings
    where.deletedAt = where.deletedAt || { [Op.eq]: null };
    delete where._tagged; // remove legacy tag mode selector (if included)
    const constraints = [
      where,
      Sequelize.literal(
        Recording.queryBuilder.handleTagMode(tagMode, tags, exclusive)
      ),
    ];
    const noArchived = { archivedAt: null };
    const onlyMasterModel = options.filterModel
      ? {
          used: true,
        }
      : {};
    if (hideFiltered) {
      const filteredSQL = `(
		select
			"RecordingId"
		from
			"Tracks" as "Tracks"
		where
			(("Tracks"."archivedAt" is null
				and "Tracks"."filtered" = false)
			and "Tracks"."RecordingId" = "Recording"."id")
		limit 1 ) is not null`;
      constraints.push(Sequelize.literal(filteredSQL));
    }

    const requireGroupMembership = viewAsSuperUser
      ? []
      : [
          {
            model: models.User,
            attributes: [],
            required: true,
            where: { id: userId },
            ...(options.checkIsGroupAdmin && {
              through: { where: { admin: true } },
            }),
            // If not viewing as super user, make sure the user is a member of the recording group.
            // This may need to change if we start caring about showing everyone all public recordings.
            // However, since we're still going to be showing things as "Group centric"  We'd probably just
            // make the group public - or use a totally different query.
          },
        ];

    this.query = {
      where: {
        [Op.and]: constraints,
      },
      order,
      include: [
        {
          model: models.Group,
          attributes: ["groupName"],
          required: !viewAsSuperUser,
          include: requireGroupMembership,
        },
        {
          model: models.Station,
          attributes: ["name", "location"],
        },
        {
          model: models.Tag,
          attributes: (models.Tag as TagStatic).userGetAttributes,
          include: [
            {
              association: "tagger",
              attributes: ["userName", "id"],
            },
          ],
        },
        {
          model: models.Track,
          where: noArchived,
          required: false,
          separate: true,
          attributes: ["id", "filtered", "startSeconds", "endSeconds"],
          include: [
            {
              model: models.TrackTag,
              where: { ...noArchived, ...onlyMasterModel },
              attributes: [
                "id",
                "what",
                "path",
                "automatic",
                "TrackId",
                "confidence",
                "UserId",
                "model",
              ],
              include: [
                {
                  model: models.User,
                  attributes: ["userName", "id"],
                },
              ],
              required: false,
            },
          ],
        },
        {
          model: models.Device,
          where: {},
          attributes: ["deviceName", "id"],
        },
      ],
      limit,
      offset,
      attributes: Recording.queryGetAttributes,
    };

    if (!includeAttributes) {
      const recursiveDelete = (obj: any) => {
        for (const key in obj) {
          if (key === "attributes") {
            delete obj[key];
          } else if (typeof obj[key] === "object") {
            recursiveDelete(obj[key]);
          }
        }
      };
      recursiveDelete(this.query);
    }
    return this;
  };

  Recording.queryBuilder.handleTagMode = (
    tagMode: AllTagModes,
    tagWhatsIn: string[],
    exclusive: boolean
  ): SqlString => {
    const tagWhats = tagWhatsIn && tagWhatsIn.length > 0 ? tagWhatsIn : null;
    if (!tagMode) {
      tagMode = tagWhats ? TagMode.Tagged : TagMode.Any;
    }

    // FIXME Seems like we're doing validation here that should be done at the API layer
    const humanSQL = 'NOT "Tags".automatic';
    const AISQL = '"Tags".automatic';
    if (
      (models.Tag as TagStatic).acceptableTags.has(tagMode as AcceptableTag)
    ) {
      let sqlQuery = `((${Recording.queryBuilder.recordingTaggedWith(
        [tagMode],
        null,
        exclusive
      )} limit 1) IS NOT NULL)`;
      if (tagWhats) {
        sqlQuery = `${sqlQuery} AND (${Recording.queryBuilder.trackTaggedWith(
          tagWhats,
          null,
          exclusive
        )}) IS NOT NULL`;
      }
      return sqlQuery;
    }

    switch (tagMode) {
      case TagMode.Any:
        return "";
      case TagMode.UnTagged:
        return Recording.queryBuilder.notTagOfType(tagWhats, null, exclusive);
      case TagMode.Tagged:
        return Recording.queryBuilder.tagOfType(tagWhats, null, exclusive);
      case TagMode.HumanTagged:
        return Recording.queryBuilder.tagOfType(tagWhats, humanSQL, exclusive);
      case TagMode.AutomaticallyTagged:
        return Recording.queryBuilder.tagOfType(tagWhats, AISQL, exclusive);
      case TagMode.NoHuman:
        return Recording.queryBuilder.notTagOfType(
          tagWhats,
          humanSQL,
          exclusive
        );
      case TagMode.AutomaticOnly:
        return `${Recording.queryBuilder.tagOfType(
          tagWhats,
          AISQL,
          exclusive
        )} AND ${Recording.queryBuilder.notTagOfType(
          tagWhats,
          humanSQL,
          exclusive
        )}`;
      case TagMode.HumanOnly:
        return `${Recording.queryBuilder.tagOfType(
          tagWhats,
          humanSQL,
          exclusive
        )} AND ${Recording.queryBuilder.notTagOfType(
          tagWhats,
          AISQL,
          exclusive
        )}`;
      case TagMode.AutomaticHuman:
        return `${Recording.queryBuilder.tagOfType(
          tagWhats,
          humanSQL,
          exclusive
        )} AND ${Recording.queryBuilder.tagOfType(tagWhats, AISQL, exclusive)}`;
      default: {
        throw `invalid tag mode: ${tagMode}`;
      }
    }
  };

  Recording.queryBuilder.tagOfType = (
    tagWhats: string[],
    tagTypeSql: SqlString,
    exclusive: boolean
  ): SqlString => {
    let query = `((${Recording.queryBuilder.trackTaggedWith(
      tagWhats,
      tagTypeSql,
      exclusive
    )}  ${tagTypeSql || !tagWhats ? "LIMIT 1) IS NOT NULL" : ")"}`;
    if (
      !tagWhats ||
      (!tagWhats && tagTypeSql) ||
      tagWhats.find((tag) =>
        (models.Tag as TagStatic).acceptableTags.has(tag as AcceptableTag)
      )
    ) {
      query += ` OR (${Recording.queryBuilder.recordingTaggedWith(
        tagWhats,
        tagTypeSql,
        exclusive
      )} LIMIT 1) IS NOT NULL`;
    }
    query += ")";
    return query;
  };

  Recording.queryBuilder.notTagOfType = (
    tagWhats: string[],
    tagTypeSql: SqlString,
    exclusive: boolean
  ): SqlString => {
    let query = `((${Recording.queryBuilder.trackTaggedWith(
      tagWhats,
      tagTypeSql,
      exclusive
    )} LIMIT 1) ${tagTypeSql || !tagWhats ? "IS NULL" : ""}`;
    if (
      !tagWhats ||
      (!tagWhats && tagTypeSql) ||
      tagWhats.find((tag) =>
        (models.Tag as TagStatic).acceptableTags.has(tag as AcceptableTag)
      )
    ) {
      query += ` AND (${Recording.queryBuilder.recordingTaggedWith(
        tagWhats,
        tagTypeSql,
        exclusive
      )} LIMIT 1)  ${tagTypeSql || !tagWhats ? "IS NULL" : ""}`;
    }
    query += ")";
    return query;
  };

  Recording.queryBuilder.recordingTaggedWith = (
    tags: (TagMode | AcceptableTag)[],
    tagTypeSql: SqlString,
    exclusive: boolean
  ) => {
    let sql =
      'SELECT 1 FROM "Tags" WHERE "Tags"."RecordingId" = "Recording".id';
    if (tags) {
      sql += ` AND (${Recording.queryBuilder.selectByTag(
        tags,
        exclusive,
        "detail"
      )})`;
    }
    if (tagTypeSql) {
      sql += ` AND (${tagTypeSql})`;
    }
    return sql;
  };

  Recording.queryBuilder.trackTaggedWith = (
    tags?: (TagMode | AcceptableTag)[],
    tagTypeSql?: SqlString,
    exclusive?: boolean
  ) => {
    let sql = `SELECT "Recording"."id" FROM "Tracks" INNER JOIN "TrackTags" AS "Tags" ON "Tracks"."id" = "Tags"."TrackId" WHERE "Tags".
    "archivedAt" IS NULL AND "Tracks"."RecordingId" = "Recording".id AND "Tracks"."archivedAt" IS NULL`;
    const tagsSql = tags
      ? ` AND (${Recording.queryBuilder.selectByTag(tags, exclusive)})`
      : "";
    if (!tagTypeSql) {
      // When we're not filtering by tag type, we want override automatic tags with human tags
      if (tags) {
        const notAutomatic = `${sql} AND (NOT "Tags".automatic)`;
        const humanPreferred = `CASE WHEN (${notAutomatic} LIMIT 1) IS NOT NULL THEN (${notAutomatic} ${tagsSql} LIMIT 1) IS NOT NULL ELSE (${sql} ${tagsSql} LIMIT 1) IS NOT NULL END`;
        return humanPreferred;
      } else {
        return sql;
      }
    } else {
      sql += tagsSql;
      sql += ` AND (${tagTypeSql})`;
      return sql;
    }
  };

  Recording.queryBuilder.selectByTag = (
    tags: string[],
    exclusive: boolean,
    tagPath = "what"
  ) => {
    if (!tags || tags.length === 0) {
      return null;
    }

    const parts = [];
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (tag === "interesting") {
        parts.push(
          `("Tags"."what"!='bird' AND "Tags"."what"!='false positive')`
        );
      } else {
        const path = labelPath[tag.toLowerCase()];
        if (path) {
          parts.push(`"Tags".path ~ '${path}${exclusive ? "" : ".*"}'`);
        } else {
          // TODO: this catches tags that may of not been added to classifications but should be added
          parts.push(`"Tags"."${tagPath}" = '${tag}'`);
        }
      }
    }

    return parts.join(" OR ");
  };

  Recording.queryBuilder.prototype.get = function () {
    return this.query;
  };

  Recording.queryBuilder.prototype.addColumn = function (name: string) {
    this.query.attributes.push(name);
    return this;
  };

  // Include details of recent audio bait events in the query output.
  Recording.queryBuilder.prototype.addAudioEvents = function (
    after?: string,
    before?: string
  ) {
    if (!after) {
      after = '"Recording"."recordingDateTime" - interval \'30 minutes\'';
    }
    if (!before) {
      before = '"Recording"."recordingDateTime"';
    }
    const deviceInclude = this.findInclude(models.Device as DeviceStatic);

    if (!deviceInclude.include) {
      deviceInclude.include = {};
    }
    deviceInclude.include = [
      {
        model: models.Event,
        required: false,
        where: {
          dateTime: {
            [Op.between]: [Sequelize.literal(after), Sequelize.literal(before)],
          },
        },
        include: [
          {
            model: models.DetailSnapshot,
            as: "EventDetail",
            required: false,
            where: {
              type: "audioBait",
            },
            attributes: ["details"],
          },
        ],
      },
    ];

    return this;
  };

  Recording.queryBuilder.prototype.findInclude = function (
    modelType: ModelStaticCommon<any>
  ): Includeable[] {
    for (const inc of this.query.include) {
      if (inc.model === modelType) {
        return inc;
      }
    }
    throw `could not find query include for ${modelType}`;
  };

  // Attributes returned in recording query results.
  Recording.queryGetAttributes = [
    "id",
    "type",
    "recordingDateTime",
    "rawMimeType",
    "fileMimeType",
    "processingState",
    "duration",
    "location",
    "batteryLevel",
    "DeviceId",
    "GroupId",
    "StationId",
    "rawFileKey",
    "cacophonyIndex",
    "processing",
    "comment",
    "additionalMetadata",
    "redacted",
  ];

  // Attributes returned when looking up a single recording.
  Recording.userGetAttributes = [
    "id",
    "rawMimeType",
    "fileMimeType",
    "processingState",
    "duration",
    "recordingDateTime",
    "relativeToDawn",
    "relativeToDusk",
    "location",
    "version",
    "batteryLevel",
    "batteryCharging",
    "airplaneModeOn",
    "type",
    "additionalMetadata",
    "GroupId",
    "StationId",
    "fileKey",
    "comment",
    "processing",
  ];

  // Fields that can be provided when uploading new recordings.
  Recording.apiSettableFields = [
    "type",
    "duration",
    "recordingDateTime",
    "relativeToDawn",
    "relativeToDusk",
    "location",
    "version",
    "batteryCharging",
    "batteryLevel",
    "airplaneModeOn",
    "additionalMetadata",
    "cacophonyIndex",
    "processingMeta", // FIXME - Check this
    "comment",
    "StationId",
  ];

  Recording.processingStates = {
    "trailcam-image": [
      RecordingProcessingState.Analyse,
      RecordingProcessingState.Finished,
    ],
    irRaw: [
      RecordingProcessingState.ReTrack,
      RecordingProcessingState.Tracking,
      RecordingProcessingState.AnalyseThermal,
      RecordingProcessingState.Finished,
    ],
    thermalRaw: [
      RecordingProcessingState.ReTrack,
      RecordingProcessingState.TrackAndAnalyse,
      RecordingProcessingState.Tracking,
      RecordingProcessingState.AnalyseThermal,
      RecordingProcessingState.Finished,
    ],
    audio: [
      RecordingProcessingState.Analyse,
      RecordingProcessingState.Finished,
    ],
  };

  Recording.uploadedState = function (type: RecordingType) {
    if (type == RecordingType.Audio || type == RecordingType.TrailCamImage) {
      return RecordingProcessingState.Analyse;
    } else {
      return RecordingProcessingState.TrackAndAnalyse;
    }
  };
  Recording.finishedState = function (type: RecordingType) {
    return RecordingProcessingState.Finished;
  };
  Recording.processingAttributes = [
    "id",
    "type",
    "jobKey",
    "rawFileKey",
    "rawMimeType",
    "fileKey",
    "fileMimeType",
    "processingState",
    "processingMeta",
    "GroupId",
    "DeviceId",
    "StationId",
    "recordingDateTime",
    "duration",
    "location",
    "processing",
    "processingFailedCount",
    "\"additionalMetadata\"->>'metadataSource'",
  ];

  return Recording;
}
