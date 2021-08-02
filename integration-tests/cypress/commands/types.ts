interface ApiAlertConditions {
  tag: string;
  automatic: boolean;
};

interface ApiAlertUser {
           id: number;
           username: string;
           email: string;
	   name: string;
};

interface ApiAlertDevice {
          id: number;
          devicename: string;
};

interface ApiAlert {
  id: number;
  name: string;
  alertName?: string;
  frequencySeconds: number;
  conditions: ApiAlertConditions[];
  lastAlert: boolean;
  User: ApiAlertUser;
  Device: ApiAlertDevice;
};


interface ApiAuthenticateAccess  {
        devices: string;
};

interface ApiDevicesDevice {
        id: number;
       	devicename: string;
        active: boolean;
        Users: ApiDevicesDeviceUser[];
};

interface ApiDeviceInGroupDevice {
	id: number;
	devicename: string;
	groupName: string;
	userIsAdmin: boolean;
	users: ApiDeviceInGroupUser[];
}

interface ApiDeviceQueryDevice {
	devicename: string;
        groupname: string;
	saltId?: number;
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

interface TestComparableVisit {
  // either a date object or a string representing the time of day (enough for most tests)
  start?: Date | string;
  end?: Date | string;
  tag?: string;
  recordings?: number;
  incomplete? : string;
  aiTag? : string;
  camera? : string;
  station? : string;
}

interface TestVisitSearchParams {
  from?: Date | string;
  until?: Date | string;
  devices?: number | number[];
  page?: number;
  "page-size"? : number;
  ai?: string;
  groups?: number | number[];
}

interface TestVisitsWhere {
  type: string;
  duration?: any;
  DeviceId?: number;
}

// Station data as supplied to API on creation.
interface ApiCreateStationData {
  name: string;
  lat: number;
  lng: number;
}

interface ApiTrackInfo {
  start_s?: number;
  end_s?: number;
  tag?: string;
  // confidence?: number,
}

interface ApiThermalRecordingInfo {
  processingState: string;
  time? : Date | string;
  duration?: number;
  model?: string;
  tracks?: ApiTrackInfo[];
  noTracks?: boolean; // by default there will normally be one track, set to true if you don't want tracks
  minsLater?: number; // minutes that later that the recording is taken
  secsLater?: number; // minutes that later that the recording is taken
  tags?: string[]; // short cut for defining tags for each track
  lat?: number; // Latitude position for the recording
  lng?: number; // Longitude position for the recording
}

