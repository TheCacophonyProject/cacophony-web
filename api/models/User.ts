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

import bcrypt from "bcrypt";
import {
  BelongsToManyGetAssociationsMixin,
  CreationOptional,
  DataTypes,
  ModelAttributes,
  NonAttribute,
  Op,
} from "sequelize";
import Sequelize from "sequelize";
import { ModelStaticCommon } from "./index.js";
import type { DeviceId, GroupId, UserId } from "@typedefs/api/common.js";
import { UserGlobalPermission } from "@typedefs/api/consts.js";
import { sendResetEmail } from "@/scripts/emailUtil.js";
import type { ApiUserSettings } from "@typedefs/api/user.js";
import { DecodedJWTToken } from "@api/auth.js";
import { Group } from "@models/Group.js";
import { GroupUsers } from "@models/GroupUsers.js";
import { Device } from "@models/Device.js";

export class User extends ModelStaticCommon<User> {
  declare id: CreationOptional<UserId>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare password: string;

  declare userName: string;
  declare email: string;
  declare emailConfirmed: CreationOptional<boolean>;
  // FIXME: This is CreationOptional because the field in the DB is nullable, but it shouldn't be.
  // Even when we fix that it should be CreationOptional because there is a default value
  declare globalPermission: CreationOptional<UserGlobalPermission>;
  declare endUserAgreement: CreationOptional<number>;
  declare settings: CreationOptional<ApiUserSettings>;
  declare lastActiveAt: CreationOptional<Date>;
  declare transferredBytes: CreationOptional<number>;
  declare transferredItems: CreationOptional<number>;

  declare getGroups: BelongsToManyGetAssociationsMixin<Group>;

  declare GroupUsers?: NonAttribute<GroupUsers>;

  // static associations = {
  //   GroupUsers?: HasOne<GroupUsers>;
  // };

  static publicFields = Object.freeze(["id", "userName"]);
  static apiSettableFields = Object.freeze([
    "email",
    "endUserAgreement",
    "settings",
  ]);
  //---------------
  // CLASS METHODS
  //---------------
  static addAssociations() {
    const models = this.sequelize.models;
    this.belongsToMany(models.Group, {
      through: models.GroupUsers,
    });
    this.hasMany(models.Alert);
  }

  static async getAll(isSuperAdmin: boolean) {
    return this.findAll({
      where: {},
      attributes: [...this.publicFields, ...(isSuperAdmin ? ["email"] : [])],
    });
  }

  static async getFromName(name: string): Promise<User | null> {
    return this.findOne({ where: { userName: name } });
  }

  static async getFromEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email } });
  }

  static async freeEmail(email: string): Promise<boolean> {
    return (await this.getFromEmail(email.toLowerCase())) === null;
  }

  async resetPassword(): Promise<boolean> {
    return sendResetEmail(this, this.password);
  }

  // Returns the groups that are associated with this user (via
  // GroupUsers).
  async getGroupsIds(): Promise<GroupId[]> {
    const groups = await this.getGroups();
    return groups.map((g) => g.id);
  }

  async comparePassword(password: string): Promise<boolean> {
    const thisPassword = this.password;
    return new Promise((resolve, reject) => {
      bcrypt.compare(password, thisPassword, (err: Error, isMatch: boolean) => {
        if (err) {
          reject(err);
        } else {
          resolve(isMatch);
        }
      });
    });
  }

  getJwtDataValues(): DecodedJWTToken {
    const jwtPayload: DecodedJWTToken = {
      id: this.id,
      _type: "user",
    };
    if (!this.emailConfirmed) {
      jwtPayload.activated = false;
    }
    return jwtPayload;
  }

  hasGlobalWrite() {
    return UserGlobalPermission.Write === this.globalPermission;
  }

  hasGlobalRead() {
    return [UserGlobalPermission.Read, UserGlobalPermission.Write].includes(
      this.globalPermission,
    );
  }

  async getDeviceIds(): Promise<DeviceId[]> {
    const devices = await Device.findAll({
      where: {},
      include: [
        {
          model: Group,
          required: true,
          attributes: [],
          include: [
            {
              model: User,
              attributes: [],
              through: {
                attributes: [],
              },
              required: true,
              where: { id: this.id },
            },
          ],
        },
      ],
      attributes: ["id"],
    });
    if (devices !== null) {
      return devices.map((d) => d.id);
    }
    return [];
  }
}

