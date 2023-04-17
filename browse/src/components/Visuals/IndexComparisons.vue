<template>
    <div class="index-chart-container">
        <div v-if="loading" ref="spinner-container">
            <b-spinner ref="spinner" type="border" large />
        </div>
        <div v-else ref="chart-content">
            <IndexComparisonsChart :data="chartData" :options="chartOptions" ></IndexComparisonsChart>
        </div>
        
    </div>
  </template>
  
  <script lang="ts">
  import Chart from "chart.js/auto"
  import api from "@/api"
  import IndexComparisonsChart from "./IndexComparisonsChart.vue"


  export default {
    name: "index-comparisons",
    components: {
        IndexComparisonsChart,
    },
    data() {
        return {
            loading: false,
            datasets: [],
            labels: [],
            chartTitle: "Cacophony Index By Device (%)",
            chartOptions: {
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
                        position: 'top',
                        font: {size: 18}
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                    }, 
                    x: {
                        barSpacing: 10
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
        groupName: {
            type: String,
             required: true
        },
        groupId: {
            type: Number,
            required: true
        },
        stations: {
            type: Array,
        },
        devices: {
            type: Array,
        },
        colours: {
            type: Array,
        },
        groupingSelection: {
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
        this.loading = true
        await this.getDevicesCacophonyIndex()
        this.chartData = {
            "datasets": this.datasets,
            "labels": this.labels
        }
        this.loading = false
    },
    watch: {
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
        async getDevicesCacophonyIndex() {
            var requests = []
            var windowSize = Math.ceil((this.toDate.getTime() - this.fromDate.getTime()) / 3600000)
            if (this.groupingSelection == "device") {
                for (var device of this.devices) {
                    requests.push({
                            "id": device.id,
                            "name": device.deviceName,
                            "from": this.toDate.toISOString(),
                            "window-size": windowSize
                        })
                }
            } else if (this.groupingSelection == "station") {
                for (var station of this.stations) {
                requests.push({
                        "id": station.id,
                        "name": station.name,
                        "from": this.toDate.toISOString(),
                        "window-size": windowSize
                    })
                }
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
            var data = []
            var labels = []
            for (var res of response) {
                if (res.cacophonyIndex !== null) {
                    data.push(res.cacophonyIndex)
                    if (res.name.length > 20) {
                        labels.push(res.name.substring(0, 20) + "...")
                    } else {
                        labels.push(res.name)
                    }
                }
            }
            if (data.length > 1) {
                const average = data.reduce((a, b) => parseFloat(a) + parseFloat(b)) / data.length;
                data.push(average)
                labels.push("Group Average")
                this.colours.push('#148226')
            }
            
            this.datasets = [{
                "data": data,
                "backgroundColor": this.colours,
            }]
            this.labels = labels
        },
        async handleParameterChange() {
            this.loading = true
            this.labels = []
            this.indexData = []
            await this.getDevicesCacophonyIndex()
            this.chartData = {
                "datasets": this.datasets,
                "labels": this.labels
            }   
            if (this.groupingSelection == "device") {
                this.chartOptions.plugins.title.text = "Cacophony Index By Device (%)"
            } else if (this.groupingSelection == "station") {
                this.chartOptions.plugins.title.text = "Cacophony Index By Station (%)"
            }
            this.loading = false   
        },
    }
}
</script>

<style scoped lang="scss">


</style>