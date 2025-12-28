<template>
  <div class="container-progress">
    <!-- 进度条容器 -->
    <div
      class="container-progress-main"
      :class="isDarkTheme ? '' : 'container-progress-main-light'"
    >
      <!-- 播放按钮 -->
      <div
        :title="motionStore.playStatus === 0 ? '播放' : '暂停'"
        @click="
          () => {
            if (motionStore.playStatus === 0) {
              motionStore.play()
            } else {
              motionStore.pause()
            }
          }
        "
        class="button-bg button-bg-square button-round"
      >
        <div :class="`${!isDarkTheme ? 'button-slot-light' : ''}`" class="button-slot button-round">
          <SVGFramePlay v-if="motionStore.playStatus === 0" class="svg-size" />
          <SVGFramePause v-if="motionStore.playStatus === 1" class="svg-size" />
        </div>
      </div>
      <!-- 停止按钮 -->
      <div
        :title="'停止'"
        @click="
          () => {
            motionStore.stop()
          }
        "
        class="button-bg button-bg-square button-round"
        :class="{
          'button-disabled': motionStore.currentFrameIndex === 0,
        }"
      >
        <div :class="`${!isDarkTheme ? 'button-slot-light' : ''}`" class="button-slot button-round">
          <SVGFrameStop class="svg-size" />
        </div>
      </div>
      <!-- 进度条 -->
      <div
        class="progress-container button-round"
        :style="{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
        }"
      >
        <!-- 当前帧和时间 -->
        <div
          class="progress-time-current-container"
          :class="isDarkTheme ? '' : 'progress-info-block-light'"
        >
          <span class="progress-time-text">{{ motionStore.currentFrameIndex + 1 }}F</span>
          <span class="progress-time-text">{{
            motionStore.getCurrentTimeDisplay()?.current ?? ''
          }}</span>
        </div>
        <!-- 上一帧按钮 -->
        <div
          :class="{
            'button-disabled': motionStore.currentFrameIndex === 0,
          }"
          :title="'上一帧'"
          @click="
            () => {
              let current = motionStore.currentFrameIndex
              current--
              if (current >= 0) {
                motionStore.setCurrentFrameIndex(current)
              }
            }
          "
          class="button-bg button-bg-small button-round"
        >
          <div
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
            class="button-slot button-round"
          >
            <SVGFrameLast class="svg-size" />
          </div>
        </div>
        <!-- 下一帧按钮 -->
        <div
          :class="{
            'button-disabled': motionStore.currentFrameIndex === motionStore.getFrameCount() - 1,
          }"
          :title="'下一帧'"
          @click="
            () => {
              let current = motionStore.currentFrameIndex
              current++
              if (current <= motionStore.getFrameCount() - 1) {
                motionStore.setCurrentFrameIndex(current)
              }
            }
          "
          class="button-bg frame-button button-round"
          style="margin-right: 8px"
        >
          <div
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
            class="button-slot pad-0 button-round"
          >
            <SVGFrameNext class="svg-size frame-icon-scale" />
          </div>
        </div>
        <!-- 进度条 -->
        <div class="progress-bar-container">
          <div id="playerProgressBar" class="progress-bar">
            <div
              :title="`${player.barHoverToFrame + 1}帧`"
              @mousemove="
                (e: MouseEvent) => {
                  player.handleBarHover(e as any)
                }
              "
              @mousedown="(e: MouseEvent) => player.handleBarMouseDown(e as any)"
              class="progress-bar-click-full"
            >
              <div class="progress-bar-overlay"></div>
            </div>
            <div
              id="playerProgressBarCurrent"
              class="progress-bar-played"
              :style="{
                width: player.move.moving
                  ? `${player.move.newWidth}px`
                  : `${motionStore.getCurrentFrameProgress().default * 100}%`,
              }"
            >
              <div
                class="progress-bar-click-played"
                :title="`${player.barHoverToFrame + 1}帧`"
                @mousemove="
                  (e: MouseEvent) => {
                    player.handleBarHover(e as any)
                  }
                "
                @mousedown="(e: MouseEvent) => player.handleBarMouseDown(e as any)"
              >
                <div class="progress-bar-overlay"></div>
              </div>
              <div
                @mousedown="
                  (e: MouseEvent) => {
                    player.move.handleStart(e)
                  }
                "
                class="progress-bar-played-dot"
                :class="{
                  'progress-bar-played-dot-light': !isDarkTheme,
                }"
              ></div>
            </div>
          </div>
          <div
            ref="jointPositionRangeBar"
            style="
              position: absolute;
              left: 0;
              top: 5px;
              width: 100%;
              height: 5px;
              border-radius: 10px;
              background: linear-gradient(
                to right,
                #ff000040,
                #ff7f0040,
                #ffff0040,
                #00ff0040,
                #0000ff40,
                #4b008240,
                #8b00ff40
              );
            "
          >
            <div
              style="
                height: 5px;
                position: absolute;
                top: 0;
                background-color: rgba(255, 255, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
              "
              :style="{
                left: `${jointPositionLine3D.range.startDotLeft().percentage * 100}%`,
                width: `${(jointPositionLine3D.range.endDotLeft().percentage - jointPositionLine3D.range.startDotLeft().percentage) * 100}%`,
              }"
            >
              <div
                @mousedown="(e: MouseEvent) => jointPositionLine3D.range.handleMoveGroupStart(e)"
                style="
                  width: 100%;
                  height: 100%;
                  position: absolute;
                  top: 0;
                  left: 0;
                  cursor: pointer;
                "
              ></div>
              <div
                style="
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  flex-direction: column;
                  position: relative;
                  cursor: pointer;
                "
              >
                <span
                  v-if="jointPositionLine3D.range.moving || jointPositionLine3D.range.movingGroup"
                  style="
                    font-size: 14px;
                    color: white;
                    text-shadow: 0 0 2px 5px rgba(0, 0, 0, 0.6);
                    word-break: break-all;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    transform: translateY(-25px);
                  "
                >
                  {{
                    `关节位置线条可见范围 ${jointPositionLine3D.range.start + 1}F ~ ${jointPositionLine3D.range.end + 1}F`
                  }}
                </span>
              </div>
            </div>
            <div
              @mousedown="(e: MouseEvent) => jointPositionLine3D.range.handleStart(e, true)"
              style="
                width: 6px;
                height: 8px;
                border-radius: 10px;
                position: absolute;
                left: 0;
                top: -2px;
                background-color: white;
                transform: translate(-50%, 0%);
                cursor: pointer;
              "
              :style="{
                left: `${jointPositionLine3D.range.startDotLeft().percentage * 100}%`,
                backgroundColor: !isDarkTheme ? 'black' : 'white',
              }"
            ></div>
            <div
              @mousedown="(e: MouseEvent) => jointPositionLine3D.range.handleStart(e, false)"
              style="
                width: 6px;
                height: 8px;
                border-radius: 10px;
                position: absolute;
                left: 0;
                top: -2px;
                background-color: white;
                transform: translate(-50%, 0%);
                cursor: pointer;
              "
              :style="{
                left: `${jointPositionLine3D.range.endDotLeft().percentage * 100}%`,
                backgroundColor: !isDarkTheme ? 'black' : 'white',
              }"
            ></div>
          </div>
        </div>
        <!-- 全部帧和时间 -->
        <div class="progress-info-block" :class="isDarkTheme ? '' : 'progress-info-block-light'">
          <span class="nowrap">{{ motionStore.getFrameCount() }}F</span>
          <span class="nowrap">{{ motionStore.getCurrentTimeDisplay()?.total ?? '' }}</span>
        </div>
      </div>
      <!-- 倍速调整按钮 -->
      <HoverTip :position="'top'" :persist-on-panel="true" :close-delay="120" :dark="isDarkTheme">
        <template #default>
          <div style="height: 44px; display: flex; align-items: center; justify-content: center">
            <div class="button-bg minw-50 button-round" :title="'倍速率'">
              <div
                :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                class="button-slot pad-4-8 button-round"
              >
                <div class="col-center-12-gap-3-lh1">
                  <span>倍速</span>
                  <span>{{ player.xSpeed.toXSpeedValue() }}x</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template #hoverTemplate>
          <div class="player-menu-panel">
            <div
              class="justify-start"
              style="display: flex; align-items: center; gap: 4px; width: 100%"
              @wheel.prevent.stop="
                (e: WheelEvent) => {
                  const delta = e.deltaY < 0 ? 0.1 : -0.1
                  player.xSpeed.data = Math.min(10, Math.max(-8, player.xSpeed.data + delta))
                  player.handleChange()
                }
              "
            >
              <span :style="{ color: textColor, fontSize: '12px', minWidth: '32px' }">倍速</span>
              <input
                class="slider"
                :class="isDarkTheme ? '' : 'slider-light'"
                :value="player.xSpeed.data"
                type="range"
                min="-8"
                max="10"
                step="0.1"
                style="width: 130px"
                @input="
                  (e: Event) => {
                    player.xSpeed.data = Number((e.target as HTMLInputElement).value)
                    player.handleChange()
                  }
                "
              />
              <span
                :style="{
                  color: textColor,
                  width: 'max-content',
                  fontSize: '12px',
                  marginLeft: '6px',
                }"
              >
                {{ player.xSpeed.toXSpeedValue() }}x
              </span>
            </div>
          </div>
        </template>
      </HoverTip>
      <!-- 刷新率调整按钮 -->
      <HoverTip
        :position="'top'"
        :persist-on-panel="true"
        :close-delay="120"
        :dark="isDarkTheme"
        :offset-x="-50"
      >
        <template #default>
          <div style="height: 44px; display: flex; align-items: center; justify-content: center">
            <div
              class="button-bg minw-100 button-round"
              :class="{
                // 'button-disabled': motionStore.playStatus === 1,
              }"
              :title="'帧率'"
              style="min-width: 110px"
            >
              <div
                :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                class="button-slot pad-4-8 button-round"
              >
                <div class="col-center-12-gap-3-lh1">
                  <span>帧率</span>
                  <span>{{
                    `${
                      motionStore.playMode === 0
                        ? motionStore.getEffectiveFrameRate().toFixed(2)
                        : motionStore.playbackRefreshRate.toFixed(2)
                    }${
                      (motionStore.getJumpFrameStep(undefined) as number) > 1
                        ? ` (跳${(motionStore.getJumpFrameStep(undefined) as number) - 1}帧)`
                        : ''
                    }`
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template #hoverTemplate>
          <div class="player-menu-panel">
            <div class="col-gap-4">
              <div
                class="h-50 button-bg button-bg-pointer-events-none"
                style="height: 37px; width: 200px"
                @click="
                  () => {
                    player.refreshRate.handleDefault()
                  }
                "
              >
                <div
                  :class="[
                    `${!isDarkTheme ? 'button-slot-light' : ''}`,
                    motionStore.playMode === 0 ? 'camera-track-selected' : '',
                  ]"
                  class="button-slot col-start-lh1-gap4"
                >
                  <div style="line-height: 1">
                    <!-- {{
                      `framerate(${motionStore.motionData?.framerate.toFixed(2)}) ×
                    倍速(${
                      motionStore.playbackSpeed
                    })：${motionStore.getEffectiveFrameRate().toFixed(2)}`
                    }} -->
                    {{ `${motionStore.getEffectiveFrameRate().toFixed(2)} 帧/s` }}
                  </div>
                  <div style="font-size: 10px; line-height: 1">
                    {{
                      `${motionStore.motionData?.framerate.toFixed(2)}(framerate) ×
                   ${motionStore.playbackSpeed}(倍速)`
                    }}
                  </div>
                </div>
              </div>
              <div
                class="h-50 button-bg button-bg-pointer-events-none"
                style="height: 37px"
                v-if="(motionStore.getJumpFrameStep(240) as number) > 1"
                @click="
                  () => {
                    player.refreshRate.handleJump(240)
                  }
                "
              >
                <div
                  :class="[
                    `${!isDarkTheme ? 'button-slot-light' : ''}`,
                    Math.abs(motionStore.playbackRefreshRate - 240) < 0.1 &&
                    motionStore.playMode === 1
                      ? 'camera-track-selected'
                      : '',
                  ]"
                  class="button-slot justify-start"
                >
                  240 帧/s
                </div>
              </div>
              <div
                class="h-50 button-bg button-bg-pointer-events-none"
                style="height: 37px"
                v-if="(motionStore.getJumpFrameStep(120) as number) > 1"
                @click="
                  () => {
                    player.refreshRate.handleJump(120)
                  }
                "
              >
                <div
                  :class="[
                    `${!isDarkTheme ? 'button-slot-light' : ''}`,
                    Math.abs(motionStore.playbackRefreshRate - 120) < 0.1 &&
                    motionStore.playMode === 1
                      ? 'camera-track-selected'
                      : '',
                  ]"
                  class="button-slot justify-start"
                >
                  120 帧/s
                </div>
              </div>
              <div
                class="h-50 button-bg button-bg-pointer-events-none"
                style="height: 37px"
                v-if="(motionStore.getJumpFrameStep(60) as number) > 1"
                @click="
                  () => {
                    player.refreshRate.handleJump(60)
                  }
                "
              >
                <div
                  :class="[
                    `${!isDarkTheme ? 'button-slot-light' : ''}`,
                    Math.abs(motionStore.playbackRefreshRate - 60) < 0.1 &&
                    motionStore.playMode === 1
                      ? 'camera-track-selected'
                      : '',
                  ]"
                  class="button-slot justify-start"
                >
                  60 帧/s
                </div>
              </div>
              <div
                class="h-50 button-bg button-bg-pointer-events-none"
                style="height: 37px"
                v-if="(motionStore.getJumpFrameStep(30) as number) > 1"
                @click="
                  () => {
                    player.refreshRate.handleJump(30)
                  }
                "
              >
                <div
                  :class="[
                    `${!isDarkTheme ? 'button-slot-light' : ''}`,
                    Math.abs(motionStore.playbackRefreshRate - 30) < 0.1 &&
                    motionStore.playMode === 1
                      ? 'camera-track-selected'
                      : '',
                  ]"
                  class="button-slot justify-start"
                >
                  30 帧/s
                </div>
              </div>
              <div
                class="h-50 button-bg button-bg-pointer-events-none"
                style="height: 37px"
                v-if="(motionStore.getJumpFrameStep(25) as number) > 1"
                @click="
                  () => {
                    player.refreshRate.handleJump(25)
                  }
                "
              >
                <div
                  :class="[
                    `${!isDarkTheme ? 'button-slot-light' : ''}`,
                    Math.abs(motionStore.playbackRefreshRate - 25) < 0.1 &&
                    motionStore.playMode === 1
                      ? 'camera-track-selected'
                      : '',
                  ]"
                  class="button-slot justify-start"
                >
                  25 帧/s
                </div>
              </div>
              <div
                class="h-50 button-bg button-bg-pointer-events-none"
                style="height: 37px"
                v-if="(motionStore.getJumpFrameStep(15) as number) > 1"
                @click="
                  () => {
                    player.refreshRate.handleJump(15)
                  }
                "
              >
                <div
                  :class="[
                    `${!isDarkTheme ? 'button-slot-light' : ''}`,
                    Math.abs(motionStore.playbackRefreshRate - 15) < 0.1 &&
                    motionStore.playMode === 1
                      ? 'camera-track-selected'
                      : '',
                  ]"
                  class="button-slot justify-start"
                >
                  15 帧/s
                </div>
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

