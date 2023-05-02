<template>
  <div class="index-time-chart-container">
    <div v-if="loading" ref="spinner-container">
      <b-spinner ref="spinner" type="border" large />
    </div>
    <div v-else ref="chart-content">
      <IndexTimeComparisonsChart
        :data="chartData"
        :options="chartOptions"
      ></IndexTimeComparisonsChart>
    </div>
  </div>
</template>

<script lang="ts">
import api from "@api";
import IndexTimeComparisonsChart from "../Audio/IndexTimeComparisonsChart.vue";

const TIME_VALUES = {
  hours: { value: 1, stepSizeInMs: 60 * 60 * 1000 },
  days: { value: 24, stepSizeInMs: 24 * 60 * 60 * 1000 },
  weeks: { value: 168, stepSizeInMs: 7 * 24 * 60 * 60 * 1000 },
  months: { value: 730 }, // stepSizeInMs will be calculated later
  years: { value: 8766 }, // stepSizeInMs will be calculated later
};

export default {
  name: "index-time-comparisons",
  components: {
    IndexTimeComparisonsChart,
  },
  data() {
    return {
      inactiveAndActive: false,
      loading: true,
      indexData: [],
      labels: [],
      datasets: [],
      interval: "days",
      chartOptions: {
        plugins: {
          legend: {
            display: true,
            position: "top",
          },
          title: {
            display: true,
            text: "Change in Cacophony Index By Device (%)",
            position: "top",
            font: { size: 18 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
          },
        },
      },
      chartData: {
        labels: [],
        datasets: [],
      },
    };
  },
  props: {
    groupId: {
      type: Number,
      required: true,
    },
    devices: {
      type: Array,
    },
    stations: {
      type: Array,
    },
    colours: {
      type: Array,
    },
    groupingSelection: {
      type: String,
      required: true,
    },
    intervalSelection: {
      type: String,
      required: true,
    },
    fromDate: {
      type: Date,
      required: true,
    },
    toDate: {
      type: Date,
      required: true,
    },
  },
  async mounted() {
    this.dateRange = this.toDate - this.fromDate; // days
    this.loading = true;
    this.labels = [];
    this.indexData = [];
    await this.getIndexData();
    if (this.groupingSelection == "device") {
      this.updateDeviceGraphData();
    } else if (this.groupingSelection == "station") {
      this.updateStationGraphData();
    }
    this.chartData = {
      datasets: this.datasets,
      labels: this.labels,
    };
    this.loading = false;
  },
  watch: {
    intervalSelection: async function () {
      this.handleParameterChange();
    },
    fromDate: async function () {
      this.handleParameterChange();
    },
    toDate: async function () {
      this.handleParameterChange();
    },
    groupingSelection: async function () {
      this.handleParameterChange();
    },
    devices: async function () {
      this.handleParameterChange();
    },
  },
  methods: {
    async getIndexData() {
      const fromDateRounded = new Date(this.fromDate);
      var toDateRounded = new Date(this.toDate);
      var interval = 1;

      // Choosing the graph interval and rounding the start date to give clean separation of points
      switch (this.intervalSelection) {
        case "hours":
          interval = 1;
          break;
        case "days":
          interval = 24;
          break;
        case "weeks":
          var day = fromDateRounded.getDay();
          if (day != 1) {
            fromDateRounded.setDate(fromDateRounded.getDate() - (day - 1));
          }
          var toDay = toDateRounded.getDay();
          if (toDay != 0) {
            toDateRounded.setDate(toDateRounded.getDate() + (7 - toDay));
          }
          interval = 168;
          break;
        case "months":
          fromDateRounded.setDate(0);
          interval = 730;
          break;
        case "years":
          fromDateRounded.setDate(0);
          fromDateRounded.setMonth(0);
          interval = 8766;
          break;
      }

      this.windowSize =
        (toDateRounded.getTime() - fromDateRounded.getTime()) / 3600000;
      var steps = Math.round(this.windowSize / interval);

      var iterable = [];
      if (this.groupingSelection == "device") {
        const audioDevices = this.devices.filter(
          (device) => device.type == "audio"
        );
        iterable = audioDevices;
      } else if (this.groupingSelection == "station") {
        iterable = this.stations;
      }

      const requests = iterable.map((source) => {
        const name = source.deviceName ? source.deviceName : source.name;
        return {
          id: source.id,
          name: name,
          from: toDateRounded.toISOString(),
          steps: steps,
          interval: this.intervalSelection,
        };
      });

      const response = await Promise.all(
        requests.map(async (req) => {
          var res = null;
          if (this.groupingSelection == "device") {
            res = await api.device.getDeviceCacophonyIndexBulk(
              req["id"],
              req["from"],
              req["steps"],
              req["interval"]
            );
          } else if (this.groupingSelection == "station") {
            res = await api.station.getStationCacophonyIndexBulk(
              req["id"],
              req["from"],
              req["steps"],
              req["interval"]
            );
          }
          return { ...res, name: req["name"] };
        })
      );

      const stepSizeInMs = this.getStepSizeInMs(
        toDateRounded,
        this.intervalSelection
      );
      const windowEnds = Array.from(
        { length: steps },
        (_, i) => new Date(toDateRounded.getTime() - i * stepSizeInMs)
      ).reverse();

      const data = {};
      for (const res of response) {
        const name = res.name;
        if (!(name in data)) {
          data[name] = Array(windowEnds.length).fill(null);
        }
        for (let i = 0; i < windowEnds.length; i++) {
          const index = res.result.cacophonyIndexBulk.findIndex(
            (item) => item.from === windowEnds[i].toISOString()
          );
          if (index !== -1) {
            data[name][i] = res.result.cacophonyIndexBulk[index].cacophonyIndex;
          }
        }
      }

      const labels = windowEnds.map((item) => {
        if (this.intervalSelection == "weeks") {
          item.setDate(item.getDate() + 6);
          return "Week ending " + item.toLocaleDateString("en-GB");
        } else if (this.intervalSelection == "months") {
          item.setMonth(item.getMonth() + 1);
          return item.toLocaleDateString("en-GB").substring(3);
        } else {
          return item.toLocaleDateString("en-GB");
        }
      });

      this.indexData = data;
      this.labels = labels;
    },
    updateDeviceGraphData() {
      var datasets = [];
      var i = 0;
      const audioDevices = this.devices.filter(
        (device) => device.type == "audio"
      );
      for (var device of audioDevices) {
        if (this.indexData[device.deviceName] != null) {
          datasets.push({
            data: this.indexData[device.deviceName],
            label: device.deviceName,
            borderColor: this.colours[i],
          });
          i += 1;
        }
      }
      this.datasets = datasets;
    },
    updateStationGraphData() {
      var datasets = [];
      var i = 0;
      for (var station of this.stations) {
        if (this.indexData[station.name] != null) {
          datasets.push({
            data: this.indexData[station.name],
            label: station.name,
            borderColor: this.colours[i],
          });
          i += 1;
        }
      }
      this.datasets = datasets;
    },
    async handleParameterChange() {
      this.loading = true;
      this.labels = [];
      this.indexData = [];
      await this.getIndexData();
      if (this.groupingSelection == "device") {
        this.updateDeviceGraphData();
        this.chartOptions.plugins.title.text =
          "Change in Cacophony Index By Device (%)";
      } else if (this.groupingSelection == "station") {
        this.updateStationGraphData();
        this.chartOptions.plugins.title.text =
          "Change in Cacophony Index By Station (%)";
      }
      this.chartData = {
        datasets: this.datasets,
        labels: this.labels,
      };
      this.loading = false;
    },
    getStepSizeInMs(toDateRounded, intervalSelection) {
      if (TIME_VALUES[intervalSelection].stepSizeInMs) {
        return TIME_VALUES[intervalSelection].stepSizeInMs;
      }
      switch (intervalSelection) {
        case "months": {
          const currMonthDays = new Date(
            toDateRounded.getFullYear(),
            toDateRounded.getMonth() + 1,
            0
          ).getDate();
          return currMonthDays * 24 * 60 * 60 * 1000;
        }
        case "years": {
          const currYearDays = new Date(
            toDateRounded.getFullYear(),
            11,
            31
          ).getDate();
          return currYearDays * 24 * 60 * 60 * 1000;
        }
        default:
          throw new Error(`Invalid interval: ${intervalSelection}`);
      }
    },
  },
};
</script>
<style scoped lang="scss">
.index-time-chart-container {
  //   display: flex; /* Set display to flex */
  align-items: stretch; /* Stretch items to fill container vertically */
  justify-content: center; /* Center items horizontally */
  position: relative; /* Set position to relative */
}

.spinner-container {
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
}
.spinner {
  flex: 1;
}
</style>
