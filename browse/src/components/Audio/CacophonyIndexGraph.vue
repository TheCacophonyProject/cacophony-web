<template>
  <canvas :ref="this.id" />
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import {
  Chart,
  LineController,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
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
  if (!chartArea) return;
  const top = max / 100;
  const bottom = min / 100;
  const middle = (max + min) / 200;
  const gradient = ctx.createLinearGradient(
    0,
    chartArea.bottom,
    0,
    chartArea.top
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

export default Vue.extend({
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
  computed: {
    data() {
      const cacophonySet = this.cacophonyIndex.map(
        (cacophonyIndex: CacophonyIndex) => {
          const { begin_s, end_s, index_percent } = cacophonyIndex;
          return {
            x: end_s - begin_s,
            y: index_percent,
          };
        }
      );
      return cacophonySet;
    },
    timeLimit() {
      const highestEnd = this.cacophonyIndex.reduce(
        (highest: number, current: CacophonyIndex) => {
          return current.end_s > highest ? current.end_s : highest;
        },
        0
      );
      return highestEnd;
    },
    cacophonyIndexMin(): number {
      const minIndex = this.cacophonyIndex.reduce(
        (lowest: number, current: CacophonyIndex) => {
          return current.index_percent < lowest
            ? current.index_percent
            : lowest;
        },
        100
      );
      return minIndex;
    },
    cacophonyIndexMax(): number {
      const maxIndex = this.cacophonyIndex.reduce(
        (highest: number, current: CacophonyIndex) => {
          return current.index_percent > highest
            ? current.index_percent
            : highest;
        },
        0
      );
      return maxIndex;
    },
  },
  mounted() {
    Chart.register([
      LineElement,
      LineController,
      CategoryScale,
      LinearScale,
      PointElement,
    ]);
    new Chart(this.$refs[this.id] as HTMLCanvasElement, {
      type: "line",
      data: {
        labels: this.cacophonyIndex.map(({ time }) => time),
        datasets: [
          {
            label: "Cacophony Index",
            data: this.data,
            borderColor: (context: any) =>
              createGradient(
                context,
                this.simplify ? this.cacophonyIndexMin : 0,
                this.simplify ? this.cacophonyIndexMax : 100
              ),
            borderWidth: 4,
            stepped: "middle",
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            display: false,
          },
        },
        elements: {
          point: {
            radius: this.simplify ? 0 : 2,
          },
        },
        scales: {
          x: {
            ...(!this.simplify
              ? {
                  max: this.timeLimit,
                  min: 0,
                }
              : {}),
            display: !this.simplify,
            grid: {
              display: !this.simplify,
            },
          },
          y: {
            ...(!this.simplify
              ? {
                  max: 100,
                  min: 0,
                }
              : {}),
            display: !this.simplify,
            grid: {
              display: !this.simplify,
            },
          },
        },
      },
    });
  },
});
</script>
