<template>
  <div
    @mouseenter="
      () => {
        if (jointQuatSphere.jointName) {
          viewer?.setHoveredJoints([jointQuatSphere.jointName])
        }
      }
    "
    @mouseleave="
      () => {
        viewer?.setHoveredJoints([])
      }
    "
    id="joint-quat-sphere-container"
    class="joint-qs-container"
    :class="{
      'joint-qs-hide': !jointQuatSphere.show,
      'joint-qs-light': !isDarkTheme,
    }"
    :style="{
      left: `${jointQuatSphere.position.left}px`,
      top: `${jointQuatSphere.position.top}px`,
    }"
  >
    <div
      @mousedown="e => jointQuatSphere.position.handleStart(e)"
      class="joint-qs-header"
      :style="{ color: isDarkTheme ? 'white' : 'black' }"
    >
      <div class="joint-qs-title">
        <span class="joint-qs-title-main">{{
          robotModelStore.isBVH ? '关节旋转球' : '姿态旋转球'
        }}</span>
        <span v-if="robotModelStore.isBVH"
          class="joint-qs-title-sub"
          :style="{
            color: isDarkTheme ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
          }"
        >
          <div class="joint-qs-title-row">
            <span>
              {{
                (() => {
                  const arr = jointQuatSphere.jointName.split(':')
                  if (arr.length === 1) {
                    return arr[0]
                  }
                  return arr[arr.length - 1]
                })()
              }}
            </span>

            <div class="joint-qs-red-dot"></div>
          </div>
        </span>
      </div>
      <div class="flex-row-right zoom-small">
        <div
          @click="() => jointQuatSphere.handleHide()"
          class="button2 joint-qs-close-btn"
          :class="{
            'button2-light': !isDarkTheme,
          }"
        >
          <SVGClose
            class="svg-size"
            :style="{
              color: textColor,
            }"
          />
        </div>
      </div>
    </div>
    <div
      id="joint-quat-sphere"
      class="joint-qs-canvas"
      @mousedown="() => jointQuatSphere.move.handleStart()"
    ></div>
    <div
      style="
        width: 100%;
        position: absolute;
        right: 0;
        bottom: 0;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 8px;
      "
    >
      <HoverTip
        :position="'bottom'"
        :persist-on-panel="true"
        :close-delay="120"
        :dark="isDarkTheme"
      >
        <template #default>
          <div
            class="joint-qs-hover-btn"
            :class="{
              'joint-qs-hover-btn-light': !isDarkTheme,
              'joint-qs-hover-btn-dark': isDarkTheme,
            }"
            :title="'关节控制'"
          >
            <SVGSettings
              class="svg-size"
              style="width: 16px; height: 16px"
              :style="{ color: textColor }"
            />
          </div>
        </template>
        <template #hoverTemplate>
          <div
            class="joint-qs-panel"
            @mouseenter="showRedDot = true"
            @mouseleave="showRedDot = false"
          >
            <div class="joint-qs-section-title" :style="{ color: textColor }">
              {{ robotModelStore.isBVH ? '根关节约束' : '全局约束' }}
            </div>
            <div class="joint-qs-row">
              <div
                v-for="axis in ['X', 'Y', 'Z']"
                :key="axis"
                class="joint-qs-btn button2"
                :class="[
                  !isDarkTheme ? 'button2-light' : '',
                  jointQuatSphere.constraint.selected === axis ? 'button3' : 'button2',
                ]"
                :title="
                  jointQuatSphere.constraint.selected === axis
                    ? `取消绕${axis}轴旋转`
                    : `绕${axis}轴旋转`
                "
                @click="
                  () => {
                    if (jointQuatSphere.constraint.selected === axis) {
                      jointQuatSphere.constraint.change(undefined)
                    } else {
                      jointQuatSphere.constraint.change(axis as any)
                    }
                  }
                "
              >
                {{ axis }}
              </div>
            </div>

            <div
              v-if="robotModelStore.isBVH"
              class="joint-qs-section-title"
              :style="{ color: textColor }"
            >
              当前关节约束
            </div>
            <div v-if="robotModelStore.isBVH" class="joint-qs-row">
              <div
                v-for="axis in ['RX', 'RY', 'RZ']"
                :key="axis"
                class="joint-qs-btn button2"
                :class="[
                  !isDarkTheme ? 'button2-light' : '',
                  jointQuatSphere.constraint.selected === axis ? 'button3' : 'button2',
                ]"
                :title="
                  jointQuatSphere.constraint.selected === axis
                    ? `取消绕${axis}轴旋转`
                    : `绕${axis}轴旋转`
                "
                @click="
                  () => {
                    if (jointQuatSphere.constraint.selected === axis) {
                      jointQuatSphere.constraint.change(undefined)
                    } else {
                      jointQuatSphere.constraint.change(axis as any)
                    }
                  }
                "
              >
                {{ axis.slice(1) }}
              </div>
            </div>

            <div class="joint-qs-section-title" :style="{ color: textColor }">摄像机</div>
            <div class="joint-qs-row">
              <div
                class="joint-qs-btn button2"
                :class="[
                  !isDarkTheme ? 'button2-light' : '',
                  jointQuatSphere.lockedCameraQuater ? 'button3' : 'button2',
                ]"
                :title="
                  jointQuatSphere.lockedCameraQuater ? '取消锁定摄像机姿态' : '锁定摄像机姿态'
                "
                @click="
                  () => {
                    if (jointQuatSphere.lockedCameraQuater) {
                      jointQuatSphere.lockedCameraQuater = false
                    } else {
                      jointQuatSphere.api?.setCameraByQuaternion?.(api.camera.quater.get())
                      jointQuatSphere.lockedCameraQuater = true
                    }
                  }
                "
              >
                <SVGLocked class="svg-size joint-qs-icon" />
              </div>
            </div>
          </div>
        </template>
      </HoverTip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { IJointQuatSphere } from './data'

