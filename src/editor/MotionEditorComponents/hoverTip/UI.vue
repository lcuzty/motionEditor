<template>
  <div
    class="hover-tip"
    :class="{ dark }"
    @mouseenter="handleTriggerEnter"
    @mouseleave="handleTriggerLeave"
  >
    <div class="hover-tip-trigger">
      <slot />
    </div>
    <transition name="fade">
      <div
        v-if="show"
        class="hover-tip-panel"
        :class="`pos-${position}`"
        :style="{
          '--hover-tip-offset-x': `${offsetX ?? 0}px`,
          '--hover-tip-offset-y': `${offsetY ?? 0}px`,
          backgroundColor: dark ? 'rgba(28,28,28,1)' : 'rgba(235,235,235,1)',
        }"
        @mouseenter="handlePanelEnter"
        @mouseleave="handlePanelLeave"
      >
        <div class="hover-tip-content">
          <slot name="hoverTemplate" />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

type Position =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

const props = defineProps<{
  position?: Position
  dark?: boolean
  persistOnPanel?: boolean
  closeDelay?: number
  offsetX?: number
  offsetY?: number
}>()

const show = ref(false)
const isOverPanel = ref(false)

const position = props.position ?? 'top'
const dark = computed(() => props.dark ?? false)
const persistOnPanel = props.persistOnPanel ?? true
const closeDelay = props.closeDelay ?? 120

let closeTimer: number | null = null

const clearCloseTimer = () => {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

const open = () => {
  clearCloseTimer()
  show.value = true
}

const scheduleClose = () => {
  clearCloseTimer()
  closeTimer = window.setTimeout(() => {
    if (isOverPanel.value && persistOnPanel) return
    show.value = false
  }, closeDelay)
}

const handleTriggerEnter = () => {
  open()
}

const handleTriggerLeave = () => {
  if (persistOnPanel && isOverPanel.value) return
  scheduleClose()
}

const handlePanelEnter = () => {
  isOverPanel.value = true
  clearCloseTimer()
}

const handlePanelLeave = () => {
  isOverPanel.value = false
  scheduleClose()
}
</script>

<style scoped>
.hover-tip {
  position: relative;
  display: inline-block;
}

.hover-tip-panel {
  position: absolute;
  z-index: 10000001;
  background-color: var(--bg-color, #ffffff);
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 16px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  padding: 8px;
  min-width: max-content;
  transform-origin: center;
}

.hover-tip.dark .hover-tip-panel {
  background-color: var(--bg-color-dark, #1f1f1f);
  border-color: var(--border-color-dark, #333333);
  color: #ffffff;
}

.pos-top {
  bottom: 100%;
  left: 50%;
  transform: translateX(calc(-50% + var(--hover-tip-offset-x)))
    translateY(calc(-4px + var(--hover-tip-offset-y)));
}

.pos-bottom {
  top: 100%;
  left: 50%;
  transform: translateX(calc(-50% + var(--hover-tip-offset-x)))
    translateY(calc(4px + var(--hover-tip-offset-y)));
}

.pos-left {
  right: 100%;
  top: 50%;
  transform: translateY(calc(-50% + var(--hover-tip-offset-y)))
    translateX(calc(-4px + var(--hover-tip-offset-x)));
}

.pos-right {
  left: 100%;
  top: 50%;
  transform: translateY(calc(-50% + var(--hover-tip-offset-y)))
    translateX(calc(4px + var(--hover-tip-offset-x)));
}

.pos-top-left {
  bottom: 100%;
  right: 100%;
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(-4px + var(--hover-tip-offset-y)));
}

.pos-top-right {
  bottom: 100%;
  left: 100%;
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(-4px + var(--hover-tip-offset-y)));
}

.pos-bottom-left {
  top: 100%;
  right: 100%;
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(4px + var(--hover-tip-offset-y)));
}

.pos-bottom-right {
  top: 100%;
  left: 0;
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(4px + var(--hover-tip-offset-y)));
}

.hover-fade-enter-active,
.hover-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.hover-fade-enter-from,
.hover-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Override transform based on position to keep the offset logic */
.pos-top.hover-fade-enter-from,
.pos-top.hover-fade-leave-to {
  transform: translateX(calc(-50% + var(--hover-tip-offset-x)))
    translateY(calc(0px + var(--hover-tip-offset-y))) scale(0.95);
}

.pos-bottom.hover-fade-enter-from,
.pos-bottom.hover-fade-leave-to {
  transform: translateX(calc(-50% + var(--hover-tip-offset-x)))
    translateY(calc(0px + var(--hover-tip-offset-y))) scale(0.95);
}

.pos-left.hover-fade-enter-from,
.pos-left.hover-fade-leave-to {
  transform: translateY(calc(-50% + var(--hover-tip-offset-y)))
    translateX(calc(0px + var(--hover-tip-offset-x))) scale(0.95);
}

.pos-right.hover-fade-enter-from,
.pos-right.hover-fade-leave-to {
  transform: translateY(calc(-50% + var(--hover-tip-offset-y)))
    translateX(calc(0px + var(--hover-tip-offset-x))) scale(0.95);
}

.pos-top-left.hover-fade-enter-from,
.pos-top-left.hover-fade-leave-to {
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(0px + var(--hover-tip-offset-y))) scale(0.95);
}

.pos-top-right.hover-fade-enter-from,
.pos-top-right.hover-fade-leave-to {
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(0px + var(--hover-tip-offset-y))) scale(0.95);
}

.pos-bottom-left.hover-fade-enter-from,
.pos-bottom-left.hover-fade-leave-to {
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(0px + var(--hover-tip-offset-y))) scale(0.95);
}

.pos-bottom-right.hover-fade-enter-from,
.pos-bottom-right.hover-fade-leave-to {
  transform: translateX(calc(0% + var(--hover-tip-offset-x)))
    translateY(calc(0px + var(--hover-tip-offset-y))) scale(0.95);
}
</style>
