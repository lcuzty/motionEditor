<template>
  <div style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none">
    <div
      @mousedown="
        () => {
          jointFloatingMenu.handleHide()
        }
      "
      v-if="jointFloatingMenu.show"
      style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: fill"
    ></div>

    <div
      class="menu-container"
      :class="{
        'menu-container-hide': !jointFloatingMenu.show,
        'menu-container-light': !isDarkTheme,
      }"
      :style="{
        left: `${urdfView.currentX}px`,
        top: `${urdfView.currentY}px`,
      }"
    >
      <div
        :class="{
          'button-disabled': !jointFloatingMenu.show,
        }"
        v-for="(item, index) in jointFloatingMenu.options"
        class="button-bg"
        @click="
          () => {
            item.onClick()
          }
        "
        style="height: 28px"
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
import { computed } from 'vue';

interface FloatingMenuUIProps {
  jointFloatingMenu: any
  isDarkTheme: boolean
  urdfView: any
}

const props = defineProps<FloatingMenuUIProps>()

const { jointFloatingMenu, urdfView } = props

const isDarkTheme = computed(() => props.isDarkTheme)
</script>

<style scoped>
@import '../style.css';
</style>