// SVG 图标导入
import SVGClose from '@/assets/svg/motion-editor-close.svg'
import SVGLocked from '@/assets/svg/motion-editor-locked.svg'
import HoverTip from '../hoverTip/UI.vue'
import SVGSettings from '@/assets/svg/motion-editor-settings.svg'

// 定义 Props 接口
interface JointQuatSphereUIProps {
  jointQuatSphere: IJointQuatSphere
  viewer: any | null
  isDarkTheme: boolean
  textColor: string
  api: any
  dragJointSettingsPanel: any
  robotModelStore: any
}

// 接收 props
const props = defineProps<JointQuatSphereUIProps>()

// 解构 props 为局部变量
const { jointQuatSphere, viewer, api, dragJointSettingsPanel, robotModelStore } = props

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)
const showRedDot = ref(false)
</script>

<style scoped>
@import '../style.css';

.joint-qs-container:hover .joint-qs-red-dot {
  visibility: visible;
}

.joint-qs-container {
  position: absolute;
  width: 180px;
  background: rgba(28, 28, 28, 0.6);
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(18px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
  pointer-events: auto;
}

.joint-qs-light {
  background: rgba(227, 227, 227, 0.6);
}

.joint-qs-hide {
  opacity: 0;
  pointer-events: none;
  transform: scale(0.95);
}

.joint-qs-header {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 13px;
  cursor: default;
  user-select: none;
}

.joint-qs-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  line-height: 1;
  gap: 2px;
  user-select: none;
}

.joint-qs-title-main {
  word-break: keep-all;
  font-size: 12px;
}

.joint-qs-title-sub {
  font-size: 10px;
  word-break: keep-all;
}

.joint-qs-title-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
}

.joint-qs-red-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background-color: red;
  border-radius: 50%;
  min-width: 8px;
  min-height: 8px;
  visibility: hidden;
}

.joint-qs-close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.joint-qs-canvas {
  width: 100%;
  height: 180px;
  margin-top: -16px;
}

.joint-qs-footer {
  width: 100%;
  padding: 6px 8px;
  display: flex;
  justify-content: flex-end;
}

.joint-qs-hover-btn {
  border-radius: 5px;
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.joint-qs-hover-btn-light {
  background: rgba(0, 0, 0, 0);
}
.joint-qs-hover-btn-light:hover {
  background: rgba(0, 0, 0, 0.12);
}

.joint-qs-hover-btn-dark {
  background: rgba(255, 255, 255, 0);
}
.joint-qs-hover-btn-dark:hover {
  background: rgba(255, 255, 255, 0.16);
}

.joint-qs-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 140px;
}

.joint-qs-section-title {
  font-size: 11px;
  opacity: 0.8;
  padding: 0 0 2px 0;
}

.joint-qs-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
}

.joint-qs-btn {
  min-width: 44px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  cursor: default;
  user-select: none;
  font-size: 11px;
}

.joint-qs-icon {
  transform: scale(0.85);
}

.joint-qs-btn .svg-size {
  width: 14px;
  height: 14px;
}
</style>
