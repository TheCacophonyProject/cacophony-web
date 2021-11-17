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
import { format } from "util";
import Sequelize, { FindOptions } from "sequelize";
import { ModelCommon, ModelStaticCommon } from "./index";
import { User } from "./User";
import { Group, GroupStatic } from "./Group";
import { GroupUsersStatic } from "./GroupUsers";
import { DeviceUsersStatic } from "./DeviceUsers";
import { Event } from "./Event";
import { AccessLevel } from "./GroupUsers";
import logger from "../logging";
import { DeviceType } from "@typedefs/api/consts";
import { DeviceId, GroupId, UserId, ScheduleId } from "@typedefs/api/common";

const Op = Sequelize.Op;

export interface Device extends Sequelize.Model, ModelCommon<Device> {
  id: DeviceId;
  getAccessLevel: (user: User) => AccessLevel;
  addUser: (userId: UserId, options: any) => any;
  devicename: string;
  groupname: string;
  saltId: number;
  active: boolean;
  public: boolean;
  lastConnectionTime: Date | null;
  lastRecordingTime: Date | null;
  password?: string;
  location?: { type: "Point"; coordinates: [number, number] };
  comparePassword: (password: string) => Promise<boolean>;
  reRegister: (
    devicename: string,
    group: Group,
    newPassword: string
  ) => Promise<Device | false>;
  Group: Group;
  GroupId: number;
  kind: DeviceType;
  getEvents: (options: FindOptions) => Promise<Event[]>;
  getGroup: () => Promise<Group>;
  users: (authUser: User, attrs?: string[]) => Promise<User[]>;
  updateHeartbeat: (nextHeartbeat: Date) => Promise<boolean>;
}

export interface DeviceStatic extends ModelStaticCommon<Device> {
  addUserToDevice: (
    device: Device,
    userToAdd: User,
    admin: boolean
  ) => Promise<string>;
  allForUser: (
    user: User,
    onlyActive: boolean,
    viewAsSuperAdmin: boolean
  ) => Promise<{ rows: Device[]; count: number }>;
  removeUserFromDevice: (device: Device, user: User) => Promise<boolean>;
  onlyUsersDevicesMatching: (
    user?: User,
    conditions?: any,
    ScheduleId?: ScheduleId,
    includeData?: any
  ) => Promise<{ rows: Device[]; count: number }>;
  freeDevicename: (name: string, id: GroupId) => Promise<boolean>;
  getFromId: (id: DeviceId) => Promise<Device>;
  findDevice: (
    deviceID?: DeviceId,
    deviceName?: string,
    groupName?: string,
    password?: string
  ) => Promise<Device>;
  wherePasswordMatches: (
    devices: Device[],
    password: string
  ) => Promise<Device>;
  getFromNameAndPassword: (name: string, password: string) => Promise<Device>;
  allWithName: (name: string) => Promise<Device[]>;
  getFromNameAndGroup: (name: string, groupName: string) => Promise<Device>;
  getCacophonyIndex: (
    authUser: User,
    deviceId: Device,
    from: Date,
    windowSize: number
  ) => Promise<number>;
  getCacophonyIndexHistogram: (
    authUser: User,
    deviceId: DeviceId,
    from: Date,
    windowSize: number
  ) => Promise<{ hour: number; index: number }>;
}

