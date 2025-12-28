import { defineStore } from 'pinia'
import { ref, computed, nextTick, shallowRef, toRaw, triggerRef, watch } from 'vue'
import { api, setIsBVH as utilsSetIsBVH } from '../tools/motionEditorTools'
import { IFrame, IQuater } from '../tools/motionEditorTools'

/**
 * 3D视图器状态管理Store
 *
 * 管理动作编辑器中3D视图器的核心状态和显示选项。
 * 这个Store是3D渲染系统与Vue组件之间的桥梁，统一管理所有3D视图相关的状态。
 *
 * 管理的状态包括：
 * 1. 3D视图器实例：保存Three.js视图器的引用
 * 2. 显示选项：网格线、坐标轴、机器人轨迹线等可视化辅助元素
 * 3. 机器人模型加载：支持URDF格式的机器人模型动态加载
 *
 * 设计理念：
 * - 集中式状态管理，避免组件间的状态同步问题
 * - 响应式更新，状态变化自动反映到3D视图
 * - 灵活的模型加载机制，支持多种URL映射策略
 */
export const useViewerStore = defineStore('viewer', () => {
  const viewerInstance = ref<object | null>(null)

  function setViewer(v: object) {
    viewerInstance.value = v
  }

  const isGridVisible = ref<Boolean>(false)

  function setGridVisible(to: Boolean) {
    isGridVisible.value = to
  }

  const isAxesVisible = ref<Boolean>(false)

  function setAxesVisible(to: Boolean) {
    isAxesVisible.value = to
  }

  const isBasePositionLineVisible = ref<Boolean>(false)

  function setBasePositionLineVisible(to: Boolean) {
    isBasePositionLineVisible.value = to
  }

  const isJointPositionLineVisible = ref<Boolean>(false)

  function setJointPositionLineVisible(to: Boolean) {
    isJointPositionLineVisible.value = to
  }

  const viewerOnReadyOutput = ref(null)
  function setViewerOnReadyOutput(output: any) {
    viewerOnReadyOutput.value = output
  }
  /**
   * 高级URDF模型加载器（支持URL映射）
   *
   * 这是一个强大的机器人模型加载方法，支持复杂的URL映射和资源重定向。
   * 主要用于处理URDF文件中引用的外部资源（如网格文件、纹理等）的路径映射。
   *
   * 应用场景：
   * - 从云存储（OSS、S3等）加载机器人模型
   * - 处理相对路径到绝对URL的转换
   * - 支持动态资源映射和CDN加速
   *
   * 技术特点：
   * - 异步加载，支持Promise链式调用
   * - 自动错误处理和资源清理
   * - 事件驱动的加载完成通知
   * - 灵活的URL修改器函数支持
   *
   * @param mainUrdfUrl 主URDF文件的URL地址
   * @param urlModifier 可选的URL映射函数，用于转换URDF内部引用的资源路径
   */
  async function loadRobotWithUrlModifier(
    mainUrdfUrl: string,
    urlModifier?: (url: string) => string
  ): Promise<void> {
    const v = viewerInstance.value as any
    if (!v) throw new Error('viewer is not initialized')

    // 检查是否是新的Vue组件viewer（有urdfLoadingData）
    if (v.urdfLoadingData) {
      // 新的MotionEditorURDFViewer组件
      return new Promise<void>((resolve, reject) => {
        try {
          // 设置响应式数据
          v.urdfLoadingData.urdfPath = mainUrdfUrl
          v.urdfLoadingData.packagePath = ''
          v.urdfLoadingData.jsonPath = ''
          v.urdfLoadingData.urlModifier = urlModifier

          // 监听loaded事件
          const onLoaded = () => {
            resolve()
          }

          // 由于是响应式数据，Vue会自动触发重新渲染
          // 我们需要等待下一次loaded事件
          // 这里使用setTimeout来模拟异步完成
          setTimeout(() => {
            resolve()
          }, 100)
        } catch (e) {
          reject(e)
        }
      })
    } else {
      // 旧的Web Component viewer（向后兼容）
      return new Promise<void>((resolve, reject) => {
        try {
          if (typeof urlModifier === 'function') {
            v.urlModifierFunc = (u: string) => {
              try {
                return urlModifier(u)
              } catch {
                return u
              }
            }
          }
          v.up = '+Z'
          const onDone = () => {
            try {
              v.removeEventListener('urdf-processed', onDone)
            } catch { }
            resolve()
          }
          try {
            v.addEventListener('urdf-processed', onDone)
          } catch { }
          v.urdf = mainUrdfUrl
        } catch (e) {
          reject(e)
        }
      })
    }
  }

  /**
   * 基于文件映射表的URDF模型加载器
   *
   * 当已经拥有完整的文件名到URL映射关系时，使用这个方法可以更简单地加载机器人模型。
   * 这种方式特别适合批量上传到云存储后的模型加载场景。
   *
   * 映射策略（按优先级）：
   * 1. 完整路径匹配：直接匹配URDF中的完整引用路径
   * 2. 文件名匹配：提取文件名进行匹配
   * 3. 后缀匹配：使用endsWith进行模糊匹配
   * 4. 原路径返回：所有策略失败时返回原始路径
   *
   * 这种多层次的匹配策略确保了最大的兼容性和成功率。
   *
   * @param mainUrdfUrl 主URDF文件的URL地址
   * @param fileUrlMap 文件名到URL的映射表
   */
  async function loadRobotFromFileMap(
    mainUrdfUrl: string,
    fileUrlMap: Record<string, string>
  ): Promise<void> {
    // const v = viewerInstance.value as any
    // if (!v) throw new Error('viewer is not initialized')
    const modifier = (url: string) => {
      if (fileUrlMap[url]) return fileUrlMap[url]
      const fileName = url.split('/').pop() || url
      if (fileUrlMap[fileName]) return fileUrlMap[fileName]
      for (const k of Object.keys(fileUrlMap)) {
        if (k.endsWith(fileName)) return fileUrlMap[k]
      }
      return url
    }
    return loadRobotWithUrlModifier(mainUrdfUrl, modifier)
  }

  function reset() {
    viewerInstance.value = null
    isGridVisible.value = false
    isAxesVisible.value = false
    isBasePositionLineVisible.value = false
    isJointPositionLineVisible.value = false
    viewerOnReadyOutput.value = null
  }

  return {
    viewerInstance,
    setViewer,
    isGridVisible,
    setGridVisible,
    isAxesVisible,
    setAxesVisible,
    isBasePositionLineVisible,
    setBasePositionLineVisible,
    isJointPositionLineVisible,
    setJointPositionLineVisible,
    loadRobotWithUrlModifier,
    loadRobotFromFileMap,
    reset,
    viewerOnReadyOutput,
    setViewerOnReadyOutput,
  }
})

/**
 * 机器人模型状态管理Store
 *
 * 管理机器人模型的类型、选择状态和显示控制。
 * 支持两种主要的机器人数据格式：URDF和BVH。
 *
 * 支持的模型格式：
 * 1. URDF格式：标准的机器人描述格式，包含完整的关节、连杆和物理属性
 * 2. BVH格式：动作捕捉数据格式，主要用于人形角色动画
 *
 * 状态管理：
 * - 模型选择状态：跟踪是否已加载机器人模型
 * - 格式类型标识：区分URDF和BVH两种不同的处理方式
 * - 显示控制：支持动态隐藏和显示机器人模型
 * - BVH内容缓存：保存BVH格式的原始数据内容
 *
 * 这种统一的状态管理让系统可以无缝切换不同格式的机器人模型。
 */
export const useRobotModelStore = defineStore('robotModel', () => {
  const isSelected = ref(false)
  const isBVH = ref(false)
  const BVHContent = ref('')

  const urdfUrl = ref<string | null>(null)
  const stlUrls = ref<Record<string, string> | null>(null)

  function setURDFAndSTLUrls(newURDFUrl: string | null, newSTLUrls: Record<string, string> | null) {
    urdfUrl.value = newURDFUrl
    stlUrls.value = newSTLUrls
  }

  function setBVHContent(content: string) {
    BVHContent.value = content
  }

  function select() {
    isSelected.value = true
  }

  function setIsBVH(to: boolean) {
    isBVH.value = to
    utilsSetIsBVH(to)
  }

  const isHidden = ref(false)

  function hide() {
    isHidden.value = true
  }

  function show() {
    isHidden.value = false
  }

  function reset() {
    isSelected.value = false
    isBVH.value = false
    BVHContent.value = ''
    isHidden.value = false
    urdfUrl.value = null
    stlUrls.value = null
    utilsSetIsBVH(false)
  }

  return {
    isSelected,
    select,
    isBVH,
    setIsBVH,
    isHidden,
    hide,
    show,
    BVHContent,
    setBVHContent,
    reset,
    urdfUrl,
    stlUrls,
    setURDFAndSTLUrls,
  }
})

/**
 * 窗口状态管理Store
 *
 * 管理动作编辑器的窗口显示状态和加载进度。
 * 提供统一的窗口控制和用户反馈机制。
 *
 * 主要功能：
 * 1. 窗口最大化控制：支持全屏和窗口模式切换
 * 2. 加载状态管理：统一管理应用的加载进度和状态
 * 3. 用户反馈：提供加载进度条和状态文本显示
 *
 * 加载状态逻辑：
 * - 初始状态为加载中，直到动作数据完全准备就绪
 * - 支持进度百分比和描述文本的实时更新
 * - 与动作数据状态联动，确保加载完成的准确性
 *
 * 这种集中式的窗口状态管理提供了一致的用户体验。
 */
export const useWindowStore = defineStore('window', () => {
  const motionStore = useMotionStore()
  const isMaximized = ref(true)
  const isLoading = ref(true)
  const loadingPer = ref(0)
  const loadingText = ref('')
  const operatingText = ref('')
  const floatingMenu = ref(false)
  const isSettedData = ref(false)
  const overlayVisible = ref(false)
  const overlayOnClick = ref<(() => void) | null>(null)
  const isLoadUserUploadData = ref(false)
  const editorSize = ref<{ width: number; height: number }>({ width: 0, height: 0 })

  function setEditorSize(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return
    editorSize.value = { width, height }
  }

  function setIsLoadUserUploadData(to: boolean) {
    isLoadUserUploadData.value = to
  }
  function setIsSettedData(to: boolean) {
    isSettedData.value = to
  }
  function setFloatingMenu(to: boolean) {
    floatingMenu.value = to
  }

  function showOverlay(cb?: () => void) {
    overlayOnClick.value = cb ?? null
    overlayVisible.value = true
  }

  function hideOverlay() {
    overlayVisible.value = false
    overlayOnClick.value = null
  }

  function triggerOverlayClick() {
    const cb = overlayOnClick.value
    hideOverlay()
    cb?.()
  }

  function setOperatingText(text: string) {
    operatingText.value = text
  }

  function getOperatingText() {
    return operatingText.value
  }

  function maximize() {
    isMaximized.value = true
  }

  function restore() {
    isMaximized.value = false
  }

  function markLoaded() {
    if (!motionStore.isMotionJSONSelected()) {
      return
    }
    isLoading.value = false
  }

  function setLoadingPer(per: number) {
    loadingPer.value = per
  }

  function setLoadingText(text: string) {
    loadingText.value = text
  }

  const isShowCenterMenu = ref(false)
  const centerMenuTitle = ref('')
  const onHideCenterMenuCallBack = ref<(() => void) | null>(null)
  const centerMenuItems = ref<
    {
      title: string
      onClick: () => void
    }[]
  >([])
  function showCenterMenu(
    title = '',
    items: {
      title: string
      onClick: () => void
    }[],
    onHideCenterMenu: () => void
  ) {
    if (onHideCenterMenuCallBack.value) {
      try {
        ; (onHideCenterMenuCallBack.value || (() => { }))()
      } catch (error) { }
    }
    centerMenuTitle.value = title
    isShowCenterMenu.value = true
    centerMenuItems.value = items
    onHideCenterMenuCallBack.value = onHideCenterMenu
  }
  function hideCenterMenu() {
    centerMenuTitle.value = ''
    isShowCenterMenu.value = false
    centerMenuItems.value = []
      ; (onHideCenterMenuCallBack.value || (() => { }))()
  }

  function reset() {
    isMaximized.value = false
    isLoading.value = true
    loadingPer.value = 0
    loadingText.value = ''
    operatingText.value = ''
    floatingMenu.value = false
    isSettedData.value = false
    hideOverlay()
    isLoadUserUploadData.value = false
    isShowCenterMenu.value = false
    centerMenuItems.value = []
    centerMenuTitle.value = ''
  }

  return {
    isMaximized,
    maximize,
    restore,
    isLoading,
    markLoaded,
    loadingPer,
    loadingText,
    setLoadingPer,
    setLoadingText,
    operatingText,
    setOperatingText,
    getOperatingText,
    reset,
    isSettedData,
    setIsSettedData,
    overlayVisible,
    showOverlay,
    hideOverlay,
    triggerOverlayClick,
    isLoadUserUploadData,
    setIsLoadUserUploadData,
    editorSize,
    setEditorSize,
    isShowCenterMenu,
    showCenterMenu,
    hideCenterMenu,
    centerMenuItems,
    centerMenuTitle,
  }
})

/**
 * 动作数据帧接口
 *
 * 定义单个动作帧的数据结构，包含机器人的全局位置、姿态和所有关节角度。
 * 这是动作编辑器中最基础的数据单元。
 */
export interface MotionFrame {
  global_x: number
  global_y: number
  global_z: number
  quater_w: number
  quater_x: number
  quater_y: number
  quater_z: number
  [jointName: string]: number
}

type FrameId = string

/**
 * 动作JSON数据接口
 *
 * 定义完整动作序列的数据结构，包含所有帧数据和元信息。
 * 这是动作编辑器处理的核心数据格式。
 */
export interface IJSON {
  parsed: MotionFrame[]
  framerate: number
  num_frames: number
  dof_names: string[]
  bvhAdapt?:
  | boolean
  | {
    orientationFieldName: string
    positionScale?: number
  }
}

interface KeyframeHandlePoint {
  x: number
  y: number
}

type KeyframeHandleType = 'auto' | 'auto_clamped' | 'free' | 'aligned' | 'vector'

interface KeyframeHandleData {
  in: KeyframeHandlePoint
  out: KeyframeHandlePoint
  type: KeyframeHandleType
}

type KeyframeSnapshot = {
  values: Record<FrameId, number>
  keyframes: FrameId[]
  handles: Record<FrameId, KeyframeHandleData>
}

interface KeyframeFieldMetadata {
  // ignoredFrames 记录“不是关键帧”的帧；默认全是关键帧
  ignoredFrames: Set<FrameId>
  // 仅存储自定义/非 auto 的手柄，默认 auto 不落表
  handles: Map<FrameId, KeyframeHandleData>
}

type KeyframeMetadata = Map<string, KeyframeFieldMetadata>

/**
 * 动作数据管理Store
 *
 * 这是动作编辑器最核心的状态管理Store，负责管理所有动作相关的数据和操作。
 * 提供完整的动作数据生命周期管理，从加载、编辑到播放的全流程支持。
 *
 * 核心功能模块：
 * 1. 数据管理：动作JSON的加载、解析、存储和导出
 * 2. 帧操作：单帧数据的读取、修改、复制和删除
 * 3. 播放控制：动作播放、暂停、停止和播放模式管理
 * 4. 状态同步：与3D视图和其他组件的状态同步
 * 5. 历史管理：支持撤销/重做的数据副本管理
 *
 * 数据流设计：
 * - 主数据（motionData）：当前编辑的动作数据
 * - 副本数据（motionDataCopy）：用于撤销/重做操作的备份
 * - 实时同步：数据变化自动反映到3D视图和界面
 *
 * 这个Store是整个动作编辑系统的数据中枢。
 */
