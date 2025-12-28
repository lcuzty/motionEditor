import { ref, Ref, onUnmounted, watch, toRaw } from 'vue'

// 类型定义
interface ChartEvent {
  xLabel: number
  yValue: number
  yAtCursor?: number
  isContainer?: boolean
  offsetX?: number
  offsetY?: number
  delta?: number
  deltaX?: number
  deltaY?: number
  index?: number
  isKeyframe?: boolean
  nativeEvent?: MouseEvent
}

type ChartPointInfo = {
  frameIndex: number | null
  xLabel: number | null
  yValue: number | null
  isKeyframe: boolean
}

interface WheelEventWithDelta extends WheelEvent {
  delta: number
}

interface FrameLike {
  [key: string]: number
}

const MIN_DISPLAY_FRAMES = 30
const MAX_DISPLAY_FRAMES = 2000

const clampDisplaySize = (size: number, totalFrames: number) => {
  const maxSize = Math.min(MAX_DISPLAY_FRAMES, totalFrames)
  const minSize = Math.min(MIN_DISPLAY_FRAMES, maxSize)
  const normalized = Number.isFinite(size) ? Math.round(size) : maxSize
  return Math.max(minSize, Math.min(maxSize, normalized))
}

const clampDisplayWindow = (start: number, size: number, totalFrames: number) => {
  const clampedSize = clampDisplaySize(size, totalFrames)
  const maxStart = Math.max(0, totalFrames - clampedSize)
  const normalizedStart = Number.isFinite(start) ? Math.round(start) : 0
  const clampedStart = Math.min(Math.max(0, normalizedStart), maxStart)
  return { start: clampedStart, size: clampedSize }
}

export interface IPathPanel {
  show: number
  height: number
  resize: {
    moving: boolean
    lastY: number | null
    handleMove: (e: MouseEvent) => void
    handleStart: (e: MouseEvent) => void
    handleEnd: () => void
    modifyHeight: () => void
  }
  field: string | null
  selectedFieldType: number | null // 0: 位置, 1: 姿态, 2: 关节
  limitLines: number[]
  fieldDataCache: {
    fieldName: string | null
    allData: number[]
    yAxisRange: { min: number; max: number } | null
  }
  // 每个关节的视图状态存储
  fieldViewStates: Map<string, {
    location: {
      startFrameIndex: number
      size: number | undefined
    }
    yAxis: {
      center: number
      halfRange: number
      initialized: boolean
      userOverride: boolean
    }
  }>
  // 保存当前关节视图状态
  saveCurrentViewState: () => void
  // 全局快捷键绑定状态与处理器
  hotkeysBound: boolean
  hotkeyHandlers: {
    keyframe?: (event: KeyboardEvent) => void
    delete?: (event: KeyboardEvent) => void
    esc?: (event: KeyboardEvent) => void
    yAxis?: (event: KeyboardEvent) => void
    focusSelection?: (event: KeyboardEvent) => void
    dragRelease?: (event: KeyboardEvent) => void
  }
  bindHotkeys: () => void
  unbindHotkeys: () => void
  updateData: Function | null
  destory: Function | null
  setMarker: Function | null
  applyOptions: Function | null
  setYAxis: Function | null
  setYFlip: Function | null
  setTheme: Function | null
  setKeyframes: ((indices: number[]) => void) | null
  setKeyframeColor: ((color: string) => void) | null
  setHandles:
    | ((
        payload: Record<number, { in?: { x: number; y: number }; out?: { x: number; y: number } }>
      ) => void)
    | null
  setSelectedKeyframe: ((index: number | null) => void) | null
  setSelectedKeyframes: ((indices: number[]) => void) | null
  selectedKeyframeIndices: Set<number>
  setSelectionRange: ((range: { start: number; end: number } | null) => void) | null
  clearKeyframeSelection: (() => void) | null
  setSelectionChangeListener: ((cb: (count: number) => void) => void) | null
  selectionCount: number
  /**
   * 单独选中某个关键帧（绝对帧索引）。
   * 语义：等价于先“取消选择关键帧/清空选区”，再只选中这一帧。
   */
  selectSingleKeyframe: (frameIndex: number) => void
  setPreviewTransform: ((transform: { scale?: number; offset?: number }) => void) | null
  clearPreviewTransform: (() => void) | null
  /**
   * 设置幽灵点（拖动关键帧时的高性能预览）
   */
  setGhostPoints: ((points: Array<{ xLabel: number; yValue: number; isSelected?: boolean }> | null) => void) | null
  /**
   * 清除幽灵点
   */
  clearGhostPoints: (() => void) | null
  keyframe: {
    color: string
    selected: {
      absolute: number | null
      relative: number | null
    }
    isHandleDragging: boolean
    lastHandleDragTime: number | null
    toggleCurrent: () => void
    toggleAt: (frameIndex: number) => void
    update: () => void
    isCurrentKeyframe: () => boolean
    currentHandleType: 'auto' | 'auto_clamped' | 'free' | 'aligned' | 'vector'
    handleTypes: ('auto' | 'auto_clamped' | 'free' | 'aligned' | 'vector')[]
    setHandleType: (type: 'auto' | 'auto_clamped' | 'free' | 'aligned' | 'vector') => void
    setSelectedByFrame: (frameIndex: number | null) => void
    ensureSelectionVisible: () => void
    refreshHandleType: () => void
    toggleHandleType: () => void
    handleDrag: {
      start: (payload: any) => void
      move: (payload: any) => void
      end: (payload: any) => void
    }
  }
  chart: {
    width: number
    height: number
    paddingLeft: number
    paddingRight: number
    refresh: () => void
  }
  middlePan: {
    active: boolean
    lastClientX: number | null
    lastClientY: number | null
    handleStart: (payload: ChartEvent) => void
    handleMove: (payload: ChartEvent) => void
    handleEnd: () => void
  }
  move: {
    currentX: number | null
    currentY: number | null
    currentLineY: number | null
    moving: boolean
    isPreview: boolean
    syncFrameIndex: boolean
    lastXLabel: number | null
    lastY: number | null
    maxXLabel: number | null
    minXLabel: number | null
    currentContainerX: number | null
    currentContainerY: number | null
    updateDisplayTimer: NodeJS.Timeout | null
    updateScheduled: boolean
    scheduleUpdate: () => void
    pointInfo: ChartPointInfo | null
    handlePreviewStart: () => void
    handleStart: () => void
    handleEnd: () => void
    handleClick: (e: ChartEvent) => void
    handleBlankClick: (e: ChartEvent) => void
    handlePointClick: (e: ChartEvent) => void
    handleMove: (e: ChartEvent) => void
    updateDisplay: (useTimer: boolean, changedFrame: boolean, frameIndex: number) => void
    resetMouseLocation: () => void
    resetMouseContainerLocation: () => void
  }
  frameValueControl: {
    unitValue: number
    minUnit: number
    maxUnit: number
    precision: number
    value: number
    editable: boolean
    refresh: () => void
    setUnitValue: (v: number) => void
    setValue: (v: number) => void
  }
  frameDrag: {
    active: boolean
    startIndex: number | null
    targetIndex: number | null
    rangeStart: number | null
    rangeEnd: number | null
    lastAppliedTarget: number | null
    originValues: number[] | null
    originKeyInfo:
      | {
          isKey: boolean
          handle: { in?: { dx: number; y: number }; out?: { dx: number; y: number }; type?: any } | null
        }[]
      | null
    pendingXLabel: number | null
    pendingPayload: any
    rafId: number | null
    hasSelection: boolean
    startYAtCursor: number | null
    currentYOffset: number
    preview: {
      active: boolean
      target: number | null
      destStart: number | null
      destEnd: number | null
      affectedStart: number | null
      affectedEnd: number | null
      selection: { start: number; end: number } | null
      valueGetter: ((i: number) => number) | null
      keyGetter:
        | ((
            i: number
          ) => {
            isKey: boolean
            handle: {
              in?: { dx: number; y: number }
              out?: { dx: number; y: number }
              type?: any
            } | null
          } | null | undefined)
        | null
    }
    resetPreview: () => void
    applyRangeState: (
      fieldName: string,
      valueGetter: (i: number) => number,
      keyGetter: (
        i: number
      ) => { isKey: boolean; handle: { in?: { dx: number; y: number }; out?: { dx: number; y: number }; type?: any } | null } | null | undefined,
      start: number,
      end: number
    ) => void
    getMovedState: (
      baseValues: number[],
      baseKeys: {
        isKey: boolean
        handle: { in?: { dx: number; y: number }; out?: { dx: number; y: number }; type?: any } | null
      }[],
      rangeStart: number,
      rangeEnd: number,
      targetIndex: number
    ) => {
      applied: boolean
      valueGetter: (i: number) => number
      keyGetter: (
        i: number
      ) => { isKey: boolean; handle: { in?: { dx: number; y: number }; out?: { dx: number; y: number }; type?: any } | null } | null | undefined
      destStart: number
      destEnd: number
      affectedStart: number
      affectedEnd: number
    }
    handleStart: (e: ChartEvent) => boolean
    handleHover: (e: ChartEvent) => void
    processHover: () => void
    handleEnd: () => void
  }
  keyframeDragMove: {
    active: boolean
    isDragging: boolean
    startClientX: number | null
    startClientY: number | null
    selectedKeyframes: number[] // 绝对帧索引
    startMouseX: number | null
    startMouseY: number | null
    currentOffsetX: number // 帧偏移量
    currentOffsetY: number // 数值偏移量
    originValues: Map<number, number> // 原始数值
    originKeyInfo: Map<number, { isKey: boolean; handle: any }> // 原始关键帧信息
    preview: {
      active: boolean
      valueGetter: ((i: number) => number | null) | null
      keyGetter: ((i: number) => { isKey: boolean; handle: any } | null) | null
      affectedStart: number | null
      affectedEnd: number | null
    }
    handleStart: (e: ChartEvent, clickedIndex: number) => boolean
    handleMove: (e: ChartEvent) => void
    handleEnd: () => void
    resetPreview: () => void
  }
  location: {
    startFrameIndex: number
    size: number | undefined
    scrollContainerWidth: number
    disableScrollAnim: boolean
    changeSize: number
    mousemove: {
      lastX: number | null
      moving: boolean
      handleStart: () => void
      handleEnd: () => void
      handleMove: (e: MouseEvent) => void
    }
    getScrollLeft: () => number
    getScrollSizePer: () => number
    getScrollPer: () => number
    refreshScrollContainerWidth: () => void
    handleMove: (e: MouseEvent) => void
    handleScale: (e: WheelEventWithDelta) => void
    handleKeyboardPan: (direction: number) => void
    handleKeyboardZoom: (direction: number, anchorIndex?: number) => void
    reset: () => void
    toDefault: () => void
    isFullDisplay: () => boolean
    edge: {
      moving: boolean
      isLeft: boolean
      lastX: number | null
      startEndIndex: number
      startLeftIndex: number
      handleStart: (e: MouseEvent, isLeft?: boolean) => void
      handleMove: (e: MouseEvent) => void
      handleEnd: () => void
    }
  }
  handleShowWithLoad: () => void
  handleLoad: (fieldName: string) => void
  handleUpDateData: () => void
  handleHide: () => void
  handleCopy: () => void
  handleDelete: () => void
  handleSmoothDelete: (startIndex?: number, endIndex?: number) => void
  rangeSelection: {
    active: boolean
    start: number | null
    end: number | null
    committedStart: number | null
    committedEnd: number | null
    visual: { show: boolean; left: number; width: number }
    handleStart: (e: ChartEvent) => boolean
    handleMove: (e: ChartEvent) => void
    handleEnd: () => void
    clearSelection: () => void
    getSelectionRange: () => { start: number; end: number } | null
    updateVisual: () => void
    reset: () => void
  }
  yAxis: {
    center: number
    halfRange: number
    minHalfRange: number
    initialized: boolean
    userOverride: boolean
    fit: (values: number[]) => void
    ensureInitialized: (values: number[]) => void
    getRange: () => { min: number; max: number }
    zoom: (multiplier: number, anchor: number | null) => void
    pan: (delta: number) => void
  }
  handleVerticalPan: (event: ChartEvent) => void
  handleVerticalZoom: (event: ChartEvent) => void
  resetYAxis: () => void
  isYAxisDefault: () => boolean
  zoomToSelectedKeyframes: () => void
  multiple: {
    moving: boolean
    lastY: number
    position: number
    startInfo: any
    selection: { start: number; end: number } | null
    mode: number
    showMenu: boolean
    handleStart: (e: MouseEvent) => void
    handleEnd: () => void
    handleMove: (e: MouseEvent) => void
  }
  yFlip: {
    enable: boolean
    change: (to: boolean) => void
  }
  handleUniformZoom: (event: ChartEvent) => void
}

// 依赖注入接口
interface PathPanelDependencies {
  handleCameraMove: () => void
  windowStore: any
  // Ref 依赖
  mainContainer: Ref<HTMLElement | null>
  jointPositionLine: Ref<{ handleUpdate: () => void }>
  viewer: Ref<{
    jointPositionLine3D: {
      setTotal: (total: number) => void
      compute: (start: number, end: number, data: any[]) => void
      resetColor: () => void
    }
    setSingleJointValue?: (jointName: string, angle: number) => boolean
  }>
  jointQuatSphere: Ref<{ updateQuat: () => void }>
  quatSphere: Ref<{ updateRobotQuat: () => void }>

  // Store 依赖
  motionStore: any // useMotionStore() 返回类型
  withDrawStore: any // useWithDrawStore() 返回类型
  selectedFieldStore: any // useSelectedFieldStore() 返回类型
  robotModelStore: any // useRobotModelStore() 返回类型
  themeStore: any // useThemeStore() 返回类型

  // API 依赖
  api: {
    robot: {
      setFrame: (frame: FrameLike) => void
      getObject: () => any
      position: { get: () => any }
      quater: { get: () => any }
      joint: {
        getSingleInfo: (name: string) => any
        getAll: () => any
      }
    }
    forceRender: () => void
    camera: {
      quater: { get: () => any }
    }
    distance: {
      compute: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => number
    }
    quater: {
      relative: (a: any, b: any) => any
    }
  }

  // 函数依赖
  handleModifyWindowsLocation: () => void
  handleViewerSizeChange: () => void
  tool_smoothData: (data: number[], smoothFactor: number) => number[]
  createLineChart: (
    container: HTMLElement,
    options: any
  ) => {
    updateData: Function
    destroy: Function
    setMarker: Function
    applyOptions: Function
    setYAxis: Function
    setYFlip: Function
    setLimitLines?: (lines: number[]) => void
    setTheme: Function
    setKeyframes?: (indices: number[]) => void
    setKeyframeColor?: (color: string) => void
    setHandles?: (
      payload: Record<number, { in: { x: number; y: number }; out: { x: number; y: number } }>
    ) => void
    setSelectedKeyframe?: (index: number | null) => void
    setSelectedKeyframes?: (indices: number[]) => void
    setSelectionRange?: (range: { start: number; end: number } | null) => void
  }
}

const AUTO_KEYFRAME_MIN_SLOPE = 1e-4
const autoKeyframeInitializedFields = new Set<string>()

