import { FileId, UserId } from "./common";

export interface AudiobaitDetails {
  name: string;
  sound: string;
  animal: string;
  source: string;
  description: string;
  originalName: string;
}

export interface ApiFileResponse<T> {
  id: FileId;
  details: T;
  userId: UserId;
}

export type ApiAudiobaitFileResponse = ApiFileResponse<AudiobaitDetails>;

export interface ApiAudiobaitFileRequest {
  details: AudiobaitDetails;
  file: any;
}
