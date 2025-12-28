<template>
  <div
    class="container-left"
    :class="{
      'container-left-hide': !help.show,
    }"
  >
    <!-- 数据显示面板 -->
    <div class="container-data-display" :class="isDarkTheme ? '' : 'container-data-display-light'">
      <!-- 滚动容器 -->
      <div ref="dataListScrollRef" class="full-size data-list-scroll">
        <helpUI
          :help="help"
          :dataPanel="dataPanel"
          :isDarkTheme="isDarkTheme"
          :textColor="textColor"
          :windowStore="windowStore"
        />
        <div v-if="false" class="column-pad-8-full">
          <!-- 关节数据项 - 遍历所有关节和全局位置/旋转数据 -->
          <div
            v-for="item in motionStore.getJointNames()"
            class="data-display-data-item"
            :class="{
              button2: item !== selectedFieldStore.selectedFieldName,
              button3: item === selectedFieldStore.selectedFieldName,
              'button-hovered':
                isHighlightableField(item) &&
                (!robotModelStore.isBVH ? item : item.slice(0, item.length - 2)) ===
                  selectedFieldStore.hoveredJointName,
              'button2-light': !isDarkTheme,
            }"
            :data-joint-name="item"
            @mouseenter="
              () => {
                if (isHighlightableField(item)) {
                  viewer?.setHoveredJoints([
                    item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0)),
                  ])
                }
              }
            "
            @mouseleave="
              () => {
                if (isHighlightableField(item)) {
                  viewer?.setHoveredJoints([])
                }
              }
            "
            @click="
              () => {
                dataPanel.handleItemClick(item)
              }
            "
          >
            <!-- 关节名称 -->
            <key1>{{
              (() => {
                const arr = item.split(':')
                if (arr.length === 1) {
                  return arr[0]
                }
                return arr[arr.length - 1]
              })()
            }}</key1>

            <!-- 指示器容器 -->
            <div class="indicator-container">
              <!-- 红点指示器 - 标识可编辑的关节 -->
              <div v-if="isHighlightableField(item)" class="red-dot"></div>
            </div>

            <!-- Limit 显示（URDF 关节） -->
            <value v-if="shouldShowLimit(item)" class="data-display-limit">
              <span class="limit-number">{{ getLimitLabel(item, 'lower') }}</span>
              <span class="limit-separator">~</span>
              <span class="limit-number">{{ getLimitLabel(item, 'upper') }}</span>
            </value>

            <!-- 数值显示 -->
            <value
              v-else-if="
                motionStore.getCurrentFrame() &&
                !(motionStore.getCurrentFrame() as Record<string, number | boolean>)[
                  `!${item}_showInput`
                ] &&
                dataPanel.show
              "
              :style="{
                paddingLeft:
                  motionStore.getCurrentFrame() &&
                  (motionStore.getCurrentFrame() as Record<string, number>)[item] >= 0
                    ? '0.5em'
                    : 0,
              }"
            >
              {{ getCurrentValue(item) }}
            </value>

            <!-- 输入框容器 - 编辑模式 -->
            <div
              v-else-if="
                !shouldShowLimit(item) &&
                motionStore.getCurrentFrame() &&
                (motionStore.getCurrentFrame() as Record<string, number | boolean>)[
                  `!${item}_showInput`
                ] &&
                dataPanel.show
              "
              class="data-display-data-item-input-container"
            >
              <!-- 数值输入框 -->
              <input
                v-if="motionStore.getCurrentFrame()"
                class="data-display-data-item-input"
                :value="(motionStore.getCurrentFrame() as Record<string, number>)[item]"
                type="text"
                @input="
                  (e: Event) => {
                    const _ = (e.target as HTMLInputElement | null)?.value
                  }
                "
              />
              <!-- 提示标签 -->
              <span class="data-display-data-item-input-label">ESC取消编辑，Enter确定</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { api } from '../tools/motionEditorTools'
import type { IDataPanel } from './data'
import helpUI from '../help/UI.vue'
import { IHelpData } from '../help/data'

// 定义 Props 接口
interface DataPanelUIProps {
  dataPanel: IDataPanel
  isDarkTheme: boolean
  motionStore: any
  selectedFieldStore: any
  robotModelStore: any
  viewer: any | null
  textColor: string
  help: IHelpData
  windowStore: any
}

// 接收 props
const props = defineProps<DataPanelUIProps>()

// 解构 props 为局部变量
const { dataPanel, motionStore, selectedFieldStore, robotModelStore, viewer, windowStore } = props

const isDarkTheme = computed(() => props.isDarkTheme)

// Ref
const dataListScrollRef = ref<HTMLElement | null>(null)

const limitCache = new Map<string, { lower: number; upper: number } | null>()

const orientationFieldName = computed(() => {
  const adapt = motionStore.motionData?.bvhAdapt
  if (!adapt || typeof adapt !== 'object') return ''
  return (adapt as { orientationFieldName?: string }).orientationFieldName || ''
})

const isGlobalField = (fieldName: string) => fieldName?.startsWith('global_')
const isURDFQuatField = (fieldName: string) =>
  !robotModelStore.isBVH && fieldName?.startsWith('quater_')
const isBVHOrientationField = (fieldName: string) =>
  robotModelStore.isBVH &&
  !!orientationFieldName.value &&
  fieldName?.startsWith(`${orientationFieldName.value}_`)

const isHighlightableField = (fieldName: string) =>
  !isGlobalField(fieldName) && !isURDFQuatField(fieldName) && !isBVHOrientationField(fieldName)

const isJointField = (fieldName: string) =>
  !fieldName.includes('global') && !fieldName.includes('quater')
const shouldShowLimit = (fieldName: string) => !robotModelStore.isBVH && isJointField(fieldName)
const normalizeNumber = (value: number | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return Number(value.toFixed(4)).toString()
}
const getJointLimit = (fieldName: string) => {
  if (limitCache.has(fieldName)) {
    return limitCache.get(fieldName)
  }
  const info = api.robot.joint.getSingleInfo(fieldName)
  const limit = info?.limit
  const result =
    limit &&
    typeof limit.lower === 'number' &&
    typeof limit.upper === 'number' &&
    Number.isFinite(limit.lower) &&
    Number.isFinite(limit.upper)
      ? { lower: limit.lower, upper: limit.upper }
      : null
  limitCache.set(fieldName, result)
  return result
}
const getLimitLabel = (fieldName: string, type: 'lower' | 'upper') => {
  const limit = getJointLimit(fieldName)
  if (!limit) return '--'
  return normalizeNumber(limit[type])
}
const getCurrentValue = (fieldName: string) => {
  const frame = motionStore.getCurrentFrame() as Record<string, number> | null
  if (!frame) return '--'
  return normalizeNumber(frame[fieldName])
}
</script>

<style scoped>
@import '../style.css';
</style>
