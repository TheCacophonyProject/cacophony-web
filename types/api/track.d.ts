import {Seconds, TrackId} from "./common";
import {ApiAutomaticTrackTagResponse, ApiHumanTrackTagResponse} from "./trackTag";

export interface ApiTrackResponse {
    id: TrackId;
    start: Seconds;
    end: Seconds;
    tags: (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[];
}
