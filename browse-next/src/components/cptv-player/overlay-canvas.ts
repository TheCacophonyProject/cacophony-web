import type { TrackId } from "@typedefs/api/common";
import type {
  IntermediateTrack,
  TrackBox,
  TrackExportOption,
} from "@/components/cptv-player/cptv-player-types";
import { TagColours } from "@/consts";
import type { MotionPath } from "@/components/cptv-player/motion-paths";
import type {
  FrameNum,
  Rectangle,
} from "@/components/cptv-player/cptv-player-types";
import type { ApiTrackResponse } from "@typedefs/api/track";
import { add, mul, perp } from "@/components/cptv-player/motion-paths";
import { displayLabelForClassificationLabel } from "@api/Classifications";

export const setLabelFontStyle = (overlayContext: CanvasRenderingContext2D) => {
  overlayContext.font = "13px sans-serif";
  overlayContext.lineWidth = 4;
  overlayContext.strokeStyle = "rgba(0, 0, 0, 0.5)";
  overlayContext.lineJoin = "round";
  overlayContext.fillStyle = "white";
};

export const drawBottomRightOverlayLabel = (
  label: string | false,
  overlayContext: CanvasRenderingContext2D | null,
  scale: number
) => {
  if (label && overlayContext) {
    setLabelFontStyle(overlayContext);
    const bottomPadding = 10;
    const sidePadding = 10;
    const labelWidth = overlayContext.measureText(label).width * scale;
    overlayContext.strokeText(
      label,
      (overlayContext.canvas.width - (labelWidth + sidePadding * scale)) /
        scale,
      (overlayContext.canvas.height - bottomPadding * scale) / scale
    );
    overlayContext.fillText(
      label,
      (overlayContext.canvas.width - (labelWidth + sidePadding * scale)) /
        scale,
      (overlayContext.canvas.height - bottomPadding * scale) / scale
    );
  }
};

export const drawBottomLeftOverlayLabel = (
  label: string | null,
  overlayContext: CanvasRenderingContext2D | null,
  scale: number
) => {
  if (label && overlayContext) {
    setLabelFontStyle(overlayContext);
    const bottomPadding = 10;
    const sidePadding = 10;
    overlayContext.strokeText(
      label,
      sidePadding,
      (overlayContext.canvas.height - bottomPadding * scale) / scale
    );
    overlayContext.fillText(
      label,
      sidePadding,
      (overlayContext.canvas.height - bottomPadding * scale) / scale
    );
  }
};

export const clearOverlay = (
  overlayContext: CanvasRenderingContext2D | null
): boolean => {
  if (overlayContext) {
    overlayContext.clearRect(
      0,
      0,
      overlayContext.canvas.width,
      overlayContext.canvas.height
    );
    return true;
  }
  return false;
};

