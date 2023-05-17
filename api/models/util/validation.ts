/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// Validate that input is a valid [longitude, latitude]
import type { LatLng } from "@typedefs/api/common.js";
import logger from "@log";
import {canonicalLatLng} from "@models/util/locationUtils.js";

export function isLatLon(
  point: { coordinates: [number, number] } | [number, number] | LatLng
) {
  let valid = true;
  if (point === null) {
    valid = false;
    logger.warning("Invalid 5");
  } else if (
    Array.isArray(point) &&
    (point.length !== 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number")
  ) {
    valid = false;
    logger.warning("Invalid 4");
  } else if (typeof point === "object") {
    if (point.hasOwnProperty("coordinates")) {
      const coordinates = (point as any).coordinates;
      if (!Array.isArray(coordinates)) {
        logger.warning("Invalid 3");
        valid = false;
      }
      if (
        Array.isArray(coordinates) &&
        (coordinates.length !== 2 ||
          typeof coordinates[0] !== "number" ||
          typeof coordinates[1] !== "number")
      ) {
        logger.warning("Invalid 2");
        valid = false;
      }
    } else if (
      !point.hasOwnProperty("lat") ||
      !point.hasOwnProperty("lng") ||
      typeof (point as any).lat !== "number" ||
      typeof (point as any).lng !== "number"
    ) {
      logger.warning("Invalid 1");
      valid = false;
    } else {
      // Okay
    }
  }
  const location = canonicalLatLng(point);
  if (
    location.lat < -90 ||
    90 < location.lat ||
    location.lng < -180 ||
    180 <= location.lng
  ) {
    logger.warning("Invalid 6 %s", location);
    valid = false;
  }
  if (!valid) {
    throw new Error("Location is not valid G.");
  }
}
