<template>
  <svg
    :height="radius * 2"
    :width="radius * 2"
    :class="['progress-ring', { spin }, { resetting }]"
  >
    <circle
      v-if="!spin"
      stroke="#ccc"
      stroke-linecap="round"
      fill="transparent"
      :stroke-dasharray="'3 5'"
      :stroke-width="stroke"
      :r="normalizedRadius"
      :cx="radius"
      :cy="radius"
    />
    <circle
      stroke="#666"
      fill="transparent"
      stroke-linecap="round"
      :stroke-dasharray="circumference + ' ' + circumference"
      :style="{ strokeDashoffset }"
      :stroke-width="stroke"
      :r="normalizedRadius"
      :cx="radius"
      :cy="radius"
    />
  </svg>
</template>

<script>
// Adapted from https://css-tricks.com/building-progress-ring-quickly/

export default {
  name: "ProgressRing",
  props: {
    radius: {
      type: Number,
      default: 17,
    },
    spin: {
      type: Boolean,
      default: false,
    },
    resetting: {
      type: Boolean,
      default: false,
    },
    progress: {
      type: Number,
      required: true,
    },
    stroke: {
      type: Number,
      default: 3,
    },
  },
  data() {
    const normalizedRadius = this.radius - this.stroke;
    const circumference = normalizedRadius * 2 * Math.PI;

    return {
      normalizedRadius,
      circumference,
    };
  },
  computed: {
    strokeDashoffset() {
      return this.circumference - (this.progress / 100) * this.circumference;
    },
  },
};
</script>

<style lang="scss" scoped>
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
.progress-ring {
  position: absolute;
  top: 0;
  left: 0;
  transform: rotate(90deg);
  &.spin {
    animation: spin 500ms linear infinite;
  }
  &.resetting {
    animation: fadeOut 1s ease-in-out;
  }
}
</style>
