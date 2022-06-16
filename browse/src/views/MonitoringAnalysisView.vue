<template>
  <main>
    <div class="top-bar-container">
      <h1>Montioring Analysis</h1>
      <div class="media-type-container">
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
    </div>
    <article class="stats-container">
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
          @update-device-selection="updateDeviceSelection"
        />
      </div>
      <div class="chart-container">
        <article>
          <canvas ref="chartDomRef" id="chart" />
        </article>
      </div>
      <div class="totals-table">
        <div class="totals-container">
          <h2
            role="button"
            @click="() => (datasetFocus = DataType.Tag)"
            :class="{ selected: DataType.Tag === datasetFocus }"
          >
            Tags
          </h2>
          <div class="totals-item-container">
            <div
              v-for="(value, key) in tagTotals"
              :key="key"
              class="totals-item"
            >
              <div class="totals-key">{{ key }}</div>
              <div class="totals-value">{{ value }}</div>
            </div>
          </div>
        </div>
        <div class="totals-container">
          <h2
            role="button"
            @click="() => (datasetFocus = DataType.Group)"
            :class="{ selected: DataType.Group === datasetFocus }"
          >
            Groups
          </h2>
          <div class="totals-item-container">
            <div
              v-for="(value, key) in groupTotals"
              :key="key"
              class="totals-item"
            >
              <div class="totals-key">{{ key }}</div>
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
              <div class="totals-key">{{ key }}</div>
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
            Users
          </h2>
          <div class="totals-item-container">
            <div
              class="totals-item"
              v-for="(value, key) in userTotals"
              :key="key"
              @click="
                () => {
                  userFocus = key === userFocus ? null : key.toString();
                }
              "
              role="button"
            >
              <div class="totals-key" :class="{ selected: key === userFocus }">
                {{ key }}
              </div>
              <div class="totals-value">{{ value }}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  </main>
