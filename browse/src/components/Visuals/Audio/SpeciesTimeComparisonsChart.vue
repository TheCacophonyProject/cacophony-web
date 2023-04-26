<template>
    <div>
      <canvas ref="speciesTimeComparisonChart" ></canvas>
    </div>
  </template>
  
<script>
import  Chart  from 'chart.js/auto';
  
export default {
name: "SpeciesTimeComparisonChart",
props: {
    data: {
        type: Object,
        required: true
    },
    options: {
        type: Object,
        required: true
    }
},
data() {
    return {
        chartInstance: null
    }
},
mounted() {
    this.createChart();
},
methods: {
    createChart() {
    if (this.chartInstance) {
        this.chartInstance.destroy()
    }
    const ctx = this.$refs.speciesTimeComparisonChart.getContext('2d');
    this.chartInstance = new Chart(ctx, {
        type: 'line',
        data: this.data,
        options: this.options,
    })
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
}
};
</script>