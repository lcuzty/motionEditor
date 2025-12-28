<template>
  <!-- 动作编辑器根容器 -->
  <div
    v-if="isMounted"
    ref="mainContainer"
    class="motion-editor-root"
    :class="{
      window: true,
      'window-max': windowStore.isMaximized,
      'motion-editor-root-loaded': !windowStore.isLoading,
    }"
    :style="{
      border: windowStore.isMaximized
        ? 'unset'
        : themeStore.isDark
          ? '2px solid rgba(55,55,55)'
          : '2px solid rgb(220,220,220)',
      'background-color': themeStore.isDark ? 'rgb(26,26,26)' : 'rgb(100,100,100)',
    }"
    @dragstart.prevent
  >
    <!-- 3D视图容器 - 显示机器人模型和动作预览 -->
    <div
      class="viewer"
      :style="{
        height: pathPanel.show === 2 ? `calc(100% - ${pathPanel.height}px + 40px)` : '100%',
        transform: pathPanel.show === 2 ? 'translateY(-20px)' : '',
      }"
      @mousedown="
        (e: MouseEvent) => {
          urdfView.handleMouseDown(e)
          if (robotModelStore.isBVH) {
            viewerJointControl.bvh.handleDown(e)
          } else {
            viewerJointControl.urdf.handleDown(e)
          }
        }
      "
      @mousemove="
        (e: MouseEvent) => {
          urdfView.handleMouseMove()
          robotModelStore.isBVH
            ? viewerJointControl.bvh.handleMove(e)
            : viewerJointControl.urdf.handleMove(e)
        }
      "
      @mouseup="
        (e: MouseEvent) => {
          if (robotModelStore.isBVH) {
            viewerJointControl.bvh.handleUp(e)
          } else {
            viewerJointControl.urdf.handleUp(e)
          }
        }
      "
    >
      <!-- 3D查看器组件 - 渲染URDF/BVH模型 -->
      <MotionEditor3DViewer
        :isDark="isDarkTheme"
        :motionData="motionStore.motionData?.parsed || []"
        @onURDFManipulateStart="handleJointManipulateStart"
        @onURDFManipulateEnd="handleJointManipulateEnd"
        @onHoverBVHNode="e => viewerJointControl.bvh.handleHoverBVHNode(e)"
        @onHoverURDFNode="e => viewerJointControl.urdf.handleHoverURDFNode(e)"
        @onReady="handle3DViewerReady"
        @onLoaded="handle3DViewerLoaded"
        @onURDFAngleChange="handleRobotAngleChange"
        @onMouseEnterJoint="e => handleGridMouseEnter(e)"
        @onMouseLeaveJoint="e => handleGridMouseLeave(e)"
      />
    </div>
    <!-- 控件层容器 - 包含左侧数据面板和右侧四元数球 -->
    <div
      ref="controlsContainer"
      class="layer-controls"
      v-if="motionStore.isJsonLoaded && robotModelStore.isSelected"
      :style="{
        height: pathPanel.show === 2 ? `calc(100% - ${pathPanel.height}px)` : '100%',
      }"
    >
      <DevtoolsGuardUI />
      <!-- 左侧数据列表容器 - 显示关节角度数据 -->
      <DataPanelUI
        :help="help"
        :textColor="textColor"
        :dataPanel="dataPanel"
        :isDarkTheme="isDarkTheme"
        :motionStore="motionStore"
        :selectedFieldStore="selectedFieldStore"
        :robotModelStore="robotModelStore"
        :viewer="viewer"
        :windowStore="windowStore"
      />
      <!-- 右侧容器 - 四元数球和控制面板 -->
      <QuatSphereUI
        :operationHsitoryPanel="operationHsitoryPanel"
        :motionStore="motionStore"
        :isDarkTheme="isDarkTheme"
        :quatSphere="quatSphere"
        :textColor="textColor"
        :api="api"
      />
      <!-- 右侧隐藏容器 - 操作历史面板 -->
      <div
        class="operation-history-panel"
        :class="{
          'operation-history-panel-hide': !operationHsitoryPanel.show,
        }"
      >
        <div
          class="operation-history-panel-content"
          :class="{
            'operation-history-panel-content-light': !isDarkTheme,
          }"
          @mouseenter="() => operationHsitoryPanel.setMouseIn()"
          @mouseleave="() => operationHsitoryPanel.removeMouseIn()"
        >
          <div class="operation-history-panel-content-title">
            <div
              style="
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: flex-start;
                font-size: 12px;
                font-weight: bold;
              "
              :style="{
                color: textColor,
              }"
            >
              操作历史
            </div>
            <div
              style="
                min-width: 32px;
                width: 32px;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
              "
            >
              <div
                @click="
                  () => {
                    operationHsitoryPanel.fixed = !operationHsitoryPanel.fixed
                  }
                "
                style="
                  width: 20px;
                  height: 20px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                "
                class="button2"
                :class="{
                  button3: operationHsitoryPanel.fixed,
                }"
              >
                <SVGFixed
                  class="svg-size"
                  :style="{
                    scale: 0.7,
                  }"
                />
              </div>
            </div>
          </div>
          <div class="operation-history-panel-content-list-wrapper">
            <scrollView :scroll-y="true" style="width: 100%; height: 100%">
              <div
                style="
                  width: 100%;
                  height: max-content;
                  display: flex;
                  align-items: center;
                  justify-content: flex-start;
                  flex-direction: column;
                  gap: 8px;
                  padding: 4px 0;
                  padding-bottom: 8px;
                "
              >
                <div
                  v-for="item in withDrawStore.stackReverse()"
                  style="width: 100%; padding: 0px 8px"
                >
                  <div
                    style="
                      width: 100%;
                      height: 100px;
                      background-color: rgba(255, 255, 255, 0.02);
                      border-radius: 8px;
                      border: 1px solid rgba(255, 255, 255, 0.1);
                      display: flex;
                      align-items: flex-start;
                      justify-content: flex-start;
                      flex-direction: column;
                      padding: 8px;
                    "
                  >
                    <span
                      style="font-size: 14px"
                      :style="{
                        color: textColor,
                      }"
                      >{{
                        `${item.id + 1} ${(() => {
                          if (item._type === 0) {
                            return item.detail.name
                          } else if (item._type === 1) {
                            return `复制帧`
                          } else if (item._type === 2) {
                            return `删除帧`
                          }
                          return ''
                        })()}`
                      }}</span
                    >
                    <span style="font-size: 12px" v-if="item._type === 1">
                      复制第{{ item.frameIndex }}帧
                    </span>
                  </div>
                </div>
              </div>
            </scrollView>
          </div>
        </div>
      </div>
      <!-- 顶部工具栏容器 -->
      <ToolBarUI
        :help="help"
        :dataAPIRef="dataAPIRef"
        :viewer="viewer"
        :withDrawStore="withDrawStore"
        :isDarkTheme="isDarkTheme"
        :textColor="textColor"
        :api="api"
        :robotModelStore="robotModelStore"
        :camera="camera"
        :dragJointSettingsPanel="dragJointSettingsPanel"
        :positionPanel="positionPanel"
        :pathPanel="pathPanel"
        :dataPanel="dataPanel"
        :viewerStore="viewerStore"
        :saveType="saveType"
        :motionStore="motionStore"
        :windowStore="windowStore"
        :convertMotionJSONToBVH="convertMotionJSONToBVH"
        :downloadStringAsFile="downloadStringAsFile"
        :saveStringAsJSON="saveStringAsJSON"
      />
      <!-- 底部进度容器 -->
      <PlayerUI
        :player="player"
        :motionStore="motionStore"
        :isDarkTheme="isDarkTheme"
        :jointPositionLine3D="jointPositionLine3D"
        :jointPositionRangeBar="jointPositionRangeBar"
      />
      <!-- 悬浮位置面板容器 -->
      <PositionPanelUI
        :positionPanel="positionPanel"
        :motionStore="motionStore"
        :isDarkTheme="isDarkTheme"
        :textColor="textColor"
      />
      <!-- 拖拽关节面板容器 -->
      <DragJointSettingsPanelUI
        :dragJointSettingsPanel="dragJointSettingsPanel"
        :isDarkTheme="isDarkTheme"
        :textColor="textColor"
        :robotModelStore="robotModelStore"
        :motionStore="motionStore"
      />
      <!-- 当前hover关节提示容器 -->
      <HoverJointTipUI
        :currentHoverJointTip="currentHoverJointTip"
        :dataPanel="dataPanel"
        :isDarkTheme="isDarkTheme"
        :textColor="textColor"
      />
      <!-- 关节姿态球容器 -->
      <JointQuatSphereUI
        :jointQuatSphere="jointQuatSphere"
        :viewer="viewer"
        :isDarkTheme="isDarkTheme"
        :textColor="textColor"
        :api="api"
        :dragJointSettingsPanel="dragJointSettingsPanel"
        :robotModelStore="robotModelStore"
      />
      <!-- 悬浮菜单 -->
      <FloatingMenuUI
        :jointFloatingMenu="jointFloatingMenu"
        :isDarkTheme="isDarkTheme"
        :urdfView="urdfView"
      />
      <!-- 中心菜单 -->
      <CenterMenuUI :windowStore="windowStore" :isDarkTheme="isDarkTheme" />
    </div>
    <!-- 全局透明遮罩，用于菜单点击空白关闭 -->
    <div
      v-if="windowStore.overlayVisible"
      class="motion-editor-overlay-mask"
      @click="windowStore.triggerOverlayClick()"
    ></div>
    <!-- 轨迹面板层 -->
    <PathPanelUI
      :pathPanel="pathPanel"
      :isDarkTheme="isDarkTheme"
      :textColor="textColor"
      :viewer="viewer"
      :robotModelStore="robotModelStore"
      :selectedFieldStore="selectedFieldStore"
      :motionStore="motionStore"
      :windowStore="windowStore"
      :jointQuatSphere="jointQuatSphere"
    />
    <!-- 全局提醒内容层 -->
    <FullPageWarningUI :fullPageWarning="fullPageWarning" :windowStore="windowStore" />
    <!-- 加载层 -->
    <LoadingUI
      :robotModelStore="robotModelStore"
      :motionStore="motionStore"
      :windowStore="windowStore"
      :themeStore="themeStore"
      :isDarkTheme="isDarkTheme"
    />
    <!-- 正在进行的操作（全局遮罩） -->
    <LoadingOverlayUI :windowStore="windowStore" :themeStore="themeStore" />
  </div>