export default function (
  sequelize: Sequelize.Sequelize,
  DataTypes
): DeviceStatic {
  const name = "Device";

  const attributes = {
    devicename: {
      type: DataTypes.STRING,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    location: {
      type: DataTypes.GEOMETRY,
    },
    lastConnectionTime: {
      type: DataTypes.DATE,
    },
    lastRecordingTime: {
      type: DataTypes.DATE,
    },
    public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    saltId: {
      type: DataTypes.INTEGER,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    kind: {
      type: DataTypes.ENUM,
      values: Object.values(DeviceType),
      defaultValue: DeviceType.Unknown,
    },
    nextHeartbeat: {
      type: DataTypes.DATE,
    },
  };

  const options = {
    hooks: {
      afterValidate: afterValidate,
    },
  };

  const Device = sequelize.define(
    name,
    attributes,
    options
  ) as unknown as DeviceStatic;

  //---------------
  // CLASS METHODS
  //---------------
  const models = sequelize.models;

  Device.addAssociations = function (models) {
    models.Device.hasMany(models.Recording);
    models.Device.hasMany(models.Event);
    models.Device.belongsTo(models.Group);
    models.Device.belongsToMany(models.User, { through: models.DeviceUsers });
    models.Device.belongsTo(models.Schedule);
    models.Device.hasMany(models.Alert);
  };

  /**
   * Adds/update a user to a Device
   */
  Device.addUserToDevice = async function (device, userToAdd, admin) {
    // Get association if already there and update it.
    const deviceUser = await models.DeviceUsers.findOne({
      where: {
        DeviceId: device.id,
        UserId: userToAdd.id,
      },
    });
    if (deviceUser !== null) {
      if (deviceUser.admin !== admin) {
        deviceUser.admin = admin; // Update admin value.
        await deviceUser.save();
        if (admin) {
          return "Updated, user was made admin for device.";
        } else {
          return "Updated, user had admin rights removed for device.";
        }
      } else {
        return "No change, user already added.";
      }
    }

    await device.addUser(userToAdd.id, { through: { admin: admin } });
    return "Added user to device.";
  };

  /**
   * Removes a user from a Device
   */
  Device.removeUserFromDevice = async function (
    device,
    userToRemove
  ): Promise<boolean> {
    // Check that association is there to delete.
    const deviceUser = await models.DeviceUsers.findOne({
      where: {
        DeviceId: device.id,
        UserId: userToRemove.id,
      },
    });
    if (deviceUser === null) {
      return false;
    }
    await deviceUser.destroy();
    return true;
  };

  Device.onlyUsersDevicesMatching = async function (
    user,
    conditions = null,
    includeData = null,
    viewAsSuperAdmin = true
  ) {
    // Return all devices if user has global write/read permission.
    if (viewAsSuperAdmin && user.hasGlobalRead()) {
      return this.findAndCountAll({
        where: conditions,
        attributes: ["devicename", "id", "GroupId", "active", "saltId"],
        include: includeData,
        order: ["devicename"],
      });
    }

    const whereQuery = await addUserAccessQuery(
      user,
      conditions,
      viewAsSuperAdmin
    );

    return this.findAndCountAll({
      where: whereQuery,
      attributes: ["devicename", "id", "active", "saltId"],
      order: ["devicename"],
      include: includeData,
    });
  };

  Device.allForUser = async function (
    user,
    onlyActive: boolean,
    viewAsSuperAdmin: boolean
  ) {
    const includeData = [
      {
        model: models.User,
        attributes: ["id", "username"],
      },
      {
        model: models.Group,
        attributes: ["id", "groupname"],
      },
    ];
    const includeOnlyActiveDevices = onlyActive ? { active: true } : null;

    return this.onlyUsersDevicesMatching(
      user,
      includeOnlyActiveDevices,
      includeData,
      viewAsSuperAdmin
    );
  };

  Device.freeDevicename = async function (devicename, groupId) {
    const device = await this.findOne({
      where: { devicename, GroupId: groupId },
    });
    return device === null;
  };

  Device.getFromId = async function (id) {
    return this.findByPk(id);
  };

  Device.findDevice = async function (
    deviceID,
    deviceName,
    groupName,
    password
  ) {
    // attempts to find a unique device by groupname, then deviceid (devicename if int),
    // then devicename, finally password
    let model = null;
    if (deviceID && deviceID > 0) {
      model = this.findByPk(deviceID);
    } else if (groupName) {
      model = await this.getFromNameAndGroup(deviceName, groupName);
    } else {
      const models = await this.allWithName(deviceName);
      //check for devicename being id
      deviceID = parseExactInt(deviceName);
      if (deviceID) {
        model = this.findByPk(deviceID);
      }

      //check for distinct name
      if (model == null) {
        if (models.length == 1) {
          model = models[0];
        }
      }

      //check for device match from password
      if (model == null && password) {
        model = await this.wherePasswordMatches(models, password);
      }
    }
    return model;
  };

  Device.wherePasswordMatches = async function (devices, password) {
    // checks if there is a unique devicename and password match, else returns null
    const validDevices = [];
    let passwordMatch = false;
    for (let i = 0; i < devices.length; i++) {
      passwordMatch = await devices[i].comparePassword(password);
      if (passwordMatch) {
        validDevices.push(devices[i]);
      }
    }
    if (validDevices.length == 1) {
      return validDevices[0];
    } else {
      if (validDevices.length > 1) {
        throw new Error(
          format("Multiple devices match %s and supplied password", name)
        );
      }
      return null;
    }
  };

  Device.getFromNameAndPassword = async function (name, password) {
    const devices = await this.allWithName(name);
    return this.wherePasswordMatches(devices, password);
  };

  Device.allWithName = async function (name) {
    return this.findAll({ where: { devicename: name } });
  };

  Device.getFromNameAndGroup = async function (name, groupName) {
    return this.findOne({
      where: { devicename: name },
      include: [
        {
          model: models.Group,
          where: { groupname: groupName },
        },
      ],
    });
  };

  Device.getCacophonyIndex = async function (
    authUser,
    device,
    from,
    windowSizeInHours
  ) {
    windowSizeInHours = Math.abs(windowSizeInHours);
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);

    // FIXME(jon): So the problem is that we're inserting recordings into the databases without
    //  saying how to interpret the timestamps, so they are interpreted as being NZ time when they come in.
    //  This happens to work when both the inserter and the DB are in the same timezone, but otherwise will
    //  lead to spurious values.  Need to standardize input time.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [result, _] =
      await sequelize.query(`select round((avg(cacophony_index.scores))::numeric, 2) as cacophony_index from
(select
	(jsonb_array_elements("additionalMetadata"->'analysis'->'cacophony_index')->>'index_percent')::float as scores
from
	"Recordings"
where
	"DeviceId" = ${device.id}
	and "type" = 'audio'
	and "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC') as cacophony_index;`);
    const index = result[0].cacophony_index;
    if (index !== null) {
      return Number(index);
    }
    return index;
  };

  Device.getCacophonyIndexHistogram = async function (
    authUser,
    deviceId,
    from,
    windowSizeInHours
  ) {
    windowSizeInHours = Math.abs(windowSizeInHours);
    // We need to take the time down to the previous hour, so remove 1 second
    const windowEndTimestampUtc = Math.ceil(from.getTime() / 1000);
    // Make sure the user can see the device:
    await authUser.checkUserControlsDevices([deviceId]);
    // Get a spread of 24 results with each result falling into an hour bucket.

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [results, _] = await sequelize.query(`select
	hour,
	round((avg(scores))::numeric, 2) as index
from
(select
	date_part('hour', "recordingDateTime") as hour,
	(jsonb_array_elements("additionalMetadata"->'analysis'->'cacophony_index')->>'index_percent')::float as scores
from
	"Recordings"
where
	"DeviceId" = ${deviceId}
	and "type" = 'audio'
	and "recordingDateTime" at time zone 'UTC' between (to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC' - interval '${windowSizeInHours} hours') and to_timestamp(${windowEndTimestampUtc}) at time zone 'UTC'
) as cacophony_index
group by hour
order by hour;
`);
    // TODO(jon): Do we want to validate that there is enough data in a given hour
    //  to get a reasonable index histogram?
    return results.map((item) => ({
      hour: Number(item.hour),
      index: Number(item.index),
    }));
  };

  // Fields that are directly settable by the API.
  Device.apiSettableFields = ["location", "newConfig"];

  //------------------
  // INSTANCE METHODS
  //------------------

  Device.prototype.getAccessLevel = async function (user) {
    if (user.hasGlobalWrite()) {
      return AccessLevel.Admin;
    }

    const groupAccessLevel = await (
      models.GroupUsers as GroupUsersStatic
    ).getAccessLevel(this.GroupId, user.id);
    const deviceAccessLevel = await (
      models.DeviceUsers as DeviceUsersStatic
    ).getAccessLevel(this.id, user.id);
    return Math.max(groupAccessLevel, deviceAccessLevel);
  };

  Device.prototype.getJwtDataValues = function () {
    return {
      id: this.getDataValue("id"),
      _type: "device",
    };
  };

  Device.prototype.comparePassword = function (password) {
    const device = this;
    return new Promise(function (resolve, reject) {
      bcrypt.compare(password, device.password, function (err, isMatch) {
        if (err) {
          reject(err);
        } else {
          resolve(isMatch);
        }
      });
    });
  };

  // Returns users that have access to this device either via group
  // membership or direct assignment. By default, only "safe" user
  // attributes are returned.
  Device.prototype.users = async function (
    authUser: User,
    attrs = ["id", "username"]
  ): Promise<User[]> {
    const deviceUsers = await this.getUsers({ attributes: attrs });
    const group: Group = await (models.Group as GroupStatic).getFromId(
      this.GroupId
    );
    const groupUsers = await group.getUsers({ attributes: attrs });
    // // De-dupe users, since some users can be a group member as well as a device member.
    // const dedupedUsers = new Map();
    // for (const user of groupUsers) {
    //   dedupedUsers.set(user.id, user);
    // }
    // // Prefer group membership in the case where we have both?
    // for (const user of deviceUsers) {
    //   if (!dedupedUsers.has(user.id)) {
    //     dedupedUsers.set(user.id, user);
    //   }
    // }
    // return Array.from(dedupedUsers.values());
    return [...groupUsers, ...deviceUsers];
  };

  // Will register as a new device
  Device.prototype.reRegister = async function (
    newName: string,
    newGroup: Group,
    newPassword: string
  ): Promise<Device | false> {
    let newDevice;
    try {
      await sequelize.transaction(
        {
          isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE,
        },
        async (t) => {
          // FIXME - Move clientError to API layer
          const conflictingDevice = await Device.findOne({
            where: {
              devicename: newName,
              GroupId: newGroup.id,
            },
            transaction: t,
          });

          if (conflictingDevice !== null) {
            logger.warning("Got conflicting device %s", conflictingDevice);
            throw new Error();
          }

          await Device.update(
            {
              active: false,
            },
            {
              where: { saltId: this.saltId },
              transaction: t,
            }
          );

          newDevice = await models.Device.create(
            {
              devicename: newName,
              GroupId: newGroup.id,
              password: newPassword,
              saltId: this.saltId,
            },
            {
              transaction: t,
            }
          );
        }
      );
    } catch (e) {
      return false;
    }
    return newDevice;
  };

  Device.prototype.updateHeartbeat = async function (nextHeartbeat) {
    return this.update({nextHeartbeat: nextHeartbeat });
  };

  return Device;
}

/**
*
filters the supplied query by devices and groups authUser is authorized to access
*/
async function addUserAccessQuery(
  authUser,
  whereQuery,
  viewAsSuperAdmin = true
) {
  if (viewAsSuperAdmin && authUser.hasGlobalRead()) {
    return whereQuery;
  }
  const deviceIds = await authUser.getDeviceIds();
  const userGroupIds = await authUser.getGroupsIds();
  const accessQuery = {
    [Op.and]: [
      {
        [Op.or]: [
          { GroupId: { [Op.in]: userGroupIds } },
          { id: { [Op.in]: deviceIds } },
        ],
      },
      whereQuery,
    ],
  };

  return accessQuery;
}

function parseExactInt(value) {
  const iValue = parseInt(value);
  if (value === iValue.toString()) {
    return Number(iValue);
  } else {
    return null;
  }
}

/********************/
/* Validation methods */
/********************/

function afterValidate(device: Device): Promise<void> | undefined {
  if (device.password !== undefined) {
    // TODO Make the password be hashed when the device password is set not in the validation.
    // TODO or make a custom validation for the password.
    return new Promise(function (resolve, reject) {
      bcrypt.hash(device.password, 10, function (err, hash) {
        if (err) {
          reject(err);
        } else {
          device.password = hash;
          resolve();
        }
      });
    });
  }
}
