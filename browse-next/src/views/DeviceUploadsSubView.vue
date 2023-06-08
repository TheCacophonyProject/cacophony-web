<script lang="ts" setup>
import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch,
} from "vue";
import type { Ref, ComputedRef } from "vue";
import {
  activeLocations,
  allHistoricLocations,
  currentSelectedProject,
  selectedProjectDevices,
} from "@models/provides";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { useRoute } from "vue-router";
import type { DeviceId, LatLng } from "@typedefs/api/common";
import type { SelectedProject } from "@models/LoggedInUser";
import type { LoadedResource } from "@api/types";
import LocationPicker from "@/components/LocationPicker.vue";
import { getLocationsForProject } from "@api/Project.ts";
import Multiselect from "@vueform/multiselect";
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@models/mapUtils.ts";
import { createNewLocationForProject } from "@api/Location.ts";
import { uploadRecording } from "@api/Recording.ts";
import { DateTime } from "luxon";
import type { StationId as LocationId } from "@typedefs/api/common";
import { timezoneForLatLng } from "@models/visitsUtils.ts";
import { BProgressBar } from "bootstrap-vue-3";
import { delayMs } from "@/utils.ts";

// TODO: Keep track of which items have been uploaded in localstorage using sha1 hashes
// When upload completes, clear it.

// Prevent accidental navigation away while uploading.

// Uploads happen on main thread once workers are done.  We want to keep the workers busy,
// but not let the upload queue get too big.  So there needs to be back-pressure on the workers
// if the upload queue is more than our max concurrent uploads.

// 1. Upload items at current device location (or a previous location, pick from stations).
// 2. Upload items at a new location.

const devices = inject(selectedProjectDevices) as Ref<
  ApiDeviceResponse[] | null
>;
const project = inject(currentSelectedProject) as ComputedRef<
  SelectedProject | false
>;
const uploadFileInputForm = ref<HTMLFormElement>();
const fileSelectButton = ref<HTMLButtonElement>();
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      (devices.value as ApiDeviceResponse[]).find(
        (device: ApiDeviceResponse) => device.id === deviceId
      )) ||
    null
  );
});

const emit = defineEmits(["start-blocking-work", "end-blocking-work"]);

const dropFiles = ref<HTMLDivElement>();

interface UploadJob {
  file: FileSystemFileEntry | File;
  progress: number;
  type: "file" | "fileEntry";
}

const uploadErrors = ref<Record<string, number>>({});
const completedUploads = ref<number>(0);
const duplicateCount = ref<number>(0);
const totalUploads = ref<number>(0);
const uploadQueue = ref<UploadJob[]>([]);

const getAllFileEntries = async (
  dataTransferItemList: DataTransferItemList
): Promise<FileSystemFileEntry[]> => {
  const fileEntries: FileSystemFileEntry[] = [];
  const queue: FileSystemEntry[] = [];
  for (let i = 0; i < dataTransferItemList.length; i++) {
    const entry = dataTransferItemList[i].webkitGetAsEntry();
    entry && queue.push(entry);
  }
  while (queue.length > 0) {
    const entry = queue.shift() as FileSystemEntry;
    if (entry.isFile) {
      const ext = entry.name.toLowerCase().split(".").pop();
      if (ext && ["jpeg", "jpg", "mp4"].includes(ext)) {
        fileEntries.push(entry as FileSystemFileEntry);
      }
    } else if (entry.isDirectory) {
      queue.push(
        ...(await readAllDirectoryEntries(
          (entry as FileSystemDirectoryEntry).createReader()
        ))
      );
    }
  }
  return fileEntries;
};

const readAllDirectoryEntries = async (
  directoryReader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> => {
  const entries = [];
  let readEntries = await readEntriesPromise(directoryReader);
  while (readEntries.length > 0) {
    entries.push(...readEntries);
    readEntries = await readEntriesPromise(directoryReader);
  }
  return entries;
};

const readEntriesPromise = async (
  directoryReader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> => {
  return new Promise((resolve, reject) => {
    directoryReader.readEntries(resolve, reject);
  });
};

const filePromise = async (file: FileSystemFileEntry): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    file.file(resolve, reject);
  });
};

