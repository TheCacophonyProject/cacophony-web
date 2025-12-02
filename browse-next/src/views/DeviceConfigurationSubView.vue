<script lang="ts" setup>
import { computed, inject, type Ref } from "vue";
import type { ApiMaskRegionsData } from "@typedefs/api/device";
import { useRoute } from "vue-router";
import type { ApiRecordingResponse } from "@typedefs/api/recording";
import type { LoadedResource } from "@api/types.ts";
import {BNav, BNavItem, BSpinner} from "bootstrap-vue-next";
import {MaterialSymbol} from "@dbetka/vue-material-symbols";
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
    <div class="row d-flex flex-fill flex-column flex-lg-row">
      <div
        class="col col-12 col-lg-3 mt-3"
      >
        <b-nav
          pills
          vertical
          class="nav-device-config"
        >
          <b-nav-item
            :to="{ name: 'recording-options' }"
            :active="activeTabPath.includes('recording-options')"
          >
            <span class="d-flex">
              <material-symbol name="tune" class="me-2"/>
              Recording options
            </span>
          </b-nav-item>
          <b-nav-item
            :to="{ name: 'reference-photo' }"
            :active="activeTabPath.includes('reference-photo')"
          >
            <span class="d-flex">
              <material-symbol name="compare" class="me-2"/>
              Reference photo
            </span>
          </b-nav-item>
          <b-nav-item
            :to="{ name: 'define-masking' }"
            :active="activeTabPath.includes('define-masking')"
          >
            <span class="d-flex">
              <material-symbol name="polyline" class="me-2"/>
              Mask regions
            </span>
          </b-nav-item>
        </b-nav>
      </div>
      <router-view
        @updated-regions="updatedMaskRegions"
        @updated-reference-image="updatedReferenceImage"
        class="col col-12 col-lg-9 mt-3 mb-3 mb-lg-4"
      ></router-view>
    </div>
  </div>
</template>
<style lang="less">
.nav-device-config {
  .nav-link {
    color: var(--cp-color-green-700);
    padding-top: var(--cp-spacing-sm);
    padding-bottom: var(--cp-spacing-sm);
    margin-bottom: var(--cp-spacing-xxs);
    &:hover {
      background-color: color-mix(in oklch, var(--cp-color-primary), transparent 95%);
    }
    &.active {
      background-color: color-mix(in oklch, var(--cp-color-primary), transparent 85%);
      color: var(--cp-color-green-800);
    }
  }
}
</style>
