<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
</script>
<template>
  <div>
    <section-header>Exports and long-term trend analysis</section-header>
    <div class="graphContainer">
      <div class="graph1">
        <h5>Animal Breakdown</h5>
        <p>Display a pie chart of the species seen with ability to toggle timeframe</p></div>
      <div class="graph2">
        <h5>Project Engagement</h5>
        <p>Display the number of registered members as well as engagement via links</p>
      </div>
      <div class="graph3">
        <h5>Visits Trend</h5>
        <p>Display visits per night with option to specify the timeframe</p>
      </div>
    </div>
  </div>
</template>
<style scoped>
.graphContainer {
  display: grid;
  grid-template-areas: "graph-1 graph-2" "graph-3 graph-3";
}

.graph1 {
  grid-area: graph-1;
  margin-right: 0.3rem;
}

.graph2 {
  grid-area: graph-2;
  margin-left: 0.3rem;
}

.graph3 {
  grid-area: graph-3;
}

.graph1,
.graph2,
.graph3 {
  border-radius: 0.3rem;
  background-color: #e7e7e7;
  color: #0e122b;

  /* color: whitesmoke; */
  padding: 1rem;
  margin-bottom: 0.6rem;
}
</style>