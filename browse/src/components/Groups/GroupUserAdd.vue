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
      <b-form-group
        label-for="input-emailOrUserId"
        :label="
          isSuperUserAndViewingAsSuperUser ? 'User' : 'User email address'
        "
      >
        <b-form-input
          ref="input-emailOrUserId"
          id="input-emailOrUserId"
          @update="resetFormSubmission"
          v-model.trim="$v.form.emailOrUserId.$model"
          :state="emailState"
          aria-describedby="email-live-help email-live-feedback"
          type="text"
          autofocus
          class="input"
          data-cy="user-email-input"
          v-if="!isSuperUserAndViewingAsSuperUser"
        />
        <multiselect
          v-else
          v-model="form.emailOrUserId"
          :options="users"
          :placeholder="usersListLabel"
          :disabled="users.length === 0"
          @update="resetFormSubmission"
          track-by="id"
          label="display"
          id="input-username"
          aria-describedby="username-live-help username-live-feedback"
          data-cy="user-name-input"
        />

        <b-form-invalid-feedback id="username-live-feedback">
          {{ formErrorMessage }}
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
  emailOrUserId: null,
  isAdmin: false,
};

export default {
  name: "GroupUserAdd",
  props: {
    groupName: {
      type: String,
      required: true,
    },
    groupUsers: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      form: { ...initialFormState },
      formSubmissionFailed: false,
      formErrorMessage: null,
      users: [],
    };
  },
  computed: {
    emailIsEmpty() {
      return (
        !this.isSuperUserAndViewingAsSuperUser &&
        (this.$v.form.emailOrUserId.$model === null ||
          this.$v.form.emailOrUserId.$model.trim() === "")
      );
    },
    emailState() {
      if (this.emailIsEmpty) {
        return null;
      }
      if (this.formSubmissionFailed) {
        return false;
      }
      return !this.$v.form.emailOrUserId.$error;
    },
    isDisabled() {
      return this.usernameIsEmpty;
    },
    isSuperUserAndViewingAsSuperUser(): boolean {
      return (
        this.$store.state.User.userData.isSuperUser && shouldViewAsSuperUser()
      );
    },
    thisUserId() {
      return this.$store.state.User.userData.id;
    },
    usersListLabel() {
      if (this.isSuperUserAndViewingAsSuperUser) {
        return "select a user";
      }
      return "enter a user email address";
    },
  },
  validations: {
    form: {
      emailOrUserId: {
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
        // If we're adding ourselves, and we're not a super-user, and we're
        // already an admin user, and we're trying to downgrade ourselves to
        // a regular user *and* we're the last admin in the group, we should warn.
        const userToAdd =
          (!this.isSuperUserAndViewingAsSuperUser && this.form.emailOrUserId) ||
          this.form.emailOrUserId.id;
        if (
          !this.isSuperUserAndViewingAsSuperUser &&
          userToAdd === this.thisUserId &&
          !this.form.isAdmin &&
          this.groupUsers.length === 1 &&
          this.groupUsers[0].id === this.thisUserId
        ) {
          this.formSubmissionFailed = true;
          this.formErrorMessage =
            "The last user cannot remove their admin status";
          return;
        }
        const result = await api.groups.addGroupUser(
          this.groupName,
          userToAdd,
          this.form.isAdmin,
        );
        if (!result.success) {
          this.formErrorMessage = "The email address couldn't be found";
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
      this.$refs["input-emailOrUserId"] &&
        this.$refs["input-emailOrUserId"].focus();
    },
    async initUsersList() {
      if (this.isSuperUserAndViewingAsSuperUser) {
        const usersListResponse = await User.list();
        if (usersListResponse.success) {
          this.users = usersListResponse.result.usersList.map(
            ({ userName, id, email }) => ({
              name: userName,
              display: `${userName} ${email && `<${email}>`}`,
              email,
              id,
            }),
          );
        }
      }
    },
  },
  async mounted() {
    await this.initUsersList();
  },
};
</script>