export const drawRectWithText = (
  context: CanvasRenderingContext2D,
  trackId: number,
  dims: Rectangle,
  what: string | null,
  isExporting: boolean,
  tracks: IntermediateTrack[] | ApiTrackResponse[] = [],
  currentTrack: ApiTrackResponse | undefined,
  pixelRatio: number,
  scale: number,
  restrictedHeight?: number
) => {
  context.save();
  const selected = currentTrack?.id === trackId || isExporting;
  const trackIndex = tracks.findIndex((track) => track.id === trackId) || 0;
  const lineWidth = selected ? 2 : 1;
  const outlineWidth = lineWidth + 4;
  const halfOutlineWidth = outlineWidth / 2;
  const deviceRatio = isExporting ? 1 : pixelRatio;
  const [left, top, right, bottom] = dims.map((x) => x * scale * pixelRatio);
  const rectWidth = right - left;
  const rectHeight = bottom - top;
  const contextHeight = restrictedHeight || context.canvas.height;
  const yOffset = restrictedHeight
    ? (context.canvas.height - restrictedHeight) * 0.5
    : 0;
  const x =
    Math.max(halfOutlineWidth, Math.round(left) - halfOutlineWidth) /
    deviceRatio;
  const y =
    Math.max(
      halfOutlineWidth,
      Math.round(top + yOffset) - halfOutlineWidth,
      yOffset + halfOutlineWidth
    ) / deviceRatio;
  const width =
    Math.min(
      context.canvas.width - (x + halfOutlineWidth),
      Math.round(Math.min(context.canvas.width - left, Math.round(rectWidth)))
    ) / deviceRatio;
  const height =
    Math.min(
      contextHeight - (y - yOffset + halfOutlineWidth),
      Math.round(Math.min(contextHeight - top, Math.round(rectHeight)))
    ) / deviceRatio;
  context.lineJoin = "round";
  context.lineWidth = outlineWidth;
  context.strokeStyle = `rgba(0, 0, 0, ${selected ? 0.4 : 0.5})`;
  context.beginPath();
  context.strokeRect(x, y, width, height);
  context.strokeStyle = TagColours[trackIndex % TagColours.length].background;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.strokeRect(x, y, width, height);
  if (selected || isExporting) {
    // If exporting, show all the best guess animal tags, if not unknown
    if (what !== null) {
      const text = what;
      const textHeight = 9 * deviceRatio;
      const textWidth = context.measureText(text).width * deviceRatio;
      const marginX = 2 * deviceRatio;
      const marginTop = 2 * deviceRatio;
      let textX = Math.min(context.canvas.width, right) - (textWidth + marginX);
      let textY = yOffset + bottom + textHeight + marginTop;
      //debugger;
      // Make sure the text doesn't get clipped off if the box is near the frame edges
      if (textY + textHeight > contextHeight + yOffset) {
        textY = yOffset + top - textHeight;
      }
      if (textX < 0) {
        textX = left + marginX;
      }
      context.font = "13px sans-serif";
      context.lineWidth = 4;
      context.strokeStyle = "rgba(0, 0, 0, 0.5)";
      context.strokeText(text, textX / deviceRatio, textY / deviceRatio);
      context.fillStyle = "white";
      context.fillText(text, textX / deviceRatio, textY / deviceRatio);
    }
  }
  context.restore();
};

export const renderOverlay = (
  context: CanvasRenderingContext2D | null,
  scale: number,
  timeSinceFFCSeconds: number | null,
  isExporting: boolean,
  frameNum: number,
  tracks: IntermediateTrack[],
  canSelectTracks: boolean,
  currentTrack: ApiTrackResponse | undefined,
  motionPaths: MotionPath[],
  pixelRatio: number,
  tracksByFrame: Record<FrameNum, [TrackId, TrackBox][]>,
  framesByTrack: Record<TrackId, Record<FrameNum, TrackBox>>,
  trackExportOptions: TrackExportOption[]
) => {
  if (context) {
    if (!isExporting) {
      // Clear if we are drawing on the live overlay, but not if we're drawing for export
      clearOverlay(context);
    }
    const frameTracks =
      tracksByFrame[frameNum] || ([] as [TrackId, TrackBox][]);
    for (const [trackId, trackBox] of frameTracks.filter(
      ([trackId]) =>
        trackId !== currentTrack?.id &&
        (!trackExportOptions.length ||
          trackExportOptions.find((options) => options.trackId === trackId)
            ?.displayInExport)
    )) {
      drawRectWithText(
        context,
        trackId,
        trackBox.rect,
        trackBox.what && displayLabelForClassificationLabel(trackBox.what),
        isExporting,
        tracks,
        currentTrack,
        pixelRatio,
        scale
      );
    }
    // Always draw selected track last, so it sits on top of any overlapping tracks.
    if (currentTrack && framesByTrack[currentTrack.id]) {
      const trackBox = framesByTrack[currentTrack.id][frameNum];
      if (
        trackBox &&
        (!trackExportOptions.length ||
          trackExportOptions.find(
            (options) => options.trackId === currentTrack.id
          )?.displayInExport)
      ) {
        drawRectWithText(
          context,
          currentTrack.id,
          trackBox.rect,
          trackBox.what && displayLabelForClassificationLabel(trackBox.what),
          isExporting,
          tracks,
          currentTrack,
          pixelRatio,
          scale
        );
      }
    }
    context.save();

    for (let i = 0; i < motionPaths.length; i++) {
      renderMotionPath(
        context,
        motionPaths[i],
        TagColours[i % TagColours.length].background
      );
    }
    context.restore();

    if (timeSinceFFCSeconds !== null && timeSinceFFCSeconds < 10) {
      context.font = "bold 15px Verdana";

      // NOTE: Make opacity of text stronger when the FFC event has just happened, then fade out
      let a = 1 / (10 - timeSinceFFCSeconds);
      a = a * a;
      const alpha = 1 - a;
      context.fillStyle = `rgba(163, 210, 226, ${alpha})`;

      const text = "Calibrating...";
      const textWidth = context.measureText(text).width;
      const deviceRatio = isExporting ? 1 : window.devicePixelRatio;
      const textX = context.canvas.width / deviceRatio / 2 - textWidth / 2;
      const textY = 20;
      context.fillText(text, textX, textY);
    }
  }
};

