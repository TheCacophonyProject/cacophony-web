<template>
    <div class="index-time-chart-container">
        <canvas :ref="'index-time-chart'"></canvas>
    </div>
  </template>
  
<script lang="ts">
import Chart from "chart.js/auto"
export default {
    name: "index-time-comparisons",
    data() {
        return {
            indexInterval: 'week'
        }
    },
    props: {
        groupName: {
            type: String,
                required: true
        },
        recordings: {
            type: Array,
            required: true
        }
    },
    mounted() {
        this.renderLineChart()
        console.log(this.recordings)
    },
    methods: {
        renderLineChart() {
            const ctx = this.$refs['index-time-chart']
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr'],
                    datasets: [{
                        data: [34, 41, 12, 54]
                    }]
                }
            })
        }
    }
}

</script>
<style scoped lang="scss">


</style>