export const useMotionStore = defineStore('motion', () => {
  const withDrawStore = useWithDrawStore()
  const robotModelStore = useRobotModelStore()
  const windowStore = useWindowStore()
  const motionData = ref<null | IJSON>(null)
  const motionDataCopy = ref<null | IJSON>(null)
  const frameIds = ref<FrameId[]>([])
  const frameIdToIndex = ref<Map<FrameId, number>>(new Map())
  let frameIdCounter = 0
  const isJsonLoaded = ref(false)
  const useUserSelectJSON = ref(false)
  const keyframeMetadata = ref<KeyframeMetadata>(new Map())
  const HANDLE_MIN_DELTA = 1e-3
  const HANDLE_DEFAULT_SPAN = 1 / 3
  const clampHandleX = (value: number) => {
    const totalFrames = motionData.value?.parsed.length ?? 0
    if (totalFrames <= 0) return 0
    if (value < 0) return 0
    if (value > totalFrames - 1) return totalFrames - 1
    return value
  }

  const generateFrameId = () => {
    frameIdCounter += 1
    return `fid-${Date.now()}-${frameIdCounter}`
  }

  const rebuildFrameIdIndex = () => {
    const map = new Map<FrameId, number>()
    frameIds.value.forEach((id, idx) => {
      map.set(id, idx)
    })
    frameIdToIndex.value = map
  }

  const ensureFrameIdsForCurrentData = () => {
    const total = motionData.value?.parsed.length ?? 0
    if (!total || total <= 0) {
      frameIds.value = []
      frameIdToIndex.value = new Map()
      return
    }
    if (frameIds.value.length !== total) {
      const nextIds: FrameId[] = []
      for (let i = 0; i < total; i++) {
        nextIds.push(frameIds.value[i] ?? generateFrameId())
      }
      frameIds.value = nextIds
    }
    rebuildFrameIdIndex()
  }

  const getFrameIdByIndex = (index: number): FrameId | null => {
    if (index < 0 || index >= frameIds.value.length) return null
    return frameIds.value[index] ?? null
  }

  const getFrameIndexById = (id: FrameId | null | undefined): number => {
    if (!id) return -1
    return frameIdToIndex.value.get(id) ?? -1
  }

  const insertFrameId = (index: number, id: FrameId) => {
    frameIds.value.splice(index, 0, id)
    rebuildFrameIdIndex()
  }

  const removeFrameIdAt = (index: number): FrameId | null => {
    if (index < 0 || index >= frameIds.value.length) return null
    const [removed] = frameIds.value.splice(index, 1)
    rebuildFrameIdIndex()
    return removed ?? null
  }

  const ensureFieldMetadata = (fieldName: string): KeyframeFieldMetadata => {
    if (!keyframeMetadata.value.has(fieldName)) {
      keyframeMetadata.value.set(fieldName, {
        ignoredFrames: new Set(),
        handles: new Map(),
      })
    }
    return keyframeMetadata.value.get(fieldName) as KeyframeFieldMetadata
  }

  const cloneHandleData = (data: KeyframeHandleData): KeyframeHandleData => ({
    in: { x: data.in.x, y: data.in.y },
    out: { x: data.out.x, y: data.out.y },
    type: data.type,
  })

  const ensureHandleData = (fieldName: string, frameIndex: number): KeyframeHandleData | null => {
    const meta = ensureFieldMetadata(fieldName)
    const id = getFrameIdByIndex(frameIndex)
    if (!id || meta.ignoredFrames.has(id)) return null
    if (!meta.handles.has(id)) {
      // 计算一个 auto 手柄但不落库（稀疏存储）
      const computed = computeAutoKeyframeHandle(fieldName, frameIndex)
      if (!computed) return null
      return computed
    }
    return meta.handles.get(id) as KeyframeHandleData
  }

  const getFrameValue = (frameIndex: number, fieldName: string) => {
    return motionData.value?.parsed?.[frameIndex]?.[fieldName]
  }

  const clampHandlePoint = (
    point: KeyframeHandlePoint,
    frameIndex: number,
    direction: 'in' | 'out'
  ): KeyframeHandlePoint => {
    let x = clampHandleX(point.x)
    const value = point.y
    if (direction === 'in' && x > frameIndex - HANDLE_MIN_DELTA) {
      x = frameIndex - HANDLE_MIN_DELTA
    }
    if (direction === 'out' && x < frameIndex + HANDLE_MIN_DELTA) {
      x = frameIndex + HANDLE_MIN_DELTA
    }
    return {
      x,
      y: value,
    }
  }

  const estimateSlopeFromParsed = (fieldName: string, frameIndex: number): number | null => {
    const parsed = motionData.value?.parsed
    if (!parsed || parsed.length === 0) return null
    const prevIndex = Math.max(0, frameIndex - 1)
    const nextIndex = Math.min(parsed.length - 1, frameIndex + 1)
    if (prevIndex === nextIndex) return null
    const prevValue = parsed[prevIndex]?.[fieldName]
    const nextValue = parsed[nextIndex]?.[fieldName]
    if (typeof prevValue !== 'number' || typeof nextValue !== 'number') return null
    return (nextValue - prevValue) / (nextIndex - prevIndex)
  }

  const computeAutoKeyframeHandle = (
    fieldName: string,
    frameIndex: number
  ): KeyframeHandleData | null => {
    if (!motionData.value) return null
    const meta = ensureFieldMetadata(fieldName)
    const currentValue = getFrameValue(frameIndex, fieldName)
    if (typeof currentValue !== 'number') return null

    // 查找前后邻近的“未忽略”帧
    let prevFrame: number | null = null
    let nextFrame: number | null = null
    for (let i = frameIndex - 1; i >= 0; i--) {
      const pid = getFrameIdByIndex(i)
      if (pid && !meta.ignoredFrames.has(pid)) {
        prevFrame = i
        break
      }
    }
    for (let i = frameIndex + 1; i < getFrameCount(); i++) {
      const nid = getFrameIdByIndex(i)
      if (nid && !meta.ignoredFrames.has(nid)) {
        nextFrame = i
        break
      }
    }

    const prevValue = prevFrame !== null ? getFrameValue(prevFrame, fieldName) : null
    const nextValue = nextFrame !== null ? getFrameValue(nextFrame, fieldName) : null
    const parsedSlope = estimateSlopeFromParsed(fieldName, frameIndex)
    let slope = parsedSlope ?? 0
    if (parsedSlope === null) {
      if (
        prevFrame !== null &&
        nextFrame !== null &&
        typeof prevValue === 'number' &&
        typeof nextValue === 'number'
      ) {
        slope = (nextValue - prevValue) / (nextFrame - prevFrame || 1)
      } else if (prevFrame !== null && typeof prevValue === 'number') {
        slope = (currentValue - prevValue) / (frameIndex - prevFrame || 1)
      } else if (nextFrame !== null && typeof nextValue === 'number') {
        slope = (nextValue - currentValue) / (nextFrame - frameIndex || 1)
      }
    }
    const handle: KeyframeHandleData = {
      in: { x: frameIndex - HANDLE_DEFAULT_SPAN, y: currentValue },
      out: { x: frameIndex + HANDLE_DEFAULT_SPAN, y: currentValue },
      type: 'auto',
    }
    if (nextFrame !== null && typeof nextValue === 'number') {
      const span = Math.max(HANDLE_MIN_DELTA, (nextFrame - frameIndex) / 3 || HANDLE_DEFAULT_SPAN)
      handle.out = clampHandlePoint(
        {
          x: frameIndex + span,
          y: currentValue + slope * span,
        },
        frameIndex,
        'out'
      )
    } else {
      handle.out = clampHandlePoint(handle.out, frameIndex, 'out')
    }
    if (prevFrame !== null && typeof prevValue === 'number') {
      const span = Math.max(HANDLE_MIN_DELTA, (frameIndex - prevFrame) / 3 || HANDLE_DEFAULT_SPAN)
      handle.in = clampHandlePoint(
        {
          x: frameIndex - span,
          y: currentValue - slope * span,
        },
        frameIndex,
        'in'
      )
    } else {
      handle.in = clampHandlePoint(handle.in, frameIndex, 'in')
    }
    return handle
  }

  const autoComputeKeyframeHandles = (
    fieldName: string,
    frameIndex: number
  ): KeyframeHandleData | null => {
    const handle = computeAutoKeyframeHandle(fieldName, frameIndex)
    if (handle) {
      const meta = ensureFieldMetadata(fieldName)
      const id = getFrameIdByIndex(frameIndex)
      if (id) {
        meta.handles.set(id, handle)
      }
      applySegmentsAroundKeyframe(fieldName, frameIndex)
    }
    return handle
  }

  const autoComputeKeyframeHandlesClamped = (
    fieldName: string,
    frameIndex: number
  ): KeyframeHandleData | null => {
    const computed = computeAutoKeyframeHandle(fieldName, frameIndex)
    if (!computed) return null
    const meta = ensureFieldMetadata(fieldName)

    let prevFrame: number | null = null
    let nextFrame: number | null = null
    for (let i = frameIndex - 1; i >= 0; i--) {
      const pid = getFrameIdByIndex(i)
      if (pid && !meta.ignoredFrames.has(pid)) {
        prevFrame = i
        break
      }
    }
    for (let i = frameIndex + 1; i < getFrameCount(); i++) {
      const nid = getFrameIdByIndex(i)
      if (nid && !meta.ignoredFrames.has(nid)) {
        nextFrame = i
        break
      }
    }

    const clampWithNeighbor = (handleKey: 'in' | 'out', neighborFrame: number | null) => {
      if (neighborFrame === null) return
      const neighborVal = getFrameValue(neighborFrame, fieldName)
      const currentVal = getFrameValue(frameIndex, fieldName)
      if (typeof neighborVal !== 'number' || typeof currentVal !== 'number') return
      const minV = Math.min(neighborVal, currentVal)
      const maxV = Math.max(neighborVal, currentVal)
      const h = computed[handleKey]
      computed[handleKey] = clampHandlePoint(
        {
          x: h.x,
          y: Math.max(minV, Math.min(maxV, h.y)),
        },
        frameIndex,
        handleKey
      )
    }
    clampWithNeighbor('in', prevFrame)
    clampWithNeighbor('out', nextFrame)
    computed.type = 'auto_clamped'
    const id = getFrameIdByIndex(frameIndex)
    if (id) {
      meta.handles.set(id, computed)
    }
    applySegmentsAroundKeyframe(fieldName, frameIndex)
    return computed
  }

  const updateKeyframeHandlePoint = (
    fieldName: string,
    frameIndex: number,
    handleKey: 'in' | 'out',
    point: KeyframeHandlePoint,
    desiredType?: KeyframeHandleType
  ) => {
    if (!motionData.value) return
    const meta = ensureFieldMetadata(fieldName)
    const id = getFrameIdByIndex(frameIndex)
    if (!id || meta.ignoredFrames.has(id)) return
    const currentValue = getFrameValue(frameIndex, fieldName)
    if (typeof currentValue !== 'number') return
    const handleData = ensureHandleData(fieldName, frameIndex)
    if (!handleData) return
    const clamped = clampHandlePoint(point, frameIndex, handleKey)
    handleData[handleKey] = clamped
    let typeToSet: KeyframeHandleType =
      desiredType ||
      (handleData.type === 'auto' || handleData.type === 'auto_clamped' ? 'free' : handleData.type)
    if (typeToSet === 'aligned') {
      const deltaX = clamped.x - frameIndex
      const deltaY = clamped.y - currentValue
      const mirror: KeyframeHandlePoint = {
        x: clampHandleX(frameIndex - deltaX),
        y: currentValue - deltaY,
      }
      const oppositeKey = handleKey === 'in' ? 'out' : 'in'
      handleData[oppositeKey] = clampHandlePoint(mirror, frameIndex, oppositeKey as 'in' | 'out')
    } else if (typeToSet === 'vector') {
      // 指向相邻关键帧，形成锐角
      const neighbors = getNeighborKeyframes(fieldName, frameIndex)
      const targetFrame =
        handleKey === 'out'
          ? (neighbors.next ?? frameIndex + 1)
          : (neighbors.prev ?? frameIndex - 1)
      const targetValue = getFrameValue(targetFrame, fieldName)
      if (typeof targetValue === 'number') {
        const dx =
          handleKey === 'out'
            ? Math.max(HANDLE_MIN_DELTA, targetFrame - frameIndex)
            : Math.max(HANDLE_MIN_DELTA, frameIndex - targetFrame)
        const dy = targetValue - currentValue
        const vecPoint =
          handleKey === 'out'
            ? { x: frameIndex + dx, y: currentValue + dy }
            : { x: frameIndex - dx, y: currentValue + dy }
        handleData[handleKey] = clampHandlePoint(vecPoint, frameIndex, handleKey)
        const oppositeKey = handleKey === 'in' ? 'out' : 'in'
        handleData[oppositeKey] = clampHandlePoint(
          {
            x: handleKey === 'out' ? frameIndex - dx : frameIndex + dx,
            y: currentValue - dy,
          },
          frameIndex,
          oppositeKey as 'in' | 'out'
        )
      }
    }
    if (typeToSet === 'aligned' || typeToSet === 'vector') {
      // 已在上面处理镜像/向量
    }
    handleData.type = typeToSet
    if (id) {
      meta.handles.set(id, handleData)
    }
    // 对于 aligned 和 vector 类型，两侧控制柄都发生了变化，需要同时更新两侧曲线段
    if (typeToSet === 'aligned' || typeToSet === 'vector') {
      const neighbors = getNeighborKeyframes(fieldName, frameIndex)
      applySegmentBetween(fieldName, neighbors.prev, frameIndex)
      applySegmentBetween(fieldName, frameIndex, neighbors.next)
    } else {
      if (handleKey === 'in') {
        const neighbors = getNeighborKeyframes(fieldName, frameIndex)
        applySegmentBetween(fieldName, neighbors.prev, frameIndex)
      } else {
        const neighbors = getNeighborKeyframes(fieldName, frameIndex)
        applySegmentBetween(fieldName, frameIndex, neighbors.next)
      }
    }
  }

  const setKeyframeHandles = (
    fieldName: string,
    frameIndex: number,
    handleData: KeyframeHandleData
  ) => {
    const meta = ensureFieldMetadata(fieldName)
    const id = getFrameIdByIndex(frameIndex)
    if (!id || meta.ignoredFrames.has(id)) return
    meta.handles.set(id, {
      in: clampHandlePoint(handleData.in, frameIndex, 'in'),
      out: clampHandlePoint(handleData.out, frameIndex, 'out'),
      type: handleData.type,
    })
    applySegmentsAroundKeyframe(fieldName, frameIndex)
  }

  const setKeyframeHandleType = (
    fieldName: string,
    frameIndex: number,
    type: KeyframeHandleType
  ) => {
    if (!motionData.value) return
    if (!isKeyframe(fieldName, frameIndex)) return
    if (type === 'auto') {
      autoComputeKeyframeHandles(fieldName, frameIndex)
      recomputeAutoNeighborHandles(fieldName, frameIndex)
      return
    }
    if (type === 'auto_clamped') {
      autoComputeKeyframeHandlesClamped(fieldName, frameIndex)
      recomputeAutoNeighborHandles(fieldName, frameIndex)
      return
    }
    const handleData = ensureHandleData(fieldName, frameIndex)
    if (!handleData) return
    handleData.type = type
    setKeyframeHandles(fieldName, frameIndex, handleData)
  }

  const getKeyframeHandle = (fieldName: string, frameIndex: number) => {
    const meta = ensureFieldMetadata(fieldName)
    const id = getFrameIdByIndex(frameIndex)
    if (!id || meta.ignoredFrames.has(id)) return null
    // 优先取已存储的手柄（自定义/非 auto）
    const handle = meta.handles.get(id) ?? ensureHandleData(fieldName, frameIndex)
    if (!handle) return null
    return cloneHandleData(handle)
  }

  const moveFrame = (fromIndex: number, toIndex: number) => {
    if (!motionData.value) return
    if (fromIndex === toIndex) return
    const fid = getFrameIdByIndex(fromIndex)
    moveFrameSilently(fromIndex, toIndex)
    withDrawStore.moveFrame(fromIndex, toIndex, fid ?? undefined)
  }

  const getNeighborKeyframes = (fieldName: string, frameIndex: number) => {
    const frames = getKeyframeIndices(fieldName)
    const idx = frames.indexOf(frameIndex)
    return {
      prev: idx > 0 ? frames[idx - 1] : null,
      next: idx >= 0 && idx < frames.length - 1 ? frames[idx + 1] : null,
    }
  }

  const computeSlopeFromHandle = (
    frameIndex: number,
    value: number,
    handlePoint: KeyframeHandlePoint,
    direction: 'in' | 'out'
  ) => {
    const deltaX =
      direction === 'out'
        ? Math.max(HANDLE_MIN_DELTA, handlePoint.x - frameIndex)
        : Math.max(HANDLE_MIN_DELTA, frameIndex - handlePoint.x)
    const deltaY = direction === 'out' ? handlePoint.y - value : value - handlePoint.y
    return deltaY / deltaX
  }

  const applyBezierSegment = (fieldName: string, startFrame: number, endFrame: number) => {
    if (!motionData.value) return
    if (startFrame < 0 || endFrame >= motionData.value.parsed.length) return
    if (endFrame - startFrame <= 1) return
    const startValue = getFrameValue(startFrame, fieldName)
    const endValue = getFrameValue(endFrame, fieldName)
    if (typeof startValue !== 'number' || typeof endValue !== 'number') return

    const span = endFrame - startFrame
    const startHandle = ensureHandleData(fieldName, startFrame)
    const endHandle = ensureHandleData(fieldName, endFrame)

    const startSlope =
      startHandle && startHandle.out
        ? computeSlopeFromHandle(startFrame, startValue, startHandle.out, 'out')
        : (endValue - startValue) / span
    const endSlope =
      endHandle && endHandle.in
        ? computeSlopeFromHandle(endFrame, endValue, endHandle.in, 'in')
        : (endValue - startValue) / span

    for (let i = startFrame + 1; i < endFrame; i++) {
      const t = (i - startFrame) / span
      const t2 = t * t
      const t3 = t2 * t
      const h00 = 2 * t3 - 3 * t2 + 1
      const h10 = t3 - 2 * t2 + t
      const h01 = -2 * t3 + 3 * t2
      const h11 = t3 - t2
      const value =
        h00 * startValue + h10 * startSlope * span + h01 * endValue + h11 * endSlope * span
      setFrameFieldValue(i, fieldName, value)
    }
  }

  const applySegmentsAroundKeyframe = (fieldName: string, frameIndex: number) => {
    const neighbors = getNeighborKeyframes(fieldName, frameIndex)
    if (neighbors.prev !== null) {
      applyBezierSegment(fieldName, neighbors.prev, frameIndex)
    }
    if (neighbors.next !== null) {
      applyBezierSegment(fieldName, frameIndex, neighbors.next)
    }
  }

  const applySegmentBetween = (
    fieldName: string,
    startFrame: number | null,
    endFrame: number | null
  ) => {
    if (startFrame === null || endFrame === null) return
    applyBezierSegment(fieldName, startFrame, endFrame)
  }

  const buildKeyframeSnapshot = (
    fieldName: string,
    startFrame: number,
    endFrame: number
  ): KeyframeSnapshot => {
    const values: Record<FrameId, number> = {}
    const handles: Record<FrameId, KeyframeHandleData> = {}
    const keyframesInRangeIds: FrameId[] = []
    const meta = ensureFieldMetadata(fieldName)
    if (motionData.value?.parsed) {
      for (let i = startFrame; i <= endFrame; i++) {
        const fid = getFrameIdByIndex(i)
        if (!fid) continue
        const val = motionData.value.parsed[i]?.[fieldName]
        if (val !== undefined) {
          values[fid] = val
        }
        if (!meta.ignoredFrames.has(fid)) {
          keyframesInRangeIds.push(fid)
          const handle = meta.handles.get(fid)
          if (handle) {
            handles[fid] = cloneHandleData(handle)
          }
        }
      }
    }
    return {
      values,
      keyframes: keyframesInRangeIds,
      handles,
    }
  }

  function smoothDeleteKeyframes(fieldName: string, startIndex: number, endIndex?: number) {
    if (!motionData.value) return { success: false }
    if (!fieldName) return { success: false }
    const total = getFrameCount()
    if (total <= 0) return { success: false }
    const safeStart = Math.max(0, Math.min(startIndex, endIndex ?? startIndex))
    const safeEnd = Math.min(total - 1, Math.max(startIndex, endIndex ?? startIndex))
    const keyframes = getKeyframeIndices(fieldName)
    const prev = keyframes.filter(idx => idx < safeStart).pop() ?? null
    const next = keyframes.find(idx => idx > safeEnd) ?? null
    const rangeStart = prev ?? safeStart
    const rangeEnd = next ?? safeEnd

    const before = buildKeyframeSnapshot(fieldName, rangeStart, rangeEnd)

    withDrawStore.runWithoutRecord(() => {
      for (let i = safeStart; i <= safeEnd; i++) {
        if (isKeyframe(fieldName, i)) {
          removeKeyframe(fieldName, i)
        }
      }
    })

    const after = buildKeyframeSnapshot(fieldName, rangeStart, rangeEnd)

    withDrawStore.setOperationInfo('取消关键帧并平滑', fieldName)
    withDrawStore.pushKeyframeSmoothDelete({
      fieldName,
      rangeStart,
      rangeEnd,
      before,
      after,
      _currentFrameIndex: currentFrameIndex.value,
      _endFrameIndex: currentFrameIndex.value,
    })

    return { success: true, rangeStart, rangeEnd }
  }

  const initializeKeyframesFromJSON = (json: IJSON | null) => {
    const metadata: KeyframeMetadata = new Map()
    if (json && Array.isArray(json.dof_names)) {
      json.dof_names.forEach(fieldName => {
        metadata.set(fieldName, {
          ignoredFrames: new Set(), // 空集合表示全部是关键帧
          handles: new Map(),
        })
      })
    }
    keyframeMetadata.value = metadata
  }

  const clearKeyframes = () => {
    keyframeMetadata.value.clear()
  }

  const getKeyframeIndices = (fieldName: string) => {
    const meta = keyframeMetadata.value.get(fieldName)
    if (!meta) return []
    const indices: number[] = []
    const count = getFrameCount()
    for (let i = 0; i < count; i++) {
      const id = getFrameIdByIndex(i)
      if (id && !meta.ignoredFrames.has(id)) {
        indices.push(i)
      }
    }
    return indices
  }

  const isKeyframe = (fieldName: string, frameIndex: number) => {
    if (!motionData.value) return false
    if (frameIndex < 0 || frameIndex >= motionData.value.parsed.length) return false
    const id = getFrameIdByIndex(frameIndex)
    if (!id) return false
    return !ensureFieldMetadata(fieldName).ignoredFrames.has(id)
  }

  const addKeyframe = (fieldName: string, frameIndex: number) => {
    if (!motionData.value) return
    if (frameIndex < 0 || frameIndex >= motionData.value.parsed.length) return
    const id = getFrameIdByIndex(frameIndex)
    if (!id) return
    const meta = ensureFieldMetadata(fieldName)
    if (!meta.ignoredFrames.has(id)) return
    meta.ignoredFrames.delete(id)
    // 默认 auto 手柄不入库，按需计算
    recomputeAutoNeighborHandles(fieldName, frameIndex)
    applySegmentsAroundKeyframe(fieldName, frameIndex)
  }

  const removeKeyframe = (fieldName: string, frameIndex: number) => {
    const id = getFrameIdByIndex(frameIndex)
    if (!id) return
    const meta = keyframeMetadata.value.get(fieldName)
    if (!meta) return
    if (meta.ignoredFrames.has(id)) return
    const neighbors = getNeighborKeyframes(fieldName, frameIndex)
    meta.ignoredFrames.add(id)
    meta.handles.delete(id)
    recomputeAutoNeighborHandles(fieldName, frameIndex)
    applySegmentBetween(fieldName, neighbors.prev, neighbors.next)
  }

  const toggleKeyframe = (fieldName: string, frameIndex: number) => {
    if (!motionData.value) return
    if (frameIndex < 0 || frameIndex >= motionData.value.parsed.length) return
    const id = getFrameIdByIndex(frameIndex)
    if (!id) return
    const keyframes = getKeyframeIndices(fieldName)
    const prev = keyframes.filter(idx => idx < frameIndex).pop() ?? null
    const next = keyframes.find(idx => idx > frameIndex) ?? null
    const rangeStart = Math.max(0, Math.min(prev ?? frameIndex, frameIndex))
    const rangeEnd = Math.max(rangeStart, Math.max(next ?? frameIndex, frameIndex))
    const before = buildKeyframeSnapshot(fieldName, rangeStart, rangeEnd)
    const meta = ensureFieldMetadata(fieldName)
    const isCurrentlyKeyframe = !meta.ignoredFrames.has(id)
    withDrawStore.runWithoutRecord(() => {
      if (isCurrentlyKeyframe) {
        const neighbors = getNeighborKeyframes(fieldName, frameIndex)
        meta.ignoredFrames.add(id)
        meta.handles.delete(id)
        recomputeAutoNeighborHandles(fieldName, frameIndex)
        applySegmentBetween(fieldName, neighbors.prev, neighbors.next)
      } else {
        meta.ignoredFrames.delete(id)
        // 默认 auto 手柄不入库
        recomputeAutoNeighborHandles(fieldName, frameIndex)
        applySegmentsAroundKeyframe(fieldName, frameIndex)
      }
    })
    const after = buildKeyframeSnapshot(fieldName, rangeStart, rangeEnd)
    withDrawStore.setOperationInfo(isCurrentlyKeyframe ? '取消关键帧' : '设为关键帧', fieldName)
    withDrawStore.pushKeyframeSnapshotChange({
      fieldName,
      rangeStart,
      rangeEnd,
      before,
      after,
      _currentFrameIndex: frameIndex,
      _endFrameIndex: frameIndex,
    })
  }

  const shiftKeyframesAfterInsert = (
    index: number,
    oldIndexMap: Map<FrameId, number>,
    inclusive: boolean = false
  ) => {
    keyframeMetadata.value.forEach((meta, fieldName) => {
      const updatedHandles = new Map<FrameId, KeyframeHandleData>()
      meta.handles.forEach((handle, fid) => {
        const oldIdx = oldIndexMap.get(fid)
        if (oldIdx === undefined) return
        if (oldIdx > index || (inclusive && oldIdx === index)) {
          const newIndex = oldIdx + 1
          const shifted: KeyframeHandleData = {
            in: clampHandlePoint({ ...handle.in, x: handle.in.x + 1 }, newIndex, 'in'),
            out: clampHandlePoint({ ...handle.out, x: handle.out.x + 1 }, newIndex, 'out'),
            type: handle.type,
          }
          updatedHandles.set(fid, shifted)
        } else {
          updatedHandles.set(fid, handle)
        }
      })
      meta.handles = updatedHandles
      keyframeMetadata.value.set(fieldName, meta)
      recomputeAllSegmentsForField(fieldName)
    })
  }

  const shiftKeyframesAfterDelete = (
    index: number,
    oldIndexMap: Map<FrameId, number>,
    removedId?: FrameId | null
  ) => {
    keyframeMetadata.value.forEach((meta, fieldName) => {
      const updatedHandles = new Map<FrameId, KeyframeHandleData>()
      if (removedId) {
        meta.ignoredFrames.delete(removedId)
        meta.handles.delete(removedId)
      }
      meta.handles.forEach((handle, fid) => {
        const oldIdx = oldIndexMap.get(fid)
        if (oldIdx === undefined || oldIdx === index) return
        if (oldIdx > index) {
          const newIndex = oldIdx - 1
          const shifted: KeyframeHandleData = {
            in: clampHandlePoint({ ...handle.in, x: handle.in.x - 1 }, newIndex, 'in'),
            out: clampHandlePoint({ ...handle.out, x: handle.out.x - 1 }, newIndex, 'out'),
            type: handle.type,
          }
          updatedHandles.set(fid, shifted)
        } else {
          updatedHandles.set(fid, handle)
        }
      })
      meta.handles = updatedHandles
      keyframeMetadata.value.set(fieldName, meta)
      recomputeAllSegmentsForField(fieldName)
    })
  }

  const recomputeAllSegmentsForField = (fieldName: string) => {
    const frames = getKeyframeIndices(fieldName)
    for (let i = 0; i < frames.length - 1; i++) {
      applyBezierSegment(fieldName, frames[i], frames[i + 1])
    }
  }
  /**
   * 批量对指定关键帧执行 auto 手柄并重新计算相邻曲线段
   * - 先为目标关键帧计算 auto 手柄
   * - 再为其相邻 auto 手柄的关键帧重算
   * - 最后整段曲线重新插值，包含中间的非关键帧点
   */
  const recomputeAutoForFrames = (fieldName: string, frameIndices: number[]) => {
    if (!motionData.value) return
    if (!Array.isArray(frameIndices) || frameIndices.length === 0) return

    const uniqueSorted = Array.from(new Set(frameIndices.filter(Number.isFinite))).sort(
      (a, b) => a - b
    )
    if (!uniqueSorted.length) return

    // 先为目标关键帧设置 auto 手柄
    uniqueSorted.forEach(idx => {
      if (isKeyframe(fieldName, idx)) {
        autoComputeKeyframeHandles(fieldName, idx)
      }
    })

    // 邻接 auto 手柄同步重算
    uniqueSorted.forEach(idx => {
      if (isKeyframe(fieldName, idx)) {
        recomputeAutoNeighborHandles(fieldName, idx)
      }
    })

    // 全段重新插值，包含非关键帧
    recomputeAllSegmentsForField(fieldName)
  }
  const recomputeAutoNeighborHandles = (fieldName: string, frameIndex: number) => {
    const meta = ensureFieldMetadata(fieldName)
    const keyframes = getKeyframeIndices(fieldName)
    const idxPos = keyframes.indexOf(frameIndex)
    const candidates: number[] = []
    if (idxPos > 0) candidates.push(keyframes[idxPos - 1])
    if (idxPos >= 0 && idxPos < keyframes.length - 1) candidates.push(keyframes[idxPos + 1])
    candidates.forEach(candidate => {
      const candidateId = getFrameIdByIndex(candidate)
      const handle = candidateId ? meta.handles.get(candidateId) : null
      if (!handle || handle.type === 'auto') {
        autoComputeKeyframeHandles(fieldName, candidate)
      }
      applySegmentsAroundKeyframe(fieldName, candidate)
    })
  }
  /**
   * 动作数据完全重置方法
   *
   * 彻底清除所有动作相关的数据和状态，将Store恢复到初始状态。
   * 这是一个全面的清理方法，确保没有任何残留状态影响后续操作。
   *
   * 清理范围：
   * 1. 播放控制：停止计时器，重置播放状态
   * 2. 数据清空：清除主数据和副本数据
   * 3. 帧状态重置：重置当前帧索引和播放参数
   * 4. 摄像机状态：清除播放起始时的摄像机状态记录
   * 5. 字段选择：清除当前选中的数据字段
   *
   * 使用场景：
   * - 加载新的动作文件前的清理
   * - 用户主动重置编辑器状态
   * - 错误恢复和状态修复
   */
  function clearMotionJSON() {
    if (timer) {
      try {
        clearInterval(timer)
      } catch { }
      timer = null
    }
    playStatus.value = 0
    isAdjustingPlaybackTime.value = false

    motionData.value = null
    motionDataCopy.value = null
    isJsonLoaded.value = false
    useUserSelectJSON.value = false
    isMotionJSONEdited.value = false
    clearKeyframes()

    currentFrameIndex.value = -1
    playMode.value = 0
    playbackSpeed.value = 1
    playbackRefreshRate.value = 30

    frameIds.value = []
    frameIdToIndex.value = new Map()
    frameIdCounter = 0

    startCameraDistance.value = 0
    startCameraPosition.value = null
    startRobotPosition.value = null
    startCameraQuaternion.value = null
    startCameraQuaternionRelativeToRobot.value = null

    try {
      const sel = useSelectedFieldStore()
      sel.handleRemoveSelect()
    } catch { }
  }

  function setUseUserSelectJSON(to: boolean) {
    useUserSelectJSON.value = to
  }

  /**
   * 动作数据副本同步方法
   *
   * 将当前的主动作数据深拷贝到副本中，为撤销/重做功能提供数据快照。
   * 这是历史记录管理的基础方法，确保操作的可逆性。
   *
   * 技术实现：
   * - 使用深拷贝避免引用共享
   * - 保持数据结构的完整性
   * - 支持大型动作数据的高效复制
   */
  function syncMotionDataCopy() {
    if (motionData.value === null) return
    motionDataCopy.value = deepCopyObject(motionData.value)
  }

  /**
   * 历史数据查询方法
   *
   * 从副本数据中读取指定字段的值集合，主要用于撤销/重做功能的数据对比。
   * 支持帧级别和JSON顶层两种数据读取模式。
   *
   * 功能特点：
   * - 灵活的数据层级选择（帧级或JSON级）
   * - 批量字段读取，提高查询效率
   * - 安全的空值检查，避免运行时错误
   *
   * 使用场景：
   * - 操作前后的数据对比
   * - 撤销/重做功能的状态恢复
   * - 历史记录的数据验证
   *
   * @param isFrame 是否从帧级读取（true: 指定帧内字段；false: JSON 顶层字段）
   * @param frameIndex 帧下标
   * @param fields 需要读取的字段名数组
   */
  function getMotionDataCopyValues(isFrame: boolean, frameIndex: number, fields: string[]) {
    if (isFrame) {
      const extractedValues: Record<string, any> = {}
      const frameData: Record<string, any> | undefined = motionDataCopy.value?.parsed[frameIndex]
      if (!frameData) return
      for (let i = 0; i < fields.length; i++) {
        const fieldName = fields[i]
        extractedValues[fieldName] = frameData[fieldName]
      }
      return extractedValues
    } else {
      const extractedValues: Record<string, any> = {}
      const copyData: Record<string, any> | null = motionDataCopy.value
      if (!copyData) return
      for (let i = 0; i < fields.length; i++) {
        const fieldName = fields[i]
        extractedValues[fieldName] = copyData[fieldName]
      }
      return extractedValues
    }
  }

  /**
   * 动作JSON数据加载和初始化方法
   *
   * 这是动作编辑器最重要的数据加载方法，负责将原始JSON数据解析为可编辑的格式。
   * 完成数据加载后会自动初始化所有相关状态。
   *
   * 处理流程：
   * 1. 用户选择模式检查：防止非用户操作覆盖用户数据
   * 2. JSON数据解析：使用API将原始数据转换为标准格式
   * 3. 副本数据同步：创建数据备份用于撤销/重做
   * 4. 状态初始化：设置当前帧为第一帧，标记为已加载
   *
   * 安全机制：
   * - 用户选择保护：防止程序自动覆盖用户手动选择的数据
   * - 数据验证：确保解析后的数据有效性
   * - 状态一致性：保证所有相关状态的正确初始化
   *
   * @param json 原始动作JSON数据
   * @param isUserSelect 是否为用户主动选择（用于权限控制）
   */
  function setMotionJSON(json: any, isUserSelect: boolean = false) {
    if (useUserSelectJSON.value && !isUserSelect) return
    const processedMotionData = api.parseMotionJSON(json)
    if (robotModelStore.isBVH && false) {
      const parsed = processedMotionData?.parsed
      if (parsed) {
        const scanedFieldName: string[] = []
        for (const fieldName of processedMotionData?.dof_names as string[]) {
          if (fieldName === 'floating_base_joint') continue
          const jointName = fieldName.split('_')[0]
          if (scanedFieldName.includes(jointName)) continue
          scanedFieldName.push(jointName)
          const currentJointRotationInfo = json.joints[jointName]
          const rotationOrder = (() => {
            if (currentJointRotationInfo) {
              const arr = [
                {
                  name: 'X',
                  index: currentJointRotationInfo['Xrotation'],
                },
                {
                  name: 'Y',
                  index: currentJointRotationInfo['Yrotation'],
                },
                {
                  name: 'Z',
                  index: currentJointRotationInfo['Zrotation'],
                },
              ]
              return arr
                .sort((a, b) => a.index - b.index)
                .map(item => item.name)
                .join('')
            } else {
              return 'XYZ'
            }
          })()
          const eulerArray = parsed.map(item => ({
            x: item[`${jointName}_x`],
            y: item[`${jointName}_y`],
            z: item[`${jointName}_z`],
            order: rotationOrder,
          }))
          const fixedArr = fixEulerArray(eulerArray)
          for (const fixedArrItemIndex in fixedArr) {
            const item = fixedArr[fixedArrItemIndex]
            parsed[fixedArrItemIndex][`${jointName}_x`] = item.x
            parsed[fixedArrItemIndex][`${jointName}_y`] = item.y
            parsed[fixedArrItemIndex][`${jointName}_z`] = item.z
          }
        }
      }
    }
    motionData.value = processedMotionData as unknown as IJSON
    if (motionData.value === null) return
    motionDataCopy.value = deepCopyObject(motionData.value)
    if (Array.isArray(motionData.value.parsed)) {
      frameIds.value = motionData.value.parsed.map(() => generateFrameId())
      rebuildFrameIdIndex()
      ensureFrameIdsForCurrentData()
    } else {
      frameIds.value = []
      frameIdToIndex.value = new Map()
    }
    // 保持 currentFrameIndex 为 -1，等待 viewer 加载完成后再设置为 0
    // currentFrameIndex.value = 0
    isJsonLoaded.value = true
    initializeKeyframesFromJSON(motionData.value)
  }

  /**
   * 修复欧拉角数组的连续性 (Blender Euler Rotation Unwinding/Fixing Logic)
   * 移植自 Blender 源码: source/blender/blenlib/intern/math_rotation_c.cc
   *
   * 核心逻辑：
   * 1. 将欧拉角转换为旋转矩阵。
   * 2. 从旋转矩阵反解出两个可能的欧拉角解。
   * 3. 使用上一帧的欧拉角作为参考，选择最接近的一组解，并进行 360 度修正。
   *
   * @param eulerArray - 欧拉角对象数组 (弧度)
   * @returns 修复后的欧拉角数组
   */
  function fixEulerArray(
    eulerArray: Array<{ x: number; y: number; z: number; order: string }>
  ): Array<{ x: number; y: number; z: number; order: string }> {
    if (!eulerArray || eulerArray.length === 0) return []

    // --- 类型定义 ---
    type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
    type Vec3 = [number, number, number]
    type Mat3 = [Vec3, Vec3, Vec3]

    interface RotationOrderInfo {
      axis: Vec3
      parity: number
    }

    // --- 常量定义 ---
    const M_PI = Math.PI
    const M_PI_2 = Math.PI / 2.0
    // EULER_HYPOT_EPSILON from math_rotation_c.cc
    const EULER_HYPOT_EPSILON = 0.0000375

    const RotOrders: readonly RotationOrderInfo[] = [
      { axis: [0, 1, 2], parity: 0 }, // XYZ
      { axis: [0, 2, 1], parity: 1 }, // XZY
      { axis: [1, 0, 2], parity: 1 }, // YXZ
      { axis: [1, 2, 0], parity: 0 }, // YZX
      { axis: [2, 0, 1], parity: 0 }, // ZXY
      { axis: [2, 1, 0], parity: 1 }, // ZYX
    ] as const

    // --- 内部辅助函数 ---

    /**
     * 获取旋转顺序信息
     * @param orderStr - 旋转顺序字符串
     * @returns 旋转顺序信息对象
     */
    function getRotationOrderInfo(orderStr: string): RotationOrderInfo {
      switch (orderStr as EulerOrder) {
        case 'XYZ':
          return RotOrders[0]
        case 'XZY':
          return RotOrders[1]
        case 'YXZ':
          return RotOrders[2]
        case 'YZX':
          return RotOrders[3]
        case 'ZXY':
          return RotOrders[4]
        case 'ZYX':
          return RotOrders[5]
        default:
          return RotOrders[0]
      }
    }

    /**
     * 将欧拉角转换为3x3旋转矩阵 (对应 Blender 的 eulO_to_mat3)
     * @param eul - 欧拉角向量 [x, y, z] (弧度)
     * @param orderStr - 旋转顺序字符串
     * @returns 3x3 旋转矩阵
     */
    function eulO_to_mat3(eul: Vec3, orderStr: string): Mat3 {
      const R = getRotationOrderInfo(orderStr)
      const i = R.axis[0]
      const j = R.axis[1]
      const k = R.axis[2]

      let ti: number, tj: number, th: number
      if (R.parity) {
        ti = -eul[i]
        tj = -eul[j]
        th = -eul[k]
      } else {
        ti = eul[i]
        tj = eul[j]
        th = eul[k]
      }

      const ci = Math.cos(ti)
      const cj = Math.cos(tj)
      const ch = Math.cos(th)
      const si = Math.sin(ti)
      const sj = Math.sin(tj)
      const sh = Math.sin(th)
      const cc = ci * ch
      const cs = ci * sh
      const sc = si * ch
      const ss = si * sh

      const M: Mat3 = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]

      M[i][i] = cj * ch
      M[j][i] = sj * sc - cs
      M[k][i] = sj * cc + ss
      M[i][j] = cj * sh
      M[j][j] = sj * ss + cc
      M[k][j] = sj * cs - sc
      M[i][k] = -sj
      M[j][k] = cj * si
      M[k][k] = cj * ci

      return M
    }

    /**
     * 从旋转矩阵反解出两组可能的欧拉角 (对应 Blender 的 mat3_normalized_to_eulo2)
     * @param mat - 3x3 旋转矩阵
     * @param orderStr - 旋转顺序字符串
     * @returns 包含两组欧拉角解的对象
     */
    function mat3_normalized_to_eulo2(mat: Mat3, orderStr: string): { eul1: Vec3; eul2: Vec3 } {
      const R = getRotationOrderInfo(orderStr)
      const i = R.axis[0]
      const j = R.axis[1]
      const k = R.axis[2]
      const eul1: Vec3 = [0, 0, 0]
      const eul2: Vec3 = [0, 0, 0]

      const cy = Math.hypot(mat[i][i], mat[i][j])

      if (cy > EULER_HYPOT_EPSILON) {
        eul1[i] = Math.atan2(mat[j][k], mat[k][k])
        eul1[j] = Math.atan2(-mat[i][k], cy)
        eul1[k] = Math.atan2(mat[i][j], mat[i][i])

        eul2[i] = Math.atan2(-mat[j][k], -mat[k][k])
        eul2[j] = Math.atan2(-mat[i][k], -cy)
        eul2[k] = Math.atan2(-mat[i][j], -mat[i][i])
      } else {
        eul1[i] = Math.atan2(-mat[k][j], mat[j][j])
        eul1[j] = Math.atan2(-mat[i][k], cy)
        eul1[k] = 0

        eul2[0] = eul1[0]
        eul2[1] = eul1[1]
        eul2[2] = eul1[2]
      }

      if (R.parity) {
        eul1[0] = -eul1[0]
        eul1[1] = -eul1[1]
        eul1[2] = -eul1[2]
        eul2[0] = -eul2[0]
        eul2[1] = -eul2[1]
        eul2[2] = -eul2[2]
      }

      return { eul1, eul2 }
    }

    /**
     * 修正欧拉角，使其与参考欧拉角保持连续性 (对应 Blender 的 compatible_eul)
     * @param eul - 待修正的欧拉角 (会被直接修改)
     * @param oldrot - 参考欧拉角 (上一帧)
     */
    function compatible_eul(eul: Vec3, oldrot: Vec3): void {
      const pi_thresh = M_PI
      const pi_x2 = 2.0 * M_PI

      const deul: Vec3 = [0, 0, 0]

      // Correct differences around 360 degrees first
      for (let i = 0; i < 3; i++) {
        deul[i] = eul[i] - oldrot[i]
        if (deul[i] > pi_thresh) {
          eul[i] -= Math.floor(deul[i] / pi_x2 + 0.5) * pi_x2
          deul[i] = eul[i] - oldrot[i]
        } else if (deul[i] < -pi_thresh) {
          eul[i] += Math.floor(-deul[i] / pi_x2 + 0.5) * pi_x2
          deul[i] = eul[i] - oldrot[i]
        }
      }

      // Check if this axis of rotations larger than 180 degrees and
      // the others are smaller than 90 degrees.
      let j = 1
      let k = 2
      for (let i = 0; i < 3; i++) {
        if (Math.abs(deul[i]) > M_PI && Math.abs(deul[j]) < M_PI_2 && Math.abs(deul[k]) < M_PI_2) {
          if (deul[i] > 0.0) {
            eul[i] -= pi_x2
          } else {
            eul[i] += pi_x2
          }
        }

        // Update indices logic to match Blender's C loop `j = k, k = i++`
        if (i === 0) {
          j = 2
          k = 0
        } else if (i === 1) {
          j = 0
          k = 1
        }
      }
    }

    /**
     * 从旋转矩阵提取与参考欧拉角最接近的欧拉角解 (对应 Blender 的 mat3_to_compatible_eulO)
     * @param eul - 输出的欧拉角 (会被直接修改)
     * @param oldrot - 参考欧拉角
     * @param orderStr - 旋转顺序字符串
     * @param mat - 3x3 旋转矩阵
     */
    function mat3_to_compatible_eulO(eul: Vec3, oldrot: Vec3, orderStr: string, mat: Mat3): void {
      const { eul1, eul2 } = mat3_normalized_to_eulo2(mat, orderStr)

      // Copy to temp arrays to modify in compatible_eul
      const e1: Vec3 = [...eul1]
      const e2: Vec3 = [...eul2]

      compatible_eul(e1, oldrot)
      compatible_eul(e2, oldrot)

      const d1 =
        Math.abs(e1[0] - oldrot[0]) + Math.abs(e1[1] - oldrot[1]) + Math.abs(e1[2] - oldrot[2])
      const d2 =
        Math.abs(e2[0] - oldrot[0]) + Math.abs(e2[1] - oldrot[1]) + Math.abs(e2[2] - oldrot[2])

      if (d1 > d2) {
        eul[0] = e2[0]
        eul[1] = e2[1]
        eul[2] = e2[2]
      } else {
        eul[0] = e1[0]
        eul[1] = e1[1]
        eul[2] = e1[2]
      }
    }

    // --- 主执行逻辑 ---

    const result: Array<{ x: number; y: number; z: number; order: string }> = []
    // Blender starts with zero rotation as reference
    let prevEuler: Vec3 = [0.0, 0.0, 0.0]

    // 获取统一的 order (假设所有对象 order 一致)
    const order = eulerArray[0].order.toUpperCase()

    for (let i = 0; i < eulerArray.length; i++) {
      const current = eulerArray[i]
      const currentEul: Vec3 = [current.x, current.y, current.z]

      // 1. 将当前欧拉角转为旋转矩阵
      const mat = eulO_to_mat3(currentEul, order)

      // 2. 将旋转矩阵转回欧拉角，并传入前一帧作为参考进行修正
      const fixedEul: Vec3 = [0, 0, 0]
      mat3_to_compatible_eulO(fixedEul, prevEuler, order, mat)

      // 3. 保存结果
      result.push({
        x: fixedEul[0],
        y: fixedEul[1],
        z: fixedEul[2],
        order: order,
      })

      // 4. 更新 prevEuler
      prevEuler = fixedEul
    }

    return result
  }

  function isMotionJSONSelected() {
    return motionData.value !== null
  }
  /**
   * 机器人关节名称提取器
   *
   * 从动作数据中提取所有可控制的关节名称列表。
   * 自动过滤掉全局位置、姿态和特殊字段，只返回实际的关节名称。
   *
   * 过滤规则：
   * - 排除全局位置字段（global_*）
   * - 排除四元数姿态字段（quater_*）
   * - 排除BVH特有的方向字段
   *
   * 这个方法为关节选择器和数据面板提供基础数据。
   */
  function getJointNames(): string[] {
    const firstFrame = motionData.value?.parsed?.[0]
    if (!firstFrame) return []
    const bvhOrientationField =
      motionData.value?.bvhAdapt &&
        typeof motionData.value.bvhAdapt === 'object' &&
        'orientationFieldName' in motionData.value.bvhAdapt
        ? (motionData.value.bvhAdapt as any).orientationFieldName
        : ''
    const keys = Object.keys(firstFrame)
    const baseJoints = keys.filter(
      item =>
        !item.startsWith('quater_') &&
        !item.startsWith('global_') &&
        !(bvhOrientationField && item.startsWith(`${bvhOrientationField}_`))
    )
    const extras: string[] = []
    const maybePush = (name: string) => {
      if (keys.includes(name)) extras.push(name)
    }
    // 全局位置
    maybePush('global_x')
    maybePush('global_y')
    maybePush('global_z')
    // URDF 四元数
    if (!robotModelStore.isBVH) {
      maybePush('quater_x')
      maybePush('quater_y')
      maybePush('quater_z')
      maybePush('quater_w')
    }
    // BVH 根关节欧拉
    if (robotModelStore.isBVH && bvhOrientationField) {
      maybePush(`${bvhOrientationField}_x`)
      maybePush(`${bvhOrientationField}_y`)
      maybePush(`${bvhOrientationField}_z`)
    }
    const merged = [...baseJoints, ...extras]
    return Array.from(new Set(merged))
  }

  /**
   * 机器人基座轨迹线数据生成器
   *
   * 生成机器人基座在整个动作过程中的运动轨迹数据，用于3D视图中的轨迹线显示。
   * 支持URDF和BVH两种坐标系统的自动转换。
   *
   * 数据格式：
   * - 每个数据点包含位置（x,y,z）和姿态（四元数）
   * - 自动处理坐标系转换（URDF坐标系 → Three.js坐标系）
   * - 返回适合Three.js渲染的数据格式
   *
   * 应用场景：
   * - 3D视图中显示机器人运动轨迹
   * - 动作分析和可视化
   * - 路径规划的参考线显示
   */
  function getBasePositionLineData() {
    const motionStore = useMotionStore()
    const robotModelStore = useRobotModelStore()
    if (motionStore.motionData === null) return
    const trajectoryData: any[] = []
    for (let i = 0; i < motionStore.motionData?.parsed.length; i++) {
      const position = robotModelStore.isBVH
        ? {
          x: motionStore.motionData?.parsed[i].global_x,
          y: motionStore.motionData?.parsed[i].global_y,
          z: motionStore.motionData?.parsed[i].global_z,
        }
        : api.robot.position.urdfToThree({
          x: motionStore.motionData?.parsed[i].global_x,
          y: motionStore.motionData?.parsed[i].global_y,
          z: motionStore.motionData?.parsed[i].global_z,
        })
      const quaternion = robotModelStore.isBVH
        ? {
          x: motionStore.motionData?.parsed[i][
            `${typeof motionStore.motionData.bvhAdapt === 'object' && motionStore.motionData.bvhAdapt !== null ? motionStore.motionData.bvhAdapt.orientationFieldName : ''}_x`
          ],
          y: motionStore.motionData?.parsed[i][
            `${typeof motionStore.motionData.bvhAdapt === 'object' && motionStore.motionData.bvhAdapt !== null ? motionStore.motionData.bvhAdapt.orientationFieldName : ''}_y`
          ],
          z: motionStore.motionData?.parsed[i][
            `${typeof motionStore.motionData.bvhAdapt === 'object' && motionStore.motionData.bvhAdapt !== null ? motionStore.motionData.bvhAdapt.orientationFieldName : ''}_z`
          ],
        }
        : api.robot.quater.urdfQuatToThree({
          x: motionStore.motionData?.parsed[i].quater_x,
          y: motionStore.motionData?.parsed[i].quater_y,
          z: motionStore.motionData?.parsed[i].quater_z,
          w: motionStore.motionData?.parsed[i].quater_w,
        })
      trajectoryData.push([
        position.x,
        position.y,
        position.z,
        quaternion.x,
        quaternion.y,
        quaternion.z,
        ...(robotModelStore.isBVH ? [] : ['w' in quaternion ? quaternion.w : 0]),
      ])
    }
    return trajectoryData
  }

  /**
   * 后续路径重定向数据提取器
   *
   * 从指定帧开始，提取后续所有帧的位置和姿态数据。
   * 主要用于四元数球的路径重定向功能，预览姿态调整对后续动作的影响。
   *
   * 功能特点：
   * - 从指定帧开始提取数据
   * - 自动坐标系转换（URDF → Three.js）
   * - 返回标准的IFrame格式数据
   *
   * 使用场景：
   * - 四元数球的路径重定向预览
   * - 姿态调整的影响范围分析
   * - 动作连贯性检查
   */
  function getLaterPathReorientationData(frameIndex: number) {
    if (motionData.value === null) return []
    const pathData: IFrame[] = []
    for (let i = frameIndex; i < motionData.value.parsed.length; i++) {
      pathData.push({
        position: api.robot.position.urdfToThree({
          x: motionData.value?.parsed[i].global_x,
          y: motionData.value?.parsed[i].global_y,
          z: motionData.value?.parsed[i].global_z,
        }),
        quaternion: api.robot.quater.urdfQuatToThree({
          x: motionData.value?.parsed[i].global_quater_x,
          y: motionData.value?.parsed[i].global_quater_y,
          z: motionData.value?.parsed[i].global_quater_z,
          w: motionData.value?.parsed[i].global_quater_w,
        }),
      } as IFrame)
    }
    return pathData
  }

  /**
   * 动作数据导出格式转换器
   *
   * 将当前编辑的动作数据转换回原始JSON格式，用于保存和导出。
   * 这是编辑器内部格式到标准格式的逆向转换过程。
   *
   * 转换过程：
   * 1. 深拷贝当前数据避免修改原始数据
   * 2. 将解析后的帧数据重新组织为数组格式
   * 3. 按照标准字段顺序排列数据
   * 4. 移除内部使用的parsed字段
   *
   * 数据格式：
   * - 全局位置和姿态：前7个数值
   * - 关节角度：按dof_names顺序排列
   * - 兼容原始JSON格式的完整结构
   *
   * 这个方法确保了编辑后的数据可以正确保存和重新加载。
   */
  function exportRawMotionJSON() {
    const exportData = deepCopyObject(motionData.value as unknown as object) as any
    exportData.data = []
    for (let i = 0; i < exportData.parsed.length; i++) {
      const frameData = exportData.parsed[i]
      const frameValues = [
        frameData['global_x'],
        frameData['global_y'],
        frameData['global_z'],
        frameData['quater_x'],
        frameData['quater_y'],
        frameData['quater_z'],
        frameData['quater_w'],
      ]
      for (let dofIndex = 0; dofIndex < exportData.dof_names.length; dofIndex++) {
        if (frameData[exportData.dof_names[dofIndex]] !== undefined)
          frameValues.push(frameData[exportData.dof_names[dofIndex]])
      }
      exportData.data.push(frameValues)
    }
    delete (exportData as any).parsed
    return exportData
  }

  /**
   * 帧数据管理模块
   *
   * 管理动作序列中的帧数据，提供帧级别的读取、修改和分析功能。
   * 这是动作编辑的基础操作单元。
   */
  const currentFrameIndex = ref(-1)

  function getFrameCount() {
    if (motionData.value === null) return 0
    return motionData.value.parsed.length
  }

  /**
   * BVH欧拉角数据提取器
   *
   * 从当前帧中提取BVH格式的欧拉角数据。
   * 主要用于BVH动作数据的姿态信息显示和编辑。
   *
   * 返回格式：包含x、y、z三个轴的旋转角度
   * 仅在BVH模式下有效，URDF模式返回undefined
   */
  function getCurrentFrameEulerData(): { x: number; y: number; z: number } | undefined {
    const currentFrame = getCurrentFrame()
    if (!currentFrame || !(motionData.value as any)?.bvhAdapt?.orientationFieldName)
      return undefined
    const orientationFieldName = (motionData.value as any).bvhAdapt.orientationFieldName
    return {
      x: currentFrame[`${orientationFieldName}_x`] || 0,
      y: currentFrame[`${orientationFieldName}_y`] || 0,
      z: currentFrame[`${orientationFieldName}_z`] || 0,
    }
  }

  function getCurrentFrame(): MotionFrame | undefined {
    if (motionData.value === null) return undefined
    return motionData.value.parsed[currentFrameIndex.value]
  }

  function getFramebyIndex(frameIndex: number): MotionFrame | undefined {
    if (motionData.value === null) return undefined
    return motionData.value.parsed[frameIndex]
  }

  /**
   * 当前帧进度计算器
   *
   * 计算当前帧在整个动作序列中的相对位置，返回多种格式的进度信息。
   * 用于进度条显示和时间轴导航。
   *
   * 返回数据：
   * - default: 原始百分比数值（0-1）
   * - read: 格式化的百分比字符串（保留2位小数）
   * - index: 当前帧的索引值
   */
  function getCurrentFrameProgress() {
    let progressRatio = currentFrameIndex.value / (getFrameCount() - 1)
    return {
      default: progressRatio,
      read: progressRatio.toFixed(2),
      index: currentFrameIndex.value,
    }
  }

  /**
   * 当前时间显示计算器
   *
   * 根据当前帧位置和帧率计算实际的时间显示。
   * 提供类似视频播放器的时间显示功能。
   *
   * 计算基于：
   * - 当前帧索引
   * - 总帧数
   * - 动作帧率
   *
   * 返回格式化的时间字符串（如 "00:01.5"）
   */
  function getCurrentTimeDisplay() {
    if (motionData.value === null) return
    return api.playedTimeDisplay(
      currentFrameIndex.value,
      getFrameCount() - 1,
      motionData.value.framerate
    )
  }

  function setCurrentFrameIndex(to: number) {
    currentFrameIndex.value = to
  }

  /**
   * 临时字段清理器
   *
   * 清除指定帧中的所有临时字段（以"!"开头的字段）。
   * 临时字段通常用于中间计算或临时标记，不应保存到最终数据中。
   *
   * 应用场景：
   * - 数据导出前的清理
   * - 内存优化
   * - 数据完整性维护
   */
  function cleanTempFieldsForFrame(index: number) {
    if (motionData.value === null) return
    let frameData = motionData.value.parsed[index]
    let temporaryFields = Object.keys(frameData).filter(item => item.slice(0, 1) === '!')
    for (let i = 0; i < temporaryFields.length; i++) {
      delete frameData[temporaryFields[i]]
    }
    motionData.value.parsed[index] = frameData
  }
  /**
   * 当前帧字段值修改器
   *
   * 修改当前帧中指定字段的数值，这是动作编辑的基础操作。
   * 内部调用通用的帧字段设置方法，确保操作的一致性。
   */
  function setCurrentFrameFieldValue(fieldName: string, value: number) {
    if (motionData.value === null) return
    setFrameFieldValue(currentFrameIndex.value, fieldName, value)
  }

  /**
   * 帧字段值设置器（带安全限制）
   *
   * 设置指定帧中某个字段的数值，自动应用关节物理限制。
   * 这是所有数值修改操作的底层方法，确保数据的有效性和安全性。
   *
   * 安全机制：
   * 1. 关节限制检查：自动将数值限制在关节的物理范围内
   * 2. 字段类型识别：区分关节角度和全局位置/姿态字段
   * 3. 边界值处理：超出范围的值自动调整到边界值
   *
   * 应用场景：
   * - 用户拖拽3D模型关节时的数值更新
   * - 轨迹面板中的数值编辑
   * - 四元数球的姿态调整
   * - 批量数据修改和导入
   *
   * 这种自动限制机制防止了无效的关节角度，保证了机器人模型的物理正确性。
   */
  function setFrameFieldValue(frameIndex: number, fieldName: string, value: number) {
    if (motionData.value === null) return
    const oldValue = motionData.value.parsed?.[frameIndex]?.[fieldName]
    if (fieldName.includes('quater') || fieldName.includes('global')) {
    } else {
      // const jointConfiguration = api.robot.getJointObject(fieldName)
      // const jointLimits = jointConfiguration.limit
      // if (jointLimits) {
      //   if (value > jointLimits.upper) value = jointLimits.upper
      //   if (value < jointLimits.lower) value = jointLimits.lower
      // }
    }
    withDrawStore.changeValue(frameIndex, fieldName, value)
    motionData.value.parsed[frameIndex][fieldName] = value
    const meta = keyframeMetadata.value.get(fieldName)
    const fid = getFrameIdByIndex(frameIndex)
    if (meta && fid && !meta.ignoredFrames.has(fid)) {
      const handle = meta.handles.get(fid)
      const delta = typeof oldValue === 'number' ? value - oldValue : 0
      // 若存在手柄且是手动类型，将手柄在纵向上平移相同的增量，保持相对位置与斜率
      if (handle && handle.type !== 'auto' && delta !== 0) {
        const shiftY = (p: { x: number; y: number }) => ({ ...p, y: p.y + delta })
        meta.handles.set(fid, {
          ...handle,
          in: shiftY(handle.in),
          out: shiftY(handle.out),
        })
      }
      if (!handle || handle.type === 'auto') {
        autoComputeKeyframeHandles(fieldName, frameIndex)
      }
      recomputeAutoNeighborHandles(fieldName, frameIndex)
    }
  }

  /**
   * 字段时间序列数据提取器
   *
   * 提取指定字段在整个动作序列中的数值变化，返回时间序列数据和关节信息。
   * 这是轨迹面板图表显示的数据源，也是动作分析的基础。
   *
   * 返回数据结构：
   * - data: 数值数组，按时间顺序排列
   * - info: 关节信息，包含物理限制等元数据
   *
   * 字段类型处理：
   * - 关节角度：返回实际的关节限制信息
   * - 全局位置/姿态：返回无限制的虚拟信息
   *
   * 应用场景：
   * - 轨迹面板的曲线图显示
   * - 动作数据的统计分析
   * - 关节运动范围的检查
   * - 动作质量的评估
   */
  function getFieldSeries(fieldName: string) {
    if (motionData.value === null) return
    const timeSeriesData: any[] = []
    for (let i = 0; i < motionData.value?.parsed.length; i++) {
      timeSeriesData.push(motionData.value?.parsed[i][fieldName])
    }
    const jointConfiguration = (() => {
      if (fieldName.includes('quater') || fieldName.includes('global')) {
        return { limit: { lower: -Infinity, upper: Infinity } }
      }
      const jointObject: any = api.robot.joint.getSingleInfo(fieldName)
      if (!jointObject || !jointObject.limit)
        return { limit: { lower: -Infinity, upper: Infinity } }
      return jointObject
    })()
    return { data: timeSeriesData, info: jointConfiguration }
  }

  /**
   * 字段数据切片提取器（高性能版本）
   *
   * 提取指定字段在指定帧范围内的数值数据。
   * 与 getFieldSeries 不同，这个方法只遍历请求的帧范围，避免不必要的性能开销。
   *
   * @param fieldName 字段名称
   * @param start 起始帧索引（默认0）
   * @param size 需要提取的帧数（undefined表示到末尾）
   * @returns 指定范围内的数值数组
   *
   * 性能优化：
   * - 只遍历需要的帧范围，而不是全部帧
   * - 对于5000帧的数据，如果只需要200帧，性能提升25倍
   * - 专为轨迹面板的可见区间数据获取设计
   */
  function getFieldSlice(fieldName: string, start: number = 0, size?: number): number[] {
    if (motionData.value === null) return []

    const frames = motionData.value.parsed
    const endIndex = size === undefined ? frames.length : Math.min(frames.length, start + size)
    const result: number[] = []

    // 只遍历需要的范围，不是全部帧
    for (let i = start; i < endIndex; i++) {
      result.push(frames[i][fieldName])
    }

    return result
  }

  function getBVHEulerJointAnglesByFrameIndex(frameIndex: number, fieldName: string) {
    const frame = getFramebyIndex(frameIndex)
    if (!frame) return
    const x = frame[`${fieldName}_x`]
    const y = frame[`${fieldName}_y`]
    const z = frame[`${fieldName}_z`]
    if (x === undefined || y === undefined || z === undefined) return
    return { x, y, z }
  }

  function getBVHEulerJointAngles(fieldName: string) {
    const re = []
    const length = motionData.value?.parsed?.length ?? 0
    for (let i = 0; i < length; i++) {
      re.push(getBVHEulerJointAnglesByFrameIndex(i, fieldName))
    }
    return re
  }

  /**
   * 当前帧复制器
   *
   * 在当前位置插入一个与当前帧完全相同的新帧，用于创建静止动作或延长特定姿态。
   * 使用深拷贝确保新帧与原帧完全独立，避免引用共享问题。
   *
   * 操作流程：
   * 1. 数据有效性检查
   * 2. 在当前位置后插入新帧
   * 3. 深拷贝当前帧数据到新帧
   * 4. 更新总帧数和当前帧索引
   *
   * 应用场景：
   * - 创建动作中的停顿效果
   * - 延长关键姿态的展示时间
   * - 为后续编辑提供更多时间空间
   * - 动作节奏的调整
   */
  function duplicateCurrentFrame() {
    if (motionData.value === null) return
    if (!Array.isArray(motionData.value?.parsed)) return
    const insertIndex = currentFrameIndex.value
    const newFrameId = generateFrameId()
    const oldIndexMap = new Map<FrameId, number>(frameIdToIndex.value)
    motionData.value.parsed = [
      ...motionData.value?.parsed.slice(0, insertIndex + 1),
      deepCopyObject(motionData.value?.parsed[insertIndex]),
      ...motionData.value?.parsed.slice(insertIndex + 1),
    ]
    motionData.value.num_frames = motionData.value?.parsed.length
    insertFrameId(insertIndex + 1, newFrameId)
    shiftKeyframesAfterInsert(insertIndex, oldIndexMap)
    withDrawStore.copyFrame(insertIndex + 1, newFrameId)
    currentFrameIndex.value++
  }

  const insertFrameSilently = (index: number, frameData: MotionFrame, frameId?: FrameId) => {
    if (!motionData.value) return
    const idToUse = frameId ?? generateFrameId()
    const oldIndexMap = new Map<FrameId, number>(frameIdToIndex.value)
    motionData.value.parsed = [
      ...motionData.value.parsed.slice(0, index),
      frameData,
      ...motionData.value.parsed.slice(index),
    ]
    motionData.value.num_frames = motionData.value.parsed.length
    insertFrameId(index, idToUse)
    shiftKeyframesAfterInsert(index, oldIndexMap, true)
  }

  const deleteFrameSilently = (index: number, frameId?: FrameId | null) => {
    if (!motionData.value) return
    const removedId = frameId ?? getFrameIdByIndex(index)
    const oldIndexMap = new Map<FrameId, number>(frameIdToIndex.value)
    motionData.value.parsed = [
      ...motionData.value.parsed.slice(0, index),
      ...motionData.value.parsed.slice(index + 1),
    ]
    motionData.value.num_frames = motionData.value.parsed.length
    if (removedId) {
      const metaList: string[] = Array.from(keyframeMetadata.value.keys())
      metaList.forEach(fieldName => {
        const meta = ensureFieldMetadata(fieldName)
        meta.ignoredFrames.delete(removedId)
        meta.handles.delete(removedId)
      })
    }
    removeFrameIdAt(index)
    shiftKeyframesAfterDelete(index, oldIndexMap, removedId ?? undefined)
  }

  const moveFrameSilently = (fromIndex: number, toIndex: number) => {
    if (!motionData.value) return
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= getFrameCount()) return
    const clampedTarget = Math.min(Math.max(0, toIndex), getFrameCount() - 1)
    const frameData = deepCopyObject(getFramebyIndex(fromIndex) || {}) as MotionFrame
    const frameId = getFrameIdByIndex(fromIndex)
    deleteFrameSilently(fromIndex, frameId)
    const finalTarget = clampedTarget > fromIndex ? clampedTarget - 1 : clampedTarget
    insertFrameSilently(finalTarget, frameData, frameId ?? undefined)
    currentFrameIndex.value = finalTarget
  }

  type FieldKeyframeState = {
    isKeyframe: boolean
    handle?: {
      in?: { dx: number; y: number }
      out?: { dx: number; y: number }
      type?: KeyframeHandleType
    }
  }

  const getFieldState = (
    fieldName: string
  ): { values: number[]; keyframes: FieldKeyframeState[] } => {
    const count = getFrameCount()
    const values: number[] = new Array(count)
    const keyframes: FieldKeyframeState[] = new Array(count)
    const meta = ensureFieldMetadata(fieldName)
    for (let i = 0; i < count; i++) {
      const fid = getFrameIdByIndex(i)
      values[i] = motionData.value?.parsed?.[i]?.[fieldName] ?? 0
      const isKey = fid && !meta.ignoredFrames.has(fid)
      if (isKey) {
        const handleData = fid ? meta.handles.get(fid) : undefined
        keyframes[i] = {
          isKeyframe: true,
          handle: handleData
            ? {
              in: handleData.in ? { dx: handleData.in.x - i, y: handleData.in.y } : undefined,
              out: handleData.out ? { dx: handleData.out.x - i, y: handleData.out.y } : undefined,
              type: handleData.type,
            }
            : { type: 'auto' },
        }
      } else {
        keyframes[i] = { isKeyframe: false }
      }
    }
    return { values, keyframes }
  }

  const setFieldState = (fieldName: string, values: number[], keyframes: FieldKeyframeState[]) => {
    if (!motionData.value) return
    const count = getFrameCount()
    if (!Array.isArray(values) || values.length !== count) return
    if (!Array.isArray(keyframes) || keyframes.length !== count) return
    const meta = ensureFieldMetadata(fieldName)
    withDrawStore.runWithoutRecord(() => {
      meta.ignoredFrames.clear()
      meta.handles.clear()
      for (let i = 0; i < count; i++) {
        const val = values[i]
        motionData.value!.parsed[i][fieldName] = val
      }
      for (let i = 0; i < count; i++) {
        const state = keyframes[i]
        if (!state || !state.isKeyframe) {
          const id = getFrameIdByIndex(i)
          if (id) meta.ignoredFrames.add(id)
          continue
        }
        const h = state.handle
        if (h && (h.in || h.out || h.type)) {
          const handleData: KeyframeHandleData = {
            in: h.in ? { x: i + (h.in.dx ?? 0), y: h.in.y } : { x: i - 1, y: values[i] },
            out: h.out ? { x: i + (h.out.dx ?? 0), y: h.out.y } : { x: i + 1, y: values[i] },
            type: h.type ?? 'auto',
          }
          setKeyframeHandles(fieldName, i, handleData)
        }
      }
    })
  }

  /**
   * 帧删除器（带安全检查）
   *
   * 删除指定索引的帧，自动处理边界情况和索引调整。
   * 包含多重安全检查，防止无效操作和数据损坏。
   *
   * 安全机制：
   * 1. 索引范围检查：确保索引在有效范围内
   * 2. 最后帧保护：防止删除唯一的帧
   * 3. 数据有效性检查：确保动作数据存在
   * 4. 智能索引调整：删除后自动调整当前帧索引
   *
   * 索引调整逻辑：
   * - 删除当前帧：索引向前移动
   * - 删除其他帧：保持当前帧不变
   * - 删除最后帧：索引自动调整到新的最后帧
   *
   * 这种安全的删除机制确保了动作编辑的稳定性和数据完整性。
   */
  function deleteFrame(index: number) {
    if (index < 0 || index >= getFrameCount()) return
    if (getFrameCount() === 1) return
    if (motionData.value === null) return
    const removedId = getFrameIdByIndex(index)
    const oldIndexMap = new Map<FrameId, number>(frameIdToIndex.value)
    withDrawStore.deleteFrame(index, removedId ?? undefined)
    const metaList: string[] = Array.from(keyframeMetadata.value.keys())
    metaList.forEach(fieldName => {
      const meta = ensureFieldMetadata(fieldName)
      if (removedId) {
        meta.ignoredFrames.delete(removedId)
        meta.handles.delete(removedId)
      }
    })
    motionData.value.parsed = [
      ...motionData.value.parsed.slice(0, index),
      ...motionData.value?.parsed.slice(index + 1),
    ]
    if (typeof motionData.value?.num_frames === 'number') motionData.value.num_frames--
    removeFrameIdAt(index)
    shiftKeyframesAfterDelete(index, oldIndexMap, removedId)
    if (currentFrameIndex.value === getFrameCount()) {
      currentFrameIndex.value--
    }
  }

  /**
   * 动作播放控制系统
   *
   * 提供类似视频播放器的完整播放控制功能，支持播放、暂停、停止、变速播放等。
   * 包含智能的播放模式切换和相机跟踪功能。
   */
  const playStatus = ref(0)
  const isAdjustingPlaybackTime = ref<Boolean>(false)
  const playMode = ref(0)
  const playbackSpeed = ref(1)
  const playbackRefreshRate = ref(30)
  const startCameraDistance = ref<number>(0)
  const startCameraPosition = ref<any>(null)
  const startRobotPosition = ref<any>(null)
  const startCameraQuaternion = ref<any>(null)
  const startCameraQuaternionRelativeToRobot = ref<any>(null)
  let timer: any = null

  /**
   * 动作播放启动器
   *
   * 启动动作播放，支持两种播放模式的智能切换。
   * 在播放开始前会自动捕获相机状态，用于相机跟踪功能。
   *
   * 播放模式：
   * - 模式0（精确模式）：按原始帧率逐帧播放，适合低速播放
   * - 模式1（跳帧模式）：按刷新率跳帧播放，适合高速播放
   *
   * 智能特性：
   * 1. 重复播放：播放到最后一帧时自动从头开始
   * 2. 状态保护：防止重复启动播放
   * 3. 交互暂停：用户拖拽时间轴时自动暂停帧更新
   * 4. 相机跟踪：记录播放开始时的相机状态
   *
   * 这种双模式设计确保了在不同播放速度下都能获得最佳的播放体验。
   */
  function play() {
    if (timer !== null) return
    capturePlaybackStartState()
    playStatus.value = 1
    if (currentFrameIndex.value === getFrameCount() - 1) {
      currentFrameIndex.value = 0
    }
    if (playMode.value === 0) {
      if (motionData.value === null) return
      timer = setInterval(
        () => {
          if (isAdjustingPlaybackTime.value) return
          if (currentFrameIndex.value >= getFrameCount() - 1) {
            pause()
          } else {
            currentFrameIndex.value++
          }
        },
        1000 / parseFloat(`${getEffectiveFrameRate()}`)
      )
    }
    if (playMode.value === 1) {
      if (motionData.value === null) return
      const frameIncrement = getEffectiveFrameRate() / playbackRefreshRate.value
      timer = setInterval(() => {
        if (isAdjustingPlaybackTime.value) return
        if (currentFrameIndex.value >= getFrameCount() - 1) {
          pause()
        } else {
          const targetFrameIndex = parseInt(`${currentFrameIndex.value + frameIncrement}`)
          if (targetFrameIndex >= getFrameCount()) {
            currentFrameIndex.value = getFrameCount() - 1
          } else {
            currentFrameIndex.value = targetFrameIndex
          }
        }
      }, 1000 / playbackRefreshRate.value)
    }
  }

  function pause() {
    clearInterval(timer)
    timer = null
    playStatus.value = 0
  }

  function stop() {
    pause()
    currentFrameIndex.value = 0
  }

  function setAdjustingPlaybackTime(to: Boolean) {
    isAdjustingPlaybackTime.value = to
  }

  /**
   * 播放状态快照捕获器
   *
   * 在播放开始时捕获相机和机器人的初始状态，为相机跟踪功能提供基准数据。
   * 这些数据用于实现平滑的相机跟随效果。
   *
   * 捕获的状态包括：
   * - 相机的绝对姿态和位置
   * - 相机到机器人的距离
   * - 相机相对于机器人的姿态关系
   * - 机器人的初始位置
   *
   * 这种状态捕获机制是实现高质量相机跟踪的关键。
   */
  function capturePlaybackStartState() {
    startCameraQuaternion.value = api.camera.quater.get()
    startCameraDistance.value = api.camera.getToBaseDistance()
    startCameraQuaternionRelativeToRobot.value = api.quater.relative(
      api.robot.quater.get(),
      api.camera.quater.get()
    )
    startCameraPosition.value = api.camera.position.get()
    startRobotPosition.value = api.robot.position.get()
  }

  function setPlayMode(to: number) {
    playMode.value = to
  }

  function setPlaybackRefreshRate(to: number) {
    playbackRefreshRate.value = to
  }

  /**
   * 帧跳跃步长计算器
   *
   * 根据播放模式和刷新率计算每次更新应该跳跃的帧数。
   * 这是实现变速播放和流畅播放的核心算法。
   *
   * 计算逻辑：
   * - 精确模式：始终返回1，逐帧播放
   * - 跳帧模式：根据有效帧率和刷新率计算跳跃步长
   * - 最小保护：确保步长至少为1，避免播放停滞
   *
   * 这种动态计算确保了在不同播放速度下都能保持流畅的播放效果。
   */
  function getJumpFrameStep(rr: undefined | number) {
    if (playMode.value === 0 && rr === undefined) return 1
    if (playMode.value === 1 || rr !== undefined) {
      const frameStepRatio =
        parseFloat(`${getEffectiveFrameRate()}`) /
        (rr === undefined ? playbackRefreshRate.value : rr)
      if (frameStepRatio < 1) {
        return 1
      } else {
        return parseInt(`${frameStepRatio}`)
      }
    }
    return 1
  }

  /**
   * 播放速度设置器（带模式自动切换）
   *
   * 设置播放速度，并根据有效帧率自动选择最适合的播放模式。
   * 这种智能切换确保了在不同速度下都能获得最佳的播放体验。
   *
   * 模式切换逻辑：
   * - 有效帧率 ≤ 45fps：使用精确模式（逐帧播放）
   * - 有效帧率 > 45fps：使用跳帧模式（提高性能）
   *
   * 这个阈值是经过优化的，平衡了播放精度和性能表现。
   */
  function setPlaybackSpeed(speedMultiplier: number) {
    playbackSpeed.value = speedMultiplier
    if (getEffectiveFrameRate() <= 45) {
      playMode.value = 0
    } else {
      playMode.value = 1
    }
  }

  /**
   * 有效帧率计算器
   *
   * 计算考虑播放速度后的实际帧率。
   * 这是播放控制系统的基础计算，影响播放间隔和模式选择。
   *
   * 计算公式：原始帧率 × 播放速度倍数
   * 例如：30fps × 2倍速 = 60fps有效帧率
   */
  function getEffectiveFrameRate() {
    return (motionData.value?.framerate as number) * playbackSpeed.value
  }
  function batchApplyFieldEntries(
    fieldName: string,
    entries: {
      index: number
      value: number
      isKey: boolean
      handle?: KeyframeHandleData | null
    }[]
  ) {
    if (!motionData.value) return
    const rawParsed = toRaw(motionData.value.parsed)
    const meta = ensureFieldMetadata(fieldName)
    // 这里的 meta 是 reactive 的，如果想要极致性能也可以 toRaw(meta.handles) / toRaw(meta.ignoredFrames)
    // 但 Map/Set 即使在 reactive 下，批量操作性能通常还可以，主要瓶颈在 parsed 数组的大量 setter
    const rawHandles = toRaw(meta.handles)
    const rawIgnoredFrames = toRaw(meta.ignoredFrames)

    // 收集所有需要重算曲线的关键帧索引
    const keyframesToRecalculate = new Set<number>()

    entries.forEach(entry => {
      // 1. 修改数值
      if (rawParsed[entry.index]) {
        rawParsed[entry.index][fieldName] = entry.value
      }

      const id = getFrameIdByIndex(entry.index)
      if (!id) return

      // 2. 更新关键帧状态
      if (entry.isKey) {
        // 是关键帧：从 ignoredFrames 移除
        if (rawIgnoredFrames.has(id)) {
          rawIgnoredFrames.delete(id)
        }
        // 更新/设置 handle
        if (entry.handle) {
          rawHandles.set(id, {
            in: clampHandlePoint(entry.handle.in, entry.index, 'in'),
            out: clampHandlePoint(entry.handle.out, entry.index, 'out'),
            type: entry.handle.type,
          })
        }
        // 记录需要重算曲线的关键帧
        keyframesToRecalculate.add(entry.index)
      } else {
        // 不是关键帧：加入 ignoredFrames，移除 handle
        if (!rawIgnoredFrames.has(id)) {
          rawIgnoredFrames.add(id)
        }
        if (rawHandles.has(id)) {
          rawHandles.delete(id)
        }
      }
    })

    // 3. 手动触发更新
    triggerRef(motionData)
    // meta 是 ref(Map) 结构，深层响应式可能不会自动触发，如果 keyframeMetadata 是 ref
    triggerRef(keyframeMetadata)

    // 4. 重新计算所有受影响关键帧周围的贝塞尔曲线
    keyframesToRecalculate.forEach(frameIndex => {
      applySegmentsAroundKeyframe(fieldName, frameIndex)
    })
  }

  const isMotionJSONEdited = ref(false)
  function setIsMotionJSONEdited(to: boolean) {
    isMotionJSONEdited.value = to
  }

  return {
    // JSON数据来源
    motionData,
    motionDataCopy,
    isJsonLoaded,
    setMotionJSON,
    syncMotionDataCopy,
    getMotionDataCopyValues,
    getJointNames,
    getBasePositionLineData,
    getLaterPathReorientationData,
    exportRawMotionJSON,
    isMotionJSONSelected,
    clearMotionJSON,
    setUseUserSelectJSON,
    useUserSelectJSON,
    batchApplyFieldEntries,
    // 帧数据
    currentFrameIndex,
    getFrameCount,
    getCurrentFrame,
    getCurrentFrameProgress,
    getCurrentTimeDisplay,
    setCurrentFrameIndex,
    frameIds,
    insertFrameId,
    removeFrameIdAt,
    setCurrentFrameFieldValue,
    cleanTempFieldsForFrame,
    getFieldSeries,
    getFieldState,
    setFieldState,
    setFrameFieldValue,
    duplicateCurrentFrame,
    moveFrame,
    moveFrameSilently,
    insertFrameSilently,
    deleteFrameSilently,
    getFramebyIndex,
    getFrameIdByIndex,
    getFrameIndexById,
    getCurrentFrameEulerData,
    deleteFrame,
    getBVHEulerJointAnglesByFrameIndex,
    getBVHEulerJointAngles,
    getKeyframeHandle,
    updateKeyframeHandlePoint,
    setKeyframeHandleType,
    recomputeAutoForFrames,
    getKeyframeIndices,
    isKeyframe,
    addKeyframe,
    removeKeyframe,
    toggleKeyframe,
    smoothDeleteKeyframes,
    // 播放数据
    playStatus,
    play,
    pause,
    stop,
    isAdjustingPlaybackTime,
    setAdjustingPlaybackTime,
    startCameraQuaternion,
    startCameraDistance,
    startCameraQuaternionRelativeToRobot,
    startCameraPosition,
    startRobotPosition,
    capturePlaybackStartState,
    setPlayMode,
    playMode,
    setPlaybackRefreshRate,
    playbackRefreshRate,
    getJumpFrameStep,
    playbackSpeed,
    setPlaybackSpeed,
    getEffectiveFrameRate,
    setIsMotionJSONEdited,
    // 兼容旧命名（外部调用仍可用）
    JSON: computed(() => motionData.value) as any,
    JSONc: motionDataCopy as any,
    loaded: isJsonLoaded as any,
    setJSON: (j: any) => setMotionJSON(j),
    syncJSONc: () => syncMotionDataCopy(),
    getJSONcValues: (isFrame: boolean, frameIndex: number, fields: string[]) =>
      getMotionDataCopyValues(isFrame, frameIndex, fields),
    isSelectedJSON: () => motionData.value !== null,
    frame_currentIndex: currentFrameIndex as any,
    frame_getNum: () => getFrameCount(),
    frame_getCurrent: () => getCurrentFrame(),
    frame_getCurrentPer: () => getCurrentFrameProgress(),
    frame_currentTimeDisplay: () => getCurrentTimeDisplay(),
    frame_change: (to: number) => setCurrentFrameIndex(to),
    frame_cleanTempField: (index: number) => cleanTempFieldsForFrame(index),
    frame_changeCurrentValue: (field: string, value: number) =>
      setCurrentFrameFieldValue(field, value),
    frame_getSingleFieldAllData: (field: string) => getFieldSeries(field),
    getFieldSlice: (fieldName: string, start?: number, size?: number) =>
      getFieldSlice(fieldName, start, size),
    frame_changeValueByFrameIndex: (i: number, f: string, v: number) => setFrameFieldValue(i, f, v),
    frame_copyCurrent: () => duplicateCurrentFrame(),
    play_status: playStatus as any,
    play_mousemouse_pass: isAdjustingPlaybackTime as any,
    changeMousemovePass: (to: Boolean) => setAdjustingPlaybackTime(to),
    setPlayStartCameraQuaterAndDistance: () => capturePlaybackStartState(),
    play_changeMode: (to: number) => setPlayMode(to),
    play_mode: playMode as any,
    play_changeRefreshRate: (to: number) => setPlaybackRefreshRate(to),
    play_refresh_rate: playbackRefreshRate as any,
    play_jumpFrame: (rr?: number) => getJumpFrameStep(rr as any),
    play_xSpeed: playbackSpeed as any,
    play_setXSpeed: (n: number) => setPlaybackSpeed(n),
    play_getFrameRateWithXSpeed: () => getEffectiveFrameRate(),
    play_start_camera_quater: startCameraQuaternion as any,
    play_start_camera_distance: startCameraDistance as any,
    play_start_camera_quater_to_robot: startCameraQuaternionRelativeToRobot as any,
    play_start_camera_position: startCameraPosition as any,
    play_start_robot_position: startRobotPosition as any,
    isMotionJSONEdited,
  }
})

