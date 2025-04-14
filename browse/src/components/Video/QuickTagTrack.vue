<template>
  <div class="tag-buttons">
    <div class="tag-category">
      <h6>Your classification:</h6>
      <div class="tag-btns-wrapper animals">
        <button
          v-for="animal in animals"
          :key="animal"
          :class="['btn btn-light btn-tag equal-flex', getClass(animal)]"
          @click="quickTag(animal)"
          :disabled="taggingPending"
        >
          <img
            :alt="`Mark as ${animal}`"
            onerror="this.src='data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='"
            :title="`Mark as ${animal}`"
            class="img-tag"
            :src="imgSrc(animal)"
          />
          <span class="tag-name">{{ animal }}</span>
        </button>
      </div>
      <div v-if="pinnedLabels" class="pinned-labels mt-1">
        <div class="pinned-label" v-for="label in pinnedLabels" :key="label">
          <div
            @mouseover="
              () => {
                hoveredPinned = label;
              }
            "
            @mouseout="
              () => {
                hoveredPinned = null;
              }
            "
            @click="
              () => {
                $store.commit('Video/pinnedLabels', label);
                hoveredPinned = null;
              }
            "
            role="button"
          >
            <font-awesome-icon
              v-if="label === hoveredPinned"
              class="pinned-button pinned-button-cross"
              icon="times"
              size="1x"
              v-b-tooltip.hover
            />
            <font-awesome-icon
              v-else
              class="pinned-button"
              icon="thumbtack"
              size="1x"
              v-b-tooltip.hover
            />
          </div>
          <button
            :key="label"
            :class="['btn btn-light btn-tag equal-flex', getClass(label)]"
            @click="quickTag(label)"
            :disabled="taggingPending"
          >
            <span class="tag-name">{{ label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="tag-category">
      <div class="tag-btns-wrapper other">
        <button
          v-for="otherTag in otherTags"
          :key="otherTag.value"
          :class="[
            'btn btn-light btn-tag equal-flex other-width',
            getClass(otherTag.value),
          ]"
          :disabled="taggingPending"
          @click="quickTag(otherTag.value)"
        >
          <img
            :alt="getOtherTitle(otherTag.value)"
            class="img-tag"
            onerror="this.src='data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='"
            :title="getOtherTitle(otherTag.value)"
            :src="imgSrc(otherTag.value)"
          />
          <span class="tag-name">{{ otherTag.text }}</span>
        </button>
      </div>
    </div>
    <div class="tag-category d-flex">
      <ClassificationsDropdown
        v-model="selectedValue"
        @input="addDropdownTag"
        @click="$emit('openDropdown')"
        :exclude="['interesting']"
      />

      <div class="button-selectors d-flex">
        <b-button
          class="ml-2 tag-pin text-primary"
          :disabled="!userTags"
          @click="togglePinTag"
        >
          <font-awesome-icon
            icon="thumbtack"
            size="1x"
            v-b-tooltip.hover
            title="Pin current tag to buttons"
          />
        </b-button>
        <b-button
          class="ml-2 tag-cross text-danger"
          :disabled="!userTags"
          @click="removeTag"
        >
          <font-awesome-icon
            icon="times"
            size="1x"
            v-b-tooltip.hover
            title="Remove Tag from Track"
          />
        </b-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import DefaultLabels, { imgSrc, TrackLabel } from "../../const";
import ClassificationsDropdown from "@/components/ClassificationsDropdown.vue";
import {
  watch,
  defineComponent,
  PropType,
  ref,
  computed,
} from "@vue/composition-api";
import store from "@/stores";
import {
  ApiHumanTrackTagResponse,
  ApiAutomaticTrackTagResponse,
} from "@typedefs/api/trackTag";
export default defineComponent({
  name: "QuickTagTrack",
  props: {
    tags: {
      type: Array as PropType<
        (ApiHumanTrackTagResponse | ApiAutomaticTrackTagResponse)[]
      >,
      required: true,
    },
    isWallabyProject: {
      type: Boolean,
      default: false,
    },
  },
  components: {
    ClassificationsDropdown,
  },
  setup(props, { emit }) {
    const uniqueTags = ["part", "interesting", "poor tracking"];
    const getUserTag = () => {
      return props.tags.find(
        (tag) =>
          !tag.automatic &&
          tag.userName === store.state.User.userData.userName &&
          !uniqueTags.includes(tag.what)
      );
    };
    const selectedValue = ref<string | null>(getUserTag()?.what ?? "");
    const pinnedTag = computed(() => {
      return selectedValue.value
        ? store.state.Video.pinnedLabels?.includes(selectedValue.value)
        : false;
    });
    const togglePinTag = () => {
      if (!selectedValue.value) {
        return;
      }
      store.commit("Video/pinnedLabels", selectedValue.value);
    };

    const removeTag = () => {
      const existingTag = getUserTag();
      if (existingTag && existingTag.what === selectedValue.value) {
        emit("deleteTag", existingTag);
        return;
      }
    };

    const addDropdownTag = () => {
      const existingTag = getUserTag();
      if (existingTag && existingTag.what === selectedValue.value) {
        return;
      }
      const tag: Partial<ApiHumanTrackTagResponse> = {
        confidence: 0.85,
        what: selectedValue.value,
      };
      emit("addTag", tag);
    };

    watch(
      () => props.tags,
      () => {
        selectedValue.value = getUserTag()?.what ?? "";
      }
    );
    return {
      selectedValue,
      addDropdownTag,
      removeTag,
      pinnedTag,
      togglePinTag,
    };
  },
  computed: {
    blankImage() {
      return "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    },
    aiGuess() {
      return this.tags.find((tag) => tag.automatic && tag.model === "Master");
    },
    pinnedLabels() {
      return this.$store.state.Video.pinnedLabels;
    },
    animals() {
      return this.isWallabyProject
        ? DefaultLabels.wallabyQuickTagLabels()
        : DefaultLabels.quickTagLabels();
    },
    userTags() {
      return this.tags.filter(
        (tag) =>
          !tag.automatic &&
          tag.userName === this.$store.state.User.userData.userName
      );
    },
    taggingPending(): boolean {
      return this.tags.some((tag) => tag.id === -1);
    },
    otherTags() {
      const otherTags = DefaultLabels.otherTagLabels();
      // Make sure we always show a button with the AI guess if it's not in the default list:
      const aiGuess = this.aiGuess;
      if (
        aiGuess &&
        aiGuess.what !== "unidentified" &&
        !this.animals.includes(aiGuess.what) &&
        !this.pinnedLabels.includes(aiGuess.what) &&
        otherTags.find(({ value }) => value === aiGuess.what) === undefined
      ) {
        otherTags.unshift({
          text: aiGuess.what,
          value: aiGuess.what,
        } as TrackLabel);
      }
      // Make sure we always show a button for a user tagged track if it's not in the default list:
      const userTags = this.userTags.filter(
        (tag) =>
          ![
            "unidentified",
            "false positive",
            ...this.animals,
            ...this.pinnedLabels,
            ...otherTags.map((val) => val.value),
          ].includes(tag.what)
      );
      if (userTags) {
        userTags.forEach((tag) => {
          otherTags.unshift({
            text: tag.what,
            value: tag.what,
          } as TrackLabel);
        });
      }
      return otherTags;
    },
  },
  data() {
    return {
      message: "",
      hoveredPinned: null,
    };
  },
  methods: {
    imgSrc,
    quickTag(what) {
      const found = this.getUserTag(what);
      if (found) {
        this.$emit("deleteTag", found);
      }

      const tag: Partial<ApiHumanTrackTagResponse> = {
        confidence: 0.85,
        what: what,
      };

      tag.confidence = 0.85;
      tag.what = what;
      this.$emit("addTag", tag);
    },
    getOtherTitle(other) {
      if (other === DefaultLabels.falsePositiveLabel.value) {
        return "Mark as nothing or false positive (meaning there is no animal)";
      } else if (other === DefaultLabels.unknownLabel.value) {
        return "Mark as unidentified (meaning the type of animal is unclear)";
      }
    },
    hasUserTag(animal) {
      return this.getUserTag(animal) !== undefined;
    },
    getUserTag(animal) {
      return this.userTags.find((tag) => tag.what === animal);
    },
    getClass(animal) {
      let buttonClass = "tag-div";
      if (this.hasUserTag(animal)) {
        buttonClass += " tagged active";
      }
      // var aiTag = this.tags.find(function(tag) {
      //   return tag.what == animal && tag.automatic;
      // });

      // if (aiTag) {
      //   buttonClass += " ai-tagged active";
      // }
      return buttonClass;
    },
  },
});
</script>

<style lang="scss" scoped>
@import "src/styles/tag-colours";

.img-tag {
  min-width: 44px;
  min-height: 44px;
  background: transparent;
}

.tag-buttons {
  margin-bottom: 1.2rem;
  display: flex;
  flex-flow: row wrap;
  justify-content: space-between;
  .tag-category {
    width: 100%;
    h6 {
      font-size: 0.75em;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 1em;
    }
    margin-bottom: 1em;
  }
  .tag-btns-wrapper {
    display: flex;
    .btn {
      margin-right: 4px;
      > span {
        display: inline-block;
      }
    }
    .btn:last-child {
      margin-right: 0;
    }
  }
  .equal-flex {
    flex: 1 1 0;
  }
  .btn-tag {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-left: 0.2em;
    padding-right: 0.2em;
    img {
      max-width: 44px;
    }
    .tag-name {
      font-size: 0.7em;
    }
    &.tagged {
      border: 2px solid $human !important;
    }
    &.ai-tagged {
      border: 2px solid $ai !important;
    }
    &.ai-tagged.tagged {
      border: 2px solid $aihuman !important;
    }
  }
}

.pinned-labels {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-gap: 4px;
  div {
    button {
      padding-top: 0.5em;
      padding-bottom: 0.5em;
      width: 100%;
    }
  }
}
.button-selectors {
  button {
    background-color: white;
    color: #2b333f;
    border-radius: 0.5em;
    border: 1px #e8e8e8 solid;
    box-shadow: 0px 1px 2px 1px #ebebeb70;
    text-transform: capitalize;
    &:hover:enabled {
      color: #7f8c8d;
    }
  }
}

.pinned-label {
  position: relative;
}
.pinned-button {
  position: absolute;
  top: 0;
  left: 0;
  margin-left: 0.2em;
  margin-top: 0.2em;
  z-index: 0;
  color: #3498db;
}
.pinned-button-cross {
  color: #e74c3c;
}
@media only screen and (max-width: 359px) {
  .tag-buttons {
    .btn-tag {
      font-size: smaller;
      img {
        max-width: 32px;
      }
    }
  }
}
</style>
