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
}

export interface ApiTrackResponse {
  id: TrackId;
  start: Seconds;
  end: Seconds;
  automatic: boolean;
  positions?: ApiTrackPosition[];
  tags: (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[];
}

export interface ApiTrackRequest {
  data: {
    start_s: Seconds;
    end_s: Seconds;
    label?: string;
    clarity?: number;
    automatic?: boolean;
    userId?: number;
    positions?: ApiTrackPosition[];
    message?: string;
  };
  algorithm?: Object | Array<number>;
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