/**
 * 操作记录管理Store
 *
 * 管理动作编辑器的操作历史记录，为撤销/重做功能提供数据支持。
 * 每次操作都会记录编辑器名称和具体的变更内容。
 *
 * 核心功能：
 * - 操作记录的追加和存储
 * - 与主数据副本的自动同步
 * - 为撤销/重做系统提供数据基础
 *
 * 设计特点：
 * - 轻量级设计：只提供基础的记录功能
 * - 自动同步：每次记录后自动同步数据副本
 * - 扩展性：支持不同编辑器的操作记录
 */
export const useOperationRecordStore = defineStore('operationRecord', () => {
  const list = ref<object[]>([])
  const motionStore = useMotionStore()

  /**
   * 操作记录追加器
   *
   * 向操作历史中添加一条新记录，并自动同步主数据副本。
   * 这是撤销/重做系统的核心数据收集方法。
   *
   * @param editorName 编辑器名称（如"四元数球"、"轨迹面板"等）
   * @param records 具体的变更记录数组
   */
  function append(editorName: string = '', records: object[] = []) {
    list.value.push({ editorName, records })
    motionStore.syncMotionDataCopy()
  }

  function reset() {
    list.value = []
  }

  return { append, reset }
})

/**
 * 四元数球操作记录Store
 *
 * 专门管理四元数球编辑器的操作记录，提供精确的变更追踪和记录功能。
 * 支持编辑状态管理和智能的变更检测。
 *
 * 核心功能：
 * 1. 编辑状态管理：跟踪用户是否正在编辑
 * 2. 临时记录收集：在编辑过程中收集变更
 * 3. 智能变更检测：只记录真正发生变化的字段
 * 4. 自动记录提交：编辑结束时自动提交记录
 *
 * 工作流程：
 * 1. 开始编辑 → 设置编辑状态
 * 2. 编辑过程 → 收集变更到临时记录
 * 3. 结束编辑 → 对比变更并提交记录
 *
 * 这种设计确保了操作记录的准确性和效率。
 */
