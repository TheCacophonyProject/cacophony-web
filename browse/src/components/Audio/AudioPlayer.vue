<template>
  <section class="p-0 w-100" @click="interactWithSpectrogram">
    <div v-if="isLoading" class="loading-spinner text-center text-primary">
      <b-spinner label="Loading Spectrogram..."></b-spinner>
    </div>
    <div id="track-changes-container">
      <button id="save-track-changes" @click="() => saveTrackChanges()">
        <font-awesome-icon icon="check" />
      </button>
      <button id="cancel-track-changes" @click="() => cancelTrackChanges()">
        <font-awesome-icon icon="times" />
      </button>
    </div>
    <div id="spectrogram"></div>
    <div id="waveform"></div>
    <div id="player-bar" class="flex flex-col">
      <div
        @mousedown="onClickSeek"
        @touch="onClickSeek"
        role="slider"
        id="progress-bar"
        class="player-bar-loader"
      >
        <div id="loader-progress" class="player-bar-loader-progress">
          <div
            id="zoom-indicator-start"
            class="player-bar-indicator zoom-indicator"
          ></div>
          <div
            id="player-bar-loader-indicator"
            class="player-bar-indicator"
            @mousedown="onDragStartTime"
            @touchstart="onDragStartTime"
          ></div>
          <div
            id="zoom-indicator-end"
            class="player-bar-indicator zoom-indicator"
          ></div>
        </div>
      </div>
      <div class="player-bar">
        <div class="d-flex align-items-center">
          <font-awesome-icon
            class="play-button ml-2 mr-3"
            :icon="[
              'fa',
              isFinished ? 'redo-alt' : isPlaying ? 'pause' : 'play',
            ]"
            @click="togglePlay"
            size="1x"
          />
          <div class="volume-selection">
            <font-awesome-icon
              class="volume-button"
              :icon="['fa', volume.muted ? 'volume-mute' : 'volume-up']"
              role="button"
              size="lg"
              @click="toggleMute"
            />
            <input
              :disabled="volume.muted"
              id="volume-slider"
              class="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              @input="changeVolume"
            />
          </div>
          <div class="player-bar-time ml-2 player-time d-flex flex-row">
            {{ time.curr }} / {{ time.total }}
          </div>
        </div>
        <div class="selected-track-container" v-if="selectedTrack">
          <b-container class="d-flex selected-class">
            <b-row class="justify-content-between">
              <span
                class="track-colour"
                :style="{ background: `${selectedTrack.colour}` }"
              ></span>
              <b-col>
                <b-row class="align-items-center">
                  <div>
                    <h4 class="track-time">
                      Time: {{ selectedTrack.start.toFixed(1) }} -
                      {{ selectedTrack.end.toFixed(1) }} (Δ{{
                        (selectedTrack.end - selectedTrack.start).toFixed(1)
                      }}s)
                    </h4>
                    <b-row class="m-0 w-100 justify-content-between capitalize">
                      <h4>
                        {{
                          selectedTrack.displayTags.length === 0
                            ? "Select Tag..."
                            : selectedTrack.displayTags.length === 1
                            ? selectedTrack.displayTags[0].what
                            : "Multiple tags..."
                        }}
                      </h4>
                    </b-row>
                  </div>
                </b-row>
              </b-col>
            </b-row>
          </b-container>
          <font-awesome-icon
            class="ml-2"
            :icon="['fa', 'times']"
            size="1x"
            role="button"
            @click="setSelectedTrack(null)"
          />
        </div>

        <div class="player-bar-settings">
          <font-awesome-icon
            :icon="['fa', zoomed.enabled ? 'search-minus' : 'search-plus']"
            :class="{ highlighted: zoomed.enabled }"
            role="button"
            size="lg"
            @click="
              setZoomed((zoom) => {
                zoom.enabled = !zoom.enabled;
              })
            "
          />
          <svg
            class="player-bar-samplerate-button"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            role="button"
            @click="
              () => {
                toggleSampleRate = !toggleSampleRate;
              }
            "
          >
            <path
              stroke="white"
              :class="{ highlighted: toggleSampleRate }"
              stroke-width="1.4"
              d="M18.6 10c-1.5 0-1.4 2.9-2 4.2-.2.2-.5.1-.5 0-.8-2.5-.5-8.2-2.6-8.2S12 13.4 11 16.5c0 .2-.3.2-.4 0-1-2.2-.8-6.9-2.5-6.9-1.8 0-1.6 4-2.3 5.6-.1.2-.4.2-.5 0-.5-1-.7-3.2-2.6-3.2H.5a.5.5 0 0 0 0 1h2.2c1.6 0 1 3.5 2.9 3.5 1.6 0 1.5-3.8 2.2-5.5 0-.2.4-.2.5 0 .8 2 .7 7 2.6 7 2 0 1.3-7.9 2.4-10.6.1-.2.4-.2.5 0 1 2.2.5 8 2.4 8 1.6 0 1.7-2.6 2.2-4 0-.2.4-.2.5 0 .5 1 .8 2.6 2.4 2.6h2.2a.5.5 0 0 0 0-1h-2.2c-1.4 0-1.2-3-2.7-3z"
            />
          </svg>
          <div v-if="toggleSampleRate" class="player-bar-samplerate">
            <b>Sample Rate:</b> {{ newSampleRate }} Hz
            <div>
              <input
                type="range"
                min="8000"
                max="48000"
                step="100"
                v-model="newSampleRate"
              />
              <font-awesome-icon
                @click="
                  () => {
                    setSampleRate(Number(newSampleRate));
                  }
                "
                role="button"
                :icon="['fa', 'check']"
                size="lg"
              />
              <font-awesome-icon
                @click="
                  () => {
                    newSampleRate = sampleRate;
                    toggleSampleRate = false;
                  }
                "
                role="button"
                :icon="['fa', 'times']"
                size="lg"
              />
            </div>
            <div class="mt-2">
              <b>Toggle Labels:</b>
              <input type="checkbox" v-model="showLabels" />
            </div>
          </div>
          <b-dropdown class="player-bar-color-dropdown" variant="link" right
            ><template v-slot:button-content>
              <font-awesome-icon :icon="['fa', 'palette']" />
            </template>
            <b-dropdown-item
              v-for="(val, index) in colours"
              :key="index"
              z-index="1001"
              :class="{
                'dropdown-item': true,
                ['dropdown-highlighted']:
                  colour.toLowerCase() === val.toLowerCase(),
              }"
              @click="setColour(val)"
            >
              {{ val }}
            </b-dropdown-item>
          </b-dropdown>
        </div>
      </div>
    </div>
  </section>
</template>
<script lang="ts">
import { PropType } from "vue";
import {
  defineComponent,
  watch,
  onMounted,
  onBeforeUnmount,
  ref,
} from "@vue/composition-api";
import WaveSurfer, { WaveSurferOptions } from "wavesurfer.js";
import SpectrogramPlugin, {
  SpectrogramPluginOptions,
} from "wavesurfer.js/dist/plugins/spectrogram";
import ColorMap from "colormap";

