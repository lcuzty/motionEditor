import { ref, type Ref } from 'vue'

export interface IPlayer {
  handleGlobalKeyDown: (e: KeyboardEvent) => void
  keyDownChangeFrame: {
    used: boolean
    timer: NodeJS.Timeout | null
    handle: (e: KeyboardEvent) => void
  }
  refreshRate: {
    showMenu: boolean
    handleDefault: () => void
    handleJump: (rr: number) => void
    init: () => void
  }
  getToFrameByMouseEventData: (e: ChartEvent | MouseEvent) => number
  barHoverToFrame: number
  handleBarHover: (e: ChartEvent) => void
  handleBarMouseDown: (e: ChartEvent) => Promise<void>
  move: {
    lastX: number
    moving: boolean
    newWidth: number
    maxWidth: number
    handleStart: (e: MouseEvent) => void
    handleMousemove: (e: MouseEvent) => void
    handleEnd: () => Promise<void>
  }
  xSpeed: {
    showMenu: boolean
    data: string
    toXSpeedValue: () => number
    valueToStore: () => void
  }
  handleChange: () => void
  attenIndicate: {
    beforeRadius: number
    afterRadius: number
    set: (isLeft?: boolean, radius?: number) => void
  }
}

interface ChartEvent {
  offsetX?: number
}

interface PlayerDependencies {
  motionStore: any
  windowStore: any
}