</template>

<script setup lang="ts">
// Vue 核心
import { onMounted, ref, reactive, nextTick, onUnmounted, watch, Ref, computed } from 'vue'

// 第三方库
import { debounce, throttle } from 'lodash-es'
import * as THREE from 'three'

// 类型定义
import type {
  Vector3Like,
  FrameLike,
  MotionJSON,
  ParsedMotion,
} from './MotionEditorComponents/tools/motionEditorTools'

// 工具函数 - motionEditorTools
import {
  initQuatSphere,
  initJointQuatSphere,
  createLineChart,
  focusBVHFrontView,
  init,
  api,
  initAPI,
  convertBVHToMotionJSON,
  initThreeJSAPI,
  downloadStringAsFile,
  convertMotionJSONToBVH,
  setIsBVH,
  smoothData as tool_smoothData,
  rippleAdjust,
  transformPath,
  saveStringAsJSON,
  getZeroArr,
  rotateTrajectory,
  rotateTrajectoryEuler,
  rippleAdjustEulerObject,
  calculateBVHJointGlobalEuler,
  calculateBVHJointLocalEuler,
  sf,
} from './MotionEditorComponents/tools/motionEditorTools'
import type { IFrame, IQuater } from './MotionEditorComponents/tools/motionEditorTools'

import DevtoolsGuardUI from './MotionEditorComponents/DevtoolsGuard.vue'

// 3D 视图器组件
import MotionEditor3DViewer from './MotionEditorComponents/3DViewer/MotionEditor3DViewer.vue'

// 状态管理 - Pinia
import {
  useViewerStore,
  useRobotModelStore,
  useWindowStore,
  useMotionStore,
  useSelectedFieldStore,
  useWithDrawStore,
  resetAllStores,
} from './MotionEditorComponents/store/motionEditor.ts'
import type { IJSON } from './MotionEditorComponents/store/motionEditor.ts'
import { useThemeStore } from '@/platform/store/modules/theme'

// 编辑器模块组件 - 数据层
import { createPathPanelData, IPathPanel } from './MotionEditorComponents/pathPanel/data'
import {
  createJointQuatSphereData,
  IJointQuatSphere,
} from './MotionEditorComponents/jointQuatSphere/data'
import {
  createPositionPanelData,
  IPositionPanel,
} from './MotionEditorComponents/positionPanel/data'
import {
  createDragJointSettingsPanelData,
  IDragJointSettingsPanel,
} from './MotionEditorComponents/dragJointSettingsPanel/data'
import { createPlayerData, IPlayer } from './MotionEditorComponents/player/data'
import { createDataPanelData, IDataPanel } from './MotionEditorComponents/dataPanel/data'
import { createQuatSphereData, IQuatSphere } from './MotionEditorComponents/quatSphere/data'
import {
  createJointPositionLine3DData,
  IJointPositionLine3D,
} from './MotionEditorComponents/jointPositionLine3D/data'
import {
  createFloatingMenuData,
  IJointFloatingMenu,
} from './MotionEditorComponents/floatingMenu/data'
import {
  createCameraData,
  ICamera,
  handleShowCameraFastViewMenu,
} from './MotionEditorComponents/camera/data'
import { createWatches } from './MotionEditorComponents/watch'
import {
  createHoverJointTipData,
  IHoverJointTip,
} from './MotionEditorComponents/hoverJointTip/data'
import { createHelpData, IHelpData } from './MotionEditorComponents/help/data.ts'
import {
  createFullPageWarningData,
  type IFullPageWarning,
} from './MotionEditorComponents/fullPageWarning/data.ts'

// 编辑器模块组件 - UI 层
import PathPanelUI from './MotionEditorComponents/pathPanel/UI.vue'
import JointQuatSphereUI from './MotionEditorComponents/jointQuatSphere/UI.vue'
import PositionPanelUI from './MotionEditorComponents/positionPanel/UI.vue'
import DragJointSettingsPanelUI from './MotionEditorComponents/dragJointSettingsPanel/UI.vue'
import PlayerUI from './MotionEditorComponents/player/UI.vue'
import LoadingUI from './MotionEditorComponents/loading/UI.vue'
import DataPanelUI from './MotionEditorComponents/dataPanel/UI.vue'
import QuatSphereUI from './MotionEditorComponents/quatSphere/UI.vue'
import ToolBarUI from './MotionEditorComponents/toolBar/UI.vue'
import FloatingMenuUI from './MotionEditorComponents/floatingMenu/UI.vue'
import HoverJointTipUI from './MotionEditorComponents/hoverJointTip/UI.vue'
import LoadingOverlayUI from './MotionEditorComponents/loadingOverlay/UI.vue'
import CenterMenuUI from './MotionEditorComponents/centerMenu/UI.vue'
import scrollView from './MotionEditorComponents/scrollView/UI.vue'
import FullPageWarningUI from './MotionEditorComponents/fullPageWarning/UI.vue'

// 图标资源
import SVGFixed from '@/assets/svg/motion-editor-fixed.svg'

const themeStore = useThemeStore()
const viewerStore = useViewerStore()
const robotModelStore = useRobotModelStore()
const windowStore = useWindowStore()
const motionStore = useMotionStore()
const selectedFieldStore = useSelectedFieldStore()
const withDrawStore = useWithDrawStore()

const isDarkTheme = ref(themeStore.isDark)
const textColor = ref('#000')

const jointPositionRangeBar = ref<{
  value: HTMLElement | null
}>({
  value: null,
})
const dataListScrollRef = ref<HTMLElement | null>(null)
const pathPanelScrollRef = ref<HTMLElement | null>(null)
const mainContainer = ref(null)
const controlsContainer = ref(null)
const positionPanelContainer = ref(null)
const viewer = ref<any>(null)
const dragJointSettingsPanelContainer = ref(null)
const dataAPIRef = ref<any>(null)

let pathPanel: Ref<IPathPanel> = null as any
let jointQuatSphere: Ref<IJointQuatSphere> = null as any
let positionPanel: Ref<IPositionPanel> = null as any
let dragJointSettingsPanel: Ref<IDragJointSettingsPanel> = null as any
let player: Ref<IPlayer> = null as any
let dataPanel: Ref<IDataPanel> = null as any
let quatSphere: Ref<IQuatSphere> = null as any
let jointPositionLine3D: Ref<IJointPositionLine3D> = null as any
let jointFloatingMenu: Ref<IJointFloatingMenu> = null as any
let camera: Ref<ICamera> = null as any
let currentHoverJointTip: Ref<IHoverJointTip> = null as any
let help: Ref<IHelpData> = null as any
let fullPageWarning: Ref<IFullPageWarning> = null as any

const isMounted = ref(false)

const loadingStates = reactive({
  isLoadingRobot: false,
  isLoadingMotion: false,
  isProcessingData: false,
  loadingProgress: 0,
  loadingMessage: '加载中...',
})

const urdfLoadingData = reactive({
  urdfPath: '',
  packagePath: '',
  jsonPath: '',
  urlModifier: undefined as ((url: string) => string) | undefined,
})

interface URDFViewer extends HTMLElement {
  loadMeshFunc?: (
    url: string,
    manager: THREE.LoadingManager,
    onLoad: (object: THREE.Object3D) => void
  ) => void
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
  controls: {
    addEventListener: (type: string, listener: EventListener) => void
    removeEventListener: (type: string, listener: EventListener) => void
  }
  robot: Record<string, unknown>
  scene?: THREE.Scene
  renderer?: THREE.WebGLRenderer
}

interface QuatSphereAPI {
  setRotation: (
    data: { x: number; y: number; z: number; w: number } | { x: number; y: number; z: number }
  ) => void
  setQuaternion: (q: { x: number; y: number; z: number; w: number }) => void
  setEuler: (euler: { x: number; y: number; z: number }) => void
  getRotation: () =>
    | { x: number; y: number; z: number; w: number }
    | { x: number; y: number; z: number }
  getQuaternion: () => { x: number; y: number; z: number; w: number }
  setCameraByQuaternion: (
    qInput: { x: number; y: number; z: number; w: number },
    options?: { distance?: number | null; forwardAxis?: THREE.Vector3 }
  ) => void
  dispose?: () => void
}

interface LineChartAPI {
  updateData: (opts: { data?: number[]; yMin?: number; yMax?: number }) => void
  setMarker: (value: number) => void
  setYAxis: (min: number, max: number) => void
  redraw: () => void
  destroy: () => void
}

interface BVHAdapt {
  orientationFieldName?: string
  positionScale?: number
}

interface ChartEvent {
  xLabel: number
  yValue: number
  yAtCursor?: number
  isContainer?: boolean
  offsetX?: number
  offsetY?: number
}

interface WheelEventWithDelta extends WheelEvent {
  delta: number
}

interface IBasePositionLine {
  orientationAxis: string
  frameSkip: number
  showMenu: boolean
  handleShow: () => void
  handleHide: () => void
  handleUpdate: () => void
}

interface SelectedJointContext {
  jointName: string
  selectedField: string
  fieldBaseName: string
}

