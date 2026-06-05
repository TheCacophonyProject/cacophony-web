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
import { canonicalLatLng } from "@models/util/locationUtils.js";

export function isLatLng(
  point: { coordinates: [number, number] } | [number, number] | LatLng,
  shouldThrow = true,
) {
  let valid = true;
  if (typeof point !== "object") {
    valid = false;
    if (shouldThrow) {
      throw new Error(
        `Location ${JSON.stringify(point, null, 2)} is not valid.`,
      );
    }
  }
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
  } else if (typeof point === "object" && !Array.isArray(point)) {
    if ("coordinates" in point) {
      const coordinates = point.coordinates;
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
      !("lat" in point) ||
      !("lng" in point) ||
      typeof point.lat !== "number" ||
      typeof point.lng !== "number"
    ) {
      logger.warning("Invalid 1");
      valid = false;
    } else {
      // Okay
    }
  }
  if (!valid && shouldThrow) {
    throw new Error(`Location ${JSON.stringify(point, null, 2)} is not valid.`);
  }
  if (valid) {
    const location = canonicalLatLng(
      point as LatLng | { coordinates: [number, number] } | [number, number],
    );
    if (
      location.lat < -90 ||
      90 < location.lat ||
      location.lng < -180 ||
      180 <= location.lng
    ) {
      logger.warning("Location out of bounds %s", point);
      valid = false;
    }
  }
  if (!valid && shouldThrow) {
    throw new Error(`Location ${JSON.stringify(point, null, 2)} is not valid.`);
  }
  return valid;
}
