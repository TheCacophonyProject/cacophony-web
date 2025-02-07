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
onMounted(() => {
  initialised.value = true;
});

watch(filterHumanVoices, async (next) => {
  if (initialised.value) {
    const settings = JSON.parse(JSON.stringify(currentProjectSettings.value));
    settings.filterHuman = next;
    savingHumanVoiceFilterSettings.value = true;
    await persistProjectSettings(settings);
    savingHumanVoiceFilterSettings.value = false;
  }
});
</script>
<template>
  <h6>Automatic filtering of human voices</h6>
  <p>
    Sometimes bird recorders can be in public places.<br />To protect peoples'
    privacy, AI can automatically delete recordings that contain human voices.
  </p>
  <b-form-checkbox switch v-model="filterHumanVoices"
    >Automatically delete audio recordings that contain human voices.<b-spinner
      class="ms-1"
      v-if="savingHumanVoiceFilterSettings"
      variant="secondary"
      small
  /></b-form-checkbox>
</template>
