<script lang="ts" setup>
import { computed, inject, type Ref } from "vue";
import type { ApiMaskRegionsData } from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { LoadedResource } from "@api/types.ts";
const route = useRoute();

const emit = defineEmits<{
  (e: "updated-regions", payload: ApiMaskRegionsData): void;
  (e: "updated-reference-image"): void;
}>();

const latestReferenceImageURL = inject("latestReferenceImageURL") as Ref<
  LoadedResource<string>
>;
const latestMaskRegions = inject("latestMaskRegions") as Ref<
  LoadedResource<ApiMaskRegionsData>
>;
const latestStatusRecording = inject("latestStatusRecording") as Ref<
  LoadedResource<ApiRecordingResponse>
>;

const updatedMaskRegions = (newMaskRegions: ApiMaskRegionsData) => {
  emit("updated-regions", newMaskRegions);
};

const updatedReferenceImage = () => {
  emit("updated-reference-image");
};

const hasReferencePhoto = computed<boolean>(() => {
  return !!latestReferenceImageURL.value;
});

const hasRecordingSetup = computed<boolean>(() => {
  return false;
});

const hasMaskRegionsDefined = computed<boolean>(() => {
  return (
    !!latestMaskRegions.value &&
    Object.values(latestMaskRegions.value.maskRegions).length !== 0
  );
});

const hasLatestRecordingInLocation = computed<boolean>(() => {
  return latestStatusRecording.value !== null;
});

const activeTabPath = computed(() => {
  return route.matched.map((item) => item.name);
});

const loading = computed<boolean>(() => {
  return (
    latestReferenceImageURL.value === null ||
    latestStatusRecording.value === null ||
    latestMaskRegions.value === null
  );
});
</script>
<template>
  <div
    v-if="loading"
    class="d-flex justify-content-center align-items-center"
    style="min-height: 400px"
  >
    <b-spinner />
  </div>
  <div
    v-else-if="!hasLatestRecordingInLocation"
    class="d-flex justify-content-center align-items-center"
    style="min-height: 400px"
  >
    <p>
      Return here when your camera has made a recording in its current location.
    </p>
  </div>
  <div v-else>
    <h6 class="d-none d-md-block mt-md-3">Camera setup checklist</h6>
    <div class="d-flex flex-lg-row flex-column">
      <div
        class="d-flex py-2 justify-content-around flex-column justify-content-md-start checklist me-lg-4"
      >
        <b-button
          variant="light"
          class="checklist-btn"
          :to="{ name: 'recording-setup' }"
          :active="activeTabPath.includes('recording-setup')"
        >
          <font-awesome-icon
            :icon="
              hasRecordingSetup ? ['far', 'circle-check'] : ['far', 'circle']
            "
          />
          Setup recording options</b-button
        >
        <b-button
          variant="light"
          class="mt-2 checklist-btn"
          :to="{ name: 'reference-photo' }"
          :active="activeTabPath.includes('reference-photo')"
        >
          <font-awesome-icon
            :icon="
              hasReferencePhoto ? ['far', 'circle-check'] : ['far', 'circle']
            "
          />
          Set a reference photo</b-button
        >
        <b-button
          variant="light"
          class="mt-2 checklist-btn"
          :to="{ name: 'define-masking' }"
          :active="activeTabPath.includes('define-masking')"
        >
          <font-awesome-icon
            :icon="
              hasMaskRegionsDefined
                ? ['far', 'circle-check']
                : ['far', 'circle']
            "
          />
          Define mask regions (optional)</b-button
        >
      </div>
      <router-view
        @updated-regions="updatedMaskRegions"
        @updated-reference-image="updatedReferenceImage"
        class="right-column"
      ></router-view>
    </div>
  </div>
</template>
<style lang="less">
.checklist-btn.btn {
  text-align: left;
}
@media screen and (min-width: 992px) {
  .checklist-btn {
    //max-width: 30svh;
  }
  .checklist {
    min-width: 300px;
  }
}
</style>
