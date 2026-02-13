<script setup lang="ts">
import {
  computed,
  inject,
  onBeforeMount,
  onMounted,
  type Ref,
  ref,
  watch,
} from "vue";
import { currentSelectedProject } from "@models/provides";

import {
  persistProjectSettings,
  type SelectedProject,
} from "@models/LoggedInUser.ts";
import CardTable from "@/components/CardTable.vue";
import type { CardTableRows } from "@/components/CardTableTypes.ts";
import { capitalize } from "@/utils.ts";
import {
  displayLabelForClassificationLabel,
  getClassifications,
} from "@api/classificationsUtils.ts";
import {
  DEFAULT_AUDIO_RECORDING_LABELS,
  DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS,
} from "@/consts.ts";
import HierarchicalTagSelect from "@/components/HierarchicalTagSelect.vue";
import SectionCard from "@/components/SectionCard.vue";
import {
  BFormCheckbox,
  BFormGroup,
  BModal,
  BSpinner,
} from "bootstrap-vue-next";
import { MaterialSymbol } from "@dbetka/vue-material-symbols";
import TwoStepActionButton from "@/components/TwoStepActionButton.vue";

const selectedProject = inject(currentSelectedProject) as Ref<SelectedProject>;
const currentProjectSettings = computed(() => {
  if (selectedProject.value) {
    return selectedProject.value.settings || {};
  }
  return {};
});
const filterHumanVoices = ref<boolean>(false);
const savingHumanVoiceFilterSettings = ref<boolean>(false);
const initialised = ref<boolean>(false);
onBeforeMount(() => {
  filterHumanVoices.value = currentProjectSettings.value.filterHuman || false;
});
onMounted(async () => {
  await getClassifications();
  initialised.value = true;
});

const pendingIgnoredTag = ref<string[]>([]);

const addPendingIgnoredTag = async (grouping: "camera" | "audio") => {
  if (pendingIgnoredTag.value.length) {
    await addIgnoredTag(pendingIgnoredTag.value[0], grouping);
    pendingIgnoredTag.value = [];
  }
};

watch(filterHumanVoices, async (next) => {
  if (initialised.value) {
    const settings = JSON.parse(JSON.stringify(currentProjectSettings.value));
    settings.filterHuman = next;
    savingHumanVoiceFilterSettings.value = true;
    await persistProjectSettings(settings);
    savingHumanVoiceFilterSettings.value = false;
  }
});

const showAddCameraIgnoredTagModal = ref<boolean>(false);
//const showAddAudioClassificationModal = ref<boolean>(false);

const resetCameraIgnoredTags = async () => {
  localDashboardIgnoredTags.value = [...DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS];
  await persistProjectDashboardIgnoredTagSettings(
    localDashboardIgnoredTags.value,
    "camera",
  );
};

//const resetAudioClassification = () => {};

const customIgnoredDashboardCameraTags = computed<string[]>(() => {
  if (selectedProject.value) {
    return (
      (localDashboardIgnoredTags.value.length &&
        localDashboardIgnoredTags.value) ||
      selectedProject.value.settings?.ignoredCameraDashboardTags ||
      DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS
    );
  }
  return DEFAULT_DASHBOARD_IGNORED_CAMERA_TAGS;
});
const localDashboardIgnoredTags = ref<string[]>([]);
localDashboardIgnoredTags.value = [...customIgnoredDashboardCameraTags.value];

const cameraIgnoredTagTableItems = computed<CardTableRows<string>>(() => {
  return customIgnoredDashboardCameraTags.value.map((tag: string) => ({
    tag: {
      value: capitalize(displayLabelForClassificationLabel(tag)),
      cellClasses: ["w-100"],
    },
    _deleteAction: {
      value: tag,
    },
  }));
});

const persistProjectDashboardIgnoredTagSettings = async (
  update: string[],
  grouping: "audio" | "camera",
) => {
  const payload = {
    ...currentProjectSettings.value,
  };
  if (grouping === "audio") {
    payload.ignoredAudioDashboardTags = update;
  } else {
    payload.ignoredCameraDashboardTags = update;
  }
  return persistProjectSettings(payload);
};

const removeIgnoredTag = async (
  classification: string,
  grouping: "camera" | "audio",
) => {
  let collection;
  if (grouping === "camera") {
    collection = customIgnoredDashboardCameraTags.value;
  } else {
    // TODO
    collection = customIgnoredDashboardCameraTags.value;
  }
  const currentTags = [...collection];
  const currentIndexOfTag = currentTags.indexOf(classification);
  currentTags.splice(currentIndexOfTag, 1);
  if (grouping === "camera") {
    localDashboardIgnoredTags.value = currentTags;
  } else {
    // TODO
    localDashboardIgnoredTags.value = currentTags;
  }
  await persistProjectDashboardIgnoredTagSettings(
    localDashboardIgnoredTags.value,
    grouping,
  );
};

