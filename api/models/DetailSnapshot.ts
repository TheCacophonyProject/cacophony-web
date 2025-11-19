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
import Sequelize, { CreationOptional, DataTypes } from "sequelize";
import { ModelStaticCommon } from "./index.js";

const Op = Sequelize.Op;
export type DetailSnapshotId = number;

export class DetailSnapshot extends ModelStaticCommon<DetailSnapshot> {
  declare id: CreationOptional<DetailSnapshotId>;
  declare type: string;
  declare details: object & {
    unitName?: string;
    logs?: string[];
    nodegroup?: string;
    fileId?: number;
    volume?: number; // audiobait
  };
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static getOrCreateMatching = async (
    searchType: string,
    searchDetails: object | Sequelize.WhereOptions,
  ): Promise<DetailSnapshot> => {
    if (!searchDetails) {
      searchDetails = {
        [Op.eq]: null,
      };
    }
    const existing = await DetailSnapshot.findOne({
      where: {
        type: searchType,
        details: {
          [Op.eq]: searchDetails, // Need to specify the equal operator as it's a JSONB
        },
      },
    });
    if (existing) {
      return existing;
    }
    return DetailSnapshot.create({
      type: searchType,
      details: searchDetails,
    });
  };
  static apiSettableFields = [];
  static addAssociations() {
    const models = this.sequelize.models;
    this.hasMany(models.Event, {
      foreignKey: "EventDetailId",
    });
    this.hasMany(models.Track, { foreignKey: "AlgorithmId" });
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

    type: DataTypes.STRING,
    details: DataTypes.JSONB,
  };

  DetailSnapshot.init(attributes, {
    sequelize: sequelizeInstance,
    tableName: "DetailSnapshots",
    name: {
      singular: "DetailSnapshot",
      plural: "DetailSnapshots",
    },
  });
  return DetailSnapshot;
};
