<template>
    <div class="index-time-chart-container">
        <canvas :ref="'index-time-chart'"></canvas>
        <DateRange v-model="dateRange" :vertical="false"/>
    </div>
  </template>
  
<script lang="ts">
import Chart from "chart.js/auto"
import DateRange from "../Analysis/DateRange.vue"
import api from "@api"
import { faCommentsDollar } from "@fortawesome/free-solid-svg-icons"

export default {
    name: "index-time-comparisons",
    components: {
        DateRange
    },
    data() {
        return {
            from: null,
            windowSize: 2160,
            inactiveAndActive: false,
            vertical: false,
            devices: [],
            indexData: [],
            labels: [],
            datasets: []
        }
    },
    props: {
        groupId: {
            type: Number,
            required: true
        }
    },
    async mounted() {
        // this.from = new Date(this.from - 7)
        // console.log(this.from.toISOString())
        await this.getDevices()
        await this.getIndexData()
        console.log(this.indexData)
        console.log(this.labels)
        console.log(this.devices)
        var datasets = []
        for (var device of this.devices) {
            console.log(`Key: ${device.deviceName}`)
            datasets.push({
                data: this.indexData[device.deviceName],
                label: device.deviceName,
                borderColor: '#B5DF96'
            })
        }
        this.datasets = datasets
        console.log(datasets)
        
        this.renderLineChart()
    },
    watch: {
        dateRange: function() {
            this.getIndexData()
        }
    },
    methods: {
        async getDevices() {
            const result = await api.groups.getDevicesForGroup(this.groupId, this.inactiveAndActive)
            this.devices = result.result.devices
        },
        async getIndexData() {
            // Setting up range of data
            const fromDate = new Date()
            fromDate.setDate(fromDate.getDate() - this.dateRange)
            this.from = fromDate // Start date
            this.windowSize = this.dateRange * 24 // Window size in hours

            var steps = 10
            if (this.dateRange == 7 || this.dateRange == 1) {
                steps = 12
            }
            const interval = this.windowSize/steps
            const requests = []

            // for (var device of this.devices) {
            //     for (var i = 0; i < steps; i++) {
            //         var startDate = new Date(this.from)
            //         startDate.setHours(startDate.getHours() + interval*i)
            //         requests.push({
            //             "id": device.id,
            //             "name": device.deviceName,
            //             "from": startDate.toISOString(),
            //             "window-size": interval
            //         })
            //     }
            // }
            for (var i = 0; i < steps; i++) {
                var startDate = new Date(this.from)
                startDate.setHours(startDate.getHours() + interval*i)
                this.labels.push(startDate.toISOString().substring(0,10))
            }
            // console.log(requests)
            // console.log(`From: ${this.from} for ${this.windowSize} hours`)
            // console.log(this.devices)
            
            // const response = await Promise.all(
            //     requests.map(async req => {
            //         const res = await api.device.getDeviceCacophonyIndex(req["id"], req["from"], req["window-size"])
            //         return {
            //             "name": req["name"],
            //             "cacophonyIndex": res.cacophonyIndex,
            //             "from": req["from"]
            //         ]
            //     })
            // )
            
            // Temp spoofing response while fixing cacophony index endpoint
            const response = [
                {
                    "name": "blah",
                    "cacophonyIndex": 41.2,
                    "from": "2023-02-20T06:55:53.094Z",
                    "to": "2023-02-23T06:55:53.094Z"
                },
                {
                    "name": "blah",
                    "cacophonyIndex": 46.2,
                    "from": "2023-02-23T06:55:53.094Z",
                    "to": "2023-02-26T06:55:53.094Z"
                },
                {
                    "name": "blah",
                    "cacophonyIndex": 31.2,
                    "from": "2023-02-26T06:55:53.094Z",
                    "to": "2023-02-23T06:55:53.094Z"
                },
                {
                    "name": "blah",
                    "cacophonyIndex": 71.2,
                    "from": "2023-02-20T06:55:53.094Z",
                    "to": "2023-02-23T06:55:53.094Z"
                },
                {
                    "name": "blah2",
                    "cacophonyIndex": 23.2,
                    "from": "2023-02-20T06:55:53.094Z",
                    "to": "2023-02-23T06:55:53.094Z"
                },
                {
                    "name": "blah2",
                    "cacophonyIndex": 12.2,
                    "from": "2023-02-23T06:55:53.094Z",
                    "to": "2023-02-26T06:55:53.094Z"
                },
                {
                    "name": "blah2",
                    "cacophonyIndex": 21.2,
                    "from": "2023-02-26T06:55:53.094Z",
                    "to": "2023-02-23T06:55:53.094Z"
                },
                {
                    "name": "blah2",
                    "cacophonyIndex": 27.2,
                    "from": "2023-02-20T06:55:53.094Z",
                    "to": "2023-02-23T06:55:53.094Z"
                },
            ]
            this.devices = [{"deviceName": "blah"}, {"deviceName": "blah2"}]

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
        renderLineChart() {
            const ctx = this.$refs['index-time-chart']
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: this.labels,
                    datasets: this.datasets
                },
                options: {
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
                }
            })
        },
    },
    computed: {
        dateRange: {
            get() {
                return this.$store.state.User.analysisDatePref;
            },
            set(value) {
                this.$store.commit("User/updateAnalysisDatePref", value);
            },
        }
    }
}

</script>
<style scoped lang="scss">


</style>