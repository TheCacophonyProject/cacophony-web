<template>
  <b-form-group>
    <label>Tagged as</label>
    <multiselect
      :value="value"
      :options="options"
      :multiple="true"
      :placeholder="placeholder"
      label="text"
      track-by="value"
      @input="$emit('input', $event)"
      data-cy="animal-select"
    />
  </b-form-group>
</template>
<script>
import DefaultLabels from "../../const";

export default {
  name: "AnimalSelect",
  props: {
    value: {
      type: Array,
      required: true,
    },
    canHaveSubTags: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      options: DefaultLabels.searchLabels(),
    };
  },
  computed: {
    placeholder: function () {
      if (this.value.length > 0) {
        return "add more animals";
      } else if (this.canHaveSubTags) {
        return "anything";
      } else {
        return "";
      }
    },
  },
};
</script>

<style src="vue-multiselect/dist/vue-multiselect.min.css"></style>
