<template>
    <div class="container" style="padding: 0">
        <h2>
        Analysis
        <help>Analysis for {{groupName}} devices</help>
        </h2>
        <p>Display data for range:</p>
        <div class="date-range-picker-container">
            <DateRangePicker :from-date="fromDate" :to-date="toDate" @update:fromDate="fromDateUpdated" @update:toDate="toDateUpdated"></DateRangePicker>
        </div>
        <div class="grouping-selector-container">
            <label for="grouping-selector">Show per:</label>
                <select id="grouping-selector" v-model="groupingSelection" >
                    <option v-for="option in groupingOptions" :key="option" :value="option">{{ option }}</option>
                </select>
        </div>
        <div class="grouping-selector-container">
            <label for="interval-selector">Group by:</label>
                <select id="interval-selector" v-model="intervalSelection" >
                    <option v-for="option in intervalOptions" :key="option" :value="option">{{ option }}</option>
                </select>
        </div>
        <div class="visuals-container">
            <div class="grid-item">
                <slot name="index-visuals">
                    <index-comparisons 
                        :groupName="groupName" 
                        :groupId="groupId"
                        :devices="devices"
                        :stations="stations"
                        :colours="colours"
                        :groupingSelection="groupingSelection"
                        :fromDate="fromDateRounded"
                        :toDate="toDateRounded">
                    </index-comparisons>
                </slot>
            </div>
            <div class="grid-item">
                <slot name="index-visuals">
                    <index-time-comparisons 
                        :groupId="groupId" 
                        :devices="devices"
                        :stations="stations"
                        :colours="colours"
                        :fromDate="fromDateRounded" 
                        :toDate="toDateRounded" 
                        :groupingSelection="groupingSelection" 
                        :intervalSelection="intervalSelection">
                    </index-time-comparisons>
                </slot>
            </div>
            <div class="grid-item">
       
            </div>
            <div class="grid-item">
               
            </div>
        </div>
        
    </div>
</template>

<script lang="ts">
import Help from "@/components/Help.vue"
import IndexComparisons from "../Visuals/IndexComparisons.vue"
import IndexTimeComparisons from "../Visuals/IndexTimeComparisons.vue"
import api from "@/api"
import DateRangePicker from "../Visuals/DateRangePicker.vue"

export default {
    name: "AnalysisTab",
    components: {
    Help,
    IndexComparisons,
    IndexTimeComparisons,
    DateRangePicker
},
    props: {
        groupName: { type: String, required: true },
        groupId: { type: Number, required: true },
        
    },
    data() {
        const to = new Date()
        const from = new Date()
        to.setDate(to.getDate() - 1)
        from.setDate(from.getDate() - 7)
        return {
            loading: true,
            recordings: null,
            recordingCount: 1,
            fromDate: from,
            toDate: to,
            devices: [],
            colours: [],
            stations: [],
            groupingOptions: ["device", "station"],
            groupingSelection: "device",
            intervalOptions: ["hours", "days", "weeks", "months", "years"],
            intervalSelection: "days"
        }
    },
    async mounted() {
        await this.getDevices()
        var colours = []
        for (let i = 0; i < this.devices.length; i++) {
            colours.push('#' + Math.random().toString(16).substr(-6))
        }
        this.colours = colours
    
        this.intervalOptions = ["hours", "days"]
        await this.getStations()
        this.loading = false
    },
    watch: {
        groupingSelection: async function() {
            var objCount = 0
            if (this.groupingSelection == "device") {
                await this.getDevices()
                objCount = this.devices.length
            } else if (this.groupingSelection == "station") {
                await this.getStations()
                objCount = this.stations.length
            }
            var colours = []
            for (let i = 0; i < objCount; i++) {
                colours.push('#' + Math.random().toString(16).substr(-6))
            }
            this.colours = colours
        }
    },
    methods: {
        async getDevices() {
            const resultDevices = await api.groups.getDevicesForGroup(this.groupId, this.inactiveAndActive)
            this.devices = resultDevices.result.devices
        },
        async getStations() {
            const resultStations = await api.groups.getStationsForGroup(this.groupId, this.inactiveAndActive)
            this.stations = resultStations.result.stations
        },
        fromDateUpdated(newFromDate) {
            this.fromDate = newFromDate
            const differenceDays = Math.ceil((this.toDate.getTime() - this.fromDate.getTime()) / (1000 * 3600 * 24))
            if (differenceDays < 1) {
                this.invertalOptions = ["hours"]
            } else if (differenceDays < 7) {
                this.intervalOptions = ["hours", "days"]
            } else if (differenceDays < 31) {
                this.intervalOptions = ["hours", "days", "weeks"]
            } else if (differenceDays < 365) {
                this.intervalOptions = ["hours", "days", "weeks", "months"]
            } else {
                this.intervalOptions = ["days", "weeks", "months", "years"]
            }

        },
        toDateUpdated(newToDate) {
            this.toDate = newToDate
            const differenceDays = Math.ceil((this.toDate.getTime() - this.fromDate.getTime()) / (1000 * 3600 * 24))
            if (differenceDays < 1) {
                this.invertalOptions = ["hours"]
            } else if (differenceDays < 7) {
                this.intervalOptions = ["hours", "days"]
            } else if (differenceDays < 31) {
                this.intervalOptions = ["hours", "days", "weeks"]
            } else if (differenceDays < 365) {
                this.intervalOptions = ["hours", "days", "weeks", "months"]
            } else {
                this.intervalOptions = ["days", "weeks", "months", "years"]
            }
        }
    },
    computed: {
        fromDateRounded() {
            const roundedDate = new Date(this.fromDate)
            roundedDate.setHours(0, 0, 0, 0)
            return roundedDate
        },
        toDateRounded() {
            const roundedDate = new Date(this.toDate)
            roundedDate.setHours(23, 59, 59, 999)
            return roundedDate
        },
    }
}
</script>



<style scoped>

.visuals-container {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 10px;
  width: 100%;
  height: 100%;
}

.grid-item {
  background-color: #fff;
  padding: 10px;
}

.date-range-picker-container {
    /* display: flex; */
    top: 0;
    left: 0;
    margin-top: 10px;
    margin-bottom: 20px;
}

.grouping-selector-container {
    display: flex;
}

</style>