import { computed, ref, type Ref } from 'vue'
import * as THREE from 'three'
import type { IJointQuatSphere } from '../jointQuatSphere/data'
import type { IQuatSphere } from '../quatSphere/data'

type CameraTypeName = 'perspective' | 'orthographic'

interface QuatSphereAPI {
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
    options?: { distance?: number | null; forwardAxis?: THREE.Vector3 }
  ) => void
  dispose?: () => void
}

export interface ICamera {
  isOrthographicFromGizmo: boolean
  ignoreNextCameraMove: boolean
  change: (name: CameraTypeName) => void
  type: {
    selected: CameraTypeName
    options: { label: string; value: CameraTypeName }[]
    change: (name: CameraTypeName) => void
  }
  track: {
    selected: number
    showMenu: boolean
    options: string[]
    getCurrent: () => { index: number; name: string }
    changeSelected: (index: number) => void
    updatePosition: (forceRender?: boolean) => void
  }
  toDefaultPosition: () => void
  handleMove: () => void
  toStartPosition: () => void
}

interface CameraDependencies {
  motionStore: any
  api: any
  robotModelStore: any
  quatSphere: Ref<IQuatSphere>
  jointQuatSphereTRef: any
  viewer: any
}

export function createCameraData({
  motionStore,
  api,
  robotModelStore,
  quatSphere,
  viewer,
  jointQuatSphereTRef,
}: CameraDependencies) {
  const jointQuatSphere = computed(() => jointQuatSphereTRef.value)
  /**
   * 3D场景摄像机控制系统
   *
   * 管理3D场景中摄像机的位置、角度和跟随行为，提供多种观察模式来满足不同的编辑需求。
   * 这个系统让用户可以从最佳角度观察和编辑机器人动作。
   *
   * 主要功能：
   * 1. 多种摄像机跟随模式（固定、跟随、轨道等）
   * 2. 预设位置快速切换（默认位置、起始位置）
   * 3. 摄像机移动事件处理和同步
   * 4. 与四元数球控件的联动
   */
  const camera = ref({
    isOrthographicFromGizmo: false,
    ignoreNextCameraMove: false,
    change(name: CameraTypeName) {
      this.type.change(name)
    },
    type: {
      selected: 'perspective' as CameraTypeName,
      options: [
        { label: '透视', value: 'perspective' },
        { label: '正交', value: 'orthographic' },
      ],
      change(name: CameraTypeName) {
        if (this.selected === name) return
        this.selected = name
        try {
          viewer.value?.changeCameraType?.(name)
          api.forceRender?.()
        } catch (error) {
          console.warn('切换摄像机类型失败', error)
        }
      },
    },
    zoomSpeed: {
      showMenu: false,
      value: 1,
      set(value: number) {
        this.value = value
        console.log(viewer.value)
        viewer.value.setOrbitZoomSpeed(value)
      },
      hide() {
        this.showMenu = false
      },
      show() {
        this.showMenu = true
      },
    },
    /**
     * 摄像机跟随模式控制系统
     *
     * 提供6种不同的摄像机跟随模式，每种模式适合不同的使用场景：
     *
     * 0. 默认模式：摄像机完全自由，用户可以手动调整到任意位置和角度
     * 1. 固定距离和方向：摄像机与机器人保持完全固定的相对位置，适合观察整体动作流程
     * 2. 固定距离且跟随旋转：距离固定但角度跟随机器人旋转，适合观察机器人转身等动作
     * 3. 固定方向：角度固定但距离可变，适合从固定视角观察机器人的移动
     * 4. 跟随旋转：角度跟随机器人但距离可变，适合观察机器人的朝向变化
     * 5. 焦点跟随：摄像机始终看向机器人，但位置自由，适合环绕观察
     */
    track: {
      selected: 0,
      showMenu: false,
      options: ['默认', '固定距离和朝向', '仅固定朝向'],
      oldOptions: [
        '默认',
        '固定距离和朝向',
        '固定距离且水平方向跟随模型',
        '仅固定朝向',
        '水平方向跟随模型',
        '模型位置作为摄像机焦点',
      ],
      getCurrent() {
        return {
          index: this.selected,
          name: this.options[this.selected],
        }
      },

      /**
       * 切换摄像机跟随模式
       *
       * 当用户选择不同的跟随模式时，系统需要：
       * 1. 更新当前选中的模式索引
       * 2. 关闭模式选择菜单
       * 3. 为特定模式进行必要的初始化
       *
       * 特别地，"固定距离和方向"模式需要捕获当前的摄像机和机器人状态
       * 作为后续跟随计算的参考基准。
       */
      changeSelected(index: number) {
        this.selected = index
        this.showMenu = false
        if (index === 1) {
          motionStore.capturePlaybackStartState()
        }
      },
      /**
       * 摄像机位置更新的核心算法
       *
       * 这是摄像机跟随系统的核心方法，根据当前选中的跟随模式计算并更新摄像机位置。
       *
       * 算法流程：
       * 1. 根据跟随模式确定约束条件（距离固定、角度固定、角度跟随等）
       * 2. 分别处理不同的约束组合情况
       * 3. 使用3D数学计算新的摄像机位置和朝向
       * 4. 应用计算结果到3D场景
       *
       * 这个方法在每次帧切换时都会被调用，确保摄像机始终按照用户选择的模式跟随机器人。
       */
      updatePosition(forceRender = false) {
        const selected = this.oldOptions.indexOf(this.options[this.selected])
        let isDistanceFixed = false
        let isQuaternionFixed = false
        let isQuaternionFollowingRobot = false

        if (selected === 1) {
          isDistanceFixed = true
          isQuaternionFixed = true
        }
        if (selected === 2) {
          isDistanceFixed = true
          isQuaternionFollowingRobot = true
        }
        if (selected === 3) {
          isQuaternionFixed = true
        }
        if (selected === 4) {
          isQuaternionFollowingRobot = true
        }

        if (selected && selected !== 5) {
          if (isDistanceFixed && !isQuaternionFixed && !isQuaternionFollowingRobot) {
            const robotPosition = api.robot.position.get()
            const cameraPosition = api.camera.position.get()
            const offsetX =
              motionStore.play_start_camera_position.x - motionStore.play_start_robot_position.x
            const offsetY =
              motionStore.play_start_camera_position.y - motionStore.play_start_robot_position.y
            const offsetZ =
              motionStore.play_start_camera_position.z - motionStore.play_start_robot_position.z
            const calculatedCameraPosition = {
              x: robotPosition.x + offsetX,
              y: robotPosition.y + offsetY,
              z: robotPosition.z + offsetZ,
            }
            api.camera.position.set(calculatedCameraPosition)
            api.camera.target.set(robotPosition)
            if (viewer.value?.controls) {
              viewer.value.controls.update()
            }
          } else {
            const currentQuaternion = isQuaternionFixed
              ? motionStore.play_start_camera_quater
              : (() => {
                  if (isQuaternionFollowingRobot) {
                    return api.quater.combine(
                      api.robot.quater.get(),
                      motionStore.play_start_camera_quater_to_robot
                    )
                  } else {
                    return api.camera.quater.get()
                  }
                })()
            const currentCameraDistance = isDistanceFixed
              ? motionStore.play_start_camera_distance
              : (() => {
                  const robotPosition = api.robot.position.get()
                  const cameraPosition = api.camera.position.get()
                  return api.distance.compute(
                    robotPosition.x,
                    robotPosition.y,
                    robotPosition.z,
                    cameraPosition.x,
                    cameraPosition.y,
                    cameraPosition.z
                  )
                })()
            const robotPosition = api.robot.position.get()
            const calculatedCameraPosition = api.quater.computeOrbitPosition(
              robotPosition,
              currentQuaternion,
              currentCameraDistance
            )
            api.camera.position.set(calculatedCameraPosition)
            api.camera.target.set(robotPosition)
          }
        } else {
          if (selected === 5) {
            api.camera.target.set(api.robot.position.get())
          }
        }

        if (forceRender) api.forceRender()
      },
    },
    /**
     * 设置摄像机到默认观察位置
     *
     * 将摄像机焦点指向机器人/骨骼的位置，但不改变摄像机的位置。
     *
     * 对于 BVH 模型：
     * - 将摄像机焦点指向根骨骼（root）的位置
     *
     * 对于 URDF 模型：
     * - 将摄像机焦点指向机器人的当前位置
     */
    toDefaultPosition() {
      const currentRobotPosition = api.robot.position.get()

      // BVH 模型：将摄像机焦点指向根骨骼位置
      if (robotModelStore.isBVH) {
        try {
          const robotObject = api.robot.getObject() as any
          if (robotObject && robotObject.skeleton && robotObject.skeleton.bones) {
            const rootBone = robotObject.skeleton.bones[0]
            if (rootBone) {
              rootBone.updateWorldMatrix(true, true)
              const rootPosition = new THREE.Vector3()
              rootBone.getWorldPosition(rootPosition)

              // 只设置摄像机焦点，不改变摄像机位置
              api.camera.target.set({
                x: rootPosition.x,
                y: rootPosition.y,
                z: rootPosition.z,
              })

              return
            }
          }
        } catch (error) {
          console.warn('BVH 摄像机焦点设置失败，使用默认位置:', error)
        }
      }

      // URDF 模型：将摄像机焦点指向机器人位置
      api.camera.target.set({
        x: currentRobotPosition.x,
        y: currentRobotPosition.y,
        z: currentRobotPosition.z,
      })
    },

    /**
     * 摄像机移动事件处理器
     *
     * 当摄像机位置或角度发生变化时，同步更新四元数球控件的显示。
     * 这确保了四元数球始终反映当前的摄像机状态，提供一致的用户体验。
     *
     * 使用try-catch包装以防止同步过程中的异常影响主要功能。
     */
    handleMove() {
      try {
        if (quatSphere.value.api !== null && quatSphere.value.lockedCameraQuater)
          (quatSphere.value.api as QuatSphereAPI).setCameraByQuaternion(api.camera.quater.get())
      } catch (error) {
        console.warn('Sync quatSphere camera failed:', error)
      }
      try {
        if (jointQuatSphere.value.api !== null && jointQuatSphere.value.lockedCameraQuater)
          (jointQuatSphere.value.api as QuatSphereAPI).setCameraByQuaternion(
            api.camera.quater.get()
          )
      } catch (error) {
        console.warn('Sync jointQuatSphere camera failed:', error)
      }
    },

    /**
     * 设置摄像机到预设起始位置
     *
     * 将摄像机移动到一个特殊的起始观察位置，这个位置使用四元数计算得出，
     * 提供了一个标准化的观察角度。适合在动作开始播放时使用。
     *
     * 算法：通过四元数计算从原点到指定3D位置的轨道摄像机位置。
     */
    toStartPosition() {
      // const quaternionData = api.quater.get({
      //     x: 0,
      //     y: 0,
      //     z: 0
      // }, {
      //     x: 30,
      //     z: 30,
      //     y: 20
      // })
      // const calculatedCameraPosition = api.quater.computePositionFromQuat(api.robot.position.get(), quaternionData, 2)
      // const currentRobotPosition = api.robot.position.get()
      // api.camera.position.set(calculatedCameraPosition)
      // api.camera.target.set(currentRobotPosition)
      const currentRobotPosition = api.robot.position.get()
      const newCameraPosition = {
        x: currentRobotPosition.x + 1,
        y: currentRobotPosition.y + 0.5,
        z: currentRobotPosition.z + 1,
      }
      api.camera.position.set(newCameraPosition)
      api.camera.target.set(currentRobotPosition)
    },
  })
  return camera
}