const renderMotionPath = (
  context: CanvasRenderingContext2D,
  path: MotionPath,
  color: string
) => {
  // Here's a nice example motion track: #1301155

  // Here's a good example of a track starting late: #1295324

  // TODO - Can we scale the motion path based on how big the track box is
  //  compared to its min/max sizes.  Area scales quadratically with distance from the camera, right?

  // TODO - Can we try onion-skinning the actual track box bitmaps together?  Basically an average of the entire video?
  //const trackIndex =
  //  tracks.findIndex((track) => track.id === trackToDraw.id) || 0;

  const curve = path.curve;
  context.strokeStyle = color;
  context.globalAlpha = 0.6;
  context.beginPath();
  context.moveTo(curve[0].startPoint.x, curve[0].startPoint.y);
  for (const segment of curve) {
    context.bezierCurveTo(
      segment.controlPoints[0].x,
      segment.controlPoints[0].y,
      segment.controlPoints[1].x,
      segment.controlPoints[1].y,
      segment.endPoint.x,
      segment.endPoint.y
    );
  }

  context.stroke();
  // Draw an arrow head at the end.
  context.beginPath();
  context.fillStyle = color;
  const endTangent = path.tangents[1];
  const endPoint = curve[curve.length - 1].endPoint; //sub(curve[curve.length - 1].endPoint, mul(endTangent, 1));

  context.moveTo(endPoint.x, endPoint.y);
  const futurePoint = add(endPoint, mul(endTangent, 10));
  const leftPoint = add(endPoint, mul(perp(endTangent), 5));
  const rightPoint = add(endPoint, mul(perp(perp(perp(endTangent))), 5));
  context.moveTo(futurePoint.x, futurePoint.y);
  context.lineTo(leftPoint.x, leftPoint.y);
  context.lineTo(rightPoint.x, rightPoint.y);
  context.lineTo(futurePoint.x, futurePoint.y);

  context.fill();
  // for (const segment of path) {
  //   context.beginPath();
  //   context.fillStyle = "white";
  //   const point = segment.endPoint;
  //   context.ellipse(point.x, point.y, 2, 2, 0, 0, Math.PI * 2);
  //   context.fill();
  // }

  // context.globalAlpha = 0.3;
  // for (const point of allPoints) {
  //   context.beginPath();
  //   context.fillStyle =
  //     TagColours[trackIndex % TagColours.length].background;
  //   context.ellipse(point.x, point.y, 2, 2, 0, 0, Math.PI * 2);
  //   context.fill();
  // }
};
