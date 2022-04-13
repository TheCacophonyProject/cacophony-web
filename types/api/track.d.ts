import { Seconds, TrackId } from "./common";
import {
  ApiAutomaticTrackTagResponse,
  ApiHumanTrackTagResponse,
} from "./trackTag";

export interface ApiTrackPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  order?: number;
  frameTime?: number;
  frameNumber?: number;
}

export interface ApiTrackResponse {
  id: TrackId;
  start: Seconds;
  end: Seconds;
  automatic: boolean;
  positions: ApiTrackPosition[];
  tags: (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[];
  filtered: boolean;
  minFreq?: number;
  maxFreq?: number;
}

export interface ApiTrackRequest {
  data: ApiTrackDataRequest;
  algorithm?: Object | Array<number>;
}

export interface ApiTrackDataRequest {
  start_s: Seconds;
  end_s: Seconds;

  // FIXME - Make more of these fields mandatory once we know who calls this with what.
  minFreq?: number;
  maxFreq?: number;
  automatic?: boolean;
  userId?: number;
  label?: string;
  clarity?: number;
  positions?: any;
  message?: string;
  tag?: string;
  tracker_version?: string;
}
