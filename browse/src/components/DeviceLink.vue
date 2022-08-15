<template>
  <span class="link">
    <font-awesome-icon
      v-if="type === 'thermalRaw' || type === 'thermal'"
      icon="video"
      class="icon"
      size="xs"
    />
    <font-awesome-icon
      v-else-if="type === 'audio'"
      icon="music"
      class="icon"
      size="xs"
    />
    <font-awesome-icon v-else icon="question" class="icon" size="xs" />
    <span class="label">
      <b-link
        :disabled="!shouldLink"
        :to="{
          name: 'device',
          params,
        }"
      >
        {{ deviceName }}
      </b-link>
    </span>
  </span>
</template>

<script lang="ts">
export default {
  name: "DeviceLink",
  props: {
    groupName: {
      type: String,
      required: true,
    },
    type: {
      required: true,
    },
    deviceName: {
      type: String,
      required: true,
    },
    context: {
      type: String,
    },
    useLink: {
      type: Boolean,
      default: true,
    },
  },
  computed: {
    shouldLink() {
      if (this.useLink === false) {
        return this.useLink;
      }
      if (
        this.$route.name === "device" &&
        this.$route.params.groupName &&
        this.$route.params.groupName === this.groupName &&
        this.$route.params.deviceName &&
        this.$route.params.deviceName === this.deviceName
      ) {
        return false;
      }
      return this.useLink;
    },
    params() {
      if (typeof this.context !== "undefined" && this.context.trim() !== "") {
        return {
          groupName: this.groupName,
          deviceName: this.deviceName,
          tabName: this.context,
        };
      }
      return {
        groupName: this.groupName,
        deviceName: this.deviceName,
      };
    },
  },
};
</script>

<style scoped lang="scss">
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";

.link {
  display: inline-block;
  word-break: break-word;
  margin: 0 0.25rem;
}
.svg-inline--fa {
  color: $gray-600;
  min-width: 1rem;
  vertical-align: baseline;
}
.label {
  vertical-align: baseline;
}
a.disabled {
  pointer-events: none;
  color: inherit;
}
</style>
