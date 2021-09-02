import { IsoFormattedDateString } from "./common";

export type EventDates = IsoFormattedDateString[];

export interface EventDescription {
  type: string;
  details?: any;
}
