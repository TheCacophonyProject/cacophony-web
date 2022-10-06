<template>
  <b-dropdown
    class="settings-button"
    right
    toggle-class="text-decoration-none"
    no-caret
  >
    <template #button-content>
      <font-awesome-icon icon="cog" />
    </template>
    <b-dropdown-item variant="secondary" @click="download">
      <div data-cy="export">
        <font-awesome-icon icon="download" class="fa-1x" />
        Export
      </div>
    </b-dropdown-item>
    <b-dropdown-item
      v-b-modal.delete-all
      variant="danger"
      v-if="showBulkDelete"
    >
      <div>
        <font-awesome-icon icon="trash" />
        Bulk Delete
      </div>
      <b-modal
        id="delete-all"
        size="sm"
        title="Delete Recordings"
        hide-footer
        hide-backdrop
      >
        <p class="text-center">
          Are you sure you want to delete {{ recordingCount }} recordings for
          this query?
        </p>
        <b-button
          class="mt-3"
          variant="danger"
          block
          @click="
            () => {
              bulkDelete();
              $bvModal.hide('delete-all');
            }
          "
          >Delete All</b-button
        >
      </b-modal>
    </b-dropdown-item>
  </b-dropdown>
</template>

<script lang="ts">
import { useRoute } from "@/utils";
import config from "../../config";
import userapi from "@api/User.api";
import querystring from "querystring";
import recordingsapi from "@api/Recording.api";
import { defineComponent, PropType, ref, watch } from "@vue/composition-api";
import RecordingApi from "@api/Recording.api";
import api from "@/api";

export default defineComponent({
  name: "SettingsDropdown",
  events: ["submit"],
  props: {
    addDeletedRecordings: {
      type: Function as PropType<(recordingIds: string[]) => void>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const showBulkDelete = ref(false);
    const route = useRoute();
    const recordingCount = ref(0);
    const download = async () => {
      const token = await userapi.token();
      const params = recordingsapi.makeApiQuery(route.value.query);
      params.jwt = token;
      params.offset = 0;
      params.limit = 100000;
      params.type = "recordings";
      const url =
        `${config.api}/api/v1/recordings/report?` +
        querystring.stringify(params);
      window.open(url, "_self");
    };
    const bulkDelete = () => {
      const query = { ...route.value.query, offset: 0 };
      return RecordingApi.bulkDelete(query).then((query) => {
        // refresh the page
        if (query.success) {
          props.addDeletedRecordings(query.result.ids);
        }
        emit("submit", route.value.query);
      });
    };
    watch(route, async () => {
      const count = await api.recording.queryCount(route.value.query);
      if (count.success) {
        showBulkDelete.value = count.result.count > 0;
        recordingCount.value = count.result.count;
      }
    });
    return { route, download, bulkDelete, showBulkDelete, recordingCount };
  },
});
</script>

<style lang="scss">
.settings-button {
  .btn {
    padding: 2.5px 6px 2.5px 6px;
  }
}
</style>
