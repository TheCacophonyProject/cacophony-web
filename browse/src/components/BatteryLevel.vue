<template>
  <span>
    <font-awesome-icon :icon="icon" />
    <span class="label">{{ batteryLevel }}%</span>
  </span>
</template>

<script>
import { defineComponent } from "@vue/composition-api";

export default defineComponent({
  name: "BatteryLevel",
  props: {
    batteryLevel: {
      type: Number,
      default: null,
    },
  },
  computed: {
    icon: function () {
      if (this.batteryLevel < 10) {
        return "battery-empty";
      } else if (this.batteryLevel < 37.5) {
        return "battery-quarter";
      } else if (this.batteryLevel < 62.5) {
        return "battery-half";
      } else if (this.batteryLevel < 90) {
        return "battery-three-quarters";
      } else if (this.batteryLevel <= 100) {
        return "battery-full";
      } else {
        return null;
      }
    },
  },
});
</script>

<style scoped>
.label {
  vertical-align: middle;
}
</style>
