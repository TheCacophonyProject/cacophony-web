<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import type { ApiAlertResponse } from "@typedefs/api/alerts";
import { getAlertsForCurrentUser } from "@api/Alert";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { useRoute } from "vue-router";
import NotificationPreferences from "@/components/project-preferences/NotificationPreferences.vue";
import TaggingPreferences from "@/components/project-preferences/TaggingPreferences.vue";
// import DeviceSetupDefineMask from "@/components/DeviceSetupDefineMask.vue";

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

function getRouteForIndex(index) {
  const routes = ['notification-settings', 'media-settings', 'tagging-settings', 'species-settings'];
  return { name: routes[index] };
}

function getIconForIndex(index) {
  const icons = [['fas', 'envelope'], ['fas', 'camera'], ['fas', 'tag'], ['fas', 'cat']];
  return icons[index];
}
</script>
<template>
  <div>
    <section-header>My project preferences</section-header>
    <div class="pageContent">
      <div class="preferencesNavigation">
        <nav>
          <ul>
            <li v-for="(item, index) in preferenceNavigationItemsArray" :key="index">
              <router-link :to="getRouteForIndex(index)" class="navItem">
                <font-awesome-icon
                  :icon="getIconForIndex(index)"
                  class="navIcon"
                />
                {{ item }}
              </router-link>
            </li>
          </ul>
        </nav>
      </div>
      <div class="preferencesContent">
        <router-view></router-view>
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
  height: 210px;
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
