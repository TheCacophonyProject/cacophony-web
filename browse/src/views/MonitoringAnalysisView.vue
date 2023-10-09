<template>
  <main class="monitoring-analysis-container">
    <div class="top-bar-container">
      <h4>Monitoring Analysis</h4>
      <div class="media-type-container" v-if="availableTypes.size > 1">
        <h2 :class="{ selected: mediaType === MediaType.ThermalRaw }">Video</h2>
        <button
          class="media-type-switch"
          @click="
            () => {
              mediaType =
                mediaType === MediaType.Audio
                  ? MediaType.ThermalRaw
                  : MediaType.Audio;
            }
          "
        >
          <div
            :style="{
              transform:
                mediaType === MediaType.Audio
                  ? 'translateX(calc(200% - 2em))'
                  : '',
            }"
          ></div>
        </button>
        <h2 :class="{ selected: mediaType === MediaType.Audio }">Audio</h2>
      </div>
      <div v-else>
        <h2>{{ mediaType }}</h2>
      </div>
    </div>
    <Transition name="fade">
      <article class="stats-container" v-show="trackTags.length">
        <div class="inner-div">
          <div class="tag-selector">
            <label>Tag</label>
            <multiselect
              v-model="selectedLabels"
              :options="labels"
              placeholder="all"
              multiple
            />
          </div>
          <div class="location-selector">
            <SelectDevice
              :selected-devices="devices"
              :selected-groups="groups"
              :selected-stations="stations"
              :hide-selected-type="hiddenType"
              @update-device-selection="updateDeviceSelection"
              :lazy="false"
            />
          </div>
          <div class="chart-container">
            <b-spinner v-show="isLoading" type="grow" size="lg"></b-spinner>
            <canvas v-show="!isLoading" ref="chartDomRef" id="chart" />
          </div>
          <div class="totals-table">
            <div class="totals-container">
              <div class="d-flex justify-content-between">
                <h2
                  role="button"
                  @click="() => (datasetFocus = DataType.Tag)"
                  :class="{ selected: DataType.Tag === datasetFocus }"
                >
                  Tags
                </h2>
                <h2>Total: {{ displayedTotal }}</h2>
              </div>
              <div class="totals-item-container">
                <div
                  v-for="(value, key) in tagTotals"
                  :key="key"
                  class="totals-item"
                >
                  <div
                    class="totals-key"
                    @click="() => toggleTag(key.toString())"
                    role="button"
                  >
                    {{ key }}
                  </div>
                  <div class="totals-value">{{ value }}</div>
                </div>
              </div>
            </div>
            <div class="totals-container">
              <h2
                role="button"
                @click="() => (datasetFocus = DataType.Group)"
                :class="{ selected: DataType.Group === datasetFocus }"
                v-if="!groupId"
              >
                Groups
              </h2>
              <div class="totals-item-container" v-if="!groupId">
                <div
                  v-for="(value, key) in groupTotals"
                  :key="key"
                  class="totals-item"
                >
                  <div
                    class="totals-key"
                    @click="() => toggleGroup(key.toString())"
                    role="button"
                  >
                    {{ key }}
                  </div>
                  <div class="totals-value">{{ value }}</div>
                </div>
              </div>
            </div>
            <div class="totals-container">
              <h2
                role="button"
                @click="() => (datasetFocus = DataType.Station)"
                :class="{ selected: DataType.Station === datasetFocus }"
              >
                Stations
              </h2>
              <div class="totals-item-container">
                <div
                  class="totals-item"
                  v-for="(value, key) in stationTotals"
                  :key="key"
                >
                  <div
                    class="totals-key"
                    @click="() => toggleStation(key.toString())"
                    role="button"
                    :class="{ selected: stations.includes(key.toString()) }"
                  >
                    {{ key !== "null" ? key : "No Station" }}
                  </div>
                  <div class="totals-value">{{ value }}</div>
                </div>
              </div>
            </div>
            <div>
              <h2
                role="button"
                @click="() => (datasetFocus = DataType.User)"
                :class="{ selected: DataType.User === datasetFocus }"
              >
                Taggers
              </h2>
              <div class="totals-item-container">
                <div
                  class="totals-item"
                  v-for="(value, key) in userTotals"
                  :key="key"
                  @click="
                    () => {
                      if (key === userFocus) {
                        userFocus = null;
                      } else {
                        userFocus = key.toString();
                      }
                    }
                  "
                  role="button"
                >
                  <div class="totals-key">
                    {{ key }}
                  </div>
                  <div class="totals-value">{{ value }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </Transition>
    <div v-show="isLoading">
      <b-spinner type="grow" size="lg"></b-spinner>
    </div>
    <div class="no-data-message" v-show="!isLoading && trackTags.length === 0">
      <h3>No data found</h3>
    </div>
  </main>
</template>
<script lang="ts">
import RecordingApi, { TrackTagRow } from "@/api/Recording.api";
import SelectDevice from "@/components/QueryRecordings/SelectDevice.vue";
import { useRoute, useRouter } from "@/utils";
import { RecordingType } from "@typedefs/api/consts";
import {
  computed,
  defineComponent,
  onMounted,
  onUnmounted,
  PropType,
  ref,
  watch,
} from "@vue/composition-api";
import _ from "lodash";
import Multiselect from "vue-multiselect";
import {
  Chart,
  BarElement,
  BarController,
  CategoryScale,
  ChartType,
  LinearScale,
  ChartTypeRegistry,
} from "chart.js";
import colormap from "colormap";

enum DataType {
  Tag,
  Group,
  Station,
  Device,
  User,
}
export default defineComponent({
  name: "MonitoringAnalysisView",
  components: { SelectDevice, Multiselect },
  props: {
    groupId: { type: Number, required: false },
    availableTypes: {
      type: Set as PropType<Set<RecordingType>>,
      default: () => new Set([RecordingType.ThermalRaw, RecordingType.Audio]),
    },
  },
  setup(props) {
    // Browser
    const route = useRoute();
    const router = useRouter();

    // Track Tags
    const trackTags = ref<(TrackTagRow & { count: number })[]>([]);
    const filterTrackTags = ref<(TrackTagRow & { count: number })[]>([]);
    const isLoading = ref(false);

    // Data Selectors
    const labels = ref<string[]>([]);
    const selectedLabels = ref<string[]>([]);
    const mediaType = ref(null);
    const devices = ref<string[]>([]);
    const groups = ref<string[]>([]);
    const stations = ref<string[]>([]);
    const userFocus = ref<string | null>(null);
    const username = ref<string | null>(null);

    // Totals
    const total = computed(() => {
      return filterTrackTags.value.reduce((sum, tag) => sum + tag.count, 0);
    });
    const displayedTotal = ref("0");
    const tagTotals = ref<{ [key: string]: number }>({});
    const groupTotals = ref<{ [key: string]: number }>({});
    const stationTotals = ref<{ [key: string]: number }>({});
    const userTotals = ref<{ [key: string]: number }>({});

    // Chart
    const chartDomRef = ref<HTMLCanvasElement | null>(null);
    const datasetFocus = ref<DataType>(DataType.Tag);
    let barChart: Chart<
      keyof ChartTypeRegistry,
      { [x: string]: number },
      unknown
    >;
    let animationFrameId = null;

    watch(total, (newTotal, oldTotal) => {
      cancelAnimationFrame(animationFrameId);

      let start = null;
      const duration = 200; // Animation duration in milliseconds

      const animate = (timestamp) => {
        if (start === null) {
          start = timestamp;
        }

        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);

        displayedTotal.value = (
          oldTotal +
          (newTotal - oldTotal) * progress
        ).toFixed(0);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(animate);
        }
      };

      animationFrameId = requestAnimationFrame(animate);
    });

    // State
    const updateDeviceSelection = (eventData) => {
      if (eventData.hasOwnProperty("devices")) {
        devices.value = eventData.devices;
      }
      if (eventData.hasOwnProperty("groups")) {
        groups.value = eventData.groups;
      }
      if (eventData.hasOwnProperty("stations")) {
        stations.value = eventData.stations;
      }
    };

    // User ID currently has id_ attached to it due to sorting
    const fetchTrackTagData = async () => {
      console.log({
        at: props.availableTypes,
        route: route.value.query.type,
      });
      if (props.availableTypes.size === 0) {
        return;
      } else if (!route.value.query.type) {
        mediaType.value = props.availableTypes.values().next().value;
      }
      const type: RecordingType =
        route.value.query.type === "audio"
          ? RecordingType.Audio
          : RecordingType.ThermalRaw;
      isLoading.value = true;
      const response = await RecordingApi.queryTrackTagsCount({
        type,
        exclude: [
          "unidentified",
          "false-positive",
          "false-positives",
          "unknown",
        ],
        ...(props.groupId && { groupId: props.groupId }),
      });
      isLoading.value = false;
      if (response.success) {
        trackTags.value = response.result.rows.map((row) => ({
          label: row.what,
          labeller: row.userName,
          group: { id: row.groupId, name: row.groupName },
          station: { id: row.stationId, name: row.stationName },
          device: { id: row.deviceId, name: row.deviceName },
          count: parseInt(row.trackTagCount),
        }));
      }
    };

    const setFilterTrackTags = () => {
      filterTrackTags.value = trackTags.value
        .filter((trackTag) => {
          const checkQuery = (query: string) => {
            const val = route.value.query[query];
            const trackTagVal = trackTag[query];
            if (!val) {
              return true;
            }
            if (trackTagVal === null) {
              return false;
            }
            const id = trackTagVal.id || -1;
            return Array.isArray(val)
              ? val.length === 0 || val.includes(id.toString())
              : id === Number(route.value.query[query]);
          };
          return (
            checkQuery("group") &&
            checkQuery("station") &&
            checkQuery("device") &&
            (userFocus.value !== null
              ? userFocus.value === trackTag.labeller
              : true)
          );
        })
        .filter((trackTag) =>
          route.value.query.tag && route.value.query.tag.length !== 0
            ? Array.isArray(route.value.query.tag)
              ? route.value.query.tag.includes(trackTag.label)
              : trackTag.label === route.value.query.tag
            : true
        );
    };

    watch([mediaType, selectedLabels, groups, stations, userFocus], () => {
      const targetLocation = {
        query: {
          tag: selectedLabels.value ?? route.value.query.tag,
          type: mediaType.value ?? route.value.query.type,
          group: groups.value ?? route.value.query.group,
          station: stations.value ?? route.value.query.station,
          ...(userFocus.value && { user: userFocus.value }),
        },
      };
      const resolvedTarget = router.resolve(targetLocation);
      if (route.value.fullPath !== resolvedTarget.href) {
        router.replace(targetLocation).catch((err) => {
          if (err.name !== "NavigationDuplicated") {
            throw err;
          }
        });
      }
    });
    const setTrackTags = async () => {
      await fetchTrackTagData();
      labels.value = [
        ...new Set(trackTags.value.map((trackTag) => trackTag.label)),
      ];
      setFilterTrackTags();
    };
    const prevType = ref(null);
    watch(
      () => [route.value, props.availableTypes] as const,
      async ([currRoute, availableTypes], [prevRoute, _pervType]) => {
        if (availableTypes.size === 0) {
          return;
        }
        if (prevType.value === null) {
          prevType.value =
            currRoute.query.type ?? availableTypes.values().next().value;
          mediaType.value = prevType.value;
          // set route to first available type
          await setTrackTags();
        } else {
          const type = (currRoute.query.type as string) ?? mediaType.value;
          const isRouteQuerySame = (query: string) =>
            currRoute.query[query] === prevRoute.query[query];
          const queries = ["tag", "group", "station", "device", "user"];
          const isRouteSame = queries.every(isRouteQuerySame);
          console.log(isRouteSame, currRoute.query, prevRoute.query);
          if (type !== prevType.value || !isRouteSame) {
            prevType.value = type;
            await setTrackTags();
          }
        }
      }
    );

    watch(
      [tagTotals, groupTotals, stationTotals, userTotals, datasetFocus],
      () => {
        if (!barChart) {
          return;
        }
        const types = {
          [DataType.Tag]: tagTotals.value,
          [DataType.Group]: groupTotals.value,
          [DataType.Station]: stationTotals.value,
          [DataType.User]: userTotals.value,
        };
        if (datasetFocus.value in types) {
          barChart.data.datasets[0].data = types[datasetFocus.value];
        }
        const nshades = Math.max(
          Object.keys(barChart.data.datasets[0].data).length,
          6
        );
        barChart.data.datasets[0].backgroundColor = colormap({
          colormap: "summer",
          nshades,
          format: "hex",
        }).reverse();
        barChart.update();
      }
    );

    watch([trackTags, filterTrackTags], () => {
      const totalOf = (key: string) => {
        return _.chain(filterTrackTags.value)
          .groupBy(key)
          .mapValues((grouped) => _.sumBy(grouped, "count"))
          .toPairs() // Convert the object to pairs [key, value]
          .orderBy([1], ["desc"]) // Sort by the value (count) in descending order
          .fromPairs() // Convert it back to an object
          .value();
      };

      tagTotals.value = totalOf("label");
      stationTotals.value = totalOf("station.name");
      groupTotals.value = totalOf("group.name");
      userTotals.value = totalOf("labeller");
    });

    const { tag, station, group, device, user } = route.value.query;
    selectedLabels.value = tag ? (Array.isArray(tag) ? tag : [tag]) : [];
    stations.value = station
      ? Array.isArray(station)
        ? station
        : [station]
      : [];
    devices.value = device ? (Array.isArray(device) ? device : [device]) : [];
    groups.value = group ? (Array.isArray(group) ? group : [group]) : [];
    userFocus.value = user ? (user as string) : null;

    onMounted(async () => {
      Chart.register(BarElement, BarController, CategoryScale, LinearScale);
      const config = {
        type: "bar" as ChartType,
        data: {
          datasets: [
            {
              data: {},
            },
          ],
        },
      };
      barChart = new Chart(chartDomRef.value, config);
      await setTrackTags();
    });

    onUnmounted(() => {
      if (barChart) {
        barChart.destroy();
      }
    });

    const toggleTag = (tag: string) => {
      const index = selectedLabels.value.indexOf(tag);
      if (index === -1) {
        selectedLabels.value = [...selectedLabels.value, tag];
      } else {
        selectedLabels.value = [
          ...selectedLabels.value.slice(0, index),
          ...selectedLabels.value.slice(index + 1),
        ];
      }
    };

    const toggleGroup = (group: string) => {
      const groupId = trackTags.value
        .find((tag) => tag.group.name === group)
        ?.group.id.toString();
      if (!groupId) {
        return;
      }
      const index = groups.value.indexOf(groupId);
      if (index === -1) {
        groups.value = [...groups.value, groupId];
      } else {
        groups.value = [
          ...groups.value.slice(0, index),
          ...groups.value.slice(index + 1),
        ];
      }
    };

    const toggleStation = (station: string) => {
      const stationId = trackTags.value
        .find((tag) => tag.station.name === station)
        ?.station.id.toString();
      if (!stationId) {
        return;
      }
      const index = stations.value.indexOf(stationId);
      if (index === -1) {
        stations.value = [...stations.value, stationId];
      } else {
        stations.value = [
          ...stations.value.slice(0, index),
          ...stations.value.slice(index + 1),
        ];
      }
    };

    return {
      toggleTag,
      toggleStation,
      toggleGroup,
      chartDomRef,
      selectedLabels,
      labels,
      mediaType,
      MediaType: RecordingType,
      devices,
      groups,
      stations,
      total,
      displayedTotal,
      tagTotals,
      groupTotals,
      stationTotals,
      userTotals,
      datasetFocus,
      userFocus,
      username,
      DataType,
      trackTags,
      filterTrackTags,
      isLoading,
      updateDeviceSelection,
      hiddenType: props.groupId
        ? new Set(["group", "device"])
        : new Set(["device"]),
    };
  },
});
</script>

