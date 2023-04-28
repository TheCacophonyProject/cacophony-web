<template>
  <div class="average-species-visits-container">
    <div v-if="loading">
      <b-spinner ref="spinner" type="border" large />
    </div>
    <div v-else>
      <average-species-visits-chart
        :data="chartData"
        :options="chartOptions"
      ></average-species-visits-chart>
    </div>
  </div>
</template>

<script lang="ts">
import AverageSpeciesVisitsChart from "../Video/AverageSpeciesVisitsChart.vue";
import api from "@/api";
import chroma from "chroma-js";

export default {
  name: "average-species-visits",
  components: {
    AverageSpeciesVisitsChart,
  },
  props: {
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
  data() {
    return {
      loading: false,
      chartData: {
        labels: [],
        datasets: [{}],
      },
      chartOptions: {
        plugins: {
          title: {
            display: true,
            text: `Average Daily Species Visits Per ${this.groupingSelection}`,
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
        },
        responsive: true,
        scales: {
          x: {
            display: true,
          },
          y: {
            display: true,
          },
        },
      },
    };
  },
  async mounted() {
    await this.getSpeciesData();
  },
  methods: {
    async getSpeciesData() {
      this.loading = true;
      const thermalDevices = this.devices.filter(
        (device) => device.type == "audio"
      );
      const iterable =
        this.groupingSelection == "device" ? thermalDevices : this.stations;
      const labels = iterable.map((item) =>
        item.name ? item.name : item.deviceName
      );
      const ids = iterable.map((item) => item.id);
      const requests = [];
      const daysActiveRequests = [];

      for (let i = 0; i < ids.length; i++) {
        requests.push({
          id: ids[i],
          name: iterable[i].name ? iterable[i].name : iterable[i].deviceName,
          from: this.fromDate.toISOString(),
          "window-size": this.windowSize,
        });
        daysActiveRequests.push({
          id: ids[i],
          from: this.fromDate.toISOString(),
          "window-size": this.windowSize,
        });
      }

      var response = await Promise.all(
        requests.map(async (req) => {
          var res = null;
          if (this.groupingSelection == "device") {
            res = await api.device.getDeviceSpeciesCount(
              req["id"],
              req["from"],
              req["window-size"],
              false,
              "video"
            );
          } else if (this.groupingSelection == "station") {
            res = await api.station.getStationSpeciesCount(
              req["id"],
              req["from"],
              req["window-size"],
              false,
              "video"
            );
          }
          const result = res.result;
          if (result.success) {
            return {
              id: req["id"],
              name: req["name"],
              speciesCounts: result.speciesCount,
              from: req["from"],
              "window Size": req["window-size"],
            };
          }
        })
      );

      var daysActiveResponse = await Promise.all(
        daysActiveRequests.map(async (req) => {
          var res = null;
          if (this.groupingSelection == "device") {
            res = await api.device.getDeviceDaysActive(
              req["id"],
              req["from"],
              req["window-size"]
            );
          } else if (this.groupingSelection == "station") {
            // res = await api.station.getStationDaysActive(req["id"], req["from"], req["window-size"])
          }
          const result = res.result;
          if (result.success) {
            return {
              id: req["id"],
              daysActive: result.activeDaysCount,
            };
          }
        })
      );
      var daysActive = daysActiveResponse;

      const allSpecies = new Set();

      response.forEach((entry) => {
        entry.speciesCounts.forEach((w) => {
          allSpecies.add(w.what);
        });
      });
      const colors = chroma
        .scale([
          chroma("rgba(255, 99, 132, 1)"),
          chroma("rgba(54, 162, 235, 1)"),
          chroma("rgba(255, 206, 86, 1)"),
        ])
        .colors(allSpecies.size);

      const datasets = [];
      for (const species of allSpecies) {
        datasets.push({
          label: species,
          data: [],
        });
      }

      for (const res of response) {
        for (let i = 0; i < datasets.length; i++) {
          const speciesCount = res.speciesCounts.find(
            (item) => item.what == datasets[i].label
          );
          datasets[i].data.push(speciesCount ? speciesCount.count : 0);
        }
      }

      for (let i = 0; i < datasets.length; i++) {
        datasets[i].data = datasets[i].data.map((item, index) =>
          daysActive[index].daysActive > 0
            ? item / daysActive[index].daysActive
            : 0
        );
        datasets[i].backgroundColor = colors[i];
        datasets[i].borderColor = "rgba(0,0,0,1)";
        datasets[i].borderWidth = 2;
      }

      this.chartData = {
        labels: labels,
        datasets: datasets,
      };

      this.loading = false;
    },
    async handleParameterChange() {
      this.loading = true;
      var intervalDescription = "";
      switch (this.intervalSelection) {
        case "hours":
          intervalDescription = "Hourly";
          break;
        case "days":
          intervalDescription = "Daily";
          break;
        case "weeks":
          intervalDescription = "Weekly";
          break;
        case "months":
          intervalDescription = "Monthly";
          break;
        case "years":
          intervalDescription = "Yearly";
          break;
      }
      this.chartOptions.plugins.title.text = `Average ${intervalDescription} Species Visits Per ${this.groupingSelection}`;
      await this.getSpeciesData();

      this.loading = false;
    },
  },
  watch: {
    groupingSelection: function () {
      this.handleParameterChange();
    },
    intervalSelection: function () {
      this.handleParameterChange();
    },
    devices: function () {
      this.getSpeciesData();
    },
    fromDate: function () {
      this.handleParameterChange();
    },
    toDate: function () {
      this.handleParameterChange();
    },
  },
  computed: {
    windowSize() {
      return Math.ceil(
        (this.toDate.getTime() - this.fromDate.getTime()) / 3600000
      );
    },
  },
};
</script>

<style></style>
