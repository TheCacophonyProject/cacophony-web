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
import Sequelize, {
  BelongsTo,
  DataTypes,
  ForeignKey,
  NonAttribute,
} from "sequelize";
import { CreationOptional } from "sequelize";
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
import { Device } from "@models/Device.js";
import { Station } from "@models/Station.js";
import { Group } from "@models/Group.js";
import { User } from "@models/User.js";
import { ModelStaticCommon } from "@models/index.js";
import { Event } from "./Event.js";
import { DetailSnapshot } from "@models/DetailSnapshot.js";
//
export type AlertId = number;
const Op = Sequelize.Op;

export interface AlertCondition {
  tag: string;
  automatic: boolean;
}

export class Alert extends ModelStaticCommon<Alert> {
  declare id: CreationOptional<AlertId>;
  declare name: string;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare conditions: AlertCondition[];
  declare frequencySeconds: number;
  declare lastAlert: CreationOptional<Date>;

  declare User: NonAttribute<User>;
  declare Device?: NonAttribute<Device>;
  declare Group?: NonAttribute<Group>;
  declare Station?: NonAttribute<Station>;

  declare UserId: ForeignKey<UserId>;
  declare GroupId?: ForeignKey<GroupId>;
  declare StationId?: ForeignKey<StationId>;
  declare DeviceId?: ForeignKey<DeviceId>;

  static addAssociations() {
    const models = this.sequelize.models;
    // NOTE: Calling this just needs to be deferred until all the models are inited.
    Alert.belongsTo(models.User);
    Alert.belongsTo(models.Device);
    Alert.belongsTo(models.Station);
    Alert.belongsTo(models.Group);
  }

  async sendAlert(
    recording: Recording,
    track: Track,
    tag: TrackTag,
    alertOn: "station" | "device" | "project",
    thumbnail?: EmailImageAttachment,
  ): Promise<void> {
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
    const alertTime = new Date();
    const result = await sendEmail(
      html,
      text,
      this.User.email,
      subject,
      thumbnail && [thumbnail],
    );
    const detail = await DetailSnapshot.getOrCreateMatching("alert", {
      alertId: this.id,
      recId: recording.id,
      trackId: track.id,
      success: result,
    });
    await Event.create({
      DeviceId: recording.Device.id,
      EventDetailId: detail.id,
      dateTime: alertTime,
    });
    await this.update({ lastAlert: alertTime });
  }

  static async query(
    where: Sequelize.WhereOptions<Alert>,
    userId: UserId | null,
    tagPath: string | null = null,
    asAdmin = false,
  ): Promise<Alert[]> {
    if (userId === null && !asAdmin) {
      logger.warning(
        "Alert.query called without userId specified, as non-admin",
      );
      return [];
    }
    const whereClause: Sequelize.FindOptions = {
      where,
      attributes: ["id", "name", "frequencySeconds", "conditions", "lastAlert"],
    };
    if (userId) {
      whereClause.where["UserId"] = userId;
    }
    if (asAdmin) {
      // Only return user details if we're an admin.
      whereClause.include = [
        {
          model: this.sequelize.models.User,
          attributes: ["id", "userName", "email", "emailConfirmed", "settings"],
        },
      ];
    }
    const alerts: Alert[] = await Alert.findAll<Alert>(whereClause);
    if (tagPath) {
      // check that any of the alert conditions are met
      return alerts.filter(({ conditions }) =>
        conditions.some(({ tag }) =>
          tagPath.split(".").includes(tag.replace(/-/g, "").replace(/ /g, "_")),
        ),
      );
    }
    return alerts;
  }

  static async queryUserDevice(
    deviceId: DeviceId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin = false,
  ): Promise<Alert[]> {
    return Alert.query(
      { DeviceId: deviceId },
      userId,
      (trackTag && trackTag.path) || null,
      asAdmin,
    );
  }

  static async queryUserStation(
    stationId: StationId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin = false,
  ): Promise<Alert[]> {
    return Alert.query(
      { StationId: stationId },
      userId,
      (trackTag && trackTag.path) || null,
      asAdmin,
    );
  }

  static async queryUserProject(
    projectId: GroupId,
    userId: UserId | null,
    trackTag: TrackTag | null = null,
    asAdmin = false,
  ): Promise<Alert[]> {
    return Alert.query(
      { GroupId: projectId },
      userId,
      (trackTag && trackTag.path) || null,
      asAdmin,
    );
  }

  // get all alerts for this device that satisfy the `tagPath` condition,
  // or are further up the hierarchy and have not been triggered already (are active)
  static async getActiveAlerts(
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
  }

  declare static associations: {
    User: BelongsTo<User>;
    Device: BelongsTo<Device>;
    Station: BelongsTo<Station>;
    Group: BelongsTo<Group>;
  };
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

    name: DataTypes.STRING,
    frequencySeconds: DataTypes.INTEGER,
    lastAlert: DataTypes.DATE,
    conditions: DataTypes.JSONB,
  };

  Alert.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "Alerts",
    name: {
      singular: "Alert",
      plural: "Alerts",
    },
  });
  return Alert;
};
