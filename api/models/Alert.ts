/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2020  The Cacophony Project

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
import type { Recording } from "./Recording.js";
import type { Track } from "./Track.js";
import type { TrackTag } from "./TrackTag.js";
import type { EmailImageAttachment } from "@/scripts/emailUtil.js";
import type {
  DeviceId,
  GroupId,
  StationId,
  UserId,
} from "@typedefs/api/common.js";
import logger from "../logging.js";
import { alertBody, sendEmail } from "@/emails/sendEmail.js";
import type { ApiUserSettings } from "@typedefs/api/user.js";
//
export type AlertId = number;
const Op = Sequelize.Op;

export interface AlertCondition {
  tag: string;
  automatic: boolean;
}
export function isAlertCondition(condition: any) {
  return condition.hasOwnProperty("tag");
}

export interface Alert extends Sequelize.Model, ModelCommon<Alert> {
  id: AlertId;
  name: string;
  UserId: UserId;
  StationId: StationId | null;
  DeviceId: DeviceId | null;
  GroupId: GroupId | null;
  conditions: AlertCondition[];
  frequencySeconds: number;
  lastAlert: Date;
  User?: {
    id: UserId;
    userName: string;
    email: string;
    emailConfirmed: boolean;
    settings: ApiUserSettings | null;
  };
  sendAlert: (
    recording: Recording,
    track: Track,
    tag: TrackTag,
    alertOn: "station" | "device" | "project",
    thumbnail?: EmailImageAttachment
  ) => Promise<null>;
}

export interface AlertStatic extends ModelStaticCommon<Alert> {
  query: (
    where: any,
    userId: UserId | null,
    trackTag?: TrackTag | null,
    admin?: boolean
  ) => Promise<Alert[]>;
  queryUserDevice: (
    deviceId: DeviceId,
    userId: UserId | null,
    trackTag?: TrackTag | null,
    asAdmin?: boolean
  ) => Promise<Alert[]>;
  queryUserStation: (
    stationId: StationId,
    userId: UserId | null,
    trackTag?: TrackTag | null,
    asAdmin?: boolean
  ) => Promise<Alert[]>;
  queryUserProject: (
    projectId: GroupId,
    userId: UserId | null,
    trackTag?: TrackTag | null,
    asAdmin?: boolean
  ) => Promise<Alert[]>;
  getActiveAlerts: (
    tagPath: string,
    deviceId?: DeviceId,
    stationId?: StationId,
    groupId?: GroupId
  ) => Promise<Alert[]>;
}

export default function (sequelize, DataTypes): AlertStatic {
  const name = "Alert";

  const attributes = {
    name: {
      type: DataTypes.STRING,
    },
    frequencySeconds: DataTypes.INTEGER,
    lastAlert: DataTypes.DATE,
    conditions: DataTypes.JSONB,
  };

  const Alert = sequelize.define(name, attributes);

  Alert.apiSettableFields = [];

  //---------------
  // Class methods
  //---------------
  const models = sequelize.models;

  Alert.addAssociations = function (models) {
    models.Alert.belongsTo(models.User);
    models.Alert.belongsTo(models.Device);
    models.Alert.belongsTo(models.Station);
    models.Alert.belongsTo(models.Group);
  };

  Alert.queryUserDevice = async (
    deviceId: DeviceId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin: boolean = false,
  ): Promise<Alert[]> => {
    return Alert.query(
      { DeviceId: deviceId },
      userId,
      (trackTag && trackTag.path) || null,
      asAdmin,
    );
  };

  Alert.queryUserStation = async (
    stationId: StationId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin: boolean = false,
  ): Promise<Alert[]> => {
    return Alert.query(
      { StationId: stationId },
      userId,
      (trackTag && trackTag.path) || null,
      asAdmin,
    );
  };

  Alert.queryUserProject = async (
    projectId: GroupId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin: boolean = false,
  ): Promise<Alert[]> => {
    return Alert.query(
      { GroupId: projectId },
      userId,
      (trackTag && trackTag.path) || null,
      asAdmin,
    );
  };

  Alert.query = async function (
    where: any,
    userId: UserId | null,
    tagPath: string | null = null,
    asAdmin: boolean = false,
  ): Promise<Alert[]> {
    if (userId === null && !asAdmin) {
      logger.warning(
        "Alert.query called without userId specified, as non-admin",
      );
      return [];
    }
    const whereClause = {
      where,
      attributes: ["id", "name", "frequencySeconds", "conditions", "lastAlert"],
    };
    if (userId) {
      whereClause.where.UserId = userId;
    }
    if (asAdmin) {
      // Only return user details if we're an admin.
      (whereClause as any).include = [
        {
          model: models.User,
          attributes: ["id", "userName", "email", "emailConfirmed", "settings"],
        },
      ];
    }
    const alerts: Alert[] = await models.Alert.findAll(whereClause);
    if (tagPath) {
      // check that any of the alert conditions are met
      return alerts.filter(({ conditions }) =>
        conditions.some(({ tag }) =>
          tagPath.split(".").includes(tag.replace(/-/g, "").replace(/ /g, "_")),
        ),
      );
    }
    return alerts;
  };

  // get all alerts for this device that satisfy the what condition, or are further up the hierarchy and have
  // not been triggered already (are active)
  Alert.getActiveAlerts = async function (
    tagPath: string,
    deviceId?: DeviceId,
    stationId?: StationId,
    groupId?: GroupId,
  ): Promise<Alert[]> {
    const deviceOrLocationOrProject = [];
    if (deviceId) {
      deviceOrLocationOrProject.push({ DeviceId: deviceId });
    }
    if (stationId) {
      deviceOrLocationOrProject.push({ StationId: stationId });
    }
    if (groupId) {
      deviceOrLocationOrProject.push({ GroupId: groupId });
    }
    return Alert.query(
      {
        [Op.or]: deviceOrLocationOrProject,
        lastAlert: {
          [Op.or]: {
            [Op.eq]: null,
            [Op.lt]: Sequelize.literal(
              `now() - "frequencySeconds" * INTERVAL '1 second'`,
            ),
          },
        },
      },
      null,
      tagPath,
      true,
    );
  };

  Alert.prototype.sendAlert = async function (
    recording: Recording,
    track: Track,
    tag: TrackTag,
    alertOn: "station" | "device" | "project",
    thumbnail?: EmailImageAttachment,
  ) {
    const subject = `${this.name}  - ${tag.what} Detected`;
    const [html, text] = alertBody(
      recording,
      tag,
      this,
      !!thumbnail,
      alertOn === "device" ? recording.Device?.deviceName : undefined,
      ["project", "station"].includes(alertOn)
        ? recording.Station?.name
        : undefined,
    );
    const alertTime = new Date().toISOString();
    const result = await sendEmail(
      html,
      text,
      this.User.email,
      subject,
      thumbnail && [thumbnail],
    );
    const detail = await models.DetailSnapshot.getOrCreateMatching("alert", {
      alertId: this.id,
      recId: recording.id,
      trackId: track.id,
      success: result,
    });
    await models.Event.create({
      DeviceId: recording.Device.id,
      EventDetailId: detail.id,
      dateTime: alertTime,
    });
    await this.update({ lastAlert: alertTime });
  };
  return Alert;
}
