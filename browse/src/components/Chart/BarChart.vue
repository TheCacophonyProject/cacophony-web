<template>
  <div class="chart-wrapper">
    <h2 v-if="message" class="message">{{ message }}</h2>
    <canvas :id="id" />
  </div>
</template>

<script lang="ts">
import {
  Chart,
  ChartData,
  ChartConfiguration,
  ActiveElement,
  ChartEvent,
  registerables,
} from "chart.js";
import { log10 } from "chart.js/helpers";

export default {
  name: "BarChart",
  props: {
    title: {
      type: String,
      default: "Title",
    },
    xAxisLabel: {
      type: String,
      default: "x Axis Label",
    },
    yAxisLabel: {
      type: String,
      default: "y Axis Label",
    },
    data: {
      type: Object,
      required: true,
    },
    log: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      default: null,
    },
  },
  data() {
    return {
      id: "bar-chart",
      chart: null,
    };
  },
  computed: {
    chartData: function (): ChartConfiguration {
      return {
        type: "bar",
        data: this.data as ChartData,
        options: {
          responsive: true,
          scales: {
            y: {
              title: this.yAxisLabel,
              type: this.log ? "logarithmic" : "linear",
              beginAtZero: true,
              min: 0,
              ticks: {
                callback: (tick: number) => {
                  if (this.log) {
                    var remain = tick / Math.pow(10, Math.floor(log10(tick)));
                    if (remain === 1 || remain === 2 || remain === 5) {
                      return tick;
                    }
                    return "";
                  } else {
                    return tick;
                  }
                },
              },
              display: true,
            },
            x: {
              title: this.xAxisLabel,
              display: true,
            },
          },
          plugins: {
            title: {
              text: this.title,
              display: true,
            },
            legend: {
              display: false,
            },
          },
          maintainAspectRatio: false,
          onClick: (event: ChartEvent, chartItems: ActiveElement[], chart) => {
            // Send click event if a bar is clicked on
            this.$emit("click", chart.tooltip.title);
          },
          onHover: (event: ChartEvent, chartItems: ActiveElement[]) => {
            if (chartItems.length > 0) {
              // Change pointer when hovering over a bar
              (event.native.target as HTMLCanvasElement).style.cursor =
                "pointer";
            } else {
              (event.native.target as HTMLCanvasElement).style.cursor =
                "default";
            }
          },
        },
      };
    },
  },
  mounted() {
    Chart.register(...registerables);
    const ctx = document.getElementById(this.id) as HTMLCanvasElement;
    this.chart = new Chart(ctx, this.chartData);
  },
};
</script>
<style scoped>
.message {
  position: absolute;
  height: 50%;
  width: 50%;
  padding-top: 12%;
  margin: 15% 25%;
  text-align: center;
  background: white;
  color: darkgrey;
}
.chart-wrapper {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
