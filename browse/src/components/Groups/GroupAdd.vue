<template>
  <b-modal
    id="group-add"
    title="Create group"
    ok-title="Create"
    @shown="reset"
    @ok="addNewGroup"
    :ok-disabled="isDisabled"
  >
    <b-form @submit="addNewGroup">
      <b-form-group
        :state="groupState"
        :invalid-feedback="groupNameInvalidFeedback"
        label-for="input-groupname"
        label="Group name"
      >
        <b-form-input
          ref="input-groupname"
          id="input-groupname"
          :state="groupState"
          @update="resetFormSubmission"
          v-model="$v.form.groupName.$model"
          type="text"
          autofocus
        />
      </b-form-group>
    </b-form>
  </b-modal>
</template>

<script lang="ts">
import { minLength, required } from "vuelidate/lib/validators";
import api from "@api";

const groupNameMinLength = 3;

export default {
  name: "GroupAdd",
  data() {
    return {
      form: {
        groupName: "",
      },
      formSubmissionFailed: false,
      formSubmissionFailedMessage: "",
    };
  },
  computed: {
    groupState() {
      if (
        this.$v.form.groupName.$model === null ||
        this.$v.form.groupName.$model === ""
      ) {
        return null;
      }
      if (this.formSubmissionFailed) {
        return false;
      }
      return !this.$v.form.groupName.$error;
    },
    groupNameInvalidFeedback() {
      if (this.$v.form.groupName.$invalid) {
        return `Group name must be at least ${groupNameMinLength} characters`;
      } else if (this.formSubmissionFailed) {
        return this.formSubmissionFailedMessage;
      }
      return null;
    },
    isDisabled() {
      return this.$v.form.$invalid;
    },
  },
  validations: {
    form: {
      groupName: {
        required,
        minLength: minLength(groupNameMinLength),
      },
    },
  },
  methods: {
    resetFormSubmission() {
      this.formSubmissionFailed = false;
    },
    addNewGroup: async function (event) {
      event.preventDefault();

      if (!this.$v.$invalid) {
        const groupName = this.$v.form.groupName.$model;
        const addGroupResponse = await api.groups.addNewGroup(groupName);
        if (addGroupResponse.success === true) {
          // Go to the added group
          await this.$router.push(`/groups/${groupName}`);
        } else {
          this.formSubmissionFailed = true;
          if (
            addGroupResponse.status === 422 &&
            addGroupResponse.result.errorType === "validation"
          ) {
            this.formSubmissionFailedMessage =
              "Invalid group name: group name must only contain letters, numbers, dash, underscore and space.  It must contain at least one letter";
          } else {
            this.formSubmissionFailedMessage =
              addGroupResponse.result.messages.length &&
              addGroupResponse.result.messages[0];
          }
        }
      }
    },
    reset() {
      this.form = {
        groupName: null,
      };
      this.$refs["input-groupname"].focus();
    },
  },
};
</script>