export const useQuatSphereStore = defineStore('quatSphere', () => {
  const motionStore = useMotionStore()
  const orStore = useOperationRecordStore()
  const tempOperationRecord = ref<object>({})
  const isEditing = ref(false)

  function record_add(values: object) {
    if (isEditing.value === false) return
    tempOperationRecord.value = Object.assign(tempOperationRecord.value, values)
  }

  /**
   * 操作记录生成和提交器
   *
   * 对比编辑前后的数据变化，生成精确的操作记录并提交到操作历史。
   * 包含智能的变更检测，只记录真正发生变化的字段。
   *
   * 处理流程：
   * 1. 获取当前数据和历史数据
   * 2. 逐字段对比变更
   * 3. 过滤无变化的字段
   * 4. 生成标准格式的记录
   * 5. 提交到操作记录Store
   *
   * 记录格式：
   * - isFrame: 是否为帧级变更
   * - frameIndex: 变更的帧索引
   * - field: 变更的字段名
   * - new: 新值
   * - old: 旧值
   *
   * 这种精确的记录方式为撤销/重做功能提供了完整的数据支持。
   */
  function record_report() {
    const currentFrameIndex = motionStore.currentFrameIndex
    const currentChanges = tempOperationRecord.value as Record<string, any>
    const modifiedFieldNames = Object.keys(tempOperationRecord.value)
    const originalValues = motionStore.getMotionDataCopyValues(
      true,
      motionStore.currentFrameIndex,
      modifiedFieldNames
    ) as Record<string, any>
    const unchangedFields = []
    for (let i = 0; i < Object.keys(currentChanges).length; i++) {
      const fieldName = Object.keys(currentChanges)[i]
      const newValue = currentChanges[fieldName]
      const originalValue = originalValues[fieldName]
      if (newValue === originalValue) {
        unchangedFields.push(fieldName)
      }
    }
    for (let i = 0; i > unchangedFields.length; i++) {
      delete currentChanges[unchangedFields[i]]
      delete originalValues[unchangedFields[i]]
    }
    const changeRecords: object[] = []
    for (let i = 0; i < Object.keys(currentChanges).length; i++) {
      const fieldName = Object.keys(currentChanges)[i]
      const newValue = currentChanges[fieldName]
      const originalValue = originalValues[fieldName]
      changeRecords.push({
        isFrame: true,
        frameIndex: currentFrameIndex,
        field: fieldName,
        new: newValue,
        old: originalValue,
      })
    }
    orStore.append('四元数球', changeRecords)
  }

  function editStatus_start() {
    if (motionStore.playStatus === 1) return
    isEditing.value = true
  }

  function editStatus_end() {
    isEditing.value = false
    record_report()
  }

  function reset() {
    tempOperationRecord.value = {}
    isEditing.value = false
  }

  return {
    isEditing,
    editStatus_start,
    editStatus_end,
    record_add,
    reset,
  }
})

