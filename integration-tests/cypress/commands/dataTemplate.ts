import { RecordingProcessingState, RecordingType } from "@typedefs/api/consts";
import { NOT_NULL, NOT_NULL_STRING } from "@commands/constants";

import {
  ApiRecordingSet,
  ApiTrackSet,
  ApiRecordingForProcessing,
  ApiRecordingNeedsTagReturned,
} from "@commands/types";
import {
  ApiAudioRecordingResponse,
  ApiThermalRecordingResponse,
} from "@typedefs/api/recording";
import { ApiTrackResponse } from "@typedefs/api/track";

//AUDIO RECORDINGS
export const TEMPLATE_AUDIO_RECORDING: ApiRecordingSet = {
  type: RecordingType.Audio,
  fileHash: null,
  duration: 60,
  recordingDateTime: "2021-08-24T01:35:00.000Z",
  relativeToDawn: 1000,
  relativeToDusk: -17219,
  location: [-43.53345, 172.64745],
  version: "1.8.1",
  batteryCharging: "DISCHARGING",
  batteryLevel: 87,
  airplaneModeOn: false,
  cacophonyIndex: [
    { end_s: 20, begin_s: 0, index_percent: 80.8 },
    { end_s: 40, begin_s: 20, index_percent: 77.1 },
    { end_s: 60, begin_s: 40, index_percent: 71.6 },
  ],
  additionalMetadata: {
    normal: "0",
    "SIM IMEI": "990006964660319",
    analysis: {
      cacophony_index_version: "2020-01-20_A",
      processing_time_seconds: 50.7,
      species_identify_version: "2021-02-01",
    },
    "SIM state": "SIM_STATE_READY",
    "Auto Update": false,
    "Flight Mode": false,
    "Phone model": "SM-G900V",
    amplification: 1.0721460589601806,
    SimOperatorName: "Verizon",
    "Android API Level": 23,
    "Phone manufacturer": "samsung",
    "App has root access": false,
  },
  comment: "A comment",
  processingState: RecordingProcessingState.Finished,
};

export const TEMPLATE_AUDIO_RECORDING_PROCESSING: ApiRecordingForProcessing = {
  id: NOT_NULL,
  type: RecordingType.Audio,
  jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
  rawFileKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
  rawMimeType: "audio/mp4",
  fileKey: null,
  fileMimeType: null,
  processingState: "xxx",
  processingMeta: null,
  GroupId: NOT_NULL,
  DeviceId: NOT_NULL,
  StationId: NOT_NULL,
  recordingDateTime: "2021-01-01T01:01:01.018Z",
  duration: 60,
  location: null,
  hasAlert: false,
  processingStartTime: NOT_NULL_STRING,
  processingEndTime: null,
  processing: true,
  updatedAt: "",
  currentStateStartTime: NOT_NULL_STRING,
  processingFailedCount: 0,
};

export const TEMPLATE_AUDIO_RECORDING_RESPONSE: ApiAudioRecordingResponse = {
  airplaneModeOn: false,
  batteryCharging: "DISCHARGING",
  batteryLevel: 87,
  deviceId: 2023,
  deviceName: "mattb-s5",
  duration: 60,
  groupId: 389,
  groupName: "mattb-audio",
  stationId: NOT_NULL,
  stationName: NOT_NULL_STRING,
  id: 204771,
  location: {
    lat: -43.53345,
    lng: 172.64745,
  },
  rawMimeType: "",
  //processing: false,
  processingState: RecordingProcessingState.Finished,
  recordingDateTime: "2021-08-24T01:35:00.000Z",
  relativeToDusk: -17219,
  tags: [],
  tracks: [],
  type: RecordingType.Audio,
  version: "1.8.1",
  cacophonyIndex: [
    { end_s: 20, begin_s: 0, index_percent: 80.8 },
    { end_s: 40, begin_s: 20, index_percent: 77.1 },
    { end_s: 60, begin_s: 40, index_percent: 71.6 },
  ],
  additionalMetadata: {
    normal: "0",
    "SIM IMEI": "990006964660319",
    analysis: {
      cacophony_index_version: "2020-01-20_A",
      processing_time_seconds: 50.7,
      species_identify_version: "2021-02-01",
    },
    "SIM state": "SIM_STATE_READY",
    "Auto Update": false,
    "Flight Mode": false,
    "Phone model": "SM-G900V",
    amplification: 1.0721460589601806,
    SimOperatorName: "Verizon",
    "Android API Level": 23,
    "Phone manufacturer": "samsung",
    "App has root access": false,
  },
  redacted: false,
};

//THERMAL RECORDINGS

export const TEMPLATE_AUDIO_TRACK: ApiTrackSet = {
  start_s: 0,
  end_s: 3,
  minFreq: 10,
  maxFreq: 1000,
  predictions: [
    {
      confidence: 1,
      model_id: 1,
      confident_tag: "morepork",
    },
  ],
  //  positions: [],
  //  TODO enable after merge
  automatic: true,
};

