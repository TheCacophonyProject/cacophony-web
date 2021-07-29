interface ApiAlertConditions {
  tag: string;
  automatic: boolean;
};

interface ApiAlertUser {
           id: number;
           username: string;
           email: string;
};

interface ApiAlertDevice {
          id: number;
          devicename: string;
};

interface ApiAlert {
  id: number;
  name: string;
  frequencySeconds: number;
  conditions: [ApiAlertConditions];
  lastAlert: boolean;
  User: ApiAlertUser;
  Device: ApiAlertDevice;
};


interface ApiAuthenticateAccess  {
        'devices': string;
};

interface ApiDevicesDevice {
        id: number;
       	devicename: string;
        active: boolean;
        Users: [ApiDevicesDeviceUser];
};

interface ApiDeviceInGroupDevice {
	id: number;
	devicename: string;
	groupName: string;
	userIsAdmin: boolean;
	users: [ApiDeviceInGroupUser];
}

interface ApiDeviceQueryDevice {
	devicename: string;
        groupname: string;
	saltId: number;
}

interface TestDeviceAndGroup {
	devicename: string;
        groupname: string;
}


interface ApiDevicesDeviceUser {
        id: number;
        username: string;
        DeviceUsers: ApiDeviceUserRelationship;
}

interface ApiDeviceUserRelationship {
        admin: boolean;
        DeviceId: number;
	UserId: number;
}

interface ApiDeviceInGroupUser {
        userName: string;
	admin: boolean;
	id: number;
}

interface ApiDeviceUsersUser {
        id: number;
	username: string;
	email: string;
	relation: string;
	admin: boolean;
}

interface TestComparablePowerEvent {
  hasStopped: boolean;
  hasAlerted: boolean;
}

interface TestComparableEvent {
  id: number,
  dateTime: string,
  createdat: string,
  DeviceId: number,
  EventDetail: {
          type: string,
          details: {
                  recId: number,
                  alertId: number,
                  success: boolean,
                  trackId: number
          }
  },
  Device: {
          devicename: string
  }
};