import {
  debounce,
  changedContext,
  createSVGElement,
  useState,
  SetState,
} from "@/utils";

import { AudioTrack, AudioTracks } from "../Video/AudioRecording.vue";

import { ApiTrackDataRequest, ApiTrackPosition } from "@typedefs/api/track";
import { TrackId } from "@typedefs/api/common";
interface Rectangle {
  x: number;
  y: number;
  height: number;
  width: number;
}

export default defineComponent({
  props: {
    tracks: {
      type: Map as PropType<AudioTracks>,
      required: true,
    },
    buffer: {
      type: Blob as PropType<Blob>,
      default: null,
    },
    url: {
      type: String,
      required: true,
    },
    sampleRate: {
      type: Number,
      default: null,
    },
    setSampleRate: {
      type: Function as PropType<SetState<number>>,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    selectedTrack: {
      type: Object as PropType<AudioTrack | null>,
      default: null,
    },
    setSelectedTrack: {
      type: Function as PropType<SetState<AudioTrack>>,
      required: true,
    },
    colour: {
      type: String,
      required: true,
    },
    setColour: {
      type: Function as PropType<SetState<string>>,
      required: true,
    },
    updateTrack: {
      type: Function as PropType<
        (
          trackId: TrackId,
          trackData: ApiTrackDataRequest
        ) => Promise<{ success: boolean }>
      >,
      required: true,
    },
  },
  setup(props) {
    // Player

    const spectrogram = ref<HTMLCanvasElement>(null);
    const isLoading = ref(true);
    const player = ref<WaveSurfer>(null);

    const newSampleRate = ref(props.sampleRate);
    const toggleSampleRate = ref(false);

    const colours = [
      "jet",
      "hsv",
      "hot",
      "magma",
      "earth",
      "plasma",
      "cool",
      "bone",
      "YIGnBu",
      "YIOrRd",
      "inferno",
      "cdom",
    ];
    const defaultSampleRate = 48000;

    const [isFinished, setIsFinished] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    watch([isPlaying, () => props.selectedTrack], () => {
      if (isPlaying.value) {
        setIsFinished(false);
        return;
      }
      const finishTime = props.selectedTrack
        ? props.selectedTrack.end
        : player.value.getDuration();
      setIsFinished(player.value.getCurrentTime() >= finishTime);
    });
    // Overlay
    const overlay = ref<SVGElement>(null);
    const [zoomed, setZoomed] = useState<{
      enabled: boolean;
      scale: number;
    }>({
      enabled: false,
      scale: 3,
    });
    const getOriginPx = () => {
      const loader = document.getElementById(
        "loader-progress"
      ) as HTMLDivElement;
      return parseFloat(loader.offsetWidth.toFixed(1));
    };

    const showLabels = ref(false);

    const interacted = ref(false);
    const interactWithSpectrogram = () => {
      if (interacted.value) {
        return;
      }
      // iOS Safari doesn't support autoplay, so we need to start the audio manually
      player.value.play();
      player.value;
      interacted.value = true;
    };
    const applyScale = (
      element: SVGElement | HTMLCanvasElement,
      origin: number,
      x: number,
      y: number
    ) => {
      element.style.transform = `scaleX(${x}) scaleY(${y})`;
      element.style.transformOrigin = `${origin}px bottom`;
    };

    const updateZoom = () => {
      if (!overlay.value) {
        return;
      }

      const zoomIndicatorStart = document.getElementById(
        "zoom-indicator-start"
      ) as HTMLDivElement;
      const zoomIndicatorEnd = document.getElementById(
        "zoom-indicator-end"
      ) as HTMLDivElement;

      const playerBar = document.getElementById("player-bar") as HTMLDivElement;
      const progress = document.getElementById(
        "loader-progress"
      ) as HTMLDivElement;

      // Apply zoom to overlay and spectrogram
      const origin = getOriginPx();
      const scale = zoomed.value.enabled ? zoomed.value.scale : 1;
      const xScale = parseFloat(scale.toFixed(1));
      const yScale = props.sampleRate / newSampleRate.value;
      applyScale(overlay.value, origin, xScale, yScale);
      applyScale(spectrogram.value, origin, xScale, yScale);
      // Apply zoom to zoom indicators
      const translateY = "translateY(-3px)";
      const totalShown = playerBar.offsetWidth / scale;
      const half = totalShown / 2;
      const startPos = progress.offsetWidth - half;
      const endPos = progress.offsetWidth + half;
      const endOffset = Math.abs(Math.min(playerBar.offsetWidth - endPos, 0));
      const startOffset = Math.abs(Math.min(startPos, 0));
      const start = -half - startOffset;
      const end = half + endOffset;
      zoomIndicatorStart.style.transform = `translateX(${start.toFixed(
        1
      )}px) ${translateY}`;
      zoomIndicatorEnd.style.transform = `translateX(${end.toFixed(
        1
      )}px) ${translateY}`;
    };
    watch(newSampleRate, () => {
      requestAnimationFrame(updateZoom);
    });

    watch(zoomed, (zoom) => {
      const zoomIndicatorStart = document.getElementById(
        "zoom-indicator-start"
      ) as HTMLDivElement;
      const zoomIndicatorEnd = document.getElementById(
        "zoom-indicator-end"
      ) as HTMLDivElement;
      if (zoom.enabled) {
        // make indicators visible
        zoomIndicatorStart.style.display = "block";
        zoomIndicatorEnd.style.display = "block";
        requestAnimationFrame(updateZoom);
      } else {
        requestAnimationFrame(() => {
          overlay.value.style.transform = ``;
          spectrogram.value.style.transform = ``;
          zoomIndicatorStart.style.transform = ``;
          zoomIndicatorEnd.style.transform = ``;
          zoomIndicatorStart.style.display = "none";
          zoomIndicatorEnd.style.display = "none";
        });
      }
    });
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const strokeWidth = isMobile ? "2" : "4";
    const [tempTrack, setTempTrack] = useState<{
      pos: ApiTrackPosition & { startX: number; startY: number };
      rect: SVGElement;
      active: boolean;
      startDragTime: number;
    }>({
      rect: createSVGElement(
        {
          attributes: {
            id: "new_track",
            x: "0",
            y: "0",
            width: "0",
            height: "0",
            stroke: "#c8d6e5",
            "stroke-width": strokeWidth,
            opacity: "60%",
            fill: "none",
            cursor: "pointer",
          },
        },
        "rect"
      ),
      pos: {
        startX: 0,
        startY: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      active: false, // Refers to the pointer being down
      startDragTime: 0,
    });
    const getRect = (svg: SVGElement): Rectangle => {
      const x = parseFloat(svg.getAttribute("x") || "0");
      const y = parseFloat(svg.getAttribute("y") || "0");
      const height = parseFloat(svg.getAttribute("height") || "0");
      const width = parseFloat(svg.getAttribute("width") || "0");
      return { x, y, height, width };
    };

    const moveTempTrack = (x: number, y: number) => {
      setTempTrack((draft) => {
        const currX = Math.min(draft.pos.startX, x);
        const currY = Math.min(draft.pos.startY, y);
        const width = Math.abs(draft.pos.startX - x);
        const height = Math.abs(draft.pos.startY - y);

        draft.pos.x = Math.max(currX, 0);
        draft.pos.y = Math.max(currY, 0);
        draft.pos.width = width;
        draft.pos.height = height;
      });
    };
    // Update the overlay track when temp track changes
    watch(tempTrack, () => {
      const { x, y, height, width } = tempTrack.value.pos;
      tempTrack.value.rect.setAttribute(
        "visibility",
        tempTrack.value.active ? "visible" : "hidden"
      );
      tempTrack.value.rect.setAttribute(
        "x",
        (x * spectrogram.value.width).toString()
      );
      tempTrack.value.rect.setAttribute(
        "y",
        (y * spectrogram.value.height).toString()
      );
      tempTrack.value.rect.setAttribute(
        "width",
        (width * spectrogram.value.width).toString()
      );
      tempTrack.value.rect.setAttribute(
        "height",
        (height * spectrogram.value.height).toString()
      );
    });

    const createRectFromTrack = (track: AudioTrack) => {
      const id = `track_${track.id.toString()}`;
      const isTemp = track.id === -1;
      const pos = isTemp
        ? track.positions[1]
        : track.positions[track.positions.length - 1]; // Temp track uses second position
      let { x, y, height, width } = pos
        ? convertRectangleToSVG(pos)
        : {
            x: track.start / props.duration,
            y: 0,
            width: (track.end - track.start) / props.duration,
            height: 1,
          };
      // check if x and width are valid
      const { start, end } = track;
      const duration = player.value.getDuration();
      const posTime = duration * width;
      if (posTime.toFixed(1) !== (end - start).toFixed(1)) {
        x = start / duration;
        width = (end - start) / duration;
      }
      let rect: HTMLElement | SVGElement | null = document.getElementById(id);
      if (!rect) {
        rect = createSVGElement(
          {
            attributes: {
              id,
              x: (x * spectrogram.value.width).toString(),
              y: (y * spectrogram.value.height).toString(),
              width: (width * spectrogram.value.width).toString(),
              height: (height * spectrogram.value.height).toString(),
              stroke: track.colour,
              "stroke-width": strokeWidth,
              opacity: "60%",
              cursor: "pointer",
              fill: "none",
            },
          },
          "rect"
        );

        rect.addEventListener("mouseover", () => {
          if (
            props.selectedTrack === null ||
            props.selectedTrack.id !== track.id
          ) {
            rect.setAttribute("stroke-width", "5");
          }
        });
        rect.addEventListener("mouseout", () => {
          rect.setAttribute("stroke-width", strokeWidth);
        });
        rect.addEventListener("click", () => {
          props.setSelectedTrack(props.tracks.get(track.id));
        });
      } else {
        rect.setAttribute("x", (x * spectrogram.value.width).toString());
        rect.setAttribute("y", (y * spectrogram.value.height).toString());
        rect.setAttribute(
          "width",
          (width * spectrogram.value.width).toString()
        );
        rect.setAttribute(
          "height",
          (height * spectrogram.value.height).toString()
        );
      }
      return rect;
    };
    const controlsModified = ref(false);
    const hideControls = () => {
      controlsModified.value = false;
      const prevTopLeft = document.getElementById("top-left-control");
      const prevBottomRight = document.getElementById("bottom-right-control");
      if (prevTopLeft) {
        overlay.value.removeChild(prevTopLeft);
      }
      if (prevBottomRight) {
        overlay.value.removeChild(prevBottomRight);
      }
      document.getElementById("track-changes-container").style.visibility =
        "hidden";
    };

    const attachControls = (trackId: TrackId) => {
      const element = document.getElementById(`track_${trackId}`);
      // Remove previous controls
      hideControls();
      // Extract rectangle attributes
      let rectX = parseFloat(element.getAttribute("x") || "0");
      let rectY = parseFloat(element.getAttribute("y") || "0");
      let rectWidth = parseFloat(element.getAttribute("width") || "0");
      let rectHeight = parseFloat(element.getAttribute("height") || "0");
      const colour = element.getAttribute("stroke") || "";

      // Create top-left circle
      const topLeftCircle = createControl(
        Math.max(rectX, 0),
        Math.max(rectY, 0),
        colour,
        "top-left-control"
      );
      overlay.value.appendChild(topLeftCircle);

      // Create bottom-right circle
      const bottomRightCircle = createControl(
        Math.max(rectX + rectWidth, 0),
        Math.max(rectY + rectHeight, 0),
        colour,
        "bottom-right-control"
      );
      overlay.value.appendChild(bottomRightCircle);

      // Function to create control
      function createControl(
        cx: number,
        cy: number,
        colour: string,
        id: string
      ) {
        const circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );
        circle.id = id;
        circle.setAttribute("cx", cx.toString());
        circle.setAttribute("cy", cy.toString());
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", colour);
        circle.setAttribute("cursor", "move");
        // add stroke to make it more visible
        circle.setAttribute("stroke", "white");
        circle.setAttribute("stroke-width", "2");

        return circle;
      }

      // Event handlers
      topLeftCircle.addEventListener("mousedown", (event) =>
        onPressDown(event, "topLeft")
      );
      topLeftCircle.addEventListener("touchstart", (event) =>
        onPressDown(event, "topLeft")
      );

      bottomRightCircle.addEventListener("mousedown", (event) =>
        onPressDown(event, "bottomRight")
      );
      bottomRightCircle.addEventListener("touchstart", (event) =>
        onPressDown(event, "bottomRight")
      );
      function getCoords(event: MouseEvent | TouchEvent): {
        x: number;
        y: number;
      } {
        if (event instanceof TouchEvent) {
          return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        } else {
          return { x: event.clientX, y: event.clientY };
        }
      }

      function onPressDown(
        event: MouseEvent | TouchEvent,
        corner: "topLeft" | "bottomRight"
      ) {
        const { x: startX, y: startY } = getCoords(event);

        // Update the initial rectangle attributes at the start of each drag
        rectX = parseFloat(element.getAttribute("x") || "0");
        rectY = parseFloat(element.getAttribute("y") || "0");
        rectWidth = parseFloat(element.getAttribute("width") || "0");
        rectHeight = parseFloat(element.getAttribute("height") || "0");

        function toggleButtonContainerVisibility() {
          // Get the button container
          const buttonContainer = document.getElementById(
            "track-changes-container"
          ) as HTMLElement;

          if (buttonContainer && controlsModified.value) {
            // Show or hide the container based on the controlsModified state
            buttonContainer.style.visibility = "visible";
          }
        }
        const onPressMove = (event: MouseEvent | TouchEvent) => {
          if (event instanceof TouchEvent) {
            event.preventDefault(); // Prevent scrolling during touch move
          }

          const { x, y } = getCoords(event);
          const minSize = 8;

          let dx = x - startX;
          const dy = y - startY;

          if (zoomed.value.enabled) {
            dx = applyZoomAndOffset(dx, zoomed.value.scale);
          }

          if (corner === "topLeft") {
            updateTopLeftControl(dx, dy, minSize);
          } else {
            updateBottomRightControl(dx, dy, minSize);
          }

          controlsModified.value = true;
          toggleButtonContainerVisibility();
          updateButtonPosition();
        };

        function applyZoomAndOffset(dx: number, currentScale: number): number {
          return dx / currentScale;
        }

        function updateTopLeftControl(dx: number, dy: number, minSize: number) {
          const newX = constrainValue(
            rectX + dx,
            0,
            rectX + rectWidth - minSize
          );
          const newY = constrainValue(
            rectY + dy,
            0,
            rectY + rectHeight - minSize
          );

          element.setAttribute("x", newX.toString());
          element.setAttribute("y", newY.toString());
          element.setAttribute(
            "width",
            (rectWidth - (newX - rectX)).toString()
          );
          element.setAttribute(
            "height",
            (rectHeight - (newY - rectY)).toString()
          );

          topLeftCircle.setAttribute("cx", newX.toString());
          topLeftCircle.setAttribute("cy", newY.toString());
        }

        function updateBottomRightControl(
          dx: number,
          dy: number,
          minSize: number
        ) {
          const newWidth = constrainValue(
            rectWidth + dx,
            minSize,
            overlay.value.clientWidth - rectX
          );
          const newHeight = constrainValue(
            rectHeight + dy,
            minSize,
            overlay.value.clientHeight - rectY
          );

          element.setAttribute("width", newWidth.toString());
          element.setAttribute("height", newHeight.toString());

          bottomRightCircle.setAttribute("cx", (rectX + newWidth).toString());
          bottomRightCircle.setAttribute("cy", (rectY + newHeight).toString());
        }

        function constrainValue(
          value: number,
          min: number,
          max: number
        ): number {
          return Math.min(Math.max(value, min), max);
        }

        function updateButtonPosition() {
          const rectX = parseFloat(element.getAttribute("x") || "0");
          const rectY = parseFloat(element.getAttribute("y") || "0");
          const rectWidth = parseFloat(element.getAttribute("width") || "0");
          const buttonContainer = document.getElementById(
            "track-changes-container"
          ) as HTMLElement;

          if (buttonContainer) {
            const leftPosition = rectX + rectWidth / 2 - 20;
            const topPosition = rectY - 43;
            buttonContainer.style.left = `${leftPosition}px`;
            buttonContainer.style.top = `${topPosition}px`;
          }
        }

        toggleButtonContainerVisibility();
        const onPressUp = () => {
          window.removeEventListener("mousemove", onPressMove);
          window.removeEventListener("mouseup", onPressUp);
          window.removeEventListener("touchmove", onPressMove);
          window.removeEventListener("touchend", onPressUp);
        };

        window.addEventListener("mousemove", onPressMove);
        window.addEventListener("mouseup", onPressUp);
        window.addEventListener("touchmove", onPressMove, { passive: false });
        window.addEventListener("touchend", onPressUp, { passive: false });
      }
    };
    const normalizeRect = (rect: Rectangle): Rectangle => {
      return {
        x: rect.x / spectrogram.value.width,
        y: rect.y / spectrogram.value.height,
        width: rect.width / spectrogram.value.width,
        height: rect.height / spectrogram.value.height,
      };
    };
    function convertRectangleToSVG(rect: Rectangle): Rectangle {
      const { x, y, height, width } = rect;

      // Calculate the sample rate ratio
      const sampleRateRatio = props.sampleRate / defaultSampleRate;

      // Scale y and height to match the spectrogram's frequency range
      const scaledY = y / sampleRateRatio;
      const scaledHeight = height / sampleRateRatio;

      // Invert y-axis for SVG coordinate system
      const newY = 1 - (scaledY + scaledHeight);

      return { x, y: newY, height: scaledHeight, width };
    }

    function convertSVGToRectangle(rect: Rectangle): Rectangle {
      const { x, y, height, width } = rect;

      // Invert y-axis back to original coordinate system
      const invertedY = 1 - (y + height);

      // Calculate the sample rate ratio
      const sampleRateRatio = props.sampleRate / defaultSampleRate;

      // Scale y and height back to original
      const originalY = invertedY * sampleRateRatio;
      const originalHeight = height * sampleRateRatio;

      return { x, y: originalY, height: originalHeight, width };
    }

    const calculateRectPosition = (track: AudioTrack): Rectangle => {
      const pos = track.positions[track.positions.length - 1];
      const svgRect = convertRectangleToSVG(pos);
      return svgRect;
    };
    const adjustTrackPositions = () => {
      props.tracks.forEach((track) => {
        if (!track.deleted) {
          const rect = document.getElementById(`track_${track.id.toString()}`);
          if (rect) {
            const { x, y, width, height } = calculateRectPosition(track);
            rect.setAttribute("x", (x * spectrogram.value.width).toString());
            rect.setAttribute("y", (y * spectrogram.value.height).toString());
            rect.setAttribute(
              "width",
              (width * spectrogram.value.width).toString()
            );
            rect.setAttribute(
              "height",
              (height * spectrogram.value.height).toString()
            );
          }
        }
      });
    };
    const saveTrackChanges = () => {
      const track = props.selectedTrack;
      if (!track) {
        return;
      }
      const rect = document.querySelector(
        `#track_${track.id.toString()}`
      ) as SVGRectElement;
      const rectPos = normalizeRect(getRect(rect));
      const { x, y, height, width } = convertSVGToRectangle(rectPos);
      const sampleRate = defaultSampleRate / 2;
      const minFreq = y * sampleRate;
      const maxFreq = (y + height) * sampleRate;
      const start_s = x * player.value.getDuration();
      const end_s = (x + width) * player.value.getDuration();

      const position: ApiTrackPosition = {
        x,
        y,
        width,
        height,
        order: track.positions.length,
      };
      props.updateTrack(track.id, {
        start_s,
        end_s,
        minFreq,
        maxFreq,
        positions: [...track.positions, position],
      });
      document.getElementById("track-changes-container").style.visibility =
        "hidden";
    };

    const cancelTrackChanges = (track = props.selectedTrack) => {
      if (!track) {
        return;
      }
      createRectFromTrack(track);
      attachControls(track.id);
    };

    // Watch for changes to the selected track and update the spectrogram
    watch(
      () => props.selectedTrack,
      (curr, prev: AudioTrack | null) => {
        const isPrevTrackTemp = prev?.id === -1;
        if (isPrevTrackTemp) {
          // remove the temp track as it has no been confirmed
          const rect = document.getElementById(`track_${prev.id.toString()}`);
          if (rect) {
            overlay.value.removeChild(rect);
          }
        } else if (prev && curr?.id !== prev.id && controlsModified.value) {
          cancelTrackChanges(prev);
        }
        if (curr) {
          const isCurrTemp = curr.id === -1;
          if (isCurrTemp) {
            // add temp track to overlay
            const { x, y, height, width } = props.selectedTrack.positions[0];

            const rect = createSVGElement(
              {
                attributes: {
                  id: "track_-1",
                  x: (x * spectrogram.value.width).toString(),
                  y: (y * spectrogram.value.height).toString(),
                  width: (width * spectrogram.value.width).toString(),
                  height: (height * spectrogram.value.height).toString(),
                  stroke: "#c8d6e5",
                  opacity: "60%",
                  "stroke-width": strokeWidth,
                  fill: "none",
                },
              },
              "rect"
            );
            overlay.value.appendChild(rect);
            hideControls();
          } else if (curr.id !== prev?.id) {
            attachControls(curr.id);
          }
          // Add controls to the selected track on bottom right and top left of the rectangle

          if (
            !isPrevTrackTemp &&
            (curr.id !== prev?.id || curr.playEventId !== prev.playEventId)
          ) {
            playTrack(curr);
          }
        } else if (isPlaying.value && !isFinished.value) {
          hideControls();
          play();
        }
      }
    );

    // Player Controls
    const replay = () => {
      if (props.selectedTrack) {
        playTrack(props.selectedTrack);
      } else {
        playAt(0);
      }
    };

    const playTrack = (track: AudioTrack) => {
      playRegion(track.start, track.end);
    };

    const togglePlay = () => {
      if (props.selectedTrack) {
        if (isPlaying.value === true) {
          player.value.pause();
        } else if (isFinished.value) {
          replay();
        } else {
          playRegion(player.value.getCurrentTime(), props.selectedTrack.end);
        }
      } else {
        player.value.playPause();
      }
    };

    const play = () => {
      player.value.play();
    };

    const playAt = debounce(
      (start: number, end: number = player.value.getDuration()) => {
        playRegion(start, end);
      },
      50
    );

    const [time, setTime] = useState({ curr: "0:00", total: "0:00" });
    const actualTime = ref<number>(0);
    const secondsToTimeString = (seconds: number) => {
      const minutes = Math.floor(seconds / 60);
      const secondsLeft = Math.floor(seconds % 60);
      console.log("seconds", seconds, minutes, secondsLeft);
      return `${minutes}:${secondsLeft < 10 ? "0" : ""}${secondsLeft}`;
    };
    const setPlayerTime = (currTime: number) => {
      const curr = secondsToTimeString(currTime);
      const total = secondsToTimeString(player.value.getDuration());
      if (
        currTime.toFixed(1) === actualTime.value.toFixed(1) &&
        curr !== total
      ) {
        //  Added to smooth out the time display
        return;
      }
      actualTime.value = currTime;
      const percent = (currTime / player.value.getDuration()) * 100;
      // round to nearest 25%, 0.25, 0.5, 0.75, 1, 1.25
      const roundedPercent = Math.round(percent / 0.001) * 0.001;
      console.log("percent", roundedPercent, percent, curr);
      setTime({ curr, total });
      const progressBar = document.getElementById(
        "loader-progress"
      ) as HTMLProgressElement;
      progressBar.style.width = `${roundedPercent}%`;
    };

    const getDragCoords = (
      e: TouchEvent | MouseEvent,
      context = overlay.value as Element
    ) => {
      const rect = context.getBoundingClientRect();
      let x = 0;
      let y = 0;
      if (window.TouchEvent && "targetTouches" in e) {
        x = (e.targetTouches[0].clientX - rect.left) / rect.width;
        y = (e.targetTouches[0].clientY - rect.top) / rect.height;
      } else if ("clientX" in e) {
        x = (e.clientX - rect.left) / rect.width;
        y = (e.clientY - rect.top) / rect.height;
      }
      x = Math.min(Math.max(x, 0), 1);
      y = Math.min(Math.max(y, 0), 1);
      return {
        x,
        y,
      };
    };

    const calcDragTime = (e: MouseEvent | TouchEvent) => {
      const playerBar = document.getElementById("player-bar") as HTMLDivElement;
      const { width, x } = playerBar.getBoundingClientRect();
      const posX = "clientX" in e ? e.clientX : e.touches[0].clientX;
      const relativeX = (posX - x) / width;
      const percent = Math.max(Math.floor(relativeX * 10000) / 10000, 0);
      const duration = player.value.getDuration();
      const time = Math.min(Math.max(duration * percent, 0), duration);
      return { time, percent };
    };

    const [dragTime, setDragTime] = useState(false);
    const onDragStartTime = () => {
      setDragTime(true);
    };

    const onDragTime = (e: MouseEvent | TouchEvent) => {
      if (dragTime.value) {
        e.preventDefault();
        const { time, percent } = calcDragTime(e);
        if (
          props.selectedTrack &&
          time < props.selectedTrack.end &&
          time > props.selectedTrack.start
        ) {
          playRegion(time, props.selectedTrack.end);
        } else {
          player.value.seekTo(percent);
        }
        if (time > 0) {
          requestAnimationFrame(() => {
            setPlayerTime(time);
            if (zoomed.value.enabled) {
              updateZoom();
            }
          });
        }
      }
    };

    const onDragEndTime = () => {
      setDragTime(false);
    };
    const currHandler = ref<(curr: number) => void>(null);
    function playRegion(start: number, end: number) {
      function handler(current: number) {
        if (current > end) {
          player.value.pause();
          player.value.un("timeupdate", handler);
        }
      }
      const existingHandler = currHandler.value;
      if (existingHandler) {
        player.value.un("timeupdate", existingHandler);
      }
      player.value.setTime(start);
      player.value.on("timeupdate", handler);
      currHandler.value = handler;
      player.value.play();
    }

    const onClickSeek = (e: MouseEvent) => {
      if (dragZoom.value.started) {
        return;
      }
      const { time, percent } = calcDragTime(e);
      setPlayerTime(time);
      if (
        props.selectedTrack &&
        time < props.selectedTrack.end &&
        time > props.selectedTrack.start
      ) {
        playRegion(time, props.selectedTrack.end);
      } else {
        player.value.seekTo(percent);
      }
      if (zoomed.value.enabled) {
        updateZoom();
      }
    };

    const [dragZoom, setDragZoom] = useState<{
      started: boolean;
      from: "start" | "end";
      initial: number;
    }>({ started: false, from: "start", initial: 0 });
    const onDragStartZoom = (from: "start" | "end", initial: number) => {
      setDragZoom({ started: true, from, initial });
      // disable user select
      document.body.style.userSelect = "none";
    };
    const onDragZoom = (e: MouseEvent | TouchEvent) => {
      if (dragZoom.value.started) {
        const { percent } = calcDragTime(e);
        const percComplete =
          player.value.getCurrentTime() / player.value.getDuration();
        const difference = Math.min(Math.abs(percent - percComplete), 1);
        const scale = 1 / difference;
        setZoomed((zoom) => {
          zoom.scale = Math.max(scale / 2, 1);
        });
      }
    };
    const onDragEndZoom = () => {
      if (dragZoom.value.started) {
        setDragZoom((zoom) => {
          zoom.started = false;
        });
        document.body.style.userSelect = "auto";
      }
    };

    const [volume, setVolume] = useState({
      volume: 0.5,
      muted: false,
    });
    const [volumeSlider, setVolumeSlider] = useState<HTMLInputElement>(null);

    const toggleMute = () => {
      setVolume((draft) => {
        draft.muted = !draft.muted;
      });
    };

    const storeVolume = debounce((volume) => {
      localStorage.setItem("volume", JSON.stringify(volume));
    });

    const changeVolume = (e: Event) => {
      const slider = e.target as HTMLInputElement;
      setVolume((volume) => {
        volume.volume = parseFloat(slider.value);
      });
    };

    const SpectrogramSettings: SpectrogramPluginOptions = {
      labels: true,
      height: 512,
      container: "#spectrogram",
      colorMap: ColorMap({
        colormap: props.colour,
        nshades: 512,
        format: "float",
      }),
      fftSamples: isMobile ? 512 : 1024,
    };

    const windowSize = ref({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    const handleResize = debounce(() => {
      windowSize.value = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      updateSpectrogramSize();
    }, 100);

    const updateSpectrogramSize = () => {
      if (
        spectrogram.value &&
        spectrogram.value.width &&
        spectrogram.value.height
      ) {
        const spectrogramWidth = spectrogram.value.width;
        const spectrogramHeight = spectrogram.value.height;

        if (overlay.value) {
          overlay.value.setAttribute(
            "viewBox",
            `0 0 ${spectrogramWidth} ${spectrogramHeight}`
          );
        }

        adjustTrackPositions();
      } else {
        // Retry after a short delay if dimensions are not yet available
        setTimeout(updateSpectrogramSize, 50);
      }
    };

    onMounted(async () => {
      const audio = new Audio();
      const audioContext = new AudioContext({
        sampleRate: defaultSampleRate,
      });
      const gainNode = audioContext.createGain();
      const filterNode = audioContext.createBiquadFilter();
      filterNode.type = "allpass";
      const mediaNode = audioContext.createMediaElementSource(audio);
      audio.addEventListener("canplay", () => {
        mediaNode
          .connect(filterNode)
          .connect(gainNode)
          .connect(audioContext.destination);
      });
      const waveSurferOptions = {
        audioContext,
        container: "#waveform",
        height: 0,
        backgroundColor: "#2B333F",
        progressColor: "#FFF",
        cursorColor: "#dc3545",
        waveColor: "#FFF",
        pixelRatio: 1,
        hideScrollbar: true,
        responsive: true,
        normalize: true,
        cursorWidth: 1,
        sampleRate: props.sampleRate,
        media: audio,
        backend: "WebAudio",
        plugins: [SpectrogramPlugin.create(SpectrogramSettings)],
      };
      // set showLabels
      showLabels.value = localStorage.getItem("showAudioLabels") === "true";

      const addTracksToOverlay = (tracks: AudioTrack[]) =>
        tracks
          .filter((track) => !track.deleted)
          .map(createRectFromTrack)
          .forEach((trackRect) => {
            overlay.value.appendChild(trackRect);
          });

      // Modify the overlay tracks when props tracks change
      watch(
        () => props.tracks,
        (newTracks, oldTracks) => {
          const newTrackIds = new Set(newTracks.keys());
          const oldTrackIds = new Set(oldTracks.keys());
          const { added, deleted } = changedContext(oldTrackIds, newTrackIds);
          const markedForDeletion = [...newTracks.values()]
            .filter((track) => track.deleted)
            .map((track) => track.id);
          const markedToRestore = [...newTracks.values()]
            .filter((track) => {
              const oldTrack = oldTracks.get(track.id);
              if (oldTrack) {
                return oldTrack.deleted && !track.deleted;
              }
              return false;
            })
            .map((track) => track.id);

          [...added, ...markedToRestore].forEach((trackId) => {
            const track = newTracks.get(trackId);
            if (track) {
              const rect = createRectFromTrack(track);
              overlay.value.appendChild(rect);
            }
          });
          [...deleted, ...markedForDeletion].forEach((trackId) => {
            const track = oldTracks.get(trackId);
            if (track) {
              const rect = overlay.value.querySelector(
                `#track_${trackId.toString()}`
              );
              if (rect) {
                overlay.value.removeChild(rect);
                hideControls();
              }
            }
          });
        }
      );

      watch(
        () => props.selectedTrack,
        (track) => {
          if (track?.maxFreq && track?.minFreq) {
            filterNode.type = "bandpass";
            let { maxFreq, minFreq } = track;
            maxFreq = Math.min(maxFreq, props.sampleRate / 2);
            minFreq = Math.max(minFreq, 0);
            const fcenter = Math.sqrt(maxFreq * minFreq);
            const deltaf = maxFreq - minFreq;
            filterNode.frequency.value = fcenter;
            filterNode.Q.value = fcenter / deltaf;
          } else {
            filterNode.type = "allpass";
          }
        }
      );

      watch(volume, (v) => {
        if (!volumeSlider.value) {
          return;
        }
        if (v.muted) {
          gainNode.gain.value = 0;
          volumeSlider.value.value = "0";
          player.value.setVolume(0);
        } else {
          const volume = v.volume * 150;
          if (volume < 1) {
            player.value.setVolume(volume);
            gainNode.gain.value = 1;
          } else {
            player.value.setVolume(1);
            gainNode.gain.value = volume;
          }
          volumeSlider.value.value = v.volume.toString();
        }
        storeVolume(volume.value);
      });
      setVolumeSlider(
        document.querySelector("#volume-slider") as HTMLInputElement
      );
      const storedVolume = localStorage.getItem("volume");
      if (storedVolume) {
        try {
          const parsed = JSON.parse(storedVolume);
          if (parsed.volume) {
            setVolume(parsed);
          }
        } catch (e) {
          // do nothing
        }
      } else {
        setVolume({ volume: 0.5, muted: false });
      }

      player.value = WaveSurfer.create(waveSurferOptions);
      player.value.on("finish", () => {
        setIsPlaying(false);
      });
      player.value.on("pause", () => {
        setIsPlaying(false);
      });
      player.value.on("play", () => {
        setIsPlaying(true);
      });
      player.value.on("seeking", (time) => {
        if (props.selectedTrack) {
          const { start, end } = props.selectedTrack;
          const decimal = 10;
          const Time = Math.round(time * decimal) / decimal;
          const Start = Math.round(start * decimal) / decimal;
          const End = Math.round(end * decimal) / decimal;
          if (Time < Start || Time > End) {
            props.setSelectedTrack(null);
          }
        }
      });
      window.addEventListener("resize", handleResize);
      const attachSpectrogramOverlay = () => {
        const canvas = document.querySelector(
          "#spectrogram canvas:nth-child(2)"
        ) as HTMLCanvasElement;
        canvas.style.zIndex = "0";
        // add scale x on mousewheel;
        spectrogram.value = canvas;
        const spectrogramWidth = spectrogram.value.width;
        const spectrogramHeight = spectrogram.value.height;
        const container = document.querySelector(
          "#spectrogram div"
        ) as HTMLElement;

        // check if newOverlay is already there
        const oldOverlay = container.querySelector("svg");
        if (oldOverlay) {
          container.removeChild(oldOverlay);
        }

        const overlayAttr = {
          style: {
            cursor: "crosshair",
            width: "100%",
            height: "100%",
            "transform-origin": "0 center bottom",
            position: "relative",
          },
          attributes: {
            viewBox: `0 0 ${spectrogramWidth} ${spectrogramHeight}`,
            xmlns: "http://www.w3.org/2000/svg",
          },
        };
        const newOverlay = createSVGElement(overlayAttr, "svg");

        if (overlay.value && container.contains(overlay.value)) {
          container.removeChild(overlay.value);
        }
        overlay.value = newOverlay;
        newOverlay.addEventListener("touch", interactWithSpectrogram);

        container.appendChild(overlay.value);
        const startEvent = (e: TouchEvent | MouseEvent) => {
          // iOS safari doesn't support audio playback without user interaction
          const target = e.target as Element;
          const isiOS =
            !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
          if (
            (!interacted.value && isiOS) ||
            target.id === "top-left-control" ||
            target.id === "bottom-right-control"
          ) {
            return;
          }
          const { x, y } = getDragCoords(e);
          //check track.value.rect is in overlay
          const rect = overlay.value.querySelector(
            `#new_track`
          ) as SVGRectElement;
          if (!rect) {
            overlay.value.appendChild(tempTrack.value.rect);
          }
          setTempTrack((track) => {
            track.pos = {
              startX: x,
              startY: y,
              x: x,
              y: y,
              height: 0,
              width: 0,
            };
            track.rect.setAttribute("x", x.toString());
            track.rect.setAttribute("y", y.toString());
            track.rect.setAttribute("width", "0");
            track.rect.setAttribute("height", "0");
            track.active = true;
            track.startDragTime = Date.now();
          });
        };

        const moveEvent = (e: TouchEvent | MouseEvent) => {
          if (!tempTrack.value.active) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          if (Date.now() > tempTrack.value.startDragTime + 100) {
            const { x, y } = getDragCoords(e);
            moveTempTrack(x, y);
          }
        };
        const endEvent = () => {
          if (!tempTrack.value.active) {
            return;
          }
          if (
            Date.now() - tempTrack.value.startDragTime > 100 &&
            tempTrack.value.pos.width > 0.01
          ) {
            confirmTrack();
          } else {
            setTempTrack((tempTrack) => {
              tempTrack.active = false;
            });
          }
        };

        const confirmTrack = debounce(() => {
          const { x, y, width, height } = convertSVGToRectangle(
            tempTrack.value.pos
          );
          const sampleRate = defaultSampleRate / 2;
          const start = x * player.value.getDuration();
          const end = (x + width) * player.value.getDuration();
          const minFreq = y * sampleRate;
          const maxFreq = (y + height) * sampleRate;
          const track: AudioTrack = {
            id: -1,
            start,
            end,
            maxFreq,
            minFreq,
            colour: "#c8d6e5",
            automatic: false,
            filtered: false,
            positions: [tempTrack.value.pos, { x, y, width, height, order: 0 }],
            tags: [],
            displayTags: [],
            confirming: false,
            deleted: false,
          };
          props.setSelectedTrack(track);
          setTempTrack((tempTrack) => {
            tempTrack.active = false;
          });
        });

        // Add Track Functionality
        overlay.value.addEventListener("mousedown", startEvent);
        overlay.value.addEventListener("touchstart", startEvent);
        overlay.value.addEventListener("touch", interactWithSpectrogram);
        overlay.value.addEventListener("click", interactWithSpectrogram);
        window.addEventListener("click", () => {
          audioContext.resume();
        });
        window.addEventListener("touch", () => {
          audioContext.resume();
        });
        document.addEventListener("mousemove", moveEvent);
        document.addEventListener("touchmove", moveEvent, {
          passive: false,
        });
        document.addEventListener("mouseup", endEvent);
        document.addEventListener("touchend", endEvent);

        // Add Player Bar Functionality
        document.addEventListener("mousemove", onDragTime);
        document.addEventListener("touchmove", onDragTime);
        document.addEventListener("mouseup", onDragEndTime);
        document.addEventListener("touchend", onDragEndTime);

        const zoomIndicatorStart = document.getElementById(
          "zoom-indicator-start"
        ) as HTMLDivElement;
        const zoomIndicatorEnd = document.getElementById(
          "zoom-indicator-end"
        ) as HTMLDivElement;
        zoomIndicatorStart.addEventListener("mousedown", (event) => {
          onDragStartZoom("start", event.clientX);
        });
        zoomIndicatorStart.addEventListener("touchstart", (event) => {
          const initial = event.touches[0].clientX;
          onDragStartZoom("start", initial);
        });
        zoomIndicatorEnd.addEventListener("mousedown", (event) => {
          onDragStartZoom("end", event.clientX);
        });
        zoomIndicatorEnd.addEventListener("touchstart", (event) => {
          onDragStartZoom("end", event.touches[0].clientX);
        });
        document.addEventListener("mousemove", onDragZoom);
        document.addEventListener("touchmove", onDragZoom);
        document.addEventListener("mouseup", onDragEndZoom);
        document.addEventListener("touchend", onDragEndZoom);
      };

      const initPlayer = () => {
        isLoading.value = false;
        attachSpectrogramOverlay();
        // Move canvas image to SVG & clean up
        if (isPlaying.value) {
          playAt(0);
        }
        setPlayerTime(player.value.getDuration());
        setPlayerTime(0);
        // Due to spectrogram plugin, we need to wait for the canvas to be rendered
        overlay.value.appendChild(tempTrack.value.rect);
        player.value.on("redraw", () => {
          //  attachSpectrogramOverlay();
          if (props.selectedTrack) {
            if (props.selectedTrack.id === -1) {
              // remove previous
              const previousRect = overlay.value.querySelector(
                "#new_track"
              ) as SVGRectElement;
              if (previousRect) {
                overlay.value.removeChild(previousRect);
              }
              const rect = createRectFromTrack(props.selectedTrack);
              overlay.value.appendChild(rect);
            }
          }
        });
      };

      // Get indicator by id player-bar-loader-indicator
      player.value.on("timeupdate", () => {
        // don't up time if we are scrubbing
        if (zoomed.value.enabled) {
          requestAnimationFrame(updateZoom);
        }
        if (!dragTime.value) {
          requestAnimationFrame(() =>
            setPlayerTime(player.value.getCurrentTime())
          );
        }
      });
      player.value.on("ready", () => {
        initPlayer();
        requestAnimationFrame(() => {
          addTracksToOverlay([...props.tracks.values()]);
          updateSpectrogramSize();
        });
      });
      player.value.on("loading", () => {
        isLoading.value = true;
      });
      if ((window as any).WaveSurferOfflineAudioContext) {
        (window as any).WaveSurferOfflineAudioContext = null;
      }
      player.value.load(props.url);
      watch(
        showLabels,
        (val) => {
          const labels = document.querySelector(
            "#spectrogram canvas:nth-child(1)"
          ) as HTMLCanvasElement;
          labels.style.visibility = val ? "visible" : "hidden";
          // save to local storage
          localStorage.setItem("showAudioLabels", JSON.stringify(val));
          labels.style.pointerEvents = "none";
        },
        { immediate: true }
      );
    });
    onBeforeUnmount(() => {
      player.value.destroy();
      player.value.empty();
      window.removeEventListener("resize", handleResize);
    });
    return {
      player,
      spectrogram,
      isLoading,
      isPlaying,
      isFinished,
      showLabels,
      volume,
      time,
      zoomed,
      newSampleRate,
      changeVolume,
      toggleSampleRate,
      colours,
      setZoomed,
      play,
      onDragTime,
      onDragStartTime,
      onDragEndTime,
      onClickSeek,
      toggleMute,
      togglePlay,
      playAt,
      playTrack,
      interactWithSpectrogram,
      saveTrackChanges,
      cancelTrackChanges,
    };
  },
});
</script>
<style lang="scss" scoped>
@import "~bootstrap/scss/functions";
@import "~bootstrap/scss/variables";
@import "~bootstrap/scss/mixins";

spectrogram {
  width: 100%;
  border-radius: 0.25rem 0.25rem 0 0;
  transition: all 0.2s ease-in;
}
#spectrogram {
  background-color: #2b333f;
  min-height: 512px;
  overflow: hidden;
  border-radius: 8px 8px 0px 0px;
  @media (max-width: 768px) {
    min-height: 256px;
  }
}
.player-bar {
  display: grid;
  grid-template-columns: 1fr 7fr 141px;
  justify-content: start;
  justify-content: space-between;
  justify-items: center;
  align-items: center;
  padding: 0.5rem;
  background-color: #2b333f;
  color: #fff;
  width: 100%;
  min-height: 67px;
  // create two rows on mobile
  @media (max-width: 576px) {
    grid-template-rows: 1fr 1fr;
  }
}
.spec-labels {
  background-color: #152338;
}
.play-button {
  margin: 0 0.35em 0 0.35em;
  cursor: pointer;
}
@keyframes fade_in_show {
  0% {
    opacity: 0;
    transform: translate(10%, -35%) rotate(270deg) scaleX(0);
  }

  100% {
    opacity: 1;
    transform: translate(10%, -35%) rotate(270deg) scaleX(1);
  }
}
.volume-slider {
  display: none;
  position: absolute;
  transform-origin: left;
  transform: translate(10%, -35%) rotate(270deg);
  z-index: 300;
  :hover {
    display: block;
  }
}
.volume-selection:hover {
  .volume-slider {
    display: block;
    animation: fade_in_show 0.2s;
    transition-delay: 2s;
  }
}

.volume-button {
  width: 24px;
  margin-right: 0.2em;
}
.volume-selection {
  display: none;
}
.player-bar-time {
  visibility: hidden;
  position: absolute;
  transform: translateY(-60px);
}
spectrogram > svg {
  border-radius: 0 0 0.25rem 0.25rem;
}
.player-bar {
  border-radius: 0 0 0.25rem 0.25rem;
}
@include media-breakpoint-up(sm) {
  .volume-selection {
    display: flex;
    justify-content: flex-start;
  }
  .player-bar-time {
    position: static;
    visibility: visible;
    transform: translateY(0);
  }
}

.player-time {
  white-space: nowrap;
}

.selected-track-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  justify-self: center;

  @media (max-width: 576px) {
    grid-row-start: 2;
    grid-column: 1 / -1;
  }
}
.capitalize {
  text-transform: capitalize;
}
.loading-spinner {
  position: absolute;
  z-index: 11;
  top: 35%;
  left: calc(50% - 15px);
}
#player-bar {
  &:hover {
    .player-bar-indicator {
      visibility: visible;
    }
    .player-bar-time {
      visibility: visible;
    }
  }
}
.player-bar-loader {
  height: 10px;
  background-color: #515152;
}