const addIgnoredTag = async (tag: string, grouping: "camera" | "audio") => {
  let collection;
  if (grouping === "camera") {
    collection = localDashboardIgnoredTags.value;
  } else {
    // TODO
    collection = localDashboardIgnoredTags.value;
  }
  if (!collection.includes(tag)) {
    collection.push(tag);
    await persistProjectDashboardIgnoredTagSettings(collection, "camera");
  }
};

const reset = () => {
  pendingIgnoredTag.value = [];
};

const pendingTagIsValid = computed<boolean>(() => {
  return (
    pendingIgnoredTag.value.length !== 0 &&
    pendingIgnoredTag.value[0].trim().length !== 0
  );
});
</script>
<template>
  <div class="row mb-4 pb-2 pb-sm-0 mb-sm-4 mb-lg-5">
    <div class="col-lg-3">
      <h3 class="section-card-heading">Automatic filtering of human voices</h3>
      <p class="text-secondary pb-1">
        Configure the AI to automatically delete recordings that contain human
        voices.
      </p>
    </div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Audio filtering </template>
        <b-form-group
          description="Turn this option on if the recording is in a public place to protect peoples' privacy."
        >
          <b-form-checkbox switch v-model="filterHumanVoices"
            >Automatically delete audio recordings that contain human
            voices<b-spinner
              class="ms-1"
              v-if="savingHumanVoiceFilterSettings"
              variant="secondary"
              small
          /></b-form-checkbox>
        </b-form-group>
      </section-card>
    </div>
  </div>

  <div class="row mb-3 mb-sm-4 mb-lg-5">
    <div class="col-lg-3">
      <h3 class="section-card-heading">Ignored Dashboard tags</h3>
      <p class="text-secondary pb-1">
        Filter out tags from your project dashboard. Tags follow a
        classification hierarchy; e.g. filtering out the tag leporidae will also
        filter rabbits and hares.
      </p>
    </div>
    <div class="col-lg-9">
      <section-card>
        <template #header-title> Tags </template>
        <template #header-action>
          <div class="d-inline-flex gap-2 ms-2">
            <two-step-action-button
              :action="resetCameraIgnoredTags"
              :btn-variant-class="`btn-outline-secondary`"
              :icon="null"
              :confirmation-label="`Reset ignored tags`"
              :label="`Reset`"
              :placement="`bottom`"
            />
            <button
              type="button"
              class="btn btn-secondary"
              @click.stop.prevent="showAddCameraIgnoredTagModal = true"
            >
              Add
            </button>
          </div>
        </template>
        <card-table
          :items="cameraIgnoredTagTableItems"
          compact
          :max-card-width="0"
        >
          <template #_deleteAction="{ cell }">
            <two-step-action-button
              :action="() => removeIgnoredTag(cell.value, 'camera')"
              icon="delete"
              :confirmation-label="`Remove tag`"
              tooltip-label="Remove"
            />
          </template>
        </card-table>
      </section-card>
    </div>
  </div>

  <b-modal
    v-model="showAddCameraIgnoredTagModal"
    title="Add project dashboard ignored tag"
    @cancel="reset"
    @close="reset"
    @esc="reset"
    @ok="() => addPendingIgnoredTag('camera')"
    :ok-disabled="!pendingTagIsValid"
    ok-title="Add ignored tag"
    ok-variant="secondary"
    cancel-variant="outline-secondary"
    centered
  >
    <hierarchical-tag-select
      class="flex-grow-1"
      v-model="pendingIgnoredTag"
      :open-on-mount="false"
      :disabled-tags="customIgnoredDashboardCameraTags"
    />
  </b-modal>
  <!--  <div class="mt-4">-->
  <!--    <hr />-->
  <!--    <div-->
  <!--      class="d-flex flex-column flex-md-row justify-content-md-between mb-3 align-items-center"-->
  <!--    >-->
  <!--      <h2 class="h6">Bird recording dashboard classifications</h2>-->
  <!--      <div class="d-flex align-items-end justify-content-end ms-md-5">-->
  <!--        <button-->
  <!--          type="button"-->
  <!--          class="btn btn-outline-secondary ms-2"-->
  <!--          @click.stop.prevent="showAddAudioClassificationModal = true"-->
  <!--        >-->
  <!--          Add-->
  <!--        </button>-->
  <!--        <button-->
  <!--          type="button"-->
  <!--          class="btn btn-outline-danger ms-2"-->
  <!--          @click.stop.prevent="resetAudioClassification"-->
  <!--        >-->
  <!--          Reset-->
  <!--        </button>-->
  <!--      </div>-->
  <!--    </div>-->
  <!--  </div>-->
</template>
