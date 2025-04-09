<template>
  <div class="species-time-comparisons-container">
    <div v-if="loading">
      <b-spinner ref="spinner" type="border" large />
    </div>
    <div v-else>
      <species-time-comparisons-chart
        :data="chartData"
        :options="chartOptions"
      ></species-time-comparisons-chart>
    </div>
    <multiselect
      v-model="selected"
      :options="selectOptions"
      :multiple="true"
      :show-labels="false"
      :close-on-select="allSelected"
      label="name"
      track-by="id"
      :placeholder="selectText"
    >
    </multiselect>
  </div>
</template>

<script lang="ts">
import api from "@/api";
import SpeciesTimeComparisonsChart from "../Audio/SpeciesTimeComparisonsChart.vue";
import Multiselect from "vue-multiselect";
import chroma from "chroma-js";

const TIME_VALUES = {
  hours: { value: 1, stepSizeInMs: 60 * 60 * 1000 },
  days: { value: 24, stepSizeInMs: 24 * 60 * 60 * 1000 },
  weeks: { value: 168, stepSizeInMs: 7 * 24 * 60 * 60 * 1000 },
  months: { value: 730 }, // stepSizeInMs will be calculated later
  years: { value: 8766 }, // stepSizeInMs will be calculated later
};

export default {
  name: "species-comparisons",
  components: {
    SpeciesTimeComparisonsChart,
    Multiselect,
  },
  data() {
    return {
      loading: false,
      selectText: "Select Devices",
      selected: [],
      chartData: {
        labels: [],
        datasets: [],
      },
      chartOptions: {
        plugins: {
          title: {
            display: true,
            text: "Identified Species over time",
            font: { size: 18 },
          },
          tooltip: {
            intersect: false,
            mode: "index",
          },
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              pointStyle: "line",
              boxWidth: 100,
              pointStyleWidth: 100,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: false,
          },
        },
      },
    };
  },
  props: {
    groupName: {
      type: String,
      required: true,
    },
    groupId: {
      type: Number,
      required: true,
    },
    stations: {
      type: Array,
    },
    devices: {
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
  },
  watch: {
    groupingSelection: {
      handler: function () {
        this.selected = [];
        if (this.groupingSelection == "device") {
          this.selectText = "Select Devices";
        } else if (this.groupingSelection == "station") {
          this.selectText = "Select Stations";
        }
      },
    },
    async selected() {
      this.loading = true;
      if (this.selected.length > 0) {
        await this.getSpeciesCounts();
      }
      this.loading = false;
    },
    async fromDate() {
      this.loading = true;
      await this.getSpeciesCounts();
      this.loading = false;
    },
    async toDate() {
      this.loading = true;
      await this.getSpeciesCounts();
      this.loading = false;
    },
    async intervalSelection() {
      this.loading = true;
      await this.getSpeciesCounts();
      this.loading = false;
    },
  },
  methods: {
    async handleParameterChange() {},
    async getSpeciesCounts() {
      const fromDateRounded = new Date(this.fromDate);
      var toDateRounded = new Date(this.toDate);
      var interval = 1;

      // Choosing the graph interval and rounding the start date to give clean sepeartion of points
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

      const requests = this.selected.map((source) => {
        return {
          id: source.id,
          from: toDateRounded.toISOString(),
          steps: steps,
          interval: this.intervalSelection,
        };
      });

      const response = await Promise.all(
        requests.map(async (req) => {
          var res = null;
          if (this.groupingSelection == "device") {
            res = await api.device.getDeviceSpeciesCountBulk(
              req["id"],
              req["from"],
              req["steps"],
              req["interval"],
              false,
              "audio",
            );
          } else if (this.groupingSelection == "station") {
            res = await api.station.getStationSpeciesCountBulk(
              req["id"],
              req["from"],
              req["steps"],
              req["interval"],
              false,
              "audio",
            );
          }
          return res;
        }),
      );
      const stepSizeInMs = this.getStepSizeInMs(
        toDateRounded,
        this.intervalSelection,
      );
      const windowEnds = Array.from(
        { length: steps },
        (_, i) => new Date(toDateRounded.getTime() - i * stepSizeInMs),
      ).reverse();
      const windowStarts = windowEnds.map(
        (windowEnd) => new Date(windowEnd.getTime() - stepSizeInMs),
      );

      const animalList = [
        ...new Set(
          response
            .map((res) => res.result.speciesCountBulk.map((item) => item.what))
            .reduce((acc, curr) => acc.concat(curr), []),
        ),
      ];

      const scale = chroma
        .scale([
          chroma("rgba(255, 99, 132, 1)"),
          chroma("rgba(54, 162, 235, 1)"),
          chroma("rgba(255, 206, 86, 1)"),
        ])
        .colors(animalList.length)
        .map((color) => chroma(color).rgba());

      const datasets = animalList.map((animal, j) => {
        return {
          label: animal,
          data: Array(windowEnds.length).fill(0),
          backgroundColor: `rgba(${scale[j].join(",")})`,
          borderColor: `rgba(${scale[j].join(",")})`,
          borderWidth: 1,
          pointRadius: 3,
          pointbackgroundColor: `rgba(${scale[j].join(",")})`,
          pointborderColor: `rgba(${scale[j].join(",")})`,
          fill: "none",
        };
      });

      for (let i = 0; i < windowEnds.length; i++) {
        for (const animal of animalList) {
          for (const res of response) {
            const index = res.result.speciesCountBulk.findIndex(
              (item) =>
                item.what === animal &&
                item.from === windowEnds[i].toISOString(),
            );
            if (index !== -1) {
              datasets[animalList.indexOf(animal)].data[i] +=
                res.result.speciesCountBulk[index].count;
            }
          }
        }
      }

      const labels = windowStarts.map((item) => {
        if (this.intervalSelection == "hours") {
          let hours = item.getHours();
          const ampm = hours >= 12 ? "pm" : "am";
          hours = hours % 12 == 0 ? 12 : hours % 12;
          return hours + ampm + " " + this.formatDate(item).slice(0, -5);
        } else if (this.intervalSelection == "weeks") {
          item.setDate(item.getDate() + 6);
          return this.formatDate(item);
        } else if (this.intervalSelection == "months") {
          item.setMonth(item.getMonth() + 1);
          const parts = this.formatDate(item).split(" ");
          return parts[1] + " " + parts[2];
        } else {
          return this.formatDate(item);
        }
      });

      this.chartData = {
        labels: labels,
        datasets: datasets,
      };
    },
    updateSelectOptions() {},
    formatDate(date) {
      const day = date.getDate();
      const month = date.getMonth();
      const year = date.getFullYear();
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      const ordinalSuffix = (day) => {
        if (day % 10 === 1 && day !== 11) {
          return day + "st";
        } else if (day % 10 === 2 && day !== 12) {
          return day + "nd";
        } else if (day % 10 === 3 && day !== 13) {
          return day + "rd";
        } else {
          return day + "th";
        }
      };

      return `${ordinalSuffix(day)} ${monthNames[month]} ${year}`;
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
            0,
          ).getDate();
          return currMonthDays * 24 * 60 * 60 * 1000;
        }
        case "years": {
          const currYearDays = new Date(
            toDateRounded.getFullYear(),
            11,
            31,
          ).getDate();
          return currYearDays * 24 * 60 * 60 * 1000;
        }
        default:
          throw new Error(`Invalid interval: ${intervalSelection}`);
      }
    },
  },
  computed: {
    selectOptions() {
      if (this.groupingSelection == "device") {
        const audioDevices = this.devices.filter((device) => {
          return device.type == "audio";
        });
        return audioDevices.map((device) => {
          return {
            id: device.id,
            name: device.deviceName,
          };
        });
      } else if (this.groupingSelection == "station") {
        return this.stations.map((station) => {
          return {
            id: station.id,
            name: station.name,
          };
        });
      }
      return null;
    },
    allSelected() {
      return this.selectOptions.length == this.selected.length;
    },
  },
};
</script>

<style></style>
