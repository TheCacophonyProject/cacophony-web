<template>
  <div class="switch-wrapper" @click="toggle">
    <div :class="['switch-label', { active: !isOn }]">
      <span>{{ labelOff }}</span>
    </div>
    <div class="switch" :class="{ 'switch-on': isOn }">
      <div class="switch-handle"></div>
    </div>
    <div :class="['switch-label', { active: isOn }]">
      <span>{{ labelOn + " " }} </span>
    </div>
  </div>
</template>
  
  <script>
export default {
  props: {
    value: Boolean,
    labelOn: String,
    labelOff: String,
  },
  computed: {
    isOn() {
      return this.value;
    },
  },
  methods: {
    toggle() {
      this.$emit("input", !this.value);
    },
  },
};
</script>
  
  <style scoped>
.switch-wrapper {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.switch {
  position: relative;
  width: 50px;
  height: 25px;
  background-color: #3a68ca;
  border-radius: 25px;
  transition: background-color 0.3s;
}

.switch.switch-on {
  background-color: #4caf50;
}

.switch-handle {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 21px;
  height: 21px;
  background-color: #fff;
  border-radius: 50%;
  transition: left 0.3s;
}

.switch.switch-on .switch-handle {
  left: 27px;
}

.switch-label {
  margin-left: 10px;
  margin-right: 10px;
}

.active {
  font-weight: bold;
}
</style>
  