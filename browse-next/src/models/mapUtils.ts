import type { LatLng } from "@typedefs/api/common";

export interface NamedPoint {
  id?: number;
  name: string;
  group: string;
  location: LatLng;
}
