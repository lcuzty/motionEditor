<template>
  <div
    class="num-input"
    :class="{ dark, disabled }"
    @mouseup="handleGlobalMouseUp"
  >
    <button
      class="arrow left"
      :class="{ 'arrow-danger': allowExceed && outOfLower }"
      type="button"
      :disabled="disabled || (!allowExceed && typeof min === 'number' && modelValue <= min)"
      @click="handleArrow(-1)"
    >
      <SVGArrowLeft class="svg-size" />
    </button>

    <div
      class="middle"
      :style="{
        '--ni-middle-width': `${middleWidth}px`,
      }"
      :class="{ dragging, editing: isEditing, disabled, danger: isOutOfRange }"
      @mousedown="handleMiddleMouseDown"
      @click.stop="handleDisplayClick"
    >
      <span v-if="!isEditing" :class="{ 'value-danger': isOutOfRange }">{{ displayValue }}</span>
      <input
        v-else
        ref="inputRef"
        v-model="inputValue"
        type="text"
        :disabled="disabled"
        @keydown.stop="handleInputKeydown"
        @blur="handleInputBlur"
      />
    </div>

    <button
      class="arrow right"
      :class="{ 'arrow-danger': allowExceed && outOfUpper }"
      type="button"
      :disabled="disabled || (!allowExceed && typeof max === 'number' && modelValue >= max)"
      @click="handleArrow(1)"
    >
      <SVGArrowRight class="svg-size" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import SVGArrowLeft from '@/assets/svg/motion-editor-frame-last.svg'
import SVGArrowRight from '@/assets/svg/motion-editor-frame-next.svg'

const props = defineProps<{
  modelValue: number
  step?: number
  min?: number
  max?: number
  dark?: boolean
  dragPixelPerStep?: number
  middleWidth?: number
  disabled?: boolean
  precision?: number
  allowExceed?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
}>()

const step = computed(() => props.step ?? 1)
const dragPixelPerStep = computed(() => Math.max(1, props.dragPixelPerStep ?? 8))
const middleWidth = computed(() => Math.max(40, props.middleWidth ?? 72))
const isDisabled = computed(() => !!props.disabled)
const allowExceed = computed(() => !!props.allowExceed)

const isEditing = ref(false)
const inputValue = ref(String(props.modelValue ?? 0))
const displayValue = computed(() => {
  const val = clamp(props.modelValue)
  if (typeof props.precision === 'number') {
    return val.toFixed(props.precision)
  }
  return val
})
const inputRef = ref<HTMLInputElement | null>(null)
const editOriginalValue = ref<number>(props.modelValue ?? 0)

const dragging = ref(false)
let lastX = 0
let lastY = 0
let acc = 0
let hasDragged = false

const outOfLower = computed(
  () => typeof props.min === 'number' && props.modelValue < props.min
)
const outOfUpper = computed(
  () => typeof props.max === 'number' && props.modelValue > props.max
)
const isOutOfRange = computed(() => allowExceed.value && (outOfLower.value || outOfUpper.value))

watch(
  () => props.modelValue,
  v => {
    if (!isEditing.value) {
      inputValue.value = String(v ?? 0)
    }
  }
)

const clamp = (val: number) => {
  if (allowExceed.value) return val
  let n = val
  if (typeof props.min === 'number') n = Math.max(props.min, n)
  if (typeof props.max === 'number') n = Math.min(props.max, n)
  return n
}

const updateValue = (delta: number) => {
  const rawNext = (props.modelValue ?? 0) + delta
  const next = clamp(rawNext)
  emit('update:modelValue', next)
}

const handleArrow = (dir: -1 | 1) => {
  if (isDisabled.value) return
  updateValue(dir * step.value)
}

const handleDisplayClick = () => {
  if (isDisabled.value) return
  if (hasDragged) {
    hasDragged = false
    return
  }
  if (dragging.value) return
  isEditing.value = true
  editOriginalValue.value = props.modelValue ?? 0
  inputValue.value = String(props.modelValue ?? 0)
  requestAnimationFrame(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

const handleInputCommit = () => {
  const parsed = Number(inputValue.value)
  const min = props.min
  const max = props.max

  const isFiniteNum = Number.isFinite(parsed)
  if (!isFiniteNum) {
    emit('update:modelValue', editOriginalValue.value)
    inputValue.value = String(editOriginalValue.value)
    return
  }

  if (allowExceed.value) {
    emit('update:modelValue', parsed)
    return
  }

  // 不允许超限，自动夹在范围内
  const clamped = clamp(parsed)
  emit('update:modelValue', clamped)
  inputValue.value = String(clamped)
}

const handleInputBlur = () => {
  handleInputCommit()
  isEditing.value = false
}

const handleInputKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleInputCommit()
    isEditing.value = false
    return
  }
  if (e.key === 'Escape') {
    emit('update:modelValue', editOriginalValue.value)
    inputValue.value = String(editOriginalValue.value)
    isEditing.value = false
    return
  }
  if (e.key === 'ArrowUp') {
    updateValue(step.value)
    return
  }
  if (e.key === 'ArrowDown') {
    updateValue(-step.value)
    return
  }
}

