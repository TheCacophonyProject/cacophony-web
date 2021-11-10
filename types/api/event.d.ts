import { IsoFormattedDateString } from "./common";

export type EventDates = IsoFormattedDateString[];

export interface EventDescription {
  type: string; // Name of the type of event (required if description is included).
  details?: any; // Metadata of the event.
}
