<template>
  <b-container fluid class="admin">
    <b-jumbotron class="group-jumbotron" fluid>
      <h1>
        <font-awesome-icon icon="users" size="xs" />
        <span>Your audio-bait schedules</span>
      </h1>
      <p class="lead">
        Manage your audio-bait schedules, sounds, and the devices assigned to
        play them.
      </p>
    </b-jumbotron>
    <b-container class="py-3">
      <p>
        <strong>IMPORTANT:</strong> There is currently no form validation when
        adding schedules or audio-bait sounds, so use with care!
      </p>
      <h2 v-if="schedulesTable.length">Schedules</h2>
      <b-table
        v-if="schedulesTable.length"
        striped
        hover
        :items="schedulesTable"
        :fields="[
          {
            key: 'name',
            label: 'Name',
          },
          {
            key: 'devices',
            label: 'Assigned devices',
          },
          {
            key: 'assign',
            label: '',
          },
          {
            key: 'controls',
            label: '',
          },
        ]"
      >
        <template v-slot:cell(controls)="data">
          <b-button
            v-b-tooltip.hover
            title="Remove schedule"
            class="trash-button"
            variant="light"
            @click="deleteSchedule(data.item.id)"
          >
            <font-awesome-icon icon="trash" size="1x" />
          </b-button>
        </template>
        <template v-slot:cell(assign)="data">
          <b-button
            title="Add/remove devices"
            @click="assignScheduleToDevices(data.item.id)"
          >
            Add or remove devices
          </b-button>
        </template>
        <template v-slot:cell(devices)="data">
          {{ data.item.devices.map((device) => device.deviceName).join(", ") }}
        </template>
      </b-table>
      <h2 v-if="files.length">Audio-bait sounds</h2>
      <b-table
        v-if="files.length"
        striped
        hover
        :items="files"
        :fields="[
          { key: 'name', label: 'Name' },
          { key: 'filename', label: 'Filename' },
          { key: 'sound', label: 'Sound' },
          { key: 'description', label: 'Description' },
          { key: 'source', label: 'Source' },
          { key: 'remove', label: '' },
        ]"
      >
        <template v-slot:cell(name)="data">
          {{ data.item.details.name }}
        </template>
        <template v-slot:cell(filename)="data">
          {{ data.item.details.originalName }}
        </template>
        <template v-slot:cell(sound)="data">
          {{ data.item.details.sound }}
        </template>
        <template v-slot:cell(description)="data">
          {{ data.item.details.description }}
        </template>
        <template v-slot:cell(source)="data">
          {{ data.item.details.source }}
        </template>
        <template v-slot:cell(remove)="data">
          <b-button
            v-if="data.item.userId === currentUserId"
            v-b-tooltip.hover
            title="Delete file"
            class="trash-button"
            variant="light"
            @click="removeFile(data.item.id)"
          >
            <font-awesome-icon icon="trash" size="1x" />
          </b-button>
        </template>
      </b-table>

      <div class="d-flex flex-column flex-sm-row justify-content-between">
        <b-btn :disabled="!files.length" class="mb-2" @click="createSchedule()"
          >Create new schedule</b-btn
        >
        <b-btn class="mb-2" @click="manageSoundFiles()"
          >Upload audio-bait sounds</b-btn
        >
      </div>
    </b-container>

    <b-modal
      v-model="creatingSchedule"
      scrollable
      title="Create a new schedule"
      ok-title="Create"
      @ok="createPendingSchedule"
    >
      <label :for="'description'">Description</label>
      <b-form-input
        v-model="pendingSchedule.description"
        id="description"
      ></b-form-input>
      <hr />
      <div
        v-for="(combo, index) in pendingSchedule.combos"
        :key="index"
        class="row"
      >
        <div class="col schedule-rule px-3">
          <div class="d-flex flex-row align-items-center">
            <h4 class="col px-0">Rule {{ index + 1 }}</h4>
            <b-btn @click="removeRule(combo)">Remove rule</b-btn>
          </div>
          <div class="d-flex flex-row my-3">
            <div class="col px-0">
              <label :for="`combo-${index}-from`">From</label
              ><b-form-timepicker
                placeholder="Start time"
                :id="`combo-${index}-from`"
                v-model="combo.from"
              ></b-form-timepicker>
            </div>
            <div class="col">
              <label :for="`combo-${index}-until`">Until</label
              ><b-form-timepicker
                placeholder="End time"
                :id="`combo-${index}-until`"
                v-model="combo.until"
              ></b-form-timepicker>
            </div>
            <div class="col px-0">
              <label :for="`combo-${index}-frequency`"
                >Every {{ combo.every }} seconds</label
              ><b-form-input
                placeholder="seconds"
                type="number"
                step="60"
                min="1"
                :id="`combo-${index}-every`"
                v-model="combo.every"
              ></b-form-input>
            </div>
          </div>
          <div
            v-for="(sound, soundIndex) in combo.sounds"
            :key="soundIndex"
            class="d-flex flex-row my-3"
          >
            <div class="col px-0">
              <label :for="`combo-${index}-${soundIndex}-sound`"
                >Play sound</label
              >
              <b-form-select
                :id="`combo-${index}-${soundIndex}-sound`"
                :options="soundOptions"
                v-model="combo.sounds[soundIndex]"
              ></b-form-select>
            </div>
            <div class="col">
              <label :for="`combo-${index}-${soundIndex}-volume`"
                >At volume</label
              >
              <b-form-input
                type="number"
                :id="`combo-${index}-${soundIndex}-volume`"
                step="1"
                min="1"
                max="10"
                v-model="combo.volumes[soundIndex]"
              ></b-form-input>
            </div>
            <div class="col px-0">
              <label :for="`combo-${index}-${soundIndex}-wait`"
                >Then wait {{ combo.waits[soundIndex] }} seconds</label
              >
              <b-form-input
                type="number"
                :id="`combo-${index}-${soundIndex}-wait`"
                step="1"
                min="0"
                v-model="combo.waits[soundIndex]"
              ></b-form-input>
            </div>
          </div>
          <div class="d-flex flex-column align-items-end">
            <b-btn @click="addSound(combo)">+ Add sound</b-btn>
          </div>
          <hr />
        </div>
      </div>
      <div class="row px-3 mb-3">
        <b-btn class="col" @click="addRule(pendingSchedule.combos)"
          >+ Add rule</b-btn
        >
      </div>
      <div>
        <hr />
        <label :for="'playnights'">Play nights</label>
        <b-form-input
          type="number"
          id="playnights"
          step="1"
          min="0"
          v-model="pendingSchedule.playNights"
        ></b-form-input>
        <label :for="'controlnights'">Control nights</label>
        <b-form-input
          type="number"
          step="1"
          min="0"
          id="controlnights"
          v-model="pendingSchedule.controlNights"
        ></b-form-input>
        <label :for="'startday'">Start day</label>
        <b-form-input
          type="number"
          step="1"
          min="1"
          max="31"
          id="startday"
          v-model="pendingSchedule.startday"
        ></b-form-input>
      </div>
    </b-modal>
    <b-modal
      v-model="assigningToDevices"
      title="Assign to devices"
      @ok="assignSelectedDevices()"
    >
      <multiselect
        :options="deviceOptions"
        :multiple="true"
        v-model="selectedDevices"
        placeholder="select devices"
        :loading="fetchingDevices"
        track-by="id"
        label="name"
      >
        <template slot="tag" slot-scope="{ option, remove }">
          <span class="multiselect__tag">
            <font-awesome-icon icon="video" size="xs" />
            <span class="tag">{{ option.name }}</span>
            <i
              aria-hidden="true"
              tabindex="1"
              class="multiselect__tag-icon"
              @click="(_) => remove(option)"
              @keypress.enter.space="remove(option)"
            ></i>
          </span>
        </template>
        <template slot="option" slot-scope="{ option: { name } }">
          <span>
            <font-awesome-icon icon="video" size="xs" />
            <span class="option">{{ name }}</span>
          </span>
        </template>
      </multiselect>
    </b-modal>
    <b-modal
      v-model="managingSounds"
      title="Manage audio-bait sounds"
      ok-title="Finish"
      @ok="uploadNewSounds"
      @cancel="pendingSounds = []"
      scrollable
    >
      <div
        class="row my-3"
        v-for="(sound, index) in pendingSounds"
        :key="index"
      >
        <div class="col">
          <b-form-row class="my-2">
            <label :for="`sound-${index}-file`">Choose mp3 file</label>
            <b-form-file
              :state="Boolean(sound.file)"
              :disabled="uploadingSounds"
              :id="`sound-${index}-file`"
              v-model="sound.file"
              accept="audio/mpeg"
            ></b-form-file>
          </b-form-row>
          <b-form-row class="my-2">
            <label :for="`sound-${index}-name`">Name</label>
            <b-form-input
              :disabled="uploadingSounds"
              :id="`sound-${index}-name`"
              v-model="sound.details.name"
            ></b-form-input>
          </b-form-row>
          <b-form-row class="my-2">
            <label :for="`sound-${index}-description`">Description</label>
            <b-form-input
              :disabled="uploadingSounds"
              :id="`sound-${index}-description`"
              v-model="sound.details.description"
            ></b-form-input>
          </b-form-row>
          <b-form-row class="my-2">
            <label :for="`sound-${index}-source`">Source</label>
            <b-form-input
              :disabled="uploadingSounds"
              :id="`sound-${index}-source`"
              v-model="sound.details.source"
            ></b-form-input>
          </b-form-row>
          <b-form-row class="my-2">
            <label :for="`sound-${index}-animal`">Animal</label>
            <b-form-input
              :disabled="uploadingSounds"
              :id="`sound-${index}-animal`"
              v-model="sound.details.animal"
            ></b-form-input>
          </b-form-row>
          <b-form-row class="my-2">
            <label :for="`sound-${index}-sound`">Sound</label>
            <b-form-input
              :disabled="uploadingSounds"
              :id="`sound-${index}-sound`"
              v-model="sound.details.sound"
            ></b-form-input>
          </b-form-row>
        </div>
      </div>
      <div v-if="pendingSounds.length && uploadingSounds">
        <span>Uploading sounds</span>
        <b-spinner />
      </div>
      <b-btn @click="newSound()">+ New sound</b-btn>
    </b-modal>
    <b-modal
      v-model="confirmFileRemoval"
      title="Confirm file deletion"
      @ok="removeFile(removingFile, true)"
    >
      <span
        >This file is used by one or more audio-bait schedules. Are you sure you
        want to delete it?</span
      >
    </b-modal>
  </b-container>
