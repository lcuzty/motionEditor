import { ref, type Ref } from 'vue'
import { throttle } from 'lodash-es'
import type { FrameLike } from '../tools/motionEditorTools'
import type { IPathPanel } from '../pathPanel/data'

export interface IDragJointSettingsPanel {
  showMenu: boolean
  handleShow: () => void
  handleHide: () => void
  position: {
    left: number
    top: number
    lastX: number
    lastY: number
    moving: boolean
    handleStart: (e: MouseEvent) => void
    handleMove: (e: MouseEvent) => void
    handleEnd: () => void
    handleModify: () => void
  }
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
  drag: {
    jointName: string
    startArr: number[]
    jointInfo: { limit: { lower: number; upper: number } } | null
    moving: boolean
    frameIndex: number
    pendingAdjustedAngles: number[] | null
    pendingRange: { start: number; end: number } | null
    applyOnMovingDelayTimer: NodeJS.Timeout | null
    handleStart: (jointName: string) => void
    handleMove: (currentAngleValue?: number) => void
    applyPending: (forceUpdate?: boolean) => void
    handleEnd: () => void
  }
}

interface DragJointSettingsPanelDependencies {
  dragJointSettingsPanelContainer: Ref<HTMLElement | null>
  controlsContainer: Ref<HTMLElement | null>
  CONSTANTS: { THROTTLE_DELAY: number }
  motionStore: any
  withDrawStore: any
  rippleAdjust: (
    arr: number[],
    frameIndex: number,
    offset: number,
    beforeRadius: number,
    afterRadius: number
  ) => number[]
  pathPanel: Ref<IPathPanel>
  api: any
  jointPositionLine: Ref<any>
  viewer: Ref<any>
}