const uploadWorkers: Worker[] = [];
const onAddFiles = (e: Event, closerFn: () => void) => {
  const files = (e.target as HTMLInputElement).files;
  const sortedFiles = [];
  if (files) {
    for (let i = 0; i < files.length; i++) {
      sortedFiles.push(files.item(i) as File);
    }
  }
  sortedFiles.sort((a: File, b: File) => {
    return a.name > b.name ? 1 : -1;
  });
  for (const file of sortedFiles) {
    uploadQueue.value.push({
      progress: 0,
      file,
      type: "file",
    });
  }
  if (uploadQueue.value.length) {
    fileSelectButton.value?.click();
    closerFn();
  }
};

interface MessageData {
  threadIndex: number;
  type: string;
  data: any;
}

const messageQueue: Record<string, ((data: unknown) => void) | boolean>[] = [];
const waitForMessage = async (
  threadIndex: number,
  messageType: string
): Promise<unknown> => {
  return new Promise((resolve) => {
    messageQueue[threadIndex][messageType] = resolve;
  });
};

const startWork = (
  threadIndex: number,
  payload: { type: string; data: any }
): boolean => {
  if (!messageQueue[threadIndex].busy) {
    messageQueue[threadIndex].busy = true;
    uploadWorkers[threadIndex].postMessage(payload);
    return true;
  } else {
    return false;
  }
};

const someIdleWorkerSlot = async () => {
  const idlePromises = [];
  for (let i = 0; i < uploadWorkers.length; i++) {
    idlePromises.push(waitForMessage(i, "finish"));
  }
  return Promise.race(idlePromises);
};

const allWorkFinished = async () => {
  const finishedPromises = [];
  for (let i = 0; i < uploadWorkers.length; i++) {
    if (messageQueue[i].busy) {
      finishedPromises.push(waitForMessage(i, "finish"));
    }
  }
  return Promise.all(finishedPromises);
};

const distributeWork = async (job: UploadJob): Promise<boolean> => {
  const fileBlob =
    job.type === "file"
      ? (job.file as File)
      : await filePromise(job.file as FileSystemFileEntry);
  for (let i = 0; i < uploadWorkers.length; i++) {
    if (
      startWork(i, {
        type: "job",
        data: { file: fileBlob, fileName: job.file.name },
      })
    ) {
      //console.log("sent job to", i);
      return true;
    }
  }
  return false;
};

const createNewLocation = async (location: {
  name: string;
  location: LatLng;
}): Promise<ApiLocationResponse> => {
  const newLocation = await createNewLocationForProject(
    (project.value as SelectedProject).id,
    location.name,
    location.location,
    true
  );
  // TODO: Check that new location was successfully created, otherwise throw an error.
  // Reload projects
  previousLocations.value = await getLocationsForProject(
    (project.value as SelectedProject).id.toString()
  );
  return (previousLocations.value as ApiLocationResponse[]).find(
    (location) =>
      location.id === (newLocation as { locationId: LocationId }).locationId
  ) as ApiLocationResponse;
};

const uploadInProgress = ref<boolean>(false);
const beganUpload = ref<boolean>(false);

