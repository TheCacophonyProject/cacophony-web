<template>
  <div>
    <Comment
      :initial-comment="comment"
      @updateComment="updateComment($event)"
    />
    <div class="video-tags">
      <b-row class="pt-2 pb-2">
        <b-col cols="6" md="3">
          <b-button-group class="btn-block pb-2">
            <b-dropdown text="Label" right variant="info" class="btn-block">
              <b-dropdown-item
                v-b-tooltip.hover.left="
                  'Flag this recording for review due to low confidence IDing track(s)'
                "
                @click="addRequiresReviewTag"
              >
                Flag for review
              </b-dropdown-item>

              <b-dropdown-item
                v-b-tooltip.hover.left="
                  'An animal is in a trap in this recording'
                "
                @click="addTrappedTag"
              >
                Animal in trap
              </b-dropdown-item>

              <b-dropdown-item
                v-b-tooltip.hover.left="
                  'An animal interacted with a trap in this recording'
                "
                @click="addTrapInteractionTag"
              >
                Animal interacted with trap
              </b-dropdown-item>

              <b-dropdown-item
                :disabled="!processingCompleted"
                v-b-tooltip.hover.left="
                  !processingCompleted
                    ? 'Tracks are still being processed'
                    : 'One or more animals do not have a corresponding track in this recording'
                "
                @click="addMissedTrackTag"
              >
                Missed track
              </b-dropdown-item>

              <b-dropdown-item
                v-b-tooltip.hover.left="
                  'Missing an earlier recording that explains how the animal got to where it is now'
                "
                @click="addTag('missed recording')"
              >
                Missed recording
              </b-dropdown-item>

              <b-dropdown-item
                v-b-tooltip.hover.left="
                  'Mark this as a cool or interesting recording'
                "
                @click="addCoolTag"
              >
                Cool
              </b-dropdown-item>

              <b-dropdown-item
                v-b-tooltip.hover.left="
                  'There is more than one animal in this recording'
                "
                @click="addMultipleAnimalsTag"
              >
                Multiple animals
              </b-dropdown-item>

              <b-dropdown-item
                v-b-tooltip.hover.left="'There is an animal inside a trap/area'"
                @click="addInsideTag"
              >
                Inside
              </b-dropdown-item>

              <b-dropdown-item
                v-b-tooltip.hover.left="
                  'There is an animal outside a trap/area'
                "
                @click="addOutsideTag"
              >
                Outside
              </b-dropdown-item>

              <b-dropdown-item @click="addIncursionTag">
                Incursion
              </b-dropdown-item>
            </b-dropdown>
          </b-button-group>
        </b-col>

        <b-col cols="6" md="3">
          <b-button v-b-modal.update-comment variant="info" block>
            Comment
          </b-button>
        </b-col>

        <b-col cols="6" md="3">
          <b-button-group class="btn-block">
            <b-dropdown text="Download" right class="btn-block">
              <b-dropdown-item @click="$emit('requested-export')">
                <font-awesome-icon :icon="['far', 'file-video']" />
                Export Video
              </b-dropdown-item>
              <b-dropdown-item @click="$emit('requested-export', true)">
                <font-awesome-icon :icon="['far', 'file-video']" />
                Export Video (Advanced)
              </b-dropdown-item>
              <b-dropdown-item :href="downloadRawUrl" target="_blank">
                <font-awesome-icon :icon="['far', 'file']" />
                CPTV
              </b-dropdown-item>
            </b-dropdown>
          </b-button-group>
        </b-col>

        <b-col cols="6" md="3">
          <b-button
            :disabled="deleteDisabled"
            variant="danger"
            block
            @click="deleteRecording()"
            v-b-tooltip.hover
            :title="
              deleteDisabled ? 'Deleting recording requires group admin' : ''
            "
          >
            <font-awesome-icon
              icon="exclamation-triangle"
              class="d-none d-md-inline"
            />
            Delete
          </b-button>
        </b-col>
      </b-row>

      <b-table
        v-if="items.length > 0"
        id="tags-table"
        :items="items"
        :fields="fields"
        class=""
        striped
        hover
        responsive
      >
        <template v-slot:cell(whatDetail)="row">
          {{ whatDetail(row.item) }}
        </template>
        <template v-slot:cell(deleteButton)="row">
          <button class="button btn" :disabled="row.item.tag.id === -1">
            <font-awesome-icon
              icon="trash"
              @click="$emit('deleteTag', row.item.tag.id)"
            />
          </button>
        </template>
      </b-table>
    </div>
  </div>
