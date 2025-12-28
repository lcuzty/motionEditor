<template>
  <div class="container-top">
    <!-- 顶部右侧按钮组 -->
    <div style="display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%">
      <div
        style="
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          height: 100%;
          width: max-content;
          padding: 6px;
          border-radius: 300px;
          max-width: 100%;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(20px);
        "
        :style="{
          backgroundColor: isDarkTheme ? 'rgba(28,28,28,0.2)' : 'rgba(227, 227, 227, 0.6)',
        }"
      >
        <!-- 撤销按钮 -->
        <div
          class="button-bg button-bg-square button-round"
          :class="{
            'button-disabled': withDrawStore.stackLength() === 0,
          }"
          :title="'撤销'"
          @click="
            () => {
              withDrawStore.doWithDraw()
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGUndo
              class="svg-size"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 重做按钮 -->
        <div
          class="button-bg button-bg-square button-round"
          :class="{
            'button-disabled': withDrawStore.reDoStackLength() === 0,
          }"
          :title="'重做'"
          @click="
            () => {
              withDrawStore.handleReDo()
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGRedo
              class="svg-size"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 数据面板切换按钮 -->
        <div
          class="button-bg button-bg-square button-round"
          :title="help.show ? '取消显示疑难解答' : '显示疑难解答'"
          @click="
            () => {
              help.show = !help.show
            }
          "
        >
          <div class="button-slot" :class="`${!isDarkTheme ? 'button-slot-light' : ''}`">
            <SVGQuiz
              class="svg-size"
              :class="{
                'svg-selected': help.show,
              }"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 摄像机焦点按钮 - 将模型位置设为摄像机焦点 -->
        <div
          class="button-bg button-bg-square button-round"
          :title="'将模型位置设为摄像机焦点'"
          @click="
            () => {
              api.camera.target.set(api.robot.position.get())
              if (viewer?.controls) {
                viewer.controls.update()
              }
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGFocus
              class="svg-size"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 模型透明度切换按钮 -->
        <div
          class="button-bg button-bg-square button-round"
          :title="robotModelStore.isHidden ? '取消机器人模型半透明化' : '机器人模型半透明化'"
          @click="
            () => {
              if (robotModelStore.isHidden) {
                robotModelStore.show()
                api.robot.hide.remove()
              } else {
                robotModelStore.hide()
                api.robot.hide.set()
              }
              api.forceRender()
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGHide
              class="svg-size"
              :class="{
                'svg-selected': robotModelStore.isHidden,
              }"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 拖动关节设置按钮 - 仅URDF模式显示 -->
        <div
          v-if="!robotModelStore.isBVH && false"
          class="button-bg button-bg-square button-round"
          :title="'拖动关节设置'"
          @click="
            () => {
              dragJointSettingsPanel.showMenu = !dragJointSettingsPanel.showMenu
            }
          "
        >
          <div class="button-slot" :class="`${!isDarkTheme ? 'button-slot-light' : ''}`">
            <SVGDrag
              class="svg-size"
              :class="{
                'svg-selected': dragJointSettingsPanel.showMenu,
              }"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 摄像机设置（跟随 + 缩放速度） -->
        <HoverTip
          :position="'bottom'"
          :persist-on-panel="true"
          :close-delay="120"
          :dark="isDarkTheme"
        >
          <template #default>
            <div style="height: 36px; display: flex; align-items: center; justify-content: center">
              <div
                class="button-bg button-round"
                :title="`跟随：${camera.track.getCurrent().name}，速度 ${camera.zoomSpeed.value}`"
              >
                <div
                  class="button-slot button-slot-pad-8 button-round"
                  :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                >
                  <div class="flex-center-full-gap-4">
                    <SVGCameraTrack class="svg-size" :style="{ color: textColor }" />
                    <div class="flex-col-start-center-maxcontent-11-gap-2">
                      <span :style="{ color: textColor }">摄像机设置</span>
                      <span
                        class="flex-col-start-center-maxcontent-11-gap-2-span-2"
                        :style="{ color: textColor, opacity: 0.6 }"
                        >{{ camera.zoomSpeed.value }}，{{
                          camera.type.selected === 'perspective' ? '透视' : '正交'
                        }}，{{ camera.track.getCurrent().name }}</span
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #hoverTemplate>
            <div>
              <div class="camera-settings-panel">
                <!-- 左侧：缩放速度 -->
                <div class="camera-settings-section">
                  <div
                    style="padding: 0px 0px 4px 0px; font-size: 12px; opacity: 0.8"
                    :style="{ color: textColor }"
                  >
                    缩放速度
                  </div>
                  <div class="button-bg">
                    <div
                      class="button-slot justify-start"
                      :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                      style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        min-width: 160px;
                        padding: 6px 8px;
                      "
                      @wheel.prevent.stop="
                        (e: WheelEvent) => {
                          const delta = e.deltaY < 0 ? 1 : -1
                          const next = Math.min(10, Math.max(1, camera.zoomSpeed.value + delta))
                          if (next !== camera.zoomSpeed.value) {
                            camera.zoomSpeed.set(next)
                          }
                        }
                      "
                    >
                      <input
                        class="slider full-width"
                        :class="isDarkTheme ? '' : 'slider-light'"
                        :value="camera.zoomSpeed.value"
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        @input="
                          (e: Event) =>
                            camera.zoomSpeed.set(parseInt((e.target as HTMLInputElement).value, 10))
                        "
                      />
                      <span :style="{ color: textColor, minWidth: '28px', textAlign: 'right' }">{{
                        camera.zoomSpeed.value
                      }}</span>
                    </div>
                  </div>
                  <div
                    style="padding: 4px 0px 4px 0px; font-size: 12px; opacity: 0.8"
                    :style="{ color: textColor }"
                  >
                    类型
                  </div>
                  <div
                    style="
                      width: 100%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      gap: 8px;
                    "
                  >
                    <div
                      v-for="item in camera.type.options"
                      :key="item.value"
                      class="button-bg"
                      style="height: 28px; width: 100%"
                      @click="
                        () => {
                          camera.type.change(item.value)
                        }
                      "
                    >
                      <div
                        class="button-slot justify-center camera-type-slot"
                        :class="[
                          !isDarkTheme ? 'button-slot-light button2-light' : '',
                          camera.type.selected === item.value ? 'camera-type-selected' : '',
                        ]"
                        :style="{ color: textColor }"
                      >
                        {{ item.label }}
                      </div>
                    </div>
                  </div>
                </div>
                <!-- 右侧：跟随模式 -->
                <div class="camera-settings-section">
                  <div
                    style="padding: 0px 0px 4px 0px; font-size: 12px; opacity: 0.8"
                    :style="{ color: textColor }"
                  >
                    跟随模式
                  </div>
                  <ScrollView
                    :scroll-y="true"
                    :is-dark="isDarkTheme"
                    style="width: 190px; height: 120px"
                  >
                    <div style="display: flex; flex-direction: column; gap: 2px">
                      <div
                        v-for="(item, index) in camera.track.options"
                        :key="index"
                        class="button-bg"
                        @click="
                          () => {
                            camera.track.changeSelected(index)
                          }
                        "
                        style="height: 28px"
                      >
                        <div
                          class="button-slot justify-start"
                          :class="[
                            !isDarkTheme ? 'button-slot-light button2-light' : '',
                            camera.track.selected === index ? 'camera-track-selected' : '',
                          ]"
                          style="display: flex; align-items: center; font-size: 12px"
                        >
                          {{ item }}
                        </div>
                      </div>
                    </div>
                  </ScrollView>
                </div>
              </div>
            </div>
          </template>
        </HoverTip>

        <!-- 位置调整面板切换按钮 -->
        <div
          v-if="false"
          class="button-bg button-bg-square button-round"
          :title="positionPanel.isShow() ? '取消显示位置调整面板' : '显示位置调整面板'"
          @click="
            () => {
              positionPanel.isShow() ? positionPanel.handleHide() : positionPanel.handleShow()
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGEditPosition
              class="svg-size"
              :class="{
                'svg-selected': positionPanel.isShow(),
              }"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 轨迹面板切换按钮 -->
        <div
          class="button-bg button-bg-square button-round"
          :title="pathPanel.show !== 0 ? '取消显示轨迹面板' : '显示轨迹面板'"
          @click="
            () => {
              if (pathPanel.show === 0) {
                pathPanel.handleShowWithLoad()
              } else {
                pathPanel.handleHide()
              }
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGPathBoard
              class="svg-size"
              :class="{
                'svg-selected': pathPanel.show !== 0,
              }"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <!-- 坐标轴显示切换按钮 -->
        <div
          class="button-bg button-bg-square button-round"
          :title="viewerStore.isAxesVisible ? '取消显示坐标轴' : '显示坐标轴'"
          @click="
            () => {
              if (viewerStore.isAxesVisible) {
                viewerStore.setAxesVisible(false)
              } else {
                viewerStore.setAxesVisible(true)
              }
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGSceneAXES
              class="svg-size"
              :class="{
                'svg-selected': viewerStore.isAxesVisible,
              }"
              :style="{
                color: textColor,
              }"
              style="transform: scale(0.95)"
            />
          </div>
        </div>

        <!-- 地面设置（网格线 + 底面透明度） -->
        <HoverTip
          :position="'bottom'"
          :persist-on-panel="true"
          :close-delay="120"
          :dark="isDarkTheme"
        >
          <template #default>
            <div class="button-bg button-bg-square button-round" :title="'地面设置'">
              <div
                class="button-slot button-round"
                :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
              >
                <SVGLayer
                  class="svg-size"
                  :class="{
                    // 'svg-selected': viewerStore.isGridVisible,
                  }"
                  :style="{
                    color: textColor,
                  }"
                />
              </div>
            </div>
          </template>
          <template #hoverTemplate>
            <div
              class="camera-settings-panel"
              style="flex-direction: column; gap: 10px; width: 220px"
            >
              <!-- 网格线 -->
              <div class="camera-settings-section">
                <div
                  style="padding: 0px 0px 4px 0px; font-size: 12px; opacity: 0.8"
                  :style="{ color: textColor }"
                >
                  网格线
                </div>
                <div
                  style="
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                  "
                >
                  <div
                    v-for="item in [
                      { label: '隐藏', value: false },
                      { label: '显示', value: true },
                    ]"
                    :key="String(item.value)"
                    class="button-bg"
                    style="height: 28px; width: 100%; border-radius: 8px; overflow: hidden"
                  >
                    <div
                      class="button-slot justify-center camera-type-slot"
                      :class="[
                        !isDarkTheme ? 'button-slot-light button2-light' : '',
                        viewerStore.isGridVisible === item.value ? 'camera-type-selected' : '',
                      ]"
                      :style="{ color: textColor }"
                      @click="
                        () => {
                          viewerStore.setGridVisible(item.value)
                        }
                      "
                    >
                      {{ item.label }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 底面透明 -->
              <div class="camera-settings-section">
                <div
                  style="padding: 0px 0px 4px 0px; font-size: 12px; opacity: 0.8"
                  :style="{ color: textColor }"
                >
                  底面透明
                </div>
                <div
                  style="
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                  "
                >
                  <div
                    v-for="item in [
                      { label: '不透明', value: false },
                      { label: '透明', value: true },
                    ]"
                    :key="String(item.value)"
                    class="button-bg"
                    style="height: 28px; width: 100%; border-radius: 8px; overflow: hidden"
                  >
                    <div
                      class="button-slot justify-center camera-type-slot"
                      :class="[
                        !isDarkTheme ? 'button-slot-light button2-light' : '',
                        groundBottomTransparent === item.value ? 'camera-type-selected' : '',
                      ]"
                      :style="{ color: textColor }"
                      @click="
                        () => {
                          groundBottomTransparent = item.value
                          viewer?.setGroundBottomTransparent?.(item.value)
                        }
                      "
                    >
                      {{ item.label }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </HoverTip>

        <!-- 保存菜单包装器 -->
        <HoverTip
          :position="'bottom'"
          :persist-on-panel="true"
          :close-delay="120"
          :dark="isDarkTheme"
        >
          <template #default>
            <div class="button-bg button-bg-square button-round" :title="'选择保存方式'">
              <div
                class="button-slot button-round"
                :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
              >
                <SVGSave
                  class="svg-size"
                  :style="{
                    color: textColor,
                  }"
                />
              </div>
            </div>
          </template>
          <template #hoverTemplate>
            <div class="toolbar-menu-panel">
              <!-- 保存选项 -->
              <!-- <div
                class="button-bg"
                @click="
                  () => {
                    saveType.handleSave(false)
                  }
                "
              >
                <div
                  class="button-slot justify-start"
                  :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                >
                  保存
                </div>
              </div> -->

              <!-- 另存为选项 -->
              <div
                class="button-bg"
                @click="
                  () => {
                    saveType.handleSave(true)
                  }
                "
              >
                <div
                  class="button-slot justify-start"
                  :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                >
                  另存
                </div>
              </div>

              <!-- 下载选项 - 根据模型类型下载BVH或JSON -->
              <!-- <div
                class="button-bg"
                @click="
                  () => {
                    if (robotModelStore.isBVH) {
                      if (!motionStore.motionData) return
                      const current = new Date()
                      downloadStringAsFile(
                        (() => {
                          const motionJSONType = api.unparseMotionJSON(
                            motionStore.motionData as ParsedMotion
                          )
                          const bvhDataType =
                            dataAPIRef.generateBVHDataFromMotionJSON(motionJSONType)
                          const bvhContent = dataAPIRef.generateBVH(bvhDataType)
                          return bvhContent
                        })(),
                        `BVH动作编辑 ${current.getFullYear()}_${current.getMonth() + 1}_${current.getDate()} ${current.getHours()}_${current.getMinutes()}_${current.getSeconds()}.bvh`
                      )
                    } else {
                      const current = new Date()
                      saveStringAsJSON(
                        motionStore.exportRawMotionJSON(),
                        `${current.getFullYear()}_${current.getMonth() + 1}_${current.getDate()} ${current.getHours()}_${current.getMinutes()}_${current.getSeconds()}`
                      )
                    }
                  }
                "
              >
                <div
                  class="button-slot justify-start"
                  :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                >
                  下载{{ robotModelStore.isBVH ? 'BVH' : 'JSON' }}
                </div>
              </div> -->
            </div>
          </template>
        </HoverTip>

        <!-- 窗口最大化/恢复按钮 -->
        <div
          class="button-bg button-bg-square button-round"
          :title="windowStore.isMaximized ? '恢复' : '网页全屏'"
          @click="
            () => {
              if (windowStore.isMaximized) {
                windowStore.restore()
              } else {
                windowStore.maximize()
              }
            }
          "
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGWindowMax
              v-if="windowStore.isMaximized === false"
              class="svg-size"
              :style="{
                color: textColor,
              }"
            />
            <SVGWindowNormal
              v-if="windowStore.isMaximized"
              class="svg-size"
              :style="{
                color: textColor,
              }"
            />
          </div>
        </div>

        <div
          style="
            width: 100%;
            height: 30px;
            position: absolute;
            left: 0;
            bottom: 0;
            transform: translateY(calc(100% + 8px));
            display: flex;
            align-items: center;
            justify-content: center;
          "
        >
          <div
            style="
              width: max-content;
              height: 100%;
              backdrop-filter: blur(20px);
              box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
              border-radius: 100px;
              padding: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
            "
            :style="{
              backgroundColor: isDarkTheme ? 'rgba(28,28,28,0.2)' : 'rgba(227, 227, 227, 0.6)',
            }"
          >
            <div
              v-for="item in camera.type.options"
              :key="item.value"
              class="button-bg"
              style="height: 24px; width: 100%; border-radius: 100px; overflow: hidden"
              @click="
                () => {
                  camera.type.change(item.value)
                }
              "
            >
              <div
                class="button-slot justify-center camera-type-slot"
                :class="[
                  !isDarkTheme ? 'button-slot-light button2-light' : '',
                  camera.type.selected === item.value ? 'camera-type-selected' : '',
                ]"
                :style="{ color: textColor }"
              >
                {{ item.label }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { ParsedMotion } from '../tools/motionEditorTools'

// SVG 图标导入
import SVGUndo from '@/assets/svg/motion-editor-undo.svg'
import SVGRedo from '@/assets/svg/motion-editor-redo.svg'
import SVGFocus from '@/assets/svg/motion-editor-focus.svg'
import SVGHide from '@/assets/svg/motion-editor-hide.svg'
import SVGDrag from '@/assets/svg/motion-editor-drag.svg'
import SVGCameraTrack from '@/assets/svg/motion-editor-camera-track.svg'
import SVGEditPosition from '@/assets/svg/motion-editor-edit-position.svg'
import SVGPathBoard from '@/assets/svg/motion-editor-path-board.svg'
import SVGDataBoard from '@/assets/svg/motion-editor-data-board.svg'
import SVGSceneAXES from '@/assets/svg/motion-editor-scene-axes.svg'
import SVGSceneGrid from '@/assets/svg/motion-editor-scene-grid.svg'
import SVGSave from '@/assets/svg/motion-editor-save-2.svg'
import SVGWindowMax from '@/assets/svg/motion-editor-window-max.svg'
import SVGWindowNormal from '@/assets/svg/motion-editor-window-normal.svg'
import SVGLayer from '@/assets/svg/motion-editor-layer.svg'
import SVGQuiz from '@/assets/svg/motion-editor-quiz.svg'

import HoverTip from '../hoverTip/UI.vue'
import ScrollView from '../scrollView/UI.vue'

// 定义 Props 接口
interface ToolBarUIProps {
  withDrawStore: any
  isDarkTheme: boolean
  textColor: string
  api: any
  robotModelStore: any
  camera: any
  dragJointSettingsPanel: any
  positionPanel: any
  pathPanel: any
  dataPanel: any
  viewerStore: any
  saveType: any
  motionStore: any
  windowStore: any
  convertMotionJSONToBVH: (motionJSON: any, bvhContent: string) => string
  downloadStringAsFile: (content: string, filename: string) => void
  saveStringAsJSON: (content: string, filename: string) => void
  viewer: any
  dataAPIRef: any
  help: any
}

// 接收 props
const props = defineProps<ToolBarUIProps>()

// 解构 props 为局部变量
const {
  withDrawStore,
  api,
  robotModelStore,
  camera,
  dragJointSettingsPanel,
  positionPanel,
  pathPanel,
  dataPanel,
  viewerStore,
  saveType,
  motionStore,
  windowStore,
  convertMotionJSONToBVH,
  downloadStringAsFile,
  saveStringAsJSON,
  viewer,
  dataAPIRef,
  help,
} = props

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)
const groundBottomTransparent = ref(false)
</script>

<style scoped>
@import '../style.css';

.toolbar-menu-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.camera-settings-panel {
  display: flex;
  flex-direction: row;
  gap: 12px;
}

.camera-settings-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.camera-track-selected {
  background-color: rgb(138, 162, 255) !important;
  color: white !important;
  border-radius: 5px;
}

.camera-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.camera-type-buttons {
  display: flex;
  flex-direction: row;
  gap: 6px;
}

.camera-type-slot {
  min-width: 64px;
  padding: 0 12px;
  font-size: 12px;
  width: 100%;
}

.camera-type-selected {
  background-color: rgb(138, 162, 255) !important;
  color: white !important;
  border-radius: 6px;
}
</style>
