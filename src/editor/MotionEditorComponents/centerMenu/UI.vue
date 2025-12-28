<template>
  <div
    style="
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      flex-direction: column;
      gap: 8px;
    "
  >
    <div
      @mousedown="
        () => {
          windowStore.hideCenterMenu()
        }
      "
      style="
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        transition: opacity 0.3s cubic-bezier(0.1, 0.9, 0.2, 1);
      "
      :style="{
        backgroundColor: isDarkTheme ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)',
        opacity: windowStore.isShowCenterMenu ? 1 : 0,
        pointerEvents: windowStore.isShowCenterMenu ? 'fill' : 'none',
      }"
    ></div>
    <div
      style="font-size: 18px; font-weight: bold; position: relative; z-index: 1000"
      :style="{
        color: isDarkTheme ? '#fff' : '#000',
      }"
    >
      {{ windowStore.centerMenuTitle }}
    </div>
    <div
      class="menu-container"
      :class="{
        'menu-container-hide': !windowStore.isShowCenterMenu,
        'menu-container-light': !isDarkTheme,
      }"
      :style="{
        position: 'relative',
        pointerEvents: windowStore.isShowCenterMenu ? 'fill' : 'none',
      }"
    >
      <div
        v-for="(item, index) in windowStore.centerMenuItems"
        class="button-bg"
        @click="
          () => {
            item.onClick()
            windowStore.hideCenterMenu()
          }
        "
      >
        <div
          :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          class="button-slot justify-start"
        >
          {{ item.title }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface CenterMenuProps {
  windowStore: any
  isDarkTheme: boolean
}

const props = defineProps<CenterMenuProps>()

const { windowStore } = props

const isDarkTheme = computed(() => props.isDarkTheme)
</script>

<style scoped>
@import '../style.css';
</style>
