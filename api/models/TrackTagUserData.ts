import Sequelize, { CreationOptional, DataTypes, ForeignKey } from "sequelize";
import { ModelStaticCommon } from "@models/index.js";
import type { TrackTagId } from "@models/TrackTag.js";

export class TrackTagUserData extends ModelStaticCommon<TrackTagUserData> {
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare gender?: CreationOptional<"male" | "female">;
  declare maturity?: CreationOptional<"juvenile" | "adult">;
  declare TrackTagId: ForeignKey<TrackTagId>;

  static addAssociations() {
    const models = this.sequelize.models;
    models.TrackTagUserData.belongsTo(models.TrackTag);
    models.TrackTag.hasOne(models.TrackTagUserData);
  }
}
export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    TrackTagId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    gender: {
      type: DataTypes.ENUM("male", "female"),
      allowNull: true,
      defaultValue: null,
    },
    maturity: {
      type: DataTypes.ENUM("juvenile", "adult"),
      allowNull: true,
      defaultValue: null,
    },
    createdAt: {
      type: DataTypes.DATE,
    },
    updatedAt: {
      type: DataTypes.DATE,
    },
  };

  TrackTagUserData.init(attributes, {
    tableName: "TrackTagUserData",
    sequelize: sequelizeInstance,
  });
  return TrackTagUserData;
};
