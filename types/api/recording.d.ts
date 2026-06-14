import type {
  DeviceId,
  GroupId,
  IsoFormattedDateString,
  LatLng,
  RecordingId,
  Seconds,
  StationId,
} from "./common.ts";
import type { ApiRecordingTagResponse } from "./tag.ts";
import type { ApiTrackResponse } from "./track.ts";
import { RecordingProcessingState, RecordingType } from "./consts.ts";
import type { DeviceBatteryChargeState } from "./device.ts";

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
  status?: string;
  rawMimeType?: string;
  redacted?: boolean;
}

export interface ApiThermalRecordingMetadataResponse extends Record<
  string,
  unknown
> {
  trackingTime?: Seconds;
  previewSecs?: Seconds;
  totalFrames?: number;
  algorithm?: number;
  thumbnail_region?: {
    x: number;
    y: number;
    width: number;
    height: number;
    frame_number: number;
    mass?: number;
    blank?: boolean;
    pixel_variance?: number;
    in_trap?: boolean;
  };
  metadataSource?: string;
  status?: "test" | "startup" | "shutdown";
}

export interface ApiAudioRecordingMetadataResponse extends Record<
  string,
  unknown
> {
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
  status?: "test";
}

export interface ApiThermalRecordingResponse extends ApiRecordingResponse {
  additionalMetadata?: ApiThermalRecordingMetadataResponse;
  type: RecordingType.ThermalRaw | RecordingType.InfraredVideo;
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
  updatedAt: IsoFormattedDateString;
  recordingDateTime: IsoFormattedDateString;
  processingState: RecordingProcessingState;
  processingStartTime?: IsoFormattedDateString;
  processingEndTime?: IsoFormattedDateString;
  currentStateStartTime?: IsoFormattedDateString;
  processingFailedCount: number;
  GroupId: GroupId;
  DeviceId: DeviceId;
  StationId: StationId;
  processing: boolean;
  // ... Other fields we don't care about right now
}

export interface ApiRecordingUpdateRequest {
  comment?: string;
  additionalMetadata?: Record<string, unknown>;
}

export type ApiGenericRecordingResponse = ApiThermalRecordingResponse &
  ApiAudioRecordingResponse;

export interface ApiRecordingUploadData {
  fileHash?: string | null;
  status?: "test" | "startup" | "shutdown";
  location?: LatLng;
  type?: RecordingType;
  recordingDateTime?: Date | IsoFormattedDateString;
  duration?: number;
  metadata?: object;
  additionalMetadata?: Record<string, unknown>;
}