const resetUploadState = () => {
  totalUploads.value = 0;
  duplicateCount.value = 0;
  completedUploads.value = 0;
  uploadErrors.value = {};
  beganUpload.value = false;
};
const beginUploadJob = async () => {
  beganUpload.value = true;
  uploadInProgress.value = true;
  emit("start-blocking-work");
  let location: LatLng;
  if (existingOrNewLocation.value === "new-location") {
    // NOTE: If we need to create a new location, do that first.
    location = selectedLatLng.value.location;
    const locationResponse = await createNewLocation(selectedLatLng.value);
    //console.log("Created new location");
  } else {
    location = (selectedLocation.value as ApiLocationResponse).location;
  }

  totalUploads.value = uploadQueue.value.length;
  completedUploads.value = 0;
  const pendingUploadApiRequests = [];
  // Switch between canvas decode on main thread where offscreen canvas is not supported
  // vs offscreen canvas in a worker.
  // Create n-1 worker threads

  // TODO: Download OCR wasm + training set once, and pass to all workers.
  const numThreads = Math.min(
    navigator.hardwareConcurrency - 1,
    uploadQueue.value.length
  );
  for (let i = 0; i < numThreads; i++) {
    messageQueue[i] = {};
    const worker = new Worker(
      new URL("../components/ImageUpload.worker.ts", import.meta.url),
      {
        type: "module",
      }
    );
    await new Promise((resolve) => {
      worker.onmessage = (message) => {
        console.assert(message.data.type === "init");
        resolve(message);
      };
    });
    worker.onmessage = async (message: MessageEvent<MessageData>) => {
      const { type, data, threadIndex } = message.data;
      // console.log(type, data, threadIndex);
      // Type is only ever "finish"
      if (type === "finish") {
        if (data.success) {
          // We need to upload the job in question, and return a promise for that?
          // We need the location,
          // the device id,
          // the track filled out
          // the raw file
          // the derived file
          const recordingData = {
            fileHash: data.fileHash,
            location,
            type: "trailcam-image",
            duration: 3, // It's important that we lie and say the duration is > 2.5s, because we filter short recordings out.
            metadata: {
              // Dummy track
              algorithm: "empty-trailcam",
              tracks: [
                {
                  start_s: 0,
                  end_s: 1,
                  positions: [
                    {
                      x: 0,
                      y: 0,
                      width: 1,
                      height: 1,
                    },
                  ],
                  frame_start: 1,
                  frame_end: 1,
                  num_frames: 1,
                },
              ],
            },
            additionalMetadata: data.additionalMetadata,
            // FIXME The recordingDateTime should be in the local time, so convert based on location.
            recordingDateTime: DateTime.fromJSDate(data.recordingDateTime, {
              zone: timezoneForLatLng(location),
            })
              .toJSDate()
              .toISOString(),
          };
          //console.log("Meta", recordingData.additionalMetadata);
          // NOTE: We want back-pressure from the uploads queue.
          const recordingUploadResponse = await uploadRecording(
            (device.value as ApiDeviceResponse).id,
            recordingData,
            data.rawFile,
            data.rawFileName,
            data.derivedFile,
            data.derivedFileName,
            data.thumbFile,
            data.thumbFileName
          );
          if (recordingUploadResponse.success) {
            if (
              recordingUploadResponse.result.messages[0] ===
              "Duplicate recording found for device"
            ) {
              duplicateCount.value += 1;
            }
            completedUploads.value += 1;
          } else {
            completedUploads.value += 1;
            const reason = recordingUploadResponse.result.messages.join(", ");
            uploadErrors.value[reason] = uploadErrors.value[reason] || 0;
            uploadErrors.value[data.reason] += 1;
          }
        } else {
          completedUploads.value += 1;
          uploadErrors.value[data.reason] =
            uploadErrors.value[data.reason] || 0;
          uploadErrors.value[data.reason] += 1;
        }
      }
      const resolver = messageQueue[threadIndex][type] as (
        data: unknown
      ) => void;
      delete messageQueue[threadIndex][type];
      messageQueue[threadIndex].busy = false;
      resolver && resolver(data);
    };
    const canvas = new OffscreenCanvas(1280, 960);
    worker.postMessage(
      { type: "thread-id", data: { threadIndex: i, canvas } },
      [canvas]
    );
    if (Object.keys(uploadErrors.value).length) {
      console.log("Errors", uploadErrors.value);
    }
    await waitForMessage(i, "ack");
    uploadWorkers.push(worker);
  }
  // All threads initialised and waiting for work.
  // Find a worker to push the job to.
  // Return immediately if there are idle workers,
  // Or block if there is no room for more work.

  if ("OffscreenCanvas" in window) {
    {
      // NOTE: Do the first (oldest) recording single-threaded first, so we don't have
      //  race conditions server-side and create a bunch of duplicate device history entries
      //  because we uploaded stuff in parallel.
      const job = uploadQueue.value.shift() as UploadJob;
      await distributeWork(job);
      await allWorkFinished();
    }

    while (uploadQueue.value.length > 1) {
      while (uploadQueue.value.length > 1) {
        const job = uploadQueue.value.shift() as UploadJob;
        if (!(await distributeWork(job))) {
          // Stick it back on the queue.
          uploadQueue.value.unshift(job);
          break;
        }
      }
      await someIdleWorkerSlot();
    }
    await allWorkFinished();

    if (uploadQueue.value.length) {
      // NOTE: Do the last (latest) recording single threaded so that we correctly update
      //  Device.lastRecordingTime

      const job = uploadQueue.value.shift() as UploadJob;
      await distributeWork(job);
      await allWorkFinished();
    }
  } else {
    console.error("Offscreen canvas not supported, use fallback method");
  }
  while (uploadWorkers.length) {
    const worker = uploadWorkers.pop() as Worker;
    worker.terminate();
  }
  for (let i = 0; i < numThreads; i++) {
    messageQueue[i] = {};
  }
  await Promise.all(pendingUploadApiRequests);
  uploadInProgress.value = false;
  // TODO: Show any upload errors.
  emit("end-blocking-work");
};

