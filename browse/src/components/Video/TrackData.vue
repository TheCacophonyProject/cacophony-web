<template>
  <div class="details simple-accordion-wrapper" v-if="trackTag">
    <h6 class="simple-accordion-header" @click="showDetails = !showDetails">
      Classifier details
      <span v-if="!showDetails" title="Show all result classes" class="pointer">
        <font-awesome-icon icon="angle-down" class="fa-1x" />
      </span>
      <span v-if="showDetails" title="Hide other results" class="pointer">
        <font-awesome-icon icon="angle-up" class="fa-1x" />
      </span>
    </h6>
    <div v-if="showDetails">
      <p v-if="localTrackTagData.data.model_used">
        <strong>Model:</strong> {{ localTrackTagData.data.model_used }}
      </p>
      <p>
        <strong>Label:</strong>
        {{
          localTrackTagData.what.charAt(0).toUpperCase() +
          localTrackTagData.what.substring(1)
        }}
      </p>
      <p>
        <strong>Confidence:</strong>
        {{ trackTag.confidence }}
        <span class="delta">(&#916; {{ localTrackTagData.data.clarity }})</span>
      </p>

      <p v-if="localTrackTagData.average_novelty">
        <strong>Novelty:</strong> {{ localTrackTagData.average_novelty }}
      </p>
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Animal</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tr
          v-for="(value, animal) in localTrackTagData.data
            .all_class_confidences"
          :key="animal"
        >
          <td>{{ animal }}</td>
          <td>{{ Math.round(100 * value) }}</td>
        </tr>
      </table>
    </div>
  </div>
</template>

<script>
import recordingApi from "@api/Recording.api";

export default {
  name: "TrackData",
  props: {
    trackTag: {
      type: Object,
      required: false,
    },
    recordingId: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      showDetails: false,
      hasLoadedDetails: false, // To track if the data has already been loaded
      localTrackTagData: {},
    };
  },
  watch: {
    showDetails(newValue) {
      if (newValue && !this.hasLoadedDetails) {
        this.loadDetails();
      }
    },
  },
  methods: {
    async loadDetails() {
      const response = await recordingApi.getTrack(
        this.track.id,
        this.recordingId
      );
      if (response.success) {
        const tag = response.result.track.tags.find(
          (tag) => tag.automatic === true
        );
        this.localTrackTagData = {
          ...(this.trackTag.data || {}),
          ...(tag.data || {}),
        }; // Merge the new details with existing data
        this.hasLoadedDetails = true;
      }
    },
  },
};
</script>

<style scoped>
.details {
  font-size: 85%;
}
h6 {
  cursor: pointer;
}
p {
  margin-bottom: 0.5em;
}
.table {
  margin-top: 1em;
}
</style>
