import {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  RecordingId,
  Seconds,
  StationId,
} from "./common";
import { ApiRecordingTagResponse } from "./tag";
import { ApiTrackResponse } from "./track";
import { RecordingProcessingState, RecordingType } from "./consts.js";
import { DeviceBatteryChargeState } from "./device";

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
  fileHash?: string;
  processing?: boolean;
  tags: ApiRecordingTagResponse[];
  tracks: ApiTrackResponse[];
  location?: LatLng;
  stationId?: StationId;
  stationName?: string;
  comment?: string;
  rawMimeType: string;
  redacted: boolean;
}

export interface ApiThermalRecordingMetadataResponse {
  trackingTime?: Seconds;
  previewSecs?: Seconds;
  totalFrames?: number;
  algorithm?: number;
  thumbnailRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
    frameNumber: number;
  };
}

export interface ApiTrailCamImageMetadataResponse {
  width: number;
  height: number;
  ISO?: number;
  make?: string;
  model?: string;
  deviceName?: string;
  aperture?: number;
  shutterSpeed?: number;
  softwareVersion?: number;
  exposureTime?: number;
  fStop?: number;
  inHg?: number;
  dateTime?: string;
}
export interface ApiAudioRecordingMetadataResponse {
  analysis?: {
    speech_detection?: boolean;
    speech_detection_version?: string;
  };
  normal: string;
  "SIM IMEI": string;
  "SIM state": string;
  "Auto Update": boolean;
  "Flight Mode": boolean;
  "Phone model": string;
  amplification: number;
  SimOperatorName: string;
  cacophony_index_version: string;
  species_identify_version: string;
  processing_time_seconds: Seconds;
  "Android API Level": number;
  "Phone manufacturer": string;
  "App has root access": boolean;
}

export interface ApiTrailCamImageResponse extends ApiRecordingResponse {
  additionalMetadata?: ApiTrailCamImageMetadataResponse;
  type: RecordingType.TrailCamImage;
}
export interface ApiThermalRecordingResponse extends ApiRecordingResponse {
  additionalMetadata?: ApiThermalRecordingMetadataResponse;
  type:
    | RecordingType.ThermalRaw
    | RecordingType.InfraredVideo
    | RecordingType.TrailCamVideo;
}

export interface CacophonyIndex {
  begin_s: Seconds;
  end_s: Seconds;
  index_percent: number;
}

export interface ApiAudioRecordingResponse extends ApiRecordingResponse {
  version?: string;
  batteryLevel?: number;
  batteryCharging?: DeviceBatteryChargeState;
  airplaneModeOn?: boolean;
  relativeToDawn?: number;
  relativeToDusk?: number;
  cacophonyIndex?: CacophonyIndex[];
  type: RecordingType.Audio;
  fileMimeType?: string;
  additionalMetadata?: ApiAudioRecordingMetadataResponse;
}

export interface ApiRecordingProcessingJob {
  jobKey: string;
  id: RecordingId;
  type: RecordingType;
  hasAlert: boolean;
  updatedAt: IsoFormattedDateString;
  processingStartTime?: IsoFormattedDateString;
  processingEndTime?: IsoFormattedDateString;
}

export interface ApiRecordingUpdateRequest {
  comment?: string;
  additionalMetadata?: Record<string, any>;
}

export type ApiGenericRecordingResponse = ApiThermalRecordingResponse &
  ApiAudioRecordingResponse;
