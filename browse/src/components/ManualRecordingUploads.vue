<template>
  <div class="container" style="padding: 0">
    <h2>Manually upload recordings</h2>
    <div>
      <p>Upload audio recordings from a bird monitor.</p>
      <b-form-file
        multiple
        :accept="deviceTypesForGroup"
        @input="selectedFiles"
        placeholder="Select audio recordings"
        v-model="files"
      />
      <div
        class="my-3"
        v-if="
          someFilesAreAudio &&
          groupHasAudioDevices &&
          audioDeviceOptions.length > 1
        "
      >
        <label>Select the device to associate audio recordings with.</label>
        <b-form-select
          :options="audioDeviceOptions"
          v-model="audioUploadDevice"
        ></b-form-select>
      </div>
    </div>
    <div v-if="files.length">
      <b-table-lite
        :items="fileList"
        :fields="['name', 'type', 'status', 'info']"
      >
        <template #cell(status)="data">
          <b-spinner v-if="data.item.status === 'uploading'" small />
          {{ data.item.status }}
        </template>
      </b-table-lite>
    </div>
    <div class="d-flex justify-content-end">
      <b-btn
        class="btn-primary mt-3"
        :disabled="
          fileList.length === 0 || (someFilesAreAudio && !audioUploadDevice)
        "
        @click="uploadFiles"
        >Upload recordings</b-btn
      >
    </div>
  </div>
</template>

<script lang="ts">
import api from "@api";
import { DeviceType, RecordingType } from "@typedefs/api/consts";
import { CptvDecoder, CptvHeader } from "cptv-decoder";

export default {
  name: "ManualRecordingUploads",
  props: {
    devices: {
      required: true,
    },
  },
  data() {
    return {
      files: [],
      fileList: [],
      audioUploadDevice: null,
      uploading: false,
      cptvDecoder: null,
    };
  },
  created() {
    this.cptvDecoder = new CptvDecoder();
    if (this.audioDeviceOptions.length === 1) {
      this.audioUploadDevice = this.audioDeviceOptions[0].value;
    }
  },
  async beforeDestroy() {
    await this.cptvDecoder.free();
  },
  computed: {
    audioDeviceOptions() {
      return this.devices
        .filter(
          (device) =>
            device.type === DeviceType.Audio ||
            device.type === DeviceType.Unknown
        )
        .map((device) => ({
          value: device.id,
          text: device.deviceName,
        }));
    },
    groupHasAudioDevices(): boolean {
      return this.deviceTypesForGroup.includes("m4a");
    },
    deviceTypesForGroup(): string {
      return ".m4a";
    },
    someFilesAreAudio(): boolean {
      return this.fileList.some((item) => item.type === "audio");
    },
  },
  methods: {
    selectedFiles() {
      this.fileList = this.files.map((file: File) => ({
        file,
        name: file.name,
        type: file.type.includes("audio") ? "audio" : "thermal",
        status: "queued",
        info: "-",
      }));

      // Read the files and show what device they'll be added to, and what recordingDateTime they're for.
    },
    async uploadFiles(e) {
      e.preventDefault();

      // Read the header of the cptv file, and assign the appropriate device.
      // Make sure the device is part of the group.

      // TODO Upload each file serially, show progress.
      this.uploading = true;
      for (const fileItem of this.fileList as {
        file: File;
        info: string;
        type: "audio" | "thermal";
        status: "uploading" | "skipped" | "uploaded" | "queued" | "duplicate";
      }[]) {
        const data: any = {};
        if (fileItem.type === "audio") {
          const stems = fileItem.file.name.split(".");
          stems.pop();
          const parts = stems.join(".").split(" ");
          const time = new Date();
          // NOTE: Bird monitor recording times are relative to the device local time,
          //  which we'll assume is the same timezone as the uploader
          time.setFullYear(
            Number(parts[0]),
            Number(parts[1]) - 1,
            Number(parts[2])
          );
          time.setHours(Number(parts[3]), Number(parts[4]), Number(parts[5]));
          data.recordingDateTime = time.toISOString();
          data.location = { lat: Number(parts[12]), lng: Number(parts[13]) };

          const rToDuskIndex = parts.indexOf("rToDusk");
          if (rToDuskIndex) {
            data.relativeToDusk = Number(parts[rToDuskIndex + 1]);
          }
          const rToDawnIndex = parts.indexOf("rToDawn");
          if (rToDawnIndex) {
            data.relativeToDawn = Number(parts[rToDawnIndex + 1]);
          }
          data.duration = Number(parts[11]);
          data.airplaneModeOn = parts[8] !== "apModeOff";
          data.batteryCharging = parts[9];
          data.batteryLevel = Number(parts[10]);
          data.type = RecordingType.Audio;
          const normalIndex = parts.indexOf("normal");
          if (normalIndex) {
            data.additionalMetadata = {
              normal: Number(parts[normalIndex + 1]),
            };
          }
          fileItem.status = "uploading";
          const uploadResponse = await api.recording.addRecording(
            fileItem.file,
            data,
            this.audioUploadDevice
          );
          if (!uploadResponse.success && uploadResponse.status === 403) {
            // No device found for this recording in this group.
            fileItem.status = "skipped";
          } else if (uploadResponse.success) {
            if (
              uploadResponse.result.messages.length &&
              uploadResponse.result.messages[0] ===
                "Duplicate recording found for device"
            ) {
              fileItem.status = "duplicate";
            } else {
              fileItem.status = "uploaded";
            }
          }
        } else {
          const bytes = await fileItem.file.arrayBuffer();
          data.type = RecordingType.ThermalRaw;
          const header: CptvHeader = await (
            this.cptvDecoder as CptvDecoder
          ).getBytesMetadata(new Uint8Array(bytes));
          fileItem.status = "uploading";
          const uploadResponse = await api.recording.addRecording(
            fileItem.file,
            data,
            header.deviceId
          );
          if (!uploadResponse.success && uploadResponse.status === 403) {
            // No device found for this recording in this group.
            fileItem.status = "skipped";
            fileItem.info =
              "The device that made this recording is not part of this group.";
          } else if (uploadResponse.success) {
            if (
              uploadResponse.result.messages.length &&
              uploadResponse.result.messages[0] ===
                "Duplicate recording found for device"
            ) {
              fileItem.status = "duplicate";
            } else {
              fileItem.status = "uploaded";
            }
          }
        }
      }
      this.uploading = false;
    },
  },
};
</script>

<style scoped lang="scss"></style>
