<template>
  <b-container class="sign-wrapper">
    <b-form-row class="align-items-center justify-content-center">
      <div class="sign-form-wrapper bg-white rounded text-center">
        <div class="logo" />

        <h2>Login</h2>

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
            label="Username or Email"
            label-class="sr-only"
            label-for="input-username-or-email"
          >
            <b-form-input
              id="input-username-or-email"
              v-model="usernameOrEmail"
              placeholder="Username or Email Address"
              type="text"
              autocapitalize="none"
            />
          </b-form-group>

          <b-form-group
            label="Password"
            label-class="sr-only"
            label-for="input-password"
          >
            <b-form-input
              id="input-password"
              v-model="password"
              placeholder="Password"
              type="password"
            />
          </b-form-group>

          <b-button
            :disabled="usernameOrEmail === '' || password === '' || loggingIn"
            type="submit"
            variant="primary"
            class="btn-block"
            >Sign in
          </b-button>
          <b-row>
            <b-col>
              <p class="small mt-4">
                <b-link href="/register">Register here</b-link>.
              </p>
            </b-col>
            <b-col>
              <p class="small mt-4">
                <b-link href="/forgot">Forgot password?</b-link>
              </p>
            </b-col>
          </b-row>
        </b-form>
      </div>
    </b-form-row>
  </b-container>
</template>

<script lang="ts">
export default {
  name: "LoginView",
  props: {},
  data() {
    return {
      usernameOrEmail: "",
      password: "",
      errorMessage: null,
      loggingIn: false,
    };
  },
  computed: {},
  methods: {
    async onSubmit(evt) {
      this.loggingIn = true;
      this.errorMessage = null;
      evt.preventDefault();

      const response = await this.$store.dispatch("User/LOGIN", {
        username: this.usernameOrEmail,
        password: this.password,
      });
      if (response.success) {
        if (this.$store.getters["User/isLoggedIn"]) {
          console.log("Redirect to", this.$route.query.nextUrl);
          if (this.$route.query.nextUrl) {
            await this.$router.push(this.$route.query.nextUrl);
          } else {
            this.$router.go("home");
          }
        }
      } else {
        this.errorMessage =
          response.result.messages.length && response.result.messages[0];
      }
      this.loggingIn = false;
    },
  },
};
</script>

<style scoped>
.sign-form-wrapper {
  max-width: 360px;
}
</style>
