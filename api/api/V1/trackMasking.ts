import type { DeviceId, GroupId } from "@typedefs/api/common.js";
import type { TrackFramePosition } from "@typedefs/api/fileProcessing.js";
import type { MaskRegion } from "@typedefs/api/device.js";
import earcut from "earcut";
import { Op } from "sequelize";
import type { ModelsDictionary } from "@models";
type ArrayPt = [number, number];
export const trackIsMasked = async (
  models: ModelsDictionary,
  deviceId: DeviceId,
  groupId: GroupId,
  atTime: Date,
  trackPositions: TrackFramePosition[]
): Promise<boolean> => {
  // NOTE: When track is created, we need to check against any
  //  mask regions set on the device at the time of the recording.
  const deviceHistoryEntry = await models.DeviceHistory.findOne({
    where: {
      DeviceId: deviceId,
      GroupId: groupId,
      location: { [Op.ne]: null },
      fromDateTime: { [Op.lte]: atTime },
    },
    order: [["fromDateTime", "DESC"]],
  });
  if (deviceHistoryEntry && deviceHistoryEntry.settings && deviceHistoryEntry.settings.maskRegions) {
    const sign = (
      p1: [number, number],
      p2: [number, number],
      p3: [number, number]
    ): number => {
      return (
        (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
      );
    };
    const pointInTriangle = (
      triangle: [[number, number], [number, number], [number, number]],
      point: [number, number]
    ): boolean => {
      const d1 = sign(point, triangle[0], triangle[1]);
      const d2 = sign(point, triangle[1], triangle[2]);
      const d3 = sign(point, triangle[2], triangle[0]);

      const has_neg = d1 < 0 || d2 < 0 || d3 < 0;
      const has_pos = d1 > 0 || d2 > 0 || d3 > 0;

      return !(has_neg && has_pos);
    };
    const WIDTH = 160;
    const HEIGHT = 120;
    const mask = new Uint8Array(WIDTH * HEIGHT);
    for (const [_regionName, region] of Object.entries(
      deviceHistoryEntry.settings.maskRegions
    ) as [string, MaskRegion][]) {
      const pairwisePoints = region.regionData.map(({ x, y }) => [
        x,
        y,
      ]) as ArrayPt[];
      const points = pairwisePoints.reduce((a, b) => a.concat(b), []);
      const triangles = earcut(points);
      const tris = [];
      for (let i = 0; i < triangles.length; i += 3) {
        const triangle: [ArrayPt, ArrayPt, ArrayPt] = [
          pairwisePoints[triangles[i]],
          pairwisePoints[triangles[i + 1]],
          pairwisePoints[triangles[i + 2]],
        ];
        tris.push(triangle);
      }
      // Rasterising the shape into the mask buffer
      for (let y = 0; y < HEIGHT; y++) {
        const yy = y / HEIGHT;
        for (let x = 0; x < WIDTH; x++) {
          // Normalise pt to 0..1
          const pt: ArrayPt = [x / WIDTH, yy];
          for (const triangle of tris) {
            if (pointInTriangle(triangle, pt)) {
              const index = y * 160 + x;
              mask[index] = 1;
            }
          }
        }
      }
    }

    // Now go through the track boxes and compare against the mask
    // First pass, check if the center of the track is *ever* outside the mask region.
    let maskedPositions = 0;
    for (const position of trackPositions) {
      const { x, y, width, height } = position;
      // NOTE: For the initial cut of this, let's just track the bounding box centers against the mask.
      const cX = Math.round(x + width * 0.5);
      const cY = Math.round(y + height * 0.5);
      const index = cY * 160 + cX;
      if (mask[index] !== 0) {
        maskedPositions += 1;
      }
    }
    // if (region.alertOnEnter) {
    // TODO: We might want to send an email alert the first time we see a track enter this region (and not exit?)
    // }
    return maskedPositions === trackPositions.length;
  }
  return false;
};