</template>
<script lang="ts">
import RecordingApi, { TrackTagRow } from "@/api/Recording.api";
import SelectDevice from "@/components/QueryRecordings/SelectDevice.vue";
import { useRoute, useRouter } from "@/utils";
import { RecordingType } from "@typedefs/api/consts";
import { defineComponent, onMounted, ref, watch } from "@vue/composition-api";
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
  setup() {
    // Browser
    const route = useRoute();
    const router = useRouter();

    // Track Tags
    const trackTags = ref<TrackTagRow[]>([]);
    const filterTrackTags = ref<TrackTagRow[]>([]);

    // Data Selectors
    const labels = ref<string[]>([]);
    const selectedLabels = ref<string[]>([]);
    const mediaType = ref(
      route.value.query.type === RecordingType.Audio
        ? RecordingType.Audio
        : RecordingType.ThermalRaw
    );
    const devices = ref<string[]>([]);
    const groups = ref<string[]>([]);
    const stations = ref<string[]>([]);
    const userFocus = ref<string | null>(null);
    // Totals
    const tagTotals = ref<{ [key: string]: number }>({});
    const groupTotals = ref<{ [key: string]: number }>({});
    const stationTotals = ref<{ [key: string]: number }>({});
    const userTotals = ref<{ [key: string]: number }>({});
    // Ids
    const groupIds = ref<{ [key: string]: string }>({});
    const stationIds = ref<{ [key: string]: string }>({});
    const deviceIds = ref<{ [key: string]: string }>({});

    // Chart
    const chartDomRef = ref<HTMLCanvasElement | null>(null);
    const datasetFocus = ref<DataType>(DataType.Tag);
    let barChart: Chart<
      keyof ChartTypeRegistry,
      { [x: string]: number },
      unknown
    >;

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

    const updateTrackTags = async () => {
      const type: RecordingType =
        route.value.query.type === "audio"
          ? RecordingType.Audio
          : RecordingType.ThermalRaw;
      const response = await RecordingApi.queryTrackTags(type);
      if (response.success) {
        trackTags.value = response.result.rows;
        // console.log(response.result.rows);
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

            return Array.isArray(val)
              ? val.length === 0 || val.includes(trackTag[query].id.toString())
              : trackTag[query].id === Number(route.value.query[query]);
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
    watch(
      [mediaType, selectedLabels, devices, groups, stations, userFocus],
      () => {
        router.push({
          query: {
            tag: selectedLabels.value,
            type: mediaType.value,
            device: devices.value,
            group: groups.value,
            station: stations.value,
            ...(userFocus.value && { user: userFocus.value }),
          },
        });
      }
    );
    watch(route, async (curr, prev) => {
      if (curr.query.type !== prev.query.type) {
        await updateTrackTags();
        filterTrackTags.value = [];
        labels.value = [
          ...new Set(trackTags.value.map((trackTag) => trackTag.label)),
        ];
        selectedLabels.value = [];
      }
      setFilterTrackTags();
    });

    watch(
      [tagTotals, groupTotals, stationTotals, userTotals, datasetFocus],
      () => {
        if (!barChart) {
          return;
        }
        if (datasetFocus.value === DataType.Tag) {
          barChart.data.datasets[0].data = tagTotals.value;
        } else if (datasetFocus.value === DataType.Group) {
          barChart.data.datasets[0].data = groupTotals.value;
        } else if (datasetFocus.value === DataType.Station) {
          barChart.data.datasets[0].data = stationTotals.value;
        } else if (datasetFocus.value === DataType.User) {
          barChart.data.datasets[0].data = userTotals.value;
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
      const extractTotalOf =
        (data: { [key: string]: any }[]) =>
        (key: string | [string, string]) => {
          return _(
            data.reduce((acc, cur) => {
              let newKey = "";
              if (Array.isArray(key)) {
                cur = cur[key[0]];
                newKey = key[1] as string;
              } else {
                newKey = key as string;
              }
              if (cur === null) {
                return acc;
              }
              if (acc.hasOwnProperty(cur[newKey])) {
                acc[cur[newKey]] += 1;
              } else {
                acc[cur[newKey]] = 1;
              }
              return acc;
            }, {})
          )
            .toPairs()
            .orderBy([1], ["desc"])
            .fromPairs()
            .value();
        };
      const extractIdsOf = (data: { [key: string]: any }[], key: string) => {
        return data.reduce((acc, cur) => {
          if (cur[key] === null) {
            return acc;
          }
          acc[cur[key].name] = cur[key].id;
          return acc;
        }, {});
      };
      const totalOf = extractTotalOf(filterTrackTags.value);
      tagTotals.value = totalOf("label");
      stationTotals.value = totalOf("station");
      groupTotals.value = totalOf("group");
      userTotals.value = totalOf("labeller");

      groupIds.value = extractIdsOf(filterTrackTags.value, "group");
      stationIds.value = extractIdsOf(filterTrackTags.value, "station");
      deviceIds.value = extractIdsOf(filterTrackTags.value, "device");
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
      await updateTrackTags();
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
      barChart = new Chart(
        document.getElementById("chart") as HTMLCanvasElement,
        config
      );
      labels.value = [
        ...new Set(trackTags.value.map((trackTag) => trackTag.label)),
      ];

      setFilterTrackTags();
    });

    return {
      chartDomRef,
      selectedLabels,
      labels,
      mediaType,
      MediaType: RecordingType,
      devices,
      groups,
      stations,
      tagTotals,
      groupTotals,
      stationTotals,
      userTotals,
      datasetFocus,
      userFocus,
      DataType,
      updateDeviceSelection,
    };
  },
});
</script>

<style lang="scss">
.top-bar-container {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  padding: 1em;
  background-color: #fafafa;
  border-bottom: 1px solid #eaeaea;
}

main {
  width: 100vw;
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
  margin-top: 3em;
  grid-template-columns: 0.3fr 1fr 1fr 1fr 0.3fr;
  grid-template-rows: 6em auto;
  grid-column-gap: 1em;
  & label {
    color: #1e1e1e;
    font-weight: bold;
    text-transform: capitalize;
  }
  > div {
    padding: 0 1em 0 1em;
  }
}

.tag-selector {
  grid-column-start: 2;
  grid-column-end: 3;
  margin-bottom: 1rem;
}

.location-selector {
  grid-column-start: 3;
  grid-column-end: 4;
}

.chart-container {
  grid-column-start: 2;
  grid-column-end: 4;
  grid-row-start: 2;
  grid-row-end: 3;
}

.totals-table {
  grid-column-start: 4;
  grid-column-end: 5;
  grid-row-start: 1;
  grid-row-end: 3;
  > div {
    margin-bottom: 1em;
  }
}

.totals-item-container {
  max-height: 8em;
  padding-right: 1em;
  overflow-y: auto;
}

.totals-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 0.3em;
  border-bottom: #b9b9b9 1px solid;
}

.selected {
  color: #303030;
  font-weight: bold;
}
</style>
