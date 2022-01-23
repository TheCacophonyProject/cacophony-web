<template>
  <div class="export-visits">
    <b-modal v-model="isExportingCSV" title="Export Visits CSV" hide-footer>
      <div v-if="!exportInProgress">
        <label :for="'export-from-date'">Export from</label>
        <b-form-datepicker
          id="export-from-date"
          v-model="exportFrom"
          :max="new Date()"
          class="mb-2"
        ></b-form-datepicker>
        <label :for="'export-to-date'">Until</label>
        <b-form-datepicker
          id="export-to-date"
          :min="minDate"
          :max="new Date()"
          v-model="exportTo"
          class="mb-2"
        ></b-form-datepicker>
        <b-btn
          :disabled="exportTo === null || exportFrom === null"
          @click="exportCSV"
        >
          Export
        </b-btn>
      </div>
      <div v-else>
        <b-progress :value="exportProgress * 100" :max="100" />
      </div>
    </b-modal>
    <b-button class="export-visits" @click="exportVisits">
      <font-awesome-icon icon="download" class="fa-1x" />
      <span
        >Export
        <span class="d-none d-md-inline-block"> Visits for TrapNZ</span></span
      >
    </b-button>
  </div>
</template>

<script lang="ts">
import { startOfDay, startOfEvening, toNZDateString } from "@/helpers/datetime";
import api from "@api";
import { getTrapNzSpecies } from "@/const";
import { MonitoringRequest } from "@typedefs/api/monitoring";
import { GroupId, IsoFormattedDateString } from "@typedefs/api/common";

const formatDate = (value) => {
  const date = new Date(value);
  return `${toNZDateString(date)} ${date.toTimeString().substring(0, 8)}`;
};

interface ExportVisitsData {
  exportInProgress: boolean;
  exportFrom: null | IsoFormattedDateString;
  exportTo: null | IsoFormattedDateString;
  isExportingCSV: boolean;
  exportProgress: number;
  groupId: null | GroupId;
}

export default {
  name: "ExportVisits",
  data(): ExportVisitsData {
    return {
      exportInProgress: false,
      exportFrom: null,
      exportTo: null,
      isExportingCSV: false,
      exportProgress: 0,
      groupId: null,
    };
  },
  props: {
    groupName: {
      type: String,
      required: false,
    },
    groups: {
      type: Array,
      required: false,
    },
    devices: {
      type: Array,
      required: false,
    },
    deviceId: {
      type: Number,
      required: false,
    },
  },
  async created() {
    if (this.groupName) {
      const groupResponse = await api.groups.getGroup(this.groupName);
      if (groupResponse.success) {
        this.groupId = groupResponse.result.group.id;
      }
    }
  },
  computed: {
    minDate(): Date {
      const oneDayAfterFrom = startOfDay(new Date(this.exportFrom));
      oneDayAfterFrom.setDate(oneDayAfterFrom.getDate() + 1);
      return this.exportFrom && oneDayAfterFrom;
    },
    groupIds(): number[] {
      if (this.groups && this.groups.length !== 0) {
        return this.groups;
      }
      if (this.groupId) {
        return [this.groupId];
      }
      return [];
    },
    deviceIds(): number[] {
      if (this.devices && this.devices.length !== 0) {
        return this.devices;
      } else if (this.deviceId) {
        return [this.deviceId];
      }
      return [];
    },
  },
  methods: {
    async exportCSV() {
      this.exportInProgress = true;
      this.exportProgress = 0;

      // Call API and process results
      const exportTo = new Date(this.exportTo);
      exportTo.setHours(12);
      const to = startOfEvening(exportTo);
      const exportFrom = new Date(this.exportFrom);
      exportFrom.setHours(12);
      const from = startOfEvening(exportFrom);

      const visitQuery: MonitoringRequest = {
        from: from.toISOString(),
        to: to.toISOString(),
      };
      if (this.groupIds && this.groupIds.length !== 0) {
        visitQuery.group = this.groupIds;
      } else {
        visitQuery.device = this.deviceIds;
      }

      const results = await api.monitoring.getAllVisits(
        visitQuery,
        undefined,
        (val) => (this.exportProgress = val)
      );
      const rows = results.filteredVisits.map((visit) => [
        visit.stationId ? visit.station : visit.device,
        formatDate(visit.timeStart),
        formatDate(visit.timeEnd),
        visit.classification,
        visit.classificationAi,
        !visit.classFromUserTag,
        getTrapNzSpecies(visit.classification),
        "cacophony",
        `${visit.classFromUserTag ? "User tagged: " : "AI tagged: "} ${
          visit.classification
        }`,
      ]);
      const header =
        "station,start_date,end_date,class,ai_class,is_ai_tagged,species,recorded_by,notes\n";
      const csvVisits = rows.map((e) => e.join(",")).join("\n");

      let exportType;
      if (this.groupName) {
        exportType = this.groupName;
      } else {
        exportType = `device-${this.deviceIds[0]}`;
      }

      this.createExport(
        header + csvVisits,
        `visits-${exportType}-${from.toLocaleDateString()}-${to.toLocaleDateString()}.csv`
      );
      this.isExportingCSV = false;
      this.exportInProgress = false;
      this.exportProgress = 0;
    },
    createExport(csvFormattedString: string, fileName: string) {
      const blob = new Blob([csvFormattedString], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        // feature detection
        // Browsers that support HTML5 download attribute
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    exportVisits() {
      this.isExportingCSV = true;
      return;
    },
  },
};
</script>
