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
  User?: {
    id: UserId;
    userName: string;
    email: string;
  };
}