export const init = (sequelizeInstance: Sequelize.Sequelize) => {
  const attributes: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,

    userName: {
      type: DataTypes.STRING,
    },
    email: {
      type: DataTypes.STRING,
      validate: { isEmail: true },
      unique: true,
    },
    emailConfirmed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    lastActiveAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    globalPermission: {
      type: DataTypes.ENUM,
      values: Object.values(UserGlobalPermission) as string[],
      defaultValue: UserGlobalPermission.Off,
    },
    endUserAgreement: {
      type: DataTypes.INTEGER,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    transferredItems: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    transferredBytes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  };
  User.init(attributes, {
    tableName: "Users",
    name: {
      singular: "User",
      plural: "Users",
    },
    sequelize: sequelizeInstance,
    hooks: {
      beforeValidate: beforeValidate,
      beforeCreate: beforeModify,
      beforeUpdate: beforeModify,
      beforeUpsert: beforeModify,
    },
  });
  return User;
};

// export interface User extends Sequelize.Model, ModelCommon<User> {
//   getWhereDeviceVisible: () => Promise<null | {
//     DeviceId: { [Op.in]: [DeviceId] };
//   }>;
//   comparePassword: (password: string) => Promise<boolean>;
//   resetPassword: () => Promise<boolean>;
//
//   getDeviceIds: () => Promise<DeviceId[]>;
//   getGroupsIds: () => Promise<GroupId[]>;
//   getGroups: (options?: {
//     where: unknown;
//     attributes: string[];
//   }) => Promise<Group[]>;
//
//   hasGlobalWrite: () => boolean;
//   hasGlobalRead: () => boolean;
//
//   admin: boolean;
//   id: UserId;
//   userName: string;
//   email: string;
//   emailConfirmed: boolean;
//   lastActiveAt: Date;
//   groups: Group[];
//   globalPermission: UserGlobalPermission;
//   endUserAgreement: EndUserAgreementVersion;
//   settings?: ApiUserSettings;
//   transferredBytes: number;
//   transferredItems: number;
// }

// export interface UserStatic extends ModelStaticCommon<User> {
//   new (values?: object, options?: BuildOptions): User;
//   getAll: (isSuperAdmin?: boolean) => Promise<User[]>;
//   getFromName: (name: string) => Promise<User | null>;
//   getFromEmail: (email: string) => Promise<User | null>;
//   freeEmail: (email: string) => Promise<boolean>;
//   getFromId: (id: number) => Promise<User | null>;
// }

