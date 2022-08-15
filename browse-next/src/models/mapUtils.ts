import type { LatLng } from "@typedefs/api/common";

export interface NamedPoint {
  name: string;
  group: string;
  location: LatLng;
}
