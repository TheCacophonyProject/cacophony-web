<template>
  <div>
    <canvas ref="speciesComparisonChart" @mouseleave="resetLabels"></canvas>
  </div>
</template>

<script>
import Chart from "chart.js/auto";
import { chart } from "highcharts";

export default {
  name: "SpeciesComparisonChart",
  props: {
    data: {
      type: Object,
      required: true,
    },
    options: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      chartInstance: null,
      originalLabels: [],
    };
  },
  mounted() {
    this.originalLabels = this.data.datasets.map((dataset) => dataset.label);
    this.options.plugins.legend = {
      position: "bottom",
    };
    this.addLabelHover();
    this.createChart();
  },
  methods: {
    createChart() {
      if (this.chartInstance) {
        this.chartInstance.destroy();
      }
      const ctx = this.$refs.speciesComparisonChart.getContext("2d");
      this.chartInstance = new Chart(ctx, {
        type: "bar",
        data: this.data,
        options: this.options,
      });
    },
    addLabelHover() {
      this.options.onHover = (event, chartElements, chart) => {
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
        } else {
          this.resetLabels();
        }
      };
    },
    resetLabels() {
      this.chartInstance.data.datasets.forEach((dataset, index) => {
        dataset.label = this.originalLabels[index];
      });
      this.chartInstance.update();
    },
  },
  watch: {
    data(newData, oldData) {
      if (newData !== oldData) {
        this.createChart();
      }
    },
    options() {
      this.createChart();
    },
  },
  beforeUnmount() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  },
};
</script>
