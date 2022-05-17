<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { CurrentUser} from "@models/LoggedInUser";
</script>
<template>
  <section-header>User preferences</section-header>
  <p>
    {{ CurrentUser }}
  </p>
  <p>Change my email address</p>
  <p>Reset/change my password</p>
  <p>Edit my user name, real name?</p>
  <p>Review the End User Agreement?</p>
  <p>Show release info/changelog?</p>
</template>