.player-bar-loader-progress {
  display: flex;
  flex-direction: row-reverse;
  height: 100%;
  width: 0px;
  background: linear-gradient(#c1f951, #9acd32);
  transition: width 0.1s ease-in-out;
}
.player-bar-indicator {
  cursor: grab;
  visibility: hidden;
  transform: translate(8px, -4px);
  z-index: 200;
  position: absolute;
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 100%;
  background: white;
}
.player-bar-settings {
  // put items in a row
  display: flex;
  width: 100%;
  flex-direction: row;
  gap: 1em;
  align-items: center;
  fill: white;
  user-select: none;
  grid-column-start: 3;
}
.highlighted {
  color: #c1f951 !important;
  stroke: #c1f951 !important;
}

.dropdown-highlighted {
  background: #dbff91 !important;
}
.zoom-indicator {
  display: none;
  width: 8px;
  border-radius: 3px;
}
.player-bar-samplerate-button {
  width: 32px;
}
.player-bar-samplerate {
  position: absolute;
  transform: translate(-80px, -85px);
  background-color: rgba(59, 69, 84, 0.8);
  padding: 0.7em;
  border-radius: 0.5em;
  div {
    display: flex;
    align-items: center;
    gap: 0.6em;
  }
}
.player-bar-color-dropdown {
  z-index: 1001;
}

.player-bar-color-dropdown * {
  color: #fff !important;
  max-width: 8em;
}
#save-track-changes {
  background: none;
  height: 40px;
  width: 40px;
  color: #28a745;
  font-weight: 800;
  border: none;
  font: inherit;
  cursor: pointer;
  outline: inherit;
  &:hover {
    color: #34ce57;
  }
}
#cancel-track-changes {
  background: none;
  height: 40px;
  width: 40px;
  color: #52525b;
  font-weight: 800;
  border: none;
  font: inherit;
  cursor: pointer;
  outline: inherit;
  border-left: 1px solid #f5f5f4;
  &:hover {
    color: #78716c;
  }
}
#track-changes-container {
  visibility: hidden;
  opacity: 70%;
  position: absolute;
  display: flex;
  background: #fafaf9;
  border-radius: 0.2em;
  z-index: 20;
  &:hover {
    opacity: 100;
  }
}
</style>
