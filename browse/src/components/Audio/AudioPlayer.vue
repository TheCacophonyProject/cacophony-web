<template>
  <section class="p-0 w-100">
    <div id="spectrogram"></div>
    <div id="waveform"></div>
    <div class="player-bar">
      <div class="d-flex align-items-center">
        <font-awesome-icon
          class="play-button ml-2 mr-3"
          :icon="['fa', isFinished ? 'redo-alt' : isPlaying ? 'pause' : 'play']"
          @click="togglePlay"
          size="1x"
        />
        <div class="volume-selection">
          <font-awesome-icon
            class="volume-button"
            :icon="['fa', volume.muted ? 'volume-mute' : 'volume-up']"
            style="cursor: pointer"
            size="lg"
            @click="toggleMute"
          />
          <input
            id="volume-slider"
            class="volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            @input="setVolume"
          />
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
          style="cursor: pointer"
          @click="setSelectedTrack(null)"
        />
      </div>
    </div>
  </section>
</template>
<script lang="ts">
import { PropType } from "vue";
import { defineComponent, ref, watch, onMounted } from "@vue/composition-api";
import { produce } from "immer";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/src/plugin/spectrogram/index.js";
import ColorMap from "colormap";

import { AudioTrack } from "../Video/AudioRecording.vue";

import { TrackId } from "@typedefs/api/common";
import { ApiTrackPosition } from "@typedefs/api/track";

const createSVGElement = (
  element: {
    attributes?: Object;
    style?: Object;
  },
  elementType: string
): SVGElement => {
  const svgns = "http://www.w3.org/2000/svg";
  const svgElement = document.createElementNS(svgns, elementType);
  if (element.attributes) {
    Object.keys(element.attributes).forEach((key) => {
      svgElement.setAttribute(key, element.attributes[key]);
    });
  }
  if (element.style) {
    Object.keys(element.style).forEach((key) => {
      svgElement.style.setProperty(key, element.style[key]);
    });
  }
  return svgElement;
};

function changedContext<T>(
  old: Set<T>,
  curr: Set<T>
): { added: Set<T>; deleted: Set<T> } {
  return {
    added: new Set([...curr].filter((x) => !old.has(x))),
    deleted: new Set([...old].filter((x) => !curr.has(x))),
  };
}

const debounce = (func: (...args: any[]) => void, timeout = 100) => {
  let timer: number;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      func(...args);
    }, timeout);
  };
};

