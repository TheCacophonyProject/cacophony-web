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
  <div>
    <section-header>Project preferences</section-header>
    <div class="pageContent">
      <div class="preferencesNavigation">
        <nav>
          <ul>
            <li v-for="(item, index) in preferenceNavigationItemsArray" :key="index">
              <a href="#" class="navItem">
                <font-awesome-icon
                  v-if="index === 0"
                  :icon="['fas', 'envelope']"
                  class="navIcon"
                />
                <font-awesome-icon
                  v-else-if="index === 1"
                  :icon="['fas', 'camera']"
                  class="navIcon"
                />
                <font-awesome-icon
                  v-else-if="index === 2"
                  :icon="['fas', 'tag']"
                  class="navIcon"
                />
                <font-awesome-icon 
                  v-else-if="index === 3"
                  :icon="['fas', 'cat']"
                  class="navIcon"
                />
                {{ item }}
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div class="preferencesContent">
        <div class="notificationContent">
          <h3>Notification Settings</h3>
          <p style="color: #525252">Select the kinds of notifications you get about your project</p>
          <div class="divider"></div>
          <div class="emailNotifications">
            <div class="emailHeading">
              <h6>Email notifications</h6>
              <p style="color: grey">Recieve emails to find out what's going on when you're not online</p>
            </div>
            <div class="emailSettings">
              <div class="digestHeading">
                <h6 class="digestTitle">Daily digest</h6>
                <div class="digestSwitch">
                  <b-form-checkbox v-model="emailDailyDigestSwitch" switch></b-form-checkbox>
                </div>
              </div>
              <p style="color: grey">A daily overview of your project</p>
              <div class="visitHeading">
                <h6 class="visitTitle">Visit event</h6>
                <div class="visitSwitch">
                  <b-form-checkbox v-model="emailVisitEventSwitch" switch></b-form-checkbox>
                </div>
              </div>
              <p style="color: grey">Recieve a notification upon every visit</p>
            </div>
          </div>
          <div class="divider"></div>
          <div class="pushNotifications">
            <div class="pushHeading">
              <h6>Push notifications</h6>
              <p style="color: grey">Recieve push notifications to find out what's going on when you're not online</p>
            </div>
            <div class="pushSettings">
              <div class="digestHeading">
                <h6 class="digestTitle">Daily digest</h6>
                <div class="digestSwitch">
                  <b-form-checkbox v-model="pushDailyDigestSwitch" switch></b-form-checkbox>
                </div>
              </div>
              <p style="color: grey">A daily overview of your project</p>
              <div class="visitHeading">
                <h6 class="visitTitle">Visit event</h6>
                <div class="visitSwitch">
                  <b-form-checkbox v-model="pushVisitEventSwitch" switch></b-form-checkbox>
                </div>
              </div>
              <p style="color: grey">Recieve a notification upon every visit</p>
            </div>
          </div>
        </div>

        <div class="mediaContent">
          <h3>Media Preferences</h3>
          <p>Default media</p>
        </div>

         <div class="speciesContent">
          <h3>Species Preferences</h3>
          <b-button v-b-modal.projectPreferencesModal class="preferencesModal" @click="openModal">Species preferences</b-button>
        </div>

         <div class="taggingContent">
          <h3>Tagging Preferences</h3>
          <p>My preferred tags for video, audio </p>
        </div>

        <ul v-if="alerts.length">
          <li v-for="alert in alerts" :key="alert.id">{{ alert }}</li>
        </ul>
        <leave-project-modal v-model="selectedLeaveProject" />

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

        <button
          class="btn btn-outline-danger"
          type="button"
          @click="selectedLeaveProject = true"
          v-if="!isNotOnlyProjectOwnerOrAdmin"
        >
          Leave this project
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.digestHeading,
.visitHeading {
  width: 100%;
  display: flex;
}

.digestTitle,
.visitTitle {
  flex: 20;
}

.disgestSwitch,
.visitSwitch {
  flex: 1;
}

.emailNotifications,
.pushNotifications {
  display: flex;
}

.emailHeading,
.pushHeading {
  flex: 1;
}

.emailSettings,
.pushSettings {
  padding-left: 5em;
  flex: 2;
}

.divider {
  padding: 0.5em 0;
  border-top: 1.2px solid #d8d8d8;
}

.section-header {
  padding-left: 1em;
}
.preferencesNavigation {
  background-color: #283447;
  border-radius: 0.5em;
  padding: 0.5em 0px;
  flex: 1;
  /* height: auto; */
}

nav ul {
  list-style-type: none;
  padding: 0;
}

.navItem:hover {
  background-color: #1a2430;
  margin-left: 0.5em;
  margin-right: 0.5em;
  border-radius: 0.4em;
}

.navItem {
  position: relative; /* Position the icons */
  color: #ffffff;
  display: flex; /* Align icon and label */
  align-items: center; /* Align vertically */
  padding: 12px 20px;
  text-decoration: none;
  transition: background-color 0.3s ease;
  margin-left: 0.5em;
  margin-right: 0.5em;
}

.navIcon {
  width: 24px;
  margin-right: 1.2em; /* Spacing between icon and label */
  color: white; /* Icon color */
}

.notificationContent,
.mediaContent,
.speciesContent,
.taggingContent {
  background-color:rgb(231, 230, 230);
  border-radius: 0.5em;
  margin-top: 0.7em;
  margin-left: 0.7em;
  padding-top: 1.7em;
  padding-left: 1.7em;
  padding-right: 1.7em;
  padding-bottom: 1em;
}

.notificationContent {
  margin-top: 0em;
}
.preferencesContent {
  flex: 3;
}
.pageContent {
  /* background-color: rgb(239, 239, 186); */
  width: 100%;
  display: flex;
}
.projectPreferencesContent {
  background-color: #fff;
  border-radius: 8px;
  /* padding: 20px; */
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

.preferencesModal {
  width: 15em;
}
</style>
