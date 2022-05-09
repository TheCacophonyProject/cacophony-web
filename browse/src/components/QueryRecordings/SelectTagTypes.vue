<template>
  <b-form-group>
    <label>Tag Type</label>
    <b-form-select
      :value="value"
      :options="options"
      placeholder="any"
      @input="$emit('input', $event)"
      data-cy="tag-select"
    />
  </b-form-group>
</template>
<script>
import DefaultLabels from "../../const";

export default {
  name: "SelectTagTypes",
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      options: DefaultLabels.searchRecordingLabels(),
    };
  },
};
</script>

<style src="vue-multiselect/dist/vue-multiselect.min.css"></style>