interface IJointPositionLine {
  currentJointName: string | null
  lastJointName: string | null
  cachedPositions: Vector3Like[]
  isVisible: boolean
  needsRecompute: boolean
  isComputing: boolean
  computePromise: Promise<boolean> | null
  handleShow: (forceRecompute?: boolean) => Promise<void>
  handleHide: () => void
  handleUpdate: () => void
  showForJoint: (jointName: string) => Promise<void>
}

const CONSTANTS = {
  THROTTLE_DELAY: 16,
  DEBOUNCE_DELAY: 300,
  CONTAINER_LEFT_WIDTH: 320,
  CONTAINER_RIGHT_WIDTH: 240,
  QUAT_SPHERE_SIZE: 240,
  TRANSITION_DURATION: 300,
  HOVER_DELAY: 1000,
  DEFAULT_FRAME_RATE: 30,
  DEFAULT_PLAYBACK_SPEED: 1,
  MIN_FRAME_INDEX: 0,
} as const

const emit = defineEmits(['onSave', 'onLoaded', 'onMotionJSONEdited'])

const handleSyncError = <T,>(
  operation: () => T,
  errorMessage: string,
  fallback?: T
): T | undefined => {
  try {
    return operation()
  } catch (error) {
    console.error(`${errorMessage}:`, error)
    return fallback
  }
}

const scrollToJoint = (containerRef: HTMLElement | null, jointName: string) => {
  if (!containerRef || !jointName) return
  if (jointName.includes('global_') || jointName.includes('quater_')) return
  const targetElement = containerRef.querySelector(
    `[data-joint-name="${jointName}"]`
  ) as HTMLElement
  if (!targetElement) return
  const containerHeight = containerRef.clientHeight
  const elementTop = targetElement.offsetTop
  const elementHeight = targetElement.clientHeight
  const scrollTop = elementTop - containerHeight / 2 + elementHeight / 2
  containerRef.scrollTop = scrollTop
}

const setLoadingState = (
  type: 'isLoadingRobot' | 'isLoadingMotion' | 'isProcessingData',
  value: boolean,
  message?: string
) => {
  loadingStates[type] = value
  if (message) {
    loadingStates.loadingMessage = message
  }
}

const showLoadingProgress = (progress: number, message: string) => {
  loadingStates.loadingProgress = Math.max(0, Math.min(100, progress))
  loadingStates.loadingMessage = message
}

const handleShowAttenIndicate = (isLeft = true, radius = 0) => {
  if (attenIndicateTimer.value) {
    clearTimeout(attenIndicateTimer.value)
  }
  attenIndicateTimer.value = setTimeout(() => {}, 10)
}

const handle3DViewerReady = (e: any) => {
  console.log('3D Viewer ready', e)
  viewerStore.setViewerOnReadyOutput(e)
}

const handle3DViewerLoaded = (e: any) => {
  console.log('3D Viewer loaded', e)
  if (e.isBVH) {
    setIsBVH(true)
    robotModelStore.setIsBVH(true)
    motionStore.setMotionJSON(e.bvhMotionJSON as MotionJSON)
  } else {
    setIsBVH(false)
    robotModelStore.setIsBVH(false)
  }
  dataAPIRef.value = e.dataAPI
  initThreeJSAPI(e.threeAPI)
  initViewer(e.viewer)
  initAPI(e.viewer as any)
  robotModelStore.select()
  camera.value.toDefaultPosition()
  jointPositionLine3D.value.init()
  nextTick(() => {
    setTimeout(() => {
      const quatSphereElement = document.getElementById('quat-sphere')
      if (quatSphereElement) {
        quatSphere.value.init()
      } else {
        console.warn('quat-sphere element not found, retrying...')
        setTimeout(() => {
          quatSphere.value.init()
        }, 100)
      }
    }, 10)
  })
  setTimeout(() => {
    if (
      motionStore.currentFrameIndex === -1 &&
      motionStore.motionData?.parsed &&
      motionStore.motionData.parsed.length > 0 &&
      api.robot.getObject()
    ) {
      motionStore.setCurrentFrameIndex(0)
      const firstFrame = motionStore.getCurrentFrame() as FrameLike
      if (firstFrame) {
        api.robot.setFrame(firstFrame)
        api.forceRender()
      }
    }

    setTimeout(() => {
      player.value.refreshRate.init()
      viewerStore.setGridVisible(true)
      windowStore.markLoaded()

      emit('onLoaded', {
        getMotionJSON() {
          return getSaveMotionJSON()
        },
      })

      setTimeout(() => {
        if (!localStorage.getItem('motion-editor-do-not-show-help')) {
          help.value.show = true
        }
      }, 300)
    }, 200)
  }, 100)
}

const handleLoadJSON = async () => {
  const json = (await api.selectAndReadJSON()) as MotionJSON
  motionStore.setMotionJSON(json, true)
  setTimeout(() => {
    windowStore.markLoaded()
  }, 1000)
}

const getJointBaseName = (jointName: string) => {
  if (!jointName) return ''
  const match = jointName.match(/^(.*?)(?:_(?:rx|ry|rz|x|y|z))?$/i)
  return match ? match[1] : jointName
}

const getAvailableJointFields = (baseName: string, suffixes: string[]) => {
  if (!baseName) return []
  const availableFields = Array.isArray(motionStore.JSON?.dof_names)
    ? motionStore.JSON.dof_names
    : []
  return suffixes
    .map(suffix => {
      const field = `${baseName}${suffix}`
      return availableFields.includes(field)
        ? {
            field,
            suffix,
            label: suffixLabelMap[suffix] ?? suffix.replace('_', '').toUpperCase(),
          }
        : null
    })
    .filter((item): item is { field: string; suffix: string; label: string } => Boolean(item))
}

const resolveSelectedJointContext = (
  jointNameOverride?: string | null
): SelectedJointContext | null => {
  const normalizeJointName = (name: string | null | undefined) =>
    name ? name.replace(/^mixamorig:/i, '').toLowerCase() : ''
  const availableJointNames = handleSyncError<string[]>(
    () => api.robot.jointPosition.getAvailableJointNames(),
    '关节轨迹线获取关节列表失败',
    []
  ) as string[]
  const resolveFromBaseName = (
    baseName: string,
    selectedFieldName: string
  ): SelectedJointContext | null => {
    if (!baseName) return null
    let resolvedJointName = baseName
    if (
      robotModelStore.isBVH &&
      Array.isArray(availableJointNames) &&
      availableJointNames.length > 0
    ) {
      const normalizedTarget = normalizeJointName(baseName)
      const matched = availableJointNames.find(
        name => normalizeJointName(name) === normalizedTarget
      )
      if (matched) {
        resolvedJointName = matched
      }
    }
    if (
      Array.isArray(availableJointNames) &&
      availableJointNames.length > 0 &&
      !availableJointNames.includes(resolvedJointName)
    ) {
      return null
    }
    return {
      jointName: resolvedJointName,
      selectedField: selectedFieldName,
      fieldBaseName: baseName,
    }
  }
  if (jointNameOverride) {
    const baseName = jointNameOverride
    const availableFields = Array.isArray(motionStore.JSON?.dof_names)
      ? motionStore.JSON.dof_names
      : []
    let selectedFieldName = jointNameOverride
    if (!availableFields.includes(selectedFieldName)) {
      const candidates = [
        ...getAvailableJointFields(baseName, ['_x', '_y', '_z']),
        ...getAvailableJointFields(baseName, ['_rx', '_ry', '_rz']),
      ]
      if (candidates.length > 0) {
        selectedFieldName = candidates[0].field
      }
    }
    return resolveFromBaseName(baseName, selectedFieldName)
  }
  const selectedField = selectedFieldStore.selectedFieldName
  if (!selectedField) return null
  if (selectedField.startsWith('global_') || selectedField.startsWith('quater_')) return null
  const match = selectedField.match(/^(.*)_(x|y|z)$/i)
  const selectedJointName = match ? match[1] : selectedField
  return resolveFromBaseName(selectedJointName, selectedField)
}

