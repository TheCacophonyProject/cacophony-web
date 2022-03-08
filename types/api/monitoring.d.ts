import { DeviceId, GroupId, IsoFormattedDateString } from "./common";

export interface MonitoringRequest {
  perPage?: number;
  page?: number;
  days?: number | "all";
  from?: IsoFormattedDateString;
  to?: IsoFormattedDateString;
  group?: GroupId[];
  device?: DeviceId[];
  aiModel?: string;
}
