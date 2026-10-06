import type { ApiDeviceHistorySettings } from "@typedefs/api/device";
import type { LoadedResource } from "@apiClient/types.ts";

export const recordingWindowDescriptionForSettings = (
  settings: LoadedResource<ApiDeviceHistorySettings>,
  verb = "Record",
): string | null => {
  if (settings) {
    // Device records 24/7 if power-on time is non-relative and is set to the same as power off time.
    let recordings24hrs = false;
    const start = settings.windows?.startRecording || "-30m";
    const end = settings.windows?.stopRecording || "+30m";
    if (!start.endsWith("m") || !end.endsWith("m")) {
      recordings24hrs = start === end;
    }
    if (recordings24hrs) {
      return `${verb} 24/7`;
    }
    let startTime;
    let endTime;
    if (start.startsWith("+") || start.startsWith("-")) {
      // Relative start time to sunset
      const beforeAfter = start.startsWith("-") ? "before" : "after";
      startTime = `${start.slice(1)}ins ${beforeAfter} sunset`;
    } else {
      // Absolute start time
      startTime = start; // Do am/pm?
    }
    if (end.startsWith("+") || end.startsWith("-")) {
      // Relative end time to sunrise
      const beforeAfter = end.startsWith("-") ? "before" : "after";
      endTime = `${end.slice(1)}ins ${beforeAfter} sunrise`;
    } else {
      // Absolute end time
      endTime = end;
    }
    return `${verb} from ${startTime} until ${endTime}`;
  }
  return null;
};
