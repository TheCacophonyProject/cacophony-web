// Station data as supplied to API on creation.
import {
  GroupId,
  IsoFormattedDateString,
  LatLng,
  StationId,
  UserId,
} from "./common";

export interface ApiCreateStationData {
  name: string;
  lat: number;
  lng: number;
}

export interface ApiCreateStationResponse {
  stationIdsAddedOrUpdated: StationId[]; // Station ids that were created or changed by the request
  updatedRecordingsPerStation: Record<StationId, number>; // The number of recordings updated for each station
}

export interface ApiStationResponse {
  id: StationId;
  name: string;
  location: LatLng;
  lastUpdatedById: UserId;
  createdAt: IsoFormattedDateString;
  retiredAt?: IsoFormattedDateString;
  updatedAt: IsoFormattedDateString;
  groupId: GroupId;
}
