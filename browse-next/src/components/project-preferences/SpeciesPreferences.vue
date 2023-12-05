<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import { getAlertsForCurrentUser } from "@api/Alert";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { useRoute } from "vue-router";

const route = useRoute();
const selectedLeaveProject = ref(false);
const alerts = ref<ApiAlertResponse[]>([]);
const isNotOnlyProjectOwnerOrAdmin = ref<true>(true);
const preferencesModalEnabled = ref<boolean>(true);
const initialSpecies = ['Possum', 'Rat', 'Cat'];
const speciesArray = ref<string[]>(initialSpecies);
const preferencesModalRef = ref<any>(null);
const preferenceNavigationItems = ['Notifications', 'Media', 'Tagging', 'Species'];
const preferenceNavigationItemsArray = ref<string[]>(preferenceNavigationItems);
const emailDailyDigestSwitch = ref(true);
const emailVisitEventSwitch = ref(true);
const pushDailyDigestSwitch = ref(true);
const pushVisitEventSwitch = ref(true);

function togglePreferencesModal() {
  preferencesModalEnabled.value = !preferencesModalEnabled.value;
  console.log("Enabled?: ", preferencesModalEnabled.value);
}

function toggleSpecies(species: string) {
  if (speciesArray.value.includes(species)) {
    speciesArray.value = speciesArray.value.filter((s) => s !== species);
  } else {
    speciesArray.value.push(species);
  }
}

function getSpeciesIcon(species: string) {
  return speciesArray.value.includes(species) ? ['fas', 'circle-check'] : ['far', 'circle'];
}

</script>
<template>
  <div>
    <div class="speciesContent">
      <h3>Species Preferences</h3>
      <b-button v-b-modal.projectPreferencesModal class="preferencesModal" @click="openModal">Species preferences</b-button>
    </div>
    <div>
      <b-modal id="projectPreferencesModal" hide-header hide-footer>
        <div class="projectPreferencesContent">
          <h5>What species would you like to monitor?</h5>
          <div v-for="(species, index) in initialSpecies" :key="index" class="species-checkbox">
            <span @click="toggleSpecies(species)" class="checkbox-icon">
              <font-awesome-icon
                :icon="getSpeciesIcon(species)"
                :class="{ checked: speciesArray.includes(species) }"
              />
            </span>
            <label>{{ species }}</label>
          </div>
          <div class="modal-buttons">
            <button class="btn btn-primary">Save</button>
            <button class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </b-modal>
    </div>
  </div>
</template>

<style scoped>
.divider {
  padding: 0.5em 0;
  border-top: 1.2px solid #d8d8d8;
}

.speciesContent {
  background-color:rgb(231, 230, 230);
  border-radius: 0.5em;
  margin-left: 0.7em;
  padding-top: 1.7em;
  padding-left: 1.7em;
  padding-right: 1.7em;
  padding-bottom: 1em;
}

.species-checkbox {
  margin-bottom: 10px;
}

.species-checkbox input[type="checkbox"] {
  margin-right: 10px;
}

.species-checkbox label {
  font-size: 1rem;
  color: #444;
}

.modal-buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.modal-buttons button {
  margin-left: 10px;
}

.checkbox-icon {
  cursor: pointer;
  margin-right: 10px;
}

.checked {
  color: #5cb85c;
}

.icon {
  font-size: 24px; 
  color: grey;
}

.label {
  font-size: 18px; 
}

.preferencesModal {
  width: 15em;
}
</style>