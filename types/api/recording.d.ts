import {DeviceId, GroupId, IsoFormattedDateString, LatLng, RecordingId, Seconds, StationId} from "./common";
import {ApiRecordingTagResponse} from "./tag";
import {ApiTrackResponse} from "./track";

export type RecordingType = "thermalRaw" | "audio";

export interface ApiRecordingResponse {
    id: RecordingId;
    processingState: string; // FIXME - move to common
    duration: Seconds;
    recordingDateTime: IsoFormattedDateString;
    relativeToDawn: null | number;
    relativeToDusk: null | number;
    location: LatLng;
    version: null | number; // FIXME??
    batteryLevel: null | number;
    batteryCharging: null | boolean;
    airplaneModeOn: null | boolean;
    type: RecordingType;
    groupId: GroupId;
    groupName: string;
    deviceId: DeviceId;
    deviceName: string;
    stationId: null | StationId; // FIXME - make mandatory
    stationName: null | string;
    comment: null | string;
    processing: boolean;
    additionalMetadata: {
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
    },
    tags: ApiRecordingTagResponse[];
    tracks: ApiTrackResponse[];
}
