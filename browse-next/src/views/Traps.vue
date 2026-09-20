<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import {
  BBadge,
  BButton,
  BFormInput,
  BModal,
  BPopover,
  BSpinner,
} from "bootstrap-vue-next";
import MapWithPoints from "@/components/MapWithPoints.vue";
import { computed, ref } from "vue";
import { useWindowSize } from "@vueuse/core";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import CardTable from "@/components/CardTable.vue";
import DeviceName from "@/components/DeviceName.vue";
import LocationName from "@/components/LocationName.vue";

const projectHasTraps = computed<boolean>(() => {
  return true;
});

const { width: windowWidth } = useWindowSize();

const trapsContainer = ref<HTMLDivElement>();
const mapBuffer = ref<HTMLDivElement | null>(null);

const mapWidthPx = computed<number>(() => {
  if (mapBuffer.value === null) {
    return 0;
  }
  const mapBufferWidth = mapBuffer.value!.offsetWidth;
  if (windowWidth.value >= 992) {
    return mapBufferWidth;
  }
  return 0;
});

const traps = [
  {
    enabled: true,
    device: "A345",
    location: "Cacophony HQ longer name two lines",
    captureTime: "6:16 am",
    captureRelease: "6h 20 m",
    actionFailed: true,
  },
  {
    enabled: true,
    device: "A345",
    location: "Cacophony HQ",
    captureTime: "6:16 am",
    actionPending: true,
    captureRelease: "6h 20 m",
  },
  {
    enabled: true,
    device: "A345",
    location: "Cacophony HQ",
    misconfigured: true,
  },
  {
    enabled: true,
    device: "A345",
    location: "Cacophony HQ",
    misconfigured: true,
  },
  {
    enabled: false,
    device: "A345",
    location: "Cacophony HQ",
  },
];

const showTrapActionsModal = ref<boolean>(false);
const showKillConfirmationModal = ref<boolean>(false);

const killConfirmationInput = ref<string>("");

const confirmKill = () => {
  showTrapActionsModal.value = false;
  showKillConfirmationModal.value = false;
};
</script>

