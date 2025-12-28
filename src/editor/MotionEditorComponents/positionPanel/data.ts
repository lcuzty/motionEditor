
import { ref, type Ref } from 'vue'
import type { FrameLike } from '../tools/motionEditorTools'

export interface IPositionPanel {
    show: number
    isShow: () => boolean
    handleShow: () => void
    handleHide: () => void
    spread: {
        value: number
        get: () => number
        set: (newValue: number) => void
        before: {
            selected: number
            radius: number
        }
        after: {
            selected: number
            radius: number
        }
        update: () => void
        getBeforeCanMoveFrameNum: () => number
        getAfterCanMoveFrameNum: () => number
    }
    unit: {
        x: number
        y: number
        z: number
        get: (axisName: string) => number
        set: (axisName: string, newValue: number) => void
    }
    offset: {
        x: number
        y: number
        z: number
        moving: boolean
        lastX: number
        selected: string
        dir: number
        startArr: number[]
        currentFrameIndexInStartArr: number
        startFrameIndex: number
        startFillZeroNum: number
        endFillZeroNum: number
        applyTimer: NodeJS.Timeout | null
        handleStart: (selected: string) => void
        handleMove: () => void
        apply: (forceUpdate?: boolean) => void
        handleEnd: () => void
    }
    position: {
        left: number
        top: number
        lastX: number
        lastY: number
        moving: boolean
        handleStart: (e: MouseEvent) => void
        handleEnd: () => void
        handleMove: (e: MouseEvent) => void
        handleModifyPosition: () => void
    }
}

interface BVHAdapt {
    positionScale?: number
}

interface PositionPanelDependencies {
    motionStore: any
    robotModelStore: any
    withDrawStore: any
    rippleAdjust: (arr: number[], frameIndex: number, offset: number, beforeRadius: number, afterRadius: number) => number[]
    api: any
    viewer: Ref<any>
    controlsContainer: Ref<HTMLElement | null>
    positionPanelContainer: Ref<HTMLElement | null>
}

/**
 * 机器人Base位置调整面板的完整实现
 * 
 * 这是一个专门用于调整机器人整体位置（Base位置）的控制面板。
 * 当用户启用Base位置轨迹线显示时，这个面板会自动出现，提供以下功能：
 * 
 * 1. 面板显示/隐藏控制
 * 2. 扩散范围设置（调整位置时影响前后多少帧）
 * 3. XYZ三轴的调整灵敏度设置
 * 4. 直接拖拽调整机器人在3D空间中的位置
 * 5. 面板位置拖拽（用户可以移动面板到合适位置）
 * 
 * 这个面板让用户可以直观地调整机器人的移动轨迹，
 * 比如让机器人向前走、向上跳、向左移动等。
 */
