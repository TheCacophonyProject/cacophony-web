<template>
  <b-modal
    id="group-user-add"
    title="Add user to group"
    @ok="addUser"
    @shown="setFocusAndReset"
    ok-title="Add"
    :ok-disabled="isDisabled"
  >
    <b-form @submit="addUser" data-cy="add-user-form">
      <b-form-group label-for="input-username" label="Username">
        <b-form-input
          ref="input-username"
          id="input-username"
          @update="resetFormSubmission"
          v-model.trim="$v.form.username.$model"
          :state="usernameState"
          aria-describedby="username-live-help username-live-feedback"
          type="text"
          autofocus
          class="input"
          data-cy="user-name-input"
          v-if="!isSuperUserAndViewingAsSuperUser"
        />
        <multiselect
          v-else
          v-model="form.username"
          :options="users"
          :placeholder="usersListLabel"
          :disabled="users.length === 0"
          @update="resetFormSubmission"
          track-by="id"
          label="name"
          id="input-username"
          aria-describedby="username-live-help username-live-feedback"
          data-cy="user-name-input"
        />

        <b-form-invalid-feedback id="username-live-feedback">
          This username couldn't be found.
        </b-form-invalid-feedback>

        <b-form-text id="username-live-help">
          Users can view recordings for the devices associated with this group.
        </b-form-text>
      </b-form-group>

      <b-form-group>
        <b-form-checkbox
          id="input-user-admin"
          v-model="$v.form.isAdmin.$model"
          plain
          value="true"
          unchecked-value="false"
        >
          Make this user an administrator
        </b-form-checkbox>
        <b-form-text id="input-user-admin-help">
          Administrators can add and remove users from this group.
        </b-form-text>
      </b-form-group>
    </b-form>
  </b-modal>
</template>

<script lang="ts">
import { required } from "vuelidate/lib/validators";
import api from "@/api";
import User from "@api/User.api";
import { shouldViewAsSuperUser } from "@/utils";
import { superUserCreds } from "@/components/NavBar.vue";

const initialFormState = {
  username: null,
  isAdmin: false,
};

export default {
  name: "GroupUserAdd",
  props: {
    groupName: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      form: { ...initialFormState },
      formSubmissionFailed: false,
      users: [],
    };
  },
  computed: {
    usernameIsEmpty() {
      return (
        !this.isSuperUserAndViewingAsSuperUser &&
        (this.$v.form.username.$model === null ||
          this.$v.form.username.$model.trim() === "")
      );
    },
    usernameState() {
      if (this.usernameIsEmpty) {
        return null;
      }
      if (this.formSubmissionFailed) {
        return false;
      }
      return !this.$v.form.username.$error;
    },
    isDisabled() {
      return this.usernameIsEmpty;
    },
    isSuperUserAndViewingAsSuperUser(): boolean {
      return (
        this.$store.state.User.userData.isSuperUser && shouldViewAsSuperUser()
      );
    },
    usersListLabel() {
      if (this.isSuperUserAndViewingAsSuperUser) {
        return "select a user";
      }
      return "enter a username";
    },
  },
  validations: {
    form: {
      username: {
        required,
      },
      isAdmin: {},
    },
  },
  methods: {
    superUserName() {
      const creds = superUserCreds();
      return creds && creds.userName;
    },
    resetFormSubmission() {
      this.formSubmissionFailed = false;
    },
    addUser: async function (event) {
      event.preventDefault();
      if (!this.$v.$invalid) {
        const result = await api.groups.addGroupUser(
          this.groupName,
          (this.isSuperUserAndViewingAsSuperUser && this.form.username.name) ||
            this.form.username,
          this.form.isAdmin
        );
        if (!result.success) {
          this.formSubmissionFailed = true;
        } else {
          // We can emit that a user was added to the group:
          this.$bvModal.hide("group-user-add");
          this.$emit("user-added-to-group");
        }
      }
    },
    setFocusAndReset() {
      this.form = { ...initialFormState };
      this.$refs["input-username"] && this.$refs["input-username"].focus();
    },
    async initUsersList() {
      if (this.isSuperUserAndViewingAsSuperUser) {
        const usersListResponse = await User.list();
        if (usersListResponse.success) {
          this.users = usersListResponse.result.usersList
            .map(({ userName, id }) => ({
              name: userName,
              id,
            }))
            .filter(({ name }) => name !== this.superUserName());
        }
      }
    },
  },
  async mounted() {
    await this.initUsersList();
  },
};
</script>
