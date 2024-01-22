<script setup lang="ts">
import SectionHeader from "@/components/SectionHeader.vue";
import { computed, ref, onMounted} from "vue";
import { useRoute } from "vue-router";
import { updateUserOnboarding, getUserOnboarding } from "@/api/User";
import Shepherd from "shepherd.js";
import { offset } from "@floating-ui/dom";
import "shepherd.js/dist/css/shepherd.css";

const route = useRoute();
const activeTabName = computed(() => {
  return route.name;
});
const shownUserManageProjectOnboarding = ref<boolean>(false);

const navLinkClasses = ["nav-item", "nav-link", "border-0"];


const getUserManageProjectOnboardingStatus = async () => {
  try {
    const result = await getUserOnboarding();
    const onboardTrackingData = result || {};
    return onboardTrackingData.result.onboardTracking.manage_project;
  } catch (error) {
    console.error("Error getting user onboarding data", error);
    return false;
  }
};

const SHEPHERD_NEXT_PREV_BUTTONS = [
  {
    action(): any {
      return (this as any).back();
    },
    classes: "shepherd-button-secondary",
    text: "Back",
  },
  {
    action(): any {
      return (this as any).next();
    },
    text: "Next",
  },
];

const tour = new Shepherd.Tour({
  useModalOverlay: true,
  defaultStepOptions: {
    classes: "shepherd-theme-arrows",
    scrollTo: true,
  },
});

onMounted(async () => {
  shownUserManageProjectOnboarding.value = await getUserManageProjectOnboardingStatus();
  initManageProjectTour();
});

const initManageProjectTour = () => {
  if (!shownUserManageProjectOnboarding.value) {
    tour.addStep({
      title: `Welcome to your Dashboard`,
      text: `The dashboard gives you an overview of the animal visits from your devices within the group. 
    Each group can host multiple devices which have their own associated recordings`,
      classes: "shepherd-custom-content",
      buttons: SHEPHERD_NEXT_PREV_BUTTONS,
    });
    tour.addStep({
      attachTo: {
        element: document.querySelector(
          ".project-visits-summary-section"
        ) as HTMLElement,
        on: "top",
      },
      title: "1/3",
      text: `This is yor visits summary - it highlights the animal visits across a time period, with location and timestamped information`,
      buttons: SHEPHERD_NEXT_PREV_BUTTONS,
      modalOverlayOpeningPadding: 6,
      modalOverlayOpeningRadius: 4,
      floatingUIOptions: {
        middleware: [offset({ mainAxis: 30, crossAxis: 0 })],
      },
    });
    tour.addStep({
      attachTo: {
        element: document.querySelector(
          ".species-summary-heading"
        ) as HTMLElement,
        on: "bottom",
      },
      title: "2/3",
      text: `This is your species overview - gives you a breakdown on species over the specified period.`,
      buttons: SHEPHERD_NEXT_PREV_BUTTONS,
      modalOverlayOpeningPadding: 6,
      modalOverlayOpeningRadius: 4,
      floatingUIOptions: {
        middleware: [offset({ mainAxis: 0, crossAxis: 50 })],
      },
    });
    tour.addStep({
      attachTo: {
        element: document.querySelector(
          ".stations-summary-heading"
        ) as HTMLElement,
        on: "right",
      },
      title: "3/3",
      text: "This is your stations summary",
      buttons: [
        {
          action(): any {
            return (this as any).back();
          },
          classes: "shepherd-button-secondary",
          text: "Back",
        },
        {
          action(): any {
            window.localStorage.setItem("show-onboarding", "false");
            return (this as any).complete();
          },
          text: "Finish",
        },
      ],
      modalOverlayOpeningPadding: 6,
      modalOverlayOpeningRadius: 4,
      floatingUIOptions: {
        middleware: [offset({ mainAxis: -100, crossAxis: -120 })],
      },
    });
    tour.on("cancel", () => {
      window.localStorage.setItem("show-onboarding", "false");
    });
    tour.start();
    updateUserOnboarding({ settings: { onboardTracking: { manage_project: true } } })
      .then((response) => {
        console.log("Locations onboarding data updated successfully", response);
      })
      .catch((error) => {
        console.error("Error updating locations onboarding data", error);
      });
  }
};

</script>
<template>
  <section-header>Manage project</section-header>
  <div class="px-3 p-md-0">
    <p>
      Administrate project to add or remove users who have access to this
      project, change the default tags that users of this project see when
      tagging tracks.
    </p>
    <p>
      If I'm the only user, and there are no devices, and no recordings, then we
      should show the setup screen
    </p>
    <p>TODO: Would be nice to have the option of renaming the project here?</p>
  </div>
  <ul class="nav nav-tabs justify-content-md-center justify-content-evenly">
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-users' },
      ]"
      title="Users"
      :to="{
        name: 'project-users',
      }"
      >Users</router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'project-tag-settings' },
      ]"
      title="Tag settings"
      :to="{
        name: 'project-tag-settings',
      }"
      >Tag settings</router-link
    >
    <router-link
      :class="[
        ...navLinkClasses,
        { active: activeTabName === 'fix-project-locations' },
      ]"
      title="Fix locations"
      :to="{
        name: 'fix-project-locations',
      }"
      >Fix locations</router-link
    >
  </ul>
  <div class="py-3">
    <router-view />
  </div>
</template>
<style lang="less" scoped>
.group-name {
  text-transform: uppercase;
  color: #aaa;
  font-family: "Roboto Medium", "Roboto Regular", Roboto, sans-serif;
  font-weight: 500;
  // font-size: var(--bs-body-font-size);
  // FIXME - Use modified bs-body-font-size?
  font-size: 14px;
}
h1 {
  font-family: "Roboto Bold", "Roboto Regular", "Roboto", sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #444;
}
h2 {
  font-family: "Roboto Medium", "Roboto Regular", "Roboto", sans-serif;
  font-weight: 500;
  color: #444;
  font-size: 17px;
}

.nav-item.active {
  background: unset;
  border-bottom: 3px solid #6dbd4b !important;
}
</style>
