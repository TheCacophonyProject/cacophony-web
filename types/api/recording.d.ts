import {DeviceId, GroupId, IsoFormattedDateString, LatLng, RecordingId, Seconds, StationId} from "./common";
import {ApiRecordingTagResponse} from "./tag";
import {ApiTrackResponse} from "./track";
import { RecordingProcessingState, RecordingType } from "./consts";

export interface ApiRecordingResponse {
    id: RecordingId;
    processingState: RecordingProcessingState;
    duration: Seconds;
    recordingDateTime: IsoFormattedDateString;
    type: RecordingType;
    groupId: GroupId;
    groupName: string;
    deviceId: DeviceId;
    deviceName: string;
    processing?: boolean;
    tags: ApiRecordingTagResponse[];
    tracks: ApiTrackResponse[];
    location?: LatLng;
    stationId?: StationId;
    stationName?: string;
    comment?: string;
}

export interface ApiThermalRecordingMetadataResponse {
  trackingTime: Seconds;
  previewSecs: Seconds;
  totalFrames: number;

  thumbnailRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
    frameNumber: number;
  }
}

export interface ApiAudioRecordingMetadataResponse {
  analysis: {
    cacophony_index: CacophonyIndex[],
  }
}

export interface ApiThermalRecordingResponse extends ApiRecordingResponse {
  additionalMetadata: ApiThermalRecordingMetadataResponse;
  type: RecordingType.ThermalRaw;
}

interface CacophonyIndex {
  begin_s: Seconds;
  end_s: Seconds;
  index_percent: number;
}

export interface ApiAudioRecordingResponse extends ApiRecordingResponse {
  version?: number;
  batteryLevel?: number;
  batteryCharging?: string;
  airplaneModeOn?: boolean;
  relativeToDawn?: number;
  relativeToDusk?: number;
  type: RecordingType.Audio;
  additionalMetadata: ApiAudioRecordingMetadataResponse;
}