<style lang="scss">
.monitoring-analysis-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1em;
  max-width: 1140px;
  width: 100%;
  margin: auto;
}

.top-bar-container {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 1em;
  text-transform: capitalize;
  max-width: 1140px;
  flex-wrap: wrap;
}

@media (max-width: 767px) {
  .top-bar-container {
    justify-content: center;
  }
}

main {
  width: 100vw;
  max-width: 100%;
  & h1 {
    font-weight: 800;
    color: #303030;
  }
}

.media-type-container {
  display: flex;
  h2 {
    font-weight: 800;
    color: #9d9d9d;
    &.selected {
      color: #303030;
    }
  }
}

.media-type-switch {
  min-width: 6em;
  // remove button styling
  background: rgb(211, 211, 211);
  border-radius: 2em;
  border: none;
  padding: 0 1em 0 1em;
  margin-left: 1em;
  margin-right: 1em;
  outline: none;
  cursor: pointer;

  & div {
    transition: transform 0.1s ease-in-out;
    content: "";
    width: 2em;
    height: 2em;
    background: #fff;
    border-radius: 100%;
  }
}

.stats-container {
  display: grid;
  padding-top: 1em;
  grid-template-columns: 1fr minmax(auto, 1140px) 1fr;

  & label {
    color: #1e1e1e;
    font-weight: bold;
    text-transform: capitalize;
  }

  /* Adjust inner divs to take up 3 columns within the middle column */
  .inner-div {
    grid-column: 2;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-rows: 6em auto;
    grid-column-gap: 1em;
    column-gap: 1em;
  }
}

@media (max-width: 767px) {
  /* Adjust the max-width as needed */
  .stats-container .inner-div {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
  }
}

.tag-selector {
  width: 100%;
  grid-column-start: 1;
  grid-column-end: 2;
  margin-bottom: 1rem;
}

.location-selector {
  width: 100%;
  grid-column-start: 2;
  grid-column-end: 3;
}

.chart-container {
  grid-column-start: 1;
  grid-column-end: 3;
  grid-row-start: 2;
  grid-row-end: 3;
  max-height: 20em;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;

  & #chart {
    max-height: 20em;
  }
}

.totals-table {
  width: 100%;
  grid-column-start: 3;
  grid-column-end: 4;
  grid-row-start: 1;
  grid-row-end: 3;
  > div {
    margin-bottom: 1em;
  }
}

.totals-item-container {
  max-height: 8em;
  overflow-y: auto;
}

.totals-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 0.3em;
  padding-right: 1em;
  border-bottom: #b9b9b9 1px solid;
}

.selected {
  color: #303030;
  font-weight: bold;
}
.no-data-message {
  display: flex;
  justify-content: center;
  padding-top: 1em;
  & h4 {
    color: #303030;
    font-weight: 800;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active in <2.1.8 */ {
  opacity: 0;
}
</style>
