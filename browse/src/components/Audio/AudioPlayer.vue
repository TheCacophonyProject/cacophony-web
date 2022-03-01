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
            role="button"
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
            @input="changeVolume"
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
          role="button"
          @click="setSelectedTrack(null)"
        />
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
import { produce } from "immer";
import WaveSurfer from "wavesurfer.js";
import SpectrogramPlugin from "wavesurfer.js/src/plugin/spectrogram/index.js";
import ColorMap from "colormap";

import {
  debounce,
  changedContext,
  createSVGElement,
  useState,
  SetState,
} from "@/utils";

import { AudioTrack, AudioTracks } from "../Video/AudioRecording.vue";

import { ApiTrackPosition } from "@typedefs/api/track";
import WebAudio from "wavesurfer.js/src/webaudio";

export default defineComponent({
  props: {
    tracks: {
      type: Map as PropType<AudioTracks>,
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
      type: Function as PropType<SetState<AudioTrack>>,
      required: true,
    },
  },
  setup(props) {
    // Player
    const spectrogram = ref<HTMLCanvasElement>(null);
    const overlay = ref<SVGElement>(null);
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
            "stroke-width": "3",
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
      setTempTrack((draft) => {
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
            "stroke-width": "3",
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
          rect.setAttribute("stroke-width", "4");
        }
      });
      rect.addEventListener("mouseout", () => {
        rect.setAttribute("stroke-width", "3");
      });
      rect.addEventListener("click", () => {
        props.setSelectedTrack(() => props.tracks.get(track.id));
      });
      return rect;
    };

    const addTracksToOverlay = () =>
      [...props.tracks.values()]
        .filter((track) => !track.deleted)
        .map(createRectFromTrack)
        .map((trackRect) => overlay.value.appendChild(trackRect));

    // Update the overlay track for the temp track
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
    // Watch for changes to the tracks and update the spectrogram
    watch(
      () => props.tracks,
      (newTracks, oldTracks) => {
        const newTrackIds = new Set(newTracks.keys());
        const oldTrackIds = new Set(oldTracks.keys());
        const { added, deleted } = changedContext(oldTrackIds, newTrackIds);
        const markedForDeletion = [...newTracks.values()]
          .filter((track) => track.deleted)
          .map((track) => track.id);

        [...added].forEach((trackId) => {
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
            }
          }
        });
      }
    );
    const [player, setPlayer] = useState<WaveSurfer>(null);
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

    // Watch for changes to the selected track and update the spectrogram
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
                  "stroke-width": "3",
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
        props.setSelectedTrack(() => track);
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
    const [volume, setVolume] = useState<Volume>({
      volume: 0.5,
      muted: false,
    });
    const [volumeSlider, setVolumeSlider] = useState<HTMLInputElement>(null);
    watch(volume, (v) => {
      if (v.muted) {
        player.value.setVolume(0);
        volumeSlider.value.value = "0";
      } else {
        player.value.setVolume(v.volume);
        volumeSlider.value.value = v.volume.toString();
      }
      storeVolume(volume.value);
    });

    const toggleMute = () => {
      setVolume((draft) => {
        draft.muted = !draft.muted;
      });
    };

    const storeVolume = debounce((volume: Volume) => {
      localStorage.setItem("volume", JSON.stringify(volume));
    });

    const changeVolume = (e: Event) => {
      const slider = e.target as HTMLInputElement;
      setVolume((volume) => {
        volume.volume = parseFloat(slider.value);
      });
    };

    onMounted(() => {
      const spectrogramSettings = {
        container: "#spectrogram",
        fftSamples: 512,
        colorMap: ColorMap({
          colormap: "jet",
          nshades: 256,
          format: "float",
        }),
      };
      setVolumeSlider(
        document.querySelector("#volume-slider") as HTMLInputElement
      );
      const storedVolume = localStorage.getItem("volume");
      if (storedVolume) {
        // check if storeVolume is an object
        try {
          const parsed = JSON.parse(storedVolume);
          if (parsed.volume) {
            setVolume(parsed);
          }
        } catch (e) {
          // do nothing
        }
      }

      setPlayer(
        WaveSurfer.create({
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
          plugins: [SpectrogramPlugin.create(spectrogramSettings)],
        })
      );
      player.value.on("finish", () => {
        setIsPlaying(false);
      });
      player.value.on("pause", () => {
        setIsPlaying(false);
      });
      player.value.on("play", () => {
        setIsPlaying(true);
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
      const attachSpectrogramOverlay = () => {
        const canvas = document.querySelector(
          "spectrogram canvas"
        ) as HTMLCanvasElement;
        canvas.style.zIndex = "0";
        spectrogram.value = canvas;
        const spectrogramWidth = spectrogram.value.width;
        const spectrogramHeight = spectrogram.value.height;
        const overlayAttr = {
          style: {
            position: "absolute",
            ["z-index"]: 10,
            top: 0,
            left: 0,
            ["margin-left"]: "1em", // bootstrap padding
            cursor: "crosshair",
            width: spectrogramWidth,
            height: spectrogramHeight,
          },
          attributes: {
            width: spectrogramWidth,
            height: spectrogramHeight,
            xmlns: "http://www.w3.org/2000/svg",
          },
        };
        const container = document.querySelector("#spectrogram") as HTMLElement;
        const newOverlay = createSVGElement(overlayAttr, "svg");
        if (overlay.value) {
          container.removeChild(overlay.value);
        }
        overlay.value = newOverlay;

        container.appendChild(overlay.value);

        const getDragCoords = (e: TouchEvent | MouseEvent) => {
          const rect = overlay.value.getBoundingClientRect();
          if (e instanceof TouchEvent && window.TouchEvent) {
            const x = (e.targetTouches[0].clientX - rect.left) / rect.width;
            const y = (e.targetTouches[0].clientY - rect.top) / rect.height;
            return {
              x,
              y,
            };
          } else if (e instanceof MouseEvent) {
            const x = e.offsetX / rect.width;
            const y = e.offsetY / rect.height;
            return {
              x,
              y,
            };
          }
        };

        const startEvent = (e: TouchEvent | MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          const { x, y } = getDragCoords(e);
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
          e.stopPropagation();
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
          const maxSample = (player.value.backend as WebAudio).ac.sampleRate;
          const maxFreq = Math.floor((maxSample / 2) * tempTrack.value.pos.y);
          const minFreq = Math.floor((maxSample / 2) * tempTrack.value.pos.x);

          const track: AudioTrack = {
            id: -1,
            start: tempTrack.value.pos.x * player.value.getDuration(),
            end:
              (tempTrack.value.pos.x + tempTrack.value.pos.width) *
              player.value.getDuration(),
            maxFreq,
            minFreq,
            colour: "#c8d6e5",
            automatic: false,
            filtered: false,
            positions: [tempTrack.value.pos],
            tags: [],
            displayTags: [],
            confirming: false,
            deleted: false,
          };
          props.setSelectedTrack(track);
          setTempTrack(
            produce(tempTrack.value, (draft) => {
              draft.active = false;
            })
          );
        });
        const endEvent = (e: TouchEvent | MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          if (
            tempTrack.value.active &&
            Date.now() - tempTrack.value.startDragTime > 100 &&
            tempTrack.value.pos.width > 0.01
          ) {
            confirmTrack();
          } else {
            setTempTrack(
              produce(tempTrack.value, (draft) => {
                draft.active = false;
              })
            );
          }
        };

        // Adding Track Functionality
        overlay.value.addEventListener("mousedown", startEvent);
        overlay.value.addEventListener("touchstart", startEvent);
        overlay.value.addEventListener("mousemove", moveEvent);
        overlay.value.addEventListener("touchmove", moveEvent);
        overlay.value.addEventListener("mouseup", endEvent);
        overlay.value.addEventListener("touchend", endEvent);
      };
      const initPlayer = () => {
        attachSpectrogramOverlay();
        // Move canvas image to SVG & clean up
        overlay.value.appendChild(tempTrack.value.rect);
        addTracksToOverlay();
        if (isPlaying.value) {
          playAt(0);
        }
        // Due to spectrogram plugin, we need to wait for the canvas to be rendered
        player.value.on("redraw", () => {
          player.value.spectrogram.init();
          attachSpectrogramOverlay();
          addTracksToOverlay();
        });
      };
      player.value.on("ready", initPlayer);
      player.value.load(props.url);
      watch(
        () => props.url,
        () => {
          player.value.empty();
          player.value.load(props.url);
        }
      );
    });
    onBeforeUnmount(() => {
      player.value.empty();
    });
    return {
      player,
      isPlaying,
      isFinished,
      volume,
      play,
      changeVolume,
      toggleMute,
      togglePlay,
      playAt,
      playTrack,
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
  min-height: 256px;
}
.player-bar {
  display: grid;
  grid-template-columns: 1fr 7fr 1fr;
  justify-content: start;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
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
@include media-breakpoint-up(sm) {
  .volume-selection {
    display: flex;
    justify-content: flex-start;
  }
  spectrogram > svg {
    border-radius: 0 0 0.25rem 0.25rem;
  }
  .player-bar {
    border-radius: 0 0 0.25rem 0.25rem;
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
