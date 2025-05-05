import type Sequelize from "sequelize";
import type { ModelCommon, ModelStaticCommon } from "@models/index.js";
import type { TrackTagId } from "@models/TrackTag.js";

export interface TrackTagUserData
  extends Sequelize.Model,
    ModelCommon<TrackTagUserData> {
  TrackTagId: TrackTagId;
  gender?: "male" | "female" | null;
  maturity?: "juvenile" | "adult" | null;
}

export interface TrackTagUserDataStatic
  extends ModelStaticCommon<TrackTagUserData> {}
export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes,
): TrackTagUserDataStatic {
  const TrackTagUserData = sequelize.define("TrackTagUserData", {
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
  }) as unknown as TrackTagUserDataStatic;

  //---------------
  // CLASS METHODS
  //---------------
  TrackTagUserData.addAssociations = function (models) {
    models.TrackTagUserData.belongsTo(models.TrackTag);
    models.TrackTag.hasOne(models.TrackTagUserData);
  };

  return TrackTagUserData;
}
