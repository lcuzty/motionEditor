import { ref, type Ref } from 'vue'

export interface IJointPositionLine3D {
  range: {
    start: number
    end: number
    startDotLeft: () => { percentage: number; px: number }
    endDotLeft: () => { percentage: number; px: number }
    moving: boolean
    lastX: number
    isLeft: boolean
    startX: number
    startValue: number
    handleStart: (e: MouseEvent, isLeft: boolean) => void
    handleMove: (e: MouseEvent) => void
    handleEnd: () => void
    movingGroup: boolean
    startStart: number
    startEnd: number
    handleMoveGroupStart: (e: MouseEvent) => void
    handleMoveGroupDrag: (e: MouseEvent) => void
    handleMoveGroupEnd: () => void
    modify: () => void
  }
  init: () => void
}

interface JointPositionLine3DDependencies {
  jointPositionRangeBar: Ref<HTMLElement | null>
  motionStore: any
  viewer: Ref<any>
}

export function createJointPositionLine3DData({
  jointPositionRangeBar,
  motionStore,
  viewer,
}: JointPositionLine3DDependencies) {
  const jointPositionLine3D = ref({
    range: {
      start: 0,
      end: 0,
      startDotLeft: () => {
        const container = jointPositionRangeBar.value
        if (!container) return { percentage: 0, px: 0 }
        const totalFrameNum = motionStore.frame_getNum() - 1
        return {
          percentage: jointPositionLine3D.value.range.start / totalFrameNum,
          px: (jointPositionLine3D.value.range.start / totalFrameNum) * container.clientWidth,
        }
      },
      endDotLeft: () => {
        const container = jointPositionRangeBar.value
        if (!container) return { percentage: 0, px: 0 }
        const totalFrameNum = motionStore.frame_getNum() - 1
        return {
          percentage: jointPositionLine3D.value.range.end / totalFrameNum,
          px: (jointPositionLine3D.value.range.end / totalFrameNum) * container.clientWidth,
        }
      },
      moving: false,
      lastX: 0,
      isLeft: false,
      startX: 0,
      startValue: 0,
      handleStart(e: MouseEvent, isLeft: boolean) {
        this.moving = true
        this.lastX = e.clientX
        this.isLeft = isLeft
        this.startX = e.x
        if (isLeft) {
          this.startValue = this.start
        } else {
          this.startValue = this.end
        }
      },
      handleMove(e: MouseEvent) {
        if (!this.moving) return
        const container = jointPositionRangeBar.value
        if (!container) return
        const currentX = e.x
        const startX = this.startX
        const delta = currentX - startX
        const deltaPer = delta / container.clientWidth
        const deltaValue = deltaPer * (motionStore.frame_getNum() - 1)
        let end = this.end
        let start = this.start
        let currentFrame = parseInt(`${this.startValue + deltaValue}`)
        if (this.isLeft) {
          if (currentFrame < 0) {
            currentFrame = 0
          }
          if (currentFrame > motionStore.frame_getNum() - 1) {
            currentFrame = motionStore.frame_getNum() - 1
          }
          if (currentFrame > this.end) {
            currentFrame = this.end
          }
          start = currentFrame
        } else {
          if (currentFrame < 0) {
            currentFrame = 0
          }
          if (currentFrame > motionStore.frame_getNum() - 1) {
            currentFrame = motionStore.frame_getNum() - 1
          }
          if (currentFrame < this.start) {
            currentFrame = this.start
          }
          end = currentFrame
        }
        if(end - start > 1999){
          end = start + 1999
          if(end > motionStore.frame_getNum() - 1){
            end = motionStore.frame_getNum() - 1
            start = end - 1999
          }
          if(start < 0){
            start = 0
          }
        }
        this.start = start
        this.end = end
        viewer.value.jointPositionLine3D.updateRange(start, end)
      },
      handleEnd() {
        this.moving = false
      },

      movingGroup: false,
      startStart: 0,
      startEnd: 0,
      handleMoveGroupStart(e: MouseEvent) {
        this.movingGroup = true
        this.startX = e.x
        this.startStart = this.start
        this.startEnd = this.end
      },
      handleMoveGroupDrag(e: MouseEvent) {
        const container = jointPositionRangeBar.value
        if (!this.movingGroup || !container) return
        const currentX = e.x
        const startX = this.startX
        const deltaPX = currentX - startX
        const barWidthPX = container.clientWidth
        const deltaPer = deltaPX / barWidthPX
        const deltaValue = parseInt(`${deltaPer * (motionStore.frame_getNum() - 1)}`)
        const range = this.end - this.start
        let newStart = this.startStart + deltaValue
        let newEnd = this.startEnd + deltaValue
        if (newStart < 0) {
          newStart = 0
          newEnd = range
        }
        if (newEnd > motionStore.frame_getNum() - 1) {
          newEnd = motionStore.frame_getNum() - 1
          newStart = newEnd - range
        }
        this.start = newStart
        this.end = newEnd
        viewer.value.jointPositionLine3D.updateRange(this.start, this.end)
      },
      handleMoveGroupEnd() {
        this.movingGroup = false
      },

      modify() {
        if (this.end - this.start > 1999) {
          this.end = this.start + 1999
        }
        if (this.end === motionStore.frame_getNum()) {
          this.end--
        }
        if (this.end === motionStore.frame_getNum() - 2) {
          this.end++
        }
        viewer.value.jointPositionLine3D.updateRange(this.start, this.end)
      },
    },
    init() {
      const endFrameIndex = motionStore.frame_getNum() - 1
      this.range.end = endFrameIndex > 1999 ? 1999 : endFrameIndex
      viewer.value.jointPositionLine3D.updateRange(this.range.start, this.range.end)
      viewer.value.jointPositionLine3D.setTotal(motionStore.frame_getNum())
      if (motionStore.motionData?.parsed) {
        viewer.value.jointPositionLine3D.compute(
          0,
          motionStore.frame_getNum() - 1,
          motionStore.motionData.parsed
        )
      }
    },
  })
  return jointPositionLine3D
}