// export default function (
//   sequelize: Sequelize.Sequelize,
//   DataTypes,
// ): UserStatic {
//   const name = "User";
//   const attributes: ModelAttributes = {
//     userName: {
//       type: DataTypes.STRING,
//     },
//     email: {
//       type: DataTypes.STRING,
//       validate: { isEmail: true },
//       unique: true,
//     },
//     emailConfirmed: {
//       type: DataTypes.BOOLEAN,
//       allowNull: false,
//       defaultValue: false,
//     },
//     lastActiveAt: {
//       type: DataTypes.DATE,
//       allowNull: true,
//     },
//     password: {
//       type: DataTypes.STRING,
//       allowNull: false,
//     },
//     globalPermission: {
//       type: DataTypes.ENUM,
//       values: Object.values(UserGlobalPermission) as string[],
//       defaultValue: UserGlobalPermission.Off,
//     },
//     endUserAgreement: {
//       type: DataTypes.INTEGER,
//     },
//     settings: {
//       type: DataTypes.JSONB,
//       allowNull: true,
//     },
//     transferredItems: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       defaultValue: 0,
//     },
//     transferredBytes: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       defaultValue: 0,
//     },
//   };
//
//   const options: ModelOptions = {
//     hooks: {
//       beforeValidate: beforeValidate,
//       beforeCreate: beforeModify,
//       beforeUpdate: beforeModify,
//       beforeUpsert: beforeModify,
//     },
//   };
//
//   // Define table
//   const User = sequelize.define(
//     name,
//     attributes,
//     options,
//   ) as unknown as UserStatic;
//
//   User.publicFields = Object.freeze(["id", "userName"]);
//
//   User.apiSettableFields = Object.freeze([
//     "email",
//     "endUserAgreement",
//     "settings",
//   ]);
//   //---------------
//   // CLASS METHODS
//   //---------------
//   const models = sequelize.models;
//
//   User.addAssociations = function (models) {
//     models.User.belongsToMany(models.Group, {
//       through: models.GroupUsers,
//     });
//     models.User.hasMany(models.Alert);
//   };
//
//   User.getAll = async function (isSuperAdmin: boolean) {
//     return this.findAll({
//       where: {},
//       attributes: [...this.publicFields, ...(isSuperAdmin ? ["email"] : [])],
//     });
//   };
//
//   User.getFromName = async (name: string): Promise<User | null> => {
//     return User.findOne({ where: { userName: name } });
//   };
//
//   User.getFromEmail = async (email): Promise<User | null> => {
//     return User.findOne({ where: { email } });
//   };
//
//   User.freeEmail = async (email: string): Promise<boolean> => {
//     return (await User.getFromEmail(email.toLowerCase())) === null;
//   };
//
//   //------------------
//   // INSTANCE METHODS
//   //------------------
//
//   User.prototype.hasGlobalWrite = function () {
//     return UserGlobalPermission.Write === this.globalPermission;
//   };
//
//   User.prototype.hasGlobalRead = function () {
//     return [UserGlobalPermission.Read, UserGlobalPermission.Write].includes(
//       this.globalPermission,
//     );
//   };
//
//   User.prototype.getWhereDeviceVisible = async function () {
//     if (this.hasGlobalRead()) {
//       return null;
//     }
//     const allDeviceIds = await this.getDeviceIds();
//     return { DeviceId: { [Op.in]: allDeviceIds } };
//   };
//   //
//   // User.prototype.getJwtDataValues = function (): DecodedJWTToken {
//   //   const jwtPayload: DecodedJWTToken = {
//   //     id: this.getDataValue("id"),
//   //     _type: "user",
//   //   };
//   //   if (!this.emailConfirmed) {
//   //     jwtPayload.activated = false;
//   //   }
//   //   return jwtPayload;
//   // };
//
//   // Returns the groups that are associated with this user (via
//   // GroupUsers).
//   User.prototype.getGroupsIds = async function (): Promise<GroupId[]> {
//     const groups = await this.getGroups();
//     return groups.map((g) => g.id);
//   };
//
//   User.prototype.getDeviceIds = async function (): Promise<DeviceId[]> {
//     const devices = (await models.Device.findAll({
//       where: {},
//       include: [
//         {
//           model: models.Group,
//           required: true,
//           attributes: [],
//           include: [
//             {
//               model: models.User,
//               attributes: [],
//               through: {
//                 attributes: [],
//               },
//               required: true,
//               where: { id: this.id },
//             },
//           ],
//         },
//       ],
//       attributes: ["id"],
//     })) as Device[];
//     if (devices !== null) {
//       return devices.map((d) => d.id);
//     }
//     return [];
//   };
//   //
//   // User.prototype.comparePassword = function (
//   //   password: string,
//   // ): Promise<boolean> {
//   //   return new Promise(
//   //     function (resolve, reject) {
//   //       bcrypt.compare(password, this.password, function (err, isMatch) {
//   //         if (err) {
//   //           reject(err);
//   //         } else {
//   //           resolve(isMatch);
//   //         }
//   //       });
//   //     }.bind(this),
//   //   );
//   // };
//   //
//   // User.prototype.resetPassword = async function (): Promise<boolean> {
//   //   return sendResetEmail(this, this.password);
//   // };
//
//   return User;
// }

//----------------------
// VALIDATION FUNCTIONS
//----------------------

async function beforeModify(user: User) {
  if (user.changed("password")) {
    user.password = await bcrypt.hash(user.password, 10);
  }
}

function beforeValidate(user: User) {
  user.setDataValue("email", user.getDataValue("email").toLowerCase());
}
