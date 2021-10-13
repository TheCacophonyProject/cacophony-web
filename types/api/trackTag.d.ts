import { IsoFormattedDateString, TrackId, TrackTagId, UserId } from "./common";

export interface ApiTrackTagRequest {
  what: string;
  confidence: number;
  automatic?: boolean;
  tagJWT?: string; // Allows tagging by someone without recording permissions.
}

interface ApiTrackTagResponse {
  what: string;
  id: TrackTagId;
  trackId: TrackId; // FIXME? Needed
  confidence: number;
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