// SVG 图标导入
import SVGFramePlay from '@/assets/svg/motion-editor-frame-play.svg'
import SVGFramePause from '@/assets/svg/motion-editor-frame-pause.svg'
import SVGFrameStop from '@/assets/svg/motion-editor-frame-stop.svg'
import SVGFrameLast from '@/assets/svg/motion-editor-frame-last.svg'
import SVGFrameNext from '@/assets/svg/motion-editor-frame-next.svg'
import HoverTip from '../hoverTip/UI.vue'

// 定义 Props 接口
interface PlayerUIProps {
  player: any
  motionStore: any
  isDarkTheme: boolean
  jointPositionLine3D: any
  jointPositionRangeBar: any
}

// 接收 props
const props = defineProps<PlayerUIProps>()

// 解构 props 为局部变量
const {
  player,
  motionStore,
  jointPositionLine3D,
  jointPositionRangeBar: jointPositionRangeBarRef,
} = props

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => (isDarkTheme.value ? '#ffffff' : '#000000'))

// Ref
const jointPositionRangeBar = ref<HTMLElement | null>(null)

onMounted(() => {
  jointPositionRangeBarRef.value = jointPositionRangeBar.value
})
</script>

<style scoped>
@import '../style.css';

.player-menu-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
}
</style>
