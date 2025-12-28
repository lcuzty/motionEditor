import { ref, nextTick, type Ref } from 'vue'
import type { FrameLike } from '../tools/motionEditorTools'
import type { IPathPanel } from '../pathPanel/data'
import { degToRad, radToDeg } from 'three/src/math/MathUtils.js'
import * as THREE from 'three'

export interface IJointQuatSphere {
  show: boolean
  loading: boolean
  jointName: string
  api: IQuatSphereAPI | null
  dispose: (() => void) | null
  lockedCameraQuater: boolean
  constraint: {
    selected: undefined | 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ'
    change: (to: undefined | 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ') => void
  }
  position: {
    left: number
    top: number
    moving: boolean
    lastX: number
    lastY: number
    handleStart: (e: { x: number; y: number }) => void
    handleMove: (e: { x: number; y: number }) => void
    handleEnd: () => void
    handleModify: () => void
  }
  handleShow: (jointName: string) => Promise<void>
  handleHide: () => void
  updateQuat: () => void
  move: {
    moving: boolean
    startEuler: { x: number; y: number; z: number } | null
    startArr: ({ x: number; y: number; z: number } | undefined)[]
    frameIndex: number
    applyTimer: NodeJS.Timeout | null
    pendingEuler: { x: number; y: number; z: number } | null
    lastEuler: EulerDeg | null
    // URDF：姿态球输出（Three 四元数）写入到动作数据 quater_xyzw（URDF四元数）
    applyTimerQuat: NodeJS.Timeout | null
    pendingQuat: { x: number; y: number; z: number; w: number } | null
    handleStart: () => void
    handleEnd: () => void
    apply: () => void
    handleMove: (currentEuler: { x: number; y: number; z: number }) => void
    scheduleApply: (currentLocalEuler: { x: number; y: number; z: number }) => void
    scheduleApplyURDF: (currentQuat: { x: number; y: number; z: number; w: number }) => void
  }
}

interface IQuatSphereAPI {
  setAxisConstraint?: (axis: undefined | 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ') => void
  setRotation: (
    data: { x: number; y: number; z: number; w: number } | { x: number; y: number; z: number }
  ) => void
  setQuaternion: (q: { x: number; y: number; z: number; w: number }) => void
  setEuler: (euler: { x: number; y: number; z: number }) => void
  getRotation: () =>
    | { x: number; y: number; z: number; w: number }
    | { x: number; y: number; z: number }
  getQuaternion: () => { x: number; y: number; z: number; w: number }
  setCameraByQuaternion: (
    qInput: { x: number; y: number; z: number; w: number },
    options?: { distance?: number | null; forwardAxis?: any }
  ) => void
  dispose?: () => void
}

interface JointQuatSphereDependencies {
  controlsContainer: Ref<HTMLElement | null>
  robotModelStore: any
  api: any
  initJointQuatSphere: (dom: HTMLElement | null, options: any) => { api: any; dispose: () => void }
  motionStore: any
  calculateBVHJointLocalEuler: (
    jointName: string,
    globalEuler: any,
    currentFrame: any,
    metadata: any
  ) => any
  calculateBVHJointGlobalEuler: (jointName: string, currentFrame: any, metadata: any) => any
  camera: Ref<any>
  pathPanel: Ref<IPathPanel>
  withDrawStore: any
  dragJointSettingsPanel: Ref<any>
  viewer: Ref<any>
  jointPositionLine: Ref<any>
  rippleAdjustEulerObject: (
    arr: any[],
    frameIndex: number,
    currentEuler: any,
    beforeRadius: number,
    afterRadius: number,
    beforeSelected: number,
    afterSelected: number
  ) => any[]
}

export function createJointQuatSphereData({
  controlsContainer,
  robotModelStore,
  api,
  initJointQuatSphere,
  motionStore,
  calculateBVHJointLocalEuler,
  calculateBVHJointGlobalEuler,
  camera,
  pathPanel,
  withDrawStore,
  dragJointSettingsPanel,
  viewer,
  jointPositionLine,
  rippleAdjustEulerObject,
}: JointQuatSphereDependencies) {
  const jointQuatSphere: Ref<IJointQuatSphere> = ref<IJointQuatSphere>({
    show: false,
    loading: false,
    jointName: '',
    api: null,
    dispose: null,
    lockedCameraQuater: true,
    constraint: {
      selected: undefined,
      change(to: undefined | 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ') {
        this.selected = to
        jointQuatSphere.value.api?.setAxisConstraint?.(to)
      },
    },
    position: {
      left: 20,
      top: 20,
      moving: false,
      lastX: 0,
      lastY: 0,
      handleStart(e: { x: number; y: number }) {
        this.moving = true
        this.lastY = e.y
        this.lastX = e.x
      },
      handleMove(e: { x: number; y: number }) {
        if (this.moving === false) return
        const cx = e.x - this.lastX
        const cy = e.y - this.lastY
        this.lastX = e.x
        this.lastY = e.y

        this.left += cx
        this.top += cy

        this.handleModify()
      },
      handleEnd() {
        this.moving = false
      },
      handleModify() {
        if (controlsContainer.value === null) return
        const jointQuatSphereDOM = document.getElementById('joint-quat-sphere-container')
        if (!jointQuatSphereDOM) return
        const viewportWidth = (controlsContainer.value as HTMLElement).clientWidth as number
        const viewportHeight = (controlsContainer.value as HTMLElement).clientHeight as number
        let windowLeft = this.left
        let windowTop = this.top
        const windowWidth = jointQuatSphereDOM.clientWidth
        const windowHeight = jointQuatSphereDOM.clientHeight
        if (windowLeft + windowWidth > viewportWidth) {
          windowLeft = viewportWidth - windowWidth
        }
        if (windowLeft < 0) {
          windowLeft = 0
        }
        if (windowTop + windowHeight > viewportHeight) {
          windowTop = viewportHeight - windowHeight
        }
        if (windowTop < 0) {
          windowTop = 0
        }
        this.left = windowLeft
        this.top = windowTop
      },
    },
    async handleShow(jointName: string) {
      if (this.loading) return
      this.loading = true
      this.jointName = jointName
      if (typeof this.dispose === 'function') this.dispose()
      await nextTick()
      await api.wait(0.1)
      const re = initJointQuatSphere(document.getElementById('joint-quat-sphere'), {
        mode: robotModelStore.isBVH ? 'euler' : 'quaternion',
        enableLabelHoverCursor: false,
        showAxes: false,
        // 传入根关节全局四元数，供“根关节约束”使用
        rootAxisQuaternion: (() => {
          if (!robotModelStore.isBVH) return null
          // 从当前关节一路追溯到根节点，拿根的 globalRotation
          const info = viewer.value?.getBVHJointInfo(jointQuatSphere.value.jointName)
          let rootInfo = info
          while (rootInfo?.node?.parent) {
            rootInfo = viewer.value?.getBVHJointInfo(rootInfo.node.parent.name)
          }
          const g = rootInfo?.globalRotation
          if (!g) return null
          const { quat } = eulerDegToQuat(g as EulerLike)
          return quat
        })(),
        onChange: (rotation: any) => {
          if (!jointQuatSphere.value.move.moving) return

          // URDF：姿态球输出四元数（Three），实时预览并写入动作数据 quater_xyzw
          if (!robotModelStore.isBVH) {
            const q = rotation as { x: number; y: number; z: number; w: number }
            if (q && typeof q === 'object' && 'w' in q) {
              jointQuatSphere.value.move.scheduleApplyURDF(q)
            }
            return
          }

          // BVH：从全局欧拉角转换为局部欧拉角
          const globalEuler = rotation as { x: number; y: number; z: number; w?: number }
          const currentFrame = motionStore.getCurrentFrame()
          const metadata = (motionStore.motionData as any)?.bvhMetadata

          let currentLocalEuler = globalEuler
          if (currentFrame && metadata) {
            const localEuler = calculateBVHJointLocalEuler(
              jointQuatSphere.value.jointName,
              globalEuler,
              currentFrame as any,
              metadata
            )
            if (localEuler) {
              currentLocalEuler = localEuler
            }
          }

          // 50ms 节流：写入关键帧分量 + 更新曲线 + 3D 位置线
          jointQuatSphere.value.move.scheduleApply(currentLocalEuler)
        },
      })
      // re.api.
      this.api = re.api as IQuatSphereAPI
      camera.value.handleMove()
      this.updateQuat()
      this.dispose = re.dispose as () => void
      await nextTick()
      await api.wait(0.1)
      this.show = true
      this.loading = false
    },
    handleHide() {
      if (typeof this.dispose === 'function') {
        this.dispose()
      }
      this.show = false
    },
    updateQuat() {
      if (robotModelStore.isBVH) {
        // // 获取当前帧数据和元数据
        // const currentFrame = motionStore.getCurrentFrame()
        // const metadata = (motionStore.motionData as any)?.bvhMetadata

        // if (!currentFrame || !metadata) {
        //   // 如果没有元数据，回退到局部欧拉角（向后兼容）
        //   const eulerData = motionStore.getBVHEulerJointAnglesByFrameIndex(
        //     motionStore.currentFrameIndex,
        //     this.jointName
        //   )
        //   if (eulerData && jointQuatSphere.value.api) {
        //     jointQuatSphere.value.api.setEuler(eulerData)
        //   }
        // } else {
        //   // 计算全局欧拉角
        //   const globalEuler = calculateBVHJointGlobalEuler(
        //     this.jointName,
        //     currentFrame as any,
        //     metadata
        //   )

        //   if (globalEuler && jointQuatSphere.value.api) {
        //     jointQuatSphere.value.api.setEuler(globalEuler)
        //   }
        // }
        const currentJointInfo = viewer.value?.getBVHJointInfo(jointQuatSphere.value.jointName)
        // 注意：BVH 每个关节可能有不同的 rotation.order；必须把 order 传给姿态球，否则球内部坐标系会偏
        const g = currentJointInfo?.globalRotation
        if (g) {
          jointQuatSphere.value.api?.setEuler({
            x: g.x ?? 0,
            y: g.y ?? 0,
            z: g.z ?? 0,
            order: (g as any).order ?? currentJointInfo?.rotation?.order ?? 'XYZ',
          } as any)
        }
        return
      }

      // URDF：显示当前帧的 quater_xyzw（动作数据存 URDF 四元数，姿态球用 Three 四元数显示）
      const frameIndex = motionStore.currentFrameIndex
      const frame = motionStore.motionData?.parsed?.[frameIndex] as any
      const ux = frame?.quater_x
      const uy = frame?.quater_y
      const uz = frame?.quater_z
      const uw = frame?.quater_w
      if (
        typeof ux === 'number' &&
        typeof uy === 'number' &&
        typeof uz === 'number' &&
        typeof uw === 'number'
      ) {
        const toThree = api?.robot?.quater?.urdfQuatToThree
        const q3 =
          typeof toThree === 'function'
            ? toThree({ x: ux, y: uy, z: uz, w: uw })
            : { x: ux, y: uy, z: uz, w: uw }
        jointQuatSphere.value.api?.setQuaternion(q3)
      }
    },
    move: {
      moving: false,
      startEuler: null as { x: number; y: number; z: number } | null,
      startArr: [] as ({ x: number; y: number; z: number } | undefined)[],
      frameIndex: 0,
      applyTimer: null as null | NodeJS.Timeout,
      pendingEuler: null as { x: number; y: number; z: number } | null,
      applyTimerQuat: null as null | NodeJS.Timeout,
      pendingQuat: null as { x: number; y: number; z: number; w: number } | null,
      handleStart() {
        this.moving = true
        this.lastEuler = null
        this.startArr = motionStore.getBVHEulerJointAngles(jointQuatSphere.value.jointName)
        this.frameIndex = motionStore.currentFrameIndex
        withDrawStore.setOperationInfo('关节拖拽', jointQuatSphere.value.jointName)
      },
      handleEnd() {
        if (this.moving) {
          if (this.applyTimer) {
            clearTimeout(this.applyTimer)
            this.applyTimer = null
          }
          if (this.applyTimerQuat) {
            clearTimeout(this.applyTimerQuat)
            this.applyTimerQuat = null
          }
          jointPositionLine.value.handleUpdate()
        }
        this.moving = false
        // 姿态球旋转结束时更新关节位置线条
      },
      lastEuler: null as EulerDeg | null,
      scheduleApply(currentLocalEuler: { x: number; y: number; z: number }) {
        this.pendingEuler = currentLocalEuler
        let euler = this.pendingEuler
        const isLastEulerNull = this.lastEuler === null
        const lastEuler =
          this.lastEuler === null
            ? { x: 0, y: 0, z: 0 }
            : (JSON.parse(JSON.stringify(this.lastEuler)) as EulerDeg)
        this.lastEuler = JSON.parse(JSON.stringify(euler)) as EulerDeg
        if (isLastEulerNull) return

        console.log(456, viewer)
        const currentJointInfo = viewer.value?.getBVHJointInfo(jointQuatSphere.value.jointName)
        if (!currentJointInfo) return
        const parentNodeInfo = currentJointInfo.node?.parent
        let parentGlobalRotation
        if (parentNodeInfo?.name) {
          const parentJointInfo = viewer.value?.getBVHJointInfo(parentNodeInfo.name)
          parentGlobalRotation = parentJointInfo?.globalRotation ?? { x: 0, y: 0, z: 0 }
        } else {
          parentGlobalRotation = { x: 0, y: 0, z: 0 }
        }
        //   const quatSphereRotationBasedOnParentGlobalRotation = relativeEulerFromBaseToTarget(
        //     euler,
        //     parentGlobalRotation,
        //     currentJointInfo?.rotation?.order
        //   )
        const quatSphereRotationBasedOnParentGlobalRotation = (() => {
          const currentRelaEuler = relativeEulerFromBaseToTarget(
            euler,
            parentGlobalRotation,
            currentJointInfo?.rotation?.order
          )
          const parentRelativeEuler = relativeEulerFromBaseToTarget(
            lastEuler,
            parentGlobalRotation,
            currentJointInfo?.rotation?.order
          )
          const relaEulerDelta = {
            x: currentRelaEuler.x - parentRelativeEuler.x,
            y: currentRelaEuler.y - parentRelativeEuler.y,
            z: currentRelaEuler.z - parentRelativeEuler.z,
          }
          return {
            order: currentJointInfo?.rotation?.order,
            x: currentJointInfo?.rotation?.x + relaEulerDelta.x,
            y: currentJointInfo?.rotation?.y + relaEulerDelta.y,
            z: currentJointInfo?.rotation?.z + relaEulerDelta.z,
          }
        })()
        euler = quatSphereRotationBasedOnParentGlobalRotation
        // 实时预览（无节流）
        if (viewer.value?.setSingleJointValue) {
          viewer.value.setSingleJointValue(`${jointQuatSphere.value.jointName}_x`, euler.x)
          viewer.value.setSingleJointValue(`${jointQuatSphere.value.jointName}_y`, euler.y)
          viewer.value.setSingleJointValue(`${jointQuatSphere.value.jointName}_z`, euler.z)
        }

        if (this.applyTimer) return
        this.applyTimer = setTimeout(() => {
          this.applyTimer = null
          if (!this.pendingEuler) return
          this.pendingEuler = null

          console.log(
            123,
            quatSphereRotationBasedOnParentGlobalRotation,
            currentJointInfo?.rotation
          )

          const frameIndex = motionStore.currentFrameIndex
          const axisMap: Array<{ key: 'x' | 'y' | 'z'; field: string; value: number }> = [
            { key: 'x', field: `${jointQuatSphere.value.jointName}_x`, value: euler.x },
            { key: 'y', field: `${jointQuatSphere.value.jointName}_y`, value: euler.y },
            { key: 'z', field: `${jointQuatSphere.value.jointName}_z`, value: euler.z },
          ]
          const skipped: Array<'x' | 'y' | 'z'> = []

          axisMap.forEach(({ key, field, value }) => {
            const isKey =
              typeof motionStore.isKeyframe === 'function'
                ? motionStore.isKeyframe(field, frameIndex)
                : false
            if (isKey) {
              motionStore.setFrameFieldValue(frameIndex, field, value)
            } else {
              skipped.push(key)
            }
          })

          // 更新 pathPanel
          pathPanel.value.handleUpDateData()

          // 更新 3D 位置线（参照 aligned 模式：获取关键帧分量两侧贝塞尔曲线范围，两端扩大1单位）
          const totalFrames = motionStore.frame_getNum
            ? motionStore.frame_getNum()
            : motionStore.getFrameCount()
          const ranges: Array<{ start: number; end: number }> = []

          axisMap.forEach(({ key, field }) => {
            const isKey =
              typeof motionStore.isKeyframe === 'function'
                ? motionStore.isKeyframe(field, frameIndex)
                : false
            if (!isKey) return // 只处理关键帧分量

            // 参照 buildHandleRecomputeRange：获取该分量的所有关键帧索引
            const frames = motionStore.getKeyframeIndices?.(field) as number[] | undefined
            if (!frames || frames.length === 0) {
              ranges.push({ start: frameIndex, end: frameIndex })
              return
            }

            const idx = frames.indexOf(frameIndex)
            if (idx === -1) {
              ranges.push({ start: frameIndex, end: frameIndex })
              return
            }

            // 找到前后关键帧
            const prev = idx > 0 ? frames[idx - 1] : null
            const next = idx < frames.length - 1 ? frames[idx + 1] : null

            // 贝塞尔曲线范围：左侧从prev到当前，右侧从当前到next
            // 然后两端各扩大1个单位
            const start = (prev ?? frameIndex) - 1
            const end = (next ?? frameIndex) + 1

            ranges.push({ start, end })
          })

          if (ranges.length > 0) {
            // 取所有关键帧分量范围的叠加最大范围
            const minStart = Math.min(...ranges.map(r => r.start))
            const maxEnd = Math.max(...ranges.map(r => r.end))
            const start = Math.max(0, minStart)
            const end = Math.min(totalFrames - 1, maxEnd)
            viewer.value?.jointPositionLine3D?.compute(
              start,
              end,
              motionStore.motionData?.parsed || []
            )
          }

          // 如有跳过的分量，刷新预览以保持一致
          if (skipped.length && viewer.value?.setSingleJointValue) {
            const currentFrame = motionStore.motionData?.parsed?.[frameIndex]
            if (currentFrame) {
              skipped.forEach(axis => {
                const field = `${jointQuatSphere.value.jointName}_${axis}`
                const val = currentFrame[field]
                if (typeof val === 'number') {
                  viewer.value.setSingleJointValue(field, val)
                }
              })
            }
          }
        }, 50)
      },
      scheduleApplyURDF(currentQuat: { x: number; y: number; z: number; w: number }) {
        // 仅 URDF 使用：姿态球输出的是 Three 四元数；预览通过 viewer.setSingleJointValue；
        // 写入动作数据时转换为 URDF 四元数并写到 quater_xyzw。
        this.pendingQuat = currentQuat

        // 实时预览（不节流）：走 MotionEditor3DViewer 的 setSingleJointValue -> applySingleJointAngle
        if (viewer.value?.setSingleJointValue) {
          viewer.value.setSingleJointValue('quater_x', currentQuat.x)
          viewer.value.setSingleJointValue('quater_y', currentQuat.y)
          viewer.value.setSingleJointValue('quater_z', currentQuat.z)
          viewer.value.setSingleJointValue('quater_w', currentQuat.w)
          api.forceRender?.()
        }

        if (this.applyTimerQuat) return
        this.applyTimerQuat = setTimeout(() => {
          this.applyTimerQuat = null
          const q = this.pendingQuat
          if (!q) return
          this.pendingQuat = null

          // Three -> URDF（如果项目提供转换函数）
          const toUrdf = api?.robot?.quater?.threeQuatToUrdf
          const threeQ = new THREE.Quaternion(q.x, q.y, q.z, q.w).normalize()
          const urdfQ =
            typeof toUrdf === 'function'
              ? toUrdf(threeQ)
              : { x: threeQ.x, y: threeQ.y, z: threeQ.z, w: threeQ.w }

          motionStore.frame_changeCurrentValue('quater_x', urdfQ.x)
          motionStore.frame_changeCurrentValue('quater_y', urdfQ.y)
          motionStore.frame_changeCurrentValue('quater_z', urdfQ.z)
          motionStore.frame_changeCurrentValue('quater_w', urdfQ.w)
        }, 50)
      },
      apply() {
        // 保持向后兼容的调用（不再使用 ripple）
      },
      handleMove(_currentGlobalEuler: { x: number; y: number; z: number }) {
        // 不再使用（逻辑已迁移到 onChange + scheduleApply）
      },
    },
  })
  return jointQuatSphere
}

type EulerLike = {
  x?: number
  y?: number
  z?: number
  order?: string
}

type EulerDeg = {
  x: number
  y: number
  z: number
  order: THREE.EulerOrder
}

const EULER_ORDERS: ReadonlySet<THREE.EulerOrder> = new Set([
  'XYZ',
  'XZY',
  'YXZ',
  'YZX',
  'ZXY',
  'ZYX',
] as const)

function normalizeEulerOrder(order?: string): THREE.EulerOrder {
  const o = (order || 'XYZ').toUpperCase()
  return EULER_ORDERS.has(o as THREE.EulerOrder) ? (o as THREE.EulerOrder) : 'XYZ'
}

function numOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function eulerDegToQuat(euler: EulerLike | null): {
  quat: THREE.Quaternion
  order: THREE.EulerOrder
} {
  const safe = euler ?? {}
  const order = normalizeEulerOrder(safe.order)

  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      degToRad(numOrZero(safe.x)),
      degToRad(numOrZero(safe.y)),
      degToRad(numOrZero(safe.z)),
      order
    )
  )

