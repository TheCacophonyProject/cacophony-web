<template>
  <div>
    <canvas ref="speciesComparisonChart" @mouseleave="resetLabels"></canvas>
  </div>
</template>

<script>
import Chart from "chart.js/auto";

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
    originalLabels: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      chartInstance: null,
    };
  },
  mounted() {
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