export function createPlayerData({ motionStore, windowStore }: PlayerDependencies) {
  /**
   * 动作播放器控制系统
   *
   * 这是动作编辑器的核心播放控制系统，管理所有与动作播放相关的功能：
   * 1. 键盘快捷键控制（空格键播放/暂停，方向键切换帧）
   * 2. 播放进度条的交互（点击跳转、拖拽调整）
   * 3. 播放刷新率设置（正常播放、跳帧播放）
   * 4. 播放倍速控制（0.1x到多倍速播放）
   *
   * 这个系统让用户可以方便地控制动作的播放，就像使用视频播放器一样直观。
   */
  const player = ref({
    /**
     * 全局键盘快捷键处理器
     *
     * 处理用户的键盘操作，提供便捷的播放控制：
     * - 空格键：播放/暂停切换
     * - 方向键：帧数切换（在其他方法中处理）
     *
     * 这让用户可以不用鼠标就能快速控制动作播放。
     */
    handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        if (motionStore.playStatus === 1) {
          motionStore.pause()
        } else {
          motionStore.play()
        }
        e.preventDefault()
      }
    },
    /**
     * 方向键帧数切换控制器
     *
     * 处理用户使用方向键切换帧数的功能，带有防抖机制避免快速连按导致的性能问题。
     *
     * 功能特点：
     * - 左方向键：切换到上一帧
     * - 右方向键：切换到下一帧
     * - 防抖机制：200ms内只响应一次按键
     * - 边界检查：不会超出帧数范围
     * - 加载状态检查：加载时禁用切换
     *
     * 这让用户可以快速浏览动作的每一帧，方便进行精确的帧级编辑。
     */
    keyDownChangeFrame: {
      used: false,
      timer: null as NodeJS.Timeout | null,
      handle(e: KeyboardEvent) {
        if (this.used) return
        if (this.timer) clearTimeout(this.timer)
        this.used = true
        this.timer = setTimeout(() => {
          this.used = false
        }, 16.66)
        if (!windowStore.isLoading) {
          if (e.code === 'ArrowLeft' && motionStore.currentFrameIndex > 0) {
            motionStore.setCurrentFrameIndex(motionStore.currentFrameIndex - 1)
          } else if (
            e.code === 'ArrowRight' &&
            motionStore.currentFrameIndex < motionStore.getFrameCount() - 1
          ) {
            motionStore.setCurrentFrameIndex(motionStore.currentFrameIndex + 1)
          }
        }
      },
    },
    /**
     * 播放刷新率控制系统
     *
     * 管理动作播放时的帧率设置，提供两种播放模式：
     * 1. 默认模式：按动作文件的原始帧率播放，显示所有帧
     * 2. 跳帧模式：按指定刷新率播放，跳过部分帧以提高播放速度
     *
     * 使用场景：
     * - 默认模式：适合精确查看每一帧的动作细节
     * - 跳帧模式：适合快速预览动作整体效果，节省时间
     *
     * 切换模式时会自动处理播放状态的暂停和恢复，确保切换过程平滑。
     */
    refreshRate: {
      showMenu: false,
      handleDefault() {
        const wasPlaying = motionStore.playStatus === 1
        player.value.refreshRate.showMenu = false
        if (wasPlaying) motionStore.pause()
        motionStore.setPlayMode(0)
        if (wasPlaying)
          setTimeout(() => {
            motionStore.play()
          }, 10)
      },
      handleJump(rr: number) {
        const wasPlaying = motionStore.playStatus === 1
        player.value.refreshRate.showMenu = false
        if (wasPlaying) motionStore.pause()
        motionStore.setPlayMode(1)
        motionStore.setPlaybackRefreshRate(rr)
        if (wasPlaying)
          setTimeout(() => {
            motionStore.play()
          }, 10)
      },
      init() {
        let rate = 60
        if (rate > (motionStore.motionJSON?.framerate || 30)) {
          rate = motionStore.motionJSON?.framerate || 30
        }
        this.handleJump(rate)
      },
    },
    /**
     * 进度条位置计算工具方法
     *
     * 将鼠标在进度条上的点击位置转换为对应的帧数。
     * 这是进度条交互的核心算法，用于：
     * - 点击跳转：用户点击进度条跳转到指定帧
     * - 悬停预览：显示鼠标悬停位置对应的帧数
     * - 拖拽调整：拖拽时实时计算当前位置的帧数
     *
     * 计算原理：
     * 1. 获取点击位置在进度条中的像素偏移
     * 2. 计算该位置占进度条总宽度的百分比
     * 3. 将百分比映射到总帧数范围内
     */
    getToFrameByMouseEventData(e: ChartEvent | MouseEvent) {
      const progressBarElement = document.getElementById('playerProgressBar')
      if (progressBarElement === null) return 0
      const progressBarWidth = progressBarElement.clientWidth
      const mouseOffsetX = (e as any).offsetX || 0
      const clickPercentage = mouseOffsetX / progressBarWidth
      const targetFrameIndex = parseInt(`${clickPercentage * (motionStore.getFrameCount() - 1)}`)
      return targetFrameIndex
    },

    barHoverToFrame: 0,

    /**
     * 进度条悬停预览功能
     *
     * 当用户将鼠标悬停在进度条上时，实时显示该位置对应的帧数，
     * 让用户在点击之前就能知道会跳转到哪一帧。
     * 这提供了更好的用户体验，避免误操作。
     */
    handleBarHover(e: ChartEvent) {
      this.barHoverToFrame = this.getToFrameByMouseEventData(e)
    },

    /**
     * 进度条点击跳转功能
     *
     * 处理用户点击进度条的操作，实现快速跳转到指定帧。
     * 点击后会立即跳转到对应帧，并准备开始拖拽操作（如果用户继续按住鼠标）。
     *
     * 这是视频播放器中常见的交互模式，用户体验直观。
     */
    async handleBarMouseDown(e: ChartEvent) {
      motionStore.setCurrentFrameIndex(this.getToFrameByMouseEventData(e))
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          resolve()
        }, 50)
      })
      this.move.handleStart(e as any)
    },
    /**
     * 进度条拖拽控制系统
     *
     * 实现类似视频播放器的进度条拖拽功能，让用户可以通过拖拽进度条来快速跳转到任意帧。
     *
     * 工作流程：
     * 1. 用户按下鼠标开始拖拽
     * 2. 记录初始状态和进度条尺寸信息
     * 3. 拖拽过程中实时计算新位置对应的帧数
     * 4. 应用边界限制，确保不超出有效范围
     * 5. 实时更新当前帧，提供即时反馈
     * 6. 释放鼠标结束拖拽操作
     *
     * 这种交互方式让用户可以快速定位到动作的任意时刻，大大提高编辑效率。
     */
    move: {
      lastX: 0,
      moving: false,
      newWidth: 0,
      maxWidth: 0,
      handleStart(e: MouseEvent) {
        const progressBarElement = document.getElementById('playerProgressBar')
        if (progressBarElement === null) return
        this.maxWidth = progressBarElement.clientWidth
        const currentProgressElement = document.getElementById('playerProgressBarCurrent')
        if (currentProgressElement === null) return
        this.newWidth = currentProgressElement.clientWidth
        this.moving = true
        this.lastX = e.x
        motionStore.setPlayStartCameraQuaterAndDistance()
      },
      handleMousemove(e: MouseEvent) {
        if (!this.moving) return
        const deltaX = e.x - this.lastX
        this.lastX = e.x
        const progressBarWidth = this.maxWidth
        const currentProgressElement = document.getElementById('playerProgressBarCurrent')
        if (currentProgressElement === null) return
        let newProgressWidth = currentProgressElement.clientWidth + deltaX
        if (newProgressWidth < 0) {
          newProgressWidth = 0
        }
        if (newProgressWidth > progressBarWidth) {
          newProgressWidth = progressBarWidth
        }
        this.newWidth = newProgressWidth
        const progressPercentage = newProgressWidth / progressBarWidth
        const targetFrameIndex = parseInt(
          `${progressPercentage * (motionStore.getFrameCount() - 1)}`
        )
        motionStore.setCurrentFrameIndex(targetFrameIndex)
      },
      async handleEnd() {
        this.moving = false
        await new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            resolve()
          }, 50)
        })
        this.moving = false
      },
    },
    /**
     * 播放倍速控制系统
     *
     * 管理动作播放的速度设置，支持从慢速到快速的多种播放倍率。
     * 类似于视频播放器的倍速功能，让用户可以：
     * - 慢速播放：仔细观察动作细节（0.1x - 0.9x）
     * - 正常播放：按原始速度播放（1x）
     * - 快速播放：快速预览动作效果（2x, 3x, 4x等）
     *
     * 特殊的数值映射机制：
     * - 0-9的输入值被映射为0.9-1.8的小数倍速
     * - 1及以上的值直接作为整数倍速使用
     *
     * 这种设计让界面可以用简单的数字选择器提供丰富的倍速选项。
     */
    xSpeed: {
      showMenu: false,
      data: '1',
      toXSpeedValue() {
        let speedValue = parseInt(this.data)
        if (speedValue < 1) {
          speedValue += 9
          speedValue = speedValue / 10
        }
        return speedValue
      },
      valueToStore() {
        setTimeout(() => {
          motionStore.setPlaybackSpeed(this.toXSpeedValue())
        }, 10)
      },
    },

    /**
     * 倍速变更处理器
     *
     * 当用户改变播放倍速时，需要重新启动播放器以应用新的倍速设置。
     * 这个方法会暂停当前播放，应用新倍速，然后恢复播放状态。
     */
    handleChange() {
      const wasPlaying = motionStore.playStatus === 1
      player.value.xSpeed.valueToStore()
      if (wasPlaying) {
        motionStore.pause()
        setTimeout(() => {
          motionStore.play()
        }, 50)
      }
    },

    attenIndicate: {
      beforeRadius: 0,
      afterRadius: 0,
      set(isLeft = true, radius = 0) {
        if (isLeft) {
          this.beforeRadius = radius
        } else {
          this.afterRadius = radius
        }
      },
    },
  })
  return player
}