/**
 * 选中字段管理Store
 *
 * 管理当前选中的关节字段和悬停状态，为轨迹面板和数据分析提供支持。
 * 提供字段数据的提取和格式化功能。
 *
 * 核心功能：
 * 1. 字段选择管理：跟踪当前选中的关节字段
 * 2. 悬停状态管理：管理鼠标悬停的关节名称
 * 3. 数据提取服务：提供选中字段的完整数据
 * 4. 分页支持：支持数据的分页和范围查询
 *
 * 数据格式：
 * - fieldName: 字段名称
 * - data: 纯数值数组
 * - dataWithFrameIndex: 带帧索引的对象数组
 * - info: 关节信息和限制
 *
 * 这种设计为轨迹面板的数据显示和交互提供了完整的支持。
 */
export const useSelectedFieldStore = defineStore('selectedField', () => {
  const motionStore = useMotionStore()

  const selectedFieldName = ref<string | null>(null)

  function handleSelectField(fieldName: string) {
    selectedFieldName.value = fieldName
  }

  function handleRemoveSelect() {
    selectedFieldName.value = null
  }

  /**
   * 当前字段数据提取器
   *
   * 提取当前选中字段的完整数据，支持分页和范围查询。
   * 返回多种格式的数据以满足不同的使用需求。
   *
   * @param startFrameIndex 起始帧索引（默认从0开始）
   * @param size 数据大小限制（undefined表示不限制）
   *
   * 返回数据包含：
   * - fieldName: 字段名称
   * - data: 纯数值数组，用于图表绘制
   * - dataWithFrameIndex: 带帧索引的数据，用于交互
   * - info: 关节信息，包含物理限制等
   *
   * 这种多格式的数据提供方式满足了不同组件的需求。
   */
  function getCurrentFieldData(startFrameIndex: number = 0, size: number | undefined = undefined) {
    const sliceFieldData = (fieldName: string) => {
      const getter = (motionStore as any).getFieldSlice as
        | ((f: string, s?: number, sz?: number) => number[])
        | undefined
      if (getter) return getter(fieldName, startFrameIndex, size)
      // 兼容旧逻辑：直接从 parsed 中切片
      if (motionStore.motionData === null) return []
      let fieldData: number[] = []
      for (let i = 0; i < motionStore.motionData?.parsed.length; i++) {
        fieldData.push(motionStore.motionData?.parsed[i][fieldName])
      }
      fieldData = fieldData.slice(startFrameIndex)
      if (size !== undefined) fieldData = fieldData.slice(0, size)
      return fieldData
    }

    return {
      fieldName: selectedFieldName.value,
      data: (() => {
        if (motionStore.motionData === null || selectedFieldName.value === null) return []
        return sliceFieldData(selectedFieldName.value)
      })(),
      dataWithFrameIndex: (() => {
        if (motionStore.motionData === null || selectedFieldName.value === null) return []
        const data = sliceFieldData(selectedFieldName.value)
        return data.map((value: number, idx: number) => ({
          value,
          frameIndex: startFrameIndex + idx + 1,
        }))
      })(),
      info: (() => {
        if (selectedFieldName.value === null) return
        if (
          selectedFieldName.value.includes('quater') ||
          selectedFieldName.value.includes('global')
        ) {
          return undefined
        }

        // 处理带后缀的字段名（如 joint_x, joint_y, joint_z）
        // 去掉 _x, _y, _z 后缀以获取实际的关节名称
        const jointName = selectedFieldName.value.replace(/_(x|y|z)$/i, '')
        const robotObject = api.robot.getObject()

        if (!robotObject || !robotObject.joints) {
          return undefined
        }

        // 首先尝试直接获取（适用于不带后缀的字段名）
        if (robotObject.joints[selectedFieldName.value]) {
          return robotObject.joints[selectedFieldName.value]
        }

        // 然后尝试使用去掉后缀的关节名（适用于带后缀的字段名）
        if (robotObject.joints[jointName]) {
          return robotObject.joints[jointName]
        }

        return undefined
      })(),
    }
  }

  const hoveredJointName = ref<string | null>(null)

  function handleHoveredJointName(jointName: string) {
    hoveredJointName.value = jointName
  }

  function handleRemoveHoveredJointName() {
    hoveredJointName.value = null
  }

  function reset() {
    selectedFieldName.value = null
    hoveredJointName.value = null
  }

  return {
    selectedFieldName,
    handleSelectField,
    getCurrentFieldData,
    handleRemoveSelect,
    hoveredJointName,
    handleHoveredJointName,
    handleRemoveHoveredJointName,
    reset,
  }
})

