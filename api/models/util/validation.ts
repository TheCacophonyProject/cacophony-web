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
import { canonicalLatLng } from "@models/Group";
import { LatLng } from "@typedefs/api/common";

function isLatLon(
  point: { coordinates: [number, number] } | [number, number] | LatLng
) {
  let valid = true;
  if (point === null) {
    valid = false;
    throw new Error("Location is not valid A.");
  } else if (
    Array.isArray(point) &&
    (point.length !== 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number")
  ) {
    valid = false;
    throw new Error("Location is not valid B.");
  } else if (typeof point === "object") {
    if (point.hasOwnProperty("coordinates")) {
      const coordinates = (point as any).coordinates;
      if (!Array.isArray(coordinates)) {
        valid = false;
        throw new Error("Location is not valid C.");
      }
      if (
        Array.isArray(coordinates) &&
        (coordinates.length !== 2 ||
          typeof coordinates[0] !== "number" ||
          typeof coordinates[1] !== "number")
      ) {
        valid = false;
        throw new Error("Location is not valid D.");
      }
    } else if (
      !point.hasOwnProperty("lat") ||
      !point.hasOwnProperty("lng") ||
      typeof (point as any).lat !== "number" ||
      typeof (point as any).lng !== "number"
    ) {
      valid = false;
      throw new Error("Location is not valid E.");
    } else {
      // Okay
    }
  }
  const location = canonicalLatLng(point);
  if (
    location.lng < -90 ||
    90 < location.lng ||
    location.lat < -180 ||
    180 <= location.lat
  ) {
    valid = false;
    throw new Error(`Location is not valid F. ${JSON.stringify(location)}`);
  }
  if (!valid) {
    throw new Error("Location is not valid G.");
  }
}

export default { isLatLon };
