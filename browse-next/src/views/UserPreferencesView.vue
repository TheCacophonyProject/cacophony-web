<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { CurrentUser } from "@models/LoggedInUser";
</script>
<template>
  <section-header>User preferences</section-header>
  <h6>Things that could appear here:</h6>
  <ul>
    <li>Change my email address</li>
    <li>Reset/change my password</li>
    <li>Edit my user name, real name?</li>
    <li>Review the End User Agreement?</li>
    <li>Show release info/changelog?</li>
    <li>Global transactional email settings</li>
  </ul>
</template>
