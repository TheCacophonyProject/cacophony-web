<template>
  <div class="container" style="padding: 0">
    <h2>
      Analysis
      <help>Analysis for {{ groupName }}</help>
    </h2>
    <toggle-switch
      v-model="isAudioAnalysis"
      label-on="Audio"
      label-off="Video"
    ></toggle-switch>

    <div class="date-range-picker-container">
      <Label class="form-label">Date Range</Label>
      <b-form-select
        class="date-range-selector"
        v-model="dateRange"
        :options="dateRangeOptions"
      />
      <DateRangePicker
        v-if="dateRange == 'Custom'"
        :from-date="customFromDate"
        :to-date="customToDate"
        @update:fromDate="fromDateUpdated"
        @update:toDate="toDateUpdated"
      ></DateRangePicker>
    </div>
    <div class="grouping-selector-container">
      <label for="grouping-selector" class="form-label">Show per</label>
      <b-form-select
        id="grouping-selector"
        v-model="groupingSelection"
        class="grouping-selector"
      >
        <option v-for="option in groupingOptions" :key="option" :value="option">
          {{ option }}
        </option>
      </b-form-select>
    </div>
    <div class="grouping-selector-container">
      <label for="interval-selector" class="form-label">Group by</label>
      <b-form-select
        id="interval-selector"
        v-model="intervalSelection"
        class="grouping-selector"
      >
        <option v-for="option in intervalOptions" :key="option" :value="option">
          {{ option }}
        </option>
      </b-form-select>
    </div>
    <div class="audio-analysis-container" v-if="isAudioAnalysis">
      <div class="visuals-container">
        <div class="grid-item">
          <slot name="index-visuals">
            <index-comparisons
              :groupName="groupName"
              :groupId="groupId"
              :devices="devices"
              :stations="stations"
              :colours="colours"
              :groupingSelection="groupingSelection"
              :fromDate="fromDate"
              :toDate="toDate"
            >
            </index-comparisons>
          </slot>
        </div>
        <div class="grid-item">
          <slot name="index-visuals">
            <index-time-comparisons
              :groupId="groupId"
              :devices="devices"
              :stations="stations"
              :colours="colours"
              :fromDate="fromDate"
              :toDate="toDate"
              :groupingSelection="groupingSelection"
              :intervalSelection="intervalSelection"
            >
            </index-time-comparisons>
          </slot>
        </div>
        <div class="grid-item">
          <slot name="index-visuals">
            <species-comparisons
              :groupName="groupName"
              :groupId="groupId"
              :devices="devices"
              :stations="stations"
              :colours="colours"
              :groupingSelection="groupingSelection"
              :fromDate="fromDate"
              :toDate="toDate"
            >
            </species-comparisons>
          </slot>
        </div>
        <div class="grid-item">
          <slot name="index-visuals">
            <species-time-comparisons
              :groupName="groupName"
              :groupId="groupId"
              :devices="devices"
              :stations="stations"
              :groupingSelection="groupingSelection"
              :fromDate="fromDate"
              :toDate="toDate"
              :intervalSelection="intervalSelection"
            >
            </species-time-comparisons>
          </slot>
        </div>
      </div>
    </div>
    <div v-else-if="!isAudioAnalysis">
      <average-species-visits
        :groupId="groupId"
        :devices="devices"
        :stations="stations"
        :groupingSelection="groupingSelection"
        :fromDate="fromDate"
        :toDate="toDate"
        :intervalSelection="intervalSelection"
      ></average-species-visits>
    </div>
  </div>
</template>

<script lang="ts">
import Help from "@/components/Help.vue";
import api from "@/api";
import DateRangePicker from "../Visuals/DateRangePicker.vue";
import IndexComparisons from "../Visuals/Audio/IndexComparisons.vue";
import IndexTimeComparisons from "../Visuals/Audio/IndexTimeComparisons.vue";
import SpeciesComparisons from "../Visuals/Audio/SpeciesComparisons.vue";
import SpeciesTimeComparisons from "../Visuals/Audio/SpeciesTimeComparisons.vue";
import ToggleSwitch from "../Visuals/ToggleSwitch.vue";
import AverageSpeciesVisits from "../Visuals/Video/AverageSpeciesVisits.vue";

