<template>
  <div>
    <b-form>
      <b-form-group>
        <!--        FIXME - Does user-entered ever exist? -->
        <div
          v-if="
            recording.additionalMetadata &&
            'user-entered' in recording.additionalMetadata
          "
        >
          <h3>Properties</h3>
          <div>
            <p
              v-for="(value, key) of recording.additionalMetadata[
                'user-entered'
              ]"
              :key="key"
              class="user-prop"
            >
              <strong>{{ key }}:</strong> {{ value }}
            </p>
          </div>
        </div>

        <div
          class="simple-accordion-wrapper"
          v-if="isSuperUserAndViewingAsSuperUser"
        >
          <h5
            id="technical-details"
            class="simple-accordion-header"
            @click="display = !display"
          >
            Technical details &nbsp;
            <span v-if="!display" title="Show details" class="pointer">
              <font-awesome-icon icon="angle-down" class="fa-1x" />
            </span>
            <span v-if="display" title="Hide details" class="pointer">
              <font-awesome-icon icon="angle-up" class="fa-1x" />
            </span>
          </h5>
          <div v-if="display">
            <div v-for="prop of properties" :key="prop.key">
              <p
                v-if="recording.batteryLevel && prop.key === 'batteryLevel'"
                class="prop"
              >
                <strong>Battery Level: </strong
                ><BatteryLevel :battery-level="recording.batteryLevel" />
              </p>
              <p
                v-else-if="recording.location && prop.key === 'location'"
                class="prop"
              >
                <strong>Location: </strong>{{ parseLocation }}
              </p>
              <div
                v-else-if="
                  recording.additionalMetadata &&
                  prop.key === 'additionalMetadata'
                "
              >
                <div
                  v-for="(value, key) of recording.additionalMetadata"
                  :key="key"
                >
                  <p
                    v-if="key != 'tracks' && key != 'user-entered'"
                    class="prop"
                  >
                    <strong>{{ key }}:</strong> {{ value }}
                  </p>
                </div>
              </div>
              <p v-else-if="recording[prop.key] != null" class="prop">
                <strong>{{ prop.title }}:</strong> {{ recording[prop.key] }}
              </p>
            </div>
          </div>
        </div>
      </b-form-group>
    </b-form>
  </div>
</template>

<script lang="ts">
import BatteryLevel from "../BatteryLevel.vue";
import { shouldViewAsSuperUser } from "@/utils";
import { defineComponent } from "@vue/composition-api";

export default defineComponent({
  name: "RecordingProperties",
  components: {
    BatteryLevel,
  },
  props: {
    value: {
      type: String,
      default: "",
    },
    recording: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      display: false,
      properties: [
        {
          key: "processingState",
          title: "Processing State",
        },
        { key: "location", title: "Location" },
        {
          key: "relativeToDusk",
          title: "Relative to Dusk",
        },
        {
          key: "relativeToDawn",
          title: "Relative to Dawn",
        },
        { key: "batteryLevel", title: "Battery Level" },
        {
          key: "batteryCharging",
          title: "Battery Charging",
        },
        {
          key: "airplaneModeOn",
          title: "Airplane Mode",
        },
        { key: "version", title: "Version" },
        {
          key: "additionalMetadata",
          title: "Additional Metadata",
        },
      ],
      metaFields: [
        {
          key: "key",
          label: "Additional Metadata",
        },
        {
          key: "data",
          label: "",
        },
      ],
    };
  },
  computed: {
    isSuperUserAndViewingAsSuperUser(): boolean {
      return (
        this.$store.state.User.userData.isSuperUser && shouldViewAsSuperUser()
      );
    },
    parseLocation: function () {
      if (this.recording.location) {
        return `Lat: ${this.recording.location.lat.toFixed(
          2
        )}, Long: ${this.recording.location.lng.toFixed(2)}`;
      } else {
        return "No location";
      }
    },
    metaItems: function () {
      return (
        this.recording.additionalMetadata
          ?.map((data) => Object.entries(data))
          // eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
          .filter(([key, _]) => key !== "tracks")
          .map(([key, data]) => ({ key, data }))
      );
    },
  },
});
</script>

<style scoped>
#technical-details {
  padding-top: 15px;
}

.user-prop,
.prop {
  padding-left: 15px;
}

.user-prop,
.prop {
  margin-bottom: 0.4rem;
}

.user-prop:last-child {
  margin-bottom: 1.5rem;
}
</style>
