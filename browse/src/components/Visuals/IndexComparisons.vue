<template>
    <div class="index-chart-container">
        <canvas :ref="'index-chart'"></canvas>
    </div>
  </template>
  
  <script lang="ts">
  import Chart from "chart.js/auto"
  export default {
    name: "index-comparisons",
    data() {
        return {
            deviceAverages: {},
            deviceNames: {},
            deviceMap: {},
            totalDeviceCount: 0,
            totalIndexSum: 0
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
        },
        overallAverage: { 
            type: Number, 
            required: false 
        },
    },
    mounted() {
        this.deviceAverages = this.getDeviceAverages()
        this.deviceNames = this.getDeviceNames()
        this.deviceMap = this.getDeviceMap(this.deviceAverages, this.deviceNames)
        if (Object.keys(this.deviceMap).length >= 2){
            this.deviceMap[this.groupName + ' average'] = this.totalIndexSum / this.totalDeviceCount
        }
        this.renderBarChart()
    },
    methods: {
        getDeviceAverages() {
            let deviceCounts: { [id : number] : number } = {}
            let deviceIndexSum: { [id : number] : number } = {}
            let deviceAverage: { [id : number] : number } = {}
            for (var key in this.recordings) {
                let deviceId: number = this.recordings[key]['deviceId']
                if ('cacophonyIndex' in this.recordings[key]) {
                let averageIndex: number = 0
                let indexes: Array<Object> = this.recordings[key]['cacophonyIndex']
                for (var section in indexes) {
                    averageIndex += indexes[section]['index_percent']
                }
                averageIndex = averageIndex/Object.keys(indexes).length
                if (deviceId in deviceCounts) {
                    deviceCounts[deviceId] += 1
                    deviceIndexSum[deviceId] += averageIndex
                } else {
                    deviceCounts[deviceId] = 1
                    deviceIndexSum[deviceId] = averageIndex
                }
                this.totalDeviceCount += 1
                this.totalIndexSum += averageIndex
                }
            }
            for (var key in deviceCounts) {
                deviceAverage[key] = deviceIndexSum[key]/deviceCounts[key]
            }
            return deviceAverage
        },
        getDeviceNames(): { [id : number] : string } {
            let deviceNames: { [id : number] : string } = {}
            for (var key in this.recordings) {
                let deviceId: number = this.recordings[key]['deviceId']
                let deviceName: string = this.recordings[key]['deviceName']
                if (!(deviceName in deviceNames)) {
                deviceNames[deviceId] = deviceName
                }
            }
            return deviceNames 
        },
        getDeviceMap(deviceAverages, deviceNames) {
            var deviceMap: { [id: string] : number} = {}
            for (var id in deviceAverages) {
                deviceMap[deviceNames[id]] = deviceAverages[id]
            }
            return deviceMap
        },
        renderBarChart() {
            const ctx = this.$refs['index-chart']
            const columnCount = Object.keys(this.deviceMap).length
            const colourArray = Array(columnCount).fill('#B5DF96')
            if (columnCount > 1) {
                colourArray[columnCount-1] = '#81a667'
            }
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(this.deviceMap),
                    datasets: [{
                        data: Object.keys(this.deviceMap).map((key) => this.deviceMap[key]),
                        backgroundColor: colourArray
                    }]
                },
                options: {
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.dataset.label || ''
                                    const value = context.parsed.y.toFixed(0)
                                    return `${value}%`
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: "Cacophony Index By Device (%)",
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                        }
                    }
                }
            })
        }
    }
}
</script>

<style scoped lang="scss">


</style>