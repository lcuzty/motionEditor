<script setup lang="ts">
import { onMounted } from 'vue'
import MotionEditor from './editor/MotionEditor.vue'

// 这里的接口和数据结构需要根据实际运行情况调整，暂时留空或提供假数据
// MotionEditor 内部似乎依赖 global pinia store，所以这里可能不需要太多 explicit props
// 但是如果组件需要 props，这里需要补充
</script>

<template>
  <div class="app-container">
    <MotionEditor />
  </div>
</template>

<style>
html, body, #app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.app-container {
  width: 100%;
  height: 100%;
}
</style>
