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
