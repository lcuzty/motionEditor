<template>
  <div
    class="container-right"
    :class="{
      'container-right-to-left': operationHsitoryPanel.fixed,
    }"
  >
    <!-- 四元数球容器 - 用于调整机器人全局旋转 -->
    <div
      class="quat-sphere-container"
      :class="{
        'quat-sphere-container-read-only': motionStore.playStatus === 1,
        'quat-sphere-container-light': !isDarkTheme,
      }"
    >
      <!-- 四元数球画布 -->
      <div id="quat-sphere" class="quat-sphere-container-canvas"></div>

      <div v-if="0" class="menu-button-wrapper">
        <div class="quat-settings-wrapper">
          <HoverTip
            :position="'bottom'"
            :persist-on-panel="true"
            :close-delay="120"
            :dark="isDarkTheme"
          >
            <template #default>
              <div
                class="quat-settings-btn"
                :class="isDarkTheme ? 'quat-settings-btn-dark' : 'quat-settings-btn-light'"
                :title="'姿态球设置'"
              >
                <span class="quat-sphere-icon-zoom">
                  <SVGSettings
                    class="svg-size"
                    style="width: 20px; height: 20px"
                    :style="{ color: textColor }"
                  />
                </span>
              </div>
            </template>
            <template #hoverTemplate>
              <div class="quat-menu-panel">
                <div class="quat-menu-row">
                  <div class="quat-menu-stack">
                    <div class="quat-sphere-controls-row">
                      <span
                        style="word-break: keep-all; white-space: nowrap; font-size: 12px"
                        :style="{ color: textColor }"
                        >全局</span
                      >
                      <div
                        class="quat-sphere-container-controls-lock-axis quat-sphere-axis-button"
                        :class="{
                          button2: !(quatSphere.constraint.selected === 'X'),
                          'button2-light':
                            !isDarkTheme && !(quatSphere.constraint.selected === 'X'),
                          button3: quatSphere.constraint.selected === 'X',
                        }"
                        :title="
                          quatSphere.constraint.selected === 'X' ? '取消绕X轴旋转' : '绕X轴旋转'
                        "
                        @click="
                          () => {
                            if (quatSphere.constraint.selected === 'X') {
                              quatSphere.constraint.change(undefined)
                            } else {
                              quatSphere.constraint.change('X')
                            }
                          }
                        "
                      >
                        X
                      </div>
                      <div
                        class="quat-sphere-container-controls-lock-axis quat-sphere-axis-button"
                        :class="{
                          button2: !(quatSphere.constraint.selected === 'Y'),
                          'button2-light':
                            !isDarkTheme && !(quatSphere.constraint.selected === 'Y'),
                          button3: quatSphere.constraint.selected === 'Y',
                        }"
                        :title="
                          quatSphere.constraint.selected === 'Y' ? '取消绕Y轴旋转' : '绕Y轴旋转'
                        "
                        @click="
                          () => {
                            if (quatSphere.constraint.selected === 'Y') {
                              quatSphere.constraint.change(undefined)
                            } else {
                              quatSphere.constraint.change('Y')
                            }
                          }
                        "
                      >
                        Y
                      </div>
                      <div
                        class="quat-sphere-container-controls-lock-axis quat-sphere-axis-button"
                        :class="{
                          button2: !(quatSphere.constraint.selected === 'Z'),
                          'button2-light':
                            !isDarkTheme && !(quatSphere.constraint.selected === 'Z'),
                          button3: quatSphere.constraint.selected === 'Z',
                        }"
                        :title="
                          quatSphere.constraint.selected === 'Z' ? '取消绕Z轴旋转' : '绕Z轴旋转'
                        "
                        @click="
                          () => {
                            if (quatSphere.constraint.selected === 'Z') {
                              quatSphere.constraint.change(undefined)
                            } else {
                              quatSphere.constraint.change('Z')
                            }
                          }
                        "
                      >
                        Z
                      </div>
                    </div>

                    <div class="quat-sphere-controls-row">
                      <span
                        style="word-break: keep-all; white-space: nowrap; font-size: 12px"
                        :style="{ color: textColor }"
                        >模型</span
                      >
                      <div
                        class="quat-sphere-container-controls-lock-axis quat-sphere-axis-button"
                        :class="{
                          button2: !(quatSphere.constraint.selected === 'RX'),
                          'button2-light':
                            !isDarkTheme && !(quatSphere.constraint.selected === 'RX'),
                          button3: quatSphere.constraint.selected === 'RX',
                        }"
                        :title="
                          quatSphere.constraint.selected === 'RX' ? '取消绕RX轴旋转' : '绕RX轴旋转'
                        "
                        @click="
                          () => {
                            if (quatSphere.constraint.selected === 'RX') {
                              quatSphere.constraint.change(undefined)
                            } else {
                              quatSphere.constraint.change('RX')
                            }
                          }
                        "
                      >
                        X
                      </div>
                      <div
                        class="quat-sphere-container-controls-lock-axis quat-sphere-axis-button"
                        :class="{
                          button2: !(quatSphere.constraint.selected === 'RY'),
                          'button2-light':
                            !isDarkTheme && !(quatSphere.constraint.selected === 'RY'),
                          button3: quatSphere.constraint.selected === 'RY',
                        }"
                        :title="
                          quatSphere.constraint.selected === 'RY' ? '取消绕RY轴旋转' : '绕RY轴旋转'
                        "
                        @click="
                          () => {
                            if (quatSphere.constraint.selected === 'RY') {
                              quatSphere.constraint.change(undefined)
                            } else {
                              quatSphere.constraint.change('RY')
                            }
                          }
                        "
                      >
                        Y
                      </div>
                      <div
                        class="quat-sphere-container-controls-lock-axis quat-sphere-axis-button"
                        :class="{
                          button2: !(quatSphere.constraint.selected === 'RZ'),
                          'button2-light':
                            !isDarkTheme && !(quatSphere.constraint.selected === 'RZ'),
                          button3: quatSphere.constraint.selected === 'RZ',
                        }"
                        :title="
                          quatSphere.constraint.selected === 'RZ' ? '取消绕RZ轴旋转' : '绕RZ轴旋转'
                        "
                        @click="
                          () => {
                            if (quatSphere.constraint.selected === 'RZ') {
                              quatSphere.constraint.change(undefined)
                            } else {
                              quatSphere.constraint.change('RZ')
                            }
                          }
                        "
                      >
                        Z
                      </div>
                    </div>
                  </div>

                  <div class="quat-menu-buttons">
                    <div
                      class="quat-sphere-container-controls-lock-camera-quater quat-sphere-axis-button"
                      :class="{
                        button2: true,
                        button3: quatSphere.lockedCameraQuater,
                      }"
                      :title="
                        quatSphere.lockedCameraQuater ? '取消锁定摄像机姿态' : '锁定摄像机姿态'
                      "
                      @click="
                        () => {
                          if (quatSphere.lockedCameraQuater) {
                            quatSphere.lockedCameraQuater = false
                          } else {
                            ;(quatSphere.api as QuatSphereAPI).setCameraByQuaternion(
                              api.camera.quater.get()
                            )
                            quatSphere.lockedCameraQuater = true
                          }
                        }
                      "
                    >
                      <span class="quat-sphere-icon-zoom">
                        <SVGLocked class="svg-size" />
                      </span>
                    </div>

                    <div
                      v-if="false"
                      class="quat-sphere-container-controls-lock-camera-quater quat-sphere-axis-button"
                      :class="{
                        button2: true,
                        button3: quatSphere.spread.enable,
                      }"
                      :title="
                        quatSphere.spread.enable ? '取消影响后帧模型姿态' : '影响后帧模型姿态'
                      "
                      @click="
                        () => {
                          quatSphere.spread.enable = !quatSphere.spread.enable
                        }
                      "
                    >
                      <span class="quat-sphere-icon-zoom">
                        <SVGCurve class="svg-size" />
                      </span>
                    </div>
                  </div>
                </div>

                <div v-if="quatSphere.spread.enable" class="quat-menu-spread">
                  <span :style="{ color: textColor, fontSize: '12px' }">衰减距离</span>
                  <input
                    class="slider quat-sphere-spread-slider"
                    :class="isDarkTheme ? '' : 'slider-light'"
                    v-model="quatSphere.spread.value"
                    type="range"
                    :min="0"
                    :max="quatSphere.spread.getAfterCanMoveFrameNum()"
                  />
                  <div
                    class="quat-sphere-spread-value"
                    :style="{
                      color: textColor,
                    }"
                  >
                    {{ quatSphere.spread.value }}
                  </div>
                </div>
              </div>
            </template>
          </HoverTip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

