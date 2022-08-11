<template>
  <div>
    <b-modal
      v-model="changeUserName"
      title="Change your display name"
      @ok="alterUserName"
    >
      <b-form-group label="New display name">
        <b-input
          type="text"
          v-model="newUserName"
          placeholder="New display name"
        />
      </b-form-group>
    </b-modal>
    <h3>Your details</h3>
    <dl>
      <dt>Your display name</dt>
      <dd id="username">
        <span>{{ userName }}</span>
        <b-btn @click="updateUserName" size="sm" variant="transparent"
          ><font-awesome-icon icon="pencil-alt" size="xs" color="#666"
        /></b-btn>
      </dd>
      <dt>Email</dt>
      <dd id="email">{{ email }}</dd>
    </dl>
  </div>
</template>

<script>
import { mapState } from "vuex";

export default {
  name: "HomeUser",
  data() {
    return {
      changeUserName: false,
      newUserName: this.userName,
    };
  },
  methods: {
    updateUserName() {
      this.changeUserName = true;
      this.newUserName = this.userName;
    },
    async alterUserName() {
      await this.$store.dispatch("User/UPDATE", { userName: this.newUserName });
      this.newUserName = "";
    },
  },
  computed: mapState({
    user: (state) => state.User,
    userName: (state) => state.User.userData.userName,
    email: (state) => state.User.userData.email,
  }),
};
</script>

<style scoped>
#username {
  vertical-align: baseline;
}
#username span {
  display: inline-block;
  line-height: 100%;
  vertical-align: middle;
}
</style>