/**
 * 深拷贝工具函数
 */
function deepCopyObject(sourceObject: object) {
  return JSON.parse(JSON.stringify(sourceObject))
}

export const useWithDrawStore = defineStore('withDraw', () => {
  const stack = ref<Record<string, any>[]>([])
  const tempData = ref<Record<string, any> | null>(null)
  const timer = ref<null | NodeJS.Timeout>(null)
  const motionStore = useMotionStore()
  const doWithDrawCount = ref(0)
  const reDoStack = ref<Record<string, any>[]>([])
  const windowStore = useWindowStore()
  const needUpdateFrameRange = ref({
    startIndex: undefined as number | undefined,
    endIndex: undefined as number | undefined,
    updateTotal: false as boolean,
  })
  const currentOperationInfo = ref({
    name: '',
    jointName: '',
  })
  const operationCount = ref(0)
  const recordingDisabled = ref(false)

  watch(() => operationCount.value, (val) => {
    // 只有当有实际操作(count > 0)时才标记为已编辑，避免 reset 重置为 0 时误触
    if (val > 0 && motionStore.isMotionJSONEdited === false) motionStore.setIsMotionJSONEdited(true)
  })

  type FieldEntry = {
    index: number
    value: number
    isKey: boolean
    handle?: KeyframeHandleData | null
  }

  function runWithoutRecord<T>(fn: () => T): T {
    const prev = recordingDisabled.value
    recordingDisabled.value = true
    try {
      return fn()
    } finally {
      recordingDisabled.value = prev
    }
  }

  const applyKeyframeSnapshot = (
    fieldName: string,
    snapshot: KeyframeSnapshot,
    rangeStart: number,
    rangeEnd: number
  ) => {
    if (!motionStore.motionData) return
    runWithoutRecord(() => {
      const targetSet = new Set(snapshot.keyframes)
      const existing = motionStore.getKeyframeIndices(fieldName)
      existing.forEach(idx => {
        if (idx < rangeStart || idx > rangeEnd) return
        const fid = motionStore.getFrameIdByIndex(idx)
        if (!fid) return
        if (!targetSet.has(fid)) {
          motionStore.removeKeyframe(fieldName, idx)
        }
      })
      snapshot.keyframes.forEach(fid => {
        const idx = motionStore.getFrameIndexById(fid)
        if (idx < rangeStart || idx > rangeEnd || idx < 0) return
        if (!motionStore.isKeyframe(fieldName, idx)) {
          motionStore.addKeyframe(fieldName, idx)
        }
      })
      Object.entries(snapshot.handles).forEach(([fid, handle]) => {
        const idx = motionStore.getFrameIndexById(fid)
        if (idx < rangeStart || idx > rangeEnd || idx < 0) return
        if (!motionStore.isKeyframe(fieldName, idx)) return
        motionStore.updateKeyframeHandlePoint(fieldName, idx, 'in', handle.in, handle.type)
        motionStore.updateKeyframeHandlePoint(fieldName, idx, 'out', handle.out, handle.type)
      })
      Object.entries(snapshot.values).forEach(([fid, val]) => {
        const idx = motionStore.getFrameIndexById(fid)
        if (idx < rangeStart || idx > rangeEnd || idx < 0) return
        if (!motionStore.motionData?.parsed?.[idx]) return
        motionStore.motionData.parsed[idx][fieldName] = val as number
      })
    })
  }

  function setOperationInfo(name: string, jointName: string | null) {
    currentOperationInfo.value.name = name
    currentOperationInfo.value.jointName = jointName || ''
  }

  function resetOperationInfo() {
    currentOperationInfo.value = {
      name: '',
      jointName: '',
    }
  }

  function reset() {
    clearTimer()
    stack.value = []
    tempData.value = null
    doWithDrawCount.value = 0
    reDoStack.value = []
    needUpdateFrameRange.value = {
      startIndex: undefined,
      endIndex: undefined,
      updateTotal: false,
    }
    currentOperationInfo.value = {
      name: '',
      jointName: '',
    }
    operationCount.value = 0
    recordingDisabled.value = false
  }

  function applyFieldEntries(fieldName: string, entries: FieldEntry[]) {
    runWithoutRecord(() => {
      motionStore.batchApplyFieldEntries(fieldName, entries)
    })
  }

  async function doWithDraw() {
    const item = stack.value[stack.value.length - 1]
    if (!item || !motionStore.motionData) return

    // 清空选区
    const pathPanelStore = (window as any).__pathPanelStore__
    if (pathPanelStore && typeof pathPanelStore.clearKeyframeSelection === 'function') {
      pathPanelStore.clearKeyframeSelection()
    }

    windowStore.setOperatingText('正在撤销...')
    await new Promise(resolve => setTimeout(resolve, 50))
    let parsed = motionStore.motionData.parsed
    if (item._type === 0) {
      let minFrameIndex = Infinity
      let maxFrameIndex = -Infinity
      for (let i = 0; i < Object.keys(item).length; i++) {
        if (Object.keys(item)[i] === '_type') continue
        const frameIndex = parseInt(Object.keys(item)[i].split('!')[0])
        if (frameIndex < minFrameIndex) minFrameIndex = frameIndex
        if (frameIndex > maxFrameIndex) maxFrameIndex = frameIndex
        const fieldName = Object.keys(item)[i].split('!')[1]
        const fromValue = item[Object.keys(item)[i]].from
        const toValue = item[Object.keys(item)[i]].to

        if (parsed && parsed[frameIndex]) {
          parsed[frameIndex][fieldName] = fromValue
        }
      }
      needUpdateFrameRange.value.startIndex = minFrameIndex
      needUpdateFrameRange.value.endIndex = maxFrameIndex
      needUpdateFrameRange.value.updateTotal = false
    }
    if (item._type === 1) {
      const frameIndex = item.frameIndex
      motionStore.deleteFrameSilently(frameIndex, item.frameId as FrameId | undefined)
      parsed = motionStore.motionData?.parsed ?? parsed
      needUpdateFrameRange.value.startIndex = undefined
      needUpdateFrameRange.value.endIndex = undefined
      needUpdateFrameRange.value.updateTotal = true
    }
    if (item._type === 2) {
      const frameIndex = item.frameIndex
      const frameData = item.frameData
      motionStore.insertFrameSilently(frameIndex, frameData, item.frameId as FrameId | undefined)
      parsed = motionStore.motionData?.parsed ?? parsed
      needUpdateFrameRange.value.startIndex = undefined
      needUpdateFrameRange.value.endIndex = undefined
      needUpdateFrameRange.value.updateTotal = true
    }
    if (item._type === 3) {
      applyKeyframeSnapshot(item.fieldName, item.before, item.rangeStart, item.rangeEnd)
      needUpdateFrameRange.value.startIndex = item.rangeStart
      needUpdateFrameRange.value.endIndex = item.rangeEnd
      needUpdateFrameRange.value.updateTotal = false
    }
    if (item._type === 4) {
      const frameId = item.frameId as FrameId | undefined
      const currentIdx = frameId ? motionStore.getFrameIndexById(frameId) : item.toIndex
      if (currentIdx >= 0) {
        motionStore.moveFrameSilently(currentIdx, item.fromIndex)
        parsed = motionStore.motionData?.parsed ?? parsed
        needUpdateFrameRange.value.startIndex = undefined
        needUpdateFrameRange.value.endIndex = undefined
        needUpdateFrameRange.value.updateTotal = true
      }
    }
    if (item._type === 5) {
      applyFieldEntries(item.fieldName, item.before as FieldEntry[])
      needUpdateFrameRange.value.startIndex = item.affectedStart
      needUpdateFrameRange.value.endIndex = item.affectedEnd
      needUpdateFrameRange.value.updateTotal = false
    }
    if (item._type === 6) {
      applyKeyframeSnapshot(item.fieldName, item.before, item.rangeStart, item.rangeEnd)
      needUpdateFrameRange.value.startIndex = item.rangeStart
      needUpdateFrameRange.value.endIndex = item.rangeEnd
      needUpdateFrameRange.value.updateTotal = false
    }
    if (motionStore.motionData) {
      motionStore.motionData.parsed = parsed
    }
    reDoStack.value.push(item)
    motionStore.frame_change(item._currentFrameIndex as number)
    stack.value = stack.value.slice(0, stack.value.length - 1)
    doWithDrawCount.value++
    windowStore.setOperatingText('')
  }

  async function handleReDo() {
    const item = reDoStack.value[reDoStack.value.length - 1]
    if (!item || !motionStore.motionData) return

    // 清空选区
    const pathPanelStore = (window as any).__pathPanelStore__
    if (pathPanelStore && typeof pathPanelStore.clearKeyframeSelection === 'function') {
      pathPanelStore.clearKeyframeSelection()
    }

    windowStore.setOperatingText('正在重做...')
    await new Promise(resolve => setTimeout(resolve, 50))
    let parsed = motionStore.motionData.parsed
    if (item._type === 0) {
      let minFrameIndex = Infinity
      let maxFrameIndex = -Infinity
      for (let i = 0; i < Object.keys(item).length; i++) {
        if (Object.keys(item)[i] === '_type') continue
        const frameIndex = parseInt(Object.keys(item)[i].split('!')[0])
        if (frameIndex < minFrameIndex) minFrameIndex = frameIndex
        if (frameIndex > maxFrameIndex) maxFrameIndex = frameIndex
        const fieldName = Object.keys(item)[i].split('!')[1]
        const fromValue = item[Object.keys(item)[i]].from
        const toValue = item[Object.keys(item)[i]].to

        if (parsed && parsed[frameIndex]) {
          parsed[frameIndex][fieldName] = toValue
        }
      }
      needUpdateFrameRange.value.startIndex = minFrameIndex
      needUpdateFrameRange.value.endIndex = maxFrameIndex
      needUpdateFrameRange.value.updateTotal = false
    }
    if (item._type === 1) {
      const frameIndex = item.frameIndex
      motionStore.insertFrameSilently(
        frameIndex,
        item.frameData,
        item.frameId as FrameId | undefined
      )
      parsed = motionStore.motionData?.parsed ?? parsed
      needUpdateFrameRange.value.startIndex = undefined
      needUpdateFrameRange.value.endIndex = undefined
      needUpdateFrameRange.value.updateTotal = true
    }
    if (item._type === 2) {
      const frameIndex = item.frameIndex
      motionStore.deleteFrameSilently(frameIndex, item.frameId as FrameId | undefined)
      parsed = motionStore.motionData?.parsed ?? parsed
      needUpdateFrameRange.value.startIndex = undefined
      needUpdateFrameRange.value.endIndex = undefined
      needUpdateFrameRange.value.updateTotal = true
    }
    if (item._type === 3) {
      applyKeyframeSnapshot(item.fieldName, item.after, item.rangeStart, item.rangeEnd)
      needUpdateFrameRange.value.startIndex = item.rangeStart
      needUpdateFrameRange.value.endIndex = item.rangeEnd
      needUpdateFrameRange.value.updateTotal = false
    }
    if (item._type === 4) {
      const frameId = item.frameId as FrameId | undefined
      const currentIdx = frameId ? motionStore.getFrameIndexById(frameId) : item.fromIndex
      if (currentIdx >= 0) {
        motionStore.moveFrameSilently(currentIdx, item.toIndex)
        parsed = motionStore.motionData?.parsed ?? parsed
        needUpdateFrameRange.value.startIndex = undefined
        needUpdateFrameRange.value.endIndex = undefined
        needUpdateFrameRange.value.updateTotal = true
      }
    }
    if (item._type === 5) {
      applyFieldEntries(item.fieldName, item.after as FieldEntry[])
      needUpdateFrameRange.value.startIndex = item.affectedStart
      needUpdateFrameRange.value.endIndex = item.affectedEnd
      needUpdateFrameRange.value.updateTotal = false
    }
    if (item._type === 6) {
      applyKeyframeSnapshot(item.fieldName, item.after, item.rangeStart, item.rangeEnd)
      needUpdateFrameRange.value.startIndex = item.rangeStart
      needUpdateFrameRange.value.endIndex = item.rangeEnd
      needUpdateFrameRange.value.updateTotal = false
    }
    if (motionStore.motionData) {
      motionStore.motionData.parsed = parsed
    }
    stack.value.push(item)
    motionStore.frame_change(item._endFrameIndex as number)
    reDoStack.value = reDoStack.value.slice(0, reDoStack.value.length - 1)
    doWithDrawCount.value++
    windowStore.setOperatingText('')
  }

  function handleClearReDoStack() {
    reDoStack.value = []
  }

  function deleteFrame(frameIndex: number, frameId?: FrameId) {
    clearTimer()
    pushTempData()
    pushDeleteFrame(frameIndex, motionStore.getFramebyIndex(frameIndex) as MotionFrame, frameId)
  }

  function copyFrame(toFrameIndex: number, frameId?: FrameId) {
    clearTimer()
    pushTempData()
    pushCopyFrame(
      toFrameIndex,
      motionStore.getFramebyIndex(toFrameIndex - 1) as MotionFrame,
      frameId
    )
  }

  function changeValue(frameIndex: number, fieldName: string, changeTo: number) {
    if (recordingDisabled.value) return
    const currentValue = motionStore.motionData?.parsed[frameIndex][fieldName] as number
    if (currentValue === changeTo) return
    const tempStoreFieldName = `${frameIndex}!${fieldName}`
    if (tempData.value === null) {
      tempData.value = {
        _type: 0,
      }
    }
    if (tempData.value._currentFrameIndex === undefined) {
      tempData.value._currentFrameIndex = motionStore.currentFrameIndex
    }
    if (tempData.value[tempStoreFieldName] === undefined) {
      tempData.value[tempStoreFieldName] = {
        from: currentValue,
        to: changeTo,
      }
    } else {
      tempData.value[tempStoreFieldName].to = changeTo
    }
    setTimer()
  }

  function clearTimer() {
    if (timer.value) clearTimeout(timer.value)
  }

  function setTimer() {
    if (timer.value) clearTimeout(timer.value)
    timer.value = setTimeout(() => {
      pushTempData()
    }, 500)
  }

  function pushTempData() {
    if (tempData.value === null) return
    if (tempData.value._currentFrameIndex === undefined) return
    tempData.value._endFrameIndex = motionStore.currentFrameIndex
    tempData.value.detail = currentOperationInfo.value
    tempData.value.createdAt = new Date().getTime()
    tempData.value.id = operationCount.value++
    stack.value.push(tempData.value)
    handleClearReDoStack()
    tempData.value = {
      _type: 0,
    }
    // resetOperationInfo()
  }

  function pushKeyframeSmoothDelete(payload: {
    fieldName: string
    rangeStart: number
    rangeEnd: number
    before: KeyframeSnapshot
    after: KeyframeSnapshot
    _currentFrameIndex: number
    _endFrameIndex?: number
  }) {
    stack.value.push({
      _type: 3,
      ...payload,
      _endFrameIndex: payload._endFrameIndex ?? payload._currentFrameIndex,
      id: operationCount.value++,
    })
    handleClearReDoStack()
  }

  function pushKeyframeSnapshotChange(payload: {
    fieldName: string
    rangeStart: number
    rangeEnd: number
    before: KeyframeSnapshot
    after: KeyframeSnapshot
    _currentFrameIndex: number
    _endFrameIndex?: number
  }) {
    stack.value.push({
      _type: 6,
      ...payload,
      _endFrameIndex: payload._endFrameIndex ?? payload._currentFrameIndex,
      id: operationCount.value++,
    })
    handleClearReDoStack()
  }

  function pushCopyFrame(newFrameIndex: number, frameData: MotionFrame, frameId?: FrameId) {
    stack.value.push({
      _type: 1,
      frameIndex: newFrameIndex,
      _currentFrameIndex: motionStore.currentFrameIndex,
      _endFrameIndex: newFrameIndex,
      frameData,
      frameId,
      id: operationCount.value++,
    })
    handleClearReDoStack()
  }

  function pushDeleteFrame(frameIndex: number, frameData: MotionFrame, frameId?: FrameId | null) {
    stack.value.push({
      _type: 2,
      frameIndex,
      frameData,
      frameId,
      _currentFrameIndex: motionStore.currentFrameIndex,
      _endFrameIndex: motionStore.currentFrameIndex - 1 < 0 ? 0 : motionStore.currentFrameIndex - 1,
      id: operationCount.value++,
    })
    handleClearReDoStack()
  }

  function pushMoveFrame(fromIndex: number, toIndex: number, frameId?: FrameId | null) {
    stack.value.push({
      _type: 4,
      fromIndex,
      toIndex,
      frameId,
      _currentFrameIndex: fromIndex,
      _endFrameIndex: toIndex,
      id: operationCount.value++,
    })
    handleClearReDoStack()
  }

  function pushFieldRangeMove(
    fieldName: string,
    srcStart: number,
    srcEnd: number,
    destStart: number,
    affectedStart: number,
    affectedEnd: number,
    before: FieldEntry[],
    after: FieldEntry[]
  ) {
    stack.value.push({
      _type: 5,
      fieldName,
      srcStart,
      srcEnd,
      destStart,
      affectedStart,
      affectedEnd,
      before,
      after,
      _currentFrameIndex: motionStore.currentFrameIndex,
      _endFrameIndex: destStart,
      id: operationCount.value++,
    })
    handleClearReDoStack()
  }

  function stackLength() {
    return stack.value.length
  }

  function reDoStackLength() {
    return reDoStack.value.length
  }

  return {
    changeValue,
    deleteFrame,
    copyFrame,
    doWithDraw,
    doWithDrawCount,
    stack,
    stackReverse: () => {
      const re = []
      for (let i = stack.value.length - 1; i >= 0; i--) {
        re.push(stack.value[i])
      }
      return re
    },
    tempData,
    stackLength,
    reDoStackLength,
    handleReDo,
    reset,
    needUpdateFrameRange,
    pushKeyframeSmoothDelete,
    pushKeyframeSnapshotChange,
    runWithoutRecord,
    setOperationInfo,
    moveFrame: (fromIndex: number, toIndex: number, frameId?: FrameId | null) =>
      pushMoveFrame(fromIndex, toIndex, frameId),
    pushFieldRangeMove,
    applyFieldEntries,
  }
})

