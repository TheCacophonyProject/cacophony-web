import { computed } from "vue";
import { currentSelectedProject } from "@models/LoggedInUser.ts";
import {
  AudioRecordingLabels,
  CameraRecordingLabels,
  CommonRecordingLabels,
} from "@/consts.ts";
import type { RecordingLabel } from "@typedefs/api/group";

export const CurrentProjectCameraLabels = computed<RecordingLabel[]>(() => {
  if (currentSelectedProject.value) {
    if (
      currentSelectedProject.value.settings?.cameraLabels &&
      currentSelectedProject.value.settings.cameraLabels.length
    ) {
      return [
        ...CommonRecordingLabels,
        ...currentSelectedProject.value.settings.cameraLabels,
      ];
    }
  }
  return [...CommonRecordingLabels, ...CameraRecordingLabels];
});

export const CurrentProjectAudioLabels = computed<RecordingLabel[]>(() => {
  if (currentSelectedProject.value) {
    if (
      currentSelectedProject.value.settings?.audioLabels &&
      currentSelectedProject.value.settings.audioLabels.length
    ) {
      return [
        ...CommonRecordingLabels,
        ...currentSelectedProject.value.settings.audioLabels,
      ];
    }
  }
  return [...CommonRecordingLabels, ...AudioRecordingLabels];
});
