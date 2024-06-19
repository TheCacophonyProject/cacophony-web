import {AlertId, DeviceId, GroupId, IsoFormattedDateString, Seconds, StationId, UserId} from "./common";

export interface ApiAlertCondition {
  tag: string;
  automatic: boolean;
}

export interface ApiAlertResponse {
  id: AlertId;
  name: string;
  frequencySeconds: Seconds;
  conditions: ApiAlertCondition[];
  lastAlert: IsoFormattedDateString | "never";
  scope: "project" | "device" | "location",
  scopeId: GroupId | DeviceId | StationId
}

export interface ApiPostAlertRequestBody {
  name: string;
  deviceId?: DeviceId;
  stationId?: StationId;
  projectId?: GroupId;
  conditions: ApiAlertCondition[];
  frequencySeconds?: Seconds; // Defaults to 30 minutes
}
