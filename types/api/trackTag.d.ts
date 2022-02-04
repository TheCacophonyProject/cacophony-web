import { IsoFormattedDateString, TrackId, TrackTagId, UserId } from "./common";

export interface ApiTrackTagRequest {
  what: string;
  confidence: number;
  automatic?: boolean;
  tagJWT?: string; // Allows tagging by someone without recording permissions.
  data?: any; // FIXME - validation?
}

interface ApiTrackTagResponse {
  what: string;
  id: TrackTagId;
  trackId: TrackId;
  confidence: number;
  automatic: boolean;
  data: any; // FIXME - validation?
  createdAt?: IsoFormattedDateString;
  updatedAt?: IsoFormattedDateString;
  archivedAt?: IsoFormattedDateString; // FIXME - is this used?
}

export interface ApiHumanTrackTagResponse extends ApiTrackTagResponse {
  automatic: false;
  userId: UserId;
  userName: string;
}

export interface ApiAutomaticTrackTagResponse extends ApiTrackTagResponse {
  automatic: true;
}
