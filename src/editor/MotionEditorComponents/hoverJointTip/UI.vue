<template>
  <!-- <div
      class="hover-joint-tip-container"
      :class="{
        'hover-joint-tip-container-animation': currentHoverJointTip.showAnimation(),
        'hover-joint-tip-container-hide': currentHoverJointTip.getOpacity() === 0,
        'hover-joint-tip-container-margin-left': dataPanel.show,
      }"
    > -->
  <div
    style="
      width: 100%;
      position: absolute;
      left: 0;
      bottom: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    "
  >
    <div
      style="
        width: max-content;
        height: max-content;
        background-color: red;
        border-radius: 100px;
        padding: 8px 16px;
        line-height: 1;
        font-size: 14px;
        font-family: 微软雅黑;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding-left: 12px;
        backdrop-filter: blur(20px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
      "
      :style="{
        backgroundColor: isDarkTheme ? 'rgba(28,28,28,0.2)' : 'rgba(227, 227, 227, 0.6)',
        color: textColor,
        opacity: currentHoverJointTip.getOpacity(),
        transition: currentHoverJointTip.showAnimation()?'opacity 0.3s cubic-bezier(0.1, 0.9, 0.2, 1)':'none',
      }"
    >
      <SVGHover class="svg-size" style="width: 18px; height: 18px" />
      {{
        (() => {
          const arr = currentHoverJointTip.display.split(':')
          if (arr.length === 1) {
            return arr[0]
          }
          return arr[arr.length - 1]
        })()
      }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IHoverJointTip } from './data'
import type { IDataPanel } from '../dataPanel/data'
import { computed } from 'vue'

import SVGHover from '@/assets/svg/motion-editor-hover.svg'

const props = defineProps<{
  isDarkTheme: boolean
  textColor: string
  currentHoverJointTip: IHoverJointTip
  dataPanel: IDataPanel
}>()

const { currentHoverJointTip, dataPanel } = props

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)
</script>

<style scoped>
@import '../style.css';
</style>
