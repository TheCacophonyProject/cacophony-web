<template>
  <b-container class="sign-wrapper">
    <b-form-row class="align-items-center justify-content-center">
      <div class="sign-form-wrapper bg-white rounded text-center">
        <div class="logo" />

        <h2>Reset Password</h2>

        <b-form @submit="onSubmit">
          <b-alert
            :show="!!successMessage"
            variant="success"
            dismissible
            @dismissed="successMessage = undefined"
          >
            {{ successMessage }}
          </b-alert>

          <b-form-group
            label="Email"
            label-class="sr-only"
            label-for="input-username-or-email"
          >
            <b-form-input
              id="input-username-or-email"
              v-model="email"
              placeholder="Email Address"
              type="email"
              autocapitalize="none"
            />
          </b-form-group>
          <b-button
            :disabled="email === ''"
            type="submit"
            variant="primary"
            class="btn-block"
            >Reset Password
          </b-button>

          <b-row>
            <b-col>
              <p class="small mt-4" style="text-align: left">
                <b-link href="/login">Login here</b-link>.
              </p>
            </b-col>
            <b-col>
              <p class="small mt-4" style="text-align: right">
                <b-link href="/register">Register here</b-link>.
              </p>
            </b-col>
          </b-row>
        </b-form>
      </div>
    </b-form-row>
  </b-container>
</template>

<script lang="ts">
import User from "../api/User.api";

export default {
  name: "ResetPasswordView",
  props: {},
  data() {
    return {
      email: "",
      successMessage: null,
    };
  },
  computed: {},
  methods: {
    async onSubmit(evt) {
      this.successMessage = null;
      evt.preventDefault();
      const response = await User.reset(this.email);
      if (response.success) {
        this.successMessage = "An email has been sent to reset your password";
      } else {
        this.successMessage =
          "Password reset request failed, please try again later";
      }
    },
  },
};
</script>

<style scoped>
.sign-form-wrapper {
  max-width: 360px;
}
</style>
