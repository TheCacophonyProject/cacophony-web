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
import { ActionStatus, DeviceActionDecision } from "@typedefs/api/device.js";
import { successResponse } from "@api/V1/responseUtil.js";
import log from "@log";
import logging from "@log";
import { User } from "@models/User.js";
import { Group } from "@models/Group.js";

export interface ActionStateTransition {
  state: ActionStatus;
  dateTime: IsoFormattedDateString;
  userId?: UserId;
  action?: DeviceActionDecision;
  classification?: string;
  confidence?: number;
}

export class DeviceAction extends ModelStaticCommon<DeviceAction> {
  declare id: CreationOptional<string>;
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

  static async matchRecordingToPendingAction(recording: Recording) {
    const pendingActions = await DeviceAction.findAll({
      where: {
        DeviceId: recording.DeviceId,
        status: DeviceActionStatus.pending,
      },
      include: [
        {
          model: Device,
        },
      ],
    });
    if (pendingActions.length) {
      const recordingStart = new Date(recording.recordingDateTime);
      const durationMs = recording.duration * 1000;
      const recordingEnd = new Date(recordingStart.getTime() + durationMs);
      for (const action of pendingActions) {
        const initialState = action.history[0];
        if (initialState) {
          // Find any pending action whose trigger time is inside the recordingDateTime + duration span
          const triggerTime = new Date(initialState.dateTime);
          const groupId = action.Device.GroupId;
          if (triggerTime >= recordingStart && triggerTime <= recordingEnd) {
            // Send the email!
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
            logging.error(
              `Send notification email to ${usersToNotify.map(({ id }) => id)}`,
            );
            // TODO: Actually send notification email.
            await action.update({
              history: [
                ...action.history,
                {
                  dateTime: new Date().toISOString(),
                  state: DeviceActionStatus.requested,
                },
              ],
              status: DeviceActionStatus.requested,
              RecordingId: recording.id,
            });
            break;
          }
        } else {
          // Something went very wrong
          logging.warning(
            `Failed to find initial action state for action ${action.id}`,
          );
        }
      }
    }
  }

  static async getPendingUserActionRequests(
    deviceId: DeviceId,
    fromDateTime: Date,
  ) {
    return DeviceAction.findAll({
      where: {
        DeviceId: deviceId,
        status: { [Op.eq]: DeviceActionStatus.pending },
        // TODO: fromDateTime
      },
    });
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
