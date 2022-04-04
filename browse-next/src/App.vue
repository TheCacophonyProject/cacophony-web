<script setup lang="ts">
import { RouterView } from "vue-router";
import IconCacophonyLogo from "@/components/icons/IconCacophonyLogo.vue";
import GitReleaseInfoBar from "@/components/GitReleaseInfoBar.vue";
</script>
<template>
  <git-release-info-bar />
  <main id="main-wrapper">
    <nav id="global-side-nav" class="d-flex flex-column flex-shrink-0">
      <a
        href="/"
        class="d-block py-2 px-1"
        title=""
        data-bs-toggle="tooltip"
        data-bs-placement="right"
        data-bs-original-title="Icon-only"
      >
        <icon-cacophony-logo />
        <span class="visually-hidden">Icon-only</span>
      </a>
      <ul class="nav nav-pills nav-flush flex-column mb-auto">
        <li class="nav-item">
          <a
            href="#"
            class="nav-link active py-3"
            aria-current="page"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Dashboard"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="gauge-high" />
            </span>
          </a>
        </li>
        <li>
          <a
            href="#"
            class="nav-link py-3"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Stations"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="location-dot" />
            </span>
          </a>
        </li>
        <li>
          <a
            href="#"
            class="nav-link py-3"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Search"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="magnifying-glass" />
            </span>
          </a>
        </li>
        <li>
          <a
            href="#"
            class="nav-link py-3"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Devices"
          >
            <span class="nav-icon-wrapper">
              <span class="icon-alert-wrapper">
                <font-awesome-icon icon="microchip" />
                <svg
                  class="alert-icon"
                  width="12"
                  height="12"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M2.99.8C3.9.27 4.9 0 6 0a5.97 5.97 0 0 1 5.2 9.01 5.97 5.97 0 0 1-8.21 2.19A5.97 5.97 0 0 1 .8 2.99 5.97 5.97 0 0 1 3 .8Zm3.94 9.13A.26.26 0 0 0 7 9.74V8.26a.26.26 0 0 0-.07-.19.23.23 0 0 0-.17-.07h-1.5a.25.25 0 0 0-.18.08.25.25 0 0 0-.08.18v1.48c0 .07.03.13.08.18.05.05.11.08.18.08h1.5c.07 0 .12-.02.17-.07ZM6.9 7.19a.2.2 0 0 0 .08-.14l.14-4.85c0-.06-.02-.1-.07-.14a.3.3 0 0 0-.2-.06h-1.7a.3.3 0 0 0-.2.06.15.15 0 0 0-.08.14l.14 4.85c0 .06.02.1.08.14a.3.3 0 0 0 .18.06h1.45c.07 0 .13-.02.18-.06Z"
                    fill="#d9001b"
                  />
                </svg>
              </span>
            </span>
          </a>
        </li>
        <li>
          <a
            href="#"
            class="nav-link py-3"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Report"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="chart-pie" />
            </span>
          </a>
        </li>
        <li>
          <a
            href="#"
            class="nav-link py-3"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="My preferences"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="gear" />
            </span>
          </a>
        </li>
        <li>
          <a
            href="#"
            class="nav-link py-3"
            title=""
            data-bs-toggle="tooltip"
            data-bs-placement="right"
            data-bs-original-title="Manage group"
          >
            <span class="nav-icon-wrapper">
              <font-awesome-icon icon="screwdriver-wrench" />
            </span>
          </a>
        </li>
      </ul>
      <div class="dropdown border-top">
        <a href="#" class="d-flex py-3 text-decoration-none" id="dropdownUser3">
          <span class="nav-icon-wrapper">
            <font-awesome-icon icon="user" />
          </span>
        </a>
      </div>
    </nav>
    <section id="main-content">
      <router-view />
    </section>
  </main>
</template>

<style lang="less">
#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

#main-wrapper {
  position: relative;
  padding-left: 3.5rem;
}

#main-content {
  background: #f6f6f6;
  width: 100%;
}

#global-side-nav {
  background: white;
  position: absolute;
  bottom: 0;
  top: 0;
  left: 0;
  width: 3.5rem;
  transition: width 0.2s;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);

  .nav-icon-wrapper {
    // Keep the icons vertically aligned relative to one-another.
    display: block;
    width: 3.5rem;
    text-align: center;
  }

  .nav-link {
    padding-left: 0;
  }

  a {
    svg {
      color: #808080;
    }
    &:active,
    &.active {
      background: unset;
      position: relative;
      &::before {
        content: " ";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background-color: #6dbd4b;
      }

      svg {
        color: #4c4c4c;
      }
    }
  }

  &:hover {
    width: 20rem;
  }

  .icon-alert-wrapper {
    position: relative;
    .alert-icon {
      position: absolute;
      top: -35%;
      right: -35%;
    }
  }
}

main {
  display: flex;
  flex: auto;
  flex-wrap: nowrap;
  /*height: 100vh;*/
  /*min-height: 100vh;*/
  /*max-height: 100vh;*/
  /*overflow-x: auto;*/
  /*overflow-y: hidden;*/
}
</style>
