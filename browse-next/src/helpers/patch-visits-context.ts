import type { LocationId, ProjectId, RecordingId } from "@typedefs/api/common";
import { ClientApi } from "@/api";
import type { ApiStaticVisitResponse } from "@typedefs/api/visit";
import type { Ref } from "vue";
import { visitClassificationLabel } from "@models/visitsUtils.ts";
import router from "@/router";
import type {
  RouteLocation,
  RouteLocationRaw,
  RouteParamsRawGeneric,
} from "vue-router";

export const recordingUpdatedInVisitsContext = async (
  recordingId: RecordingId,
  action: "deleted" | "updated",
  newClassification: string | undefined,
  oldClassification: string | undefined,
  selectedVisit: Ref<ApiStaticVisitResponse | null>,
  visitsContextArray: Ref<ApiStaticVisitResponse[]>,
  route: RouteLocation,
  projectId: ProjectId,
  locations: LocationId[] = [],
) => {
  // If we're in visits mode, let's patch our visits array.
  // First, grab the new visits for this recording:

  const prevVisit = selectedVisit.value as ApiStaticVisitResponse;
  let nextVisit: ApiStaticVisitResponse | null = null;
  let nextRecordingId: RecordingId = recordingId;
  let nextDirection: "forward" | "backward" = "forward";
  if (action === "updated") {
    const newVisits = ((await ClientApi.Visits.getVisitsForRecording(
      recordingId,
    )) || []) as ApiStaticVisitResponse[];
    let newSelectedVisit: ApiStaticVisitResponse | undefined;
    const selectedVisitIndexInContext =
      visitsContextArray.value.indexOf(prevVisit);
    // Of the new visits, which is the one that matches our old context?
    if (newVisits.length === 1) {
      newSelectedVisit = newVisits[0];
    } else if (newClassification) {
      // We added a new human classification, so look for the visit that has that classification
      newSelectedVisit = newVisits.find(
        (v) =>
          v.humanClassification &&
          v.humanClassification.split(".").pop() === newClassification,
      );
    } else {
      // We removed a human classification, so how do we tell which new visit should match our selected context?
      // FIXME: Add a test for this.
      newSelectedVisit = newVisits[0];
    }
    if (newSelectedVisit) {
      nextVisit = newSelectedVisit;
    }
    const affectedVisits = visitsContextArray.value.filter((v) =>
      v.recordingIds.includes(recordingId),
    );
    if (affectedVisits.length === 1 && newVisits.length === 1) {
      const index = visitsContextArray.value.indexOf(affectedVisits[0]);
      visitsContextArray.value[index] = newVisits[0];
    } else {
      // We're updating a split visit.
      if (affectedVisits.length === newVisits.length) {
        for (let i = 0; i < affectedVisits.length; i++) {
          const index = visitsContextArray.value.indexOf(affectedVisits[i]);
          visitsContextArray.value[index] = newVisits[i];
        }
      } else if (newVisits.length > affectedVisits.length) {
        let lastIndex = 0;
        for (let i = 0; i < affectedVisits.length; i++) {
          lastIndex = visitsContextArray.value.indexOf(affectedVisits[i]);
          visitsContextArray.value[lastIndex] = newVisits[i];
        }
        for (let i = affectedVisits.length; i < newVisits.length; i++) {
          visitsContextArray.value.splice(lastIndex, 0, newVisits[i]);
          lastIndex += 1;
        }
      } else if (newVisits.length < affectedVisits.length) {
        for (let i = 0; i < newVisits.length; i++) {
          const index = visitsContextArray.value.indexOf(affectedVisits[i]);
          visitsContextArray.value[index] = newVisits[i];
        }
        for (let i = newVisits.length; i < affectedVisits.length; i++) {
          const index = visitsContextArray.value.indexOf(affectedVisits[i]);
          visitsContextArray.value.splice(index, 1);
        }
      }
    }
  } else if (action === "deleted") {
    console.assert(prevVisit !== null, "has previous visit");
    // Find other visits that shared recordings with the deleted recording id:
    const prevVisitIndex = visitsContextArray.value.indexOf(prevVisit);
    console.assert(
      prevVisitIndex !== -1,
      "previous visit exists in context array",
    );
    // TODO: Optimise this - could first search on either side of the prev visit for visits that share a recording
    //  with this one.  If they don't exist, stop searching.
    const prevVisitHadSingleRecording = prevVisit.recordingIds.length === 1;
    const laterVisit = visitsContextArray.value[prevVisitIndex - 1];
    const earlierVisit = visitsContextArray.value[prevVisitIndex + 1];
    const allAffectedVisits = visitsContextArray.value.filter((v) =>
      v.recordingIds.includes(recordingId),
    );
    const visitsWithMultipleRecordingsAreAffected = allAffectedVisits.some(
      (v) => v.recordingIds.length > 1,
    );

    // If previous visit had one recording, and no other visits share that recording...
    // Work out what the next visit index would be before mutating the array?
    if (
      prevVisitHadSingleRecording &&
      (!laterVisit || !laterVisit.recordingIds.includes(recordingId)) &&
      (!earlierVisit || !earlierVisit.recordingIds.includes(recordingId))
    ) {
      // Previous visit had one recording, and no other visits share that recording.
      // Therefore we don't need to fetch recalculated visits, just remove from context array
      // and set next visit.
      visitsContextArray.value.splice(prevVisitIndex, 1);
      nextVisit = laterVisit || earlierVisit || null;

      if (nextVisit && nextVisit === laterVisit) {
        // Moving forwards in time.
        nextRecordingId = nextVisit.recordingIds[0];
        nextDirection = "forward";
      } else if (nextVisit && nextVisit === earlierVisit) {
        nextRecordingId =
          nextVisit.recordingIds[nextVisit.recordingIds.length - 1];
        nextDirection = "backward";
      }
    } else if (!prevVisitHadSingleRecording) {
      // Now we need to fetch recalculated visit(s)
      console.assert(visitsWithMultipleRecordingsAreAffected);
      console.assert(allAffectedVisits.length);
      let minStart = new Date(allAffectedVisits[0].startTime).getTime();
      let maxEnd = new Date(allAffectedVisits[0].endTime).getTime();
      for (const visit of allAffectedVisits.slice(1)) {
        minStart = Math.min(minStart, new Date(visit.startTime).getTime());
        maxEnd = Math.max(maxEnd, new Date(visit.endTime).getTime());
      }
      const newVisits = ((await ClientApi.Visits.getVisitsForProject(
        projectId,
        new Date(minStart),
        new Date(maxEnd + 1000),
        locations,
      )) || []) as ApiStaticVisitResponse[];
      let lastIndex = 0;
      // Remove previous affected visits from context array
      for (const visit of allAffectedVisits) {
        const index = visitsContextArray.value.indexOf(visit);
        visitsContextArray.value.splice(index, 1);
        lastIndex = index;
      }
      // Add newly calculated visits in place
      visitsContextArray.value.splice(lastIndex, 0, ...newVisits);

      // Work out what the next visit should be.
      // Probably we want to stay in the same visit, since there were other recordings in the visit.
      // Work out which of the newVisits corresponds to the one we just deleted a recording from.
      // The visit could have been split.

      // Where in the previous visit was the recording deleted from?
      // If there was a next recording, we want to go to that one.
      // If there was only a previous recording, go to that.
      const thisRecordingIndex = prevVisit.recordingIds.indexOf(recordingId);

      if (thisRecordingIndex === 0) {
        // Next recording index is 1
        nextRecordingId = prevVisit.recordingIds[1];
      } else if (prevVisit.recordingIds[thisRecordingIndex + 1]) {
        nextRecordingId = prevVisit.recordingIds[thisRecordingIndex + 1];
      } else {
        nextRecordingId = prevVisit.recordingIds[thisRecordingIndex - 1];
      }

      // Find nextRecordingId in newVisits.
      const nextVisitCandidates = [];
      for (const visit of newVisits) {
        if (visit.recordingIds.includes(nextRecordingId)) {
          nextVisitCandidates.push(visit);
        }
      }
      if (nextVisitCandidates.length === 1) {
        nextVisit = nextVisitCandidates[0];
      } else if (nextVisitCandidates.length > 1) {
        // Take the visit candidate with the earliest start time, which should be the last one
        nextVisit = nextVisitCandidates[nextVisitCandidates.length - 1];
      }
    }
  }
  if (nextVisit) {
    selectedVisit.value = nextVisit;
    const params: Record<string, string> = {
      visitLabel: visitClassificationLabel(nextVisit) || "none",
      recordingIds: nextVisit.recordingIds.join(","),
      currentRecordingId: nextRecordingId!.toString(),
      projectName: route.params.projectName.toString(),
    };
    if (route.params.detail) {
      params.detail = "detail";
    }
    if (nextRecordingId === nextVisit.humanClassificationRecordingId) {
      params.trackId = nextVisit.humanClassificationTrackId!.toString();
    } else if (nextRecordingId === nextVisit.aiClassificationRecordingId) {
      params.trackId = nextVisit.aiClassificationTrackId!.toString();
    }
    return await router.replace({
      ...route,
      params,
      query: route.query,
    } as RouteLocationRaw);
  } else {
    // No more visits, return to parent context
    selectedVisit.value = null;
    const currentRoute = (route.name as string) || "";
    if (currentRoute.startsWith("activity-visit")) {
      return await router.push({
        name: "activity",
        query: route.query,
      } as RouteLocationRaw);
    } else if (currentRoute.startsWith("dashboard-visit")) {
      return await router.push({
        name: "dashboard",
        query: route.query,
      } as RouteLocationRaw);
    }
  }
};
