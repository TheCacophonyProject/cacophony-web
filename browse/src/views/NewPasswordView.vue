<template>
  <b-container class="sign-wrapper">
    <b-form-row class="align-items-center justify-content-center">
      <div class="sign-form-wrapper bg-white rounded text-center">
        <div class="logo" />

        <h1>Update Password</h1>
        <p>user</p>
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
            :state="!$v.form.password.$error"
            :invalid-feedback="passwordFeedback"
            label="Password"
            label-for="input-password"
          >
            <b-form-input
              id="input-password"
              v-model="$v.form.password.$model"
              :state="!$v.form.password.$error"
              type="password"
            />
          </b-form-group>

          <b-form-group
            :state="!$v.form.passwordConfirm.$error"
            :invalid-feedback="passwordConfirmFeedback"
            label="Retype password"
            label-for="input-password-retype"
          >
            <b-form-input
              v-model="$v.form.passwordConfirm.$model"
              :state="!$v.form.passwordConfirm.$error"
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
export default {
  name: "NewPasswordView",
  props: {},
  data() {
    return {
      token : "",
      usernameOrEmail: "",
      errorMessage: null,
    };
  },
  created() {
    this.queryUser();
  },
  computed: {
    token() {
      return  this.$route.query.token;
    }
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
      }
    },
  },
  methods: {
    async queryDevice() {
      const [groupResponse, deviceResponse] = await api.groups.getGroup(this.groupName)
    },
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
