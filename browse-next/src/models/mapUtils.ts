import type { LatLng } from "@typedefs/api/common";

export interface NamedPoint {
  id?: number;
  name: string;
  project: string;
  location: LatLng;

  color?: string;
  radius?: number;
  type?: "station" | "device";
}
