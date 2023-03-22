<template>
    <div class="container" style="padding: 0">
        <h2>
        Analysis
        <help>Analysis for {{groupName}} devices</help>
        </h2>
        <div class="visuals-container">
            <div class="grid-item">
                <slot name="index-visuals">
                    <index-comparisons v-if="recordings" :recordings="recordings" :groupName="groupName" ></index-comparisons>
                </slot>
            </div>
            <div class="grid-item">
                <slot name="index-visuals">
                    <index-time-comparisons :groupId="groupId" :groupName="groupName"></index-time-comparisons>
                </slot>
            </div>
            <div class="grid-item">
                <!-- <slot name="index-visuals">
                    <index-time-comparisons :groupId="groupId" :groupName="groupName"></index-time-comparisons>
                </slot> -->
            </div>
            <div class="grid-item">
                <slot name="index-visuals">
                    <index-comparisons v-if="recordings" :recordings="recordings" :groupName="groupName"></index-comparisons>
                </slot>
            </div>
        </div>
        
    </div>
</template>

<script lang="ts">
import Help from "@/components/Help.vue"
import IndexComparisons from "../Visuals/IndexComparisons.vue"
import IndexTimeComparisons from "../Visuals/IndexTimeComparisons.vue"
import api from "@/api"

export default {
    name: "AnalysisTab",
    components: {
        Help,
        IndexComparisons,
        IndexTimeComparisons
    },
    props: {
        groupName: { type: String, required: true },
        groupId: { type: Number, required: true },
        
    },
    data() {
        return {
            loading: true,
            recordings: null,
            recordingCount: 1
        }
    },
    async mounted() {
        await this.fetchRecordingData()
        this.loading = false
    },
    methods: {
        async fetchRecordingData() {
            this.loading = true
            const recordingsResponse = await api.recording.query(this.recordingQuery())
            if (recordingsResponse.success) {
                const {
                    result: { rows, count },
                } = recordingsResponse
                this.recordingCount = count
                this.recordings = rows
            }
            this.loading = false
        },
        recordingQuery() {
            return {
                tagMode: "any",
                offset: 0,
                limit: null,
                page: null,
                days: "all",
                group: [this.groupId],
            }
        }
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

</style>