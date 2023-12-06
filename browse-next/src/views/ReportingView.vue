<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { ref, onMounted } from "vue";
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core'
import Chart from "chart.js/auto";

const pieChart = ref(null);
const lineChart = ref(null);
const barChart = ref(null);

function renderLineChart() {
  const ctx = lineChart.value.getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      datasets: [
        {
          label: "Visits Trend",
          data: [12, 18, 13, 20, 15, 22],
          borderColor: "#6ca070",
          backgroundColor: "transparent",
          pointBackgroundColor: "#6ca070",
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          display: false
        },
      },
    },
  });
}

function renderPieChart() {
  const ctx = pieChart.value.getContext("2d");
  new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Possums", "Rats", "Cats"],
      datasets: [
        {
          label: "Animal Breakdown",
          data: [25, 40, 35],
          backgroundColor: ["#355e3b", "#6ca070", "#aac997"],
          hoverOffset: 4,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });
}

function renderBarChart() {
  const ctx = barChart.value.getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [
        {
          label: "Battery Life",
          data: [80, 85, 70, 90, 75, 95, 85], 
          backgroundColor: ["#355e3b", "#6ca070", "#aac997", "#355e3b", "#6ca070", "#aac997", "#355e3b"], // Use the same colors as other graphs
          borderWidth: 1,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });
}
onMounted(() => {
  renderPieChart();
  renderLineChart();
  renderBarChart();
});
</script>
<template>
  <div>
    <section-header>Exports and long-term trend analysis</section-header>
    <div class="graphContainer">
      <div class="graph1">
        <h5>Animal Breakdown</h5>
        <div class="graph1Container">
          <canvas class="animalBreakdownChart" ref="pieChart"></canvas>
        </div>
      </div>
      <div class="graph2">
        <h5>Project Engagement</h5>
        <div class="graph2Container">
          <div class="totalUsers">
            <div class="iconContainer1">
              <font-awesome-icon :icon="['fas', 'user']" />
            </div>
            <h2>237</h2>
            <h6>Total Users</h6>
          </div>
          <div class="newUsers">
            <div class="iconContainer2">
              <font-awesome-icon :icon="['fas', 'plus']" />
            </div>
            <h2>12</h2>
            <h6>New Users</h6>
          </div>
          <div class="projectReach">
            <div class="iconContainer3">
              <font-awesome-icon :icon="['fas', 'link']" />
            </div>
            <h2>37</h2>
            <h6>Project Reach</h6>
          </div>
        </div>
      </div>
      <div class="graph3">
        <h5>Visits Trend</h5>
        <div class="graph3Container">
          <canvas class="visitsTrendChart" ref="lineChart"></canvas>
        </div>
      </div>
      <div class="graph4">
        <h5>Battery Life</h5>
        <div class="graph4Container">
          <canvas class="batteryLifeChart" ref="barChart"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.graphContainer {
  display: grid;
  grid-template-areas: "graph-1 graph-2" "graph-3 graph-4";
  grid-template-columns: 1fr 2fr;
}

.graph1,
.graph3 {
  grid-area: graph-1;
  margin-right: 0.3rem;
}

.graph2,
.graph4 {
  grid-area: graph-2;
  margin-left: 0.3rem;
}

.graph1 h5,
.graph2 h5 {
  padding-bottom: 0.4rem;
}

.graph3 {
  grid-area: graph-3;
}

.graph4 {
  grid-area: graph-4;
}

.graph1,
.graph2,
.graph3,
.graph4 {
  border-radius: 0.4rem;
  background-color: white;
  color: #0e122b;
  padding: 1rem;
  margin-bottom: 0.6rem;
}

.animalBreakdownChart {
  width: 200px;
  height: 200px;
}

.graph1Container {
  display: flex;
  padding: 0 4rem;
}

.graph2Container {
  display: flex;
}

.graph3Container {
  height: 34vh;
}

.graph4Container {
  display: flex; 
  justify-content: center;
  height: 16rem;
}

.totalUsers,
.newUsers,
.projectReach {
  border-radius: 0.3rem;
  padding: 0.5rem;
  padding-top: 1.5rem;
  margin: 1rem;
  border-style: solid;
  border-color: rgb(204, 204, 204);
  flex: 1;
  text-align: center;
}

.iconContainer1,
.iconContainer2,
.iconContainer3 {
  border-radius: 0.5rem;
  color: whitesmoke;
  font-size: 3rem;
  margin: 0px 4rem;
  margin-bottom: 1rem;
}

.iconContainer1 {
  background-color: #355e3b;
}

.iconContainer2 {
  background-color: #6ca070;
}

.iconContainer3 {
  background-color: #aac997;
}
</style>
