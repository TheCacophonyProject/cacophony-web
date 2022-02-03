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
  frameNumber?: number;
  frameTime?: number;
}

export interface ApiTrackResponse {
  id: TrackId;
  start: Seconds;
  end: Seconds;
  positions?: ApiTrackPosition[];
  tags: (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[];
  filtered: boolean;
}

export interface ApiTrackDataRequest {
  start_s: Seconds;
  end_s: Seconds;

  // FIXME - Make more of these fields mandatory once we know who calls this with what.
  label?: string;
  clarity?: number;
  positions?: any;
  message?: string;
  tag?: string;
  tracker_version?: number;
}