const renderJointTrajectoryForContext = async (
  target: IJointPositionLine,
  context: SelectedJointContext
): Promise<boolean> => {
  const previousOperatingText = windowStore.getOperatingText?.() ?? ''
  const restoreOperatingText = () => {
    windowStore.setOperatingText('')
  }
  const frames = (motionStore.motionData?.parsed || []) as FrameLike[]
  const totalFrames = frames.length
  if (windowStore.setOperatingText) {
    windowStore.setOperatingText(`正在绘制关节位置线... `)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  try {
    const jointPositionAPI = api.robot.jointPosition.JointPositionLine as unknown as {
      setFromPositions?: (
        jointName: string,
        positions: Vector3Like[],
        options?: { onPointClick?: (index: number) => void; clickPixelThreshold?: number }
      ) => boolean
      set: (
        jointName: string,
        frames: FrameLike[],
        options?: { onPointClick?: (index: number) => void; clickPixelThreshold?: number }
      ) => boolean
    }
    const trySetFromPositionsBatched = async () => {
      const positions = await buildJointTrajectoryPositionsBatched(context, (current, total) => {
        if (windowStore.setOperatingText) {
          const percentage = Math.round((current / total) * 100)
          windowStore.setOperatingText(`正在绘制关节位置线... `)
        }
      })
      if (positions.length === 0) {
        return false
      }
      target.cachedPositions = positions
      return typeof jointPositionAPI.setFromPositions === 'function'
        ? jointPositionAPI.setFromPositions(context.jointName, positions)
        : false
    }
    let success = false
    if (typeof jointPositionAPI.set === 'function') {
      success = jointPositionAPI.set(context.jointName, frames)
      target.cachedPositions = []
    }
    if (!success) {
      success = await trySetFromPositionsBatched()
    }
    if (!success) {
      return false
    }
    target.currentJointName = context.jointName
    target.lastJointName = context.jointName
    target.isVisible = true
    setTimeout(() => {
      api.robot.jointPosition.JointPositionLine.updateCurrentFrameMarker(
        motionStore.currentFrameIndex
      )
    }, 10)
    return true
  } catch (error) {
    console.error(`渲染关节 "${context.jointName}" 轨迹失败:`, error)
    return false
  } finally {
    restoreOperatingText()
  }
}

const hasSelectedFieldData = (fieldName: string): boolean => {
  const frames = motionStore.motionData?.parsed as FrameLike[] | undefined
  if (!frames || frames.length === 0) return false
  const checkField = (name: string | null | undefined) => {
    if (!name) return false
    return frames.some(frame => {
      const value = (frame as Record<string, unknown>)[name]
      return typeof value === 'number' && !Number.isNaN(value)
    })
  }
  if (checkField(fieldName)) return true
  const baseName = getJointBaseName(fieldName)
  if (!baseName) return false
  const suffixCandidates = ['_x', '_y', '_z', '_rx', '_ry', '_rz']
  return suffixCandidates.some(suffix => checkField(`${baseName}${suffix}`))
}

const buildJointTrajectoryPositionsBatched = async (
  context: SelectedJointContext,
  onProgress?: (current: number, total: number) => void
): Promise<Vector3Like[]> => {
  const frames = motionStore.motionData?.parsed as FrameLike[] | undefined
  if (!frames || frames.length === 0) return []
  const isBVHModel = robotModelStore.isBVH
  const jointName = context.jointName
  const positions: Vector3Like[] = new Array(frames.length)
  let lastValidPosition: Vector3Like | null = null
  const restoreFrame = isBVHModel
    ? (motionStore.getCurrentFrame() as FrameLike | undefined)
    : undefined
  try {
    if (isBVHModel) {
      const metadata = (motionStore.motionData as any)?.bvhMetadata
      if (metadata) {
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            const batchResults = (api.robot.jointPosition as any)._calculateBVHJointPositionBatch(
              jointName,
              frames,
              metadata
            )
            for (let i = 0; i < batchResults.length; i++) {
              const result = batchResults[i]
              if (result && result.position) {
                const storedPosition: Vector3Like = {
                  x: result.position.x,
                  y: result.position.y,
                  z: result.position.z,
                }
                positions[i] = storedPosition
                lastValidPosition = storedPosition
              } else if (lastValidPosition) {
                positions[i] = { ...lastValidPosition }
              } else {
                const zeroPosition: Vector3Like = { x: 0, y: 0, z: 0 }
                positions[i] = { ...zeroPosition }
                lastValidPosition = { ...zeroPosition }
              }
            }
            if (onProgress) {
              onProgress(frames.length, frames.length)
            }
            resolve()
          })
        })
        return positions
      }
    }
    const BATCH_SIZE = 50
    const totalBatches = Math.ceil(frames.length / BATCH_SIZE)
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          const startIdx = batchIndex * BATCH_SIZE
          const endIdx = Math.min(startIdx + BATCH_SIZE, frames.length)
          for (let i = startIdx; i < endIdx; i++) {
            const frame = frames[i]
            const jointInfo = handleSyncError(
              () => api.robot.jointPosition.get(jointName, frame as FrameLike, true),
              `获取关节 ${jointName} 空间位置失败`
            )
            if (jointInfo && jointInfo.position) {
              const rawPosition = jointInfo.position as Vector3Like
              const storedPosition = {
                x: rawPosition.x,
                y: rawPosition.y,
                z: rawPosition.z,
              }
              positions[i] = storedPosition
              lastValidPosition = storedPosition
            } else if (lastValidPosition) {
              positions[i] = { ...lastValidPosition }
            } else {
              const zeroPosition: Vector3Like = { x: 0, y: 0, z: 0 }
              positions[i] = { ...zeroPosition }
              lastValidPosition = { ...zeroPosition }
            }
          }
          if (onProgress) {
            onProgress(endIdx, frames.length)
          }
          resolve()
        })
      })
    }
  } finally {
    if (isBVHModel && restoreFrame) {
      handleSyncError(
        () => api.robot.setFrame(restoreFrame as FrameLike),
        '恢复BVH机器人当前帧失败'
      )
    }
  }
  return positions
}

const handleURDFProcessed = () => {
  setTimeout(async () => {
    robotModelStore.select()
    api.forceRender()
  }, 10)
}

const handleMouseGlobalMove = (e: MouseEvent) => {
  player.value.move.handleMousemove(e)
  pathPanel.value.location.mousemove.handleMove(e)
  pathPanel.value.resize.handleMove(e)
  positionPanel.value.position.handleMove(e)
  positionPanel.value.offset.handleMove()
  dragJointSettingsPanel.value.position.handleMove(e)
  pathPanel.value.location.edge.handleMove(e)
  pathPanel.value.multiple.handleMove(e)
  jointQuatSphere.value.position.handleMove(e)
  jointPositionLine3D.value.range.handleMove(e)
  jointPositionLine3D.value.range.handleMoveGroupDrag(e)
}

const handleMouseGlobalUp = () => {
  player.value.move.handleEnd()
  pathPanel.value.location.mousemove.handleEnd()
  pathPanel.value.resize.handleEnd()
  positionPanel.value.position.handleEnd()
  positionPanel.value.offset.handleEnd()
  quatSphere.value.pathReorientation.handleEnd()
  dragJointSettingsPanel.value.position.handleEnd()
  dragJointSettingsPanel.value.drag.handleEnd()
  quatSphere.value.spread.handleEnd()
  pathPanel.value.location.edge.handleEnd()
  pathPanel.value.multiple.handleEnd()
  jointQuatSphere.value.position.handleEnd()
  jointQuatSphere.value.move.handleEnd()
  jointPositionLine3D.value.range.handleEnd()
  jointPositionLine3D.value.range.handleMoveGroupEnd()
}

const handleMouseGlobalLeave = () => {
  player.value.move.handleEnd()
  pathPanel.value.location.mousemove.handleEnd()
  pathPanel.value.resize.handleEnd()
  positionPanel.value.position.handleEnd()
  positionPanel.value.offset.handleEnd()
  quatSphere.value.pathReorientation.handleEnd()
  dragJointSettingsPanel.value.position.handleEnd()
  dragJointSettingsPanel.value.drag.handleEnd()
  quatSphere.value.spread.handleEnd()
  pathPanel.value.location.edge.handleEnd()
  pathPanel.value.multiple.handleEnd()
  jointQuatSphere.value.position.handleEnd()
  jointQuatSphere.value.move.handleEnd()
  jointPositionLine3D.value.range.handleEnd()
  jointPositionLine3D.value.range.handleMoveGroupEnd()
}

const handleCloseAllMenu = () => {
  camera.value.track.showMenu = false
  player.value.xSpeed.showMenu = false
  player.value.refreshRate.showMenu = false
  saveType.value.showMenu = false
  basePositionLine.value.showMenu = false
}

const handleCameraMove = () => {
  if (camera.value.ignoreNextCameraMove) {
    camera.value.ignoreNextCameraMove = false
    return
  }

  // 只有当鼠标左键按下（通常是旋转）或者中键/右键按下（平移）时触发的相机移动才切换回透视
  // OrbitControls 的 change 事件本身不包含鼠标状态，需要额外判断
  // 我们通过检查 viewer 上的鼠标状态来判断是否是用户交互导致的

  // 检查是否是因为用户拖拽导致的相机变化
  const isUserInteracting = (viewer.value?.controls as any)?.state !== -1 // -1 is NONE

  if (camera.value.isOrthographicFromGizmo && isUserInteracting) {
    // camera.value.change('perspective')
    camera.value.isOrthographicFromGizmo = false
    return
  }

  camera.value.handleMove()
  if (
    motionStore.playStatus === 0 &&
    player.value.move.moving === false &&
    player.value.keyDownChangeFrame.used === false
  )
    motionStore.setPlayStartCameraQuaterAndDistance()
}

const handleQuatSphereLabelClick = (axis: 'X' | 'Y' | 'Z', sign: 1 | -1) => {
  // Safely get robot position using the API which returns {x,y,z}
  const robotPosData = api.robot.position.get()
  const robotPosition = new THREE.Vector3(
    robotPosData?.x ?? 0,
    robotPosData?.y ?? 0,
    robotPosData?.z ?? 0
  )

  const distance = api.camera.getToBaseDistance() || 2

  const axisVec = new THREE.Vector3(
    axis === 'X' ? 1 : 0,
    axis === 'Y' ? 1 : 0,
    axis === 'Z' ? 1 : 0
  )
  const viewDir = axisVec.clone().multiplyScalar(sign) // The direction we want to face
  const cameraPos = robotPosition.clone().sub(viewDir.multiplyScalar(distance))

  // 确保“相机-焦点”连线严格平行于所看的轴向
  // - 看向 ±X / ±Z：保持水平，y 与模型根一致，避免地面倾斜
  // - 看向 ±Y：保持竖直，x/z 与模型根一致，避免偏斜
  if (axis === 'X' || axis === 'Z') {
    cameraPos.y = robotPosition.y
    ;(api.camera as any).up?.set?.(0, 1, 0)
  } else if (axis === 'Y') {
    cameraPos.x = robotPosition.x
    cameraPos.z = robotPosition.z
    ;(api.camera as any).up?.set?.(0, 0, 1)
  }

  // 先标记忽略下一次相机移动事件，再设定位置与目标
  camera.value.isOrthographicFromGizmo = true
  camera.value.ignoreNextCameraMove = true

  api.camera.position.set(cameraPos)
  api.camera.target.set(robotPosition)

  // 立即同步状态并切换正交
  camera.value.type.change('orthographic')
  if (viewer.value?.controls) {
    viewer.value.controls.update()
  }
  setTimeout(() => {
    camera.value.handleMove()
  }, 10)
}

