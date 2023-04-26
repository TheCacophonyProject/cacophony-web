<template>
    <div>
        <canvas ref="indexComparisonsChart" ></canvas>
    </div>
</template>

<script lang="ts">
import Chart from "chart.js/auto"

export default {
    name: "indexComparisonsChart",
    data() {
        return {
            chartInstance: null
        }
    },
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
    mounted() {
        this.createChart()
    },
    methods: {
        createChart() {
            if (this.chartInstance) {
                this.chartInstance.destroy()
            }
            const ctx = this.$refs.indexComparisonsChart.getContext('2d');
            this.chartInstance = new Chart(ctx, {
                type: 'bar',
                data: this.data,
                options: this.options,
            })
        }
    },
    watch: {
      data(newData, oldData) {
        if (newData !== oldData) {
            this.createChart()
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
}

</script>