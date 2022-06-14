import { GroupId, IsoFormattedDateString, StationId } from "./common";

export interface MonitoringRequest {
  perPage?: number;
  page?: number;
  days?: number | "all";
  from?: IsoFormattedDateString;
  to?: IsoFormattedDateString;
  group?: GroupId[];
  station?: StationId[];
  aiModel?: string;
}
