<template>
  <div>
    <h3>Your details</h3>

    <dl>
      <dt>Username</dt>
      <dd id="username">{{ userName }}</dd>
      <dt v-if="firstName">First name</dt>
      <dd v-if="firstName" id="firstname">{{ firstName }}</dd>
      <dt v-if="lastName">Last name</dt>
      <dd v-if="lastName" id="lastname">{{ lastName }}</dd>
      <dt>Email</dt>
      <dd id="email">{{ email }}</dd>
    </dl>
  </div>
</template>

<script>
import { mapState } from "vuex";

export default {
  name: "HomeUser",
  computed: mapState({
    user: (state) => state.User,
    userName: (state) => state.User.userData.userName,
    firstName: (state) => state.User.userData.firstName,
    lastName: (state) => state.User.userData.lastName,
    email: (state) => state.User.userData.email,
  }),
};
</script>

<style scoped></style>