</template>

<script lang="ts">
import api from "@/api";
import { ApiScheduleResponse, ScheduleConfig } from "@typedefs/api/schedule";
import { ApiAudiobaitFileResponse } from "@typedefs/api/file";
import { FileId, ScheduleId, UserId } from "@typedefs/api/common";
import { ApiDeviceResponse } from "@typedefs/api/device";
import Vue from "vue";

const newSchedule = (): ScheduleConfig => ({
  allsounds: [],
  combos: [],
  controlNights: 0,
  playNights: 0,
  description: "",
  startday: 0,
});

const mapSchedule = (schedule: ScheduleConfig): ScheduleConfig => {
  const trimToHoursMinutes = (time: string) => {
    const parts = time.split(":");
    return `${parts[0]}:${parts[1]}`;
  };
  schedule.combos = schedule.combos.map((combo) => ({
    waits: combo.waits.map(Number),
    every: parseInt(combo.every.toString()),
    volumes: combo.volumes.map(Number),
    sounds: combo.sounds.map(String),
    from: trimToHoursMinutes(combo.from),
    until: trimToHoursMinutes(combo.until),
  }));
  schedule.playNights = parseInt(schedule.playNights.toString());
  schedule.controlNights = parseInt(schedule.controlNights.toString());
  schedule.startday = parseInt(schedule.startday.toString());
  return schedule;
};

