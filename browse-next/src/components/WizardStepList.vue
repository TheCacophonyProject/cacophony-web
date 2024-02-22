<script setup lang="ts">
import { onBeforeMount, ref, useSlots, type VNode } from "vue";
import { useMediaQuery } from "@vueuse/core";

const selectedStep = ref(0);
const slots = useSlots();
const items = ref<VNode[]>([]);
const stepNames = ref<string[]>([]);
const validStates = ref<boolean[]>([]);

onBeforeMount(() => {
  const allItems = (slots.default && slots.default()) || [];
  stepNames.value = allItems.map((item) => item.props?.title || "");
  validStates.value = stepNames.value.map(() => false);
  validStates.value[0] = false;
  items.value = allItems;
});

const validationStateChanged = (isValid: boolean, itemIndex: number) => {
  validStates.value[itemIndex] = isValid;
};

const prevStepIsValid = (stepIndex: number): boolean => {
  if (stepIndex === 0) {
    return true;
  }
  return validStates.value[Math.max(0, stepIndex - 1)];
};
const isMobileView = useMediaQuery("(max-width: 639px)");
// TODO: Step button can be disabled if requirements for previous step aren't met
</script>

<template>
  <div class="d-flex flex-md-row flex-column-reverse mt-3 align-items-md-start">
    <b-button-group
      :vertical="!isMobileView"
      class="me-md-3 wizard-step-list-menu"
    >
      <b-button
        variant="outline-secondary"
        v-for="(item, index) in stepNames"
        :key="index"
        @click="selectedStep = index"
        :active="selectedStep == index"
        :disabled="!prevStepIsValid(index)"
        >{{ index + 1 }}. {{ item }}</b-button
      >
    </b-button-group>
    <component
      class="flex-md-grow-1"
      v-for="(item, index) in items"
      :is="item"
      :key="index"
      :visible="index == selectedStep"
      @validation-state-change="(isValid: boolean) => validationStateChanged(isValid, index)"
    />
  </div>
</template>

<style scoped lang="less">
.wizard-step-list-menu {
  min-width: 200px;
  .btn {
    text-align: left;
  }
}
@media screen and (max-width: 639px) {
  .wizard-step-list-menu {
    position: absolute;
    bottom: 0;
    right: 0;
    left: 0;
    margin-left: 10px;
    margin-bottom: 10px;
    margin-right: 10px;
    .btn {
      text-align: center;
    }
  }
}
</style>
