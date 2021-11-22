import { ScheduleId, Seconds } from "./common";

export interface ScheduleConfig {
  combos: {
    from: string;
    until: string;
    every: Seconds;
    waits: number[];
    sounds: string[];
    volumes: number[];
  }[];
  startday: number;
  allsounds: number[];
  playNights: number;
  controlNights: number;
  description: string;
}

export interface ApiScheduleResponse {
  id: ScheduleId;
  schedule: ScheduleConfig;
}
