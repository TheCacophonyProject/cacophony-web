<template>
  <div class="container" style="padding: 0">
    <h2>Manually upload recordings</h2>
    <b-form-file
      multiple
      accept="*.cptv, *.m4a"
      @input="selectedFiles"
      v-model="files"
    />
    <!--    <div v-for="file in fileList" :key="file.name">-->
    <!--      {{ file.name }}, {{ file.ext }}-->
    <!--    </div>-->
    <div v-if="someFilesAreAudio">
      <label>Select the device whose files you are uploading</label>
      <b-form-select
        :options="deviceOptions"
        v-model="uploadDevice"
      ></b-form-select>
    </div>
    <b-btn
      class="btn-primary mt-3"
      :disabled="fileList.length === 0 || (someFilesAreAudio && !uploadDevice)"
      @click="uploadFiles"
      >Upload</b-btn
    >
  </div>
</template>

<script lang="ts">
import api from "@api";

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
      uploadDevice: null,
      uploading: false,
    };
  },
  computed: {
    deviceOptions() {
      return this.devices.map((device) => ({
        value: device.id,
        text: device.deviceName,
      }));
    },
    someFilesAreAudio(): boolean {
      return this.fileList.some((item) => item.type.includes("audio"));
    },
  },
  methods: {
    selectedFiles() {
      this.fileList = this.files.map((file: File) => ({
        file,
        name: file.name,
        type: file.type,
        ext: file.name.split(".").pop(),
      }));
    },
    async uploadFiles() {
      // TODO Upload each file serially, show progress.
      this.uploading = true;
      for (const file of this.files as File[]) {
        // TODO - If it's an audio file, parse the filename into a data object.
        const data = {};
        if (file.type.includes("audio")) {
          const stems = file.name.split(".");
          stems.pop();
          const parts = stems.join(".").split(" ");
          console.log(parts);
          data.recordingDateTime = "";
        }
        await api.recording.addRecording(file, {});
      }
      this.uploading = false;
    },
  },
};
</script>

<style scoped lang="scss"></style>
