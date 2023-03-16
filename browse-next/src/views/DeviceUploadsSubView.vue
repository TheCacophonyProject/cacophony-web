<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import type { Ref } from "vue";
import { selectedProjectDevices } from "@models/provides";
import type { ApiDeviceResponse } from "@typedefs/api/device";
import type { ApiStationResponse as ApiLocationResponse } from "@typedefs/api/station";
import { useRoute } from "vue-router";
import type { DeviceId } from "@typedefs/api/common";
import { getLocationHistory } from "@api/Device";
import { projectDevicesLoaded } from "@models/LoggedInUser";
import type { LoadedResource } from "@api/types";
import LocationPicker from "@/components/LocationPicker.vue";

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
const route = useRoute();
const deviceId = Number(route.params.deviceId) as DeviceId;
const device = computed<ApiDeviceResponse | null>(() => {
  return (
    (devices.value &&
      devices.value.find(
        (device: ApiDeviceResponse) => device.id === deviceId
      )) ||
    null
  );
});

const dropFiles = ref<HTMLDivElement>();

interface UploadJob {
  file: FileSystemFileEntry | File;
  progress: number;
  type: "file" | "fileEntry";
}

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
const onAddFiles = (e: Event) => {
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
};

interface MessageData {
  threadIndex: number;
  type: string;
  data: any;
}
const onMessage = (message: MessageEvent<MessageData>) => {
  const { type, data, threadIndex } = message.data;
  console.log(type, data, threadIndex);
  const resolver = messageQueue[threadIndex][type] as (data: unknown) => void;
  delete messageQueue[threadIndex][type];
  messageQueue[threadIndex].busy = false;
  resolver && resolver(data);
};

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
    if (startWork(i, { type: "job", data: { file: fileBlob } })) {
      console.log("sent job to", i);
      return true;
    }
  }
  return false;
};
const beginUploadJob = async () => {
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
    worker.onmessage = onMessage;
    const canvas = new OffscreenCanvas(1280, 960);
    worker.postMessage(
      { type: "thread-id", data: { threadIndex: i, canvas } },
      [canvas]
    );
    await waitForMessage(i, "ack");
    uploadWorkers.push(worker);
  }
  // All threads initialised and waiting for work.
  // Find a worker to push the job to.
  // Return immediately if there are idle workers,
  // Or block if there is no room for more work.
  if ("OffscreenCanvas" in window) {
    while (uploadQueue.value.length) {
      while (uploadQueue.value.length) {
        const job = uploadQueue.value.shift() as UploadJob;
        if (!(await distributeWork(job))) {
          break;
        }
      }
      await someIdleWorkerSlot();
    }
    await allWorkFinished();
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
  console.log("Completed queue");
};

const onDropFiles = async (e: DragEvent) => {
  onEndDrag(e);
  if (e.dataTransfer) {
    const list = e.dataTransfer.items;
    const files = await getAllFileEntries(list);
    files.sort((a: FileSystemFileEntry, b: FileSystemFileEntry) => {
      return a.fullPath > b.fullPath ? 1 : -1;
    });
    console.log(files);
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
  // I guess if we pipeline and interleave the uploading and compression work, we'll be fine.=
  await projectDevicesLoaded();
  if (device.value) {
    previousLocations.value = await getLocationHistory(device.value.id);
  }
});
onBeforeUnmount(async () => {
  //await ocr.destroy();
});
</script>
<template>
  <div v-if="device" class="px-3">
    <div v-if="previousLocations" class="mb-3">
      <span
        >Upload recordings at a previous known location for this trailcam</span
      >
    </div>
    <div class="mb-3">
      <span>Upload recordings for this trailcam at a new location</span>
      Enter the location as latlng, enter the location as NZTM, adjust on a map.
      Enter a name to identify the location.
    </div>
    <location-picker />
    <!--    && device.type === 'trailcam'-->
    <!--    <ul>-->
    <!--      <li>Bulk upload thermal recordings for this device.</li>-->
    <!--      <li>Bulk upload audio recordings for this device.</li>-->
    <!--      <li>Bulk upload trail-cam images for this device.</li>-->
    <!--      <li>Bulk upload trail-cam videos for this device.</li>-->
    <!--    </ul>-->
    <div
      class="file-list d-flex align-items-center justify-content-center flex-column"
      ref="dropFiles"
      @drop="onDropFiles"
      @dragover="onDrag"
      @dragenter="onDrag"
      @dragend="onEndDrag"
      @dragleave="onEndDrag"
      v-if="uploadQueue.length === 0"
    >
      <div>
        <span>Drop files or folders here</span>
      </div>
      <div>or</div>
      <div>
        <input type="file" multiple @change="onAddFiles" />
      </div>
    </div>
    <div v-else class="mx-3">
      <div>
        <span>Ready to upload {{ uploadQueue.length }} files</span>
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary mt-2"
        @click="() => beginUploadJob()"
      >
        Begin batch upload
      </button>
    </div>
  </div>
</template>

<style scoped lang="less">
.file-list {
  height: 300px;
  background: #ececec;
  border-radius: 10px;
}
</style>
