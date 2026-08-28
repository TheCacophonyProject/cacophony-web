import { ModelStaticCommon } from "@models/index.js";
import type { DeviceId } from "@typedefs/api/common.js";
import { Device } from "./Device.js";
import { JsonDocument } from "@typedefs/api/event.js";
import { DeviceActionStatus } from "@typedefs/api/consts.js";
import Sequelize, {
  BelongsTo,
  CreationOptional,
  DataTypes,
  ForeignKey,
  HasMany,
  NonAttribute,
} from "sequelize";
import { Recording } from "@models/Recording.js";

export class DeviceAction extends ModelStaticCommon<DeviceAction> {
  declare id: CreationOptional<string>;
  declare type: string;
  declare action: JsonDocument;
  declare status: DeviceActionStatus;
  declare recordings: JsonDocument | null;
  declare thumbnail: Uint8Array | null;
  declare DeviceId: ForeignKey<DeviceId>;
  declare Device: NonAttribute<Device>;
  declare Recordings: NonAttribute<Recording[]>;

  declare static associations: {
    Device: BelongsTo<Device>;
    Recordings: HasMany<Recording>;
  };

  static addAssociations() {
    this.belongsTo(Device);
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: { type: DataTypes.STRING, allowNull: false },
    action: { type: DataTypes.JSONB, allowNull: false },
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
    thumbnail: {
      type: DataTypes.BLOB,
      allowNull: true,
      defaultValue: Sequelize.literal("NULL"),
    },
    recordings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: Sequelize.literal("NULL"),
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
