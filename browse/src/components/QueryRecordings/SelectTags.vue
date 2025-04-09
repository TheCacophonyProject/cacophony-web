}
<template>
  <div class="mb-2">
    <b-form-group>
      <label>Tag Type</label>
      <b-form-select
        v-bind:value="value.tagMode"
        @input="$emit('input', { ...value, tagMode: $event })"
        :options="typeOptions"
        placeholder="any"
        data-cy="tag-select"
      />
    </b-form-group>
    <ClassificationsDropdown
      v-bind:value="value.tags"
      @input="$emit('input', { ...value, tags: $event })"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, watch, PropType } from "@vue/composition-api";
import DefaultLabels from "../../const";
import ClassificationsDropdown from "../ClassificationsDropdown.vue";

export default defineComponent({
  name: "SelectTags",
  components: {
    ClassificationsDropdown,
  },
  props: {
    value: {
      type: Object as PropType<{
        tagMode: string;
        tags: string[];
        exclusive: boolean;
      }>,
      default: () => ({}),
    },
  },
  setup(props, { emit }) {
    const typeOptions = DefaultLabels.searchRecordingLabels();

    watch(
      () => props.value,
      () => {
        if (
          props.value.tags &&
          props.value.tags.length > 0 &&
          !DefaultLabels.canHaveSpecifiedTags(props.value.tagMode)
        ) {
          emit("input", {
            tagMode: "tagged",
            tags: props.value.tags,
          });
        }
      },
    );
    return { typeOptions };
  },
});
</script>
