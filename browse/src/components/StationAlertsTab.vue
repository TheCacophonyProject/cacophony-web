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
      You'll only receive an alert for the <em>first</em> matching tag in a
      recording.<br />
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
        { key: 'alertsOn', label: 'Alert tag' },
        { key: 'lastAlert', label: 'Last alerted' },
        { key: 'remove', label: '' },
      ]"
    >
      <template v-slot:cell(remove)="data">
        <div class="d-flex flex-column">
          <b-btn
            variant="outline-secondary"
            class="align-self-end"
            @click="setDeleteAlert(data.item.id)"
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
      v-model="alertToDelete"
      hide-header-close
      :title="`Delete '${alertToDeleteName}'?`"
      @ok="removeAlert(alertToDeleteId)"
    >
      <p>
        Are you sure you want to no longer get alerts for
        <strong>{{ alertToDeleteTag }}</strong
        >?
      </p>
    </b-modal>
    <b-modal
      v-model="creatingAlert"
      title="New alert"
      ok-title="Create"
      @cancel="currentAlertTag = ''"
      @ok="submitAlert"
      :ok-disabled="currentAlertTag === ''"
    >
      <b-form>
        <b-form-group label="Species/tag to alert on">
          <classifications-dropdown v-model="currentAlertTag" />
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
      currentAlertTag: "",
    };
  },
  computed: {
    alertToDelete: {
      get() {
        return this.alerts.length !== 0 && !!this.alertToDeleteId;
      },
      set(val) {
        if (typeof val === "boolean" && val === false) {
          this.unsetDeleteAlert();
        }
      },
    },
    alertToDeleteId() {
      return this.$route.params.deleteItemId;
    },
    alertToDeleteItem() {
      return this.alerts.find(
        ({ id }) => id === parseInt(this.alertToDeleteId),
      );
    },
    alertToDeleteName() {
      return this.alertToDeleteItem?.name;
    },
    alertToDeleteTag() {
      return this.alertToDeleteItem?.conditions[0].tag;
    },
    tableAlerts() {
      return this.alerts.map(({ id, name, conditions, lastAlert }) => {
        return {
          id,
          name,
          alertsOn: conditions.map(({ tag }) => tag).join(", "),
          lastAlert:
            lastAlert === "never"
              ? lastAlert
              : new Date(lastAlert).toLocaleString(),
          remove: "",
        };
      });
    },
  },
  methods: {
    unsetDeleteAlert() {
      const params = this.$route.params;
      delete params.deleteItemId;
      this.$router.replace({
        name: this.$route.name,
        params,
      });
    },
    setDeleteAlert(id: AlertId) {
      this.$router.replace({
        name: this.$route.name,
        params: {
          ...this.$route.params,
          deleteItemId: id,
        },
      });
      //alertToDeleteId = data.item.id
    },
    async removeAlert(id: AlertId) {
      const response = await api.alerts.removeAlert(id);
      if (response.success) {
        this.$emit("alerts-changed");
        await this.fetchAlerts();
      }
    },
    createAlert(e) {
      this.currentAlertTag = "";
      this.creatingAlert = true;
    },
    async submitAlert() {
      const response = await api.alerts.createAlertForStation(
        this.station.id,
        this.currentAlertTag,
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
