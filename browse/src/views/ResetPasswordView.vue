<template>
  <b-container class="sign-wrapper">
    <b-form-row class="align-items-center justify-content-center">
      <div class="sign-form-wrapper bg-white rounded text-center">
        <div class="logo" />

        <h1>Login</h1>

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

          </b-form-group>

          <b-button
            :disabled="usernameOrEmail === '' || loggingIn"
            type="submit"
            variant="primary"
            class="btn-block"
            >Sign in
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
export default {
  name: "ResetPasswordView",
  props: {},
  data() {
    return {
      usernameOrEmail: "",
      errorMessage: null,
    };
  },
  computed: {},
  methods: {
    async onSubmit(evt) {
      this.errorMessage = null;
      evt.preventDefault();

      const response = await this.$store.dispatch("User/RESET", {
        username: this.usernameOrEmail,
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
