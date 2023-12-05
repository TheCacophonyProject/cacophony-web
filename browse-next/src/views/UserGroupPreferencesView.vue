<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import { getAlertsForCurrentUser } from "@api/Alert";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';


const selectedLeaveProject = ref(false);
const alerts = ref<ApiAlertResponse[]>([]);
const isNotOnlyProjectOwnerOrAdmin = ref<true>(true);
const preferencesModalEnabled = ref<boolean>(true);
const initialSpecies = ['Possum', 'Rat', 'Cat'];
const speciesArray = ref<string[]>(initialSpecies);


function togglePreferencesModal() {
  preferencesModalEnabled.value = !preferencesModalEnabled.value;
  console.log("Enabled?: ", preferencesModalEnabled.value);
}
onMounted(async () => {
  const response = await getAlertsForCurrentUser();
  if (response.success) {
    alerts.value = response.result.alerts;
  }
});

function cancel() {
  preferencesModalEnabled.value = false;
}

function savePreferences() {
  preferencesModalEnabled.value = false;
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
  <section-header>My project preferences</section-header>
  <h6>Things that could appear here:</h6>
  <ul>
    <li>My project/location alert settings</li>
    <li>Prefer video or audio views by default?</li>
    <li>My preferred tags for video, audio</li>
  </ul>

  <ul v-if="alerts.length">
    <li v-for="alert in alerts" :key="alert.id">{{ alert }}</li>
  </ul>
  <leave-project-modal v-model="selectedLeaveProject" />

  <b-button v-b-modal.projectPreferencesModal>Preferences Modal</b-button>

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
          <button class="btn btn-primary" @click="savePreferences">Save</button>
          <button class="btn btn-secondary" @click="cancel">Cancel</button>
        </div>
      </div>
    </b-modal>
  </div>


  <button
    class="btn btn-outline-danger"
    type="button"
    @click="selectedLeaveProject = true"
    v-if="!isNotOnlyProjectOwnerOrAdmin"
  >
    Leave this project
  </button>
</template>

<style scoped> 

.projectPreferencesContent {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.projectPreferencesContent h5 {
  font-size: 1.5rem;
  color: #333;
  margin-bottom: 20px;
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
</style>