<template>
  <div class="d-flex flex-column flex-fill">
    <section-header>
      <span
        ><span class="d-none d-sm-inline-block">High Interaction Rate</span>
        Traps</span
      ></section-header
    >
    <!-- TODO: add loading spinner -->
    <div v-if="false" class="d-flex align-items-center flex-column flex-fill">
      <div class="d-flex align-items-center flex-fill">
        <b-spinner variant="secondary" />
      </div>
    </div>
    <div
      v-else
      class="d-flex flex-fill justify-content-between"
      ref="trapsContainer"
    >
      <div class="d-flex flex-column-reverse justify-content-between flex-fill">
        <div
          v-if="!projectHasTraps"
          class="d-flex flex-fill justify-content-center align-items-center"
        >
          <div
            class="no-results text-body-tertiary d-flex flex-column text-center col col-12 col-md-10 col-lg-7"
          >
            <h4 class="h5 mb-2">This project has no traps</h4>
            <p>
              If you have a trap, connect it to a device and configure it under
              devices settings.
            </p>
          </div>
        </div>
        <div
          v-else
          class="col col-12 col-lg-9 col-xl-8 col-xxl-7 d-flex flex-fill flex-column me-md-3 mt-4 mt-lg-0"
        >
          <h3 class="h4 mb-3">Enabled traps</h3>

          <card-table
            compact
            :max-card-width="2000"
            standalone
            :items="traps"
            class="mb-4"
          >
            <template #card="{ card: trap }">
              <div class="d-flex flex-column flex-md-row">
                <div class="flex-grow-1">
                  <div
                    class="d-flex align-items-start justify-content-between mb-2"
                  >
                    <span class="mb-0">
                      <device-name
                        :name="trap.device"
                        type="thermal"
                        :no-margin="true"
                        name-class="fw-semibold"
                      />
                    </span>

                    <div
                      class="d-flex align-items-end justify-content-end flex-wrap flex-row flex-sm-row gap-1 gap-sm-2 ms-3"
                    >
                      <b-popover tooltip>
                        <template #target>
                          <b-badge
                            v-if="trap.misconfigured"
                            variant="warning"
                            class="rename-hint d-inline-flex flex-row align-items-center"
                          >
                            <material-symbol
                              name="warning"
                              filled
                              size="1rem"
                              class="me-1"
                            />
                            Trap misconfigured
                          </b-badge>
                        </template>
                        Go to trap settings to fix the trap configuration.
                      </b-popover>

                      <b-badge
                        v-if="trap.captureTime && !trap.actionPending"
                        variant="danger"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                      >
                        <material-symbol
                          name="target"
                          filled
                          size="1rem"
                          class="me-1"
                        />
                        Trap triggered
                      </b-badge>

                      <b-badge
                        v-if="trap.actionPending"
                        variant="secondary"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                      >
                        <material-symbol
                          name="hourglass"
                          size="1rem"
                          class="me-1"
                        />
                        Action pending
                      </b-badge>

                      <b-badge
                        v-if="trap.actionFailed"
                        variant="danger"
                        class="rename-hint d-inline-flex flex-row align-items-center"
                        style="background: #960413 !important"
                      >
                        <material-symbol
                          name="error"
                          filled
                          size="1rem"
                          class="me-1"
                        />
                        Action failed
                      </b-badge>
                    </div>
                  </div>

                  <p class="mb-0">
                    <location-name :name="trap.location" />
                  </p>
                  <p
                    v-if="trap.captureTime"
                    class="d-inline-flex align-items-center mt-2 mb-0"
                  >
                    <material-symbol
                      name="time_auto"
                      size="1.125rem"
                      class="me-1"
                    />
                    <span class="lh-sm"
                      >Captured at {{ trap.captureTime }}, <wbr />{{
                        trap.captureRelease
                      }}
                      until auto release</span
                    >
                  </p>
                </div>
                <div class="vr d-none d-md-block ms-4 me-4"></div>
                <hr class="d-md-none" />
                <div
                  class="action-buttons d-flex flex-column justify-content-center gap-2"
                >
                  <b-button
                    v-if="trap.captureTime"
                    :disabled="trap.actionPending"
                    variant="secondary"
                    @click.stop.prevent="showTrapActionsModal = true"
                  >
                    <span class="ms-2">Take action</span>
                  </b-button>
                  <b-button
                    class="align-items-center justify-content-center d-flex btn-icon"
                    variant="light"
                  >
                    <material-symbol name="settings" size="1.25rem" />
                    <span class="ms-2">Trap settings</span>
                  </b-button>
                </div>
              </div>
            </template>
          </card-table>
        </div>
        <div
          class="map-buffer col col-12 col-lg-3 col-xl-4"
          ref="mapBuffer"
          v-if="projectHasTraps"
        ></div>
        <map-with-points
          ref="mapContainer"
          v-if="projectHasTraps"
          :width="mapWidthPx"
          :radius="30"
        />
        <!--        <map-with-points
          ref="mapContainer"
          v-if="projectHasTraps"
          :points="locationsForMap"
          :active-points="locationsForMap"
          :highlighted-point="highlightedPoint"
          @hover-point="highlightPoint"
          @leave-point="highlightPoint"
          :width="mapWidthPx"
          :radius="30"
        />-->
      </div>
    </div>
    <b-modal
      v-model="showTrapActionsModal"
      title="Device set to high power mode"
      centered
      no-footer
      body-class="p-0"
    >
      <template #header="{ close }">
        <div class="d-flex flex-wrap column-gap-2 row-gap-1 me-1">
          <device-name
            name="A666"
            type="thermal"
            :no-margin="true"
            name-class="fw-semibold"
          />
          <location-name name="Bog of doooooooooooooooooooooooooom" truncate />
        </div>
        <button class="btn-close" @click="close()" aria-label="Close"></button>
      </template>
      <div class="player-container bg-black">
        <!--        <cptv-player>
        </cptv-player>-->
      </div>
      <div class="p-3 d-flex flex-column flex-sm-row gap-2">
        <b-button variant="outline-secondary" class="flex-grow-1">
          <span>Release</span>
        </b-button>
        <b-button variant="outline-secondary">
          <span>Open hold trap door</span>
        </b-button>
        <b-button
          variant="secondary"
          @click.stop.prevent="showKillConfirmationModal = true"
        >
          <span>Open kill trap door</span>
        </b-button>
      </div>
    </b-modal>
    <b-modal
      v-model="showKillConfirmationModal"
      centered
      header-bg-variant="danger"
      header-text-variant="light"
      cancel-variant="outline-secondary"
      ok-variant="danger"
      :ok-disabled="killConfirmationInput !== 'KILL'"
      okTitle="Confirm"
      @ok="confirmKill"
    >
      <template #header="{ close }">
        <div class="d-flex align-items-center gap-2 me-1">
          <material-symbol name="skull" size="1.5rem" />
          <h5 class="modal-title">Open kill trap door</h5>
        </div>
        <b-button
          class="btn-close btn-close-white"
          @click="close()"
          aria-label="Close"
        >
        </b-button>
      </template>

      <p>
        Opening the kill trap door will kill the animal currently in the trap.
      </p>
      <p>Type KILL below to confirm this action.</p>
      <b-form-input
        type="text"
        v-model="killConfirmationInput"
        class="kill-input"
      />
    </b-modal>
  </div>
</template>

<style lang="less" scoped>
@import "../assets/less/breakpoints";
@import "../assets/less/elevation";
.map {
  @media screen and (max-width: @breakpoint-md-max) {
    height: 30vh;
    max-height: calc(var(--cp-grid-base) * 100); // 400px
    border-radius: var(--bs-border-radius);
    .standard-shadow-inset();
    border: 1px solid var(--border-color-light);
  }
  @media screen and (min-width: @breakpoint-lg) {
    position: absolute !important;
    right: 0;
    top: 0;
    height: 100vh !important;
  }
}
.vr {
  background-color: var(--border-color-light);
  opacity: 1;
  margin-top: calc(var(--cp-spacing-xl) * -1);
  margin-bottom: calc(var(--cp-spacing-xl) * -1);
}
hr {
  margin-left: calc(var(--cp-spacing-md) * -1);
  margin-right: calc(var(--cp-spacing-md) * -1);
}

@media screen and (min-width: 992px) {
  .player-container .video-container {
    width: 100% !important;
  }
}
.kill-input {
  &:focus {
    border-color: var(--bs-danger);
    box-shadow: 0 0 0 0.25rem
      color-mix(in oklch, var(--bs-danger), transparent 80%);
  }
}
</style>
