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
import { ModelCommon, ModelStaticCommon } from "./index";
import { User } from "./User";
import { Recording } from "./Recording";
import { Track } from "./Track";
import { TrackTag } from "./TrackTag";
import { alertBody, EmailImageAttachment } from "@/scripts/emailUtil";
import { DeviceId, StationId, UserId } from "@typedefs/api/common";
import logger from "../logging";
import { sendEmail } from "@/emails/sendEmail";

export type AlertId = number;
const Op = Sequelize.Op;

export interface AlertCondition {
  tag: string;
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
  conditions: AlertCondition[];
  frequencySeconds: number;
  sendAlert: (
    recording: Recording,
    track: Track,
    tag: TrackTag,
    alertOn: "station" | "device",
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
  getActiveAlerts: (
    tag: TrackTag,
    deviceId?: DeviceId,
    stationId?: StationId
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
  };

  Alert.queryUserDevice = async (
    deviceId: DeviceId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin: boolean = false
  ): Promise<Alert[]> => {
    return Alert.query({ DeviceId: deviceId }, userId, trackTag, asAdmin);
  };

  Alert.queryUserStation = async (
    stationId: StationId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin: boolean = false
  ): Promise<Alert[]> => {
    return Alert.query({ StationId: stationId }, userId, trackTag, asAdmin);
  };

  Alert.query = async function (
    where: any,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin: boolean = false
  ): Promise<Alert[]> {
    if (userId === null && !asAdmin) {
      logger.warning(
        "Alert.query called without userId specified, as non-admin"
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
          attributes: ["id", "userName", "email"],
        },
      ];
    }
    const alerts: Alert[] = await models.Alert.findAll(whereClause);
    if (trackTag) {
      // check that any of the alert conditions are met
      return alerts.filter(({ conditions }) =>
        conditions.some(({ tag }) => trackTag.path.split(".").includes(tag))
      );
    }
    return alerts;
  };

  // get all alerts for this device that satisfy the what condition, or are further up the hierarchy and have
  // not been triggered already (are active)
  Alert.getActiveAlerts = async function (
    tag: TrackTag,
    deviceId?: DeviceId,
    stationId?: StationId
  ): Promise<Alert[]> {
    const deviceOrStation = [];
    if (deviceId) {
      deviceOrStation.push({ DeviceId: deviceId });
    }
    if (stationId) {
      deviceOrStation.push({ StationId: stationId });
    }
    return Alert.query(
      {
        [Op.or]: deviceOrStation,
        lastAlert: {
          [Op.or]: {
            [Op.eq]: null,
            [Op.lt]: Sequelize.literal(
              `now() - "frequencySeconds" * INTERVAL '1 second'`
            ),
          },
        },
      },
      null,
      tag,
      true
    );
  };

  Alert.prototype.sendAlert = async function (
    recording: Recording,
    track: Track,
    tag: TrackTag,
    alertOn: "station" | "device",
    thumbnail?: EmailImageAttachment
  ) {
    const subject = `${this.name}  - ${tag.what} Detected`;

    const [html, text] = alertBody(
      recording,
      tag,
      !!thumbnail,
      alertOn === "device" ? recording.Device?.deviceName : undefined,
      alertOn === "station" ? recording.Station?.name : undefined
    );
    const alertTime = new Date().toISOString();
    const result = await sendEmail(
      html,
      text,
      this.User.email,
      subject,
      thumbnail && [thumbnail]
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