let editorResizeObserver: ResizeObserver | null = null
const updateMainContainerSize = () => {
  const el = mainContainer.value as HTMLElement | null
  if (!el) return
  const rect = el.getBoundingClientRect()
  windowStore.setEditorSize(Math.round(rect.width), Math.round(rect.height))
}
const attachEditorResizeObserver = () => {
  const el = mainContainer.value as HTMLElement | null
  if (!el) return
  if (editorResizeObserver) {
    editorResizeObserver.disconnect()
  }
  editorResizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      windowStore.setEditorSize(Math.round(width), Math.round(height))
    }
  })
  editorResizeObserver.observe(el)
}

const handleWindowSizeChange = () => {
  if (motionStore.playStatus === 1) return
  updateMainContainerSize()
  pathPanel.value.location.refreshScrollContainerWidth()
  handleModifyWindowsLocation()
  handleViewerSizeChange()
}

const handleModifyWindowsLocation = () => {
  positionPanel.value.position.handleModifyPosition()
  dragJointSettingsPanel.value.position.handleModify()
  jointQuatSphere.value.position.handleModify()
}

const handleViewerSizeChange = () => {}

const handleRobotAngleChange = (e: { jointName: string; angle: number }) => {
  if (motionStore.playStatus !== 0 || player.value.move.moving || pathPanel.value.move.moving)
    return
  try {
    const isURDFDragging = isJointManipulating.value || viewerJointControl.value?.urdf?.moving
    const jointName = e.jointName
    const jointData = e.angle
    if (!isURDFDragging) {
      // 非拖拽态仍保持立即更新 + 轨迹刷新
      motionStore.frame_changeCurrentValue(jointName, jointData)
      pathPanel.value.handleUpDateData()
      jointPositionLine.value.handleUpdate()
      if (hasVisibleJointPositionLine3D()) {
        recomputeJointPositionLine3D(
          (() => {
            if (dragJointSettingsPanel.value.spread.before.selected === 0) {
              return 0
            }
            if (dragJointSettingsPanel.value.spread.before.selected === 1) {
              return (
                motionStore.currentFrameIndex -
                dragJointSettingsPanel.value.spread.before.radius -
                2
              )
            }
            return motionStore.currentFrameIndex - 1
          })(),
          (() => {
            if (dragJointSettingsPanel.value.spread.after.selected === 0) {
              return motionStore.frame_getNum() - 1
            }
            if (dragJointSettingsPanel.value.spread.after.selected === 1) {
              return (
                motionStore.currentFrameIndex + dragJointSettingsPanel.value.spread.after.radius + 1
              )
            }
            return motionStore.currentFrameIndex
          })()
        )
      }
      return
    }

    const frameIndex = motionStore.currentFrameIndex
    const currentValue = motionStore.motionData?.parsed?.[frameIndex]?.[jointName]
    const isKeyframe = motionStore.isKeyframe(jointName, frameIndex)

    if (!isKeyframe) {
      jointManipulationContext.value = {
        jointName,
        frameIndex,
        originalValue: typeof currentValue === 'number' ? currentValue : null,
        isKeyframe: false,
        handleSnapshot: null,
      }
      jointManipulationDidChange.value = false
      pendingJointPositionLineRefresh = false
      pendingURDFAngle = null
      return
    }

    if (
      !jointManipulationContext.value ||
      jointManipulationContext.value.jointName !== jointName ||
      jointManipulationContext.value.frameIndex !== frameIndex
    ) {
      const handle = motionStore.getKeyframeHandle(jointName, frameIndex)
      jointManipulationContext.value = {
        jointName,
        frameIndex,
        originalValue: typeof currentValue === 'number' ? currentValue : null,
        isKeyframe: true,
        handleSnapshot:
          handle && typeof currentValue === 'number'
            ? {
                type: handle.type,
                in: handle.in
                  ? { dx: handle.in.x - frameIndex, dy: handle.in.y - currentValue }
                  : undefined,
                out: handle.out
                  ? { dx: handle.out.x - frameIndex, dy: handle.out.y - currentValue }
                  : undefined,
              }
            : null,
      }
    } else {
      jointManipulationContext.value.isKeyframe = true
    }

    lastManipulatedJoint = { name: jointName, frameIndex }

    // 拖拽态：恢复衰减写入（ripple），同时保持节流刷新策略
    jointManipulationDidChange.value = true
    dragJointSettingsPanel.value?.drag?.handleStart?.(jointName)
    dragJointSettingsPanel.value?.drag?.handleMove?.(jointData)
    // 兼容现有节流：记录最新值用于当前帧快速刷新与 3D 线延迟计算
    pendingURDFAngle = { jointName, angle: jointData }
    scheduleURDFAngleFlush()
    scheduleJointLineComputeDuringDrag()
    schedulePathPanelUpdateDuringDrag()
  } catch (err) {
    console.log(err)
  }
}

const handleJointManipulateStart = () => {
  console.log('rotate start')
  isJointManipulating.value = true
  jointManipulationDidChange.value = false
  pendingJointPositionLineRefresh = false
  pendingURDFAngle = null
  jointManipulationContext.value = null
  if (urdfDragThrottleTimer) {
    clearTimeout(urdfDragThrottleTimer)
    urdfDragThrottleTimer = null
  }
  if (urdfLineThrottleTimer) {
    clearTimeout(urdfLineThrottleTimer)
    urdfLineThrottleTimer = null
  }
  if (pathPanelThrottleTimer) {
    clearTimeout(pathPanelThrottleTimer)
    pathPanelThrottleTimer = null
  }
}

const handleJointManipulateEnd = () => {
  console.log('rotate end')
  isJointManipulating.value = false
  if (urdfDragThrottleTimer) {
    clearTimeout(urdfDragThrottleTimer)
    urdfDragThrottleTimer = null
  }
  if (urdfLineThrottleTimer) {
    clearTimeout(urdfLineThrottleTimer)
    urdfLineThrottleTimer = null
  }
  if (pathPanelThrottleTimer) {
    clearTimeout(pathPanelThrottleTimer)
    pathPanelThrottleTimer = null
  }

  const manipulationContext = jointManipulationContext.value
  if (manipulationContext && !manipulationContext.isKeyframe) {
    pendingURDFAngle = null
    jointManipulationDidChange.value = false
    pendingJointPositionLineRefresh = false
    api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
    api.forceRender()
    jointManipulationContext.value = null
    return
  }

  flushURDFAngle(true, manipulationContext)

  // 先更新轨迹面板（包含贝塞尔曲线）再刷新 3D 位置线
  pathPanel.value.handleUpDateData()

  if (lastManipulatedJoint && hasVisibleJointPositionLine3D()) {
    const range = getAlignedLikeRecomputeRange(
      lastManipulatedJoint.name,
      lastManipulatedJoint.frameIndex
    )
    recomputeJointPositionLine3D(range.start, range.end)
    lastManipulatedJoint = null
  } else {
    lastManipulatedJoint = null
  }

  const needLineRefresh = pendingJointPositionLineRefresh || jointManipulationDidChange.value
  pendingJointPositionLineRefresh = false
  if (viewerStore.isJointPositionLineVisible && needLineRefresh) {
    jointPositionLine.value.handleUpdate()
  }
  if (hasVisibleJointPositionLine3D() && needLineRefresh) {
    recomputeJointPositionLine3D(
      (() => {
        if (dragJointSettingsPanel.value.spread.before.selected === 0) {
          return 0
        }
        if (dragJointSettingsPanel.value.spread.before.selected === 1) {
          return (
            motionStore.currentFrameIndex - dragJointSettingsPanel.value.spread.before.radius - 2
          )
        }
        return motionStore.currentFrameIndex - 1
      })(),
      (() => {
        if (dragJointSettingsPanel.value.spread.after.selected === 0) {
          return motionStore.frame_getNum() - 1
        }
        if (dragJointSettingsPanel.value.spread.after.selected === 1) {
          return (
            motionStore.currentFrameIndex + dragJointSettingsPanel.value.spread.after.radius + 1
          )
        }
        return motionStore.currentFrameIndex
      })()
    )
  }
  if (jointManipulationDidChange.value) {
    pathPanel.value.handleUpDateData()
  }
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!target) return false
  const el = target as HTMLElement
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

