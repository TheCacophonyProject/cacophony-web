<script setup lang="ts">
import MapWithPoints from "@/components/MapWithPoints.vue";
import type { NamedPoint } from "@/components/MapWithPoints.vue";
import { computed, defineProps, ref } from "vue";
import type { ApiVisitResponse } from "@typedefs/api/monitoring";
import type { ApiStationResponse } from "@typedefs/api/station";
import type { LatLng } from "leaflet";

// eslint-disable-next-line vue/no-setup-props-destructure
const { stations, visits } = defineProps<{
  visits: ApiVisitResponse[];
  stations: ApiStationResponse[] | null;
}>();

const highlightedPoint = ref<NamedPoint | null>(null);

const highlightPoint = (p: NamedPoint | null) => {
  highlightedPoint.value = p;
};
const stationsForMap = computed<NamedPoint[]>(() => {
  if (stations) {
    return stations.map(({ name, groupName, location }) => ({
      name,
      group: groupName,
      location: location as LatLng,
    }));
  }
  return [];
});
</script>
<template>
  <div style="background: #ccc; height: 500px">
    <map-with-points
      :points="stationsForMap"
      :highlighted-point="() => highlightedPoint"
      @hover-point="highlightPoint"
      @leave-point="highlightPoint"
      :radius="30"
      :is-interactive="false"
      :zoom="false"
      :can-change-base-map="false"
    />
    <div>
      <!--  Timeline summary    -->
    </div>
  </div>
</template>

<style scoped lang="less">
.map {
  height: 300px;
}
</style>