</template>

<script>
import api from "@api";
import Comment from "./Comment.vue";
import { shouldViewAsSuperUser } from "@/utils";

export default {
  name: "RecordingControls",
  components: { Comment },
  props: {
    items: {
      type: Array,
      required: true,
    },
    comment: {
      type: String,
      default: "",
    },
    groupId: {
      type: String,
      default: "",
    },
    stationId: {
      type: String,
      default: "",
    },
    downloadRawUrl: {
      type: String,
      default: "",
    },
    processingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      fields: [
        { key: "whatDetail", label: "What" },
        { key: "who", label: "By" },
        { key: "when", label: "When" },
        {
          key: "deleteButton",
          label: "",
          tdClass: "tags-table-buttons",
        },
      ],
      deleteDisabled: true,
      isGroupAdmin: false,
    };
  },
  async mounted() {
    if (shouldViewAsSuperUser()) {
      this.deleteDisabled = false;
    } else {
      const response = await api.groups.getGroupById(this.groupId);
      if (response.success) {
        this.deleteDisabled = !response.result.group.admin;
      } else {
        this.deleteDisabled = true;
      }
    }
  },
  watch: {
    items: async function () {
      if (shouldViewAsSuperUser()) {
        this.deleteDisabled = false;
      } else {
        const response = await api.groups.getGroupById(this.groupId);
        if (response.success) {
          this.deleteDisabled = !response.result.group.admin;
        } else {
          throw response.result;
        }
      }
    },
  },
  methods: {
    addMissedTrackTag: function () {
      this.addTag("missed track");
    },
    addCoolTag: function () {
      this.addTag("cool");
    },
    addTrappedTag: function () {
      this.addTag("trapped in trap");
    },
    addTrapInteractionTag: function () {
      this.addTag("interaction with trap");
    },
    addMultipleAnimalsTag: function () {
      this.addTag("multiple animals");
    },
    addRequiresReviewTag: function () {
      this.addTag("requires review");
    },
    addInsideTag: function () {
      this.addTag("inside");
    },
    addOutsideTag: function () {
      this.addTag("outside");
    },
    addIncursionTag: function () {
      this.addTag("incursion");
    },
    addTag: function (label) {
      this.$emit("addTag", {
        detail: label,
        confidence: 0.9,
      });
    },
    whatDetail: function (item) {
      return sentenceCase(item.what || item.detail || "-");
    },
    async deleteRecording() {
      this.deleteDisabled = true;
      const { success } = await api.recording.del(this.$route.params.id);
      if (success) {
        const response = await api.station.getStationById(this.stationId);
        if (response.success) {
          const { station } = response.result;
          if (station.recordingsCount === 0) {
            //Prompt user to delete station
            const shouldDelete = await this.$bvModal.msgBoxConfirm(
              "This was the last recording on this station. Do you want to delete the station?",
              {
                title: "Delete Station",
                okVariant: "danger",
                okTitle: "Delete",
                cancelTitle: "Cancel",
                footerClass: "p-2",
                hideHeaderClose: false,
                centered: true,
              }
            );
            if (shouldDelete) {
              await api.station.deleteStationById(station.id);
            }
          }
        }
      }
      this.deleteDisabled = false;
      if (success) {
        this.$emit("deleted-recording");
      }
    },
    updateComment(event) {
      this.$emit("updateComment", event);
    },
  },
};

function sentenceCase(s) {
  if (s.length > 0) {
    return s[0].toUpperCase() + s.substr(1).toLowerCase();
  }
  return "";
}
</script>

<style scoped>
.video-tags {
  position: relative;
}
</style>

<style>
.table td.tags-table-buttons {
  padding: 0;
}
</style>
