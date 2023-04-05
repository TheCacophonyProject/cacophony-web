<template>
    <div class="index-time-chart-container">
        <div v-if="loading" ref="spinner-container">
            <b-spinner ref="spinner" type="border" large />
        </div>
        <div v-else ref="chart-content">
            <IndexTimeComparisonsChart :data="chartData" :options="chartOptions"></IndexTimeComparisonsChart>
        </div>
    </div>
  </template>
  
<script lang="ts">
import Chart from "chart.js/auto"
import api from "@api"
import IndexTimeComparisonsChart from "./IndexTimeComparisonsChart.vue"
import DateRangePicker from "./DateRangePicker.vue"


export default {
    name: "index-time-comparisons",
    components: {
        IndexTimeComparisonsChart,
        DateRangePicker
    },
    data() {
        return {
            inactiveAndActive: false,
            loading: true,
            indexData: [],
            labels: [],
            datasets: [],
            chart: null,
            interval: 'days',
            chartOptions: {
                plugins: {
                    legend: {
                        display: true,
                        position: 'right'
                        
                    },
                    title: {
                        display: true,
                        text: "Change in Cacophony Index By Device (%)",
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                    }
                }
            },
            chartData: {
                labels: [],
                datasets: []
            }
        }
    },
    props: {
        groupId: {
            type: Number,
            required: true
        },
        devices: {
            type: Array,
        },
        deviceColours: {
            type: Array
        },
        groupingSelection: {
            type: String,
            required: true
        },
        intervalSelection: {
            type: String,
            required: true
        },
        fromDate: {
            type: Date,
            required: true
        },
        toDate: {
            type: Date,
            required: true
        }
    },
    async mounted() {
        this.dateRange = this.toDate - this.fromDate // days
        this.loading = true
        if (this.groupingSelection == "device") {
            this.labels = []
            this.indexData = []
            await this.getIndexData()
            this.updateDeviceGraphData()
            this.chartData = {
                "datasets": this.datasets,
                "labels": this.labels
            }   
        } else if (this.groupingSelection == "station") {

        }
        this.loading = false   
    },
    watch: {
        intervalSelection: async function() {
            this.handleParameterChange()
        },
        fromDate: async function() {
            this.handleParameterChange()
        },
        toDate: async function() {
            this.handleParameterChange()
        },
        groupingSelection: async function() {
            this.handleParameterChange()
        },
        devices: async function() {
            console.log("devices changed")
            this.handleParameterChange()
        }
    },
    methods: {
        async getIndexData() {
            // Setting up range of data
            const fromDateRounded = new Date(this.fromDate)
            var toDateRounded = new Date(this.toDate)
            var interval = 1

            // Choosing the graph interval and rounding the start date to give clean sepeartion of points
            switch(this.intervalSelection) {
                case 'hours': 
                    interval = 1
                    break;
                case 'days':
                    interval = 24
                    break;
                case 'weeks':
                    var day = fromDateRounded.getDay()
                    if (day != 1) {
                        fromDateRounded.setDate(fromDateRounded.getDate() - (day - 1))
                    }
                    var toDay = toDateRounded.getDay()
                    if (toDay != 0) {
                        toDateRounded.setDate(toDateRounded.getDate() + (7 - toDay))
                    }
                    interval = 168
                    break;
                case 'months':
                    fromDateRounded.setDate(0)
                    interval = 730
                    break; 
                case 'years':
                    fromDateRounded.setDate(0)
                    fromDateRounded.setMonth(0)
                    interval = 8766
                    break;
            }
            this.windowSize = (toDateRounded.getTime() - fromDateRounded.getTime()) / 3600000
            var steps = Math.round(this.windowSize/interval)
            const requests = []
            console.log(`from: ${fromDateRounded.toLocaleDateString()}, to: ${toDateRounded.toLocaleDateString()}, steps: ${steps}, interval: ${interval}, windowSize: ${this.windowSize}`)
            var startDate = new Date(fromDateRounded)
            var setLabels = false
            for (var device of this.devices) {
                for (var i = 0; i < steps; i++) {
                    startDate = new Date(fromDateRounded)
                    switch(this.intervalSelection) {
                        case 'hours': 
                            startDate.setHours(startDate.getHours() + i)
                            break;
                        case 'days':
                            startDate.setDate(startDate.getDate() + i)
                            break;
                        case 'weeks':
                            startDate.setDate(startDate.getDate() + (i*7))
                            break;
                        case 'months':
                            startDate.setMonth(startDate.getMonth() + i)
                            break;
                        case 'years':
                            startDate.setFullYear(startDate.getFullYear() + i)
                            break;
                    }
                    requests.push({
                        "id": device.id,
                        "name": device.deviceName,
                        "from": startDate.toISOString(),
                        "window-size": interval
                    })
                    if (!setLabels) {
                        if (this.intervalSelection == "weeks") {
                            startDate.setDate(startDate.getDate() + 6)
                            this.labels.push("Week ending " + startDate.toLocaleDateString("en-GB"))
                        } else if (this.intervalSelection == "months") {
                            startDate.setMonth(startDate.getMonth() + 1)
                            this.labels.push(startDate.toLocaleDateString("en-GB").substring(3,))
                        } else {
                            this.labels.push(startDate.toLocaleDateString("en-GB"))
                        }
                        
                    }
                }
                setLabels = true
            }
            const response = await Promise.all(
                requests.map(async req => {
                    const res = await api.device.getDeviceCacophonyIndex(req["id"], req["from"], req["window-size"])
                    var index: number
                    if (res.result.cacophonyIndex !== undefined) {
                        index = res.result.cacophonyIndex
                    } else {
                        index = null
                    }
                    return {
                        "name": req["name"],
                        "cacophonyIndex": index,
                        "from": req["from"],
                        "window Size": req["window-size"]
                    }
                })
            )

            var data = {
            }
            for (var res of response) {
                if (res["name"] in data) {
                    data[res["name"]].push(res["cacophonyIndex"])
                } else {
                    data[res["name"]] = [res["cacophonyIndex"]]
                }
            }
            this.indexData = data
        },
        updateDeviceGraphData() {
            var datasets = []
            var i = 0
            for (var device of this.devices) {
                datasets.push({
                    data: this.indexData[device.deviceName],
                    label: device.deviceName,   
                    borderColor: this.deviceColours[i]
                })
                i += 1
            }
            this.datasets = datasets
        },
        async handleParameterChange() {
            this.loading = true
            if (this.groupingSelection == "device") {
                this.labels = []
                this.indexData = []
                await this.getIndexData()
                this.updateDeviceGraphData()
                this.chartData = {
                    "datasets": this.datasets,
                    "labels": this.labels
                }   
            } else if (this.groupingSelection == "station") {

            }
            this.loading = false   
        }
        
    }
}

</script>
<style scoped lang="scss">
.index-time-chart-container {
//   display: flex; /* Set display to flex */
  align-items: stretch; /* Stretch items to fill container vertically */
  justify-content: center; /* Center items horizontally */
  position: relative; /* Set position to relative */
}


.spinner-container {
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
}
.spinner {
    flex: 1;
}

</style>