  return { quat, order }
}

/**
 * 计算“以 baseWorldEuler 为主坐标系（局部坐标系）时，
 * 从 base 旋到 target 的相对欧拉角（可指定输出 order）”
 *
 * 数学形式：qDelta = inverse(qBase) * qTarget
 * 从而：qBase * qDelta = qTarget
 */
function relativeEulerFromBaseToTarget(
  targetWorldEuler: EulerLike | null,
  baseWorldEuler: EulerLike | null,
  resultOrder: string = 'XYZ'
): EulerDeg {
  const { quat: targetQuat } = eulerDegToQuat(targetWorldEuler)
  const { quat: baseQuat } = eulerDegToQuat(baseWorldEuler)

  const targetOrder = normalizeEulerOrder(resultOrder)

  // qDelta = qBase^{-1} * qTarget
  const baseInv = baseQuat.clone()
  // three.js 新版本用 invert()，旧版本可能是 inverse()
  const baseInvAny = baseInv as unknown as { invert?: () => void; inverse?: () => void }
  if (typeof baseInvAny.invert === 'function') baseInvAny.invert()
  else if (typeof baseInvAny.inverse === 'function') baseInvAny.inverse()
  else baseInv.conjugate().normalize() // 兜底（对单位四元数等价于逆）

  const deltaQuat = baseInv.multiply(targetQuat)

  const deltaEuler = new THREE.Euler().setFromQuaternion(deltaQuat, targetOrder)

  return {
    x: radToDeg(deltaEuler.x),
    y: radToDeg(deltaEuler.y),
    z: radToDeg(deltaEuler.z),
    order: targetOrder,
  }
}