export function createDragJointSettingsPanelData({
  dragJointSettingsPanelContainer,
  controlsContainer,
  CONSTANTS,
  motionStore,
  withDrawStore,
  rippleAdjust,
  pathPanel,
  api,
  jointPositionLine,
  viewer,
}: DragJointSettingsPanelDependencies) {
  /**
   * 拖拽关节设置面板的完整功能实现
   *
   * 这是一个复合功能面板，包含三个主要部分：
   * 1. 面板本身的显示/隐藏和位置拖拽
   * 2. 扩散范围设置（调整关节时影响前后多少帧）
   * 3. 关节拖拽调整功能（直接在3D场景中拖拽关节来调整角度）
   *
   * 这个面板让用户可以更直观地调整机器人动作，而不需要在数据面板中
   * 逐个输入数值，大大提高了动作编辑的效率和直观性。
   */
  const dragJointSettingsPanel = ref({
    showMenu: false,
    handleShow() {
      this.showMenu = true
    },
    handleHide() {
      this.showMenu = false
    },

    /**
     * 面板位置控制系统
     *
     * 允许用户拖拽面板到屏幕上的任意位置，并确保面板始终保持在可视区域内。
     * 使用节流优化来避免拖拽时的性能问题，让拖拽过程更加流畅。
     */
    position: {
      left: 40,
      top: 40,
      lastX: 0,
      lastY: 0,
      moving: false,
      handleStart(e: MouseEvent) {
        this.lastX = e.x
        this.lastY = e.y
        this.moving = true
      },
      handleMove(e: MouseEvent) {
        if (this.moving === false) return
        const deltaX = e.x - this.lastX
        const deltaY = e.y - this.lastY
        this.lastX = e.x
        this.lastY = e.y
        this.left += deltaX
        this.top += deltaY
        this.handleModify()
      },
      handleEnd() {
        this.moving = false
      },
      handleModify: throttle(function (this: typeof dragJointSettingsPanel.value.position) {
        if (dragJointSettingsPanelContainer.value === null || controlsContainer.value === null)
          return
        const panelElement = dragJointSettingsPanelContainer.value as HTMLElement
        const panelLeft = this.left
        const panelTop = this.top
        const viewportWidth = (controlsContainer.value as HTMLElement).clientWidth as number
        const viewportHeight = (controlsContainer.value as HTMLElement).clientHeight as number
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
      }, CONSTANTS.THROTTLE_DELAY),
    },

    /**
     * 扩散范围控制系统
     *
     * 当用户调整某个关节的角度时，可以设置这个调整影响前后多少帧。
     * 这样可以创造出平滑的动作过渡效果，而不是只改变单独一帧造成动作突兀。
     *
     * 例如：如果设置扩散范围为5帧，调整当前帧的手臂角度时，
     * 前面2帧和后面2帧也会相应地进行渐变调整，形成自然的动作流。
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
        selected: 2,
        radius: 0,
      },
      after: {
        selected: 2,
        radius: 0,
      },
      update() {
        this.before.radius = parseInt(`${this.before.radius}`)
        this.after.radius = parseInt(`${this.after.radius}`)
        const currentFrameIndex = motionStore.currentFrameIndex
        if (this.before.radius > currentFrameIndex) {
          this.before.radius = this.getBeforeCanMoveFrameNum()
        }
        if (this.after.radius + currentFrameIndex + 1 > motionStore.frame_getNum()) {
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
      },
    },

    /**
     * 关节拖拽调整系统
     *
     * 这是整个面板最核心的功能，允许用户直接在3D场景中点击并拖拽机器人的关节
     * 来调整关节角度。这种交互方式比在数据面板中输入数值要直观得多。
     *
     * 工作流程：
     * 1. 用户点击3D场景中的某个关节开始拖拽
     * 2. 系统记录该关节在所有帧中的原始角度数据
     * 3. 用户拖拽时，系统计算角度变化量
     * 4. 根据扩散范围设置，使用波纹算法调整相关帧的角度
     * 5. 应用关节限制（防止角度超出机械限制范围）
     * 6. 实时更新3D模型和轨迹面板显示
     */
    drag: {
      jointName: '',
      startArr: [] as number[],
      jointInfo: null as { limit: { lower: number; upper: number } } | null,
      moving: false,
      frameIndex: 0,
      pendingAdjustedAngles: null as number[] | null,
      pendingRange: null as { start: number; end: number } | null,
      applyOnMovingDelayTimer: null as NodeJS.Timeout | null,
      handleStart(jointName: string) {
        if (this.moving) return
        const jointData = motionStore.getFieldSeries(jointName)
        if (!jointData) return
        this.jointName = jointName
        this.moving = true
        this.startArr = jointData.data
        this.jointInfo = jointData.info
        this.frameIndex = motionStore.currentFrameIndex
        this.pendingAdjustedAngles = null
        this.pendingRange = null
        withDrawStore.setOperationInfo('关节拖拽', jointName)
      },
      handleMove(currentAngleValue?: number, enableApply: boolean = true) {
        if (!this.moving || typeof currentAngleValue !== 'number') return
        const originalJointAngles = this.startArr
        const totalFrames = originalJointAngles.length
        const dragStartFrameIndex = this.frameIndex
        const originalAngleValue = originalJointAngles[dragStartFrameIndex]
        const angleChangeAmount = currentAngleValue - originalAngleValue
        const beforeSpreadCount = (() => {
          if (dragJointSettingsPanel.value.spread.before.selected === 0) return -1
          if (dragJointSettingsPanel.value.spread.before.selected === 1)
            return dragJointSettingsPanel.value.spread.before.radius
          if (dragJointSettingsPanel.value.spread.before.selected === 2) return 0
          return 0
        })()
        const afterSpreadCount = (() => {
          if (dragJointSettingsPanel.value.spread.after.selected === 0) return -1
          if (dragJointSettingsPanel.value.spread.after.selected === 1)
            return dragJointSettingsPanel.value.spread.after.radius
          if (dragJointSettingsPanel.value.spread.after.selected === 2) return 0
          return 0
        })()
        const sliceStart = Math.max(
          0,
          dragStartFrameIndex - (beforeSpreadCount === -1 ? dragStartFrameIndex : beforeSpreadCount)
        )
        const sliceEnd = Math.min(
          totalFrames - 1,
          dragStartFrameIndex +
            (afterSpreadCount === -1 ? totalFrames - 1 - dragStartFrameIndex : afterSpreadCount)
        )
        const slice = originalJointAngles.slice(sliceStart, sliceEnd + 1)
        // console.log(112277, slice, sliceStart, sliceEnd)
        const adjustedJointAngles = rippleAdjust(
          slice,
          dragStartFrameIndex - sliceStart,
          angleChangeAmount,
          beforeSpreadCount,
          afterSpreadCount
        )
        this.pendingAdjustedAngles = adjustedJointAngles.map(angle => {
          if (!this.jointInfo || !this.jointInfo.limit) return angle
          if (angle > this.jointInfo.limit.upper) return this.jointInfo.limit.upper
          if (angle < this.jointInfo.limit.lower) return this.jointInfo.limit.lower
          return angle
        })
        this.pendingRange = { start: sliceStart, end: sliceEnd }
        if (enableApply) {
          if (this.applyOnMovingDelayTimer) {
            clearTimeout(this.applyOnMovingDelayTimer)
          }
          this.applyOnMovingDelayTimer = setTimeout(() => {
            this.applyPending()
          }, 30)
        }
      },
      applyPending(forceUpdate: boolean = false) {
        if (!this.pendingAdjustedAngles || !this.pendingAdjustedAngles.length || !this.pendingRange)
          return
        const applyStart = this.pendingRange.start
        for (let frameIndex = 0; frameIndex < this.pendingAdjustedAngles.length; frameIndex++) {
          motionStore.setFrameFieldValue(
            applyStart + frameIndex,
            this.jointName,
            this.pendingAdjustedAngles[frameIndex]
          )
        }
        const isCurrentField = pathPanel?.value?.field === this.jointName
        if (forceUpdate || !isCurrentField) {
          pathPanel.value.handleUpDateData()
        }
        api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
        jointPositionLine.value.handleUpdate()
        api.forceRender()

        let comStart =
          motionStore.currentFrameIndex - dragJointSettingsPanel.value.spread.before.radius - 3
        if (comStart < 0) comStart = 0
        // 禁用ripple更新3d位置线条
        if ((viewer.value.jointPositionLine3D.showNum() || forceUpdate) && false)
          viewer.value.jointPositionLine3D.compute(
            dragJointSettingsPanel.value.spread.before.selected === 0 ? 0 : comStart,
            dragJointSettingsPanel.value.spread.after.selected === 0
              ? motionStore.frame_getNum() - 1
              : motionStore.currentFrameIndex +
                  dragJointSettingsPanel.value.spread.after.radius +
                  3,
            motionStore.motionData?.parsed || ([] as FrameLike[])
          )
      },
      handleEnd() {
        if (this.moving) {
          this.applyPending(true)
        }
        this.moving = false
        this.pendingAdjustedAngles = null
        this.pendingRange = null
      },
    },
  })
  return dragJointSettingsPanel
}
