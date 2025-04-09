<template>
  <canvas ref="chart" />
</template>

<script lang="ts">
import { PropType } from "vue";
import {
  defineComponent,
  onMounted,
  shallowRef,
  ref,
  watch,
} from "@vue/composition-api";
import {
  Chart,
  LineController,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { CacophonyIndex } from "@typedefs/api/recording";

function createGradient(context: any, min: number, max: number) {
  // Hex values for flat ui green, blue, and black
  const green = "#2ecc71";
  const blue = "#3498db";
  const black = "#34495e";

  const {
    chart: { ctx, chartArea },
  } = context;
  if (!chartArea) {
    return;
  }
  const top = max / 100;
  const bottom = min / 100;
  const middle = (max + min) / 200;
  const gradient = ctx.createLinearGradient(
    0,
    chartArea.bottom,
    0,
    chartArea.top,
  );
  if (top > 0.65) {
    gradient.addColorStop(top, green);
  }
  if (middle < 0.65) {
    gradient.addColorStop(middle, blue);
  }
  if (bottom < 0.35) {
    gradient.addColorStop(bottom, black);
  }
  return gradient;
}

export default defineComponent({
  props: {
    cacophonyIndex: {
      type: Array as PropType<CacophonyIndex[]>,
      required: true,
    },
    id: {
      type: Number,
      required: true,
    },
    simplify: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    Chart.register([
      LineElement,
      LineController,
      CategoryScale,
      LinearScale,
      PointElement,
      Tooltip,
    ]);
    const chart = ref<HTMLCanvasElement>(null);
    onMounted(() => {
      const chartRef = shallowRef(null);
      watch(
        () => props.cacophonyIndex,
        () => {
          if (chartRef.value !== null) {
            chartRef.value.destroy();
          }
          const data = props.cacophonyIndex.map(
            (cacophonyIndex: CacophonyIndex) => {
              const { begin_s, end_s, index_percent } = cacophonyIndex;
              return {
                x: end_s - begin_s,
                y: index_percent,
              };
            },
          );

          const highestEndVal = props.cacophonyIndex.reduce(
            (highest: number, current: CacophonyIndex) => {
              return current.end_s > highest ? current.end_s : highest;
            },
            0,
          );

          const minIndexVal = props.cacophonyIndex.reduce(
            (lowest: number, current: CacophonyIndex) => {
              return current.index_percent < lowest
                ? current.index_percent
                : lowest;
            },
            100,
          );
          const maxIndexVal = props.cacophonyIndex.reduce(
            (highest: number, current: CacophonyIndex) => {
              return current.index_percent > highest
                ? current.index_percent
                : highest;
            },
            0,
          );
          chartRef.value = new Chart(chart.value, {
            type: "line",
            data: {
              labels: props.cacophonyIndex.map(({ time }) => time),
              datasets: [
                {
                  label: "Cacophony Index",
                  data,
                  borderColor: (context: any) =>
                    createGradient(
                      context,
                      props.simplify ? minIndexVal : 0,
                      props.simplify ? maxIndexVal : 100,
                    ),
                  borderWidth: 4,
                  stepped: "middle",
                },
              ],
            },
            options: {
              plugins: {
                tooltip: {
                  mode: "index",
                  intersect: false,
                  displayColors: false,
                  callbacks: {
                    title: () => {
                      return "";
                    },
                    label: (tooltipItem) => {
                      const value = tooltipItem.formattedValue;
                      return value;
                    },
                  },
                },
                legend: {
                  display: false,
                },
              },
              elements: {
                point: {
                  radius: 2,
                },
              },
              scales: {
                x: {
                  ...(!props.simplify
                    ? {
                        max: highestEndVal,
                        min: 0,
                      }
                    : {}),
                  display: !props.simplify,
                  grid: {
                    display: !props.simplify,
                  },
                },
                y: {
                  ...(!props.simplify
                    ? {
                        max: 100,
                        min: 0,
                      }
                    : {}),
                  display: !props.simplify,
                  grid: {
                    display: !props.simplify,
                  },
                },
              },
            },
          });
        },
        { immediate: true },
      );
    });
    return { chart };
  },
});
</script>
