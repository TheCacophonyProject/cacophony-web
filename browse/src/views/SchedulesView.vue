<template>
  <b-container>
    <h1>Your schedules</h1>
    <b-table
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
          label: 'Devices',
        },
        {
          key: 'assign',
          label: 'Assign',
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
          v-b-tooltip.hover
          title="Add devices"
          @click="assignScheduleToDevices(data.item.id)"
        >
          Add devices
        </b-button>
      </template>
      <template v-slot:cell(devices)="data">
        {{ data.item.devices.map((device) => device.deviceName).join(", ") }}
      </template>
    </b-table>
    <b-btn @click="createSchedule()">Create new schedule</b-btn>
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
                >Every {{ (combo.every / 60).toFixed(1) }} minutes</label
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
                >Then wait (secs)</label
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
  </b-container>
</template>

<script lang="ts">
import api from "@/api";
import { ApiScheduleResponse, ScheduleConfig } from "@typedefs/api/schedule";
import { ApiFileResponse } from "@typedefs/api/file";
import { ScheduleId } from "@typedefs/api/common";
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
  schedule.combos = schedule.combos.map((combo) => ({
    waits: combo.waits.map(Number),
    every: Number(combo.every),
    volumes: combo.volumes.map(Number),
    sounds: combo.sounds.map(String),
    from: combo.from,
    until: combo.until,
  }));
  return schedule;
};

const populateAllSounds = (
  schedule: ScheduleConfig,
  availableSounds: ApiFileResponse[]
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
      pendingSchedule: newSchedule(),
      files: [],
      devices: [],
      selectedDevices: [],
      fetchingDevices: false,
      assigningTo: null,
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
        ...this.files.map((file: ApiFileResponse) => ({
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
    async createPendingSchedule() {
      // TODO - if the schedule uses random sounds, then we need to include allSounds
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
      // TODO - push to server.
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
      console.log(
        this.pendingSchedule.combos[this.pendingSchedule.combos.indexOf(rule)]
      );
    },
  },
};
</script>

<style scoped lang="scss">
.schedule-rule {
  //background: lightgray;
}
</style>
