<template>
    <div class="index-time-chart-container">
        <div v-if="loading" ref="spinner-container">
            <b-spinner ref="spinner" type="border" large />
        </div>
        <div v-else ref="chart-content">
            <IndexTimeComparisonsChart :data="chartData" :options="chartOptions"></IndexTimeComparisonsChart>
            <div class="options-container">
                <div class="date-picker-container">
                    <DateRangePicker :from-date="fromDate" :to-date="toDate" @date-range-selected="updateDateRange"></DateRangePicker>
                </div>
                <div class="select-interval-container">
                    <select v-model="interval">
                        <option value="hours">Hourly</option>
                        <option value="days">Daily</option>
                        <option value="weeks">Weekly</option>
                        <option value="months">Monthly</option>
                        <option value="years">Yearly</option>
                    </select>
                </div>
            </div>
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
        const now = new Date()
        const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
        const weekAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
        return {
            inactiveAndActive: false,
            loading: true,
            devices: [],
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
            },
            fromDate: weekAgo.toISOString().substring(0,10),
            toDate: yesterday.toISOString().substring(0, 10)

        }
    },
    props: {
        groupId: {
            type: Number,
            required: true
        }
    },
    async mounted() {
        this.dateRange = 7 // days
        this.loading = true
        await this.getDevices()
        await this.getIndexData()
        this.updateGraphData()
        this.chartData = {
            "datasets": this.datasets,
            "labels": this.labels
        }
        this.loading = false
    },
    watch: {
        interval: async function() {
            this.loading =  true
            this.labels = []
            this.indexData = []

            await this.getIndexData()
            this.updateGraphData()
            this.chartData = {
                "datasets": this.datasets,
                "labels": this.labels
            }
            this.loading = false
        },
        fromDate: async function() {
            this.loading = true
            this.labels = []
            this.indexData = []

            await this.getIndexData()
            this.updateGraphData()
            this.chartData = {
                "datasets": this.datasets,
                "labels": this.labels
            }
            this.loading = false
        },
        toDate: async function() {
            this.loading = true
            this.labels = []
            this.indexData = []

            await this.getIndexData()
            this.updateGraphData()
            this.chartData = {
                "datasets": this.datasets,
                "labels": this.labels
            }
            this.loading = false
        }
    },
    methods: {
        async getDevices() {
            const result = await api.groups.getDevicesForGroup(this.groupId, this.inactiveAndActive)
            this.devices = result.result.devices
        },
        async getIndexData() {
            // Setting up range of data
            const fromDate = new Date(this.fromDate)
            var toDate = new Date(this.toDate)
            fromDate.setHours(0)
            fromDate.setMinutes(0)
            fromDate.setSeconds(0)
            fromDate.setMilliseconds(0)
            toDate.setHours(23)
            toDate.setMinutes(59)
            toDate.setSeconds(59)
            toDate.setMilliseconds(0)
            this.windowSize = (toDate.getTime() - fromDate.getTime()) / 3600000
            var interval = 1

            // Choosing the graph interval and rounding the start date to give clean sepeartion of points
            switch(this.interval) {
                case 'hours': 
                    interval = 1
                    break;
                case 'days':
                    interval = 24
                    fromDate.setHours(0)
                    break;
                case 'weeks':
                    var day = fromDate.getDay()
                    if (day != 1) {
                        fromDate.setDate(fromDate.getDate() - (day - 1))
                    }
                    fromDate.setHours(0)
                    interval = 168
                    break;
                case 'months':
                    fromDate.setHours(0)
                    fromDate.setDate(0)
                    interval = 730
                    break;
                case 'years':
                    fromDate.setHours(0)
                    fromDate.setDate(0)
                    fromDate.setMonth(0)
                    interval = 8766
                    break;
            }

            var steps = Math.round(this.windowSize/interval)
            const requests = []
            console.log(`from: ${fromDate.toLocaleDateString()}, to: ${toDate.toLocaleDateString()}, steps: ${steps}, interval: ${interval}`)
            var startDate = new Date(fromDate)
            var setLabels = false
            for (var device of this.devices) {
                for (var i = 0; i < steps; i++) {
                    startDate = new Date(fromDate)
                    switch(this.interval) {
                        case 'hours': 
                            startDate.setHours(startDate.getHours() + i)
                            break;
                        case 'days':
                            startDate.setDate(startDate.getDate() + i)
                            break;
                        case 'weeks':
                            startDate.setDate(startDate.getDate() + i*7)
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
                        if (this.interval == "weeks") {
                            startDate.setDate(startDate.getDate() + 6)
                            this.labels.push(startDate.toLocaleDateString("en-GB"))
                        } else if (this.interval == "months") {
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
        updateGraphData() {
            
            var datasets = []
            for (var device of this.devices) {
                datasets.push({
                    data: this.indexData[device.deviceName],
                    label: device.deviceName,   
                    borderColor: '#' + Math.random().toString(16).substr(-6)
                })
            }
            this.datasets = datasets
        },
        updateDateRange(event) {
            this.fromDate = event.fromDate
            this.toDate = event.toDate
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

.options-container {
    margin-top: 10px;
    display: flex;
}

.date-picker-container {
  flex: 1; /* Grow to fill remaining space */
  margin-right: 10px; /* Add margin */
}

.select-interval-container {
    flex: 1; /* Grow to fill remaining space */
    margin-left: 10px; /* Add margin */
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