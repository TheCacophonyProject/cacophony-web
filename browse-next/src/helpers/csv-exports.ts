import type { ApiStaticVisitResponse } from "@typedefs/api/visit";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import {
  dayAndTimeAtLocation,
  formatDuration,
  visitDuration,
} from "@models/visitsUtils.ts";
import { displayLabelForClassificationLabel } from "@api/classificationsUtils.ts";
import { type NonEmptyArray, upperFirst } from "@/helpers/utils.ts";
import type {
  ApiAudioRecordingResponse,
  ApiRecordingResponse,
} from "@typedefs/api/recording";
import { ActivitySearchRecordingMode } from "@/components/activitySearchUtils.ts";
import {
  aiTagsForRecording,
  canonicalTagsForRecording,
  humanTagsForRecording,
} from "@models/recordingUtils.ts";

const arrayToCsv = (data: string[][]) => {
  return data
    .map(
      (row) =>
        row
          .map(String) // convert every value to String
          .map((v) => v.replaceAll(`"`, `""`)) // escape double quotes
          .map((v) => `"${v}"`) // quote it
          .join(","), // comma-separated
    )
    .join("\r\n"); // rows starting on new lines
};

export const createVisitsCsv = (
  data: ApiStaticVisitResponse[],
  locations: ApiLocationResponse[] = [],
): string => {
  const csv = [
    [
      "Location",
      "Start time",
      "End time",
      "Local start time",
      "Local end time",
      "Duration",
      "Visit classification",
      "Classified by",
      "# Recordings",
    ],
  ];
  for (const visit of data) {
    const classificationAgreesWithAi =
      visit.aiClassification === visit.humanClassification;
    const classificationType = visit.humanClassification
      ? classificationAgreesWithAi
        ? "User & AI"
        : "User"
      : visit.aiClassification
        ? "AI"
        : "unknown";
    const location = locations.find(({ id }) => id === visit.locationId);
    if (location) {
      const classification =
        visit.humanClassification || visit.aiClassification;
      csv.push([
        visit.locationName,
        visit.startTime,
        visit.endTime,
        dayAndTimeAtLocation(visit.startTime, location.location),
        dayAndTimeAtLocation(visit.endTime, location.location),
        visitDuration(visit).replace("&nbsp;", " "),
        upperFirst(
          (classification &&
            displayLabelForClassificationLabel(
              classification,
              visit.humanClassification === null,
            )) ||
            "none",
        ),
        classificationType,
        (visit.recordingIds?.length || 0).toString(),
      ]);
    }
  }
  return arrayToCsv(csv);
};

export const createRecordingsCsv = (
  data: ApiRecordingResponse[],
  locations: ApiLocationResponse[] = [],
  isAudioMode: boolean,
): string => {
  // TODO: More columns as needed
  const csv: NonEmptyArray<string[]> = [
    [
      "Location",
      "Latitude/Longitude",
      "Device name",
      "Time",
      "Local time",
      "Duration",
      "Canonical classification",
      "Human classification",
      "AI classification",
      "Labels",
    ],
  ];
  if (isAudioMode) {
    csv[0].push("Cacophony Index");
  }
  for (const recording of data) {
    const location = locations.find(({ id }) => id === recording.stationId);
    const canonicalTags = canonicalTagsForRecording(recording);
    const aiTags = aiTagsForRecording(recording);
    const humanTags = humanTagsForRecording(recording);
    const displaysCanonical = [];
    const displaysAI = [];
    const displaysHuman = [];
    const labels = recording.tags.map((tag) => tag.detail);
    for (const tag of canonicalTags) {
      const display = displayLabelForClassificationLabel(
        tag.what,
        tag.automatic && !tag.human,
        isAudioMode,
      );
      displaysCanonical.push(
        `${upperFirst(display)}${tag.count > 1 ? ` (${tag.count})` : ""}`,
      );
    }
    for (const tag of aiTags) {
      const display = displayLabelForClassificationLabel(
        tag.what,
        tag.automatic && !tag.human,
        isAudioMode,
      );
      displaysAI.push(
        `${upperFirst(display)}${tag.count > 1 ? ` (${tag.count})` : ""}`,
      );
    }
    for (const tag of humanTags) {
      const display = displayLabelForClassificationLabel(
        tag.what,
        tag.automatic && !tag.human,
        isAudioMode,
      );
      displaysHuman.push(
        `${upperFirst(display)}${tag.count > 1 ? ` (${tag.count})` : ""}`,
      );
    }
    const row = [
      recording.stationName || "unknown",
      (recording.location &&
        `${recording.location?.lat}, ${recording.location?.lng}`) ||
        "unknown",
      recording.deviceName,
      recording.recordingDateTime,
      (location &&
        dayAndTimeAtLocation(recording.recordingDateTime, location.location)) ||
        "unknown",
      formatDuration(recording.duration * 1000).replace("&nbsp;", " "),
      displaysCanonical.join(", "),
      displaysHuman.join(", "),
      displaysAI.join(", "),
      labels.join(", "),
    ];
    if (isAudioMode) {
      row.push(
        ((recording as ApiAudioRecordingResponse).cacophonyIndex || [])
          .map((index: { index_percent: number }) => index.index_percent)
          .join(", "),
      );
    }
    csv.push(row);
  }
  return arrayToCsv(csv);
};
