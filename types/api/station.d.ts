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

export interface ApiUpdateStationData {
  name?: string;
  lat?: number;
  lng?: number;
}

export interface ApiCreateStationResponse {
  stationIdsAddedOrUpdated: StationId[]; // Station ids that were created or changed by the request
  updatedRecordingsPerStation: Record<StationId, number>; // The number of recordings updated for each station
}

export interface ApiStationResponse {
  id: StationId;
  name: string;
  location: LatLng;
  lastUpdatedById?: UserId; // Not set if station was automatically created.
  //createdAt: IsoFormattedDateString;
  activeAt: IsoFormattedDateString;
  retiredAt?: IsoFormattedDateString;
  lastThermalRecordingTime?: IsoFormattedDateString;
  lastAudioRecordingTime?: IsoFormattedDateString;
  automatic: boolean;
  settings?: ApiStationSettings;
  //updatedAt: IsoFormattedDateString;
  groupId: GroupId;
  groupName: string;
}

export interface ApiStationSettings {
  // TBC
}
