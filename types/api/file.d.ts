import { FileId, UserId } from "./common";

export interface AudiobaitDetails {
  name: string;
  sound: string;
  animal: string;
  source: string;
  description: string;
  originalName: string;
}

export interface ApiFileResponse {
  id: FileId;
  details: any;
  userId: UserId;
}

export interface ApiAudiobaitFileResponse extends ApiFileResponse {
  details: AudiobaitDetails;
}

export interface ApiAudiobaitFileRequest {
  details: AudiobaitDetails;
  file: any;
}
