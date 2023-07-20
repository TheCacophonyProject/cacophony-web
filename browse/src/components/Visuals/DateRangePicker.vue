<template>
  <div class="date-range-picker">
    <label for="from-date" class="date-label">From:</label>
    <input
      type="date"
      id="from-date"
      class="form-control from-date-input"
      v-model="fromDateValue"
      @input="updateFromDate"
    />
    <label for="to-date" class="date-label">To:</label>
    <input
      type="date"
      id="to-date"
      class="form-control"
      v-model="toDateValue"
      @input="updateToDate"
    />
  </div>
</template>

<script>
export default {
  name: "DateRangePicker",
  props: {
    fromDate: {
      type: Date,
      required: true,
    },
    toDate: {
      type: Date,
      required: true,
    },
  },
  data() {
    return {
      fromDateValue: null,
      toDateValue: null,
    };
  },
  created() {
    this.fromDateValue = this.formatDate(this.fromDate);
    this.toDateValue = this.formatDate(this.toDate);
  },
  methods: {
    formatDate(date) {
      const month = ("0" + (date.getMonth() + 1)).slice(-2);
      const day = ("0" + date.getDate()).slice(-2);
      var dateString = date.getFullYear() + "-" + month + "-" + day;

      return dateString;
    },
    updateFromDate(event) {
      this.$emit("update:fromDate", new Date(event.target.value));
    },
    updateToDate(event) {
      this.$emit("update:toDate", new Date(event.target.value));
    },
  },
};
</script>

<style scoped>
.date-range-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.from-date-input {
  margin-right: 10px;
}

input {
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 3px;
}

.date-label {
  margin-right: 10px;
  padding-top: 6px;
}
</style>
