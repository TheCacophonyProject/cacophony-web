<template>
  <section class="p-0 w-100" @click="interactWithSpectrogram">
    <div v-if="isLoading" class="loading-spinner text-center text-primary">
      <b-spinner label="Loading Spectrogram..."></b-spinner>
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
                max="44100"
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
const getSampleRate = (
  arrayBuffer: ArrayBuffer
): { sampleRate: number; bitsPerSample: number } => {
  const view = new DataView(arrayBuffer);
  const chunkCellSize = 4;

  const getChunkName = (newOffset: number) =>
    String.fromCharCode.apply(
      null,
      new Int8Array(arrayBuffer.slice(newOffset, newOffset + chunkCellSize))
    );

  const isWave = getChunkName(0).includes("RIFF");
  if (!isWave) {
    return { sampleRate: 0, bitsPerSample: 0 };
  }

  let offset = 12;
  let chunkName = getChunkName(offset);
  let chunkSize = 0;

  while (!chunkName.includes("fmt")) {
    chunkSize = view.getUint32(offset + chunkCellSize, true);
    offset += 2 * chunkCellSize + chunkSize; // name cell + data_size cell + data size
    chunkName = getChunkName(offset);

    if (offset > view.byteLength) {
      throw new Error("Couldn't find sampleRate.");
    }
  }

  const sampleRateOffset = 12;
  const bitsPerSampleOffset = 22;

  const sampleRate = view.getUint32(offset + sampleRateOffset, true);
  const bitsPerSample = view.getUint16(offset + bitsPerSampleOffset, true);

  return { sampleRate, bitsPerSample };
};

