<template>
  <div
                ref="dragJointSettingsPanelContainer"
                class="container-window-panel drag-joint-panel-container"
                :class="{
                    'container-window-panel-hide': !dragJointSettingsPanel.showMenu,
                    'container-window-panel-light': !isDarkTheme
                }"
                :style="{
                    left: `${dragJointSettingsPanel.position.left}px`,
                    top: `${dragJointSettingsPanel.position.top}px`,
                }"
            >
                <div
                    @mousedown="(e: MouseEvent) => dragJointSettingsPanel.position.handleStart(e)"
                    class="window-panel-title"
                    :class="isDarkTheme?'':'window-panel-title-light'"
                >
                    <span class="no-select">拖动关节设置</span>
                    <div class="flex-row-right zoom-small">
                        <div
                            @click="() => dragJointSettingsPanel.showMenu = false"
                            class="button2"
                        >
                            <SVGClose class="svg-size" />
                        </div>
                    </div>
                </div>
                <div class="window-panel-content">
                    <div class="window-panel-line">
                        <div class="window-panel-line-text" :style="{
                            color: textColor
                        }">
                            前帧
                        </div>
                        <div class="window-panel-line-center">
                            <div
                                v-if="!robotModelStore.isBVH"
                                @click="dragJointSettingsPanel.spread.before.selected = 0"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }"
                                    v-if="dragJointSettingsPanel.spread.before.selected === 0"
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
                        }">全部</span>
                            </div>
                            <div
                                @click="dragJointSettingsPanel.spread.before.selected = 1"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }"
                                    v-if="dragJointSettingsPanel.spread.before.selected === 1"
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
                        }">衰减</span>
                            </div>
                            <div
                                @click="dragJointSettingsPanel.spread.before.selected = 2"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }"
                                    v-if="dragJointSettingsPanel.spread.before.selected === 2"
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
                        }">不影响</span>
                            </div>
                        </div>
                        <div class="window-panel-line-text">

                        </div>
                    </div>
                    <div
                        v-if="dragJointSettingsPanel.spread.before.selected === 1"
                        class="window-panel-line"
                    >
                        <div :style="{
                            color: textColor
                        }" class="window-panel-line-text">
                            衰减距离
                        </div>
                        <div class="window-panel-line-center">
                            <div class="control-buttons-container">
                                <SVGFrameLast :style="{
                            color: textColor
                        }"
                                    @click="() => {
                                        dragJointSettingsPanel.spread.before.radius = parseInt(`${dragJointSettingsPanel.spread.before.radius}`)
                                        if (dragJointSettingsPanel.spread.before.radius > 0) {
                                            dragJointSettingsPanel.spread.before.radius--
                                        }
                                    }"
                                    class="svg-size"
                                />
                                <SVGFrameNext :style="{
                            color: textColor
                        }"
                                    @click="() => {
                                        dragJointSettingsPanel.spread.before.radius = parseInt(`${dragJointSettingsPanel.spread.before.radius}`)
                                        if (dragJointSettingsPanel.spread.before.radius < dragJointSettingsPanel.spread.getBeforeCanMoveFrameNum()) {
                                            dragJointSettingsPanel.spread.before.radius++
                                        }
                                    }"
                                    class="svg-size frame-next-margin"
                                />
                            </div>
                            <input :style="{
                            color: textColor
                        }"
                                class="slider full-width" :class="isDarkTheme?'':'slider-light'"
                                v-model="dragJointSettingsPanel.spread.before.radius"
                                type="range"
                                :max="dragJointSettingsPanel.spread.getBeforeCanMoveFrameNum()"
                                :min="0"
                            >
                        </div>
                        <div :style="{
                            color: textColor
                        }" class="window-panel-line-text" style="min-width: 85px" :title="
                        motionStore.currentFrameIndex < dragJointSettingsPanel.spread.before.radius ? '当前帧前面的帧数少于你设定的帧数，括号内为实际的当前帧前面的衰减帧数。' : ''
                        " >
                            <span>
                                {{ dragJointSettingsPanel.spread.before.radius }}
                            </span>
                            <span v-if="motionStore.currentFrameIndex < dragJointSettingsPanel.spread.before.radius" style="margin-left: 4px" >
                                ({{ motionStore.currentFrameIndex }})
                            </span>
                        </div>
                    </div>
                    <div class="window-panel-line">
                        <div :style="{
                            color: textColor
                        }" class="window-panel-line-text">
                            后帧
                        </div>
                        <div class="window-panel-line-center">
                            <div
                                v-if="!robotModelStore.isBVH"
                                @click="dragJointSettingsPanel.spread.after.selected = 0"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }"
                                    v-if="dragJointSettingsPanel.spread.after.selected === 0"
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
                        }">全部</span>
                            </div>
                            <div
                                @click="dragJointSettingsPanel.spread.after.selected = 1"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }"
                                    v-if="dragJointSettingsPanel.spread.after.selected === 1"
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
                        }">衰减</span>
                            </div>
                            <div
                                @click="dragJointSettingsPanel.spread.after.selected = 2"
                                class="panel-option-row"
                            >
                                <SVGCheck :style="{
                            color: textColor
                        }"
                                    v-if="dragJointSettingsPanel.spread.after.selected === 2"
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
                        }">不影响</span>
                            </div>
                        </div>
                        <div class="window-panel-line-text">

                        </div>
                    </div>
                    <div
                        v-if="dragJointSettingsPanel.spread.after.selected === 1"
                        class="window-panel-line"
                    >
                        <div :style="{
                            color: textColor
                        }" class="window-panel-line-text">
                            衰减距离
                        </div>
                        <div class="window-panel-line-center">
                            <div class="control-buttons-container">
                                <SVGFrameLast :style="{
                            color: textColor
                        }"
                                    @click="() => {
                                        dragJointSettingsPanel.spread.after.radius = parseInt(`${dragJointSettingsPanel.spread.after.radius}`)
                                        if (dragJointSettingsPanel.spread.after.radius > 0) {
                                            dragJointSettingsPanel.spread.after.radius--
                                        }
                                    }"
                                    class="svg-size"
                                />
                                <SVGFrameNext :style="{
                            color: textColor
                        }"
                                    @click="() => {
                                        dragJointSettingsPanel.spread.after.radius = parseInt(`${dragJointSettingsPanel.spread.after.radius}`)
                                        if (dragJointSettingsPanel.spread.after.radius < dragJointSettingsPanel.spread.getAfterCanMoveFrameNum()) {
                                            dragJointSettingsPanel.spread.after.radius++
                                        }
                                    }"
                                    class="svg-size frame-next-margin"
                                />
                            </div>
                            <input
                                class="slider full-width"
                                :class="isDarkTheme?'':'slider-light'"
                                v-model="dragJointSettingsPanel.spread.after.radius"
                                type="range"
                                :max="dragJointSettingsPanel.spread.getAfterCanMoveFrameNum()"
                                :min="0"
                            >
                        </div>
                        <div :style="{
                            color: textColor
                        }" class="window-panel-line-text" style="min-width: 85px" :title="
                        (motionStore.frame_getNum() - 1 - motionStore.currentFrameIndex) < dragJointSettingsPanel.spread.after.radius ? '当前帧后面的帧数少于你设定的帧数，括号内为实际的当前帧后面的衰减帧数。' : ''
                        " >
                            <span>
                                {{ dragJointSettingsPanel.spread.after.radius }}
                            </span>
                            <span v-if="(motionStore.frame_getNum() - 1 - motionStore.currentFrameIndex) < dragJointSettingsPanel.spread.after.radius" style="margin-left: 4px" >
                                ({{ motionStore.frame_getNum() - 1 - motionStore.currentFrameIndex }})
                            </span>
                        </div>
                    </div>
                </div>
            </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// SVG 图标导入
import SVGClose from '@/assets/svg/motion-editor-close.svg'
import SVGCheck from '@/assets/svg/motion-editor-check.svg'
import SVGCheckOff from '@/assets/svg/motion-editor-check-off.svg'
import SVGFrameLast from '@/assets/svg/motion-editor-frame-last.svg'
import SVGFrameNext from '@/assets/svg/motion-editor-frame-next.svg'

// 定义 Props 接口
interface DragJointSettingsPanelUIProps {
    dragJointSettingsPanel: any
    isDarkTheme: boolean
    textColor: string
    robotModelStore: any
    motionStore: any
}

// 接收 props
const props = defineProps<DragJointSettingsPanelUIProps>()

// 解构 props 为局部变量
const {
    dragJointSettingsPanel,
    robotModelStore,
    motionStore
} = props

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)

// Ref
const dragJointSettingsPanelContainer = ref<HTMLElement | null>(null)

</script>

<style scoped>
@import '../style.css';
</style>

