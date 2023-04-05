<template>
    <div class="index-chart-container">
        <!-- <canvas :ref="'index-chart'"></canvas> -->
        <IndexComparisonsChart :data="chartData" :options="chartOptions" ></IndexComparisonsChart>
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
            // devices: [],
            datasets: [],
            labels: [],
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
                        position: 'top'
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
        devices: {
            type: Array,
            default: () => []
        },
        deviceColours: {
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
        if (this.groupingSelection == "device") {
            await this.getDevicesCacophonyIndex()
            this.chartData = {
                "datasets": this.datasets,
                "labels": this.labels
            }
        }
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
            for (var device of this.devices) {
                requests.push({
                        "id": device.id,
                        "name": device.deviceName,
                        "from": this.fromDate.toISOString(),
                        "window-size": windowSize
                    })
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

            var data = []
            var labels = []
            for (var res of response) {
                if (res.cacophonyIndex !== null) {
                    data.push(res.cacophonyIndex)
                    labels.push(res.name)
                }
            }
            if (data.length > 1) {
                const average = data.reduce((a, b) => a + b) / data.length;
                data.push(average)
                labels.push("Group Average")
                this.deviceColours.push('#148226')
            }
            
            this.datasets = [{
                "data": data,
                "backgroundColor": this.deviceColours,
            }]
            this.labels = labels
        },
        async handleParameterChange() {
            this.loading = true
            if (this.groupingSelection == "device") {
                this.labels = []
                this.indexData = []
                await this.getDevicesCacophonyIndex()
                this.chartData = {
                    "datasets": this.datasets,
                    "labels": this.labels
                }   
            } else if (this.groupingSelection == "station") {

            }
            this.loading = false   
        },
    }
}
</script>

<style scoped lang="scss">


</style>