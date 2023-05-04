<template>
  <div class="species-comparisons-container">
    <div v-if="loading">
      <b-spinner ref="spinner" type="border" large />
    </div>
    <div v-else>
      <species-comparisons-chart
        :data="chartData"
        :options="chartOptions"
        :originalLabels="originalLabels"
      ></species-comparisons-chart>
    </div>
  </div>
</template>

<script lang="ts">
import api from "@/api";
import SpeciesComparisonsChart from "../Audio/SpeciesComparisonsChart.vue";
import chroma from "chroma-js";

export default {
  name: "species-comparisons",
  components: {
    SpeciesComparisonsChart,
  },
  data() {
    return {
      loading: false,
      chartData: {
        labels: [],
        datasets: [{}],
      },
      originalLabels: [],
      chartOptions: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
          },
          title: {
            display: true,
            text: "Percentage of Identified Species per Device (%)",
            position: "top",
            font: { size: 18 },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const label = context.dataset.label || "";
                return `${label}`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true,
          },
        },
        onHover: (event, chartElements, chart) => {
          const nearestElements = chart.getElementsAtEventForMode(
            event,
            "nearest",
            { intersect: true },
            true
          );
          if (nearestElements.length > 0) {
            const dataIndex = nearestElements[0].index;
            chart.data.datasets.forEach((dataset, index) => {
              const value = dataset.data[dataIndex];
              dataset.label = `${this.originalLabels[index]}: ${value}%`;
            });
            chart.update();
          }
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
    await this.getSpeciesCounts();
    this.originalLabels = this.chartData.datasets.map(
      (dataset) => dataset.label
    );
  },
  watch: {
    groupingSelection: function () {
      this.handleParameterChange();
    },
    devices: function () {
      this.getSpeciesCounts();
    },
    fromDate: function () {
      this.handleParameterChange();
    },
    toDate: function () {
      this.handleParameterChange();
    },
  },
  methods: {
    async handleParameterChange() {
      this.loading = true;
      this.chartData.labels = [];
      this.chartData.datasets = [];
      if (this.groupingSelection == "device") {
        this.chartOptions.plugins.title.text =
          "Percentage of Identified Species per Device (%)";
      } else if (this.groupingSelection == "station") {
        this.chartOptions.plugins.title.text =
          "Percentage of Identified Species per Station (%)";
      }
      await this.getSpeciesCounts();
      this.loading = false;
    },
    async getSpeciesCounts() {
      this.loading = true;
      var requests = [];
      var windowSize = Math.ceil(
        (this.toDate.getTime() - this.fromDate.getTime()) / 3600000
      );
      const audioDevices = this.devices.filter(
        (device) => device.type == "audio"
      );

      if (this.groupingSelection == "device") {
        for (var device of audioDevices) {
          requests.push({
            id: device.id,
            name: device.deviceName,
            from: this.toDate.toISOString(),
            "window-size": windowSize,
          });
        }
      } else if (this.groupingSelection == "station") {
        for (var station of this.stations) {
          requests.push({
            id: station.id,
            name: station.name,
            from: this.toDate.toISOString(),
            "window-size": windowSize,
          });
        }
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
              "audio"
            );
          } else if (this.groupingSelection == "station") {
            res = await api.station.getStationSpeciesCount(
              req["id"],
              req["from"],
              req["window-size"],
              false,
              "audio"
            );
          }
          const result = res.result;
          if (result.success) {
            return {
              id: req["id"],
              name: req["name"],
              what: result.speciesCount,
              from: req["from"],
              "window Size": req["window-size"],
            };
          }
        })
      );

      response = response.filter((res) => res.what.length != 0);
      var labels = response.map((res) => res.name);
      const allWhats = new Set();

      response.forEach((entry) => {
        entry.what.forEach((w) => {
          allWhats.add(w.what);
        });
      });

      const deviceCounts = response.map((entry) => {
        return entry.what.reduce((acc, w) => {
          return acc + w.count;
        }, 0);
      });

      const colors = chroma
        .scale([
          chroma("rgba(255, 99, 132, 1)"),
          chroma("rgba(54, 162, 235, 1)"),
          chroma("rgba(255, 206, 86, 1)"),
        ])
        .colors(allWhats.size);

      const datasets = [...allWhats].map((what, i) => {
        return {
          label: what,
          data: response.map((r, j) => {
            const w = r.what.find((w) => w.what === what);
            const count = w ? w.count : 0;
            const proportion =
              deviceCounts[j] > 0 ? count / deviceCounts[j] : 0;
            return (proportion * 100).toFixed(1);
          }),
          backgroundColor: colors[i],
        };
      });
      // Make this work for all devices
      this.chartData = {
        labels: labels,
        datasets: datasets,
      };

      this.loading = false;
    },
    updateSelectOptions() {
      if (this.groupingSelection == "device") {
        const audioDevices = this.devices.filter(
          (device) => device.type == "audio"
        );
        this.selectOptions = audioDevices.map((device) => ({
          name: `${device.deviceName.slice(0, 25)}${
            device.deviceName.length > 25 ? "..." : ""
          }`,
          id: device.id,
        }));
      } else if (this.groupingSelection == "station") {
        this.selectOptions = this.stations.map((station) => ({
          name: `${station.name.slice(0, 25)}${
            station.name.length > 25 ? "..." : ""
          }`,
          id: station.id,
        }));
      }
    },
  },
};
</script>

<style></style>
