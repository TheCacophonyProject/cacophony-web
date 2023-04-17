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
                        position: 'top'
                        
                    },
                    title: {
                        display: true,
                        text: "Change in Cacophony Index By Device (%)",
                        position: 'top',
                        font: {size: 18}
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
        stations: {
            type: Array,
        },
        colours: {
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
        this.labels = []
        this.indexData = []
        await this.getIndexData()
        if (this.groupingSelection == "device") {
            this.updateDeviceGraphData()
        } else if (this.groupingSelection == "station") {
            this.updateStationGraphData()
        }
        this.chartData = {
            "datasets": this.datasets,
            "labels": this.labels
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
            var startDate = new Date(toDateRounded)
            var setLabels = false
            var iterable = []
            if (this.groupingSelection == "device") {
                iterable = this.devices
            } else if (this.groupingSelection == "station") {
                iterable = this.stations
            }
            for (var obj of iterable) {
                for (var i = 0; i < steps; i++) {
                    startDate = new Date(toDateRounded)
                    switch(this.intervalSelection) {
                        case 'hours': 
                            startDate.setHours(startDate.getHours() - i)
                            break;
                        case 'days':
                            startDate.setDate(startDate.getDate() - i)
                            break;
                        case 'weeks':
                            startDate.setDate(startDate.getDate() - (i*7))
                            break;
                        case 'months':
                            startDate.setMonth(startDate.getMonth() - i)
                            break;
                        case 'years':
                            startDate.setFullYear(startDate.getFullYear() - i)
                            break;
                    }
                    if (this.groupingSelection == "device") {
                        requests.push({
                        "id": obj.id,
                        "name": obj.deviceName,
                        "from": startDate.toISOString(),
                        "window-size": interval
                        })
                    } else if (this.groupingSelection == "station") {
                        requests.push({
                            "id": obj.id,
                            "name": obj.name,
                            "from": startDate.toISOString(),
                            "window-size": interval
                        })
                    }
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
            requests.reverse()
            this.labels.reverse()

            if (requests.length > 600) {
                this.loading = false
                this.$emit("tooManyRequests")
                return
            }
            const response = await Promise.all(
                requests.map(async req => {
                    var res = null
                    if (this.groupingSelection == "device") {
                        res = await api.device.getDeviceCacophonyIndex(req["id"], req["from"], req["window-size"])
                    } else if (this.groupingSelection == "station") {
                        res = await api.station.getStationCacophonyIndex(req["id"], req["from"], req["window-size"])
                    }
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
                if (this.indexData[device.deviceName] != null) {
                    datasets.push({
                        data: this.indexData[device.deviceName],
                        label: device.deviceName,   
                        borderColor: this.colours[i]
                    })
                    i += 1
                }
            }
            this.datasets = datasets
        },
        updateStationGraphData() {
            
            var datasets = []
            var i = 0
            for (var station of this.stations) {
                if (this.indexData[station.name] != null) {
                    datasets.push({
                        data: this.indexData[station.name],
                        label: station.name,   
                        borderColor: this.colours[i]
                    })
                    i += 1
                }
            }
            this.datasets = datasets
        },
        async handleParameterChange() {
            this.loading = true
            this.labels = []
            this.indexData = []
            await this.getIndexData()
            if (this.groupingSelection == "device") {
                this.updateDeviceGraphData()
                this.chartOptions.plugins.title.text = "Change in Cacophony Index By Device (%)"
            } else if (this.groupingSelection == "station") {
                this.updateStationGraphData()
                this.chartOptions.plugins.title.text = "Change in Cacophony Index By Station (%)"
            }
            this.chartData = {
                "datasets": this.datasets,
                "labels": this.labels
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