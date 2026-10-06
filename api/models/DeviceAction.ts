import { ModelStaticCommon } from "@models/index.js";
import type {
  DeviceId,
  RecordingId,
  IsoFormattedDateString,
  UserId,
} from "@typedefs/api/common.js";
import { Device } from "./Device.js";
import { DeviceActionStatus } from "@typedefs/api/consts.js";
import Sequelize, {
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  HasOne,
  NonAttribute,
  Op,
} from "sequelize";
import { Recording } from "@models/Recording.js";
import { UUID } from "node:crypto";
import { ActionStateTransition } from "@typedefs/api/device.js";
import logging from "@log";
import { User } from "@models/User.js";
import { Group } from "@models/Group.js";
import { sendTrapActionRequestEmail } from "@/emails/transactionalEmails.js";
import { Station } from "@models/Station.js";
import tzLookup from "tz-lookup-oss";

export class DeviceAction extends ModelStaticCommon<DeviceAction> {
  declare id: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare history: ActionStateTransition[];
  // Maybe here we store data about when each state transitioned to the next, and who actioned the item?
  declare status: DeviceActionStatus;
  declare DeviceId: ForeignKey<DeviceId>;
  declare RecordingId: CreationOptional<ForeignKey<RecordingId>>;
  declare Device: NonAttribute<Device>;
  declare Recording: NonAttribute<Recording>;

  declare static associations: {
    Device: BelongsTo<Device>;
    Recording: HasOne<Recording>;
  };

  static addAssociations() {
    this.belongsTo(Device, {
      foreignKey: "DeviceId",
      targetKey: "id",
      foreignKeyConstraint: true,
    });
    this.hasOne(Recording, {
      foreignKey: "id",
      foreignKeyConstraint: false,
    });
  }

  static async matchRecordingToPendingAction(
    deviceId: DeviceId,
    partialRecording: Recording,
    atTime: Date = new Date(),
  ) {
    const pendingActions = await DeviceAction.findAll({
      where: {
        DeviceId: deviceId,
        status: DeviceActionStatus.pending,
      },
    });
    if (pendingActions.length) {
      const recordingStart = new Date(partialRecording.recordingDateTime);
      const durationMs = partialRecording.duration * 1000;
      const recordingEnd = new Date(recordingStart.getTime() + durationMs);
      for (const action of pendingActions) {
        const initialState = action.history[0];
        if (initialState) {
          // Find any pending action whose trigger time is inside the recordingDateTime + duration span
          const triggerTime = new Date(initialState.dateTime);
          const groupId = partialRecording.GroupId;
          if (triggerTime >= recordingStart && triggerTime <= recordingEnd) {
            const recording = await Recording.findByPk(partialRecording.id, {
              include: [
                {
                  model: Device,
                  attributes: ["deviceName", "location"],
                },
                {
                  model: Station,
                  attributes: ["name"],
                },
                {
                  model: Group,
                  attributes: ["groupName"],
                },
              ],
              attributes: [
                "id",
                "recordingDateTime",
                "DeviceId",
                "GroupId",
                "StationId",
              ],
            });

            let deviceTimezone = null;
            if (recording.Device.location) {
              deviceTimezone = tzLookup(
                recording.Device.location.lat,
                recording.Device.location.lng,
              );
            }

            // Send the notification email to opted-in users
            const usersToNotify = await User.findAll({
              where: {
                emailConfirmed: true,
              },
              include: [
                {
                  model: Group,
                  attributes: [],
                  where: { id: groupId },
                  required: true,
                  through: {
                    where: {
                      [Op.or]: [
                        {
                          "settings.notificationPreferences.trapActions": {
                            [Op.eq]: true,
                          },
                        },
                        { settings: null },
                      ],
                    },
                  },
                },
              ],
            });
            const emails = [];
            for (const user of usersToNotify) {
              emails.push(
                sendTrapActionRequestEmail(
                  recording.Group.groupName,
                  recording.Device.deviceName,
                  recording.Station.name,
                  recording.StationId,
                  recording.recordingDateTime,
                  initialState.classification,
                  action.id,
                  user.email,
                  deviceTimezone,
                ),
              );
            }
            await Promise.all(emails);
            await action.update({
              history: [
                ...action.history,
                {
                  dateTime: atTime.toISOString(),
                  state: DeviceActionStatus.requested,
                },
              ],
              status: DeviceActionStatus.requested,
              RecordingId: recording.id,
            });
            break;
          }
        } else {
          logging.warning(
            `Failed to find initial action state for action ${action.id}`,
          );
        }
      }
    }
  }

  static async getUserActionRequestForDevice(deviceId: DeviceId, uuid: UUID) {
    return DeviceAction.findOne({
      where: {
        id: uuid,
        DeviceId: deviceId,
      },
    });
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.UUIDV4,
      allowNull: false,
      primaryKey: true,
    },
    history: { type: DataTypes.JSONB, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(DeviceActionStatus)),
      defaultValue: DeviceActionStatus.pending,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"),
    },
    RecordingId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    DeviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  };

  DeviceAction.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "DeviceActions",
    name: {
      singular: "DeviceAction",
      plural: "DeviceActions",
    },
  });

  return DeviceAction;
};
