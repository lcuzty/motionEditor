<template>
  <div
    style="
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 120, 215, 0.2);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      color: white;
      transition: opacity 0.3s cubic-bezier(0.1, 0.9, 0.2, 1);
      border-radius: 24px;
      gap: 16px;
    "
    :style="{
      opacity: fullPageWarning.show ? 1 : 0,
      pointerEvents: fullPageWarning.show ? 'fill' : 'none',
    }"
  >
    <SVGWidth style="width: 35%" />
    <div
      style="
        font-size: 24px;
        color: #fff;
        width: 100%;
        text-align: center;
        word-break: break-all;
        padding: 0 24px;
      "
    >
      请扩大窗口宽度以正常显示内容
    </div>
    <div
      v-if="!windowStore.isMaximized && fullPageWarning.show"
      @click="
        () => {
          fullPageWarning.handleMax()
        }
      "
      class="button-bg button-bg-square button-round"
      style="width: 100px"
    >
      <div class="button-slot button-round">网页全屏</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import SVGWidth from '@/assets/svg/motion-editor-width.svg'

const props = defineProps<{
  fullPageWarning: {
    show: boolean
    handleMax: () => void
  }
  windowStore: {
    isMaximized: boolean
  }
}>()

const { fullPageWarning, windowStore } = props
</script>

<style scoped>
@import '../style.css';
</style>
