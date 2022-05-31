<template>
  <div class="container" style="padding: 0">
    <h2>Station reference photos</h2>
    <b-modal
      v-model="showModal"
      hide-footer
      hide-header
      body-class="p-0"
      centered
      size="xl"
      @hidden="modalImage = null"
    >
      <img :src="modalImage" width="100%" height="auto" />
    </b-modal>
    <div class="d-flex flex-row mt-1 mb-2 flex-wrap">
      <div
        v-for="{ image, key, loading } of images"
        :key="key"
        class="
          d-flex
          flex-column
          justify-content-between
          px-1
          mb-3
          align-items-center
        "
      >
        <div
          class="
            spinner-container
            d-flex
            align-items-center
            justify-content-center
          "
          v-if="loading"
        >
          <b-spinner small />
        </div>
        <img
          v-else
          class="image-thumb"
          :src="image"
          width="100"
          height="auto"
          @click="openImageInModal(image)"
        />
        <b-btn
          class="btn-outline-dark btn-light btn-sm mt-1"
          v-if="userIsGroupAdmin"
          @click="deleteImage(key)"
          >Remove</b-btn
        >
      </div>
    </div>
    <div>
      <p class="h6">Add reference photos for this station</p>
      <b-form-file
        v-if="userIsGroupAdmin"
        placeholder="Choose an image file or drop it here..."
        drop-placeholder="Drop image file here..."
        multiple
        accept="image/*"
        v-model="selectedUploads"
        @input="uploadSelectedFiles"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { mapState } from "vuex";
import { isViewingAsOtherUser } from "@/components/NavBar.vue";
import { shouldViewAsSuperUser } from "@/utils";
import api from "@/api";

export default {
  name: "StationReferencePhotosTab",
  props: {
    station: {
      required: true,
    },
  },
  data() {
    return {
      images: [],
      referenceImageKeys: [],
      selectedUploads: [],
      modalImage: null,
      showModal: false,
    };
  },
  async mounted() {
    // Load any existing station images.
    if (this.referenceImageKeys.length === 0) {
      this.referenceImageKeys =
        (this.station.settings && this.station.settings.referenceImages) || [];
      for (const key of this.referenceImageKeys) {
        const imageItem = {
          loading: true,
          key,
          image: null,
        };
        this.images.push(imageItem);
        api.station.getReferenceImage(this.station.id, key).then((image) => {
          imageItem.image = window.URL.createObjectURL(image.result as Blob);
          imageItem.loading = false;
        });
      }
    }
  },
  methods: {
    openImageInModal(image: string) {
      this.showModal = true;
      this.modalImage = image;
    },
    async deleteImage(fileKey: string) {
      this.images = this.images.filter(({ key }) => key !== fileKey);
      this.referenceImageKeys = this.referenceImageKeys.filter(
        (key) => key !== fileKey
      );
      await api.station.deleteReferenceImage(this.station.id, fileKey);
    },
    async uploadSelectedFiles() {
      // FIXME - Wait for each upload to conclude before allowing another.

      // First, resize images using canvas.
      // Then, append them to a FormData, then upload each form data as a separate API request.
      for (const file of this.selectedUploads as File[]) {
        const reader = new FileReader();
        const image = document.createElement("img");
        const readerEnd = new Promise<void>((resolve) => {
          reader.onloadend = (data) => {
            image.src = data.target.result as string;
            resolve();
          };
        });
        await reader.readAsDataURL(file);
        await readerEnd;
        await new Promise((resolve) => {
          image.onload = resolve;
        });
        const ratio = image.width / image.height;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (ratio > 1) {
          // landscape
          canvas.width = 1600;
          canvas.height = Math.floor(canvas.width / ratio);
        } else {
          // portrait
          canvas.height = 1600;
          canvas.width = Math.floor(canvas.height / ratio);
        }
        // This will scale up some smaller images, but we're expecting that most of these come from camera phones
        // and are reasonably high res.
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const blob: Blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 80)
        );
        const response = await api.station.uploadReferenceImage(
          this.station.id,
          blob
        );
        if (response.success) {
          this.referenceImageKeys.push(response.result.fileKey);
          this.images.push({
            key: response.result.fileKey,
            image: window.URL.createObjectURL(blob),
          });
        }
      }
    },
  },
  computed: {
    ...mapState({
      currentUser: (state) => (state as any).User.userData,
    }),
    userIsSuperUserAndViewingAsSuperUser() {
      return (
        this.currentUser.globalPermission === "write" &&
        (isViewingAsOtherUser() || shouldViewAsSuperUser())
      );
    },
    userIsMemberOfGroup(): boolean {
      return this.userIsSuperUserAndViewingAsSuperUser || !!this.group;
    },
    userIsGroupAdmin() {
      return (
        this.userIsSuperUserAndViewingAsSuperUser ||
        (this.group && this.group.admin)
      );
    },
  },
};
</script>

<style scoped lang="scss">
.image-thumb {
  cursor: pointer;
  &:hover {
    outline: 1px solid black;
  }
}
.spinner-container {
  width: 100px;
  min-height: 75px;
}
</style>