const handleMiddleMouseDown = (e: MouseEvent) => {
  // 仅在显示模式下触发拖拽
  if (isEditing.value || isDisabled.value) return
  e.preventDefault()
  dragging.value = true
  hasDragged = false
  lastX = e.clientX
  lastY = e.clientY
  acc = 0
  bindDrag()
}

const onMouseMove = (e: MouseEvent) => {
  if (!dragging.value) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY

  const primary = Math.abs(dx) >= Math.abs(dy) ? dx : -dy // 右/上 增加，左/下 减少
  acc += primary
  const threshold = dragPixelPerStep.value
  const steps = Math.trunc(acc / threshold)
  if (steps !== 0) {
    hasDragged = true
    acc -= steps * threshold
    updateValue(steps * step.value)
  }
}

const onMouseUp = () => {
  if (!dragging.value) return
  dragging.value = false
  unbindDrag()
}

const bindDrag = () => {
  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('mouseup', onMouseUp, true)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'ew-resize'
}

const unbindDrag = () => {
  document.removeEventListener('mousemove', onMouseMove, true)
  document.removeEventListener('mouseup', onMouseUp, true)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

const handleGlobalMouseUp = () => {
  if (dragging.value) {
    dragging.value = false
    unbindDrag()
  }
}

onBeforeUnmount(() => {
  unbindDrag()
})
</script>

<style scoped>
.num-input {
  display: inline-flex;
  align-items: stretch;
  height: 26px;
  min-height: 26px;
  border-radius: 5px;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--ni-btn-bg, rgba(28, 28, 28, 0.6));
  color: var(--ni-fg, #e5e7eb);
  user-select: none;
  font-size: 13px;
  border: none;
  backdrop-filter: blur(8px);
  transition: border-color 0.2s ease, background-color 0.2s ease;
  position: relative;
  z-index: 1;
  pointer-events: fill;
}
.num-input.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.num-input.dark {
  --ni-bg: rgba(28, 28, 28, 0.6);
  --ni-fg: #f9fafb;
  --ni-border: rgba(255, 255, 255, 0.12);
  --ni-btn-bg: rgba(255, 255, 255, 0.06);
  --ni-btn-bg-hover: rgba(255, 255, 255, 0.1);
  --ni-btn-bg-active: rgba(255, 255, 255, 0.05);
  --ni-btn-fg: #f9fafb;
}
.num-input:not(.dark) {
  --ni-bg: rgba(227, 227, 227, 0.8);
  --ni-fg: #1f2937;
  --ni-border: rgba(0, 0, 0, 0.08);
  --ni-btn-bg: rgba(0, 0, 0, 0.05);
  --ni-btn-bg-hover: rgba(0, 0, 0, 0.08);
  --ni-btn-bg-active: rgba(0, 0, 0, 0.04);
  --ni-btn-fg: #111827;
}
.arrow {
  width: 26px;
  min-width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--ni-btn-bg);
  color: var(--ni-btn-fg);
  cursor: pointer;
  transition: background-color 0.2s ease, filter 0.2s ease;
}
.arrow:hover {
  background: var(--ni-btn-bg-hover);
}
.arrow:active {
  background: var(--ni-btn-bg-active);
  filter: brightness(0.95);
}
.arrow.arrow-danger {
  background: rgba(255, 0, 0, 0.08);
}
.arrow:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
.middle {
  min-width: var(--ni-middle-width, 72px);
  width: var(--ni-middle-width, 72px);
  height: 26px;
  min-height: 26px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ni-btn-bg);
  cursor: grab;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.middle:hover {
  background: var(--ni-btn-bg-hover);
}
.middle.dragging {
  cursor: grabbing;
  background: var(--ni-btn-bg-hover);
}
.middle.disabled {
  opacity: 0.7;
  cursor: not-allowed;
  pointer-events: none;
}
.middle.danger {
  color: #ff5c5c;
}
.middle span {
  white-space: nowrap;
  letter-spacing: 0.2px;
  line-height: 1;
}
.middle .value-danger {
  color: #ff5c5c;
}
.middle input {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  text-align: center;
  font-size: 13px;
  line-height: 1;
}
</style>

