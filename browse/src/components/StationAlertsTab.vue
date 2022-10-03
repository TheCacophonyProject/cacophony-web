<template>
  <div class="container" style="padding: 0">
    <h2>Station alerts</h2>
    <p v-if="alerts.length">
      These are the email alerts you have setup for this station.
    </p>
    <p>
      Any time our AI classifies a visit at this station as matching the species
      or tag you specify, you'll receive an email to let you know.<br />
      You won't receive more than one email alert for the same tag within a 30
      minute period.<br />
      Additionally, you will only receive alerts on recordings uploaded by
      connected devices (not by other means such as the SideKick app).<br />
      You also won't receive an alert if the recording is more than 24 hours old
      when it is processed.
    </p>
    <b-table
      v-if="alerts.length"
      striped
      hover
      :items="tableAlerts"
      :fields="[
        'name',
        { key: 'alertsOn', label: 'Alerts on' },
        { key: 'lastAlert', label: 'Last alerted' },
        { key: 'remove', label: '' },
      ]"
    >
      <template v-slot:cell(remove)="data">
        <div class="d-flex flex-column">
          <b-btn
            variant="outline-secondary"
            class="align-self-end"
            @click="removeAlert(data.item.id)"
          >
            <font-awesome-icon icon="trash" size="1x" />
          </b-btn>
        </div>
      </template>
    </b-table>
    <div class="d-flex flex-column">
      <b-btn class="align-self-end" @click="createAlert"
        ><span>
          <font-awesome-icon icon="plus" />
        </span>
        Create a new alert</b-btn
      >
    </div>
    <b-modal
      v-model="creatingAlert"
      title="New alert"
      ok-title="Create"
      @cancel="currentAlert = { name: '', species: '' }"
      @ok="submitAlert"
      :ok-disabled="currentAlert.name === '' || currentAlert.species === ''"
    >
      <b-form>
        <b-form-group label="Alert name">
          <b-form-input
            type="text"
            placeholder="Alert name"
            v-model="currentAlert.name"
          ></b-form-input>
        </b-form-group>
        <b-form-group label="Species/tag to alert on">
          <classifications-dropdown
            v-model="currentAlert.species"
            :exclude="['other', 'bird']"
          />
        </b-form-group>
      </b-form>
    </b-modal>
  </div>
</template>

<script lang="ts">
import api from "@api";
import { AlertId } from "@typedefs/api/common";
import ClassificationsDropdown from "@/components/ClassificationsDropdown.vue";

export default {
  name: "StationAlertsTab",
  components: { ClassificationsDropdown },
  props: {
    station: {
      required: true,
    },
    group: {
      required: true,
    },
  },
  data() {
    return {
      alerts: [],
      creatingAlert: false,
      currentAlert: {
        name: "",
        species: "",
      },
    };
  },
  computed: {
    tableAlerts() {
      return this.alerts.map(({ id, name, conditions, lastAlert }) => {
        return {
          id,
          name,
          alertsOn: conditions.map(({ tag }) => tag).join(", "),
          lastAlert:
            lastAlert === null
              ? "never"
              : new Date(lastAlert).toLocaleDateString(),
          remove: "",
        };
      });
    },
  },
  methods: {
    async removeAlert(id: AlertId) {
      console.log(id);
      const response = await api.alerts.removeAlert(id);
      if (response.success) {
        this.$emit("alerts-changed");
        await this.fetchAlerts();
      }
    },
    createAlert(e) {
      this.currentAlert = {
        name: "",
        species: "",
      };
      this.creatingAlert = true;
    },
    async submitAlert() {
      const response = await api.alerts.createAlertForStation(
        this.station.id,
        this.currentAlert
      );
      if (response.success) {
        this.$emit("alerts-changed");
        await this.fetchAlerts();
      }
    },
    async fetchAlerts() {
      const alerts = await api.alerts.getAlertsForStation(this.station.id);
      if (alerts.success) {
        this.alerts = alerts.result.alerts;
      }
    },
  },
  async created() {
    await this.fetchAlerts();
  },
};
</script>

<style scoped></style>