export const TEMPLATE_EXPECTED_AUDIO_TRACK: ApiTrackResponse = {
  start: 0,
  end: 3,
  minFreq: 10,
  maxFreq: 1000,
  id: NOT_NULL,
  filtered: false,
  automatic: true,
  //  positions: [
  //    {
  //      x: 111,
  //      y: 17,
  //      width: 48,
  //      height: 75,
  //      order: NOT_NULL,
  //    },
  //  ],
  // TODO enable after merge
  tags: [
    {
      what: "morepork",
      data: { name: "Master" },
      automatic: true,
      confidence: 1,
      trackId: NOT_NULL,
      id: NOT_NULL,
      path: "all",
    },
  ],
};

export const TEMPLATE_TRACK: ApiTrackSet = {
  id: 2,
  tracker_version: 10,
  start_s: 4.89,
  end_s: 8.67,
  num_frames: 34,
  frame_start: 44,
  frame_end: 77,
  positions: [
    {
      x: 111,
      y: 17,
      width: 48,
      height: 75,
      mass: 1972,
      frame_number: 44,
      pixel_variance: 5213.85009765625,
      blank: false,
    },
  ],
  predictions: [
    {
      label: "cat",
      confident_tag: "cat",
      confidence: 0.97,
      clarity: 0.949,
      all_class_confidences: {
        bird: 0.0,
        cat: 0.97,
        "false-positive": 0.02500000037252903,
        hedgehog: 0.0,
        human: 0.01,
        leporidae: 0.0,
        mustelid: 0.0,
        possum: 0.3,
        rodent: 0.0,
        vehicle: 0.0,
        wallaby: 0.0,
      },
      prediction_frames: [[55], [65], [75]],
      predictions: [[0, 0, 1716, 0, 65763, 0, 0, 0, 0, 0, 0]],
      model_id: 1,
    },
  ],
};

export const TEMPLATE_EXPECTED_TRACK: ApiTrackResponse = {
  start: 4.89,
  end: 8.67,
  id: NOT_NULL,
  filtered: false,
  automatic: true,
  // TODO enable after merge
  //  positions: [
  //    {
  //      x: 111,
  //      y: 17,
  //      width: 48,
  //      height: 75,
  //      //frameNumber: 44, FIXME: PATRICK: Remove once GPs changes integrated
  //      order: NOT_NULL,
  //    },
  //  ],
  tags: [
    {
      what: "cat",
      automatic: true,
      confidence: 0.97,
      data: { name: "Master" },
      trackId: NOT_NULL,
      id: NOT_NULL,
      path: "all",
    },
  ],
};

export const TEMPLATE_THERMAL_RECORDING_RESPONSE: ApiThermalRecordingResponse =
  {
    deviceId: 0,
    deviceName: "",
    groupName: "",
    id: 892972,
    rawMimeType: "application/x-cptv",
    processingState: RecordingProcessingState.Finished,
    duration: 0.5555555555555556,
    recordingDateTime: "2021-07-17T20:13:17.248Z",
    location: { lat: -45.29115, lng: 169.30845 },
    type: RecordingType.ThermalRaw,
    additionalMetadata: { algorithm: 31143, previewSecs: 5, totalFrames: 5 },
    //additionalMetadata: { algorithm: 31143, previewSecs: 5, totalFrames: 141 },
    groupId: 246,
    stationId: NOT_NULL,
    stationName: NOT_NULL_STRING,
    comment: "This is a comment",
    //processing: false,
    tags: [],
    tracks: [TEMPLATE_EXPECTED_TRACK],
  };

export const TEMPLATE_THERMAL_RECORDING: ApiRecordingSet = {
  type: RecordingType.ThermalRaw,
  fileHash: null,
  duration: 0.5555555555555556,
  recordingDateTime: "2021-07-17T20:13:17.248Z",
  location: [-45.29115, 169.30845],
  additionalMetadata: {
    algorithm: 31143,
    previewSecs: 5,
    totalFrames: 5,
  },
  metadata: {
    tracks: [TEMPLATE_TRACK],
    algorithm: {
      tracker_version: 10,
      model_name: "Master",
    },
    models: [
      {
        id: 1,
        name: "Master",
      },
    ],
  },
  comment: "This is a comment",
  processingState: RecordingProcessingState.Finished,
};

export const TEMPLATE_THERMAL_RECORDING_PROCESSING: ApiRecordingForProcessing =
  {
    id: 475,
    type: RecordingType.ThermalRaw,
    jobKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawFileKey: "e6ef8335-42d2-4906-a943-995499bd84e2",
    rawMimeType: "application/x-cptv",
    fileKey: null,
    fileMimeType: null,
    processingState: "xxx",
    processingMeta: null,
    GroupId: NOT_NULL,
    DeviceId: NOT_NULL,
    StationId: NOT_NULL,
    recordingDateTime: "2021-01-01T01:01:01.018Z",
    duration: 16.6666666666667,
    location: null,
    hasAlert: false,
    processingStartTime: NOT_NULL_STRING,
    processingEndTime: null,
    processing: true,
    updatedAt: NOT_NULL_STRING,
    currentStateStartTime: NOT_NULL_STRING,
    processingFailedCount: 0,
  };

export const TEMPLATE_THERMAL_RECORDING_NEEDS_TAG: ApiRecordingNeedsTagReturned =
  {
    DeviceId: 49,
    RecordingId: 34,
    duration: 40,
    fileSize: 1,
    recordingJWT: NOT_NULL_STRING,
    tagJWT: NOT_NULL_STRING,
    tracks: [],
  };
