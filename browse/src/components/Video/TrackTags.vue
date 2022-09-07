<template>
  <div class="simple-accordion-wrapper">
    <h6 class="simple-accordion-header" @click="toggleDetails()">
      Tag history
      <span v-if="!showDetails" title="Show all result classes" class="pointer">
        <font-awesome-icon icon="angle-down" class="fa-1x" />
      </span>
      <span v-if="showDetails" title="Hide other results" class="pointer">
        <font-awesome-icon icon="angle-up" class="fa-1x" />
      </span>
    </h6>
    <div v-if="showDetails">
      <b-table
        :items="tagItems"
        :fields="fields"
        class="track-tag-table"
        striped
        hover
        small
        responsive
      >
        <template v-slot:cell(what)="row">
          <div class="what-image">
            <img
              onerror="this.src='data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='"
              :src="imgSrc(row.item.what)"
              class="tag-img"
              :alt="row.item.what"
            />
            {{ tagName(row.item) }}
          </div>
        </template>

        <template v-slot:cell(who)="row">
          <span v-if="row.item.userName">
            {{ row.item.userName }}
          </span>
          <span v-else>
            {{ aiName(row.item) }}
          </span>
        </template>
        <template v-slot:cell(confidence)="row">
          {{ confidence(row.item.confidence) }}
        </template>
        <!-- Be careful about changing the tooltips to use a placement
             other than "left" here. This can cause the tooltips to be
             positioned badly, causing flickering and leads to other
             problems:

             - https://github.com/TheCacophonyProject/cacophony-browse/issues/180
             - ttps://github.com/TheCacophonyProject/cacophony-browse/issues/185
          -->
        <template v-slot:cell(buttons)="row">
          <button
            v-b-tooltip.hover.left="'Confirm the automatic tag'"
            v-if="canConfirm(row.item)"
            class="btn"
            @click="confirmTag(row.item)"
          >
            <font-awesome-icon icon="check-circle" />
          </button>

          <button
            v-b-tooltip.hover.left="'Delete tag'"
            v-if="
              (isGroupOrDeviceAdmin || row.item.userName === thisUserName) &&
              !row.item.automatic
            "
            class="btn"
            @click="$emit('deleteTag', row.item)"
          >
            <font-awesome-icon icon="trash" />
          </button>
        </template>
      </b-table>
    </div>
  </div>
</template>

<script lang="ts">
import api from "@/api";
import { imgSrc } from "@/const";
import {
  ApiTrackTagRequest,
  ApiTrackTagResponse,
} from "@typedefs/api/trackTag";
import { shouldViewAsSuperUser } from "@/utils";

export default {
  name: "TrackTags",
  props: {
    items: {
      type: Array,
      required: true,
    },
    deviceId: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      fields: [
        {
          key: "what",
          label: "Tag",
          tdClass: "tag-history-table-what",
        },
        { key: "who", label: "User" },
        { key: "confidence", label: "Conf." },
        {
          key: "buttons",
          label: "",
          tdClass: "tag-history-table-buttons",
        },
      ],
      showDetails: false,
      isGroupOrDeviceAdmin: null,
    };
  },
  computed: {
    isSuperUserAndViewingAsSuperUser(): boolean {
      return (
        this.$store.state.User.userData.isSuperUser && shouldViewAsSuperUser()
      );
    },
    thisUserName(): string {
      return this.$store.state.User.userData.userName;
    },

    tagItems() {
      let items;
      if (this.isSuperUserAndViewingAsSuperUser) {
        items = [...this.items];
      } else {
        // Remove AI tags other than master, as they'll just be confusing
        items = this.items.filter(
          (item: ApiTrackTagResponse) =>
            !item.automatic || item.data.name === "Master"
        );
      }
      return items.sort((a: ApiTrackTagResponse, b: ApiTrackTagResponse) => {
        if (a.createdAt && b.createdAt) {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        } else if (a.createdAt) {
          return 1;
        } else if (b.createdAt) {
          return -1;
        }
        return 0;
      });
    },
  },
  methods: {
    async toggleDetails() {
      this.showDetails = !this.showDetails;
      if (this.isSuperUserAndViewingAsSuperUser) {
        this.isGroupOrDeviceAdmin = true;
      }
      if (this.isGroupOrDeviceAdmin === null) {
        const groupResponse = await api.device.getDeviceById(this.deviceId);
        if (groupResponse.success) {
          const { result } = groupResponse;
          this.isGroupOrDeviceAdmin = result.device.admin;
        }
      }
    },
    imgSrc,
    aiName: function (trackTag) {
      if (
        this.isSuperUserAndViewingAsSuperUser &&
        trackTag.data &&
        trackTag.data.name
      ) {
        return "AI " + trackTag.data.name;
      } else {
        return "Cacophony AI";
      }
    },
    confidence: function (confidence) {
      if (confidence >= 0.8) {
        return "high";
      } else if (confidence > 0.4 && confidence < 0.8) {
        return "mid";
      } else if (confidence <= 0.4) {
        return "low";
      } else {
        return "";
      }
    },
    userTagExists: function (what) {
      return this.items.find(
        (tag) =>
          !tag.automatic &&
          tag.what === what &&
          tag.userName === this.thisUserName
      );
    },
    confirmTag: function ({ what, confidence }) {
      const tag: ApiTrackTagRequest = {
        what,
        confidence,
      };
      this.$emit("addTag", tag);
    },
    canConfirm: function (item) {
      return (
        item.automatic &&
        !this.userTagExists(item.what) &&
        item.what != "trap triggered"
      );
    },
    tagName: function (item) {
      let name = item.what;
      if (name == "trap triggered") {
        name = `${name} - ${Math.round(item.data.frame / 10)}s`;
      }
      return name;
    },
  },
};
</script>

<style scoped>
.track-tag-table {
  font-size: 85%;
}

.tag-img {
  max-width: 30px;
  max-height: 30px;
  min-width: 30px;
  min-height: 30px;
  margin-right: 0.2rem;
  background: transparent;
}
</style>

<style>
/* As it turns out, this has to be placed outside scoped styles 😱 */
.track-tag-table .table td {
  vertical-align: middle;
}

td.tag-history-table-buttons {
  padding: 0 !important;
}
</style>
