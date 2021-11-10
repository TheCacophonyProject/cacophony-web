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
      <p v-if="trackTag.data.model_used">
        <strong>Model:</strong> {{ trackTag.data.model_used }}
      </p>

      <p>
        <strong>Label:</strong>
        {{ trackTag.what.charAt(0).toUpperCase() + trackTag.what.substring(1) }}
      </p>
      <p>
        <strong>Confidence:</strong>
        {{ trackTag.confidence }}
        <span class="delta">(&#916; {{ trackTag.data.clarity }})</span>
      </p>

      <p v-if="trackTag.average_novelty">
        <strong>Novelty:</strong> {{ trackTag.average_novelty }}
      </p>
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Animal</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tr
          v-for="(value, animal) in trackTag.data.all_class_confidences"
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
export default {
  name: "TrackData",
  props: {
    trackTag: {
      type: Object,
      required: false,
    },
  },
  data() {
    return {
      showDetails: false,
    };
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