export default {
  name: "AnalysisTab",
  components: {
    Help,
    IndexComparisons,
    IndexTimeComparisons,
    DateRangePicker,
    SpeciesComparisons,
    SpeciesTimeComparisons,
    ToggleSwitch,
    AverageSpeciesVisits,
  },
  props: {
    groupName: { type: String, required: true },
    groupId: { type: Number, required: true },
  },
  data() {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    return {
      loading: true,
      recordings: null,
      recordingCount: 1,
      dateRange: "Last 30 days",
      dateRangeOptions: [
        "Last 30 days",
        "Last 90 days",
        "Last 12 months",
        "All time",
        "Custom",
      ],
      customToDate: toDate,
      customFromDate: fromDate,
      devices: [],
      colours: [],
      stations: [],
      groupingOptions: ["device", "station"],
      groupingSelection: "device",
      intervalOptions: ["hours", "days", "weeks", "months", "years"],
      intervalSelection: "days",
      isAudioAnalysis: true,
    };
  },
  async mounted() {
    this.loading = true;
    await this.getDevices();
    var colours = [];
    for (let i = 0; i < this.devices.length; i++) {
      colours.push("#" + Math.random().toString(16).substr(-6));
    }
    this.colours = colours;

    this.intervalOptions = ["days", "weeks"];
    await this.getStations();
    this.loading = false;
  },
  watch: {
    groupingSelection: async function () {
      var objCount = 0;
      if (this.groupingSelection == "device") {
        await this.getDevices();
        objCount = this.devices.length;
      } else if (this.groupingSelection == "station") {
        await this.getStations();
        objCount = this.stations.length;
      }
      var colours = [];
      for (let i = 0; i < objCount; i++) {
        colours.push("#" + Math.random().toString(16).substr(-6));
      }
      this.colours = colours;
    },
    dateRange: function () {
      this.updateIntervalSelection();
      this.customToDate = this.toDate;
      this.customFromDate = this.fromDate;
    },
  },
  methods: {
    async getDevices() {
      const resultDevices = await api.groups.getDevicesForGroup(
        this.groupId,
        this.inactiveAndActive
      );
      this.devices = resultDevices.result.devices;
    },
    async getStations() {
      const resultStations = await api.groups.getStationsForGroup(
        this.groupId,
        this.inactiveAndActive
      );
      this.stations = resultStations.result.stations;
    },
    fromDateUpdated(newFromDate) {
      this.customFromDate = new Date(newFromDate);
      this.updateIntervalSelection();
    },
    toDateUpdated(newToDate) {
      this.customToDate = new Date(newToDate);
      this.updateIntervalSelection();
    },
    updateIntervalSelection() {
      const differenceDays = Math.ceil(
        (this.toDate.getTime() - this.fromDate.getTime()) / (1000 * 3600 * 24)
      );
      if (differenceDays < 33) {
        this.intervalOptions = ["hours", "days", "weeks"];
        this.intervalSelection = "days";
      } else if (differenceDays < 95) {
        this.intervalOptions = ["hours", "days", "weeks", "months"];
        this.intervalSelection = "weeks";
      } else if (differenceDays < 1095) {
        this.intervalOptions = ["days", "weeks", "months", "years"];
        this.intervalSelection = "months";
      } else {
        this.intervalOptions = ["weeks", "months", "years"];
        this.intervalSelection = "years";
      }
    },
  },
  computed: {
    toDate() {
      if (this.dateRange != "Custom") {
        const toDate = new Date();
        toDate.setDate(toDate.getDate() - 1);
        const roundedDate = new Date(toDate);
        roundedDate.setHours(23, 59, 59, 999);
        return roundedDate;
      } else if (this.dateRange == "Custom") {
        return this.customToDate;
      }
      return new Date();
    },
    fromDate() {
      var fromDate = new Date();
      if (this.dateRange == "Last 30 days") {
        fromDate.setDate(fromDate.getDate() - 31);
      } else if (this.dateRange == "Last 90 days") {
        fromDate.setDate(fromDate.getDate() - 91);
      } else if (this.dateRange == "Last 12 months") {
        fromDate.setDate(fromDate.getDate() - 366);
      } else if (this.dateRange == "All time") {
        fromDate.setDate(fromDate.getDate() - 366);
      } else if (this.dateRange == "Custom") {
        fromDate = this.customFromDate;
      }
      const roundedDate = new Date(fromDate);
      roundedDate.setHours(0, 0, 0, 0);
      return roundedDate;
    },
  },
};
</script>

<style scoped>
.visuals-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 5px;
  width: 100%;
  height: 100%;
}

.grid-item {
  background-color: #fff;
  padding: 5px;
}

.date-range-picker-container {
  margin-top: 10px;
  margin-bottom: 10px;
  max-width: 500px;
}

.grouping-selector-container {
  display: flex;
  max-width: 500px;
}

.date-range-selector {
  margin-bottom: 10px;
  max-width: 300px;
}

.grouping-selector {
  margin-bottom: 10px;
  max-width: 300px;
}

.form-label {
  display: flex;
  margin-right: 5px;
  margin-top: 5px;
}
</style>
