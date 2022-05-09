<template>
  <section class="p-0 w-100">
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
              id="volume-slider"
              class="volume-slider"
              type="range"
              min="0"
              max="20"
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

        <div class="player-bar-zoom">
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
import WebAudio from "wavesurfer.js/src/webaudio";

const fetchAudioBuffer = async (url: string) => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return arrayBuffer;
};

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
    url: {
      type: String,
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
  },
  setup(props) {
    // Player

    const spectrogram = ref<HTMLCanvasElement>(null);
    const isLoading = ref(true);
    const player = ref<WaveSurfer>(null);
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
    const updateZoom = () => {
      const loader = document.getElementById(
        "loader-progress"
      ) as HTMLDivElement;
      const x = loader.offsetWidth;

      overlay.value.style.transformOrigin = `${x}px center`;
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
      const start = -Math.min(progress.offsetWidth, half);
      const end = Math.min(playerBar.offsetWidth - progress.offsetWidth, half);
      const startDiff = Math.abs(start + half);
      const endDiff = Math.abs(end - half);

      overlay.value.style.transform = `scale(${zoomed.value.scale}, 1)`;
      const translateY = "translateY(-3px)";
      zoomIndicatorStart.style.transform = `translateX(${
        start - endDiff
      }px) ${translateY}`;
      zoomIndicatorEnd.style.transform = `translateX(${
        end + startDiff + 10
      }px) ${translateY}`;
    };

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
        updateZoom();
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

        draft.pos.x = currX;
        draft.pos.y = currY;
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

    const playAt = debounce(
      (start: number, end: number = player.value.getDuration()) => {
        player.value.play(start, end);
      },
      50
    );

    const secondsToTimeString = (seconds: number) => {
      const minutes = Math.floor(seconds / 60);
      const secondsLeft = Math.floor(seconds % 60);
      return `${minutes}:${secondsLeft < 10 ? "0" : ""}${secondsLeft}`;
    };
    const [time, setTime] = useState({ curr: "0:00", total: "0:00" });
    const setPlayerTime = (currTime: number) => {
      const curr = secondsToTimeString(currTime);
      const total = secondsToTimeString(player.value.getDuration());
      const percent = (currTime / player.value.getDuration()) * 100;
      setTime({ curr, total });
      const progressBar = document.getElementById(
        "loader-progress"
      ) as HTMLProgressElement;
      progressBar.style.width = `${percent}%`;
    };

    const getDragCoords = (
      e: TouchEvent | MouseEvent,
      context = overlay.value as Element
    ) => {
      const rect = context.getBoundingClientRect();
      if (window.TouchEvent && "targetTouches" in e) {
        const x = (e.targetTouches[0].clientX - rect.left) / rect.width;
        const y = (e.targetTouches[0].clientY - rect.top) / rect.height;
        return {
          x,
          y,
        };
      } else if ("clientX" in e) {
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        return {
          x,
          y,
        };
      }
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
          setPlayerTime(time);
          if (zoomed.value.enabled) {
            updateZoom();
          }
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
      setDragZoom((zoom) => {
        zoom.started = false;
      });
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
        colormap: "Cool",
        nshades: 256,
        format: "float",
      }),
    };
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

    onMounted(async () => {
      const audioBuffer = await fetchAudioBuffer(props.url);
      let { sampleRate } = getSampleRate(audioBuffer);
      sampleRate = sampleRate < 10000 ? sampleRate + 8000 : sampleRate;
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
        const pos = track.positions[0];
        const y = track.maxFreq ? track.maxFreq / (sampleRate / 2) : pos.y;
        const height = track.minFreq
          ? (track.maxFreq - track.minFreq) / (sampleRate / 2)
          : pos.height;
        const rect = createSVGElement(
          {
            attributes: {
              id: `track_${track.id.toString()}`,
              x: (pos.x * spectrogram.value.width).toString(),
              y: (y * spectrogram.value.height).toString(),
              width: (pos.width * spectrogram.value.width).toString(),
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
          .map((trackRect) => overlay.value.appendChild(trackRect));

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
        } else {
          if (v.volume < 1) {
            player.value.setVolume(v.volume);
            gainNode.gain.value = 0;
          } else {
            player.value.setVolume(1);
            gainNode.gain.value = v.volume;
          }
          volumeSlider.value.value = v.volume.toString();
        }
        storeVolume(volume.value);
      });

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
        const overlayAttr = {
          style: {
            ["z-index"]: 10,
            cursor: "crosshair",
            width: "100%",
            height: "100%",
            "transform-origin": "0 center",
          },
          attributes: {
            viewBox: `0 0 ${spectrogramWidth} ${spectrogramHeight}`,
            xmlns: "http://www.w3.org/2000/svg",
          },
        };
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

        container.appendChild(overlay.value);
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
          const minFreq = Math.floor(
            (maxSample / 2) *
              (tempTrack.value.pos.y - tempTrack.value.pos.height)
          );

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
          setTempTrack((tempTrack) => {
            tempTrack.active = false;
          });
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
            setTempTrack((tempTrack) => {
              tempTrack.active = false;
            });
          }
        };

        // Add Track Functionality
        overlay.value.addEventListener("mousedown", startEvent);
        overlay.value.addEventListener("touchstart", startEvent);
        overlay.value.addEventListener("mousemove", moveEvent);
        overlay.value.addEventListener("touchmove", moveEvent);
        overlay.value.addEventListener("mouseup", endEvent);
        overlay.value.addEventListener("touchend", endEvent);

        // Add Player Bar Functionality
        const playerBarLoader = document.getElementById(
          "player-bar-loader-indicator"
        ) as HTMLDivElement;
        playerBarLoader.addEventListener("mousedown", onDragStartTime);
        playerBarLoader.addEventListener("touchstart", onDragStartTime);
        window.addEventListener("mousemove", onDragTime);
        window.addEventListener("touchmove", onDragTime);
        window.addEventListener("mouseup", onDragEndTime);
        window.addEventListener("touchend", onDragEndTime);

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
        window.addEventListener("mousemove", onDragZoom);
        window.addEventListener("touchmove", onDragZoom);
        window.addEventListener("mouseup", onDragEndZoom);
        window.addEventListener("touchend", onDragEndZoom);
      };

      const initPlayer = () => {
        isLoading.value = false;
        player.value.backend.setFilters([gainNode]);
        attachSpectrogramOverlay();
        // Move canvas image to SVG & clean up
        overlay.value.appendChild(tempTrack.value.rect);
        addTracksToOverlay([...props.tracks.values()]);
        if (isPlaying.value) {
          playAt(0);
        }
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
          updateZoom();
        }
        if (!dragTime.value) {
          setPlayerTime(player.value.getCurrentTime());
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
      changeVolume,
      zoomed,
      setZoomed,
      time,
      play,
      onDragTime,
      onDragStartTime,
      onDragEndTime,
      onClickSeek,
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
  overflow: hidden;
  border-radius: 8px 8px 0px 0px;
}
.player-bar {
  display: grid;
  grid-template-columns: 1fr 7fr 2fr;
  justify-content: start;
  justify-content: space-between;
  justify-items: center;
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
  position: absolute;
  bottom: 110px;
  left: 10px;
  transform: rotate(270deg);
  opacity: 0;
  z-index: 20;
  transition: opacity 0.2s;
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
.volume-selection:hover {
  .volume-slider {
    visibility: visible;
    opacity: 1;
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
}
.player-bar-indicator {
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
.player-bar-zoom {
  user-select: none;
  grid-column-start: 3;
}
.highlighted {
  color: #c1f951;
}
.zoom-indicator {
  display: none;
  width: 8px;
  border-radius: 3px;
}
</style>
