<template>
    <div>
      <canvas ref="indexTimeComparisonsChart" ></canvas>
    </div>
  </template>
  
  <script>
  import Chart from 'chart.js/auto';
  
  export default {
    name: "IndexTimeComparisonsChart",
    props: ['data', 'options'],
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
        const ctx = this.$refs.indexTimeComparisonsChart.getContext('2d');
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