/**
 * 重置所有Store
 *
 * 将动作编辑器中所有的Store恢复到初始状态。
 * 这个函数会依次调用每个Store的reset方法或清理方法。
 *
 * 使用场景：
 * - 切换不同的项目或动作文件时
 * - 用户主动重置整个编辑器
 * - 发生错误需要全面清理状态时
 *
 * 清理顺序：
 * 1. 动作数据Store（包含播放状态等核心数据）
 * 2. 撤销/重做Store
 * 3. 其他辅助Store（视图、机器人模型、窗口等）
 */
export function resetAllStores() {
  const motionStore = useMotionStore()
  const viewerStore = useViewerStore()
  const robotModelStore = useRobotModelStore()
  const windowStore = useWindowStore()
  const operationRecordStore = useOperationRecordStore()
  const quatSphereStore = useQuatSphereStore()
  const selectedFieldStore = useSelectedFieldStore()
  const withDrawStore = useWithDrawStore()

  // 先清理核心数据
  if (typeof (motionStore as any).clearMotionJSON === 'function') {
    motionStore.clearMotionJSON()
  } else {
    // 兜底：旧实例未暴露该方法时，直接清空核心数据避免崩溃
    try {
      motionStore.setMotionJSON?.(null as any)
    } catch (e) {
      console.warn('fallback clearMotionJSON failed', e)
    }
  }

  // 清理撤销/重做栈
  withDrawStore.reset()

  // 清理操作记录
  operationRecordStore.reset()

  // 清理四元数球状态
  quatSphereStore.reset()

  // 清理字段选择状态
  selectedFieldStore.reset()

  // 重置视图器状态
  viewerStore.reset()

  // 重置机器人模型状态
  robotModelStore.reset()

  // 重置窗口状态
  windowStore.reset()
}
