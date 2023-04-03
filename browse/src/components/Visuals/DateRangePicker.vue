<template>
    <div class="date-range-picker">
      <label for="from-date">From:</label>
      <input type="date" id="from-date" v-model="fromDateValue" @input="updateFromDate">
  
      <label for="to-date">To:</label>
      <input type="date" id="to-date" v-model="toDateValue" @input="updateToDate">
    </div>
  </template>
  
  <script>
    export default {
      name: 'DateRangePicker',
      props: {
        fromDate: {
          type: String,
          required: true
        },
        toDate: {
          type: String,
          required: true
        }
    },
    computed: {
        fromDateValue: {
            get() {
                return this.fromDate;
            },
            set(value) {
                this.$emit('from-date-selected', value);
            }
        },
        toDateValue: {
            get() {
                return this.toDate;
            },
            set(value) {
                this.$emit('to-date-selected', value);
            }
        }
    },
    methods: {
        updateFromDate(event) {
            this.$emit('date-range-selected', {
                fromDate: event.target.value,
                toDate: this.toDate
            })
        },
        updateToDate(event) {
            this.$emit('date-range-selected', {
                fromDate: this.fromDate,
                toDate: event.target.value
            })
        }
    }
}
  </script>
  
  <style scoped>
    .date-range-picker {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
  
    label {
      margin-right: 10px;
    }
  
    input {
      padding: 5px;
      border: 1px solid #ccc;
      border-radius: 3px;
    }
  </style>
  