// SVG 图标导入
import SVGLocked from '@/assets/svg/motion-editor-locked.svg'
import SVGCurve from '@/assets/svg/motion-editor-curve.svg'
import SVGSettings from '@/assets/svg/motion-editor-settings.svg'
import HoverTip from '../hoverTip/UI.vue'

// 类型定义
interface QuatSphereAPI {
  setCameraByQuaternion: (
    qInput: { x: number; y: number; z: number; w: number },
    options?: { distance?: number | null; forwardAxis?: any }
  ) => void
}

// 定义 Props 接口
interface QuatSphereUIProps {
  operationHsitoryPanel: any
  motionStore: any
  isDarkTheme: boolean
  quatSphere: any
  textColor: string
  api: any
}

// 接收 props
const props = defineProps<QuatSphereUIProps>()

// 解构 props 为局部变量
const { operationHsitoryPanel, motionStore, quatSphere, api } = props

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)
</script>

<style scoped>
@import '../style.css';

.quat-menu-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quat-menu-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.quat-menu-stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.quat-menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
}

.quat-settings-wrapper {
  position: absolute;
  left: 3px;
  bottom: 1px;
}

.quat-settings-btn {
  width: 24px;
  height: 24px;
  border-radius: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.quat-settings-btn-light {
  background: rgba(0, 0, 0, 0);
}
.quat-settings-btn-light:hover {
  background: rgba(0, 0, 0, 0.12);
}

.quat-settings-btn-dark {
  background: rgba(255, 255, 255, 0);
}
.quat-settings-btn-dark:hover {
  background: rgba(255, 255, 255, 0.16);
}

.quat-sphere-controls-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding: 2px 0;
  border: none;
  background: transparent;
}

.quat-sphere-controls-row > span {
  font-size: 12px;
  opacity: 0.85;
  min-width: 0;
  margin-right: 2px;
}

.quat-menu-spread {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 4px;
  align-items: center;
  padding: 2px 0 0 0;
  border: none;
  background: transparent;
}

.quat-sphere-spread-slider {
  width: 100%;
}

.quat-sphere-spread-value {
  min-width: 24px;
  text-align: right;
  font-weight: 600;
  font-size: 12px;
}
</style>