const onDropFiles = async (e: DragEvent, closerFn: () => void) => {
  onEndDrag(e);
  if (e.dataTransfer) {
    const list = e.dataTransfer.items;
    const files = await getAllFileEntries(list);
    files.sort((a: FileSystemFileEntry, b: FileSystemFileEntry) => {
      return a.fullPath > b.fullPath ? 1 : -1;
    });
    //console.log(files);
    // TODO: Should we sanity check the embedded deviceName and make sure all files are the same device, or just trust the user?

    // TODO: Scan the beginning of each file and work out its mimetype from magic numbers or whatever?

    for (const file of files) {
      uploadQueue.value.push({
        progress: 0,
        file,
        type: "fileEntry",
      });
    }

    // First try and find out what kinds of files we're uploading - actually, we need to do that on the fly, incrementally.
    // Do we need to add an offset date?
    // Do we need to add a latlng or nztm location for these recordings?

    // Okay, so now we get thousands of files.
    // We probably want to make sure they're sorted by name, since older ones will come first, and we can get the start
    // date from there.  We may want some way of keeping track of uploaded files.
    if (uploadQueue.value.length) {
      closerFn();
    }
  }
};

const draggingOver = ref<boolean>(false);
const onDrag = (e: DragEvent) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  draggingOver.value = true;
};
const onEndDrag = (e: DragEvent) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  draggingOver.value = false;
};

const previousLocations = ref<LoadedResource<ApiLocationResponse[]>>(null);

onMounted(async () => {
  // TODO: Maybe we can process a bunch of these files in parallel.
  // I guess if we pipeline and interleave the uploading and compression work, we'll be fine.
  if (device.value && project.value) {
    //  This should be all existing locations for the project.
    previousLocations.value = await getLocationsForProject(
      (project.value as SelectedProject).id.toString()
    );
    if (
      previousLocations.value &&
      (previousLocations.value as ApiLocationResponse[]).length === 0
    ) {
      existingOrNewLocation.value = "new-location";
    }
  }
});
onBeforeUnmount(async () => {
  //await ocr.destroy();
});

const existingOrNewLocation = ref<"existing-location" | "new-location">(
  "existing-location"
);

// Should this be an existing device location, or an existing "Station" location?

const selectedLocation = ref<ApiLocationResponse | null>(null);

const selectedNamedLocation = computed<NamedPoint | null>(() => {
  if (selectedLocation.value) {
    const location = selectedLocation.value as ApiLocationResponse;
    return {
      name: location.name,
      project: location.groupName,
      location: location.location,
    };
  }
  return null;
});

const selectedLatLng = ref<{ name: string; location: LatLng }>({
  name: "",
  location: {
    lat: -43.5375559,
    lng: 172.6117458,
  },
});
const newLocationIsValid = computed<boolean>(() => {
  return (
    selectedLatLng.value.name.trim() !== "" &&
    selectedLatLng.value.location.lng !== 0 &&
    selectedLatLng.value.location.lat !== 0
  );
});

const previousLocationsOptions = computed<
  { value: ApiLocationResponse; label: string }[]
