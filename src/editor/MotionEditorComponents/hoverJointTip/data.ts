import { ref, type Ref } from 'vue'

export interface IHoverJointTip {
  show: number
  time: ReturnType<typeof setTimeout> | null
  display: string
  handleShow: (jointName: string) => void
  showAnimation: () => boolean
  getOpacity: () => number
}

interface HoverJointTipDependencies {
  CONSTANTS: {
    HOVER_DELAY: number
  }
}

export function createHoverJointTipData({
  CONSTANTS,
}: HoverJointTipDependencies): Ref<IHoverJointTip> {
  return ref<IHoverJointTip>({
    show: 0,
    time: null,
    display: '',
    handleShow(jointName: string) {
      this.display = jointName
      this.show = 3
      if (this.time) {
        clearTimeout(this.time)
        this.time = null
      }
      this.time = setTimeout(async () => {
        this.show = 2
        await new Promise<void>(resolve => {
          setTimeout(() => {
            resolve()
          }, 10)
        })
        this.show = 1
        await new Promise<void>(resolve => {
          setTimeout(() => {
            resolve()
          }, 300)
        })
        this.show = 0
        this.time = null
      }, CONSTANTS.HOVER_DELAY)
    },
    showAnimation() {
      return this.show === 1 || this.show === 2
    },
    getOpacity() {
      return this.show > 1 ? 1 : 0
    },
  })
}