const populateAllSounds = (
  schedule: ScheduleConfig,
  availableSounds: ApiAudiobaitFileResponse[]
) => {
  const usedSounds = Object.keys(
    schedule.combos.reduce((acc, combo) => {
      for (const sound of combo.sounds) {
        acc[sound] = true;
      }
      return acc;
    }, {})
  );
  if (usedSounds.includes("random") || usedSounds.includes("same")) {
    // We need to add all sounds to the schedule
    schedule.allsounds = availableSounds.map(({ id }) => id);
  } else {
    schedule.allsounds = usedSounds.map(Number);
  }
  return schedule;
};

export default {
  name: "SchedulesView",
  data() {
    return {
      schedules: [],
      creatingSchedule: false,
      assigningToDevices: false,
      confirmFileRemoval: false,
      managingSounds: false,
      uploadingSounds: false,
      pendingSchedule: newSchedule(),
      pendingSounds: [],
      files: [],
      devices: [],
      selectedDevices: [],
      fetchingDevices: false,
      assigningTo: null,
      removingFile: null,
    };
  },
  computed: {
    soundOptions() {
      return [
        {
          value: "random",
          text: "A random sound",
        },
        {
          value: "same",
          text: "Repeat the last sound",
        },
        ...this.files.map((file: ApiAudiobaitFileResponse) => ({
          value: file.id,
          text: file.details.name,
        })),
      ];
    },
    schedulesTable() {
      return this.schedules.map(({ schedule, id }: ApiScheduleResponse) => ({
        id,
        name: schedule.description,
        devices: this.assignedDevices[id] || [],
      }));
    },
    deviceOptions() {
      return this.devices.map((device: ApiDeviceResponse) => ({
        name: device.deviceName,
        id: device.id,
      }));
    },
    assignedDevices() {
      if (this.devices.length) {
        return this.devices.reduce((acc, device) => {
          if (device.scheduleId) {
            acc[device.scheduleId] = acc[device.scheduleId] || [];
            acc[device.scheduleId].push(device);
          }
          return acc;
        }, {});
      }
      return {};
    },
    currentUserId(): UserId {
      return this.$store.state.User.userData.id;
    },
  },
  async created() {
    const [schedulesResponse, filesResponse, devicesResponse] =
      await Promise.all([
        api.schedule.getSchedulesForCurrentUser(),
        api.schedule.getAudioBaitFiles(),
        api.device.getDevices(),
      ]);
    if (schedulesResponse.success) {
      this.schedules = schedulesResponse.result.schedules;
    }
    if (filesResponse.success) {
      this.files = filesResponse.result.files;
    }
    if (devicesResponse.success) {
      this.devices = devicesResponse.result.devices;
    }
  },
  methods: {
    createSchedule() {
      this.pendingSchedule = newSchedule();
      this.creatingSchedule = true;
    },
    manageSoundFiles() {
      this.managingSounds = true;
    },
    newSound() {
      this.pendingSounds.push({
        details: {
          name: "",
          description: "",
          originalName: "",
          source: "",
          animal: "",
          sound: "",
        },
        file: null,
      });
    },
    async uploadNewSounds() {
      this.uploadingSounds = true;
      while (this.pendingSounds.length) {
        const sound = ((sound) => {
          sound.details.originalName = (sound.file as File).name;
          return sound;
        })(this.pendingSounds.pop());
        const formData = new FormData();
        formData.append(
          "data",
          JSON.stringify({
            details: sound.details,
            type: "audioBait",
          })
        );
        formData.append("file", sound.file);
        const fileUploadResponse = await api.schedule.uploadAudiobaitFile(
          formData
        );
        if (fileUploadResponse.success) {
          this.files.push({
            ...sound,
            id: fileUploadResponse.result.id,
            userId: this.currentUserId,
          });
        }
      }
      this.uploadingSounds = false;
      this.managingSounds = false;
    },
    async createPendingSchedule() {
      const typedSchedule = populateAllSounds(
        mapSchedule(this.pendingSchedule),
        this.files
      );

      this.schedules.push({ id: "-", schedule: typedSchedule });
      const createScheduleResponse = await api.schedule.createSchedule(
        typedSchedule
      );
      if (createScheduleResponse.success) {
        this.schedules[this.schedules.length - 1].id =
          createScheduleResponse.result.id;
      } else {
        this.errorMessage = "Error creating schedule";
        this.schedules.pop();
      }
    },
    async deleteSchedule(id: ScheduleId) {
      const deleteResponse = await api.schedule.deleteSchedule(id);
      if (deleteResponse.success) {
        const index = this.schedules.findIndex(
          (schedule) => schedule.id === id
        );
        this.schedules.splice(index, 1);
      }
    },
    async assignScheduleToDevices(id: ScheduleId) {
      // Show modal with devices dropdown.
      this.assigningTo = id;
      if (this.assignedDevices[id]) {
        this.selectedDevices = this.assignedDevices[id].map(({ id }) =>
          this.deviceOptions.find((option) => option.id === id)
        );
      }
      this.assigningToDevices = true;
    },
    async assignSelectedDevices() {
      const scheduleId = this.assigningTo;
      if (!scheduleId) {
        return;
      }
      // If there were previously assigned devices that are no longer in the selected list, first remove them.
      let previouslyAssigned = [];
      if (this.assignedDevices[scheduleId]) {
        previouslyAssigned = this.assignedDevices[scheduleId].map(
          ({ id }) => id
        );
      }
      let deviceIds = this.selectedDevices.map(({ id }) => id);
      const removedIds = previouslyAssigned.filter(
        (id) => !deviceIds.includes(id)
      );
      // Filter out items that already are assigned:
      deviceIds = deviceIds.filter((id) => !previouslyAssigned.includes(id));
      await Promise.all([
        ...removedIds.map((deviceId) =>
          api.device.removeScheduleFromDevice(deviceId, scheduleId)
        ),
        ...deviceIds.map((deviceId) =>
          api.device.assignScheduleToDevice(deviceId, scheduleId)
        ),
      ]);
      for (const device of this.devices) {
        if (deviceIds.includes(device.id)) {
          Vue.set(device, "scheduleId", scheduleId);
        }
        if (removedIds.includes(device.id)) {
          Vue.delete(device, "scheduleId");
        }
      }
      this.selectedDevices = [];
      this.assigningTo = null;
    },
    addRule(combos) {
      combos.push({
        from: "",
        every: 0,
        until: "",
        waits: [],
        sounds: [],
        volumes: [],
      });
    },
    removeRule(rule) {
      const ruleIndex = this.pendingSchedule.combos.indexOf(rule);
      this.pendingSchedule.combos.splice(ruleIndex, 1);
    },
    addSound(rule) {
      rule.waits.push(0);
      rule.volumes.push(10);
      rule.sounds.push("");
    },
    async removeFile(fileId: FileId, force: boolean = false) {
      // First check if the file is used by any of our schedules.
      if (
        !force &&
        this.schedules.find(({ schedule }: { schedule: ScheduleConfig }) =>
          schedule.allsounds.includes(fileId)
        )
      ) {
        this.confirmFileRemoval = true;
        this.removingFile = fileId;
      } else {
        const removeResponse = await api.schedule.deleteAudiobaitFile(fileId);
        if (removeResponse.success) {
          const index = this.files.findIndex((file) => file.id === fileId);
          this.files.splice(index, 1);
        }
        this.removingFile = null;
      }
    },
  },
};
</script>

<style scoped lang="scss"></style>