// 快速切换视图
export function handleShowCameraFastViewMenu(dependencies: {
  camera: Ref<ICamera>
  api: any
  windowStore: any
  robotModelStore: any
}) {
  return
  const { camera, api, windowStore, robotModelStore } = dependencies
  const robotPosition = api.robot.position.get()
  const cameraPosition = api.camera.position.get()
  const robotQuaternion = api.robot.quater.get()
  const robotCameraDistance = api.distance.compute(
    robotPosition.x,
    robotPosition.y,
    robotPosition.z,
    cameraPosition.x,
    cameraPosition.y,
    cameraPosition.z
  )

  // 以机器人朝向为基准计算四个等距离视角位置
  const viewPositions = (() => {
    const isBVH = !!robotModelStore?.isBVH
    // 根据模型类型调整局部前/左轴方向
    const frontAxis = isBVH ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
    const backAxis = frontAxis.clone().multiplyScalar(-1)
    // BVH 坐标：Z 前、X 左；URDF 坐标：X 前、Y 左（Z 竖直向上）
    const leftAxis = isBVH ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const rightAxis = leftAxis.clone().multiplyScalar(-1)

    const front = api.quater.computePositionFromQuat(
      robotPosition,
      robotQuaternion,
      robotCameraDistance,
      frontAxis // 前方
    )
    const back = api.quater.computePositionFromQuat(
      robotPosition,
      robotQuaternion,
      robotCameraDistance,
      backAxis // 后方
    )
    const left = api.quater.computePositionFromQuat(
      robotPosition,
      robotQuaternion,
      robotCameraDistance,
      leftAxis // 左侧
    )
    const right = api.quater.computePositionFromQuat(
      robotPosition,
      robotQuaternion,
      robotCameraDistance,
      rightAxis // 右侧
    )
    return { front, back, left, right }
  })()

  const moveCameraTo = (pos: THREE.Vector3) => {
    api.camera.position.set({ x: pos.x, y: pos.y, z: pos.z })
    api.camera.target.set(robotPosition)
    api.forceRender?.()
  }

  const handleClick = (e: MouseEvent) => {
    console.log('阻止默认')
    e.preventDefault()
  }
  document.addEventListener('click', handleClick)

  const handleListenKey = (e: KeyboardEvent) => {
    e.preventDefault()
    if (e.code === 'KeyW') {
      moveCameraTo(viewPositions.front)
      windowStore.hideCenterMenu()
    }
    if (e.code === 'KeyS') {
      moveCameraTo(viewPositions.back)
      windowStore.hideCenterMenu()
    }
    if (e.code === 'KeyA') {
      moveCameraTo(viewPositions.left)
      windowStore.hideCenterMenu()
    }
    if (e.code === 'KeyD') {
      moveCameraTo(viewPositions.right)
      windowStore.hideCenterMenu()
    }
    if (e.code === 'Escape') {
      windowStore.hideCenterMenu()
      document.removeEventListener('keydown', handleListenKey)
    }
  }

  document.addEventListener('keydown', handleListenKey)

  windowStore.showCenterMenu(
    '快速切换摄像机视图',
    [
      {
        title: '正面视图(W)',
        onClick: () => {
          moveCameraTo(viewPositions.front)
        },
      },
      {
        title: '背面视图(S)',
        onClick: () => {
          moveCameraTo(viewPositions.back)
        },
      },
      {
        title: '左手侧面视图(A)',
        onClick: () => {
          moveCameraTo(viewPositions.left)
        },
      },
      {
        title: '右手侧面视图(D)',
        onClick: () => {
          moveCameraTo(viewPositions.right)
        },
      },
    ],
    () => {
      document.removeEventListener('keydown', handleListenKey)
      document.removeEventListener('click', handleClick)
    }
  )
}