export default defineComponent({
  props: {
    tracks: {
      type: Map as PropType<AudioTracks>,
      required: true,
    },
    buffer: {
      type: ArrayBuffer as PropType<ArrayBuffer>,
      default: null,
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
  },
  setup(props) {
    // Player

    const spectrogram = ref<HTMLCanvasElement>(null);
    const isLoading = ref(true);
    const player = ref<WaveSurfer>(null);

    const newSampleRate = ref(props.sampleRate);
    const toggleSampleRate = ref(false);
    const defaultSampleRate = ref(props.sampleRate);

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

    const interacted = ref(false);
    const interactWithSpectrogram = () => {
      if (interacted.value) {
        return;
      }
      // iOS Safari doesn't support autoplay, so we need to start the audio manually
      player.value.playPause();
      player.value.playPause();
      interacted.value = true;
    };

    const updateZoom = () => {
      if (!overlay.value) {
        return;
      }
      const loader = document.getElementById(
        "loader-progress"
      ) as HTMLDivElement;
      const x = loader.offsetWidth;

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
      const totalShown = playerBar.offsetWidth / zoomed.value.scale;
      const half = totalShown / 2;
      const startPos = progress.offsetWidth - half;
      const endPos = progress.offsetWidth + half;
      const overEnd = Math.abs(Math.min(playerBar.offsetWidth - endPos, 0));
      const overStart = Math.abs(Math.min(startPos, 0));

      overlay.value.style.transformOrigin = `${x.toFixed(1)}px bottom`;
      overlay.value.style.transform = `scaleX(${
        zoomed.value.enabled ? zoomed.value.scale.toFixed(1) : 1
      }) scaleY(${props.sampleRate / newSampleRate.value})`;
      const translateY = "translateY(-3px)";
      zoomIndicatorStart.style.transform = `translateX(${(
        -half -
        overEnd +
        overStart
      ).toFixed(1)}px) ${translateY}`;
      zoomIndicatorEnd.style.transform = `translateX(${(
        half +
        overStart -
        overEnd +
        8
      ).toFixed(1)}px) ${translateY}`;
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
        overlay.value.style.transform = ``;
        zoomIndicatorStart.style.transform = ``;
        zoomIndicatorEnd.style.transform = ``;
        zoomIndicatorStart.style.display = "none";
        zoomIndicatorEnd.style.display = "none";
      }
    });
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
            "stroke-width": "2",
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
    // Watch for changes to the selected track and update the spectrogram
    watch(
      () => props.selectedTrack,
      (curr, prev) => {
        const isPrevTemp = prev ? prev.id === -1 : false;
        if (isPrevTemp) {
          // remove the temp track as it has no been confirmed
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
                  "stroke-width": "2",
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

    // Player Controls
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
      player.value.play(track.start, track.end);
    };

    const togglePlay = (e) => {
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

    const playAt = debounce(
      (start: number, end: number = player.value.getDuration()) => {
        player.value.play(start, end);
      },
      50
    );

    const [time, setTime] = useState({ curr: "0:00", total: "0:00" });
    const actualTime = ref<number>(0);
    const secondsToTimeString = (seconds: number) => {
      const minutes = Math.floor(seconds / 60);
      const secondsLeft = Math.floor(seconds % 60);
      return `${minutes}:${secondsLeft < 10 ? "0" : ""}${secondsLeft}`;
    };
    const setPlayerTime = (currTime: number) => {
      const curr = secondsToTimeString(currTime);
      if (currTime.toFixed(1) === actualTime.value.toFixed(1)) {
        //  Added to smooth out the time display
        return;
      }
      actualTime.value = currTime;
      const total = secondsToTimeString(player.value.getDuration());
      const percent = (currTime / player.value.getDuration()) * 100;
      // round to nearest 25%, 0.25, 0.5, 0.75, 1, 1.25
      const roundedPercent = Math.round(percent / 0.1) * 0.1;
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
          player.value.play(time, props.selectedTrack.end);
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
        player.value.play(time, props.selectedTrack.end);
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
    }>({ started: false, from: "start" });
    const onDragStartZoom = (from: "start" | "end") => {
      setDragZoom({ started: true, from });
    };
    const onDragZoom = (e: MouseEvent | TouchEvent) => {
      if (dragZoom.value.started) {
        const { percent } = calcDragTime(e);
        const percComplete =
          player.value.getCurrentTime() / player.value.getDuration();
        const difference = Math.min(Math.abs(percent - percComplete), 1);
        const scale = 1 / difference;
        setZoomed((zoom) => {
          zoom.scale = scale;
        });
      }
    };
    const onDragEndZoom = () => {
      if (dragZoom.value.started) {
        setDragZoom((zoom) => {
          zoom.started = false;
        });
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

    const SpectrogramSettings = {
      container: "#spectrogram",
      fftSamples: 512,
      colorMap: ColorMap({
        colormap: props.colour,
        nshades: 256,
        format: "float",
      }),
    };

    onMounted(async () => {
      const audioBuffer = props.buffer.slice(0);
      const realSampleRate = getSampleRate(audioBuffer).sampleRate;
      defaultSampleRate.value = realSampleRate === 0 ? 44100 : realSampleRate;
      let sampleRate = props.sampleRate;
      if (sampleRate === null) {
        sampleRate = defaultSampleRate.value;
        props.setSampleRate(sampleRate);
        newSampleRate.value = sampleRate;
      }
      const audioContext = new AudioContext({
        sampleRate,
      });
      const gainNode = audioContext.createGain();
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
        plugins: [SpectrogramPlugin.create(SpectrogramSettings)],
      };

      const createRectFromTrack = (track: AudioTrack) => {
        const pos =
          track.positions.length > 1 ? track.positions[1] : track.positions[0]; // Temp track uses second position
        let { x, y, width, height } = pos;
        const topFreq = sampleRate / 2;
        const scale = topFreq / 9;
        // take it from linear scale to log scale
        height = y - height;
        y = y * topFreq;
        y = y / scale;
        y = Math.log10(y + 1);

        let minFreq = height * topFreq;
        minFreq = minFreq / scale;
        minFreq = Math.log10(minFreq + 1);
        height = y - minFreq;
        // y needs to inverted due to canvas positioning
        y = ((1 - y) * (defaultSampleRate.value / 2)) / (sampleRate / 2);
        height = (height * (defaultSampleRate.value / 2)) / (sampleRate / 2);

        if (track.start && track.end) {
          const { start, end } = track;
          x = start / player.value.getDuration();
          width = (end - start) / player.value.getDuration();
        }
        const rect = createSVGElement(
          {
            attributes: {
              id: `track_${track.id.toString()}`,
              x: (x * spectrogram.value.width).toString(),
              y: (y * spectrogram.value.height).toString(),
              width: (width * spectrogram.value.width).toString(),
              height: (height * spectrogram.value.height).toString(),
              stroke: track.colour,
              "stroke-width": "2",
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
            rect.setAttribute("stroke-width", "3");
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
          const markedForUndeletion = [...newTracks.values()]
            .filter((track) => {
              const oldTrack = oldTracks.get(track.id);
              if (oldTrack) {
                return oldTrack.deleted && !track.deleted;
              }
              return false;
            })
            .map((track) => track.id);

          [...added, ...markedForUndeletion].forEach((trackId) => {
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
      watch(volume, (v) => {
        if (!volumeSlider.value) {
          return;
        }
        if (v.muted) {
          gainNode.gain.value = 0;
          volumeSlider.value.value = "0";
          player.value.setVolume(0);
        } else {
          const volume = v.volume * 2;
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
      }

      player.value = WaveSurfer.create({
        ...waveSurferOptions,
      });
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
          }
        }
      });

      const attachSpectrogramOverlay = () => {
        const canvas = document.querySelector(
          "spectrogram canvas"
        ) as HTMLCanvasElement;
        canvas.style.zIndex = "0";
        const context = canvas.getContext("2d");
        // add scale x on mousewheel;
        spectrogram.value = canvas;
        const spectrogramWidth = spectrogram.value.width;
        const spectrogramHeight = spectrogram.value.height;
        const container = document.querySelector("#spectrogram") as HTMLElement;
        const svgImage = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "image"
        );
        svgImage.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "href",
          canvas.toDataURL("image/png")
        );
        svgImage.setAttribute("width", spectrogramWidth.toString());
        svgImage.setAttribute("height", spectrogramHeight.toString());
        svgImage.setAttribute("x", "0");
        svgImage.setAttribute("y", "0");
        svgImage.setAttribute("preserveAspectRatio", "none");

        // check if newOverlay is already there
        const oldOverlay = container.querySelector("svg");
        if (oldOverlay) {
          container.removeChild(oldOverlay);
        }

        const overlayAttr = {
          style: {
            ["z-index"]: 10,
            cursor: "crosshair",
            width: "100%",
            height: "100%",
            "transform-origin": "0 center bottom",
          },
          attributes: {
            viewBox: `0 0 ${spectrogramWidth} ${spectrogramHeight}`,
            xmlns: "http://www.w3.org/2000/svg",
          },
        };
        const newOverlay = createSVGElement(overlayAttr, "svg");
        newOverlay.appendChild(svgImage);
        // hide container made by waveform
        const spectrogramContainer = document.querySelector(
          "spectrogram"
        ) as HTMLDivElement;
        spectrogramContainer.style.display = "none";

        if (overlay.value && container.contains(overlay.value)) {
          container.removeChild(overlay.value);
        }
        overlay.value = newOverlay;
        newOverlay.addEventListener("wheel", (e) => {
          const { deltaY } = e;
          context.save();
          context.scale(deltaY > 0 ? 1.1 : 0.9, 1);
          context.drawImage(canvas, 0, 0);
          context.restore();
        });
        newOverlay.addEventListener("touch", interactWithSpectrogram);

        container.appendChild(overlay.value);
        const startEvent = (e: TouchEvent | MouseEvent) => {
          // iOS safari doesn't support audio playback without user interaction
          const isiOS =
            !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
          if (!interacted.value && isiOS) {
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
        const endEvent = (e: TouchEvent | MouseEvent) => {
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
          const topFreq = sampleRate / 2;
          const scale = topFreq / 9;
          const flippedY = 1 - tempTrack.value.pos.y;
          let minFreq = flippedY - tempTrack.value.pos.height;
          // spectogram is in log scale so make into linear
          const pos = Object.assign({}, tempTrack.value.pos);

          let maxFreq = Math.pow(10, flippedY) - 1;
          minFreq = Math.pow(10, minFreq) - 1;
          maxFreq = maxFreq * scale;
          minFreq = minFreq * scale;
          pos.y = maxFreq / topFreq;
          pos.height = (maxFreq - minFreq) / topFreq;
          pos.y = maxFreq / (defaultSampleRate.value / 2);

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
            positions: [tempTrack.value.pos, pos],
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
        zoomIndicatorStart.addEventListener("mousedown", () => {
          onDragStartZoom("start");
        });
        zoomIndicatorStart.addEventListener("touchstart", () => {
          onDragStartZoom("start");
        });
        zoomIndicatorEnd.addEventListener("mousedown", () => {
          onDragStartZoom("end");
        });
        zoomIndicatorEnd.addEventListener("touchstart", () => {
          onDragStartZoom("end");
        });
        document.addEventListener("mousemove", onDragZoom);
        document.addEventListener("touchmove", onDragZoom);
        document.addEventListener("mouseup", onDragEndZoom);
        document.addEventListener("touchend", onDragEndZoom);
      };

      const initPlayer = () => {
        isLoading.value = false;
        player.value.backend.setFilters([gainNode]);
        attachSpectrogramOverlay();
        // Move canvas image to SVG & clean up
        overlay.value.appendChild(tempTrack.value.rect);
        requestAnimationFrame(() =>
          addTracksToOverlay([...props.tracks.values()])
        );
        if (isPlaying.value) {
          playAt(0);
        }
        setPlayerTime(player.value.getDuration());
        setPlayerTime(0);
        // Due to spectrogram plugin, we need to wait for the canvas to be rendered
        player.value.on("redraw", () => {
          player.value.spectrogram.init();
          attachSpectrogramOverlay();
          if (props.selectedTrack && props.selectedTrack.id === -1) {
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
          addTracksToOverlay([...props.tracks.values()]);
        });
      };

      // Get indicator by id player-bar-loader-indicator
      player.value.on("audioprocess", () => {
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
      player.value.on("ready", initPlayer);
      player.value.on("loading", () => {
        isLoading.value = true;
      });
      if ((window as any).WaveSurferOfflineAudioContext) {
        (window as any).WaveSurferOfflineAudioContext = null;
      }
      player.value.loadArrayBuffer(audioBuffer);
    });
    onBeforeUnmount(() => {
      player.value.empty();
      player.value.destroy();
    });
    return {
      player,
      spectrogram,
      isLoading,
      isPlaying,
      isFinished,
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
  overflow: hidden;
  border-radius: 8px 8px 0px 0px;
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
</style>
