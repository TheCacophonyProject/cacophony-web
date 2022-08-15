<template>
  <b-container class="sign-wrapper">
    <b-form-row class="align-items-center justify-content-center">
      <div class="sign-form-wrapper bg-white rounded text-center">
        <div class="logo" />

        <h2>New Password</h2>
        <h2>{{ userName }}</h2>
        <b-form @submit="onSubmit">
          <b-alert
            :show="!!errorMessage"
            variant="danger"
            dismissible
            @dismissed="errorMessage = undefined"
          >
            {{ errorMessage }}
          </b-alert>
          <b-form-group
            :state="getState($v.form.password)"
            :invalid-feedback="passwordFeedback"
            label="Password"
            autocomplete="off"
            label-for="input-password"
          >
            <b-form-input
              id="input-password"
              v-model="$v.form.password.$model"
              :state="getState($v.form.password)"
              autocomplete="new-password"
              type="password"
            />
          </b-form-group>

          <b-form-group
            :invalid-feedback="passwordConfirmFeedback"
            :state="getState($v.form.passwordConfirm)"
            label="Retype password"
            label-for="input-password-retype"
          >
            <b-form-input
              v-model="$v.form.passwordConfirm.$model"
              :state="getState($v.form.passwordConfirm)"
              autocomplete="new-password"
              type="password"
            />
          </b-form-group>
          <b-button
            :disabled="$v.form.$invalid"
            type="submit"
            class="btn-block"
            variant="primary"
            >Change Password
          </b-button>

          <p class="small mt-4 text-center">
            Already registered? <b-link href="/login">Login here</b-link>.
          </p>
        </b-form>
      </div>
    </b-form-row>
  </b-container>
</template>

<script lang="ts">
import User from "../api/User.api";
import { minLength, required, sameAs } from "vuelidate/lib/validators";
import { ErrorResult } from "@/api/Recording.api";

const passwordLength = 8;

export default {
  name: "NewPasswordView",
  props: {},
  data() {
    return {
      errorMessage: null,
      user: null,
      form: {
        password: "",
        passwordConfirm: "",
      },
    };
  },
  created() {
    this.queryUser();
  },
  computed: {
    userName() {
      if (!this.user) {
        return "";
      }
      return this.user.userName;
    },
    token() {
      return this.$route.query.token;
    },
    passwordFeedback() {
      if (this.$v.form.password.$invalid) {
        return `Minimum password length is ${passwordLength} characters`;
      }
      return null;
    },
    passwordConfirmFeedback() {
      if (this.$v.form.passwordConfirm.$invalid) {
        return `Must match password`;
      }
      return null;
    },
  },
  validations: {
    form: {
      password: {
        required,
        minLength: minLength(passwordLength),
      },
      passwordConfirm: {
        required,
        sameAsPassword: sameAs("password"),
      },
    },
  },
  methods: {
    getState(formItem) {
      if (!formItem.$anyDirty) {
        return null;
      }
      return !formItem.$error;
    },
    async queryUser() {
      const response = await User.validateToken(this.token);
      if (response.success) {
        this.user = response.result.userData;
      } else {
        this.errorMessage =
          (response.result as ErrorResult).messages.length &&
          (response.result as ErrorResult).messages[0];
        setTimeout(() => this.$router.replace({ path: "/" }), 5000);
      }
    },
    async onSubmit(evt) {
      this.errorMessage = null;
      evt.preventDefault();

      const response = await this.$store.dispatch("User/CHANGE_PASSWORD", {
        token: this.token,
        password: this.$v.form.password.$model,
      });
      if (response.success) {
        if (this.$store.getters["User/isLoggedIn"]) {
          if (this.$route.query.nextUrl) {
            await this.$router.push(this.$route.query.nextUrl);
          } else {
            this.$router.replace("/");
          }
        }
      } else {
        this.errorMessage =
          response.result.messages.length && response.result.messages[0];
        setTimeout(() => this.$router.push({ path: "/" }), 5000);
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