export function createPositionPanelData({
    motionStore,
    robotModelStore,
    withDrawStore,
    rippleAdjust,
    api,
    viewer,
    controlsContainer,
    positionPanelContainer
}: PositionPanelDependencies) {
    const positionPanel = ref({
        show: 0,
        isShow() {
            return this.show !== 0
        },
        handleShow() {
            this.show = 1
            this.position.handleModifyPosition()
        },
        handleHide() {
            this.show = 0
        },
        /**
         * 位置调整的扩散范围控制系统
         * 
         * 与关节调整类似，位置调整也支持扩散效果。
         * 当用户调整当前帧的机器人位置时，可以让这个调整影响前后的多个帧，
         * 从而创造出平滑的位置过渡效果。
         * 
         * 例如：用户想让机器人在第10帧向右移动1米，
         * 如果设置扩散范围为5帧，那么第5-15帧都会相应调整，
         * 形成一个平滑的向右移动过程，而不是突然跳跃。
         */
        spread: {
            value: 0,
            get() {
                return this.value
            },
            set(newValue: number) {
                this.value = newValue
            },
            before: {
                selected: 0,
                radius: 0,
            },
            after: {
                selected: 0,
                radius: 0,
            },
            update() {
                this.before.radius = parseInt(`${this.before.radius}`)
                this.after.radius = parseInt(`${this.after.radius}`)
                const currentFrameIndex = motionStore.currentFrameIndex
                if (this.before.radius > currentFrameIndex) {
                    this.before.radius = this.getBeforeCanMoveFrameNum()
                }
                if ((this.after.radius + currentFrameIndex + 1) > motionStore.frame_getNum()) {
                    this.after.radius = this.getAfterCanMoveFrameNum()
                }
            },
            getBeforeCanMoveFrameNum() {
                return motionStore.frame_getNum() - 1
                const currentFrameIndex = motionStore.currentFrameIndex
                return currentFrameIndex
            },
            getAfterCanMoveFrameNum() {
                return motionStore.frame_getNum() - 1
                const currentFrameIndex = motionStore.currentFrameIndex
                return motionStore.frame_getNum() - (currentFrameIndex + 1)
            }
        },
        /**
         * 位置调整灵敏度控制系统
         * 
         * 控制用户拖拽调整机器人位置时的灵敏度。不同的轴向可以设置不同的灵敏度，
         * 这样用户可以根据需要进行精细调整或粗略调整。
         * 
         * 数值含义：
         * - 数值越小：调整越精细，适合微调
         * - 数值越大：调整越粗糙，适合大幅移动
         * 
         * 特殊值映射是为了在界面上提供更直观的选项，
         * 比如"精细"、"普通"、"粗糙"等预设值。
         */
        unit: {
            x: 0.3,
            y: 0.3,
            z: 0.3,
            get(axisName: string) {
                let axisValue = ((this as unknown as Record<string, number>)[axisName] as number)
                if (axisValue === 3) return 11
                if (axisValue === 5) return 12
                if (axisValue === 10) return 13
                return axisValue * 10
            },
            set(axisName: string, newValue: number) {
                if (newValue === 11) {
                    ((this as unknown as Record<string, number>)[axisName] as number) = 3
                } else if (newValue === 12) {
                    ((this as unknown as Record<string, number>)[axisName] as number) = 5
                } else if (newValue === 13) {
                    ((this as unknown as Record<string, number>)[axisName] as number) = 10
                } else {
                    ((this as unknown as Record<string, number>)[axisName] as number) = newValue / 10
                }
            }
        },
        /**
         * 位置拖拽调整系统
         * 
         * 这是整个位置面板最核心的功能，允许用户通过拖拽操作直接调整机器人在3D空间中的位置。
         * 
         * 主要功能：
         * 1. 支持XYZ三个轴向的独立调整
         * 2. 实时计算拖拽距离并转换为位置偏移
         * 3. 根据扩散范围设置影响多个帧
         * 4. 处理不同坐标系之间的转换（BVH vs JSON格式）
         * 5. 实时更新3D场景和轨迹线显示
         * 
         * 使用场景：
         * - 让机器人整体向前/后移动
         * - 调整机器人的高度（跳跃、蹲下等）
         * - 让机器人左右移动
         * - 微调机器人的精确位置
         */
        offset: {
            x: 0,
            y: 0,
            z: 0,
            moving: false,
            lastX: 0,
            selected: '',
            dir: 1,
            startArr: [] as number[],
            currentFrameIndexInStartArr: 0,
            startFrameIndex: 0,
            startFillZeroNum: 0,
            endFillZeroNum: 0,
            applyTimer: null as NodeJS.Timeout | null,
            /**
             * 开始位置拖拽调整的初始化方法
             * 
             * 当用户点击某个轴向的调整按钮开始拖拽时调用。
             * 这个方法负责准备拖拽所需的所有数据和状态：
             * 
             * 1. 记录拖拽开始时的状态（帧索引、轴向等）
             * 2. 获取选中轴向在所有帧中的原始位置数据
             * 3. 处理坐标系转换（BVH和JSON格式的坐标系不同）
             * 4. 为Z轴数据进行必要的数值反转
             * 
             * 坐标系转换说明：
             * - BVH格式：直接使用XYZ
             * - JSON格式：Y轴和Z轴需要交换（Y->Z, Z->Y）
             */
            handleStart(selected: string) {
                this.moving = true
                this.startFrameIndex = motionStore.currentFrameIndex
                this.startFillZeroNum = positionPanel.value.spread.value - motionStore.currentFrameIndex
                if (this.startFillZeroNum < 0) this.startFillZeroNum = 0
                this.endFillZeroNum = motionStore.currentFrameIndex + 1 + positionPanel.value.spread.value - motionStore.getFrameCount()
                if (this.endFillZeroNum < 0) this.endFillZeroNum = 0
                this.selected = selected
                const originalPositionData = (motionStore.getFieldSeries(`global_${((): 'x' | 'y' | 'z' => {
                    if (robotModelStore.isBVH) return selected as 'x' | 'y' | 'z'
                    if (selected === 'x') return 'x'
                    if (selected === 'y') return 'z'
                    if (selected === 'z') return 'y'
                    return 'x'
                })()}`)?.data || []) as number[]
                if (!originalPositionData.length) {
                    this.startArr = []
                    return
                }
                const dragStartFrameIndex = this.startFrameIndex
                const processedPositionData: number[] = originalPositionData
                if (selected === 'z' && !robotModelStore.isBVH) {
                    for (let frameIndex = 0; frameIndex < processedPositionData.length; frameIndex++) {
                        processedPositionData[frameIndex] = processedPositionData[frameIndex] * -1
                    }
                }
                this.startArr = processedPositionData
                withDrawStore.setOperationInfo('位置', null)
            },
            /**
             * 处理位置拖拽过程中的实时调整
             * 
             * 这是拖拽调整的核心方法，在用户拖拽过程中持续调用。
             * 负责将用户的拖拽动作转换为实际的位置调整：
             * 
             * 1. 将拖拽距离转换为标准化数值（归一化处理）
             * 2. 应用调整灵敏度和位置缩放比例
             * 3. 根据扩散范围设置，使用波纹算法调整多个帧
             * 4. 处理坐标系转换和数值反转
             * 5. 实时更新3D场景显示
             * 
             * 波纹算法：让调整产生平滑的过渡效果，而不是突兀的跳跃
             */
            handleMove() {
                if (!this.moving) return
                if (motionStore.playStatus === 1) {
                    this.handleEnd()
                    return
                }
                const selectedAxis = this.selected
                let normalizedDragDistance = parseFloat(`${this[this.selected as 'x' | 'y' | 'z']}`) / 10000000000
                if (normalizedDragDistance > 1) normalizedDragDistance = 1
                if (normalizedDragDistance < -1) normalizedDragDistance = -1
                const positionScale = (motionStore.motionData?.bvhAdapt && typeof motionStore.motionData.bvhAdapt === 'object' && 'positionScale' in motionStore.motionData.bvhAdapt) ? (motionStore.motionData.bvhAdapt as BVHAdapt).positionScale || 1 : 1
                const positionOffset = normalizedDragDistance * positionPanel.value.unit[this.selected as 'x' | 'y' | 'z'] * positionScale
                this.dir = positionOffset > 0 ? 1 : 0;
                (this as Record<'x' | 'y' | 'z', number>)[this.selected as 'x' | 'y' | 'z'] = positionOffset
    
                const originalPositionData = JSON.parse(JSON.stringify(this.startArr))
                const beforeSpreadCount = (() => {
                    if (positionPanel.value.spread.before.selected === 0) return -1
                    if (positionPanel.value.spread.before.selected === 1) return positionPanel.value.spread.before.radius
                    if (positionPanel.value.spread.before.selected === 2) return 0
                    return 0
                })()
                const afterSpreadCount = (() => {
                    if (positionPanel.value.spread.after.selected === 0) return -1
                    if (positionPanel.value.spread.after.selected === 1) return positionPanel.value.spread.after.radius
                    if (positionPanel.value.spread.after.selected === 2) return 0
                    return 0
                })()
                const adjustedPositionData = rippleAdjust(originalPositionData, motionStore.currentFrameIndex, positionOffset, beforeSpreadCount, afterSpreadCount)
                for (let frameIndex = 0; frameIndex < adjustedPositionData.length; frameIndex++) {
                    const currentFrameIndex = frameIndex
                    motionStore.setFrameFieldValue(currentFrameIndex, `global_${(() => {
                        if (robotModelStore.isBVH) return selectedAxis
                        if (selectedAxis === 'x') return 'x'
                        if (selectedAxis === 'y') return 'z'
                        if (selectedAxis === 'z') return 'y'
                        return 'x'
                    })()}`, adjustedPositionData[frameIndex] * ((selectedAxis === 'z' && !robotModelStore.isBVH) ? -1 : 1))
                }
    
    
                // basePositionLine.value.handleUpdate()
                // 移除实时更新，改为在handleEnd时更新
                api.robot.setFrame((motionStore.getCurrentFrame() as FrameLike))
                api.forceRender()
    
                if (!this.applyTimer) {
                    this.applyTimer = setTimeout(() => {
                        this.apply()
                        this.applyTimer = null
                    }, 10)
                }
            },
    
            apply(forceUpdate: boolean = false){
                if(viewer.value.jointPositionLine3D.showNum() || forceUpdate)viewer.value.jointPositionLine3D.compute(
                    (() => {
                        if (positionPanel.value.spread.before.selected === 0) return motionStore.currentFrameIndex
                        if (positionPanel.value.spread.before.selected === 1) return motionStore.currentFrameIndex - positionPanel.value.spread.before.radius
                        if (positionPanel.value.spread.before.selected === 2) return 0
                        return 0
                    })(), 
                    (() => {
                        if (positionPanel.value.spread.after.selected === 0) return motionStore.frame_getNum() - 1 - motionStore.currentFrameIndex
                        if (positionPanel.value.spread.after.selected === 1) return motionStore.currentFrameIndex + positionPanel.value.spread.after.radius
                        if (positionPanel.value.spread.after.selected === 2) return 0
                        return 0
                    })(), 
                    motionStore.motionData?.parsed || []
                )
            },
            /**
             * 结束位置拖拽调整的清理方法
             * 
             * 当用户释放鼠标或拖拽操作完成时调用。
             * 负责清理所有拖拽相关的状态和数据，为下次拖拽做准备：
             * 
             * 1. 重置移动状态标志
             * 2. 清零所有轴向的偏移量
             * 3. 清空原始数据数组释放内存
             * 4. 重置所有索引和选择状态
             * 
             * 这样确保每次拖拽都是独立的，不会受到上次操作的影响。
             */
            handleEnd() {
                if (this.applyTimer) {
                    clearTimeout(this.applyTimer)
                    this.applyTimer = null
                }
                if (this.moving) {
                    this.apply(true);
                }
                this.moving = false;
                // 位置调整结束时更新关节位置线条
                this.x = 0
                this.y = 0
                this.z = 0
                this.startArr = []
                this.currentFrameIndexInStartArr = 0
                this.selected = ''
            }
        },
        /**
         * 位置面板的拖拽移动控制系统
         * 
         * 允许用户拖拽位置面板到屏幕上的任意位置，提高使用的灵活性。
         * 同时确保面板始终保持在可视区域内，防止用户意外将面板拖拽到屏幕外而找不到。
         * 
         * 功能特点：
         * 1. 支持自由拖拽移动
         * 2. 自动边界检测和修正
         * 3. 平滑的拖拽体验
         * 4. 防止面板丢失（始终在可视区域内）
         */
        position: {
            left: 50,
            top: 50,
            lastX: 0 as number,
            lastY: 0 as number,
            moving: false,
            handleStart(e: MouseEvent) {
                this.moving = true
                this.lastX = e.x
                this.lastY = e.y
            },
            handleEnd() {
                this.moving = false
            },
            handleMove(e: MouseEvent) {
                if (!this.moving) return
                const deltaX = e.x - this.lastX
                const deltaY = e.y - this.lastY
                this.lastX = e.x
                this.lastY = e.y
                this.left += deltaX
                this.top += deltaY
                this.handleModifyPosition()
            },
            handleModifyPosition() {
                if (controlsContainer.value === null) return
                if (positionPanelContainer.value === null) return
                const panelElement = positionPanelContainer.value as HTMLElement
                const panelLeft = this.left
                const panelTop = this.top
                const viewportWidth = ((controlsContainer.value as HTMLElement).clientWidth as number)
                const viewportHeight = ((controlsContainer.value as HTMLElement).clientHeight as number)
                const panelWidth = panelElement.clientWidth as number
                const panelHeight = panelElement.clientHeight as number
                if (panelLeft + panelWidth > viewportWidth) {
                    this.left = viewportWidth - panelWidth
                }
                if (panelLeft < 0) {
                    this.left = 0
                }
                if (panelTop + panelHeight > viewportHeight) {
                    this.top = viewportHeight - panelHeight
                }
                if (panelTop < 0) {
                    this.top = 0
                }
            }
        }
    })
    return positionPanel
}