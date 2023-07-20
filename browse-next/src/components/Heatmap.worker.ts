import type { ApiTrackResponse } from "@typedefs/api/track";
const processHeatmap = (tracks: ApiTrackResponse[]): Promise<Uint32Array> => {
  return new Promise((resolve) => {
    const map = new Uint32Array(160 * 120);
    for (const track of tracks) {
      if (track.positions) {
        //const temp = new Uint8Array(160 * 120);
        for (const position of track.positions) {
          // Create a sort of circle around the position, or just draw the square?
          // We could draw into a canvas if that helps?
          const halfW = position.width / 2;
          const halfH = position.height / 2;
          const centerX = position.x + halfH;
          const centerY = position.y + halfW;
          // Make the position square, pick the radius as the smallest of the sides.
          const radius = Math.min(halfW, halfH);
          const y1 = centerY + radius;
          const x1 = centerX + radius;
          const dSq = radius * radius;
          for (let y = position.y; y < y1; y++) {
            const row = y * 160;
            for (let x = position.x; x < x1; x++) {
              const xx1 = x - centerX;
              const yy1 = y - centerY;
              const xx = xx1 * xx1;
              const yy = yy1 * yy1;
              if (xx + yy < dSq) {
                map[row + x] += 1;
                //temp[index] = 1; // TODO - Maybe blend the 1 high blanket of the track outline as well.
              }
            }
          }
        }

        // for (let i = 0; i < temp.length; i++) {
        //   map[i] += temp[i];
        // }
      }
    }
    resolve(map);
  });
};

self.addEventListener("message", async (message) => {
  const heatmap = await processHeatmap(message.data.tracks);
  self.postMessage(heatmap);
});
self.postMessage({ type: "init" });
