<template>
  <div
    v-if="windowStore.getOperatingText() !== ''"
    style="
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      z-index: 9000;
    "
  >
    <div
      style="
        width: 300px;
        height: 60px;
        background-color: rgba(28, 28, 28, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        user-select: none;
        border-radius: 10px;
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      "
      :style="{
        'background-color': !themeStore.isDark
          ? 'rgba(28, 28, 28, 0.6)'
          : 'rgba(227, 227, 227, 0.6)',
        border: !themeStore.isDark
          ? '1px solid rgba(0, 0, 0, 0.1)'
          : '1px solid rgba(255, 255, 255, 0.1)',
        color: !themeStore.isDark ? '#fff' : '#000',
      }"
    >
      {{ windowStore.getOperatingText() }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
    windowStore: any
    themeStore: any
}>()
</script>

<style scoped>

</style>

