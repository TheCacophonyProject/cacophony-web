import models from "@models";
import {Device, DeviceId} from "@models/Device";
import { Event } from "@models/Event";

import { QueryOptions } from "@models/Event";
import { groupSystemErrors } from "./systemError";
import moment, { Moment } from "moment";
import logger from "@log";
import { IsoFormattedDateString } from "@/../types/api/common";
export const errors = async (
  request: {
    query: {
      limit?: number,
      offset?: number,
      startTime?: IsoFormattedDateString,
      endTime?: IsoFormattedDateString,
      deviceId?: DeviceId,
    };
    res: any
  },
  admin?: boolean
) => {
  const query = request.query;
  const options = {
    eventType: "systemError",
    admin: admin === true,
    useCreatedDate: true
  } as QueryOptions;

  const result = await models.Event.query(
    request.res.locals.requestUser.id,
    query.startTime,
    query.endTime,
    query.deviceId,
    query.offset,
    query.limit,
    false,
    options
  );

  return groupSystemErrors(result.rows);
};

export async function powerEventsPerDevice(
  request: { query: any; res: any },
  admin?: boolean
): Promise<PowerEvents[]> {
  const query = request.query;
  const options = {} as QueryOptions;
  options.eventType = ["rpi-power-on", "daytime-power-off", "stop-reported"];
  options.admin = admin === true;
  options.useCreatedDate = false;
  const result = await models.Event.latestEvents(
    request.res.locals.requestUser.id,
    query.deviceId,
    options
  );
  const deviceEvents = {};
  for (const event of result) {
    if (deviceEvents.hasOwnProperty(event.DeviceId)) {
      deviceEvents[event.DeviceId].update(event);
    } else {
      deviceEvents[event.DeviceId] = new PowerEvents(event);
    }
  }
  for (const id of Object.keys(deviceEvents)) {
    deviceEvents[id].checkIfStopped();
  }
  return Object.values(deviceEvents) as PowerEvents[];
}

export class PowerEvents {
  lastReported: Moment | null;
  lastStarted: Moment | null;
  lastStopped: Moment | null;
  Device: Device | null;
  hasStopped: boolean;
  hasAlerted: boolean;
  constructor(event: Event) {
    this.hasStopped = false;
    this.lastReported = null;
    this.lastStarted = null;
    this.lastStopped = null;
    this.hasAlerted = false;
    this.update(event);
  }
  update(event: Event) {
    if (!this.Device && event.Device) {
      this.Device = event.Device;
    }
    const eventDate = moment(event.dateTime);
    switch (event.EventDetail.type) {
      case "rpi-power-on":
        if (this.lastStarted == null || eventDate.isAfter(this.lastStarted)) {
          this.lastStarted = eventDate;
        }
        break;
      case "daytime-power-off":
        if (this.lastStopped == null || eventDate.isAfter(this.lastStopped)) {
          this.lastStopped = eventDate;
        }
        break;
      case "stop-reported":
        if (this.lastReported == null || eventDate.isAfter(this.lastReported)) {
          this.lastReported = eventDate;
        }
    }
  }
  checkIfStopped(): boolean {
    if (this.lastStarted == null) {
      this.hasStopped = false;
      return this.hasStopped;
    }

    // check that started hasn't occurred after stopped
    if (this.lastStopped == null) {
      // check that the started event was at least 12 hours ago
      this.hasStopped = moment().diff(this.lastStarted, "minutes") > 12 * 60;
    } else if (this.lastStarted.isAfter(this.lastStopped)) {
      //check we are at least 30 minutes after expected stopped time (based of yesterdays)
      this.hasStopped = moment().diff(this.lastStopped, "minutes") > 24.5 * 60;
    } else {
      // check it started in the last 24 hours
      this.hasStopped = moment().diff(this.lastStarted, "minutes") > 24 * 60;
    }

    // check if we have already reported this event
    if (this.hasStopped) {
      this.hasAlerted =
        this.lastReported != null &&
        this.lastReported.isAfter(this.lastStarted);
    }
    return this.hasStopped;
  }
}
