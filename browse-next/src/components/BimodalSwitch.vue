<template>
  <div
    class="d-flex align-items-center"
    :class="{ 'w-100': spread, spread, 'justify-content-center': spread }"
  >
    <span
      class="text-capitalize toggle-label me-2"
      :class="{ selected: !mode }"
      @click="mode = false"
      >{{ modes[0] }}</span
    ><b-form-checkbox class="bi-modal-switch" v-model="mode" switch /><span
      @click="mode = true"
      class="text-capitalize toggle-label"
      :class="{ selected: mode }"
      >{{ modes[1] }}</span
    >
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from "vue";

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const props = withDefaults(
  defineProps<{
    modelValue: string;
    modes: [string, string];
    spread?: boolean;
  }>(),
  { spread: false }
);

const mode = ref<boolean>(false);
watch(mode, (nextMode: boolean) => {
  if (nextMode) {
    emit("update:modelValue", props.modes[1]);
  } else {
    emit("update:modelValue", props.modes[0]);
  }
});

onMounted(() => {
  mode.value =
    (props.modes && props.modes.indexOf(props.modelValue) === 1) || false;
});
</script>
<style lang="less" scoped>
.spread {
  position: relative;
  > span:first-child {
    position: absolute;
    left: 0;
  }
  > span:last-child {
    position: absolute;
    right: 0;
  }
}
</style>
<style lang="less">
.bi-modal-switch.form-check-input,
.bi-modal-switch.form-check-input:checked,
.bi-modal-switch.form-check-input:focus {
  background-color: #0d6efd;
  border-color: #0d6efd;
  position: relative;
  background-image: unset;
  &::before {
    position: absolute;
    height: 100%;
    width: 14px;
    display: block;
    content: " ";
    background-repeat: no-repeat;
    background-image: url(../assets/switch-base.svg);
    background-size: auto 100%;
    transition: transform 0.15s ease-in-out, left 0.2s ease-in-out;
  }
}
.bi-modal-switch.form-check-input {
  &::before {
    left: 0;
    transform: rotate(-180deg);
  }
}
.bi-modal-switch.form-check-input:checked {
  &::before {
    left: 16px;
    transform: rotate(0);
  }
}
.toggle-label {
  color: #999;
  font-weight: 500;
  font-size: 14px;
  transition: color 0.2s linear;
  cursor: pointer;
  user-select: none;
  display: inline-block;
  &.selected {
    color: #666;
  }
}
</style>
