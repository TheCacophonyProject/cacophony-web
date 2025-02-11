import { computed } from "vue";
import { currentSelectedProject } from "@models/LoggedInUser.ts";
import {
  DEFAULT_AUDIO_RECORDING_LABELS,
  DEFAULT_CAMERA_RECORDING_LABELS,
  COMMON_RECORDING_LABELS,
} from "@/consts.ts";
import type { RecordingLabel } from "@typedefs/api/group";

export const CurrentProjectCameraLabels = computed<RecordingLabel[]>(() => {
  if (currentSelectedProject.value) {
    if (
      currentSelectedProject.value.settings?.cameraLabels &&
      currentSelectedProject.value.settings.cameraLabels.length
    ) {
      return [
        ...COMMON_RECORDING_LABELS,
        ...currentSelectedProject.value.settings.cameraLabels,
      ];
    }
  }
  return [...COMMON_RECORDING_LABELS, ...DEFAULT_CAMERA_RECORDING_LABELS];
});

export const CurrentProjectAudioLabels = computed<RecordingLabel[]>(() => {
  if (currentSelectedProject.value) {
    if (
      currentSelectedProject.value.settings?.audioLabels &&
      currentSelectedProject.value.settings.audioLabels.length
    ) {
      return [
        ...COMMON_RECORDING_LABELS,
        ...currentSelectedProject.value.settings.audioLabels,
      ];
    }
  }
  return [...COMMON_RECORDING_LABELS, ...DEFAULT_AUDIO_RECORDING_LABELS];
});
