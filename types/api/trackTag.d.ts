import { IsoFormattedDateString, TrackId, TrackTagId, UserId } from "./common";

export interface ApiTrackTagRequest {
  what: string;
  confidence: number;
  automatic?: boolean;
  tagJWT?: string; // Allows tagging by someone without recording permissions.
  data?: any; // FIXME - validation?
}

export interface ApiTrackTagAttributes {
  gender?: "male" | "female" | null;
  maturity?: "juvenile" | "adult" | null;
}

export interface TrackTagData extends ApiTrackTagAttributes {
  name: string;
  all_class_confidences?: null | Record<string, number>;
  classify_time?: number;
  message?: string;
}

export interface ApiTrackTagResponse {
  what: string;
  id: TrackTagId;
  trackId: TrackId;
  confidence: number;
  automatic: boolean;
  data?: TrackTagData | string;
  createdAt?: IsoFormattedDateString;
  updatedAt?: IsoFormattedDateString;
  userId?: UserId;
  userName?: string;
  archivedAt?: IsoFormattedDateString; // FIXME - is this used?
}

export interface ApiHumanTrackTagResponse extends ApiTrackTagResponse {
  userId?: UserId;
  userName?: string;
  automatic: false;
}

export interface ApiAutomaticTrackTagResponse extends ApiTrackTagResponse {
  automatic: true;
}

export type Classification = {
  label: string;
  display?: string;
  children?: Classification[];
  path?: string | string[];
};
export interface ApiClassificationResponse {
  label: "root";
  version: number;
  children: Classification[];
}