const handleTimelineNavigationHotkey = (e: KeyboardEvent) => {
  if (pathPanel.value.show !== 2) return false
  if (!(e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return false
  if (isEditableTarget(e.target)) return false
  // if (e.shiftKey && !e.ctrlKey && !e.altKey) {
  //   pathPanel.value.location.handleKeyboardPan(e.code === 'ArrowRight' ? 1 : -1)
  //   e.preventDefault()
  //   return true
  // }
  // if (e.ctrlKey && !e.shiftKey && !e.altKey) {
  //   pathPanel.value.location.handleKeyboardZoom(
  //     e.code === 'ArrowRight' ? 1 : -1,
  //     motionStore.currentFrameIndex
  //   )
  //   e.preventDefault()
  //   return true
  // }
  return false
}

const handleKeyGlobalDown = (e: KeyboardEvent) => {
  const isOperating = windowStore.getOperatingText() !== ''
  if (isOperating) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (e.code === 'Space') {
    e.preventDefault()
    if (motionStore.playStatus === 1) {
      motionStore.pause()
    } else {
      motionStore.play()
    }
    return
  }
  if (handleTimelineNavigationHotkey(e)) {
    return
  }
  player.value.keyDownChangeFrame.handle(e)
  if (e.code === 'KeyZ' && e.ctrlKey) {
    withDrawStore.doWithDraw()
  }
  if (e.code === 'KeyY' && e.ctrlKey) {
    withDrawStore.handleReDo()
  }
  // if (e.code === 'AltLeft' && e.ctrlKey) {
  //   operationHsitoryPanel.value.handleShow()
  // }
  // if (e.code === 'KeyC' && e.shiftKey && !e.ctrlKey && !e.altKey) {
  //   e.preventDefault()
  //   handleShowCameraFastViewMenu({
  //     camera: camera,
  //     api: api,
  //     windowStore: windowStore,
  //     robotModelStore: robotModelStore,
  //   })
  // }
}

const handleKeyGlobalUp = (e: KeyboardEvent) => {
  if (e.code === 'AltLeft') {
    operationHsitoryPanel.value.handleKeyUp()
  }
}

const handleGridMouseEnter = (e: any) => {
  const rawName = e?.detail?.jointName ?? e?.jointName
  if (!rawName) return
  if (robotModelStore.isBVH) {
    selectedFieldStore.handleHoveredJointName(rawName)
    const tipName = rawName.replace(/_(x|y|z)$/i, '')
    currentHoverJointTip.value.handleShow(tipName)
  } else {
    selectedFieldStore.handleHoveredJointName(rawName)
    currentHoverJointTip.value.handleShow(rawName)
  }
}

const handleGridMouseLeave = (e: any) => {
  const jointName = e?.detail?.jointName
  selectedFieldStore.handleRemoveHoveredJointName()
  viewerJointControl.value.bvh.nodeInfo = undefined
  viewerJointControl.value.urdf.nodeInfo = undefined
}

const handleGridJointClick = (e: CustomEvent<{ jointName: string }>) => {
  const jointName = e?.detail?.jointName
  if (motionStore.JSON.dof_names.includes(jointName) === false) return
  if (!urdfView.value.mouseDownAndNotMove) return
  setTimeout(() => {
    jointFloatingMenu.value.handleShow(jointName)
  }, 50)
}

const initViewer = (v: URDFViewer) => {
  viewerStore.setViewer(v as any)
  viewer.value = v as any
  initAPI(v as any)
  if (typeof (v as any).addEventListener === 'function') {
    ;(v as any).addEventListener('urdf-processed', handleURDFProcessed as EventListener)
    ;(v as any).addEventListener('angle-change', ((e: Event) => {
      handleRobotAngleChange((e as CustomEvent).detail as { jointName: string; angle: number })
    }) as EventListener)
    if ((v as any).controls && typeof (v as any).controls.addEventListener === 'function') {
      ;(v as any).controls.addEventListener('change', handleCameraMove)
    }
    try {
      ;(v as any).addEventListener('grid-joint-enter', handleGridMouseEnter as EventListener)
      ;(v as any).addEventListener('grid-joint-leave', handleGridMouseLeave as EventListener)
      ;(v as any).addEventListener('grid-joint-click', (e: Event) => {
        handleGridJointClick(e as CustomEvent<{ jointName: string }>)
      })
    } catch (e) {
      console.log(e)
    }
  } else {
    console.log('使用新的Vue组件viewer，事件通过Vue绑定处理')
    if ((v as any).controls && typeof (v as any).controls.addEventListener === 'function') {
      ;(v as any).controls.addEventListener('change', handleCameraMove)
    }
  }
  document.body.addEventListener('mousemove', handleMouseGlobalMove)
  document.body.addEventListener('mouseup', handleMouseGlobalUp)
  document.body.addEventListener('mouseleave', handleMouseGlobalLeave)
  window.addEventListener('resize', handleWindowSizeChange)
  document.body.addEventListener('keydown', handleKeyGlobalDown)
  document.body.addEventListener('keyup', handleKeyGlobalUp)
}

const attenIndicateTimer = ref<NodeJS.Timeout | null>(null)

const operationHsitoryPanel = ref({
  show: false,
  fixed: false,
  isMouseIn: false,
  handleShow() {
    this.show = true
  },
  handleFixed() {
    this.fixed = true
  },
  handleHide() {
    this.show = false
    this.fixed = false
  },
  setMouseIn() {
    this.isMouseIn = true
  },
  removeMouseIn() {
    this.isMouseIn = false
    if (!this.fixed) {
      this.handleHide()
    }
  },
  handleKeyUp() {
    if (!this.isMouseIn && !this.fixed) {
      this.handleHide()
    }
  },
})

const viewerJointControl = ref({
  setEnableCameraControl(to: boolean) {
    if (viewer.value) {
      ;(viewer.value as any).setEnableControl(to)
    }
  },
  bvh: {
    mouseMove: {
      count: 0,
      lastX: 0,
      lastY: 0,
    },
    nodeInfo: undefined as any,
    moving: false,
    handleHoverBVHNode(e: any) {
      this.nodeInfo = e
    },
    handleDown(e: MouseEvent) {
      if (this.nodeInfo) {
        this.mouseMove.count = 0
        viewerJointControl.value.setEnableCameraControl(false)
        this.moving = true
        this.mouseMove.lastX = e.clientX
        this.mouseMove.lastY = e.clientY
      }
    },
    handleMove(e: MouseEvent) {
      this.mouseMove.count++
      if (this.moving) {
        const cx = e.clientX - this.mouseMove.lastX
        const cy = e.clientY - this.mouseMove.lastY
        this.mouseMove.lastX = e.clientX
        this.mouseMove.lastY = e.clientY
      }
    },
    handleUp(e: MouseEvent) {
      if (!this.moving) return
      this.moving = false
      if (this.mouseMove.count > 0) {
      } else {
        const customEvent = {
          detail: { jointName: `${this.nodeInfo?.node?.node?.name}_x` },
        } as CustomEvent<{ jointName: string }>
        handleGridJointClick(customEvent)
      }
      viewerJointControl.value.setEnableCameraControl(true)
    },
  },
  urdf: {
    mouseMove: {
      count: 0,
    },
    nodeInfo: undefined as any,
    handleHoverURDFNode(e: any) {
      this.nodeInfo = e
    },
    moving: false,
    handleDown(e: MouseEvent) {
      if (this.nodeInfo) {
        this.mouseMove.count = 0
        this.moving = true
      }
    },
    handleMove(e: MouseEvent) {
      if (!this.moving) return
      this.mouseMove.count++
      if (this.mouseMove.count === 1 && !isJointManipulating.value) {
        // 将 URDF 鼠标拖拽纳入统一的拖拽节流逻辑
        handleJointManipulateStart()
      }
    },
    handleUp(e: MouseEvent) {
      if (!this.moving) return
      this.moving = false
      if (isJointManipulating.value) {
        handleJointManipulateEnd()
      }
      if (this.mouseMove.count > 0) {
      } else {
        const customEvent = {
          detail: { jointName: this.nodeInfo?.detail?.jointName },
        } as CustomEvent<{ jointName: string }>
        handleGridJointClick(customEvent)
      }
    },
  },
})

const suffixLabelMap: Record<string, string> = {
  _x: 'X',
  _y: 'Y',
  _z: 'Z',
  _rx: 'X',
  _ry: 'Y',
  _rz: 'Z',
}

const basePositionLine: Ref<IBasePositionLine> = ref<IBasePositionLine>({
  orientationAxis: '',
  frameSkip: 0,
  showMenu: false,
  handleShow() {
    api.robot.basePositionLine.set(
      (motionStore.getBasePositionLineData() || []) as (Vector3Like | number[])[],
      null,
      {
        orientationAxis: this.orientationAxis as 'X' | 'Y' | 'Z',
        frameSkip: this.frameSkip,
        orientationValueType: robotModelStore.isBVH ? 'euler' : 'quaternion',
      }
    )
    setTimeout(() => {
      api.robot.basePositionLine.updateCurrentFrameMarker(motionStore.currentFrameIndex)
    }, 10)
  },
  handleHide() {
    api.robot.basePositionLine.remove()
  },
  handleUpdate() {
    this.frameSkip = parseInt(`${this.frameSkip}`)
    if (viewerStore.isBasePositionLineVisible) {
      api.robot.basePositionLine.set(
        (motionStore.getBasePositionLineData() || []) as (Vector3Like | number[])[],
        null,
        {
          orientationAxis: this.orientationAxis as 'X' | 'Y' | 'Z',
          frameSkip: this.frameSkip,
          orientationValueType: robotModelStore.isBVH ? 'euler' : 'quaternion',
        }
      )
      setTimeout(() => {
        api.robot.basePositionLine.updateCurrentFrameMarker(motionStore.currentFrameIndex)
      }, 10)
    }
  },
})

const isJointManipulating = ref(false)
const jointManipulationDidChange = ref(false)
let pendingJointPositionLineRefresh = false
const URDF_DRAG_THROTTLE_MS = 30
const URDF_LINE_THROTTLE_MS = 30
const PATHPANEL_THROTTLE_MS = 150
let urdfDragThrottleTimer: ReturnType<typeof setTimeout> | null = null
let urdfLineThrottleTimer: ReturnType<typeof setTimeout> | null = null
let pathPanelThrottleTimer: ReturnType<typeof setTimeout> | null = null
let pendingURDFAngle: { jointName: string; angle: number } | null = null
type HandleOffset = { dx: number; dy: number }
type JointManipulationContext = {
  jointName: string
  frameIndex: number
  originalValue: number | null
  isKeyframe: boolean
  handleSnapshot: {
    type?: any
    in?: HandleOffset
    out?: HandleOffset
  } | null
}
const jointManipulationContext = ref<JointManipulationContext | null>(null)
let lastManipulatedJoint: { name: string; frameIndex: number } | null = null

const hasVisibleJointPositionLine3D = () => {
  const line3D = viewer.value?.jointPositionLine3D
  return !!(line3D && typeof line3D.showNum === 'function' && line3D.showNum() > 0)
}

const hasAnyJointPositionLineVisible = () =>
  viewerStore.isJointPositionLineVisible || hasVisibleJointPositionLine3D()

const getAlignedLikeRecomputeRange = (fieldName: string, frameIndex: number) => {
  const totalFrames = motionStore.frame_getNum?.() ?? motionStore.getFrameCount()
  const maxIndex = Math.max(0, totalFrames - 1)
  const keyframes = (motionStore.getKeyframeIndices(fieldName) as number[]) || []

  let prev: number | null = null
  let next: number | null = null

  for (let i = 0; i < keyframes.length; i++) {
    const idx = keyframes[i]
    if (idx < frameIndex) prev = idx
    if (idx > frameIndex) {
      next = idx
      break
    }
  }

  // 当前拖动的关键帧两侧最近的关键帧点之间的曲线范围，再两侧分别扩大 1 帧
  const start = Math.max(0, (prev ?? frameIndex) - 1)
  const end = Math.min(maxIndex, (next ?? frameIndex) + 1)
  return { start, end }
}

const recomputeJointPositionLine3D = (start?: number, end?: number) => {
  const line3D = viewer.value?.jointPositionLine3D
  if (!line3D || !hasVisibleJointPositionLine3D()) return
  const total =
    motionStore.frame_getNum?.() !== undefined
      ? motionStore.frame_getNum() - 1
      : motionStore.getFrameCount
        ? motionStore.getFrameCount() - 1
        : (motionStore.motionData?.parsed?.length || 0) - 1
  if (total < 0) return
  const startIndex = Math.max(0, start ?? 0)
  const endIndex = Math.min(total, end ?? total)
  line3D.setTotal?.(total)
  if (motionStore.motionData?.parsed) {
    line3D.compute?.(startIndex, endIndex, motionStore.motionData.parsed)
  }
}

const flushURDFAngle = (
  forceUpdateLine = false,
  context: JointManipulationContext | null = jointManipulationContext.value
) => {
  if (!pendingURDFAngle) return
  const { jointName, angle } = pendingURDFAngle
  pendingURDFAngle = null
  const frameIndex = context?.frameIndex ?? motionStore.currentFrameIndex
  motionStore.frame_changeCurrentValue(jointName, angle)

  // 若当前为关键帧且有手柄快照，保持手柄相对位置不变
  if (
    forceUpdateLine &&
    context &&
    context.isKeyframe &&
    context.handleSnapshot &&
    typeof motionStore.motionData?.parsed?.[frameIndex]?.[jointName] === 'number'
  ) {
    const snap = context.handleSnapshot
    const newValue = motionStore.motionData?.parsed?.[frameIndex]?.[jointName] as number
    if (snap.in) {
      motionStore.updateKeyframeHandlePoint(
        jointName,
        frameIndex,
        'in',
        {
          x: frameIndex + snap.in.dx,
          y: newValue + snap.in.dy,
        },
        snap.type
      )
    }
    if (snap.out) {
      motionStore.updateKeyframeHandlePoint(
        jointName,
        frameIndex,
        'out',
        {
          x: frameIndex + snap.out.dx,
          y: newValue + snap.out.dy,
        },
        snap.type
      )
    }
  }
  // 节流阶段只标记，真正重算放在拖拽结束后（forceUpdateLine=true）
  if (forceUpdateLine && viewerStore.isJointPositionLineVisible) {
    jointPositionLine.value.handleUpdate()
  }
  if (forceUpdateLine && hasVisibleJointPositionLine3D()) {
    recomputeJointPositionLine3D(
      (() => {
        if (dragJointSettingsPanel.value.spread.before.selected === 0) {
          return 0
        }
        if (dragJointSettingsPanel.value.spread.before.selected === 1) {
          return (
            motionStore.currentFrameIndex - dragJointSettingsPanel.value.spread.before.radius - 2
          )
        }
        return motionStore.currentFrameIndex - 1
      })(),
      (() => {
        if (dragJointSettingsPanel.value.spread.after.selected === 0) {
          return motionStore.frame_getNum() - 1
        }
        if (dragJointSettingsPanel.value.spread.after.selected === 1) {
          return (
            motionStore.currentFrameIndex + dragJointSettingsPanel.value.spread.after.radius + 1
          )
        }
        return motionStore.currentFrameIndex
      })()
    )
  }
}

const scheduleURDFAngleFlush = () => {
  if (urdfDragThrottleTimer !== null) return
  urdfDragThrottleTimer = setTimeout(() => {
    urdfDragThrottleTimer = null
    flushURDFAngle(false)
  }, URDF_DRAG_THROTTLE_MS)
}

const scheduleJointLineComputeDuringDrag = () => {
  if (!hasAnyJointPositionLineVisible()) return
  if (urdfLineThrottleTimer !== null) return
  urdfLineThrottleTimer = setTimeout(() => {
    urdfLineThrottleTimer = null
    // 即便在拖拽中也强制重算 3D 位置线，但不刷新轨迹面板
    try {
      // if (viewerStore.isJointPositionLineVisible) {
      //   jointPositionLine.value.needsRecompute = true
      //   jointPositionLine.value.handleShow(true)
      // }
      if (hasVisibleJointPositionLine3D()) {
        // 使用 aligned 更新方法：当前关键帧两侧最近的关键帧之间的曲线范围再两侧分别扩大 1 帧
        if (lastManipulatedJoint) {
          const range = getAlignedLikeRecomputeRange(
            lastManipulatedJoint.name,
            lastManipulatedJoint.frameIndex
          )
          recomputeJointPositionLine3D(range.start, range.end)
        } else {
          // 降级：如果没有 lastManipulatedJoint，使用原有逻辑
          recomputeJointPositionLine3D(
            (() => {
              if (dragJointSettingsPanel.value.spread.before.selected === 0) {
                return 0
              }
              if (dragJointSettingsPanel.value.spread.before.selected === 1) {
                return (
                  motionStore.currentFrameIndex -
                  dragJointSettingsPanel.value.spread.before.radius -
                  2
                )
              }
              return motionStore.currentFrameIndex - 1
            })(),
            (() => {
              if (dragJointSettingsPanel.value.spread.after.selected === 0) {
                return motionStore.frame_getNum() - 1
              }
              if (dragJointSettingsPanel.value.spread.after.selected === 1) {
                return (
                  motionStore.currentFrameIndex +
                  dragJointSettingsPanel.value.spread.after.radius +
                  1
                )
              }
              return motionStore.currentFrameIndex
            })()
          )
        }
      }
    } catch (err) {
      console.log(err)
    }
  }, 1000)
  // }, 1000 || URDF_LINE_THROTTLE_MS)
}

const schedulePathPanelUpdateDuringDrag = () => {
  if (pathPanelThrottleTimer !== null) return
  pathPanelThrottleTimer = setTimeout(() => {
    pathPanelThrottleTimer = null
    try {
      pathPanel.value.handleUpDateData()
    } catch (err) {
      console.log(err)
    }
  }, PATHPANEL_THROTTLE_MS)
}

const jointPositionLine: Ref<IJointPositionLine> = ref<IJointPositionLine>({
  currentJointName: null,
  lastJointName: null,
  cachedPositions: [],
  isVisible: false,
  needsRecompute: true,
  isComputing: false,
  computePromise: null,
  async handleShow(forceRecompute = false) {
    if (!viewerStore.isJointPositionLineVisible) {
      return
    }
    if (!this.currentJointName && this.lastJointName) {
      this.currentJointName = this.lastJointName
    }
    const context = resolveSelectedJointContext(this.currentJointName)
    if (!context) {
      this.handleHide()
      if (viewerStore.isJointPositionLineVisible) {
        viewerStore.setJointPositionLineVisible(false)
      }
      return
    }
    if (!hasSelectedFieldData(context.selectedField) && !robotModelStore.isBVH) {
      this.handleHide()
      if (viewerStore.isJointPositionLineVisible) {
        viewerStore.setJointPositionLineVisible(false)
      }
      return
    }
    const shouldRecompute =
      forceRecompute ||
      this.needsRecompute ||
      !this.isVisible ||
      this.currentJointName !== context.jointName
    if (!shouldRecompute) {
      setTimeout(() => {
        api.robot.jointPosition.JointPositionLine.updateCurrentFrameMarker(
          motionStore.currentFrameIndex
        )
      }, 10)
      return
    }
    if (this.isComputing && this.computePromise) {
      await this.computePromise
      return
    }
    this.isComputing = true
    this.computePromise = renderJointTrajectoryForContext(this, context)
    let success = false
    try {
      success = await this.computePromise
    } catch (error) {
      success = false
    } finally {
      this.computePromise = null
      this.isComputing = false
    }
    if (!success) {
      this.needsRecompute = true
      this.handleHide()
      if (viewerStore.isJointPositionLineVisible) {
        viewerStore.setJointPositionLineVisible(false)
      }
      return
    }
    this.needsRecompute = false
    this.isVisible = true
    this.lastJointName = context.jointName
  },
  handleHide() {
    this.isVisible = false
    this.currentJointName = null
    this.cachedPositions = []
    this.needsRecompute = true
    this.isComputing = false
    this.computePromise = null
    api.robot.jointPosition.JointPositionLine.remove()
  },
  handleUpdate() {
    if (!viewerStore.isJointPositionLineVisible) return
    if (isJointManipulating.value) {
      pendingJointPositionLineRefresh = true
      this.needsRecompute = true
      return
    }
    pendingJointPositionLineRefresh = false
    this.needsRecompute = true
    this.handleShow(true)
  },
  async showForJoint(jointName: string) {
    if (!jointName) return
    const context = resolveSelectedJointContext(jointName)
    if (!context) {
      console.warn(`无法解析关节 "${jointName}" 的轨迹上下文`)
      return
    }
    this.currentJointName = context.jointName
    this.lastJointName = context.jointName
    this.needsRecompute = true
    if (!viewerStore.isJointPositionLineVisible) {
      viewerStore.setJointPositionLineVisible(true)
      return
    }
    if (!hasSelectedFieldData(context.selectedField) && !robotModelStore.isBVH) {
      this.handleHide()
      if (viewerStore.isJointPositionLineVisible) {
        viewerStore.setJointPositionLineVisible(false)
      }
      return
    }
    await this.handleShow(true)
  },
})

const urdfView = ref({
  mouseDownAndNotMove: false,
  currentX: 0,
  currentY: 0,
  handleMouseDown(e: MouseEvent) {
    const containerRect = (mainContainer.value as HTMLElement | null)?.getBoundingClientRect()
    if (containerRect) {
      this.currentX = e.clientX - containerRect.left
      this.currentY = e.clientY - containerRect.top
    } else {
      this.currentX = e.clientX
      this.currentY = e.clientY
    }
    this.mouseDownAndNotMove = true
  },
  handleMouseMove() {
    this.mouseDownAndNotMove = false
  },
})

const saveType = ref({
  showMenu: false,
  handleSave(isSaveAs: boolean) {
    emit('onSave', {
      isSaveAs,
      ...getSaveMotionJSON(),
    })
  },
})

const getSaveMotionJSON = () => {
  return {
    isBVH: robotModelStore.isBVH,
    JSON: !robotModelStore.isBVH ? motionStore.exportRawMotionJSON() : undefined,
    bvh: robotModelStore.isBVH
      ? (() => {
          const motionJSONType = api.unparseMotionJSON(motionStore.motionData as ParsedMotion)
          const bvhDataType = dataAPIRef.value.generateBVHDataFromMotionJSON(motionJSONType)
          const bvhContent = dataAPIRef.value.generateBVH(bvhDataType)
          return bvhContent
        })()
      : undefined,
  }
}

onMounted(() => {
  jointPositionLine3D = createJointPositionLine3DData({
    jointPositionRangeBar: jointPositionRangeBar.value as any,
    motionStore,
    viewer,
  }) as any
  player = createPlayerData({
    motionStore,
    windowStore,
  }) as any
  positionPanel = createPositionPanelData({
    motionStore,
    robotModelStore,
    withDrawStore,
    rippleAdjust,
    api: api as any,
    viewer,
    controlsContainer,
    positionPanelContainer,
  }) as any
  pathPanel = createPathPanelData({
    mainContainer,
    jointPositionLine,
    viewer,
    jointQuatSphere,
    quatSphere,
    motionStore,
    withDrawStore,
    selectedFieldStore,
    robotModelStore,
    windowStore,
    themeStore,
    api: api as any,
    handleModifyWindowsLocation,
    handleViewerSizeChange,
    tool_smoothData,
    createLineChart,
    handleCameraMove,
  }) as any
  dragJointSettingsPanel = createDragJointSettingsPanelData({
    dragJointSettingsPanelContainer,
    controlsContainer,
    CONSTANTS,
    motionStore,
    withDrawStore,
    rippleAdjust,
    pathPanel,
    api: api as any,
    jointPositionLine,
    viewer,
  }) as any
  quatSphere = createQuatSphereData({
    initQuatSphere,
    robotModelStore,
    api: api as any,
    motionStore,
    jointPositionLine,
    pathPanel,
    withDrawStore,
    rotateTrajectoryEuler,
    rotateTrajectory,
    viewer,
    basePositionLine: ref(null) as any,
    transformPath,
    onLabelClick: handleQuatSphereLabelClick,
  }) as any
  const jointQuatSphereTRef = {
    value: null as IJointQuatSphere | null,
  }
  camera = createCameraData({
    motionStore,
    api: api as any,
    robotModelStore,
    quatSphere,
    jointQuatSphereTRef: jointQuatSphereTRef,
    viewer,
  }) as any
  jointQuatSphere = createJointQuatSphereData({
    controlsContainer,
    robotModelStore,
    api: api as any,
    initJointQuatSphere,
    motionStore,
    calculateBVHJointLocalEuler,
    calculateBVHJointGlobalEuler,
    camera,
    pathPanel,
    withDrawStore,
    dragJointSettingsPanel,
    viewer,
    jointPositionLine,
    rippleAdjustEulerObject,
  }) as any
  jointQuatSphereTRef.value = jointQuatSphere.value
  jointFloatingMenu = createFloatingMenuData({
    getJointBaseName,
    viewerStore,
    jointPositionLine,
    viewer,
    robotModelStore,
    selectedFieldStore,
    getAvailableJointFields,
    jointQuatSphere,
  }) as any
  dataPanel = createDataPanelData({
    selectedFieldStore,
    pathPanel,
  }) as any
  currentHoverJointTip = createHoverJointTipData({
    CONSTANTS,
  })
  help = createHelpData({
    themeStore,
    viewerStore,
    robotModelStore,
    windowStore,
    motionStore,
    selectedFieldStore,
    withDrawStore,
    pathPanel,
    jointQuatSphere,
    positionPanel,
    dragJointSettingsPanel,
    player,
    dataPanel,
    quatSphere,
    jointPositionLine3D,
    jointFloatingMenu,
    camera,
    currentHoverJointTip,
    operationHsitoryPanel,
    viewerJointControl,
    saveType,
    basePositionLine,
    jointPositionLine,
    urdfView,
    isDarkTheme,
    textColor,
    viewer,
    api,
  }) as any
  createWatches({
    themeStore,
    selectedFieldStore,
    robotModelStore,
    windowStore,
    viewerStore,
    motionStore,
    withDrawStore,
    isDarkTheme,
    textColor,
    pathPanel,
    dataPanel,
    dataListScrollRef,
    pathPanelScrollRef,
    viewer,
    basePositionLine,
    jointPositionLine,
    camera,
    jointQuatSphere,
    quatSphere,
    isJointManipulating,
    dragJointSettingsPanel,
    positionPanel,
    player,
    jointPositionLine3D,
    scrollToJoint,
    handleModifyWindowsLocation,
    handleViewerSizeChange,
    handleCloseAllMenu,
    api,
    motionEditorEmit: emit as any,
  })
  fullPageWarning = createFullPageWarningData({
    windowStore,
  }) as any

  fullPageWarning.value.init()
  isMounted.value = true
  nextTick(() => {
    attachEditorResizeObserver()
    updateMainContainerSize()
  })
})

onUnmounted(() => {
  try {
    // 1. 移除事件监听器
    if (viewer.value !== null)
      (viewer.value as URDFViewer).removeEventListener(
        'urdf-processed',
        handleURDFProcessed as EventListener
      )
    if (viewer.value !== null)
      (viewer.value as URDFViewer).removeEventListener('angle-change', ((e: Event) => {
        handleRobotAngleChange((e as CustomEvent).detail as { jointName: string; angle: number })
      }) as EventListener)
    if (viewer.value !== null)
      (viewer.value as URDFViewer).controls.removeEventListener('change', handleCameraMove)
    if (viewer.value !== null)
      (viewer.value as URDFViewer).removeEventListener('grid-mouseenter', () => {})
    if (viewer.value !== null)
      (viewer.value as URDFViewer).removeEventListener('grid-mouseleave', () => {})
    if (viewer.value !== null)
      (viewer.value as URDFViewer).removeEventListener('grid-joint-click', () => {})
    document.body.removeEventListener('mousemove', handleMouseGlobalMove)
    document.body.removeEventListener('mouseup', handleMouseGlobalUp)
    document.body.removeEventListener('mouseleave', handleMouseGlobalLeave)
    window.removeEventListener('resize', handleWindowSizeChange)
    document.body.removeEventListener('keydown', handleKeyGlobalDown)
    document.body.removeEventListener('keyup', handleKeyGlobalUp)

    // 2. 清理组件实例
    quatSphere.value.dispose?.()
    ;(pathPanel.value.destory as Function)()

    // 3. 清理 store 状态（关键！避免旧状态干扰下次打开）
    resetAllStores()
  } catch (error) {
    console.error('MotionEditor onUnmounted 清理失败:', error)
  }

  // 4. 断开 ResizeObserver
  if (editorResizeObserver) {
    editorResizeObserver.disconnect()
    editorResizeObserver = null
  }
})

onUnmounted(() => {
  if (quatSphere.value.api && (quatSphere.value.api as QuatSphereAPI).dispose) {
    handleSyncError(() => (quatSphere.value.api as QuatSphereAPI).dispose!(), '清理四元数球失败')
  }
  handleSyncError(() => {
    if (viewer.value) {
      const v = viewer.value as URDFViewer
      if (v.scene) {
        const disposeObject = (obj: THREE.Object3D) => {
          if ((obj as any).geometry) {
            ;(obj as any).geometry.dispose()
          }
          if ((obj as any).material) {
            if (Array.isArray((obj as any).material)) {
              ;(obj as any).material.forEach((mat: THREE.Material) => mat?.dispose?.())
            } else {
              ;(obj as any).material?.dispose?.()
            }
          }
          if (obj.children) {
            obj.children.forEach((child: THREE.Object3D) => disposeObject(child))
          }
        }
        v.scene.traverse(disposeObject)
      }
      if (v.renderer) {
        v.renderer.dispose()
      }
    }
    if (currentHoverJointTip.value.time) {
      clearTimeout(currentHoverJointTip.value.time)
      currentHoverJointTip.value.time = null
    }
  }, '清理Three.js资源失败')
})

// 导出类型以触发 TypeScript 重新编译
export type { IJointQuatSphere, IQuatSphere }
</script>

<style scoped>
@import './MotionEditorComponents/style.css';

.motion-editor-overlay-mask {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(255, 255, 255, 0.01);
  z-index: 4000;
}
</style>
