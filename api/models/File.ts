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
import { CreationOptional, DataTypes, ForeignKey } from "sequelize";
import sequelize from "sequelize";
import { ModelStaticCommon } from "./index.js";
import type Sequelize from "sequelize";
import type { FileId, UserId } from "@typedefs/api/common.js";
import { AudiobaitDetails } from "@typedefs/api/file.js";
import { User } from "@models/User.js";
import { JsonDocument } from "@typedefs/api/event.js";

const Op = sequelize.Op;

export class File extends ModelStaticCommon<File> {
  declare id: CreationOptional<FileId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare UserId: ForeignKey<UserId>;
  declare details: JsonDocument | AudiobaitDetails;
  declare type: string;
  declare fileKey: string;
  declare fileSize: number;
  static apiSettableFields = Object.freeze(["type", "details"]);

  static buildSafely(fields: { type: string; details: JsonDocument }) {
    return this.build({ type: fields.type, details: fields.details || {} });
  }

  static addAssociations() {
    this.belongsTo(User);
  }

  /**
   * Return one or more files for a user matching the query
   * arguments given.
   */
  static async query(
    where: Sequelize.WhereOptions,
    offset: number,
    limit: number,
    order: Sequelize.Order | null = null,
  ) {
    if (order === null) {
      order = [["id", "DESC"]];
    }

    const q = {
      where: where,
      order: order,
      attributes: { exclude: ["updatedAt", "fileKey"] },
      limit: limit,
      offset: offset,
    };
    return this.findAndCountAll(q);
  }

  static async getMultiple(ids: FileId[]) {
    return this.findAll({
      where: {
        id: {
          [Op.in]: ids,
        },
      },
    });
  }
}
export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    type: DataTypes.STRING,
    fileKey: DataTypes.STRING,
    details: DataTypes.JSONB,
    fileSize: DataTypes.INTEGER,
  };

  File.init(attributes, {
    tableName: "Files",
    sequelize: sequelizeInstance,
    name: {
      singular: "File",
      plural: "Files",
    },
  });
  return File;
};
