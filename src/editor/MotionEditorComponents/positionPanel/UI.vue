<template>
  <div
                ref="positionPanelContainer"
                class="container-window-panel position-panel-container"
                :class="{
                    'container-window-panel-hide': !positionPanel.isShow() || motionStore.playStatus === 1,
                    'container-window-panel-light': !isDarkTheme
                }"
                :style="{
                    left: `${positionPanel.position.left}px`,
                    top: `${positionPanel.position.top}px`,
                }"
            >
                <div
                    @mousedown="(e: MouseEvent) => positionPanel.position.handleStart(e)"
                    class="window-panel-title"
                    :class="{
                        'window-panel-title-light': !isDarkTheme
                    }"
                >
                    <span class="no-select">位置</span>
                    <div class="flex-row-right zoom-small">
                        <div
                            @click="() => positionPanel.handleHide()"
                            class="button2"
                            :class="{
                                'button2-light': !isDarkTheme
                            }"
                        >
                            <SVGClose class="svg-size" 
                                :style="{
                                    color: textColor
                                }" />
                        </div>
                    </div>
                </div>
                <div class="window-panel-content">
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            前帧
                        </div>
                        <div class="window-panel-line-center">
                            <div
                                @click="positionPanel.spread.before.selected = 0"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }" 
                                    v-if="positionPanel.spread.before.selected === 0"
                                    class="svg-size icon-zoom-small"
                                />
                                <SVGCheckOff :style="{
                            color: textColor
                        }" 
                                    v-else
                                    class="svg-size icon-zoom-small"
                                />
                                <span :style="{
                            color: textColor
                        }" >全部</span>
                            </div>
                            <div
                                @click="positionPanel.spread.before.selected = 1"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }" 
                                    v-if="positionPanel.spread.before.selected === 1"
                                    class="svg-size icon-zoom-small"
                                />
                                <SVGCheckOff :style="{
                            color: textColor
                        }" 
                                    v-else
                                    class="svg-size icon-zoom-small"
                                />
                                <span :style="{
                            color: textColor
                        }" >衰减</span>
                            </div>
                            <div
                                @click="positionPanel.spread.before.selected = 2"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }" 
                                    v-if="positionPanel.spread.before.selected === 2"
                                    class="svg-size icon-zoom-small"
                                />
                                <SVGCheckOff :style="{
                            color: textColor
                        }" 
                                    v-else
                                    class="svg-size icon-zoom-small"
                                />
                                <span :style="{
                            color: textColor
                        }" >不影响</span>
                            </div>
                        </div>
                        <div class="window-panel-line-text">

                        </div>
                    </div>
                    <div
                        v-if="positionPanel.spread.before.selected === 1"
                        class="window-panel-line"
                    >
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            衰减距离
                        </div>
                        <div class="window-panel-line-center">
                            <div class="control-buttons-container">
                                <SVGFrameLast :style="{
                            color: textColor
                        }" 
                                    @click="() => {
                                        positionPanel.spread.before.radius = parseInt(`${positionPanel.spread.before.radius}`)
                                        if (positionPanel.spread.before.radius > 0) {
                                            positionPanel.spread.before.radius--
                                        }
                                    }"
                                    class="svg-size"
                                />
                                <SVGFrameNext :style="{
                            color: textColor
                        }" 
                                    @click="() => {
                                        positionPanel.spread.before.radius = parseInt(`${positionPanel.spread.before.radius}`)
                                        if (positionPanel.spread.before.radius < positionPanel.spread.getBeforeCanMoveFrameNum()) {
                                            positionPanel.spread.before.radius++
                                        }
                                    }"
                                    class="svg-size frame-next-margin"
                                />
                            </div>
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                v-model="positionPanel.spread.before.radius"
                                type="range"
                                :max="positionPanel.spread.getBeforeCanMoveFrameNum()"
                                :min="0"
                            >
                        </div>
                        <div style="min-width: 85px" class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            <span>
                                {{ positionPanel.spread.before.radius }}
                            </span>
                            <span v-if="motionStore.currentFrameIndex < positionPanel.spread.before.radius" style="margin-left: 4px" >
                                ({{ motionStore.currentFrameIndex }})
                            </span>
                        </div>
                    </div>
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            后帧
                        </div>
                        <div class="window-panel-line-center">
                            <div
                                @click="positionPanel.spread.after.selected = 0"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }" 
                                    v-if="positionPanel.spread.after.selected === 0"
                                    class="svg-size icon-zoom-small"
                                />
                                <SVGCheckOff :style="{
                            color: textColor
                        }" 
                                    v-else
                                    class="svg-size icon-zoom-small"
                                />
                                <span :style="{
                            color: textColor
                        }" >全部</span>
                            </div>
                            <div
                                @click="positionPanel.spread.after.selected = 1"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }" 
                                    v-if="positionPanel.spread.after.selected === 1"
                                    class="svg-size icon-zoom-small"
                                />
                                <SVGCheckOff :style="{
                            color: textColor
                        }" 
                                    v-else
                                    class="svg-size icon-zoom-small"
                                />
                                <span :style="{
                            color: textColor
                        }" >衰减</span>
                            </div>
                            <div
                                @click="positionPanel.spread.after.selected = 2"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }" 
                                    v-if="positionPanel.spread.after.selected === 2"
                                    class="svg-size icon-zoom-small"
                                />
                                <SVGCheckOff :style="{
                            color: textColor
                        }" 
                                    v-else
                                    class="svg-size icon-zoom-small"
                                />
                                <span :style="{
                            color: textColor
                        }" >不影响</span>
                            </div>
                        </div>
                        <div class="window-panel-line-text">

                        </div>
                    </div>
                    <div
                        v-if="positionPanel.spread.after.selected === 1"
                        class="window-panel-line"
                    >
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            衰减距离
                        </div>
                        <div class="window-panel-line-center">
                            <div class="control-buttons-container">
                                <SVGFrameLast :style="{
                            color: textColor
                        }" 
                                    @click="() => {
                                        positionPanel.spread.after.radius = parseInt(`${positionPanel.spread.after.radius}`)
                                        if (positionPanel.spread.after.radius > 0) {
                                            positionPanel.spread.after.radius--
                                        }
                                    }"
                                    class="svg-size"
                                />
                                <SVGFrameNext :style="{
                            color: textColor
                        }" 
                                    @click="() => {
                                        positionPanel.spread.after.radius = parseInt(`${positionPanel.spread.after.radius}`)
                                        if (positionPanel.spread.after.radius < positionPanel.spread.getAfterCanMoveFrameNum()) {
                                            positionPanel.spread.after.radius++
                                        }
                                    }"
                                    class="svg-size frame-next-margin"
                                />
                            </div>
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                v-model="positionPanel.spread.after.radius"
                                type="range"
                                :max="positionPanel.spread.getAfterCanMoveFrameNum()"
                                :min="0"
                            >
                        </div>
                        <div style="min-width: 85px" class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            <span>
                                {{ positionPanel.spread.after.radius }}
                            </span>
                            <span v-if="motionStore.frame_getNum() - 1 - motionStore.currentFrameIndex < positionPanel.spread.after.radius" style="margin-left: 4px" >
                                ({{ motionStore.frame_getNum() - 1 - motionStore.currentFrameIndex }})
                            </span>
                        </div>
                    </div>
                    <div class="panel-divider">

                    </div>
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            X单位
                        </div>
                        <div class="window-panel-line-center">
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                :value="positionPanel.unit.get('x')"
                                @change="(e: Event) => {
                                    const value = parseInt((e.target as HTMLInputElement).value)
                                    positionPanel.unit.set('x', value)
                                }"
                                type="range"
                                :max="13"
                                :min="1"
                            >
                        </div>
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            {{ positionPanel.unit.x }}
                        </div>
                    </div>
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            X偏移
                        </div>
                        <div class="window-panel-line-center">
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                v-model="positionPanel.offset.x"
                                @change="(e: Event) => {
                                    // const value = parseInt((e.target as HTMLInputElement).value)
                                    // positionPanel.spread.set(value)
                                    positionPanel.offset.x = 0
                                }"
                                @mousedown="() => {
                                    positionPanel.offset.handleStart('x')
                                }"
                                type="range"
                                :max="10000000000"
                                :min="-10000000000"
                            >
                        </div>
                        <div class="window-panel-line-text">

                        </div>
                    </div>
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            Y单位
                        </div>
                        <div class="window-panel-line-center">
                            <input
                                class="slider full-width"

                                :class="isDarkTheme?'':'slider-light'"
                                :value="positionPanel.unit.get('y')"
                                @change="(e: Event) => {
                                    const value = parseInt((e.target as HTMLInputElement).value)
                                    positionPanel.unit.set('y', value)
                                }"
                                type="range"
                                :max="13"
                                :min="1"
                            >
                        </div>
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            {{ positionPanel.unit.y }}
                        </div>
                    </div>
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            Y偏移
                        </div>
                        <div class="window-panel-line-center">
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                v-model="positionPanel.offset.y"
                                @change="(e: Event) => {
                                    // const value = parseInt(e.target.value)
                                    // positionPanel.spread.set(value)
                                    positionPanel.offset.y = 0
                                }"
                                @mousedown="() => {
                                    positionPanel.offset.handleStart('y')
                                }"
                                type="range"
                                :max="10000000000"
                                :min="-10000000000"
                            >
                        </div>
                        <div class="window-panel-line-text">

                        </div>
                    </div>
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            Z单位
                        </div>
                        <div class="window-panel-line-center">
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                :value="positionPanel.unit.get('z')"
                                @change="(e: Event) => {
                                    const value = parseInt((e.target as HTMLInputElement).value)
                                    positionPanel.unit.set('z', value)
                                }"
                                type="range"
                                :max="13"
                                :min="1"
                            >
                        </div>
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            {{ positionPanel.unit.z }}
                        </div>
                    </div>
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }" >
                            Z偏移
                        </div>
                        <div class="window-panel-line-center">
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                v-model="positionPanel.offset.z"
                                @change="(e: Event) => {
                                    // const value = parseInt(e.target.value)
                                    // positionPanel.spread.set(value)
                                    positionPanel.offset.z = 0
                                }"
                                @mousedown="() => {
                                    positionPanel.offset.handleStart('z')
                                }"
                                type="range"
                                :max="10000000000"
                                :min="-10000000000"
                            >
                        </div>
                        <div class="window-panel-line-text">

                        </div>
                    </div>
                </div>
            </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { IPositionPanel } from './data'

// SVG 图标导入
import SVGClose from '@/assets/svg/motion-editor-close.svg'
import SVGCheck from '@/assets/svg/motion-editor-check.svg'
import SVGCheckOff from '@/assets/svg/motion-editor-check-off.svg'
import SVGFrameLast from '@/assets/svg/motion-editor-frame-last.svg'
import SVGFrameNext from '@/assets/svg/motion-editor-frame-next.svg'

// 定义 Props 接口
interface PositionPanelUIProps {
    positionPanel: IPositionPanel
    motionStore: any
    isDarkTheme: boolean
    textColor: string
}

// 接收 props
const props = defineProps<PositionPanelUIProps>()

// 解构 props 为局部变量
const {
    positionPanel,
    motionStore
} = props

// Ref
const positionPanelContainer = ref<HTMLElement | null>(null)

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)

</script>

<style scoped>
@import '../style.css';
</style>