>(() => {
  return [
    ...(previousLocations.value || []).map((location) => ({
      value: location,
      label: location.name,
    })),
  ];
});

const finalSelectedLocation = computed<{
  name: string;
  location: LatLng;
} | null>(() => {
  if (
    existingOrNewLocation.value === "existing-location" &&
    selectedLocation.value !== null
  ) {
    return {
      name: (selectedLocation.value as ApiLocationResponse).name,
      location: (selectedLocation.value as ApiLocationResponse).location,
    };
  } else if (newLocationIsValid.value) {
    return selectedLatLng.value;
  }
  return null;
});

const existingNamedLocations = computed<NamedPoint[]>(() => {
  return (previousLocations.value || [])
    .filter((location) => location.location !== undefined)
    .filter(
      (location) => location.location?.lat !== 0 && location.location?.lng !== 0
    )
    .map((location) => {
      return {
        name: location.name,
        project: location.groupName,
        location: location.location as LatLng,
        id: location.id,
        type: "station",
      };
    });
});

const hasLocation = computed<boolean>(
  () =>
    (existingOrNewLocation.value === "new-location" &&
      !!selectedLatLng.value.location.lat &&
      !!selectedLatLng.value.location.lng &&
      selectedLatLng.value.name.trim().length !== 0) ||
    (existingOrNewLocation.value === "existing-location" &&
      selectedLocation.value !== null)
);

