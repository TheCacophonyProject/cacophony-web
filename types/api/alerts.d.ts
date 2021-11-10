import { DeviceId, IsoFormattedDateString, Seconds, UserId } from "./common";

export interface ApiAlertCondition {
  tag: string;
  automatic: boolean;
}

export interface ApiAlertResponse {
  id: DeviceId;
  name: string;
  frequencySeconds: Seconds;
  conditions: ApiAlertCondition[];
  lastAlert: IsoFormattedDateString;
  User: {
    id: UserId;
    username: string;
    email: string;
  };
  Device: {
    id: DeviceId;
    devicename: string;
  };
}
