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
import Sequelize, {
  BuildOptions,
  ModelAttributes,
  ModelOptions,
} from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import { Group } from "./Group";
import { EndUserAgreementVersion, UserId } from "@typedefs/api/common";
import { UserGlobalPermission } from "@typedefs/api/consts";
import { sendResetEmail } from "@/scripts/emailUtil";
import { Device } from "@models/Device";

const Op = Sequelize.Op;

export interface User extends Sequelize.Model, ModelCommon<User> {
  getWhereDeviceVisible: () => Promise<null | { DeviceId: {} }>;
  comparePassword: (password: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  getDeviceIds: () => Promise<number[]>;
  getGroupsIds: () => Promise<number[]>;
  getGroups: (options?: {
    where: any;
    attributes: string[];
  }) => Promise<Group[]>;

  hasGlobalWrite: () => boolean;
  hasGlobalRead: () => boolean;

  admin: boolean;
  id: UserId;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  groups: Group[];
  globalPermission: UserGlobalPermission;
  endUserAgreement: EndUserAgreementVersion;
}

export interface UserStatic extends ModelStaticCommon<User> {
  new (values?: object, options?: BuildOptions): User;
  getAll: (where: any) => Promise<User[]>;
  getFromName: (name: string) => Promise<User | null>;
  freeUsername: (name: string) => Promise<boolean>;
  getFromEmail: (email: string) => Promise<User | null>;
  freeEmail: (email: string) => Promise<boolean>;
  getFromId: (id: number) => Promise<User | null>;
}

interface UserData {
  id: UserId;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  groups: Group[];
  globalPermission: UserGlobalPermission;
}

export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): UserStatic {
  const name = "User";
  const attributes: ModelAttributes = {
    username: {
      type: DataTypes.STRING,
      unique: true,
    },
    firstName: {
      type: DataTypes.STRING,
    },
    lastName: {
      type: DataTypes.STRING,
    },
    email: {
      type: DataTypes.STRING,
      validate: { isEmail: true },
      unique: true,
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
  };

  const options: ModelOptions = {
    hooks: {
      beforeValidate: beforeValidate,
      beforeCreate: beforeModify,
      beforeUpdate: beforeModify,

      // NOTE: Doesn't exist on publicly available typings, so ignore
      // @ts-ignore
      beforeUpsert: beforeModify,
    },
  };

  // Define table
  const User = sequelize.define(
    name,
    attributes,
    options
  ) as unknown as UserStatic;

  User.publicFields = Object.freeze(["id", "username"]);

  User.apiSettableFields = Object.freeze([
    "firstName",
    "lastName",
    "email",
    "endUserAgreement",
  ]);
  //---------------
  // CLASS METHODS
  //---------------
  const models = sequelize.models;

  User.addAssociations = function (models) {
    models.User.belongsToMany(models.Group, {
      through: models.GroupUsers,
    });
    models.User.hasMany(models.Alert);
  };

  User.getAll = async function (where) {
    return this.findAll({
      where,
      attributes: this.publicFields,
    });
  };

  User.getFromId = async function (id) {
    return this.findByPk(id);
  };

  User.getFromName = async (name: string): Promise<User | null> => {
    return User.findOne({ where: { username: name } });
  };

  User.freeUsername = async (name: string): Promise<boolean> => {
    return (await User.getFromName(name)) === null;
  };

  User.getFromEmail = async (email): Promise<User | null> => {
    return User.findOne({ where: { email } });
  };

  User.freeEmail = async (email: string): Promise<boolean> => {
    return (await User.getFromEmail(email.toLowerCase())) === null;
  };

  //------------------
  // INSTANCE METHODS
  //------------------

  User.prototype.hasGlobalWrite = function () {
    return UserGlobalPermission.Write === this.globalPermission;
  };

  User.prototype.hasGlobalRead = function () {
    return [UserGlobalPermission.Read, UserGlobalPermission.Write].includes(
      this.globalPermission
    );
  };

  User.prototype.getWhereDeviceVisible = async function () {
    if (this.hasGlobalRead()) {
      return null;
    }
    const allDeviceIds = await this.getDeviceIds();
    return { DeviceId: { [Op.in]: allDeviceIds } };
  };

  User.prototype.getJwtDataValues = function () {
    return {
      id: this.getDataValue("id"),
      _type: "user",
    };
  };

  // Returns the groups that are associated with this user (via
  // GroupUsers).
  User.prototype.getGroupsIds = async function () {
    const groups = await this.getGroups();
    return groups.map((g) => g.id);
  };

  User.prototype.getDeviceIds = async function () {
    // FIXME(DeviceUsers) Could this just be this.getDevices()?

    const devices = await models.Device.findAll({
      where: {},
      include: [
        {
          model: models.Group,
          required: true,
          attributes: [],
          include: [
            {
              model: models.User,
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
  };

  User.prototype.comparePassword = function (password: string) {
    const user = this;
    return new Promise(function (resolve, reject) {
      bcrypt.compare(password, user.password, function (err, isMatch) {
        if (err) {
          reject(err);
        } else {
          resolve(isMatch);
        }
      });
    });
  };
  User.prototype.updatePassword = async function (password: string) {
    return this.update({ password: password });
  };

  User.prototype.resetPassword = async function () {
    console.log("resetting");
    await sendResetEmail(this, this.password);
  };

  return User;
}

//----------------------
// VALIDATION FUNCTIONS
//----------------------

async function beforeModify(user) {
  if (user.changed("password")) {
    user.password = await bcrypt.hash(user.password, 10);
  }
}

function beforeValidate(user): Promise<void> {
  return new Promise((resolve) => {
    user.setDataValue("email", user.getDataValue("email").toLowerCase());
    resolve();
  });
}