const clearUploadQueue = () => {
  uploadQueue.value = [];
  (uploadFileInputForm.value as HTMLFormElement).reset();
};
</script>
<template>
  <div v-if="device">
    <div v-if="!beganUpload" id="accordion" class="accordion" role="tablist">
      <button
        role="tab"
        type="button"
        v-b-toggle.accordion-1
        class="px-3 btn w-100 d-flex justify-content-between align-items-center accordion-button"
      >
        <span>
          <font-awesome-icon
            :icon="hasLocation ? ['far', 'circle-check'] : ['far', 'circle']"
          />
          <strong class="ms-2">Step 1:</strong> Choose a location for these
          uploads
        </span>
      </button>
      <b-collapse
        id="accordion-1"
        accordion="accordion"
        role="tabpanel"
        class="px-3 py-2"
        visible
      >
        <div class="d-flex justify-content-center mb-2">
          <div
            v-if="previousLocations && previousLocations.length !== 0"
            class="btn-group"
            role="group"
            aria-label="Toggle between using existing location or creating a new one"
          >
            <input
              type="radio"
              class="btn-check"
              name="location-mode"
              id="location-mode-existing"
              autocomplete="off"
              v-model="existingOrNewLocation"
              :value="'existing-location'"
            />
            <label
              class="btn btn-outline-secondary"
              for="location-mode-existing"
              >Use an existing location</label
            >
            <input
              type="radio"
              class="btn-check"
              name="location-mode"
              id="location-mode-new"
              autocomplete="off"
              v-model="existingOrNewLocation"
              :value="'new-location'"
            />
            <label class="btn btn-outline-secondary" for="location-mode-new"
              >Create a new location</label
            >
          </div>
        </div>

        <div
          v-if="
            existingOrNewLocation === 'new-location' ||
            !previousLocations ||
            (previousLocations && previousLocations.length === 0)
          "
        >
          <location-picker
            v-model="selectedLatLng"
            :existing-locations="existingNamedLocations"
          />
        </div>
        <div class="mb-3 d-flex" v-else>
          <div class="w-50 me-3">
            <label class="fs-7" for="existing-locations-list">Location</label>
            <multiselect
              ref="selectedLocationsSelect"
              v-model="selectedLocation"
              :options="previousLocationsOptions"
              :can-clear="true"
              class="ms-bootstrap"
              placeholder="Choose an existing location"
              searchable
              id="existing-locations-list"
            />
          </div>
          <map-with-points
            :highlighted-point="null"
            :focused-point="selectedNamedLocation"
            :points="existingNamedLocations"
            :active-points="existingNamedLocations"
            class="map w-50"
          />
        </div>
      </b-collapse>
      <button
        role="tab"
        type="button"
        ref="fileSelectButton"
        v-b-toggle.accordion-2
        class="px-3 btn w-100 d-flex justify-content-between align-items-center accordion-button"
      >
        <span
          ><font-awesome-icon
            :icon="
              uploadQueue.length !== 0
                ? ['far', 'circle-check']
                : ['far', 'circle']
            "
          />
          <strong class="ms-2">Step 2:</strong> Select files to upload
        </span>
      </button>
      <b-collapse
        id="accordion-2"
        accordion="accordion"
        role="tabpanel"
        class="px-3"
      >
        <template #default="{ close }">
          <div
            class="file-list d-flex align-items-center justify-content-center flex-column my-3"
            ref="dropFiles"
            @drop="(e) => onDropFiles(e, close)"
            @dragover="onDrag"
            @dragenter="onDrag"
            @dragend="onEndDrag"
            @dragleave="onEndDrag"
          >
            <div v-if="uploadQueue.length === 0">
              <span>Drop files or folders here</span>
            </div>
            <div v-if="uploadQueue.length === 0">or</div>
            <div v-else>{{ uploadQueue.length }} files selected.</div>
            <div>
              <form ref="uploadFileInputForm">
                <input
                  type="file"
                  class="form-control"
                  :class="{ 'visually-hidden': uploadQueue.length !== 0 }"
                  multiple
                  @change="(e) => onAddFiles(e, close)"
                />
              </form>
            </div>
            <div v-if="uploadQueue.length">
              <button
                type="button"
                class="btn btn-outline-secondary mt-2"
                @click.prevent="clearUploadQueue"
              >
                Clear upload queue
              </button>
            </div>
          </div>
        </template>
      </b-collapse>
    </div>
  </div>
  <div
    v-if="
      (beganUpload && uploadInProgress) ||
      (uploadQueue.length !== 0 && finalSelectedLocation)
    "
    class="p-3 d-flex justify-content-between align-items-center border-top bg-light align-content-end"
  >
    <div class="d-flex flex-grow-1 me-3">
      <div v-if="!uploadInProgress">
        Ready to upload {{ uploadQueue.length }} files at location '<strong>{{
          finalSelectedLocation && finalSelectedLocation.name
        }}</strong
        >'
      </div>
      <div v-else class="d-flex flex-grow-1 flex-column">
        <div>
          Uploading {{ uploadQueue.length }} file<span
            v-if="uploadQueue.length !== 1"
            >s</span
          >
          for location '<strong>{{
            (finalSelectedLocation && finalSelectedLocation.name) || "Test name"
          }}</strong
          >'.
        </div>
        <b-progress :max="1" class="my-2" striped :animated="true">
          <b-progress-bar
            :value="completedUploads / totalUploads"
            :precision="3"
            variant="primary"
          />
        </b-progress>
      </div>
    </div>
    <button
      type="button"
      class="btn btn-primary"
      :disabled="uploadInProgress"
      @click.prevent="() => beginUploadJob()"
    >
      <span v-if="!uploadInProgress">Begin upload</span>
      <span v-else class="d-flex align-items-center">
        <b-spinner small class="me-1" /><span>Uploading</span>
      </span>
    </button>
  </div>
  <div
    v-else-if="beganUpload && !uploadInProgress"
    class="d-flex flex-column justify-content-center align-items-center p-3"
  >
    <div class="mb-3 d-flex flex-column align-items-center">
      <span
        >Uploaded {{ completedUploads }} of {{ totalUploads }} file<span
          v-if="totalUploads !== 1"
          >s</span
        >.</span
      >
      <span v-if="duplicateCount !== 0"
        >{{ duplicateCount }} files were already in the system, and were
        ignored.</span
      >
    </div>
    <button class="btn btn-outline-secondary" @click="resetUploadState">
      Upload some more files
    </button>
  </div>
</template>

<style scoped lang="less">
.file-list {
  height: 150px;
  background: #ececec;
  border-radius: 10px;
}
.text-align-left {
  text-align: left;
}
.map {
  height: 400px;
}
</style>
<style lang="less">
.multiselect-tag {
  white-space: unset !important;
}
</style>
<style src="@vueform/multiselect/themes/default.css"></style>