export function createPathPanelData(dependencies: PathPanelDependencies) {
  // 解构依赖
  const {
    windowStore,
    mainContainer,
    jointPositionLine,
    viewer,
    jointQuatSphere,
    quatSphere,
    motionStore,
    withDrawStore,
    selectedFieldStore,
    robotModelStore,
    themeStore,
    api,
    handleModifyWindowsLocation,
    handleViewerSizeChange,
    tool_smoothData,
    createLineChart,
    handleCameraMove
  } = dependencies

  const KEYFRAME_COLOR_DARK = '#000000'
  const KEYFRAME_COLOR_LIGHT = '#FFFFFF'
  const getHighResTime = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number
  const caf =
    typeof cancelAnimationFrame === 'function'
      ? cancelAnimationFrame
      : (id: number) => clearTimeout(id as unknown as NodeJS.Timeout)
  let zoomAnimRaf: number | null = null

  const resolveLimitLines = (fieldName: string | null): number[] => {
    if (!fieldName) return []
    if (robotModelStore.isBVH) return []
    // URDF 位置（global_）不显示限制
    if (fieldName.startsWith('global_')) return []
    // URDF 姿态（四元数）使用数学范围 [-1, 1]
    if (fieldName.startsWith('quater_')) return [-1, 1]
    const info = api.robot.joint.getSingleInfo(fieldName)
    const limit = info?.limit
    const lines: number[] = []
    if (Number.isFinite(limit?.lower)) lines.push(Number(limit?.lower))
    if (Number.isFinite(limit?.upper)) lines.push(Number(limit?.upper))
    return lines
  }

  const ensureAutoTurnKeyframes = (fieldName: string) => {
    if (!motionStore.motionData) return
    if (autoKeyframeInitializedFields.has(fieldName)) return
    const frames = motionStore.motionData.parsed
    if (!Array.isArray(frames) || frames.length === 0) return
    withDrawStore.runWithoutRecord(() => {
      for (let i = 0; i < frames.length; i++) {
        const value = frames[i]?.[fieldName]
        if (typeof value !== 'number' || Number.isNaN(value)) continue
        motionStore.addKeyframe(fieldName, i)
      }
    })
    autoKeyframeInitializedFields.add(fieldName)
  }

  type HandleDragPayload = {
    handle: 'in' | 'out'
    xValue: number
    yValue: number
  }

  const buildHandleRecomputeRange = (field: string, frameIndex: number, handle: 'in' | 'out') => {
    const frames = motionStore.getKeyframeIndices(field) as number[]
    const totalFrames = motionStore.frame_getNum
      ? motionStore.frame_getNum()
      : motionStore.getFrameCount()
    const idx = frames.indexOf(frameIndex)
    const prev = idx > 0 ? frames[idx - 1] : null
    const next = idx >= 0 && idx < frames.length - 1 ? frames[idx + 1] : null
    // aligned / vector 模式会同时影响两侧曲线，因此统一对左右邻接区间做重算
    const start = (prev ?? frameIndex) - 2
    const end = (next ?? frameIndex) + 1
    return {
      start: Math.max(0, start),
      end: Math.min(Math.max(0, totalFrames - 1), end),
    }
  }

  const jointLineComputeThrottler = (() => {
    const THROTTLE_MS = 120
    let timer: ReturnType<typeof setTimeout> | null = null
    let pendingRange: { start: number; end: number } | null = null

    const getClampedRange = () => {
      const total = motionStore.frame_getNum
        ? motionStore.frame_getNum()
        : motionStore.getFrameCount()
      const defaultStart = motionStore.currentFrameIndex - 2
      const defaultEnd = total - 1
      const range = pendingRange ?? { start: defaultStart, end: defaultEnd }
      const start = Math.max(0, Math.min(total - 1, Math.floor(range.start)))
      const end = Math.max(start, Math.min(total - 1, Math.floor(range.end)))
      pendingRange = null
      return { start, end }
    }

    const run = () => {
      timer = null
      const { start, end } = getClampedRange()
      viewer.value?.jointPositionLine3D?.compute?.(start, end, motionStore.motionData?.parsed || [])
      // 同步 3D 位置线节流更新时，更新机器人当前帧姿态
      api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
      api.forceRender?.()
    }

    const mergeRange = (next?: { start: number; end: number }) => {
      if (!next) return
      if (!pendingRange) {
        pendingRange = { ...next }
        return
      }
      pendingRange.start = Math.min(pendingRange.start, next.start)
      pendingRange.end = Math.max(pendingRange.end, next.end)
    }

    return {
      request(immediate = false, range?: { start: number; end: number }) {
        mergeRange(range)
        if (immediate) {
          if (timer !== null) {
            clearTimeout(timer)
            timer = null
          }
          run()
          return
        }
        if (timer !== null) return
        timer = setTimeout(run, THROTTLE_MS)
      },
      flush() {
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
        run()
      },
    }
  })()

  const handleDragScheduler = (() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let pending: HandleDragPayload | null = null

    const apply = (panel: Ref<IPathPanel>) => {
      if (!pending) return
      if (!panel.value.field) {
        pending = null
        return
      }
      if (panel.value.keyframe.selected.absolute === null) {
        pending = null
        return
      }
      const frameIndex = panel.value.keyframe.selected.absolute
      const field = panel.value.field
      const payload = pending
      pending = null
      const xValue = payload.xValue - 1
      motionStore.updateKeyframeHandlePoint(field, frameIndex, payload.handle, {
        x: xValue,
        y: payload.yValue,
      })
      panel.value.keyframe.currentHandleType = 'free'
      panel.value.handleUpDateData()
      const range = buildHandleRecomputeRange(field, frameIndex, payload.handle)
      jointLineComputeThrottler.request(false, range)
    }

    return {
      schedule(panel: Ref<IPathPanel>, payload: HandleDragPayload) {
        pending = payload
        if (timer !== null) return
        timer = setTimeout(() => {
          timer = null
          apply(panel)
        }, 16)
      },
      flush(panel: Ref<IPathPanel>) {
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
        if (pending) {
          apply(panel)
        }
      },
    }
  })()

  const createYAxisController = () => {
    const clampNumericArray = (values: number[]) =>
      values.filter(value => typeof value === 'number' && Number.isFinite(value))

    return {
      center: 0,
      halfRange: 1,
      minHalfRange: 1e-4,
      initialized: false,
      userOverride: false,
      fit(values: number[]) {
        const numericValues = clampNumericArray(values)
        if (!numericValues.length) {
          this.center = 0
          this.halfRange = 1
        } else {
          const minVal = Math.min(...numericValues)
          const maxVal = Math.max(...numericValues)
          if (minVal === maxVal) {
            this.center = minVal
            const padding = Math.max(this.minHalfRange, Math.abs(minVal) * 0.1 || 1)
            this.halfRange = padding
          } else {
            const padding = (maxVal - minVal) * 0.1
            this.center = (maxVal + minVal) / 2
            this.halfRange = Math.max(this.minHalfRange, (maxVal - minVal) / 2 + padding / 2)
          }
        }
        this.initialized = true
        this.userOverride = false
      },
      ensureInitialized(values: number[]) {
        if (!this.initialized) {
          this.fit(values)
        }
      },
      getRange() {
        return {
          min: this.center - this.halfRange,
          max: this.center + this.halfRange,
        }
      },
      zoom(multiplier: number, anchor: number | null) {
        if (!Number.isFinite(multiplier) || multiplier <= 0) return
        const currentHalf = this.halfRange || this.minHalfRange
        const nextHalf = Math.max(this.minHalfRange, currentHalf * multiplier)
        const anchorValue =
          typeof anchor === 'number' && Number.isFinite(anchor) ? anchor : this.center
        const normalized = currentHalf === 0 ? 0 : (anchorValue - this.center) / currentHalf
        this.center = anchorValue - normalized * nextHalf
        this.halfRange = nextHalf
        this.initialized = true
        this.userOverride = true
      },
      pan(delta: number) {
        if (!Number.isFinite(delta) || delta === 0) return
        this.center += delta
        this.initialized = true
        this.userOverride = true
      },
    }
  }

  /**
   * 底部轨迹面板控制系统
   *
   * 这是动作编辑器中最重要的数据可视化工具，以图表形式显示关节角度随时间的变化曲线。
   * 类似于音频编辑软件中的波形图，让用户可以直观地查看和编辑动作数据。
   *
   * 核心功能：
   * 1. 曲线图显示：将关节角度数据绘制成时间轴上的连续曲线
   * 2. 交互式编辑：用户可以直接在曲线上拖拽来修改关节角度
   * 3. 缩放和滚动：支持放大缩小和左右滚动查看不同时间段
   * 4. 平滑处理：自动对编辑后的数据进行平滑处理，避免突兀变化
   * 5. 实时同步：与3D场景和播放器实时同步，所见即所得
   *
   * 使用场景：
   * - 精确调整关节角度的变化趋势
   * - 查找和修正动作中的异常数据点
   * - 创建平滑自然的关节运动轨迹
   * - 分析动作的时间特征和节奏
   *
   * 这个工具让复杂的数值编辑变得直观易懂，是专业动作编辑不可缺少的功能。
   */
  const pathPanel: Ref<IPathPanel> = ref<IPathPanel>({
    show: 0,
    height: 210,
    limitLines: [],
    yFlip: {
      enable: false,
      change(to: boolean) {
        this.enable = to
        if (typeof pathPanel.value.setYFlip === 'function') pathPanel.value.setYFlip(to)
      },
    },
    /**
     * 面板高度调整系统
     *
     * 允许用户通过拖拽来动态调整轨迹面板的高度，以适应不同的编辑需求：
     * - 增加高度：获得更详细的曲线显示，便于精确编辑
     * - 减少高度：为其他面板留出更多空间
     *
     * 特点：
     * 1. 实时拖拽调整，响应流畅
     * 2. 自动边界检测，防止过大或过小
     * 3. 与其他面板联动，保持界面协调
     * 4. 记忆用户偏好，提供个性化体验
     */
    resize: {
      moving: false,
      lastY: null,
      handleStart(e: MouseEvent) {
        this.moving = true
        this.lastY = e.y
      },
      handleMove(e: MouseEvent) {
        if (this.moving === false) return
        const c = (this.lastY as number) - e.y
        this.lastY = e.y
        pathPanel.value.height += c
        this.modifyHeight()
        handleModifyWindowsLocation()
        handleViewerSizeChange()
        pathPanel.value.handleUpDateData()
      },
      handleEnd() {
        this.moving = false
      },
      modifyHeight() {
        if (mainContainer.value === null) return
        const mainContainerHeight = (mainContainer.value as HTMLElement).clientHeight
        const pathBoardHeight = pathPanel.value.height
        if (pathBoardHeight + 250 > mainContainerHeight) {
          pathPanel.value.height = Math.max(200, mainContainerHeight - 250)
        }
        if (pathPanel.value.height < 200) {
          pathPanel.value.height = 200
        }
      },
    },
    field: null,
    selectedFieldType: null,
    fieldDataCache: {
      fieldName: null as string | null,
      allData: [] as number[],
      yAxisRange: null as { min: number; max: number } | null,
    },
    // 存储每个关节的视图状态
    fieldViewStates: new Map(),
    hotkeysBound: false,
    hotkeyHandlers: {},
    bindHotkeys() {
      const handlers = this.hotkeyHandlers || {}
      const keydownHandlers = [
        handlers.keyframe,
        handlers.delete,
        handlers.esc,
        handlers.yAxis,
        handlers.focusSelection,
      ].filter(Boolean) as Array<(e: KeyboardEvent) => void>
      const keyupHandlers = [handlers.dragRelease].filter(Boolean) as Array<(e: KeyboardEvent) => void>

      // 如果还没有注册任何快捷键处理器，不要标记为已绑定，避免后续无法真正绑定
      if (keydownHandlers.length === 0 && keyupHandlers.length === 0) {
        this.hotkeysBound = false
        return
      }

      // 先解除旧绑定，确保处理器更新后能重新注册
      this.unbindHotkeys()

      keydownHandlers.forEach(handler => window.addEventListener('keydown', handler))
      keyupHandlers.forEach(handler => window.addEventListener('keyup', handler))
      this.hotkeysBound = true
    },
    unbindHotkeys() {
      const handlers = this.hotkeyHandlers || {}
      ;[
        handlers.keyframe,
        handlers.delete,
        handlers.esc,
        handlers.yAxis,
        handlers.focusSelection,
      ]
        .filter(Boolean)
        .forEach(handler => window.removeEventListener('keydown', handler as (e: KeyboardEvent) => void))

      ;[handlers.dragRelease]
        .filter(Boolean)
        .forEach(handler => window.removeEventListener('keyup', handler as (e: KeyboardEvent) => void))

      this.hotkeysBound = false
    },
    updateData: null,
    destory: null,
    setMarker: null,
    applyOptions: null,
    setYAxis: null,
    setYFlip: null,
    setTheme: null,
    setKeyframes: null,
    setKeyframeColor: null,
    setHandles: null,
    setSelectedKeyframe: null,
    setSelectedKeyframes: null,
    selectedKeyframeIndices: new Set<number>(),
    setSelectionRange: null,
  clearKeyframeSelection: null,
  setSelectionChangeListener: null,
  selectionCount: 0,
    selectSingleKeyframe(frameIndex: number) {
      if (frameIndex < 0) return
      if (!this.field) return

      // 1) 先执行“取消选择关键帧”（清空图表内部选择 + 本地集合）
      if (typeof this.clearKeyframeSelection === 'function') {
        this.clearKeyframeSelection()
      } else {
        this.selectedKeyframeIndices.clear()
        this.selectionCount = 0
      }

      // 2) 清空框选区（如果有）
      this.rangeSelection.clearSelection()
      this.rangeSelection.updateVisual()

      // 3) 只选中当前点击的关键帧（绝对索引）
      this.selectedKeyframeIndices.add(frameIndex)
      this.selectionCount = 1

      // 4) 同步“当前编辑关键帧（控制柄）”
      this.keyframe.setSelectedByFrame(frameIndex)

      // 5) 刷新图表显示（会将绝对索引映射成相对索引并高亮）
      this.handleUpDateData()
    },
    setPreviewTransform: null,
    clearPreviewTransform: null,
    setGhostPoints: null,
    clearGhostPoints: null,
    chart: {
      width: 1,
      height: 1,
      paddingLeft: 0,
      paddingRight: 0,
      refresh() {
        const container = document.getElementById('path-board-chart') as HTMLElement | null
        if (!container) return
        const style = getComputedStyle(container)
        const paddingLeft = parseFloat(style.paddingLeft || '0') || 0
        const paddingRight = parseFloat(style.paddingRight || '0') || 0
        const nextWidth = container.offsetWidth
        const nextHeight = container.offsetHeight
        if (Number.isFinite(nextWidth) && nextWidth > 0) {
          this.width = nextWidth
        }
        if (Number.isFinite(nextHeight) && nextHeight > 0) {
          this.height = nextHeight
        }
        this.paddingLeft = paddingLeft
        this.paddingRight = paddingRight
      },
    },
    keyframe: {
      color: KEYFRAME_COLOR_DARK,
      selected: {
        absolute: null as number | null,
        relative: null as number | null,
      },
      isHandleDragging: false,
      lastHandleDragTime: null,
      currentHandleType: 'auto',
      handleTypes: ['auto', 'auto_clamped', 'free', 'aligned', 'vector'],
      toggleCurrent() {
        const frameIndex = motionStore.currentFrameIndex
        this.toggleAt(frameIndex)
      },
      toggleAt(frameIndex: number) {
        if (frameIndex < 0) return
        if (!pathPanel.value.field) return
        const wasKey = motionStore.isKeyframe(pathPanel.value.field, frameIndex)
        motionStore.toggleKeyframe(pathPanel.value.field, frameIndex)
        if (wasKey) {
          if (this.selected.absolute === frameIndex) {
            this.setSelectedByFrame(null)
          }
        } else {
          this.setSelectedByFrame(frameIndex)
        }
        this.update()
        pathPanel.value.frameValueControl.refresh()

        // 如果是从关键帧变为非关键帧，立即重算贝塞尔、更新3D线条与机器人姿态
        if (wasKey) {
          const range = buildHandleRecomputeRange(pathPanel.value.field, frameIndex, 'out')
          try {
            // 重算 3D 关节线条
            viewer.value?.jointPositionLine3D?.compute?.(
              range.start,
              range.end,
              motionStore.motionData?.parsed || []
            )
            viewer.value?.jointPositionLine3D?.resetColor?.()
          } catch (err) {
            console.warn(err)
          }
          // 更新轨迹面板数据与2D关节线
          pathPanel.value.handleUpDateData()
          jointPositionLine.value?.handleUpdate?.()
          // 同步机器人当前帧姿态
          api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
          api.forceRender?.()
        }
      },
      isCurrentKeyframe() {
        if (!pathPanel.value.field) return false
        return motionStore.isKeyframe(pathPanel.value.field, motionStore.currentFrameIndex)
      },
      setSelectedByFrame(frameIndex: number | null) {
        this.selected.absolute = frameIndex
        this.ensureSelectionVisible()
        this.refreshHandleType()
      },
      ensureSelectionVisible() {
        if (!pathPanel.value.setSelectedKeyframe) return
        if (this.selected.absolute === null) {
          this.selected.relative = null
          pathPanel.value.setSelectedKeyframe(null)
          return
        }
        const start = pathPanel.value.location.startFrameIndex
        const size = pathPanel.value.location.size as number | undefined
        const visible = typeof size === 'number' ? size : motionStore.getFrameCount()
        if (this.selected.absolute >= start && this.selected.absolute < start + visible) {
          this.selected.relative = this.selected.absolute - start
          pathPanel.value.setSelectedKeyframe(this.selected.relative)
        } else {
          this.selected.relative = null
          pathPanel.value.setSelectedKeyframe(null)
        }
      },
      refreshHandleType() {
        const field = pathPanel.value.field
        if (!field) {
          this.currentHandleType = 'auto'
          return
        }

        // 优先使用当前单选关键帧；如果没有，则从多选集合里拿第一个
        let targetIndex = this.selected.absolute
        if (targetIndex === null && pathPanel.value.selectedKeyframeIndices.size) {
          // 取集合中的首个元素即可用于显示当前类型
          targetIndex = [...pathPanel.value.selectedKeyframeIndices][0] ?? null
        }

        if (targetIndex === null) {
          this.currentHandleType = 'auto'
          return
        }

        const handle = motionStore.getKeyframeHandle(field, targetIndex)
        this.currentHandleType = handle?.type ?? 'auto'
      },
      toggleHandleType() {
        if (!pathPanel.value.field || this.selected.absolute === null) return
        const list = this.handleTypes
        const idx = list.indexOf(this.currentHandleType)
        const next = (list[(idx + 1) % list.length] || 'auto') as
          | 'auto'
          | 'auto_clamped'
          | 'free'
          | 'aligned'
          | 'vector'
        this.setHandleType(next)
      },
      setHandleType(type: 'auto' | 'auto_clamped' | 'free' | 'aligned' | 'vector') {
        const field = pathPanel.value.field
        if (!field) return

        // 优先使用当前的选中集合（支持多选）；若集合为空则退回到单选
        const targets =
          pathPanel.value.selectedKeyframeIndices.size > 0
            ? [...pathPanel.value.selectedKeyframeIndices]
            : this.selected.absolute !== null
              ? [this.selected.absolute]
              : []

        if (!targets.length) return

        // auto 类型：对选中段整体重算贝塞尔（含中间非关键帧）
        if (type === 'auto') {
          motionStore.recomputeAutoForFrames?.(field, targets)
          this.currentHandleType = type
          this.update()
          pathPanel.value.handleUpDateData?.()
          return
        }

        targets.forEach(idx => motionStore.setKeyframeHandleType(field, idx, type))
        this.currentHandleType = type
        this.update()
        pathPanel.value.handleUpDateData?.()
      },
      update() {
        const panel = pathPanel.value
        if (!panel.setKeyframes) return
        if (!panel.field) {
          panel.setKeyframes([])
          panel.setKeyframeColor?.(this.color)
          panel.setHandles?.({})
          panel.setSelectedKeyframe?.(null)
          this.selected.absolute = null
          this.selected.relative = null
          this.currentHandleType = 'auto'
          return
        }
        const start = panel.location.startFrameIndex
        const size = panel.location.size as number | undefined
        const visible = typeof size === 'number' ? size : motionStore.getFrameCount()
        const end = start + visible
        
        // 检查keyframeDragMove预览
        const keyframeDragPreview = panel.keyframeDragMove.preview
        const keyframeDragActive =
          keyframeDragPreview.active &&
          typeof keyframeDragPreview.affectedStart === 'number' &&
          typeof keyframeDragPreview.affectedEnd === 'number' &&
          typeof keyframeDragPreview.keyGetter === 'function' &&
          panel.field === selectedFieldStore.selectedFieldName
        
        // 检查frameDrag预览
        const preview = panel.frameDrag.preview
        const previewActive =
          preview.active &&
          typeof preview.affectedStart === 'number' &&
          typeof preview.affectedEnd === 'number' &&
          typeof preview.keyGetter === 'function' &&
          panel.field === selectedFieldStore.selectedFieldName
          
        const relativeIndices: number[] = []
        const handlePayload: Record<
          number,
          { in?: { x: number; y: number }; out?: { x: number; y: number } }
        > = {}

        for (let idx = start; idx < end; idx++) {
          const info =
            keyframeDragActive &&
            idx >= (keyframeDragPreview.affectedStart as number) &&
            idx <= (keyframeDragPreview.affectedEnd as number)
              ? keyframeDragPreview.keyGetter!(idx)
              : previewActive &&
                idx >= (preview.affectedStart as number) &&
                idx <= (preview.affectedEnd as number)
              ? preview.keyGetter!(idx)
              : (() => {
                  const isKey = motionStore.isKeyframe(panel.field, idx)
                  const handle = isKey ? motionStore.getKeyframeHandle(panel.field, idx) : null
                  return {
                    isKey,
                    handle: handle
                      ? {
                          in: handle.in ? { dx: handle.in.x - idx, y: handle.in.y } : undefined,
                          out: handle.out ? { dx: handle.out.x - idx, y: handle.out.y } : undefined,
                          type: handle.type,
                        }
                      : null,
                  }
                })()

          if (info?.isKey) {
            const relative = idx - start
            relativeIndices.push(relative)
            const handle = info.handle
            if (handle) {
              handlePayload[relative] = {
                in: handle.in ? { x: idx + handle.in.dx + 1, y: handle.in.y } : undefined,
                out: handle.out ? { x: idx + handle.out.dx + 1, y: handle.out.y } : undefined,
              }
            }
          }
        }

        const getChartMetrics = () => {
          pathPanel.value.chart.refresh()
          return {
            width: Math.max(1, pathPanel.value.chart.width || 1),
            height: Math.max(1, pathPanel.value.chart.height || 1),
          }
        }

        const applyMiddlePanDelta = (deltaX: number, deltaY: number) => {
          const { width, height } = getChartMetrics()
          let didUpdate = false
          if (Math.abs(deltaX) > 0.01 && typeof pathPanel.value.location.size === 'number') {
            const framesPerPixel = (pathPanel.value.location.size as number) / width
            let offset = -deltaX * framesPerPixel
            if (!Number.isFinite(offset)) offset = 0
            if (offset !== 0) {
              const totalFrames = motionStore.getFrameCount()
              const maxStart = Math.max(0, totalFrames - (pathPanel.value.location.size as number))
              let target = pathPanel.value.location.startFrameIndex + offset
              target = Math.round(target)
              if (target < 0) target = 0
              if (target > maxStart) target = maxStart
              if (target !== pathPanel.value.location.startFrameIndex) {
                pathPanel.value.location.startFrameIndex = target
                didUpdate = true
              }
            }
          }
          if (Math.abs(deltaY) > 0.01) {
            const range = Math.max(
              pathPanel.value.yAxis.minHalfRange * 2,
              pathPanel.value.yAxis.halfRange * 2
            )
            const valuePerPixel = range / height
            if (Number.isFinite(valuePerPixel) && valuePerPixel !== 0) {
              pathPanel.value.yAxis.pan(valuePerPixel * deltaY)
              didUpdate = true
            }
          }
          if (didUpdate) {
            pathPanel.value.handleUpDateData()
          }
        }

        const applyCtrlMiddleZoom = (deltaX: number, deltaY: number, payload: ChartEvent) => {
          const zoomSensitivity = 0.01
          let didUpdate = false

          // X 轴单独缩放：左移放大范围（缩小显示），右移缩小范围（放大显示）
          if (Math.abs(deltaX) > 0.0001 && typeof pathPanel.value.location.size === 'number') {
            const totalFrames = motionStore.getFrameCount()
            const currentSize = pathPanel.value.location.size as number
            const mouseLabel =
              typeof payload?.xLabel === 'number' ? (payload.xLabel as number) - 1 : motionStore.currentFrameIndex
            const anchorIndex = Math.min(
              Math.max(0, Number.isFinite(mouseLabel) ? Math.round(mouseLabel) : motionStore.currentFrameIndex),
              Math.max(0, totalFrames - 1)
            )
            const factorX = Math.exp(-deltaX * zoomSensitivity) // 左移(负) => 放大范围；右移(正) => 缩小范围
            let nextSize = Math.round(currentSize * factorX)
            nextSize = clampDisplaySize(nextSize, totalFrames)
            const anchorRatio =
              currentSize === 0 ? 0 : (anchorIndex - pathPanel.value.location.startFrameIndex) / currentSize
            let nextStart = Math.round(anchorIndex - anchorRatio * nextSize)
            const maxStart = Math.max(0, totalFrames - nextSize)
            if (nextStart < 0) nextStart = 0
            if (nextStart > maxStart) nextStart = maxStart
            if (nextStart !== pathPanel.value.location.startFrameIndex || nextSize !== currentSize) {
              pathPanel.value.location.startFrameIndex = nextStart
              pathPanel.value.location.size = nextSize
              didUpdate = true
            }
          }

          // Y 轴单独缩放：下移放大范围（缩小显示），上移缩小范围（放大显示）
          if (Math.abs(deltaY) > 0.0001) {
            const anchor =
              typeof payload?.yAtCursor === 'number' ? payload.yAtCursor : pathPanel.value.yAxis.center
            const factorY = Math.exp(deltaY * zoomSensitivity) // 下移(正) => 放大范围；上移(负) => 缩小范围
            if (factorY !== 1) {
              pathPanel.value.yAxis.zoom(factorY, anchor)
              didUpdate = true
            }
          }

          if (didUpdate) {
            pathPanel.value.handleUpDateData()
          }
        }

        pathPanel.value.middlePan.handleStart = (payload: ChartEvent) => {
          const evt = payload?.nativeEvent
          if (evt) {
            evt.preventDefault()
          }
          pathPanel.value.chart.refresh()
          pathPanel.value.middlePan.active = true
          // 关闭底部滚动条的过渡动画，防止中键拖动时 left 动画
          pathPanel.value.location.disableScrollAnim = true
          pathPanel.value.middlePan.lastClientX = evt?.clientX ?? null
          pathPanel.value.middlePan.lastClientY = evt?.clientY ?? null
        }

        pathPanel.value.middlePan.handleMove = (payload: ChartEvent) => {
          if (!pathPanel.value.middlePan.active) return
          const evt = payload?.nativeEvent
          if (!evt) return
          evt.preventDefault()
          let deltaX = Number.isFinite(evt.movementX) ? evt.movementX : null
          let deltaY = Number.isFinite(evt.movementY) ? evt.movementY : null
          if (deltaX === null) {
            if (pathPanel.value.middlePan.lastClientX !== null) {
              deltaX =
                (evt.clientX ?? pathPanel.value.middlePan.lastClientX) -
                pathPanel.value.middlePan.lastClientX
            } else {
              deltaX = 0
            }
          }
          if (deltaY === null) {
            if (pathPanel.value.middlePan.lastClientY !== null) {
              deltaY =
                (evt.clientY ?? pathPanel.value.middlePan.lastClientY) -
                pathPanel.value.middlePan.lastClientY
            } else {
              deltaY = 0
            }
          }
          pathPanel.value.middlePan.lastClientX =
            evt.clientX ?? pathPanel.value.middlePan.lastClientX
          pathPanel.value.middlePan.lastClientY =
            evt.clientY ?? pathPanel.value.middlePan.lastClientY
          if (evt.ctrlKey) {
            applyCtrlMiddleZoom(deltaX ?? 0, deltaY ?? 0, payload)
            return
          }
          applyMiddlePanDelta(deltaX ?? 0, deltaY ?? 0)
        }

        pathPanel.value.middlePan.handleEnd = () => {
          if (!pathPanel.value.middlePan.active) return
          pathPanel.value.middlePan.active = false
          // 恢复滚动条动画
          pathPanel.value.location.disableScrollAnim = false
          pathPanel.value.middlePan.lastClientX = null
          pathPanel.value.middlePan.lastClientY = null
          // 中键拖动结束后保存视图状态
          pathPanel.value.saveCurrentViewState()
        }

        watch(
          () => motionStore.motionData,
          val => {
            autoKeyframeInitializedFields.clear()
            const fieldNames = val?.dof_names
            if (Array.isArray(fieldNames)) {
              fieldNames
                .filter(name => !name.includes('quater') && !name.includes('global'))
                .forEach(name => ensureAutoTurnKeyframes(name))
            }
          }
        )
        relativeIndices.sort((a, b) => a - b)
        panel.setKeyframes(relativeIndices)
        const color = themeStore.isDark ? KEYFRAME_COLOR_DARK : KEYFRAME_COLOR_LIGHT
        this.color = color
        panel.setKeyframeColor?.(color)
        panel.setHandles?.(handlePayload)
        this.ensureSelectionVisible()
        this.refreshHandleType()
      },
      handleDrag: {
        start: (payload: any) => {
          if (typeof payload?.keyframeLabel !== 'number') return
          const frameIndex = Math.round(payload.keyframeLabel) - 1
          if (frameIndex < 0) return
          pathPanel.value.keyframe.isHandleDragging = true
          pathPanel.value.keyframe.setSelectedByFrame(frameIndex)
        },
        move: (payload: any) => {
          if (!pathPanel.value.field) return
          if (pathPanel.value.keyframe.selected.absolute === null) return
          if (payload?.handle !== 'in' && payload?.handle !== 'out') return
          if (typeof payload?.xValue !== 'number' || typeof payload?.yValue !== 'number') return
          handleDragScheduler.schedule(pathPanel, {
            handle: payload.handle,
            xValue: payload.xValue,
            yValue: payload.yValue,
          })
        },
        end: () => {
          handleDragScheduler.flush(pathPanel)
          jointLineComputeThrottler.flush()
          pathPanel.value.keyframe.isHandleDragging = false
          pathPanel.value.keyframe.lastHandleDragTime = getHighResTime()
        },
      },
    },
    middlePan: {
      active: false,
      lastClientX: null,
      lastClientY: null,
      handleStart: (_payload: ChartEvent) => {},
      handleMove: (_payload: ChartEvent) => {},
      handleEnd: () => {},
    },
    rangeSelection: {
      active: false,
      start: null as number | null,
      end: null as number | null,
      committedStart: null as number | null,
      committedEnd: null as number | null,
      visual: { show: false, left: 0, width: 0 },
      handleStart(e: ChartEvent) {
        const nativeEvt = (e as any)?.nativeEvent
        if (nativeEvt?.altKey) return false // Alt 现用于绘制，不做框选
        if (!pathPanel.value.field) return false
        const frameIndex =
          typeof e?.xLabel === 'number' ? e.xLabel - 1 : motionStore.currentFrameIndex
        this.active = true
        this.start = frameIndex
        this.end = frameIndex
        this.updateVisual()
        return true
      },
      handleMove(e: ChartEvent) {
        if (!this.active) return
        if (typeof e?.xLabel !== 'number') return
        this.end = e.xLabel - 1
        motionStore.setCurrentFrameIndex(Math.max(0, Math.round(e.xLabel - 1)))
        this.updateVisual()
      },
      handleEnd() {
        if (!this.active) return
        const s = this.start ?? motionStore.currentFrameIndex
        const e = this.end ?? s
        const startIndex = Math.min(s, e)
        const endIndex = Math.max(s, e)
        this.committedStart = startIndex
        this.committedEnd = endIndex
        this.active = false
        this.updateVisual()
      },
      clearSelection() {
        this.active = false
        this.start = null
        this.end = null
        this.committedStart = null
        this.committedEnd = null
        this.visual = { show: false, left: 0, width: 0 }
        if (pathPanel.value.setSelectionRange) pathPanel.value.setSelectionRange(null)
      },
      getSelectionRange() {
        const hasActive = this.active && this.start !== null && this.end !== null
        if (hasActive) {
          return {
            start: Math.min(this.start as number, this.end as number),
            end: Math.max(this.start as number, this.end as number),
          }
        }
        if (this.committedStart !== null && this.committedEnd !== null) {
          return { start: this.committedStart, end: this.committedEnd }
        }
        return null
      },
      updateVisual() {
        const range = this.getSelectionRange()
        if (!range || !Number.isFinite(pathPanel.value.location.startFrameIndex)) {
          this.visual = { show: false, left: 0, width: 0 }
          if (pathPanel.value.setSelectionRange) pathPanel.value.setSelectionRange(null)
          return
        }
        const startFrame = pathPanel.value.location.startFrameIndex
        const visStart = Math.max(range.start, startFrame)
        const visEnd = Math.min(
          range.end,
          startFrame + (pathPanel.value.location.size ?? motionStore.getFrameCount()) - 1
        )
        if (visEnd < visStart) {
          this.visual = { show: false, left: 0, width: 0 }
          if (pathPanel.value.setSelectionRange) pathPanel.value.setSelectionRange(null)
          return
        }
        // 将范围交给图表内部渲染
        if (pathPanel.value.setSelectionRange) {
          pathPanel.value.setSelectionRange({
            start: visStart - startFrame,
            end: visEnd - startFrame,
          })
        }
        // 关闭外层高亮
        this.visual = { show: false, left: 0, width: 0 }
      },
      reset() {
        if (this.active) {
          this.active = false
        }
        this.start = null
        this.end = null
      },
    },

    /**
     * 轨迹图表交互控制系统
     *
     * 这是轨迹面板最核心的交互功能，让用户可以直接在曲线图上进行编辑操作。
     * 类似于图像编辑软件中的画笔工具，但专门针对时间序列数据进行了优化。
     *
     * 主要功能：
     * 1. 拖拽绘制：用户可以在曲线上拖拽来重新绘制轨迹
     * 2. 点击编辑：单击图表上的任意点来设置该帧的数值
     * 3. 实时预览：鼠标悬停时显示当前位置的帧数和数值信息
     * 4. 自动平滑：编辑完成后自动对修改区域进行平滑处理
     * 5. 帧同步：编辑时可选择是否同步切换到当前编辑的帧
     *
     * 交互模式：
     * - 悬停模式：显示鼠标位置信息，不修改数据
     * - 绘制模式：按住鼠标拖拽，实时修改曲线形状
     * - 点击模式：单击设置单个点的数值
     * - 跳转模式：右键点击跳转到指定帧
     *
     * 这种直观的编辑方式大大提高了动作调整的效率和精度。
     */
    move: {
      moving: false,
      isPreview: false,
      syncFrameIndex: true,
      currentX: null as number | null,
      currentY: null as number | null,
      currentLineY: null as number | null,
      lastXLabel: null as number | null,
      lastY: null as number | null,
      maxXLabel: null as number | null,
      minXLabel: null as number | null,
      currentContainerX: null as number | null,
      currentContainerY: null as number | null,
      updateDisplayTimer: null as null | NodeJS.Timeout,
      pointInfo: null as ChartPointInfo | null,
      updateScheduled: false,
      scheduleUpdate() {
        if (this.updateScheduled) return
        this.updateScheduled = true
        requestAnimationFrame(() => {
          this.updateScheduled = false
          pathPanel.value.handleUpDateData()
        })
      },
      handlePreviewStart() {
        this.isPreview = true
        this.moving = true
      },
      /**
       * 开始拖拽绘制操作
       *
       * 当用户按下鼠标开始在图表上绘制时调用，初始化绘制状态。
       * 这个方法准备所有必要的状态变量，为后续的拖拽绘制做准备。
       */
      handleStart() {
        this.moving = true
        this.lastXLabel = null
        this.lastY = null
        this.maxXLabel = -1
        this.minXLabel = 99999
        withDrawStore.setOperationInfo('轨迹绘制', selectedFieldStore.selectedFieldName as string)
      },
      /**
       * 结束拖拽绘制操作并进行数据后处理
       *
       * 当用户释放鼠标结束绘制时调用，这是轨迹编辑的关键步骤。
       *
       * 主要处理流程：
       * 1. 结束绘制状态，停止数据修改
       * 2. 收集拖拽过程中修改的所有帧数据
       * 3. 对修改区域进行平滑处理，消除突兀的变化
       * 4. 将平滑后的数据应用回动作序列
       * 5. 更新图表显示和3D场景
       *
       * 平滑处理的意义：
       * - 消除手动绘制时的抖动和不规则变化
       * - 创造自然流畅的关节运动轨迹
       * - 保持动作的连贯性和真实感
       *
       * 这个自动平滑功能让用户可以专注于大致的轨迹形状，
       * 而不需要担心细节上的完美，系统会自动优化结果。
       */
      handleEnd() {
        this.moving = false
        this.isPreview = false

        if (this.maxXLabel !== -1) {
          const maxX = this.maxXLabel as number
          const minX = this.minXLabel as number
          const ys = []
          for (let i = minX; i <= maxX; i++) {
            if (motionStore.motionData?.parsed[i - 1])
              ys.push(
                motionStore.motionData?.parsed[i - 1][
                  selectedFieldStore.selectedFieldName as string
                ]
              )
          }
          const processedData = tool_smoothData(ys, 0.4)
          for (let i = minX; i <= maxX; i++) {
            try {
              motionStore.setFrameFieldValue(
                i - 1,
                selectedFieldStore.selectedFieldName as string,
                processedData[i - minX]
              )
            } catch (error) {}
          }
          pathPanel.value.handleUpDateData()
          // 轨迹画板抬笔时更新关节位置线条（这是真正的手动编辑操作）
          if (this.moving) {
            jointPositionLine.value.handleUpdate()
          }
          api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
          api.forceRender()
          this.maxXLabel = -1
          this.minXLabel = 99999
        }
      },
      /**
       * 处理图表点击编辑
       *
       * 当用户单击图表上某个点时调用，实现精确的单点数值设置。
       * 这是一种快速修正特定帧数据的便捷方式。
       *
       * 功能特点：
       * - 精确定位：点击位置直接对应帧数和数值
       * - 即时生效：修改后立即更新3D场景显示
       * - 可选跳转：可以选择是否同时跳转到编辑的帧
       * - 实时反馈：图表立即显示修改后的结果
       */
      handleClick(e: ChartEvent) {
        if (pathPanel.value.keyframe.isHandleDragging) return
        const lastHandleRelease = pathPanel.value.keyframe.lastHandleDragTime
        if (typeof lastHandleRelease === 'number' && getHighResTime() - lastHandleRelease < 150) {
          pathPanel.value.keyframe.lastHandleDragTime = null
          return
        }
        const frameIndex = e.xLabel - 1
        motionStore.setCurrentFrameIndex(frameIndex)
        // const selectedValue = e.yAtCursor || e.yValue
        // motionStore.setFrameFieldValue(frameIndex, selectedFieldStore.selectedFieldName as string, selectedValue)
        // if (this.syncFrameIndex) {
        //     motionStore.setCurrentFrameIndex(frameIndex)
        // }
        // pathPanel.value.handleUpDateData()
        // // 轨迹点击编辑完成时更新关节位置线条（这是真正的手动编辑操作）
        // // 点击编辑是即时操作，不涉及拖动状态，直接更新
        // jointPositionLine.value.handleUpdate()
        // api.robot.setFrame((motionStore.getCurrentFrame() as FrameLike))
        // api.forceRender()
        // jointQuatSphere.value.updateQuat()
      },
      handlePointClick(e: ChartEvent) {
        if (pathPanel.value.keyframe.isHandleDragging) return
        if (typeof e?.xLabel !== 'number') return
        const frameIndex = Math.max(0, Math.round(e.xLabel - 1))
        const yValue = typeof e?.yValue === 'number' ? e.yValue : null
        const isKeyframePoint = !!e.isKeyframe
        const info: ChartPointInfo = {
          frameIndex,
          xLabel: e.xLabel,
          yValue,
          isKeyframe: isKeyframePoint,
        }
        this.pointInfo = info

        // 仅对关键帧点进行选择逻辑
        if (!isKeyframePoint) return

        const selection = pathPanel.value.selectedKeyframeIndices
        const evt = (e as any)?.nativeEvent as MouseEvent | undefined
        const ctrl = !!(evt?.ctrlKey || (evt as any)?.metaKey || (e as any)?.ctrlKey)

        if (!ctrl) {
          // 单击：清空后只选当前
          if (typeof pathPanel.value.clearKeyframeSelection === 'function') {
            pathPanel.value.clearKeyframeSelection()
          } else {
            selection.clear()
            pathPanel.value.selectionCount = 0
          }
          selection.add(frameIndex)
          pathPanel.value.selectionCount = selection.size
          pathPanel.value.keyframe.setSelectedByFrame(frameIndex)
        } else {
          // Ctrl+点击：切换选中状态
          if (selection.has(frameIndex)) {
            selection.delete(frameIndex)
          } else {
            selection.add(frameIndex)
          }
          pathPanel.value.selectionCount = selection.size
          if (selection.has(frameIndex)) {
            pathPanel.value.keyframe.setSelectedByFrame(frameIndex)
          } else if (selection.size === 0) {
            pathPanel.value.keyframe.setSelectedByFrame(null)
          }
        }

        // 同步图表显示
        pathPanel.value.handleUpDateData()
      },
      handleBlankClick(_e: ChartEvent) {
        // 点击空白：仅隐藏控制柄，不切换帧、不清空多选
        this.pointInfo = null
        pathPanel.value.keyframe.setSelectedByFrame(null)
        pathPanel.value.handleUpDateData()
      },
      /**
       * 处理鼠标移动和拖拽绘制
       *
       * 这是轨迹编辑最核心的方法，处理鼠标在图表上的所有移动操作。
       *
       * 工作模式：
       * 1. 悬停模式：仅更新位置信息，不修改数据
       * 2. 绘制模式：拖拽时实时修改曲线数据
       *
       * 主要功能：
       * - 位置跟踪：实时记录鼠标在图表上的精确位置
       * - 实时编辑：拖拽时即时修改关节角度数据
       * - 范围记录：跟踪修改的帧数范围，用于后续平滑处理
       * - 3D同步：修改数据时立即更新3D机器人显示
       * - 帧跳转：可选择是否同步切换到当前编辑的帧
       *
       * 优化特性：
       * - 帧变化检测：避免在同一帧内重复更新
       * - 四元数球同步：确保旋转显示的一致性
       * - 实时反馈：每次修改都立即反映在图表上
       */
      handleMove(e: ChartEvent) {
        if (pathPanel.value.rangeSelection.active) {
          pathPanel.value.rangeSelection.handleMove(e)
          return
        }
        if (e.isContainer) {
          this.currentContainerX = e.offsetX || null
          this.currentContainerY = e.offsetY || null
          return
        }
        this.currentX = e.xLabel
        this.currentY = e.yAtCursor || null
        this.currentLineY = e.yAtCursor || e.yValue
        if (this.moving === false) return

        if (this.isPreview) {
          // motionStore.setCurrentFrameIndex(e.xLabel - 1)
          // pathPanel.value.handleUpDateData()
          this.updateDisplay(false, true, e.xLabel - 1)
          return
        }

        const set = (
          frameIndex: number,
          fieldName: string,
          selectedValue: number,
          changedFrame: boolean
        ) => {
          motionStore.setFrameFieldValue(frameIndex, fieldName, selectedValue)
          this.updateDisplay(true, changedFrame, frameIndex)
        }

        if (e.xLabel > (this.maxXLabel as number)) {
          this.maxXLabel = e.xLabel
        }
        if (e.xLabel < (this.minXLabel as number)) {
          this.minXLabel = e.xLabel
        }

        let changedFrame = true
        if (this.lastXLabel === null) {
          this.lastXLabel = e.xLabel
          this.lastY = e.yAtCursor || null
        } else {
          if (e.xLabel === this.lastXLabel) {
            changedFrame = false
          }
          this.lastXLabel = e.xLabel
          this.lastY = e.yAtCursor || null
        }

        const frameIndex = e.xLabel - 1
        const selectedValue = e.yAtCursor || e.yValue
        set(frameIndex, selectedFieldStore.selectedFieldName as string, selectedValue, changedFrame)
        
        // 优化3：使用 requestAnimationFrame 节流更新，而不是立即调用
        this.scheduleUpdate()
        // 移除实时更新，轨迹绘制过程中不更新关节位置线条
      },
      updateDisplay(useTimer: boolean, changedFrame: boolean, frameIndex: number) {
        const doUpdate = () => {
          if (this.syncFrameIndex) {
            motionStore.setCurrentFrameIndex(frameIndex)
          } else {
            api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
            jointQuatSphere.value.updateQuat()
            api.forceRender()
          }
          // if (!changedFrame) {
          //     jointQuatSphere.value.updateQuat()
          //     api.robot.setFrame((motionStore.getCurrentFrame() as FrameLike))
          //     // quatSphere.value.updateRobotQuat()
          //     api.forceRender()
          // }
        }
        if (useTimer) {
          if (this.updateDisplayTimer) {
            clearTimeout(this.updateDisplayTimer)
          }
          this.updateDisplayTimer = setTimeout(() => {
            doUpdate()
          }, 16.66)
        } else {
          doUpdate()
        }
      },
      /**
       * 重置图表鼠标位置信息
       *
       * 清空鼠标在图表坐标系中的位置记录，通常在鼠标离开图表区域时调用。
       * 这确保了位置信息的准确性，避免显示过期的位置数据。
       */
      resetMouseLocation() {
        this.currentX = null
        this.currentY = null
        this.currentLineY = null
      },

      /**
       * 重置容器鼠标位置信息
       *
       * 清空鼠标在容器像素坐标系中的位置记录，用于清理像素级的位置数据。
       */
      resetMouseContainerLocation() {
        this.currentContainerX = null
        this.currentContainerY = null
      },
    },
    frameValueControl: {
      unitValue: 0.0001,
      minUnit: 0.0001,
      maxUnit: 10,
      precision: 4,
      value: 0,
      editable: false,
      refresh() {
        const field = pathPanel.value.field
        const frameIndex = motionStore.currentFrameIndex
        if (!field || frameIndex < 0) {
          this.value = 0
          this.editable = false
          return
        }
        const rawVal = motionStore.motionData?.parsed?.[frameIndex]?.[field]
        this.value = Number.isFinite(rawVal as number) ? (rawVal as number) : 0
        this.editable = motionStore.isKeyframe(field, frameIndex)
      },
      setUnitValue(v: number) {
        const fvc = pathPanel.value.frameValueControl
        const safe = Number.isFinite(v) ? v : fvc.unitValue
        const clamped = Math.min(fvc.maxUnit, Math.max(fvc.minUnit, safe))
        fvc.unitValue = clamped
      },
      setValue(v: number) {
        const fvc = pathPanel.value.frameValueControl
        const field = pathPanel.value.field
        if (!field) {
          fvc.refresh()
          return
        }
        if (!fvc.editable) {
          fvc.refresh()
          return
        }
        const frameIndex = motionStore.currentFrameIndex
        if (frameIndex < 0) {
          fvc.refresh()
          return
        }
        const val = Number.isFinite(v) ? v : fvc.value
        motionStore.setFrameFieldValue(frameIndex, field, val)
        fvc.value = val
        const total =
          motionStore.frame_getNum && typeof motionStore.frame_getNum === 'function'
            ? motionStore.frame_getNum()
            : motionStore.getFrameCount()
        const range = buildHandleRecomputeRange(field, frameIndex, 'out')
        jointLineComputeThrottler.request(false, range)
        pathPanel.value.handleUpDateData()
      },
    },
    frameDrag: {
      active: false,
      startIndex: null as number | null,
      targetIndex: null as number | null,
      rangeStart: null as number | null,
      rangeEnd: null as number | null,
      lastAppliedTarget: null as number | null,
      originValues: null as number[] | null,
      originKeyInfo: null as
        | {
            isKey: boolean
            handle: {
              in?: { dx: number; y: number }
              out?: { dx: number; y: number }
              type?: any
            } | null
          }[]
        | null,
      pendingXLabel: null as number | null,
      pendingPayload: null as any,
      rafId: null as number | null,
      hasSelection: false,
      startYAtCursor: null as number | null,
      currentYOffset: 0,
      preview: {
        active: false,
        target: null as number | null,
        destStart: null as number | null,
        destEnd: null as number | null,
        affectedStart: null as number | null,
        affectedEnd: null as number | null,
        selection: null as { start: number; end: number } | null,
        valueGetter: null as ((i: number) => number) | null,
        keyGetter: null as
          | ((
              i: number
            ) => {
              isKey: boolean
              handle: { in?: { dx: number; y: number }; out?: { dx: number; y: number }; type?: any } | null
            } | null | undefined)
          | null,
      },
      resetPreview() {
        this.preview.active = false
        this.preview.target = null
        this.preview.destStart = null
        this.preview.destEnd = null
        this.preview.affectedStart = null
        this.preview.affectedEnd = null
        this.preview.selection = null
        this.preview.valueGetter = null
        this.preview.keyGetter = null
        this.startYAtCursor = null
        this.currentYOffset = 0
        this.pendingPayload = null
      },
      applyRangeState(
        fieldName: string,
        valueGetter: (i: number) => number,
        keyGetter: (
          i: number
        ) =>
          | {
              isKey: boolean
              handle: {
                in?: { dx: number; y: number }
                out?: { dx: number; y: number }
                type?: any
              } | null
            }
          | null
          | undefined,
        start: number,
        end: number
      ) {
        withDrawStore.runWithoutRecord(() => {
          // 优化：批量获取限制信息，避免每次 setFrameFieldValue 都去查找
          let lower = -Infinity
          let upper = Infinity
          if (!fieldName.includes('quater') && !fieldName.includes('global')) {
            const jointConfiguration = api.robot.joint.getSingleInfo(fieldName)
            if (jointConfiguration && jointConfiguration.limit) {
              lower = jointConfiguration.limit.lower
              upper = jointConfiguration.limit.upper
            }
          }

          const rawMotionData = toRaw(motionStore.motionData)
          if (!rawMotionData || !rawMotionData.parsed) return

          // 优化：直接操作 Raw 数据，避免 Reactivity 触发
          for (let i = start; i <= end; i++) {
            let val = valueGetter(i)
            if (val < lower) val = lower
            if (val > upper) val = upper
            // 直接写入 raw 对象
            if (rawMotionData.parsed[i]) {
              rawMotionData.parsed[i][fieldName] = val
            }
          }

          for (let i = start; i <= end; i++) {
            const info = keyGetter(i)
            const isKey = info?.isKey
            const handle = info?.handle
            const exists = motionStore.isKeyframe(fieldName, i)
            if (isKey && !exists) {
              motionStore.addKeyframe(fieldName, i)
            }
            if (!isKey && exists) {
              motionStore.removeKeyframe(fieldName, i)
            }
            if (isKey && handle) {
              if (handle.in) {
                motionStore.updateKeyframeHandlePoint(
                  fieldName,
                  i,
                  'in',
                  { x: i + (handle.in?.dx ?? 0), y: handle.in?.y },
                  handle.type
                )
              }
              if (handle.out) {
                motionStore.updateKeyframeHandlePoint(
                  fieldName,
                  i,
                  'out',
                  { x: i + (handle.out?.dx ?? 0), y: handle.out?.y },
                  handle.type
                )
              }
              if (handle.type) {
                motionStore.setKeyframeHandleType(fieldName, i, handle.type)
              }
            }
          }
        })
      },
      getMovedState(
        baseValues: number[],
        baseKeys: {
          isKey: boolean
          handle: {
            in?: { dx: number; y: number }
            out?: { dx: number; y: number }
            type?: any
          } | null
        }[],
        rangeStart: number,
        rangeEnd: number,
        targetIndex: number
      ) {
        const total = motionStore.getFrameCount()
        const len = rangeEnd - rangeStart + 1
        const clampTarget = Math.max(0, Math.min(total - 1, targetIndex))

        if (clampTarget >= rangeStart && clampTarget <= rangeEnd + 1) {
          return {
            applied: false,
            valueGetter: (i: number) => baseValues[i],
            keyGetter: (i: number) => baseKeys[i],
            destStart: rangeStart,
            destEnd: rangeEnd,
            affectedStart: rangeStart,
            affectedEnd: rangeEnd,
          }
        }

        let insertIdx = clampTarget
        if (insertIdx > rangeStart) insertIdx -= len

        const destStart = insertIdx
        const destEnd = insertIdx + len - 1
        const affectedStart = Math.min(rangeStart, destStart)
        const affectedEnd = Math.max(rangeEnd, destEnd)

        const mapIndex = (i: number) => {
          if (destStart === rangeStart) return i
          if (destStart > rangeStart) {
            if (i >= rangeStart && i < destStart) return i + len
            if (i >= destStart && i < destStart + len) return rangeStart + (i - destStart)
          } else {
            if (i >= destStart && i < destStart + len) return rangeStart + (i - destStart)
            if (i >= destStart + len && i < rangeStart + len) return i - len
          }
          return i
        }

        return {
          applied: true,
          valueGetter: (i: number) => baseValues[mapIndex(i)],
          keyGetter: (i: number) => baseKeys[mapIndex(i)],
          destStart,
          destEnd,
          affectedStart,
          affectedEnd,
        }
      },
      handleStart(e: ChartEvent) {
        const nativeEvt = (e as any)?.nativeEvent
        const isAlt = nativeEvt?.altKey || (e as any)?.altKey
        const isShift = nativeEvt?.shiftKey || (e as any)?.shiftKey
        if (!isAlt || !isShift) return false
        if (!selectedFieldStore.selectedFieldName) return false
        const selection = pathPanel.value.rangeSelection.getSelectionRange()
        if (!selection) return false
        const idx =
          typeof e?.xLabel === 'number'
            ? Math.max(0, Math.round(e.xLabel - 1))
            : motionStore.currentFrameIndex
        this.startYAtCursor =
          typeof (e as any)?.yAtCursor === 'number' ? ((e as any).yAtCursor as number) : null
        this.currentYOffset = 0
        this.hasSelection = true
        const startRange = selection.start
        const endRange = selection.end
        this.active = true
        this.startIndex = idx
        this.targetIndex = idx
        this.rangeStart = Math.max(0, Math.min(startRange, endRange))
        this.rangeEnd = Math.min(motionStore.getFrameCount() - 1, Math.max(startRange, endRange))
        this.lastAppliedTarget = null
        this.originValues =
          motionStore.motionData?.parsed.map(
            (f: any) => f[selectedFieldStore.selectedFieldName as string]
          ) || []
        const baseValues = this.originValues || []
        this.originKeyInfo = baseValues.map((_v: number, i: number) => {
          const isKey = motionStore.isKeyframe(selectedFieldStore.selectedFieldName as string, i)
          const handle = isKey
            ? motionStore.getKeyframeHandle(selectedFieldStore.selectedFieldName as string, i)
            : null
          return {
            isKey,
            handle: handle
              ? {
                  in: handle.in ? { dx: handle.in.x - i, y: handle.in.y } : undefined,
                  out: handle.out ? { dx: handle.out.x - i, y: handle.out.y } : undefined,
                  type: handle.type,
                }
              : null,
          }
        })
        this.resetPreview()
        pathPanel.value.move.moving = false
        pathPanel.value.move.isPreview = false
        pathPanel.value.move.maxXLabel = -1 as any
        pathPanel.value.move.minXLabel = 99999 as any
        motionStore.setCurrentFrameIndex(idx)
        return true
      },
      handleHover(e: ChartEvent) {
        if (!this.active) return
        if (typeof e?.xLabel !== 'number') return
        this.pendingXLabel = e.xLabel
        this.pendingPayload = e
        if (this.rafId === null) {
          this.rafId = requestAnimationFrame(() => {
            this.processHover()
          })
        }
      },
      processHover() {
        this.rafId = null
        if (this.pendingXLabel === null) return
        const xLabel = this.pendingXLabel

        if (!this.active) return
        if (!this.originValues || !this.originKeyInfo) return
        if (this.rangeStart === null || this.rangeEnd === null) return

        const nextTarget = Math.max(0, Math.min(motionStore.getFrameCount() - 1, Math.round(xLabel - 1)))
        const currentYAtCursor =
          typeof (this.pendingPayload as any)?.yAtCursor === 'number'
            ? ((this.pendingPayload as any).yAtCursor as number)
            : null
        if (typeof currentYAtCursor === 'number' && typeof this.startYAtCursor === 'number') {
          this.currentYOffset = currentYAtCursor - this.startYAtCursor
        } else {
          this.currentYOffset = 0
        }
        const result = this.getMovedState(
          this.originValues,
          this.originKeyInfo,
          this.rangeStart,
          this.rangeEnd,
          nextTarget
        )

        const offset = this.currentYOffset || 0
        if (result.applied || Math.abs(offset) > 1e-9) {
          const appliedResult = result.applied
            ? result
            : {
                destStart: this.rangeStart,
                destEnd: this.rangeEnd,
                affectedStart: this.rangeStart,
                affectedEnd: this.rangeEnd,
                valueGetter: (i: number) => this.originValues![i],
                keyGetter: (i: number) => this.originKeyInfo![i],
              }
          this.preview.active = true
          this.preview.target = nextTarget
          this.preview.destStart = appliedResult.destStart
          this.preview.destEnd = appliedResult.destEnd
          this.preview.affectedStart = appliedResult.affectedStart
          this.preview.affectedEnd = appliedResult.affectedEnd
          this.preview.selection = this.hasSelection
            ? { start: appliedResult.destStart as number, end: appliedResult.destEnd as number }
            : null
          const baseGetter = appliedResult.valueGetter
          this.preview.valueGetter = (i: number) => {
            return baseGetter(i) + offset
          }
          this.preview.keyGetter = appliedResult.keyGetter
        } else {
          this.resetPreview()
          if (this.hasSelection && this.rangeStart !== null && this.rangeEnd !== null) {
            this.preview.selection = { start: this.rangeStart, end: this.rangeEnd }
          }
        }
        this.lastAppliedTarget = nextTarget
        this.targetIndex = nextTarget
        pathPanel.value.handleUpDateData()
      },
      async handleEnd() {
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId)
          this.rafId = null
          this.processHover()
        }
        this.pendingXLabel = null
        this.pendingPayload = null

        if (!this.active) {
          this.resetPreview()
          return
        }

        const fieldName = selectedFieldStore.selectedFieldName as string
        const rangeStart = this.rangeStart ?? motionStore.currentFrameIndex
        const rangeEnd = this.rangeEnd ?? rangeStart
        const finalTarget =
          this.preview.target ?? this.lastAppliedTarget ?? this.targetIndex ?? rangeStart
        const clampTarget = Math.max(0, Math.min(motionStore.getFrameCount() - 1, finalTarget))
        const offsetOnly = Math.abs(this.currentYOffset || 0) > 1e-9
        if (clampTarget >= rangeStart && clampTarget <= rangeEnd + 1 && !offsetOnly) {
          this.resetPreview()
          this.active = false
          this.startIndex = null
          this.targetIndex = null
          this.rangeStart = null
          this.rangeEnd = null
          this.lastAppliedTarget = null
          this.originValues = null
          this.originKeyInfo = null
          return
        }
        if (!this.originValues || !this.originKeyInfo) {
          this.resetPreview()
          this.active = false
          return
        }

        const moveResult = this.getMovedState(
          this.originValues,
          this.originKeyInfo,
          rangeStart,
          rangeEnd,
          clampTarget
        )
        const { valueGetter, keyGetter, destStart, destEnd, affectedStart, affectedEnd } = moveResult
        const offset = this.currentYOffset || 0
        const valueGetterWithOffset = (i: number) => valueGetter(i) + offset

        const captureEntries = (
          valGet: (i: number) => number,
          keyGet: (i: number) => { isKey: boolean; handle: any | null } | null | undefined,
          start: number,
          end: number
        ) => {
          const entries: any[] = []
          for (let i = start; i <= end; i++) {
            const info = keyGet(i)
            const handleOffset = info?.handle
            entries.push({
              index: i,
              value: valGet(i),
              isKey: info?.isKey,
              handle: handleOffset
                ? {
                    in: handleOffset.in
                      ? { x: i + handleOffset.in.dx, y: handleOffset.in.y }
                      : undefined,
                    out: handleOffset.out
                      ? { x: i + handleOffset.out.dx, y: handleOffset.out.y }
                      : undefined,
                    type: handleOffset.type,
                  }
                : null,
            })
          }
          return entries
        }

        const beforeEntries = captureEntries(
          i => this.originValues![i],
          i => this.originKeyInfo![i],
          affectedStart,
          affectedEnd
        )
        const afterEntries = captureEntries(valueGetterWithOffset, keyGetter, affectedStart, affectedEnd)

        const isSameHandle = (
          a: { in?: { x: number; y: number }; out?: { x: number; y: number }; type?: any } | null,
          b: { in?: { x: number; y: number }; out?: { x: number; y: number }; type?: any } | null
        ) => {
          if (!a && !b) return true
          if (!a || !b) return false
          const samePoint = (
            p1: { x: number; y: number } | undefined,
            p2: { x: number; y: number } | undefined
          ) => {
            if (!p1 && !p2) return true
            if (!p1 || !p2) return false
            return p1.x === p2.x && p1.y === p2.y
          }
          return samePoint(a.in, b.in) && samePoint(a.out, b.out) && a.type === b.type
        }

        const filteredBeforeEntries: typeof beforeEntries = []
        const filteredAfterEntries: typeof afterEntries = []

        // 对比操作前（before）和操作后（after）的状态差异
        // 这样可以正确记录所有被覆盖的帧，确保撤销时能完整恢复
        for (let idx = 0; idx < afterEntries.length; idx++) {
          const after = afterEntries[idx]
          const before = beforeEntries[idx]
          const beforeIsKey = !!before.isKey
          const afterIsKey = !!after.isKey
          const valueChanged = before.value !== after.value
          const keyChanged = beforeIsKey !== afterIsKey
          const handleChanged = afterIsKey
            ? !isSameHandle(after.handle, before.handle)
            : beforeIsKey && !!before.handle

          if (valueChanged || keyChanged || handleChanged) {
            filteredBeforeEntries.push(before)
            filteredAfterEntries.push(after)
          }
        }

        windowStore.setOperatingText('正在移动...')
        await new Promise(resolve => setTimeout(resolve, 50))

        if (filteredAfterEntries.length) {
          withDrawStore.runWithoutRecord(() => {
            withDrawStore.applyFieldEntries(fieldName, filteredAfterEntries)
          })
        }

        const hasChanges = filteredAfterEntries.length > 0
        if (hasChanges) {
          withDrawStore.setOperationInfo(
            clampTarget >= rangeStart && clampTarget <= rangeEnd + 1 ? '选区纵向平移' : '插入片段',
            fieldName
          )
          withDrawStore.pushFieldRangeMove(
            fieldName,
            rangeStart,
            rangeEnd,
            destStart,
            affectedStart,
            affectedEnd,
            filteredBeforeEntries,
            filteredAfterEntries
          )
        }

        pathPanel.value.handleUpDateData()
        try {
        //   viewer.value?.jointPositionLine3D?.setTotal(motionStore.frame_getNum() - 1)
          viewer.value?.jointPositionLine3D?.compute(
            Math.min(0, destStart - 2),
            motionStore.frame_getNum() + 1,
            motionStore.motionData?.parsed || []
          )
        //   viewer.value?.jointPositionLine3D?.resetColor()
        } catch (err) {
          console.warn(err)
        }
        // jointPositionLine.value.handleUpdate()

        if (this.hasSelection) {
          pathPanel.value.rangeSelection.committedStart = destStart
          pathPanel.value.rangeSelection.committedEnd = destEnd
          pathPanel.value.rangeSelection.updateVisual()
        }

        this.resetPreview()
        this.active = false
        this.startIndex = null
        this.targetIndex = null
        this.rangeStart = null
        this.rangeEnd = null
        this.lastAppliedTarget = null
        this.originValues = null
        this.originKeyInfo = null
        this.hasSelection = false
        windowStore.setOperatingText('')
      },
    },
    keyframeDragMove: {
      active: false,
      isDragging: false,
      selectedKeyframes: [] as number[],
      startMouseX: null as number | null,
      startMouseY: null as number | null,
      startClientX: null as number | null,
      startClientY: null as number | null,
      currentOffsetX: 0,
      currentOffsetY: 0,
      originValues: new Map<number, number>(),
      originKeyInfo: new Map<number, { isKey: boolean; handle: any }>(),
      preview: {
        active: false,
        valueGetter: null as ((i: number) => number | null) | null,
        keyGetter: null as ((i: number) => { isKey: boolean; handle: any } | null) | null,
        affectedStart: null as number | null,
        affectedEnd: null as number | null,
      },
      handleStart(e: ChartEvent, clickedIndex: number): boolean {
        // 检查是否点击了已选中的关键帧
        const nativeEvt = (e as any)?.nativeEvent
        if (nativeEvt?.ctrlKey || nativeEvt?.altKey || nativeEvt?.shiftKey) {
          return false
        }
        
        if (!selectedFieldStore.selectedFieldName) return false
        
        // 确认是关键帧
        const absIndex = clickedIndex
        if (!motionStore.isKeyframe(selectedFieldStore.selectedFieldName, absIndex)) {
          return false
        }
        
        // 如果点击的不是已选中的关键帧，则清除旧选择，选中当前这个
        if (!pathPanel.value.selectedKeyframeIndices.has(absIndex)) {
          if (typeof pathPanel.value.clearKeyframeSelection === 'function') {
            pathPanel.value.clearKeyframeSelection()
          } else {
            pathPanel.value.selectedKeyframeIndices.clear()
            pathPanel.value.selectionCount = 0
          }
          pathPanel.value.selectedKeyframeIndices.add(absIndex)
          pathPanel.value.selectionCount = 1
          pathPanel.value.handleUpDateData() // 更新视图选中状态
        }
        
        // 启动拖拽
        this.active = true
        this.isDragging = false
        this.selectedKeyframes = Array.from(pathPanel.value.selectedKeyframeIndices).sort((a, b) => a - b)
        this.startMouseX = typeof e?.xLabel === 'number' ? e.xLabel : null
        this.startMouseY = typeof (e as any)?.yAtCursor === 'number' ? (e as any).yAtCursor : null
        this.startClientX = nativeEvt?.clientX ?? null
        this.startClientY = nativeEvt?.clientY ?? null
        this.currentOffsetX = 0
        this.currentOffsetY = 0
        
        // 保存原始数据
        this.originValues.clear()
        this.originKeyInfo.clear()
        const fieldName = selectedFieldStore.selectedFieldName
        for (const idx of this.selectedKeyframes) {
          const value = motionStore.motionData?.parsed?.[idx]?.[fieldName]
          const isKey = motionStore.isKeyframe(fieldName, idx)
          const handle = isKey ? motionStore.getKeyframeHandle(fieldName, idx) : null
          this.originValues.set(idx, value)
          this.originKeyInfo.set(idx, {
            isKey,
            handle: handle ? {
              in: handle.in ? { dx: handle.in.x - idx, y: handle.in.y } : undefined,
              out: handle.out ? { dx: handle.out.x - idx, y: handle.out.y } : undefined,
              type: handle.type,
            } : null,
          })
        }
        
        this.resetPreview()
        return true
      },
      handleMove(e: ChartEvent) {
        if (!this.active) return
        if (!selectedFieldStore.selectedFieldName) return
        if (this.selectedKeyframes.length === 0) return

        const currentX = typeof e?.xLabel === 'number' ? e.xLabel : this.startMouseX
        const currentY = typeof (e as any)?.yAtCursor === 'number' ? (e as any).yAtCursor : this.startMouseY
        
        if (this.startMouseX === null || this.startMouseY === null) return
        if (currentX === null || currentY === null) return

        if (!this.isDragging) {
            const nativeEvt = (e as any)?.nativeEvent
            
            // 1. 优先使用屏幕像素判断防抖 (5px 阈值)
            if (this.startClientX !== null && this.startClientY !== null && nativeEvt) {
               const dx = nativeEvt.clientX - this.startClientX
               const dy = nativeEvt.clientY - this.startClientY
               if (Math.sqrt(dx * dx + dy * dy) >= 5) {
                   this.isDragging = true
               }
            } 
            // 2. 降级策略：使用逻辑坐标判断 (当拿不到屏幕坐标时)
            else {
               const dxLabel = Math.abs(currentX - this.startMouseX)
               const dyValue = Math.abs(currentY - this.startMouseY)
               
               // X轴变动超过0.1帧，或者Y轴变动超过一定数值（防止浮点误差）
               // 注意：offsetY 的计算在后面，这里预先判断
               if (dxLabel > 0.1 || dyValue > 1e-4) {
                   this.isDragging = true
               }
            }
            
            if (!this.isDragging) return
        }
        
        // 计算偏移量
        const offsetXInFrames = Math.round(currentX - this.startMouseX)
        const offsetY = currentY - this.startMouseY
        
        this.currentOffsetX = offsetXInFrames
        this.currentOffsetY = offsetY
        
        const totalFrames = motionStore.getFrameCount()
        const startFrameIndex = pathPanel.value.location.startFrameIndex
        
        // 使用幽灵点进行高性能预览（不需要更新整个图表数据）
        if (pathPanel.value.setGhostPoints) {
          const ghostPoints: Array<{ xLabel: number; yValue: number; isSelected?: boolean }> = []
          let previewUpdated = false
          const currentFrameIdx = motionStore.currentFrameIndex
          const jointName = selectedFieldStore.selectedFieldName
          
          for (const origIdx of this.selectedKeyframes) {
            const targetIdx = Math.max(0, Math.min(totalFrames - 1, origIdx + offsetXInFrames))
            const origValue = this.originValues.get(origIdx) ?? 0
            const newValue = origValue + offsetY
            
            // 计算相对于当前显示区间的 xLabel
            // xLabel 是从1开始的标签，对应显示区间内的帧
            const xLabel = targetIdx + 1
            
            ghostPoints.push({
              xLabel,
              yValue: newValue,
              isSelected: true,
            })

            // 如果临时点和当前帧相交，更新 3D 预览
            if (targetIdx === currentFrameIdx && viewer.value?.setSingleJointValue && jointName) {
              viewer.value.setSingleJointValue(jointName, newValue)
              previewUpdated = true
            }
          }

          // 如果没有相交，恢复当前帧原始值
          if (!previewUpdated && viewer.value?.setSingleJointValue && jointName) {
            // 获取当前帧的原始未编辑数据
            const originalValue = motionStore.motionData?.parsed?.[currentFrameIdx]?.[jointName] ?? 0
            viewer.value.setSingleJointValue(jointName, originalValue)
          }
          
          pathPanel.value.setGhostPoints(ghostPoints)
          return
        }
        
        // 回退逻辑：如果不支持幽灵点，使用原来的预览方式
        // 计算影响范围
        const minSelected = Math.min(...this.selectedKeyframes)
        const maxSelected = Math.max(...this.selectedKeyframes)
        
        // 新位置的关键帧
        const newKeyframes = this.selectedKeyframes.map(idx => {
          const newIdx = idx + offsetXInFrames
          return Math.max(0, Math.min(totalFrames - 1, newIdx))
        }).filter((v, i, arr) => arr.indexOf(v) === i) // 去重
        
        const minNew = Math.min(...newKeyframes)
        const maxNew = Math.max(...newKeyframes)
        
        const affectedStart = Math.min(minSelected, minNew)
        const affectedEnd = Math.max(maxSelected, maxNew)
        
        // 创建预览getter
        const fieldName = selectedFieldStore.selectedFieldName
        const valueGetter = (i: number): number | null => {
          const frameData = motionStore.motionData?.parsed?.[i]
          if (!frameData) return null
          
          // 检查是否是移动后的新位置
          for (let j = 0; j < this.selectedKeyframes.length; j++) {
            const origIdx = this.selectedKeyframes[j]
            const targetIdx = Math.max(0, Math.min(totalFrames - 1, origIdx + offsetXInFrames))
            if (i === targetIdx) {
              const origValue = this.originValues.get(origIdx)
              return (origValue ?? 0) + offsetY
            }
          }
          
          // 返回当前值
          return frameData[fieldName]
        }
        
        const keyGetter = (i: number): { isKey: boolean; handle: any } | null => {
          // 检查是否是移动后的新位置
          for (let j = 0; j < this.selectedKeyframes.length; j++) {
            const origIdx = this.selectedKeyframes[j]
            const targetIdx = Math.max(0, Math.min(totalFrames - 1, origIdx + offsetXInFrames))
            if (i === targetIdx) {
              const info = this.originKeyInfo.get(origIdx)
              if (!info) return null
              // 返回关键帧信息，更新handle的位置
              return {
                isKey: info.isKey,
                handle: info.handle ? {
                  in: info.handle.in ? { 
                    dx: info.handle.in.dx, 
                    y: info.handle.in.y + offsetY 
                  } : undefined,
                  out: info.handle.out ? { 
                    dx: info.handle.out.dx, 
                    y: info.handle.out.y + offsetY 
                  } : undefined,
                  type: info.handle.type,
                } : null,
              }
            }
          }
          
          // 检查是否是原来的位置（移动走后应该变为非关键帧）
          if (offsetXInFrames !== 0 && this.selectedKeyframes.includes(i)) {
            return { isKey: false, handle: null }
          }
          
          // 保持原样
          const isKey = motionStore.isKeyframe(fieldName, i)
          const handle = isKey ? motionStore.getKeyframeHandle(fieldName, i) : null
          return {
            isKey,
            handle: handle ? {
              in: handle.in ? { dx: handle.in.x - i, y: handle.in.y } : undefined,
              out: handle.out ? { dx: handle.out.x - i, y: handle.out.y } : undefined,
              type: handle.type,
            } : null,
          }
        }
        
        this.preview.active = true
        this.preview.valueGetter = valueGetter
        this.preview.keyGetter = keyGetter
        this.preview.affectedStart = affectedStart
        this.preview.affectedEnd = affectedEnd
        
        pathPanel.value.handleUpDateData()
      },
      async handleEnd() {
        // 立即清除幽灵点
        if (pathPanel.value.clearGhostPoints) {
          pathPanel.value.clearGhostPoints()
        }
        
        if (!this.active) {
          this.resetPreview()
          return
        }

        if (!this.isDragging) {
          this.resetPreview()
          this.active = false
          return
        }
        
        const fieldName = selectedFieldStore.selectedFieldName as string
        if (!fieldName) {
          this.resetPreview()
          this.active = false
          return
        }
        
        const offsetXInFrames = this.currentOffsetX
        const offsetY = this.currentOffsetY
        
        // 如果没有移动，直接返回
        if (offsetXInFrames === 0 && Math.abs(offsetY) < 1e-9) {
          this.resetPreview()
          this.active = false
          return
        }
        
        const totalFrames = motionStore.getFrameCount()
        const minOrig = Math.min(...this.selectedKeyframes)
        const maxOrig = Math.max(...this.selectedKeyframes)
        
        windowStore.setOperatingText('正在移动关键帧...')
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // 1. 计算所有需要修改的帧
        const newKeyframesMap = new Map<number, number>() // targetIdx -> origIdx
        for (const origIdx of this.selectedKeyframes) {
          const targetIdx = Math.max(0, Math.min(totalFrames - 1, origIdx + offsetXInFrames))
          newKeyframesMap.set(targetIdx, origIdx)
        }
        
        const minNew = Math.min(...Array.from(newKeyframesMap.keys()))
        const maxNew = Math.max(...Array.from(newKeyframesMap.keys()))
        const affectedStart = Math.min(minOrig, minNew)
        const affectedEnd = Math.max(maxOrig, maxNew)
        
        // 2. 准备修改前和修改后的数据（用于撤销/重做）
        const beforeEntries: Array<{
          index: number
          value: number
          isKey: boolean
          handle: any
        }> = []
        
        const afterEntries: Array<{
          index: number
          value: number
          isKey: boolean
          handle: any
        }> = []
        
        // 记录影响范围内所有帧的原始状态
        for (let i = affectedStart; i <= affectedEnd; i++) {
          const value = motionStore.motionData?.parsed?.[i]?.[fieldName] ?? 0
          const isKey = motionStore.isKeyframe(fieldName, i)
          const handle = isKey ? motionStore.getKeyframeHandle(fieldName, i) : null
          
          beforeEntries.push({
            index: i,
            value,
            isKey,
            handle: handle ? {
              in: handle.in,
              out: handle.out,
              type: handle.type,
            } : null,
          })
        }
        
        // 3. 计算修改后的状态
        for (let i = affectedStart; i <= affectedEnd; i++) {
          // 检查当前帧是否是移动后的目标位置
          const origIdx = newKeyframesMap.get(i)
          if (origIdx !== undefined) {
            // 这是移动后的新位置
            const origValue = this.originValues.get(origIdx) ?? 0
            const newValue = origValue + offsetY
            const origInfo = this.originKeyInfo.get(origIdx)
            
            afterEntries.push({
              index: i,
              value: newValue,
              isKey: origInfo?.isKey ?? true,
              handle: origInfo?.handle ? {
                in: origInfo.handle.in ? {
                  x: i + origInfo.handle.in.dx,
                  y: origInfo.handle.in.y + offsetY,
                } : undefined,
                out: origInfo.handle.out ? {
                  x: i + origInfo.handle.out.dx,
                  y: origInfo.handle.out.y + offsetY,
                } : undefined,
                type: origInfo.handle.type,
              } : null,
            })
          } else if (offsetXInFrames !== 0 && this.selectedKeyframes.includes(i)) {
            // 这是原来的位置（已移走），变为非关键帧
            afterEntries.push({
              index: i,
              value: motionStore.motionData?.parsed?.[i]?.[fieldName] ?? 0,
              isKey: false,
              handle: null,
            })
          } else {
            // 其他帧保持不变
            const value = motionStore.motionData?.parsed?.[i]?.[fieldName] ?? 0
            const isKey = motionStore.isKeyframe(fieldName, i)
            const handle = isKey ? motionStore.getKeyframeHandle(fieldName, i) : null
            
            afterEntries.push({
              index: i,
              value,
              isKey,
              handle: handle ? {
                in: handle.in,
                out: handle.out,
                type: handle.type,
              } : null,
            })
          }
        }
        
        // 4. 应用修改（使用批量操作）
        withDrawStore.runWithoutRecord(() => {
          withDrawStore.applyFieldEntries(fieldName, afterEntries)
        })
        
        // 5. 记录到撤销重做栈
        withDrawStore.setOperationInfo('移动关键帧', fieldName)
        withDrawStore.pushFieldRangeMove(
          fieldName,
          minOrig,
          maxOrig,
          minNew,
          affectedStart,
          affectedEnd,
          beforeEntries,
          afterEntries
        )
        
        // 6. 更新选中状态为新位置
        pathPanel.value.selectedKeyframeIndices.clear()
        for (const origIdx of this.selectedKeyframes) {
          const targetIdx = Math.max(0, Math.min(totalFrames - 1, origIdx + offsetXInFrames))
          pathPanel.value.selectedKeyframeIndices.add(targetIdx)
        }
        
        // 7. 刷新显示
        handleCameraMove()
        pathPanel.value.handleUpDateData()
        jointPositionLine.value.handleUpdate()
        api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
        api.forceRender()
        
        try {
          let recomputeStart = Math.max(0, affectedStart - 2)
          let recomputeEnd = Math.min(totalFrames, affectedEnd + 2)

          if (this.selectedKeyframes.length > 0) {
            for (const origIdx of this.selectedKeyframes) {
              const targetIdx = Math.max(0, Math.min(totalFrames - 1, origIdx + offsetXInFrames))
              const range = buildHandleRecomputeRange(fieldName, targetIdx, 'out')
              recomputeStart = Math.min(recomputeStart, range.start)
              recomputeEnd = Math.max(recomputeEnd, range.end)
            }
          }

          viewer.value?.jointPositionLine3D?.compute(
            recomputeStart,
            recomputeEnd,
            motionStore.motionData?.parsed || []
          )
        } catch (err) {
        }
        
        this.resetPreview()
        this.active = false
        this.selectedKeyframes = []
        this.startMouseX = null
        this.startMouseY = null
        this.currentOffsetX = 0
        this.currentOffsetY = 0
        this.originValues.clear()
        this.originKeyInfo.clear()
        
        windowStore.setOperatingText('')
      },
      resetPreview() {
        this.preview.active = false
        this.preview.valueGetter = null
        this.preview.keyGetter = null
        this.preview.affectedStart = null
        this.preview.affectedEnd = null
        
        // 清除幽灵点
        if (pathPanel.value.clearGhostPoints) {
          pathPanel.value.clearGhostPoints()
        }
      },
    },
    /**
     * 删除当前帧并调整显示区间
     *
     * 删除当前播放帧的数据，并智能调整轨迹面板的显示区间，
     * 确保删除操作后面板仍能正常显示有效的数据范围。
     *
     * 调整逻辑：
     * 1. 如果删除的是显示区间的最后一帧，需要缩小显示区间
     * 2. 如果缩小后区间太小（少于30帧），则向前扩展区间
     * 3. 确保调整后的区间不会超出有效数据范围
     *
     * 这种智能调整让用户在删除帧时不会丢失对数据的可视化控制。
     */
    handleSmoothDelete(startIndex?: number, endIndex?: number) {
      if (!this.field) return

      // 1) 组装要处理的区间：优先使用选中关键帧的绝对索引（可能多段），否则使用框选区间，再否则使用当前帧
      const ranges: { start: number; end: number }[] = []
      const selectedKeys = Array.from(this.selectedKeyframeIndices || []).sort((a, b) => a - b)
      if (selectedKeys.length > 0) {
        let segStart = selectedKeys[0]
        let prev = selectedKeys[0]
        for (let i = 1; i < selectedKeys.length; i++) {
          const cur = selectedKeys[i]
          if (cur === prev + 1) {
            prev = cur
            continue
          }
          ranges.push({ start: segStart, end: prev })
          segStart = cur
          prev = cur
        }
        ranges.push({ start: segStart, end: prev })
      }
      const selection = this.rangeSelection.getSelectionRange()
      if (ranges.length === 0 && selection) {
        ranges.push({ start: selection.start, end: selection.end })
      }
      if (ranges.length === 0) {
        const safeStart = startIndex ?? motionStore.currentFrameIndex
        const safeEnd = endIndex ?? safeStart
        ranges.push({ start: safeStart, end: safeEnd })
      }

      // 2) 逐段取消关键帧并平滑
      let success = false
      let recomputeStart = Infinity
      let recomputeEnd = -Infinity
      for (const range of ranges) {
        const result = motionStore.smoothDeleteKeyframes(this.field, range.start, range.end)
        if (result?.success) {
          success = true
          const rs = result.rangeStart ?? range.start
          const re = result.rangeEnd ?? range.end
          recomputeStart = Math.min(recomputeStart, rs)
          recomputeEnd = Math.max(recomputeEnd, re)
        }
      }

      // 无成功则退出
      if (!success) return

      // 清理选区和计数
      this.rangeSelection.clearSelection()
      this.selectedKeyframeIndices.clear()
      this.selectionCount = 0

      // 3) 刷新数据与渲染
      pathPanel.value.handleUpDateData()
      jointPositionLine.value.handleUpdate()
      api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
      api.forceRender()
      viewer.value.jointPositionLine3D.setTotal(motionStore.frame_getNum() - 1)
      viewer.value.jointPositionLine3D.compute(
        motionStore.currentFrameIndex - 2,
        motionStore.frame_getNum() - 1,
        motionStore.motionData?.parsed || []
      )
      viewer.value.jointPositionLine3D.resetColor()
      pathPanel.value.frameValueControl.refresh()

      // 立即重算删除区间附近的关节位置线
      const total = motionStore.frame_getNum
        ? motionStore.frame_getNum()
        : motionStore.getFrameCount()
      const rs = Number.isFinite(recomputeStart) ? recomputeStart : ranges[0].start
      const re = Number.isFinite(recomputeEnd) ? recomputeEnd : ranges[ranges.length - 1].end
      const recomputeStartSafe = Math.max(0, Math.floor(rs) - 2)
      const recomputeEndSafe = Math.min(total - 1, Math.floor(re) + 1)
      jointLineComputeThrottler.request(true, { start: recomputeStartSafe, end: recomputeEndSafe })
    },
    handleDelete() {
      const currentIndex = motionStore.currentFrameIndex
      motionStore.deleteFrame(currentIndex)
      if (
        this.location.startFrameIndex + (this.location.size || 0) ===
        motionStore.getFrameCount()
      ) {
        if (this.location.size) this.location.size--
        if ((this.location.size || 0) < 30) {
          this.location.size = 30
          this.location.startFrameIndex--
          if (this.location.startFrameIndex < 0) {
            this.location.startFrameIndex = 0
          }
        }
      }
      pathPanel.value.handleUpDateData()
      viewer.value.jointPositionLine3D.setTotal(motionStore.frame_getNum() - 1)
      viewer.value.jointPositionLine3D.compute(
        motionStore.currentFrameIndex - 2,
        motionStore.frame_getNum() - 1,
        motionStore.motionData?.parsed || []
      )
      viewer.value.jointPositionLine3D.resetColor()
      pathPanel.value.frameValueControl.refresh()
    },
    /**
     * 保存当前关节的视图状态
     */
    saveCurrentViewState() {
      if (this.field === null) return
      
      // 保存当前关节的位置和缩放状态
      this.fieldViewStates.set(this.field, {
        location: {
          startFrameIndex: this.location.startFrameIndex,
          size: this.location.size,
        },
        yAxis: {
          center: this.yAxis.center,
          halfRange: this.yAxis.halfRange,
          initialized: this.yAxis.initialized,
          userOverride: this.yAxis.userOverride,
        },
      })
    },
    /**
     * 加载并显示指定字段的轨迹图表
     *
     * 这是轨迹面板最重要的方法，负责创建和配置整个轨迹图表系统。
     * 当用户点击数据面板中的某个关节字段时，这个方法会被调用。
     *
     * 主要功能：
     * 1. 字段过滤：排除不适合图表显示的字段类型
     * 2. 面板初始化：设置显示状态和清理旧数据
     * 3. 图表创建：使用图表库创建交互式曲线图
     * 4. 事件绑定：配置所有鼠标和键盘交互事件
     * 5. 动画处理：管理面板展开和收起动画
     *
     * 支持的交互：
     * - 拖拽绘制：直接在曲线上绘制新的轨迹
     * - 点击编辑：单击设置特定帧的数值
     * - 缩放滚动：Ctrl+滚轮缩放，滚轮左右移动
     * - 右键跳转：右键点击跳转到指定帧
     * - Y轴缩放：Ctrl+Shift+滚轮调整Y轴范围
     *
     * 这个方法将静态的数值数据转换为直观的可视化图表，
     * 是连接数据和用户交互的核心桥梁。
     */
    handleLoad(fieldName: string) {
      // 保存当前关节的视图状态（如果存在）
      this.saveCurrentViewState()
      
      // 优化5：如果切换了字段，清理旧缓存
      if (this.fieldDataCache.fieldName !== fieldName) {
        this.fieldDataCache.fieldName = null
        this.fieldDataCache.allData = []
        this.fieldDataCache.yAxisRange = null
      }
      
      if (this.field === null) {
        this.location.reset()
        this.move.resetMouseLocation()
      }
      if (this.show !== 2) {
        this.show = 1
      }
    // 确保快捷键已绑定（避免偶发未生效）
    this.bindHotkeys()
      if (this.destory) (this.destory as () => void)()

      this.field = fieldName

      // 判断字段类型
      let type = 2 // 默认为关节
      if (fieldName.startsWith('global_')) {
        type = 0 // 位置
      } else {
        if (robotModelStore.isBVH) {
          const adapt = motionStore.motionData?.bvhAdapt
          const orientationName =
            adapt && typeof adapt === 'object' ? (adapt as any).orientationFieldName : ''
          if (orientationName && fieldName.startsWith(`${orientationName}_`)) {
            type = 1 // 姿态
          }
        } else {
          if (fieldName.startsWith('quater_')) {
            type = 1 // 姿态
          }
        }
      }
      this.selectedFieldType = type

      this.limitLines = resolveLimitLines(fieldName)
      ensureAutoTurnKeyframes(fieldName)
      this.move.pointInfo = null
      
      // 切换关节时清除选中的关键帧和框选区域
      this.selectedKeyframeIndices.clear()
      this.selectionCount = 0
      this.keyframe.setSelectedByFrame(null)
      this.rangeSelection.clearSelection()

      // 切换关节后重新绑定快捷键，确保处理器状态最新
      this.bindHotkeys()

      // 优化3：首次加载时，缓存全部数据和Y轴范围
      const fullRangeData = selectedFieldStore.getCurrentFieldData(0, motionStore.getFrameCount())
      this.fieldDataCache.fieldName = fieldName
      this.fieldDataCache.allData = fullRangeData.data as number[]
      
      // 检查是否有保存的视图状态
      const savedState = this.fieldViewStates.get(fieldName)
      
      if (savedState) {
        // 恢复之前保存的视图状态
        this.location.startFrameIndex = savedState.location.startFrameIndex
        this.location.size = savedState.location.size
        this.yAxis.center = savedState.yAxis.center
        this.yAxis.halfRange = savedState.yAxis.halfRange
        this.yAxis.initialized = savedState.yAxis.initialized
        this.yAxis.userOverride = savedState.yAxis.userOverride
      } else {
        // 没有保存的状态，使用默认值
        this.location.toDefault()
        const initialFitValues = this.limitLines.length
          ? this.fieldDataCache.allData.concat(this.limitLines)
          : this.fieldDataCache.allData
        this.yAxis.fit(initialFitValues)
      }
      
      this.fieldDataCache.yAxisRange = this.yAxis.getRange()
      this.chart.refresh()
      const data = selectedFieldStore.getCurrentFieldData(
        this.location.startFrameIndex,
        this.location.size
      )

      setTimeout(() => {
        // 计算Y轴范围：如果有limit使用limit，否则根据实际数据自动计算
        const { min: yMin, max: yMax } = this.yAxis.getRange()

        const re = createLineChart(document.getElementById('path-board-chart') as HTMLElement, {
          yMin: yMin,
          yMax: yMax,
          data: data.data as number[],
          limitLines: this.limitLines,
          color: 'rgb(138,162,255)',
          theme: themeStore.isDark ? 'dark' : 'light',
          selectedKeyframe: pathPanel.value.keyframe.selected.relative,
          xLabels: (() => {
            let re: number[] = []
            for (
              let i = this.location.startFrameIndex;
              i < this.location.startFrameIndex + (this.location.size as number);
              i++
            ) {
              re.push(i + 1)
            }
            return re
          })(),
          onHover: (e: any) => {
            // 如果正在拖拽选中的关键帧，处理移动
            if (pathPanel.value.keyframeDragMove.active) {
              pathPanel.value.keyframeDragMove.handleMove(e)
              return
            }
            this.move.handleMove(e)
            pathPanel.value.frameDrag.handleHover(e)
          },
          onLeftDown: (e: ChartEvent) => {
            // 优先检查是否点击了已选中的关键帧（用于拖拽移动）
            if (typeof e?.xLabel === 'number' && e.isKeyframe) {
              const clickedIndex = Math.max(0, Math.round(e.xLabel - 1))
              const startedDrag = pathPanel.value.keyframeDragMove.handleStart(e, clickedIndex)
              if (startedDrag) return
            }
            
            // Alt + Shift: 片段移动
            const dragged = pathPanel.value.frameDrag.handleStart(e)
            if (dragged) return
          },
          onMouseUp: () => {
            if (pathPanel.value.keyframeDragMove.active) {
              pathPanel.value.keyframeDragMove.handleEnd()
              return
            }
            if (pathPanel.value.frameDrag.active) {
              pathPanel.value.frameDrag.handleEnd()
              return
            }
          },
          onCtrlWheel: (e: any) => {
            this.location.handleScale(e)
          },
          onCtrlShiftWheel: (e: any) => {
            this.handleVerticalZoom(e)
          },
          onWheel: (e: any) => {
            this.handleUniformZoom(e)
          },
          onShiftWheel: (e: any) => {
            this.handleVerticalPan(e)
          },
          onSelectionChange: (count: number) => {
            pathPanel.value.selectionCount = count
          },
          onBlankClick: (e: any) => {
            this.move.handleBlankClick(e)
          },
          onPointClick: (e: any) => {
            this.move.handlePointClick(e)
          },
          onClick: (e: any) => {
            this.move.handleClick(e)
          },
          onRightDown: (_e: { xLabel: number; yValue: number }) => {
            // 右键按下不再触发绘制/拖动
          },
          onMouseLeave: () => {
            this.move.resetMouseLocation()
            if (pathPanel.value.rangeSelection.active) {
              pathPanel.value.rangeSelection.handleEnd()
              pathPanel.value.move.moving = false
              pathPanel.value.move.isPreview = false
              pathPanel.value.move.maxXLabel = -1 as any
              pathPanel.value.move.minXLabel = 99999 as any
              return
            }
            this.move.handleEnd()
          },
          onMiddleDown: (payload: ChartEvent) => pathPanel.value.middlePan.handleStart(payload),
          onMiddleDrag: (payload: ChartEvent) => pathPanel.value.middlePan.handleMove(payload),
          onMiddleUp: (payload: ChartEvent) => pathPanel.value.middlePan.handleEnd(),
          onHandleDragStart: (payload: any) => pathPanel.value.keyframe.handleDrag.start(payload),
          onHandleDrag: (payload: any) => pathPanel.value.keyframe.handleDrag.move(payload),
          onHandleDragEnd: (payload: any) => pathPanel.value.keyframe.handleDrag.end(payload),
        })
        pathPanel.value.clearKeyframeSelection = () => {
          ;(re as any).clearKeyframeSelection?.()
          pathPanel.value.selectionCount = 0
          pathPanel.value.selectedKeyframeIndices.clear()
        }
        pathPanel.value.setSelectionChangeListener = (cb: (count: number) => void) => {
          ;(re as any).setSelectionChangeListener?.(cb)
        }
        ;(re as any).setSelectionChangeListener?.((count: number) => {
          pathPanel.value.selectionCount = count
          // 当图表内部选择变化时，反向更新绝对索引集合
          if (typeof (re as any).getSelectedKeyframes === 'function') {
            const relatives = (re as any).getSelectedKeyframes() as number[]
            pathPanel.value.selectedKeyframeIndices.clear()
            const start = pathPanel.value.location.startFrameIndex
            relatives.forEach(rel => {
              pathPanel.value.selectedKeyframeIndices.add(start + rel)
            })
          }
        })

        const handleKeyframeHotkey = (event: KeyboardEvent) => {
          if (!event.key || event.key.toLowerCase() !== 'k') return
          const target = event.target as HTMLElement | null
          if (target) {
            const tag = target.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
          }
          if (pathPanel.value.show !== 2) return
          if (!pathPanel.value.field) return
          pathPanel.value.keyframe.toggleCurrent()
        }
        const handleDeleteHotkey = (event: KeyboardEvent) => {
          if (event.key !== 'Delete') return
          const target = event.target as HTMLElement | null
          if (target) {
            const tag = target.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
          }
          if (pathPanel.value.show !== 2) return
          if (!pathPanel.value.field) return
          event.preventDefault()
          const selection = pathPanel.value.rangeSelection.getSelectionRange()
          if (selection) {
            pathPanel.value.handleSmoothDelete(selection.start, selection.end)
            return
          }
          if (!motionStore.isKeyframe(pathPanel.value.field, motionStore.currentFrameIndex)) return
          pathPanel.value.handleSmoothDelete(
            motionStore.currentFrameIndex,
            motionStore.currentFrameIndex
          )
        }
        const handleEscHotkey = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') return
          const target = event.target as HTMLElement | null
          if (target) {
            const tag = target.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
          }
          if (pathPanel.value.show !== 2) return
          // ESC：等价于点击面板顶部的“取消选择(叉号)”
          // - 优先取消“已选关键帧”
          // - 若没有关键帧选择，再取消框选区间
          if (pathPanel.value.selectionCount > 0) {
            pathPanel.value.clearKeyframeSelection?.()
            return
          }
          pathPanel.value.rangeSelection.clearSelection()
          pathPanel.value.rangeSelection.updateVisual()
        }
        const handleYAxisHotkey = (event: KeyboardEvent) => {
          if (!(event.ctrlKey && (event.code === 'ArrowUp' || event.code === 'ArrowDown'))) return
          const target = event.target as HTMLElement | null
          if (target) {
            const tag = target.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
          }
          if (pathPanel.value.show !== 2) return
          if (!pathPanel.value.field) return
          event.preventDefault()
          const anchor = pathPanel.value.move.currentY ?? pathPanel.value.yAxis.center
          const multiplier = event.code === 'ArrowUp' ? 0.85 : 1.15
          pathPanel.value.yAxis.zoom(multiplier, anchor)
          pathPanel.value.handleUpDateData()
          pathPanel.value.saveCurrentViewState()
        }
        const handleFocusSelectionHotkey = (event: KeyboardEvent) => {
          const key = (event.key || '').toLowerCase()
          const code = event.code
          const isMainDot = key === '.' || code === 'Period'
          const isNumpadDot =
            code === 'NumpadDecimal' &&
            (key === '.' || key === 'decimal' || event.getModifierState?.('NumLock'))
          if (!isMainDot && !isNumpadDot) return
          const target = event.target as HTMLElement | null
          if (target) {
            const tag = target.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
          }
          if (pathPanel.value.show !== 2) return
          if (!pathPanel.value.field) return
          if (pathPanel.value.selectedKeyframeIndices.size === 0) return
          event.preventDefault()
          pathPanel.value.zoomToSelectedKeyframes?.()
        }
        const handleDragHotkeyRelease = (event: KeyboardEvent) => {
          if (!pathPanel.value.frameDrag.active) return
          if (!event.altKey || !event.shiftKey) {
            pathPanel.value.frameDrag.handleEnd()
            pathPanel.value.move.moving = false
            pathPanel.value.move.isPreview = false
          }
        }
        // 先解除旧的快捷键绑定，防止叠加
        pathPanel.value.unbindHotkeys()
        
        // 保存处理器并集中绑定，避免重复绑定或漏绑定
        pathPanel.value.hotkeyHandlers = {
          keyframe: handleKeyframeHotkey,
          delete: handleDeleteHotkey,
          esc: handleEscHotkey,
          yAxis: handleYAxisHotkey,
          focusSelection: handleFocusSelectionHotkey,
          dragRelease: handleDragHotkeyRelease,
        }
        pathPanel.value.bindHotkeys()
        onUnmounted(() => {
          pathPanel.value.unbindHotkeys()
          pathPanel.value.middlePan.handleEnd()
          handleDragScheduler.flush(pathPanel)
        })

        watch(
          () => themeStore.isDark,
          () => {
            if (pathPanel.value.show > 0) {
              pathPanel.value.keyframe.update()
            }
          }
        )
        this.updateData = re.updateData
        const destroyChart = typeof re.destroy === 'function' ? re.destroy : () => {}
        this.destory = () => {
          // 1. 解绑快捷键监听器（关键！避免事件监听器泄露）
          this.unbindHotkeys()
          
          // 2. 销毁图表
          destroyChart()
          
          // 3. 清空函数引用
          this.setKeyframes = null
          this.setKeyframeColor = null
          this.setHandles = null
          this.setSelectedKeyframe = null
          this.setPreviewTransform = null
          this.clearPreviewTransform = null
          this.updateData = null
          
          // 4. 清理全局引用（避免内存泄露）
          if ((window as any).__pathPanelStore__ === this) {
            delete (window as any).__pathPanelStore__
          }
        }
        this.setMarker = re.setMarker
        this.applyOptions = re.applyOptions
        this.setYAxis = re.setYAxis
        this.setYFlip = re.setYFlip
        this.setTheme = re.setTheme
        this.setKeyframes = typeof re.setKeyframes === 'function' ? re.setKeyframes : null
        this.setKeyframeColor =
          typeof re.setKeyframeColor === 'function' ? re.setKeyframeColor : null
        this.setHandles = typeof re.setHandles === 'function' ? (re.setHandles as any) : null
        this.setSelectedKeyframe =
          typeof re.setSelectedKeyframe === 'function' ? re.setSelectedKeyframe : null
        this.setSelectedKeyframes =
          typeof re.setSelectedKeyframes === 'function' ? re.setSelectedKeyframes : null
        this.setSelectionRange =
          typeof re.setSelectionRange === 'function' ? re.setSelectionRange : null
        this.setPreviewTransform =
          typeof (re as any).setPreviewTransform === 'function'
            ? (re as any).setPreviewTransform
            : null
        this.clearPreviewTransform =
          typeof (re as any).clearPreviewTransform === 'function'
            ? (re as any).clearPreviewTransform
            : null
        this.setGhostPoints =
          typeof (re as any).setGhostPoints === 'function'
            ? (re as any).setGhostPoints
            : null
        this.clearGhostPoints =
          typeof (re as any).clearGhostPoints === 'function'
            ? (re as any).clearGhostPoints
            : null
        const setMarkerIfVisible = () => {
          if (!this.setMarker) return
          const start = this.location.startFrameIndex
          const size =
            typeof this.location.size === 'number' ? this.location.size : motionStore.getFrameCount()
          const end = start + size - 1
          const cur = motionStore.currentFrameIndex
          if (cur >= start && cur <= end) {
            this.setMarker(cur + 1)
          } else {
            this.setMarker(null)
          }
        }

        setMarkerIfVisible()
        this.handleUpDateData()
        this.keyframe.update()
        // 移除自动选中逻辑：加载字段时不自动选中当前关键帧
        // 只有用户主动点击关键帧圆点时才会选中
        if (pathPanel.value.yFlip.enable) {
          pathPanel.value.yFlip.change(true)
        }
        if (this.show === 2) return
        this.show = 2
        setTimeout(() => {
          handleModifyWindowsLocation()
          handleViewerSizeChange()
        }, 100)
      }, 10)
    },
    /**
     * 隐藏轨迹面板
     *
     * 关闭当前显示的轨迹图表，清理相关状态，并触发收起动画。
     * 这个方法确保面板关闭时的平滑过渡和完整的状态清理。
     *
     * 处理步骤：
     * 1. 清空当前选中的字段
     * 2. 开始收起动画
     * 3. 延迟完成隐藏并清理状态
     * 4. 通知其他组件调整布局
     */
    handleHide() {
      this.field = null
      this.selectedFieldType = null
      this.show = 1
      this.middlePan.handleEnd()
      this.keyframe.setSelectedByFrame(null)
      this.move.pointInfo = null
      this.selectedKeyframeIndices.clear()
      this.setKeyframes?.([])
      this.setHandles?.({})
      this.setSelectedKeyframe?.(null)
      this.unbindHotkeys()
      setTimeout(() => {
        this.show = 0
        selectedFieldStore.handleRemoveSelect()
        handleViewerSizeChange()
      }, 300)
    },

    /**
     * 快速显示面板（不加载数据）
     *
     * 用于快速展开轨迹面板但不加载具体的图表数据，
     * 通常用于界面布局调整或预备显示状态。
     */
    handleShowWithLoad() {
      this.show = 1
      setTimeout(() => {
        this.show = 2
        handleViewerSizeChange()
      }, 10)
    },
    /**
     * Y轴显示范围控制系统（键盘）
     */
    yAxis: createYAxisController(),
    handleVerticalPan(event: ChartEvent) {
      if (!event || typeof event.delta !== 'number') return
      const deltaRatio = event.delta / 120 || 0
      if (deltaRatio === 0) return
      const range = Math.max(
        pathPanel.value.yAxis.halfRange || pathPanel.value.yAxis.minHalfRange,
        pathPanel.value.yAxis.minHalfRange
      )
      const panAmount = deltaRatio * range * 0.2
      pathPanel.value.yAxis.pan(panAmount)
      pathPanel.value.handleUpDateData()
      pathPanel.value.saveCurrentViewState()
    },
    handleVerticalZoom(event: ChartEvent) {
      if (!event || typeof event.delta !== 'number') return
      const multiplier = event.delta > 0 ? 1.15 : 0.85
      const anchorCandidate =
        typeof event.yAtCursor === 'number' ? event.yAtCursor : pathPanel.value.move.currentY
      const anchor = anchorCandidate ?? pathPanel.value.yAxis.center
      pathPanel.value.yAxis.zoom(multiplier, anchor)
      pathPanel.value.handleUpDateData()
      pathPanel.value.saveCurrentViewState()
    },
    /**
     * 同步缩放：同时缩放 X/Y，不会单轴拉伸
     */
    handleUniformZoom(event: ChartEvent) {
      if (!event || typeof event.delta !== 'number') return
      const zoomIn = event.delta < 0
      const factor = zoomIn ? 0.9 : 1.1

      // X 轴缩放（基于当前鼠标位置为锚点）
      let xChanged = false
      const currentStartBackup = pathPanel.value.location.startFrameIndex
      const currentSizeBackup = pathPanel.value.location.size
      if (typeof pathPanel.value.location.size === 'number') {
        const totalFrames = motionStore.getFrameCount()
        const currentSize = pathPanel.value.location.size as number
        const mouseLabel = typeof event.xLabel === 'number' ? event.xLabel - 1 : motionStore.currentFrameIndex
        const anchorIndex = Math.min(Math.max(0, Math.round(mouseLabel)), Math.max(0, totalFrames - 1))
        let nextSize = Math.round(currentSize * factor)
        nextSize = clampDisplaySize(nextSize, totalFrames)
        const anchorRatio =
          currentSize === 0 ? 0 : (anchorIndex - pathPanel.value.location.startFrameIndex) / currentSize
        let nextStart = Math.round(anchorIndex - anchorRatio * nextSize)
        const maxStart = Math.max(0, totalFrames - nextSize)
        if (nextStart < 0) nextStart = 0
        if (nextStart > maxStart) nextStart = maxStart
        xChanged = nextSize !== currentSize || nextStart !== pathPanel.value.location.startFrameIndex
        pathPanel.value.location.startFrameIndex = nextStart
        pathPanel.value.location.size = nextSize
      }

      // 如果 X 无法再缩放（已到边界），则不缩放 Y，保持比例
      if (xChanged) {
        const anchorY =
          typeof event.yAtCursor === 'number'
            ? event.yAtCursor
            : pathPanel.value.move.currentY ?? pathPanel.value.yAxis.center
        pathPanel.value.yAxis.zoom(factor, anchorY)
      } else {
        // 恢复原始，以防无意义的 set
        pathPanel.value.location.startFrameIndex = currentStartBackup
        pathPanel.value.location.size = currentSizeBackup
      }

      if (xChanged) {
        pathPanel.value.handleUpDateData()
        pathPanel.value.saveCurrentViewState()
      }
    },
    resetYAxis() {
      if (!this.field) return
      const dataAll = selectedFieldStore.getCurrentFieldData(0, motionStore.getFrameCount())
      this.yAxis.fit(dataAll.data as number[])
      this.handleUpDateData()
      this.saveCurrentViewState()
    },
    isYAxisDefault() {
      return !this.yAxis.userOverride
    },
    /**
     * 将视图聚焦到已选关键帧的最小包围范围
     *
     * - X轴：以所选关键帧的最小/最大帧为基础，添加轻微边距并保持最小窗口尺寸
     * - Y轴：仅根据所选关键帧的数值范围自适应
     */
    zoomToSelectedKeyframes() {
      if (!this.field) return
      if (!this.selectedKeyframeIndices || this.selectedKeyframeIndices.size === 0) return

      const totalFrames = motionStore.getFrameCount()
      if (!Number.isFinite(totalFrames) || totalFrames <= 0) return

      const selected = Array.from(this.selectedKeyframeIndices)
        .filter(idx => Number.isFinite(idx))
        .map(idx => Math.max(0, Math.min(totalFrames - 1, Math.round(idx as number))))
        .sort((a, b) => a - b)

      if (selected.length === 0) return

      const minIndex = selected[0]
      const maxIndex = selected[selected.length - 1]
      const span = Math.max(1, maxIndex - minIndex + 1)
      const padding = Math.max(2, Math.floor(span * 0.1))

      let start = Math.max(0, minIndex - padding)
      let size = Math.max(1, Math.min(totalFrames, span + padding * 2))

      if (start + size > totalFrames) {
        start = Math.max(0, totalFrames - size)
      }

      const minWindow = Math.min(MIN_DISPLAY_FRAMES, totalFrames)
      if (size < minWindow) {
        const extra = minWindow - size
        start = Math.max(0, start - Math.floor(extra / 2))
        size = minWindow
        if (start + size > totalFrames) {
          start = Math.max(0, totalFrames - size)
        }
      }

      size = clampDisplaySize(size, totalFrames)
      if (maxIndex - start + 1 > size) {
        start = Math.max(0, maxIndex - size + 1)
      }
      if (start + size > totalFrames) {
        start = Math.max(0, totalFrames - size)
      }

      const fieldData = selectedFieldStore.getCurrentFieldData(0, totalFrames)
      const dataArr = Array.isArray(fieldData?.data) ? (fieldData.data as number[]) : []
      const selectedValues = selected
        .map(idx => dataArr[idx])
        .filter(val => typeof val === 'number' && Number.isFinite(val))

      const currentStart = this.location.startFrameIndex
      const currentSize = typeof this.location.size === 'number' ? (this.location.size as number) : totalFrames
      const currentCenter = this.yAxis.center
      const currentHalf = this.yAxis.halfRange

      let targetCenter = currentCenter
      let targetHalf = currentHalf
      if (selectedValues.length > 0) {
        const prevCenter = this.yAxis.center
        const prevHalf = this.yAxis.halfRange
        this.yAxis.fit(selectedValues)
        targetCenter = this.yAxis.center
        targetHalf = this.yAxis.halfRange
        // 还原，后面用动画过渡
        this.yAxis.center = prevCenter
        this.yAxis.halfRange = prevHalf
      }

      if (zoomAnimRaf !== null) {
        caf(zoomAnimRaf)
        zoomAnimRaf = null
      }

      const duration = 280
      const startTs = getHighResTime()
      const startStart = currentStart
      const startSize = currentSize
      const startCenter = this.yAxis.center
      const startHalf = this.yAxis.halfRange

      const animate = () => {
        const progress = Math.min(1, (getHighResTime() - startTs) / duration)
        const t = easeOutCubic(progress)

        const nextStart = Math.round(lerp(startStart, start, t))
        const nextSize = Math.max(1, Math.round(lerp(startSize, size, t)))
        const nextCenter = lerp(startCenter, targetCenter, t)
        const nextHalf = Math.max(this.yAxis.minHalfRange, lerp(startHalf, targetHalf, t))

        const clampedWindow = clampDisplayWindow(nextStart, nextSize, totalFrames)
        this.location.startFrameIndex = clampedWindow.start
        this.location.size = clampedWindow.size
        this.yAxis.center = nextCenter
        this.yAxis.halfRange = nextHalf
        this.yAxis.initialized = true
        this.yAxis.userOverride = true

        this.handleUpDateData()
        this.move.resetMouseContainerLocation()

        if (progress < 1) {
          zoomAnimRaf = raf(animate)
        } else {
          zoomAnimRaf = null
          // 动画完成后保存视图状态
          pathPanel.value.saveCurrentViewState()
        }
      }

      animate()
    },
    /**
     * X轴（时间轴）显示区间控制系统
     *
     * 管理轨迹图表X轴的显示范围，提供类似于视频编辑软件时间轴的缩放和滚动功能。
     * 让用户可以专注于特定时间段的动作细节，或者查看整体动作流程。
     *
     * 核心功能：
     * 1. 时间轴缩放：放大查看细节，缩小查看全局
     * 2. 时间轴滚动：左右移动查看不同时间段
     * 3. 滚动条控制：提供可视化的时间轴导航
     * 4. 边缘拖拽：精确调整显示区间的起始和结束位置
     * 5. 智能边界：自动处理边界情况和数据范围限制
     *
     * 交互方式：
     * - Ctrl+滚轮：以鼠标位置为中心进行缩放
     * - 普通滚轮：左右滚动时间轴
     * - 拖拽滚动条：快速跳转到任意时间段
     * - 拖拽边缘：精确调整显示区间大小
     *
     * 这个系统让用户可以像使用专业视频编辑软件一样精确控制时间轴的观察范围。
     */
    location: {
      changeSize: 50,
      startFrameIndex: 0,
      size: undefined,
      toDefault() {
        this.startFrameIndex = 0
        const total = motionStore.getFrameCount()
        this.size = clampDisplaySize(total, total)
      },
      isFullDisplay() {
        if (this.startFrameIndex === 0 && this.size === motionStore.getFrameCount()) return true
        return false
      },
      reset() {
        this.startFrameIndex = 0
        const total = motionStore.getFrameCount()
        this.size = clampDisplaySize(total, total)
        pathPanel.value.handleUpDateData()
      },
      /**
       * X轴智能缩放控制器
       *
       * 实现以鼠标位置为中心的时间轴缩放功能，类似于专业图表软件的缩放体验。
       *
       * 核心算法：
       * 1. 记录鼠标当前X位置（帧数）作为缩放中心点
       * 2. 计算鼠标位置在当前显示区间中的比例
       * 3. 根据滚轮方向调整显示帧数范围
       * 4. 重新计算起始帧位置，保持鼠标位置相对不变
       * 5. 应用边界限制，确保不超出有效数据范围
       *
       * 用户体验：
       * - 放大：鼠标位置保持不变，显示更少帧但更详细
       * - 缩小：鼠标位置保持不变，显示更多帧但更概览
       *
       * 这种"以鼠标为中心"的缩放方式让用户可以精确控制想要观察的时间段。
       */
      handleScale(change: WheelEventWithDelta) {
        if (this.size === undefined) return
        const delta = typeof change?.delta === 'number' ? change.delta : 0
        if (!Number.isFinite(delta) || delta === 0) return
        const totalFrames = motionStore.getFrameCount()
        const currentSize = this.size as number
        const mouseLabel = (pathPanel.value.move.currentX ?? 0) - 1
        const anchorIndex = Number.isFinite(mouseLabel)
          ? Math.min(Math.max(0, Math.round(mouseLabel)), Math.max(0, totalFrames - 1))
          : motionStore.currentFrameIndex
        const magnitude = Math.min(5, Math.abs(delta) / 240)
        const baseFactor = 1 + magnitude * 0.2
        const factor = delta > 0 ? baseFactor : 1 / baseFactor
        let nextSize = Math.round(currentSize * factor)
        nextSize = clampDisplaySize(nextSize, totalFrames)
        const anchorRatio =
          currentSize === 0 ? 0 : (anchorIndex - this.startFrameIndex) / currentSize
        let nextStart = Math.round(anchorIndex - anchorRatio * nextSize)
        const maxStart = Math.max(0, totalFrames - nextSize)
        if (nextStart < 0) nextStart = 0
        if (nextStart > maxStart) nextStart = maxStart
        if (nextStart === this.startFrameIndex && nextSize === currentSize) return
        this.startFrameIndex = nextStart
        this.size = nextSize
        pathPanel.value.handleUpDateData()
        pathPanel.value.move.resetMouseContainerLocation()
        pathPanel.value.saveCurrentViewState()
      },
      /**
       * X轴平移控制器
       *
       * 实现时间轴的左右平移功能，保持显示范围大小不变。
       * 类似于地图应用中的平移操作，让用户可以查看不同的时间段。
       *
       * 功能特点：
       * 1. 保持显示帧数不变
       * 2. 整体左右移动显示窗口
       * 3. 自动边界检测和调整
       * 4. 平滑的移动体验
       *
       * 使用场景：
       * - 查看动作的不同时间段
       * - 在保持缩放级别的同时移动观察位置
       * - 快速定位到感兴趣的时间区间
       */
      handleMove(change: any) {
        if (this.size === undefined) return
        const delta = typeof change?.delta === 'number' ? change.delta : 0
        if (!Number.isFinite(delta) || delta === 0) return
        const direction = delta > 0 ? 1 : -1
        const magnitude = Math.min(4, Math.abs(delta) / 120)
        const baseStep = Math.max(1, Math.round((this.size as number) * 0.15))
        const moveFrames = Math.max(1, Math.round(baseStep * magnitude)) * direction
        const totalFrames = motionStore.getFrameCount()
        const maxStart = Math.max(0, totalFrames - (this.size as number))
        let nextStart = this.startFrameIndex + moveFrames
        if (nextStart < 0) nextStart = 0
        if (nextStart > maxStart) nextStart = maxStart
        if (nextStart === this.startFrameIndex) return
        this.startFrameIndex = nextStart
        pathPanel.value.handleUpDateData()
        pathPanel.value.move.resetMouseContainerLocation()
        pathPanel.value.saveCurrentViewState()
      },
      handleKeyboardPan(direction: number) {
        if (this.size === undefined) return
        if (!direction || !Number.isFinite(direction)) return
        const step = Math.max(1, Math.round((this.size as number) * 0.2))
        const totalFrames = motionStore.getFrameCount()
        const maxStart = Math.max(0, totalFrames - (this.size as number))
        let nextStart = this.startFrameIndex + step * Math.sign(direction)
        if (nextStart < 0) nextStart = 0
        if (nextStart > maxStart) nextStart = maxStart
        if (nextStart === this.startFrameIndex) return
        this.startFrameIndex = nextStart
        pathPanel.value.handleUpDateData()
        pathPanel.value.move.resetMouseContainerLocation()
        pathPanel.value.saveCurrentViewState()
      },
      handleKeyboardZoom(direction: number, anchorIndex?: number) {
        if (this.size === undefined) return
        if (!direction || !Number.isFinite(direction)) return
        const totalFrames = motionStore.getFrameCount()
        const currentSize = this.size as number
        const factor = direction > 0 ? 1.2 : 1 / 1.2
        let nextSize = Math.round(currentSize * factor)
        nextSize = clampDisplaySize(nextSize, totalFrames)
        const anchor =
          typeof anchorIndex === 'number' && Number.isFinite(anchorIndex)
            ? Math.min(Math.max(0, Math.round(anchorIndex)), Math.max(0, totalFrames - 1))
            : motionStore.currentFrameIndex
        const anchorRatio = currentSize === 0 ? 0 : (anchor - this.startFrameIndex) / currentSize
        let nextStart = Math.round(anchor - anchorRatio * nextSize)
        const maxStart = Math.max(0, totalFrames - nextSize)
        if (nextStart < 0) nextStart = 0
        if (nextStart > maxStart) nextStart = maxStart
        if (nextStart === this.startFrameIndex && nextSize === currentSize) return
        this.startFrameIndex = nextStart
        this.size = nextSize
        pathPanel.value.handleUpDateData()
        pathPanel.value.move.resetMouseContainerLocation()
        pathPanel.value.saveCurrentViewState()
      },

      scrollContainerWidth: 0,
      // 控制底部滚动条是否禁用过渡动画（中键拖动时关闭）
      disableScrollAnim: false,
      refreshScrollContainerWidth() {
        const scrollContainer = document.getElementById('path-board-scroll-bar')
        if (scrollContainer) {
          this.scrollContainerWidth = scrollContainer.clientWidth
        }
      },
      getScrollSizePer() {
        if (this.size === undefined) return 1
        return this.size / motionStore.getFrameCount()
      },
      getScrollPer() {
        if (motionStore.getFrameCount() - (this.size as number) === 0) return 0
        return this.startFrameIndex / (motionStore.getFrameCount() - (this.size as number))
      },
      getScrollLeft() {
        const containerWidth = this.scrollContainerWidth
        const scrollWidthPer = this.getScrollSizePer()
        const scrollPer = this.getScrollPer()
        return containerWidth * (1 - scrollWidthPer) * scrollPer
      },

      /**
       * X轴滚动条拖拽控制器
       *
       * 处理用户拖拽时间轴滚动条滑块的交互，实现快速跳转到任意时间段。
       * 类似于视频播放器的进度条拖拽功能。
       *
       * 功能特点：
       * 1. 实时拖拽反馈
       * 2. 精确的位置计算
       * 3. 边界检测和限制
       * 4. 平滑的拖拽体验
       *
       * 这种交互方式让用户可以快速定位到动作的任意时间点。
       */
      mousemove: {
        moving: false,
        lastX: null,
        handleStart() {
          this.moving = true
          this.lastX = null
          // 拖动时禁用动画，让滚动条实时跟随鼠标
          pathPanel.value.location.disableScrollAnim = true
        },
        handleEnd() {
          this.moving = false
          // 恢复动画
          pathPanel.value.location.disableScrollAnim = false
          // 滚动条拖动结束后保存视图状态
          pathPanel.value.saveCurrentViewState()
        },
        handleMove(e) {
          if (pathPanel.value.location.edge.moving) return
          if (!this.moving) return
          if (this.lastX === null) {
            this.lastX = e.x
          } else {
            const c = e.x - this.lastX
            this.lastX = e.x
            const containerWidth = pathPanel.value.location.scrollContainerWidth
            const scrollSizePer = pathPanel.value.location.getScrollSizePer()
            const spaceWidth = containerWidth * (1 - scrollSizePer)
            const changedPer = c / spaceWidth
            const moveFrameNum =
              motionStore.getFrameCount() - (pathPanel.value.location.size as number)
            const changedFrameNum =
              Math.abs(parseInt(`${moveFrameNum * changedPer}`)) < 1
                ? c < 0
                  ? -1
                  : 1
                : parseInt(`${moveFrameNum * changedPer}`)
            let nextStartFrame = pathPanel.value.location.startFrameIndex + changedFrameNum
            if (nextStartFrame < 0) nextStartFrame = 0
            if (
              nextStartFrame >
              motionStore.getFrameCount() - (pathPanel.value.location.size as number)
            )
              nextStartFrame =
                motionStore.getFrameCount() - (pathPanel.value.location.size as number)
            pathPanel.value.location.startFrameIndex = nextStartFrame
            pathPanel.value.handleUpDateData()
          }
        },
      },

      /**
       * X轴滚动条边缘拖拽控制器
       *
       * 允许用户通过拖拽时间轴滚动条的左右边缘来调整显示区间的大小。
       * 类似于窗口调整大小的操作，提供直观的时间范围调整体验。
       *
       * 交互方式：
       * - 拖拽左边缘：调整显示区间的起始时间
       * - 拖拽右边缘：调整显示区间的结束时间
       * - 实时反馈：拖拽过程中立即更新图表显示
       *
       * 这种交互方式让用户可以精确控制想要观察的时间范围。
       */
      edge: {
        lastX: 0,
        isLeft: false,
        moving: false,
        startEndIndex: 0,
        startLeftIndex: 0,
        handleStart(e: MouseEvent, isLeft = false) {
          this.lastX = e.x
          this.isLeft = isLeft
          this.moving = true
          this.startEndIndex =
            pathPanel.value.location.startFrameIndex + (pathPanel.value.location.size || 0) - 1
          this.startLeftIndex = pathPanel.value.location.startFrameIndex
          // 拖动边缘时禁用动画，让操作更流畅
          pathPanel.value.location.disableScrollAnim = true
        },
        handleEnd() {
          this.moving = false
          // 恢复动画
          pathPanel.value.location.disableScrollAnim = false
          // 边缘拖动结束后保存视图状态
          pathPanel.value.saveCurrentViewState()
        },
        handleMove(e: MouseEvent) {
          if (this.moving === false || this.lastX === null) return
          const pathBoardScrollBar = document.getElementById('path-board-scroll-bar')
          if (pathBoardScrollBar === null) return
          const scrollBarWidth = (pathBoardScrollBar as HTMLElement).clientWidth
          const changedWidth = e.x - this.lastX
          this.lastX = e.x
          const changedPer = changedWidth / scrollBarWidth
          const totalFrameNum = motionStore.frame_getNum()
          let changedFrame = parseFloat(`${changedPer * totalFrameNum}`)
          if (changedFrame > 0) {
            if (changedFrame < 1) changedFrame = 1
          } else {
            if (changedFrame > -1) changedFrame = -1
          }
          changedFrame = parseInt(`${changedFrame}`)
          if (isNaN(pathPanel.value.location.startFrameIndex)) {
            pathPanel.value.location.startFrameIndex = 0
          }
          if (this.isLeft) {
            const toStartFrameIndex = pathPanel.value.location.startFrameIndex + changedFrame
            const toSize = this.startEndIndex - toStartFrameIndex + 1
            if (toStartFrameIndex < 0) return
            if (toSize < MIN_DISPLAY_FRAMES) return
            const limitedSize = clampDisplaySize(toSize, totalFrameNum)
            const minStart = Math.max(0, this.startEndIndex - limitedSize + 1)
            const nextStart = Math.max(minStart, toStartFrameIndex)
            const nextSize = clampDisplaySize(this.startEndIndex - nextStart + 1, totalFrameNum)
            pathPanel.value.location.startFrameIndex = nextStart
            pathPanel.value.location.size = nextSize
          } else {
            const toEndIndex =
              this.startLeftIndex + (pathPanel.value.location.size || 0) - 1 + changedFrame
            const toSize = toEndIndex - this.startLeftIndex + 1
            if (toSize < MIN_DISPLAY_FRAMES) return
            const availableTotal = Math.max(0, totalFrameNum - this.startLeftIndex)
            const limitedSize = clampDisplaySize(toSize, availableTotal || totalFrameNum)
            const nextSize = Math.min(limitedSize, availableTotal)
            if (nextSize <= 0) return
            pathPanel.value.location.size = nextSize
          }
          pathPanel.value.handleUpDateData()
        },
      },
    },

    multiple: {
      moving: false,
      lastY: 0,
      position: 0,
      startInfo: null as { data: number[]; info: any } | null,
      selection: null as { start: number; end: number } | null,
      mode: 0,
      showMenu: false,
      handleStart(e) {
        const selection = pathPanel.value.rangeSelection.getSelectionRange()
        if (!selection || !selectedFieldStore.selectedFieldName) return
        this.moving = true
        this.lastY = e.y
        this.position = 0
        const series = motionStore.getFieldSeries(selectedFieldStore.selectedFieldName as string)
        this.startInfo = {
          data: Array.isArray(series?.data) ? (series?.data as number[]).slice() : [],
          info: series?.info ?? null,
        }
        this.selection = { start: selection.start, end: selection.end }
        // 清理可能存在的预览
        pathPanel.value.frameDrag.resetPreview()
      },
      async handleEnd() {
        const fieldName = selectedFieldStore.selectedFieldName as string
        const selection = this.selection
        if (!this.moving || !selection) {
          pathPanel.value.frameDrag.resetPreview()
          this.position = 0
          this.selection = null
          return
        }
        this.moving = false
        const baseData = this.startInfo?.data
        const jointInfo =
          this.startInfo?.info || api.robot.joint.getSingleInfo(selectedFieldStore.selectedFieldName as string)
        const scrollBar = document.getElementById('path-board-scroll-bar-right') as HTMLElement
        if (!fieldName || !baseData || !scrollBar || !jointInfo?.limit) {
          pathPanel.value.frameDrag.resetPreview()
          this.position = 0
          this.startInfo = null
          this.selection = null
          return
        }

        const scrollBarHeight = scrollBar.clientHeight || 1
        const changedPer = this.position / (scrollBarHeight / -2)
        const scale = Math.pow(2, changedPer)
        let offset = 0
        if (this.mode === 1) {
          const per = changedPer * (pathPanel.value.yFlip.enable ? -1 : 1)
          offset = per > 0 ? per * jointInfo.limit.upper : per * Math.abs(jointInfo.limit.lower)
        }

        const start = Math.max(0, Math.min(selection.start, selection.end))
        const end = Math.min(baseData.length - 1, Math.max(selection.start, selection.end))
        if (start > end) {
          pathPanel.value.frameDrag.resetPreview()
          this.position = 0
          this.startInfo = null
          this.selection = null
          return
        }

        withDrawStore.setOperationInfo(this.mode === 0 ? '轨迹缩放' : '轨迹平移', fieldName)
        windowStore.setOperatingText('正在应用修改...')
        await new Promise(resolve => setTimeout(resolve, 50))
        for (let i = start; i <= end; i++) {
          const v = baseData[i]
          if (typeof v !== 'number' || Number.isNaN(v)) continue
          let next = this.mode === 0 ? v * scale : v + offset
          if (next > jointInfo.limit.upper) next = jointInfo.limit.upper
          if (next < jointInfo.limit.lower) next = jointInfo.limit.lower
          motionStore.setFrameFieldValue(i, fieldName, next)
        }

        pathPanel.value.frameDrag.resetPreview()
        this.position = 0
        this.startInfo = null
        this.selection = null
        api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
        api.forceRender()
        try {
          const total = motionStore.frame_getNum ? motionStore.frame_getNum() - 1 : motionStore.getFrameCount() - 1
          const computeStart = Math.max(0, start - 2)
          const computeEnd = total
          viewer.value?.jointPositionLine3D?.setTotal?.(total)
          viewer.value?.jointPositionLine3D?.compute?.(
            computeStart,
            computeEnd,
            motionStore.motionData?.parsed || []
          )
          viewer.value?.jointPositionLine3D?.resetColor?.()
          jointPositionLine.value?.handleUpdate?.()
        } catch (err) {
          console.warn(err)
        }
        pathPanel.value.handleUpDateData()
        windowStore.setOperatingText('')
      },
      handleMove(e) {
        if (!this.moving) return
        const selection = this.selection
        if (!selection) return
        const scrollBar = document.getElementById('path-board-scroll-bar-right') as HTMLElement
        if (!scrollBar) return
        const jointInfo =
          this.startInfo?.info || api.robot.joint.getSingleInfo(selectedFieldStore.selectedFieldName as string)
        if (!jointInfo || !jointInfo.limit) return
        const changedPX = e.y - this.lastY
        this.lastY = e.y
        const scrollBarHeight = scrollBar.clientHeight || 1
        let newPosition = this.position + changedPX
        if (newPosition > scrollBarHeight / 2) newPosition = scrollBarHeight / 2
        if (newPosition < scrollBarHeight / -2) newPosition = scrollBarHeight / -2
        this.position = newPosition
        const changedPer = newPosition / (scrollBarHeight / -2)
        const previewScale = Math.pow(2, changedPer)
        let previewOffset = 0
        if (this.mode === 1) {
          const per = changedPer * (pathPanel.value.yFlip.enable ? -1 : 1)
          previewOffset =
            per > 0 ? per * jointInfo.limit?.upper : per * Math.abs(jointInfo.limit?.lower)
        }
        const baseData = this.startInfo?.data
        if (!baseData || !Array.isArray(baseData)) return
        const preview = pathPanel.value.frameDrag.preview
        const start = Math.max(0, Math.min(selection.start, selection.end))
        const end = Math.min(baseData.length - 1, Math.max(selection.start, selection.end))
        preview.active = true
        preview.affectedStart = start
        preview.affectedEnd = end
        preview.selection = { start, end }
        preview.valueGetter = (i: number) => {
          const v = baseData[i]
          if (typeof v !== 'number' || Number.isNaN(v)) return v
          if (i < start || i > end) return v
          let next = this.mode === 0 ? v * previewScale : v + previewOffset
          if (next > jointInfo.limit.upper) next = jointInfo.limit.upper
          if (next < jointInfo.limit.lower) next = jointInfo.limit.lower
          return next
        }
        preview.keyGetter = null
        pathPanel.value.handleUpDateData()
      },
    },
    /**
     * 轨迹面板数据更新核心方法
     *
     * 这是轨迹面板最重要的数据同步方法，负责将所有状态变化反映到图表显示上。
     * 每当显示区间、Y轴范围、或数据内容发生变化时都会调用此方法。
     *
     * 主要功能：
     * 1. 边界检查：确保显示区间在有效数据范围内
     * 2. 数据获取：从状态管理器获取当前区间的数据
     * 3. 图表更新：更新图表的数据、轴范围、标签等
     * 4. 标记同步：更新当前帧的红线标记位置
     * 5. 滚动条同步：更新X轴和Y轴滚动条状态
     *
     * 这个方法确保了轨迹面板的所有视觉元素与数据状态保持完全同步。
     */
    handleUpDateData() {
      this.chart.refresh()
      const totalFrames = motionStore.getFrameCount()
      const currentSize =
        typeof this.location.size === 'number' ? (this.location.size as number) : totalFrames
      this.location.size = clampDisplaySize(currentSize, totalFrames)
      const maxStart = Math.max(0, totalFrames - (this.location.size as number))
      if (this.location.startFrameIndex > maxStart) {
        this.location.startFrameIndex = maxStart
      }
      if (this.location.startFrameIndex < 0) {
        this.location.startFrameIndex = 0
      }
      
      // 优化2：只获取可见区间数据
      const data = selectedFieldStore.getCurrentFieldData(
        this.location.startFrameIndex,
        this.location.size
      )
      
      // 优化2 & 4：使用缓存的全部数据，不再重新获取
      let allValues = this.fieldDataCache.allData
      
      // 检查keyframeDragMove预览
      const keyframeDragPreview = this.keyframeDragMove.preview
      const keyframeDragActive =
        keyframeDragPreview.active &&
        keyframeDragPreview.valueGetter &&
        typeof keyframeDragPreview.affectedStart === 'number' &&
        typeof keyframeDragPreview.affectedEnd === 'number' &&
        this.field === selectedFieldStore.selectedFieldName
      
      // 检查frameDrag预览
      const preview = this.frameDrag.preview
      const previewActive =
        preview.active &&
        preview.valueGetter &&
        typeof preview.affectedStart === 'number' &&
        typeof preview.affectedEnd === 'number' &&
        this.field === selectedFieldStore.selectedFieldName

      // 优化4：只在有预览时才复制数组
      if (keyframeDragActive) {
        const modifiedValues = [...allValues]
        for (let i = keyframeDragPreview.affectedStart as number; i <= (keyframeDragPreview.affectedEnd as number); i++) {
          const val = keyframeDragPreview.valueGetter!(i)
          if (val !== null) {
            modifiedValues[i] = val
          }
        }
        allValues = modifiedValues
      } else if (previewActive) {
        const modifiedValues = [...allValues]
        for (let i = preview.affectedStart as number; i <= (preview.affectedEnd as number); i++) {
          modifiedValues[i] = preview.valueGetter!(i)
        }
        allValues = modifiedValues
      }
      // 如果没有预览，直接使用缓存的 allValues，不复制
      
      // Y轴自适应：只在未初始化或用户未手动调整时重新计算
      if (!this.yAxis.initialized || !this.yAxis.userOverride) {
        const fitValues = this.limitLines.length ? allValues.concat(this.limitLines) : allValues
        this.yAxis.fit(fitValues)
      }
      const { min: yMin, max: yMax } = this.yAxis.getRange()

      let displayData = data.data as number[]
      
      // 应用keyframeDragMove预览到显示数据
      if (keyframeDragActive) {
        displayData = (data.data as number[]).slice()
        const startFrame = this.location.startFrameIndex
        for (let i = 0; i < displayData.length; i++) {
          const globalIdx = startFrame + i
          if (
            globalIdx >= (keyframeDragPreview.affectedStart as number) &&
            globalIdx <= (keyframeDragPreview.affectedEnd as number)
          ) {
            const val = keyframeDragPreview.valueGetter!(globalIdx)
            if (val !== null) {
              displayData[i] = val
            }
          }
        }
      } else if (previewActive) {
        // 应用frameDrag预览到显示数据
        displayData = (data.data as number[]).slice()
        const startFrame = this.location.startFrameIndex
        for (let i = 0; i < displayData.length; i++) {
          const globalIdx = startFrame + i
          if (
            globalIdx >= (preview.affectedStart as number) &&
            globalIdx <= (preview.affectedEnd as number)
          ) {
            displayData[i] = preview.valueGetter!(globalIdx)
          }
        }
      }

      if (this.applyOptions)
        this.applyOptions({
          yMin: yMin,
          yMax: yMax,
          data: displayData,
          limitLines: this.limitLines,
          xLabels: (() => {
            let re: number[] = []
            for (
              let i = this.location.startFrameIndex;
              i < this.location.startFrameIndex + (this.location.size as number);
              i++
            ) {
              re.push(i + 1)
            }
            return re
          })(),
        })
      if (this.setMarker) {
        const start = this.location.startFrameIndex
        const size =
          typeof this.location.size === 'number' ? this.location.size : motionStore.getFrameCount()
        const end = start + size - 1
        const cur = motionStore.currentFrameIndex
        if (cur >= start && cur <= end) {
          this.setMarker(cur + 1)
        } else {
          this.setMarker(null)
        }
      }
      this.keyframe.update()
      this.rangeSelection.updateVisual()

      // 同步选中的关键帧（绝对索引 -> 相对索引）
      if (this.setSelectedKeyframes && this.selectedKeyframeIndices.size > 0) {
        const start = this.location.startFrameIndex
        const size =
          typeof this.location.size === 'number' ? this.location.size : motionStore.getFrameCount()
        const end = start + size
        const relativeIndices: number[] = []
        
        // 如果正在拖拽关键帧预览，显示移动后的位置
        if (keyframeDragActive && this.keyframeDragMove.selectedKeyframes.length > 0) {
          const offsetX = this.keyframeDragMove.currentOffsetX
          const totalFrames = motionStore.getFrameCount()
          this.keyframeDragMove.selectedKeyframes.forEach(origIdx => {
            const newIdx = Math.max(0, Math.min(totalFrames - 1, origIdx + offsetX))
            if (newIdx >= start && newIdx < end) {
              relativeIndices.push(newIdx - start)
            }
          })
        } else {
          // 正常情况，显示当前选中的关键帧
          this.selectedKeyframeIndices.forEach(absIndex => {
            if (absIndex >= start && absIndex < end) {
              relativeIndices.push(absIndex - start)
            }
          })
        }
        this.setSelectedKeyframes(relativeIndices)
      } else if (this.setSelectedKeyframes) {
        this.setSelectedKeyframes([])
      }

      if (previewActive && preview.selection && this.setSelectionRange) {
        const startFrame = this.location.startFrameIndex
        const visStart = Math.max(preview.selection.start, startFrame)
        const visEnd = Math.min(
          preview.selection.end,
          startFrame + (this.location.size ?? motionStore.getFrameCount()) - 1
        )
        if (visEnd >= visStart) {
          this.setSelectionRange({
            start: visStart - startFrame,
            end: visEnd - startFrame,
          })
        }
      }

      this.frameValueControl.refresh()
      this.location.refreshScrollContainerWidth()
    },

    /**
     * 复制当前帧数据
     *
     * 在当前播放位置插入一个与当前帧完全相同的新帧，
     * 用于创建静止动作或延长特定姿态的持续时间。
     *
     * 应用场景：
     * - 创建动作中的停顿效果
     * - 延长关键姿态的展示时间
     * - 为后续编辑提供更多的时间空间
     */
    handleCopy() {
      motionStore.duplicateCurrentFrame()
      setTimeout(() => {
        this.handleUpDateData()
        viewer.value.jointPositionLine3D.setTotal(motionStore.frame_getNum() - 1)
        viewer.value.jointPositionLine3D.compute(
          motionStore.currentFrameIndex - 2,
          motionStore.frame_getNum() - 1,
          motionStore.motionData?.parsed || []
        )
        viewer.value.jointPositionLine3D.resetColor()
      }, 10)
    },
  })
  
  // 确保快捷键在面板显示时自动绑定/隐藏时解绑，防止意外失效
  watch(
    () => pathPanel.value.show,
    show => {
      if (show && show > 0) {
        pathPanel.value.bindHotkeys?.()
      } else {
        pathPanel.value.unbindHotkeys?.()
      }
    }
  )

  watch(
    () => [motionStore.currentFrameIndex, pathPanel.value.field, motionStore.motionData],
    () => {
      pathPanel.value.frameValueControl.refresh()
    }
  )

  // 注册到 window 对象，供撤销重做使用
  ;(window as any).__pathPanelStore__ = pathPanel.value
  
  return pathPanel
}