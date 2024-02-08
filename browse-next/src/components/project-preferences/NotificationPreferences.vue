<script setup lang="ts">
import { onMounted, ref } from "vue";
import SectionHeader from "@/components/SectionHeader.vue";
import { getAlertsForCurrentUser } from "@api/Alert";
import LeaveProjectModal from "@/components/LeaveProjectModal.vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { useRoute } from "vue-router";
import NotificationPreferences from "@/components/project-preferences/NotificationPreferences.vue";
// import DeviceSetupDefineMask from "@/components/DeviceSetupDefineMask.vue";
const route = useRoute();
const emailDailyDigestSwitch = ref(true);
const emailVisitEventSwitch = ref(true);
const pushDailyDigestSwitch = ref(true);
const pushVisitEventSwitch = ref(true);
</script>

<template>
  <div>
    <div class="notificationContent">
      <h3>Notification Settings</h3>
      <p style="color: #525252">
        Select the kinds of notifications you get about your project
      </p>
      <div class="divider"></div>
      <div class="emailNotifications">
        <div class="emailHeading">
          <h6>Email notifications</h6>
          <p style="color: grey">
            Recieve emails to find out what's going on when you're not online
          </p>
        </div>
        <div class="emailSettings">
          <div class="digestHeading">
            <h6 class="digestTitle">Daily digest</h6>
            <div class="digestSwitch">
              <b-form-checkbox
                v-model="emailDailyDigestSwitch"
                switch
              ></b-form-checkbox>
            </div>
          </div>
          <p style="color: grey">A daily overview of your project</p>
          <div class="visitHeading">
            <h6 class="visitTitle">Visit event</h6>
            <div class="visitSwitch">
              <b-form-checkbox
                v-model="emailVisitEventSwitch"
                switch
              ></b-form-checkbox>
            </div>
          </div>
          <p style="color: grey">Recieve a notification upon every visit</p>
        </div>
      </div>
      <div class="divider"></div>
      <div class="pushNotifications">
        <div class="pushHeading">
          <h6>Text notifications</h6>
          <p style="color: grey">
            Recieve text notifications to find out what's going on while you're
            away
          </p>
        </div>
        <div class="pushSettings">
          <div class="digestHeading">
            <h6 class="digestTitle">Daily digest</h6>
            <div class="digestSwitch">
              <b-form-checkbox
                v-model="pushDailyDigestSwitch"
                switch
              ></b-form-checkbox>
            </div>
          </div>
          <p style="color: grey">A daily overview of your project</p>
          <div class="visitHeading">
            <h6 class="visitTitle">Visit event</h6>
            <div class="visitSwitch">
              <b-form-checkbox
                v-model="pushVisitEventSwitch"
                switch
              ></b-form-checkbox>
            </div>
          </div>
          <p style="color: grey">Recieve a notification upon every visit</p>
        </div>
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
  /* background-color:rgb(231, 230, 230); */
  background-color: white;
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