export default defineComponent({
  props: {
    tracks: {
      type: Map as PropType<Map<TrackId, AudioTrack>>,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    selectedTrack: {
      type: Object as PropType<AudioTrack | null>,
      default: null,
    },
    setSelectedTrack: {
      type: Function as PropType<(track: AudioTrack) => void>,
      required: true,
    },
  },
  setup(props) {
    // Player
    const spectrogram = ref<HTMLCanvasElement>(null);
    const overlay = ref<SVGElement>(null);
    const tempTrack = ref<{
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
            strokeWidth: "3",
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

    const moveTempTrack = (x: number, y: number) => {
      tempTrack.value = produce(tempTrack.value, (draft) => {
        const currX = Math.min(draft.pos.startX, x);
        const currY = Math.min(draft.pos.startY, y);
        const width = Math.abs(draft.pos.startX - x);
        const height = Math.abs(draft.pos.startY - y);

        draft.pos.x = currX;
        draft.pos.y = currY;
        draft.pos.width = width;
        draft.pos.height = height;
      });
    };

    const createRectFromTrack = (track: AudioTrack) => {
      const pos = track.positions[0];
      const rect = createSVGElement(
        {
          attributes: {
            id: `track_${track.id.toString()}`,
            x: (pos.x * spectrogram.value.width).toString(),
            y: (pos.y * spectrogram.value.height).toString(),
            width: (pos.width * spectrogram.value.width).toString(),
            height: (pos.height * spectrogram.value.height).toString(),
            stroke: track.colour,
            "stroke-width": "2",
            cursor: "pointer",
            fill: "none",
          },
        },
        "rect"
      );
      // add on hover to increase stroke width
      rect.addEventListener("mouseover", () => {
        if (
          props.selectedTrack === null ||
          props.selectedTrack.id !== track.id
        ) {
          rect.setAttribute("stroke-width", "4");
        }
      });
      rect.addEventListener("mouseout", () => {
        rect.setAttribute("stroke-width", "2");
      });
      rect.addEventListener("click", () => {
        props.setSelectedTrack(props.tracks.get(track.id));
      });
      return rect;
    };

    watch(tempTrack, () => {
      // change display of tempTrack rect
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
    // Watch for changes to the tracks and update the spectrogram
    watch(
      () => props.tracks,
      async (newTracks, oldTracks) => {
        const newTrackIds = new Set(newTracks.keys());
        const oldTrackIds = new Set(oldTracks.keys());
        const { added, deleted } = changedContext(oldTrackIds, newTrackIds);
        [...added].forEach((trackId) => {
          const track = newTracks.get(trackId);
          if (track) {
            const rect = createRectFromTrack(track);
            overlay.value.appendChild(rect);
          }
        });
        [...deleted].forEach((trackId) => {
          const track = oldTracks.get(trackId);
          if (track) {
            const rect = overlay.value.querySelector(
              `#track_${trackId.toString()}`
            );
            if (rect) {
              overlay.value.removeChild(rect);
            }
          }
        });
      }
    );
    const player = ref<WaveSurfer>(null);
    const isFinished = ref(false);

    const isPlaying = ref(false);
    watch([isPlaying, () => props.selectedTrack], () => {
      if (isPlaying.value) {
        isFinished.value = false;
        return;
      }
      const finishTime = props.selectedTrack
        ? props.selectedTrack.end
        : player.value.getDuration();
      isFinished.value = player.value.getCurrentTime() >= finishTime;
    });

    watch(
      () => props.selectedTrack,
      (curr, prev) => {
        const isPrevTemp = prev ? prev.id === -1 : false;
        if (isPrevTemp) {
          // Delete temp track
          const rect = overlay.value.querySelector(
            `#track_${prev.id.toString()}`
          );
          if (rect) {
            overlay.value.removeChild(rect);
          }
        }
        if (curr) {
          const isCurrTemp = curr.id === -1;
          if (isCurrTemp) {
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
                  strokeWidth: "3",
                  fill: "none",
                },
              },
              "rect"
            );
            overlay.value.appendChild(rect);
          }
          playTrack(curr);
        } else if (isPlaying.value && !isFinished.value) {
          play();
        }
      }
    );

    const replay = () => {
      if (props.selectedTrack) {
        playTrack(props.selectedTrack);
      } else {
        playAt(0);
      }
    };

    const playTrack = (track: AudioTrack) => {
      if (props.selectedTrack.id !== track.id) {
        props.setSelectedTrack(track);
      }
      playAt(track.start, track.end);
    };

    const togglePlay = () => {
      if (props.selectedTrack) {
        if (isPlaying.value === true) {
          player.value.pause();
        } else if (isFinished.value) {
          replay();
        } else {
          player.value.play(
            player.value.getCurrentTime(),
            props.selectedTrack.end
          );
        }
      } else {
        player.value.playPause();
      }
    };

    const play = () => {
      player.value.play();
    };

    const playAt = (
      start: number,
      end: number = player.value.getDuration()
    ) => {
      player.value.play(start, end);
    };
    type Volume = { volume: number; muted: boolean };
    const volume = ref<Volume>({
      volume: 0.5,
      muted: false,
    });
    const volumeSilder = ref<HTMLInputElement>(null);
    watch(volume, (v) => {
      if (v.muted) {
        player.value.setVolume(0);
        volumeSilder.value.value = "0";
      } else {
        player.value.setVolume(v.volume);
        volumeSilder.value.value = v.volume.toString();
      }
      storeVolume(volume.value);
    });

    const toggleMute = () => {
      volume.value = produce(volume.value, (draft) => {
        draft.muted = !draft.muted;
      });
    };

    const storeVolume = debounce((volume: Volume) => {
      localStorage.setItem("volume", JSON.stringify(volume));
    });

    const setVolume = (e: Event) => {
      const slider = e.target as HTMLInputElement;
      volume.value = produce(volume.value, (draft) => {
        draft.volume = parseFloat(slider.value);
      });
    };

    onMounted(() => {
      volumeSilder.value = document.querySelector(
        "#volume-slider"
      ) as HTMLInputElement;
      const storedVolume = localStorage.getItem("volume");
      if (storedVolume) {
        // check if storeVolume is an object
        try {
          const parsed = JSON.parse(storedVolume);
          debugger;
          if (parsed.volume) {
            volume.value = produce(volume.value, (draft) => {
              return parsed;
            });
          }
        } catch (e) {
          // do nothing
        }
      }

      player.value = WaveSurfer.create({
        container: "#waveform",
        barWidth: 3,
        barHeight: 1,
        barGap: 1,
        height: 50,
        backgroundColor: "#2B333F",
        progressColor: "#FFF",
        cursorColor: "#dc3545",
        waveColor: "#FFF",
        pixelRatio: 1,
        hideScrollbar: true,
        responsive: true,
        normalize: true,
        cursorWidth: 1,
        plugins: [
          SpectrogramPlugin.create({
            container: "#spectrogram",
            fftSamples: 512,
            colorMap: ColorMap({
              colormap: "magma",
              nshades: 256,
              format: "float",
            }),
          }),
        ],
      });
      player.value.on("finish", () => {
        isPlaying.value = false;
      });
      player.value.on("pause", () => {
        isPlaying.value = false;
      });
      player.value.on("play", () => {
        isPlaying.value = true;
      });
      player.value.on("seek", (time) => {
        if (props.selectedTrack) {
          const { x, width } = props.selectedTrack.positions[0];
          if (time > x + width || time < x) {
            props.setSelectedTrack(null);
          } else {
            playAt(time * player.value.getDuration(), props.selectedTrack.end);
            return;
          }
        }
        playAt(time * player.value.getDuration());
      });
      player.value.load(props.url);
      player.value.on("ready", () => {
        spectrogram.value = document.querySelector(
          "spectrogram canvas"
        ) as HTMLCanvasElement;
        console.log(player.value.spectrogram.fftSamples);
        spectrogram.value.style.zIndex = "0";
        const spectrogramWidth = spectrogram.value.width;
        const spectrogramHeight = spectrogram.value.height;
        const overlayAttr = {
          style: {
            position: "absolute",
            ["z-index"]: 1,
            top: 0,
            left: 0,
            cursor: "crosshair",
            width: "100%",
            height: "100%",
          },
          attributes: {
            width: spectrogramWidth,
            height: spectrogramHeight,
            xmlns: "http://www.w3.org/2000/svg",
          },
        };
        overlay.value = createSVGElement(overlayAttr, "svg");
        spectrogram.value.parentElement.appendChild(overlay.value);

        // Move canvas image to SVG & clean up
        const img = new Image();
        img.src = spectrogram.value.toDataURL("image/png");
        const svgImg = createSVGElement(
          {
            attributes: {
              width: spectrogramWidth,
              height: spectrogramHeight,
              xmlns: "http://www.w3.org/2000/svg",
            },
          },
          "image"
        );
        svgImg.setAttributeNS("http://www.w3.org/1999/xlink", "href", img.src);
        overlay.value.appendChild(svgImg);
        overlay.value.appendChild(tempTrack.value.rect);
        spectrogram.value.parentElement.removeChild(spectrogram.value);
        // Add tracks to overlay
        [...props.tracks.values()]
          .map(createRectFromTrack)
          .map((trackRect) => overlay.value.appendChild(trackRect));
        const getDragCoords = (e: TouchEvent | MouseEvent) => {
          const rect = overlay.value.getBoundingClientRect();
          if (e instanceof TouchEvent) {
            const x = (e.targetTouches[0].clientX - rect.left) / rect.width;
            const y = (e.targetTouches[0].clientY - rect.top) / rect.height;
            return {
              x,
              y,
            };
          } else {
            const x = e.offsetX / rect.width;
            const y = e.offsetY / rect.height;
            return {
              x,
              y,
            };
          }
        };

        const startEvent = (e: TouchEvent | MouseEvent) => {
          e.preventDefault();
          // don't start dragging if it's a click less that 100ms ago
          const { x, y } = getDragCoords(e);
          tempTrack.value = produce(tempTrack.value, (draft) => {
            draft.pos = {
              startX: x,
              startY: y,
              x: x,
              y: y,
              height: 0,
              width: 0,
            };
            draft.rect.setAttribute("x", x.toString());
            draft.rect.setAttribute("y", y.toString());
            draft.rect.setAttribute("width", "0");
            draft.rect.setAttribute("height", "0");
            draft.active = true;
            draft.startDragTime = Date.now();
          });
        };

        const moveEvent = (e: TouchEvent | MouseEvent) => {
          e.preventDefault();
          if (
            tempTrack.value.active &&
            Date.now() > tempTrack.value.startDragTime + 100
          ) {
            const { x, y } = getDragCoords(e);
            moveTempTrack(x, y);
          }
        };

        const confirmTrack = debounce(() => {
          const track: AudioTrack = {
            id: -1,
            start: tempTrack.value.pos.x * player.value.getDuration(),
            end:
              (tempTrack.value.pos.x + tempTrack.value.pos.width) *
              player.value.getDuration(),
            colour: "#c8d6e5",
            automatic: false,
            positions: [tempTrack.value.pos],
            tags: [],
            displayTags: [],
            confirming: false,
            deleted: false,
          };
          props.setSelectedTrack(track);
          tempTrack.value = produce(tempTrack.value, (draft) => {
            draft.active = false;
          });
        });
        const endEvent = (e: TouchEvent | MouseEvent) => {
          e.preventDefault();
          if (
            tempTrack.value.active &&
            Date.now() - tempTrack.value.startDragTime > 100 &&
            tempTrack.value.pos.width > 0.01
          ) {
            const { x, y } = getDragCoords(e);
            moveTempTrack(x, y);
            confirmTrack();
          } else {
            tempTrack.value = produce(tempTrack.value, (draft) => {
              draft.active = false;
            });
          }
        };

        // Adding Track Functionality
        overlay.value.addEventListener("mousedown", startEvent);
        overlay.value.addEventListener("touchstart", startEvent);
        overlay.value.addEventListener("mousemove", moveEvent);
        overlay.value.addEventListener("touchmove", moveEvent);
        overlay.value.addEventListener("mouseup", endEvent);
        overlay.value.addEventListener("touchend", endEvent);
      });
    });
    return {
      player,
      isPlaying,
      isFinished,
      volume,
      play,
      setVolume,
      toggleMute,
      togglePlay,
      playAt,
      playTrack,
    };
  },
});
</script>
<style lang="scss" scoped>
spectrogram {
  width: 100%;
  border-radius: 0.25rem 0.25rem 0 0;
}
.player-bar {
  display: grid;
  grid-template-columns: 1fr 7fr 1fr;
  justify-content: start;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  border-radius: 0 0 0.25rem 0.25rem;
  background-color: #2b333f;
  color: #fff;
  width: 100%;
  min-height: 67px;
}
.spec-labels {
  background-color: #152338;
}
.play-button {
  margin: 0 0.35em 0 0.35em;
  cursor: pointer;
}
.volume-slider {
  position: relative;
  opacity: 0;
  z-index: 2;
  transition: opacity 0.2s;
}
.volume-button {
  width: 24px;
  margin-right: 0.2em;
}
.volume-selection {
  display: none;
}
@media (min-width: 768px) {
  .volume-selection {
    display: flex;
    justify-content: flex-start;
  }
}
.volume-selection:hover {
  .volume-slider {
    visibility: visible;
    opacity: 1;
  }
}

.selected-track-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  justify-self: center;
}
.capitalize {
  text-transform: capitalize;
}
</style>
