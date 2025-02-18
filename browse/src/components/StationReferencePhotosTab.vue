<template>
  <div class="container" style="padding: 0">
    <h2>Station Reference Photos</h2>

    <!-- Fullscreen preview modal -->
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

    <!-- Station images list -->
    <div class="d-flex flex-row mt-1 mb-2 flex-wrap">
      <div
        v-for="img in stationImages"
        :key="img.key"
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
          v-if="img.loading"
        >
          <b-spinner small />
        </div>
        <img
          v-else
          class="image-thumb"
          :src="img.image"
          width="100%"
          height="auto"
          @click="openImageInModal(img.image)"
        />
        <b-btn
          class="btn-outline-dark btn-light btn-sm mt-1"
          v-if="userIsGroupAdmin && !img.loading"
          @click="deleteStationImage(img.key)"
        >
          Remove
        </b-btn>
      </div>
    </div>

    <!-- Station upload control (only if no images yet AND user is admin) -->
    <div v-if="stationImages.length === 0 && userIsGroupAdmin">
      <p class="h6">
        Add a reference photo for this station. A reference photo should be
        taken from the point of view of your camera, ideally in landscape.
      </p>
      <b-form-file
        v-model="selectedStationUpload"
        accept="image/*"
        placeholder="Choose an image file or drop it here..."
        drop-placeholder="Drop image file here..."
        @input="uploadSelectedStationImage"
      />
    </div>

    <!-- Device Photos container -->
    <h2 class="mt-4">Device Reference Photos</h2>
    <div class="d-flex flex-row flex-wrap">
      <div
        v-for="img in deviceImages"
        :key="img.key"
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
          v-if="img.loading"
        >
          <b-spinner small />
        </div>
        <img
          v-else
          class="image-thumb"
          :src="img.image"
          width="100%"
          height="auto"
          @click="openImageInModal(img.image)"
        />
        <small v-if="!img.loading">{{ deviceLabel(img) }}</small>
      </div>
    </div>

    <div v-if="deviceImages.length === 0">
      <p>No device reference images found for devices in this station.</p>
    </div>
  </div>
</template>

<script lang="ts">
import { mapState } from "vuex";
import { isViewingAsOtherUser } from "@/components/NavBar.vue";
import { shouldViewAsSuperUser } from "@/utils";
import api from "@/api";

interface DeviceImageItem {
  deviceId: number;
  refType: "pov" | "in-situ";
  key: string;
  loading: boolean;
  image: string | null;
  deviceName?: string;
}

interface StationImageItem {
  key: string; // the S3 fileKey
  loading: boolean;
  image: string | null; // URL blob
}

export default {
  name: "StationReferencePhotosTab",
  props: {
    station: {
      required: true,
    },
    group: {
      required: true,
    },
  },
  data() {
    return {
      stationImages: [] as StationImageItem[],
      deviceImages: [] as DeviceImageItem[],
      selectedStationUpload: null as File | null,
      modalImage: null as string | null,
      showModal: false,
    };
  },
  async mounted() {
    // Load existing station-level reference images
    const stationRefKeys =
      (this.station.settings && this.station.settings.referenceImages) || [];
    for (const fileKey of stationRefKeys) {
      const imageItem: StationImageItem = {
        key: fileKey,
        loading: true,
        image: null,
      };
      this.stationImages.push(imageItem);
      api.station.getReferenceImage(this.station.id, fileKey).then((res) => {
        if (res.success) {
          const blob = res.result as Blob;
          imageItem.image = window.URL.createObjectURL(blob);
        }
        imageItem.loading = false;
      });
    }

    // Fetch devices assigned to this station
    //    (adapt this call to however you find devices for a station)
    const devicesRes = await api.station.listDevices(this.station.id);
    if (!devicesRes.success) {
      return;
    }
    const devices = devicesRes.result.devices;

    for (const dev of devices) {
      const refTypes = ["pov", "in-situ"] as const;
      for (const refType of refTypes) {
        const devImg: DeviceImageItem = {
          deviceId: dev.id,
          refType,
          key: `${dev.id}-${refType}`,
          loading: true,
          image: null,
          deviceName: dev.deviceName,
        };
        this.deviceImages.push(devImg);

        try {
          const resp = await api.device.getReferenceImage(dev.id, {
            type: refType,
          });
          if (resp.success) {
            const blob = resp.result as Blob;
            devImg.image = URL.createObjectURL(blob);
          } else {
            // If no image for that type, remove it from the array
            this.deviceImages = this.deviceImages.filter((i) => i !== devImg);
          }
        } catch (err) {
          // If 404 or similar, remove the placeholder
          this.deviceImages = this.deviceImages.filter((i) => i !== devImg);
        }
        devImg.loading = false;
      }
    }
  },
  methods: {
    async deleteStationImage(fileKey: string) {
      this.stationImages = this.stationImages.filter(
        (img) => img.key !== fileKey
      );
      await api.station.deleteReferenceImage(this.station.id, fileKey);
    },

    async uploadSelectedStationImage() {
      if (!this.selectedStationUpload) {
        return;
      }
      const file = this.selectedStationUpload;

      const resizedBlob = await this.resizeImage(file);

      const resp = await api.station.uploadReferenceImage(
        this.station.id,
        resizedBlob
      );
      if (resp.success) {
        const { fileKey } = resp.result;
        this.stationImages.push({
          key: fileKey,
          loading: false,
          image: URL.createObjectURL(resizedBlob),
        });
      }

      this.selectedStationUpload = null;
    },

    resizeImage(file: File): Promise<Blob> {
      return new Promise<Blob>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const image = document.createElement("img");
          image.src = reader.result as string;
          image.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const maxSize = 1600; // e.g. maximum dimension
            const ratio = image.width / image.height;

            if (ratio > 1) {
              canvas.width = maxSize;
              canvas.height = Math.floor(canvas.width / ratio);
            } else {
              canvas.height = maxSize;
              canvas.width = Math.floor(canvas.height * ratio);
            }
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
          };
        };
        reader.readAsDataURL(file);
      });
    },

    deviceLabel(img: DeviceImageItem) {
      return `${img.deviceName || "Device #" + img.deviceId} - ${img.refType}`;
    },
    openImageInModal(image: string) {
      this.showModal = true;
      this.modalImage = image;
    },
  },
  computed: {
    ...mapState({
      currentUser: (state) => (state as any).User.userData,
    }),
    userIsGroupAdmin() {
      const su =
        this.currentUser.globalPermission === "write" &&
        (isViewingAsOtherUser() || shouldViewAsSuperUser());
      return su || (this.group && this.group.admin);
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
