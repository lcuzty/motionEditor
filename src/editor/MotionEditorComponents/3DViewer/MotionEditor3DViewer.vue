<template>
  <div class="motion-editor-3d-viewer">
    <div
      :style="{
        pointerEvents: props.pointEvents ? 'auto' : 'none',
      }"
      ref="containerRef"
      class="viewer-container"
    ></div>
  </div>
</template>

<script setup lang="ts">
// @ts-nocheck
import { ref, shallowRef, onMounted, onUnmounted, computed, watch, nextTick, markRaw } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { degToRad, radToDeg } from 'three/src/math/MathUtils.js'
import URDFLoader from '../../../urdfLoader/URDFLoader.js'
import { MotionJSON, FrameLike } from '../tools/motionEditorTools'

const emit = defineEmits([
  'onReady',
  'onLoaded',
  'onHoverBVHNode',
  'onURDFAngleChange',
  'onURDFManipulateStart',
  'onURDFManipulateEnd',
  'onMouseEnterJoint',
  'onMouseLeaveJoint',
  'onHoverURDFNode',
])

const props = defineProps({
  isDark: {
    type: Boolean,
    default: false,
  },
  pointEvents: {
    type: Boolean,
    default: true,
  },
  motionData: {
    type: Array,
    default: [],
  },
})

watch(
  () => props.isDark,
  to => {
    if (to) {
      setSceneThemeDark(sceneRef.value as THREE.Scene)
    } else {
      setSceneThemeLight(sceneRef.value as THREE.Scene)
    }
  }
)

// 类型定义
interface Vector3Like {
  x: number
  y: number
  z: number
}

interface EulerLike extends Vector3Like {
  order?: string
}

interface QuaternionLike {
  x: number
  y: number
  z: number
  w: number
}

type CameraWithProjection =
  | THREE.PerspectiveCamera
  | THREE.OrthographicCamera
  | (THREE.Camera & { updateProjectionMatrix: () => void })

const isBVH = ref(false)

const containerRef = ref<HTMLElement | null>(null)
const sceneRef = shallowRef<THREE.Scene | null>(null)
const cameraRef = shallowRef<CameraWithProjection | null>(null)
const rendererRef = shallowRef<THREE.WebGLRenderer | null>(null)
const cameraControlRef = shallowRef<OrbitControls | null>(null)
const gridHelperRef = shallowRef<THREE.GridHelper | null>(null)
const axesHelperRef = shallowRef<THREE.AxesHelper | null>(null)
const groundMeshesRef = shallowRef<{ top: THREE.Mesh; bottom: THREE.Mesh } | null>(null)
let animationFrameId: number | null = null
const parsedBVHRef = shallowRef<BVHData | null>(null)

const viewerResizeTimer = ref<NodeJS.Timeout | null>(null)
const viewerResizeObserver = ref<ResizeObserver | null>(null)

const robotRef = shallowRef<URDFRobot | BVHThreeNode | null>(null)
const robotForComputeRef = shallowRef<URDFRobot | BVHThreeNode | null>(null)
const searchRobotJointNode = (jointName: string) => {
  return new Promise<BVHThreeNode | URDFJoint | null>((resolve, reject) => {
    if (isBVH.value) {
      const handleSearchBVHJointNode = (node: BVHThreeNode) => {
        if (node.name === jointName) {
          resolve(node)
          return
        }
        for (const child of node.children) {
          handleSearchBVHJointNode(child)
        }
      }
      handleSearchBVHJointNode(robotRef.value as BVHThreeNode)
      resolve(null)
    } else {
      const handleSearchURDFJointNode = (node: URDFRobot) => {
        if (node.type === 'URDFJoint' && node.name === jointName) {
          resolve(node as URDFJoint)
          return
        }
        for (const child of node.children) {
          handleSearchURDFJointNode(child)
        }
      }
      handleSearchURDFJointNode(robotRef.value as URDFRobot)
      resolve(null)
    }
  })
}

const raycasterRef = shallowRef<THREE.Raycaster | null>(null)

// 主题颜色配置，便于后续统一调整
const themeColorConfig = {
  light: {
    background: 'rgb(100,100,100)',
    groundTop: 'rgb(255,255,255)',
    groundTopOpacity: 0.1,
    groundBottom: 'rgb(255,255,255)',
    groundBottomOpacity: 1,
    gridLine: 'rgb(130,130,130)',
    gridCenter: 'rgb(150,150,150)',
  },
  dark: {
    background: 'rgb(26,26,26)',
    groundTop: 'rgb(255,255,255)',
    groundTopOpacity: 0.1,
    groundBottom: 'rgb(0,0,0)',
    groundBottomOpacity: 1,
    gridLine: 'rgb(170,170,170)',
    gridCenter: 'rgb(130,130,130)',
  },
}

const hideRelativeAxis = ref<THREE.Group[]>([])
const handleHideRelativeAxis = () => {
  hideRelativeAxis.value.forEach(item => {
    threeRelativeAxis.hide(item)
  })
}
const handleShowRelativeAxis = () => {
  hideRelativeAxis.value.forEach(item => {
    threeRelativeAxis.show(item)
  })
}

// 高 DPI 显示适配
const getDpr = () => Math.min(window.devicePixelRatio || 1, 2)

const setTransparentObjects = ref<THREE.Mesh[]>([])
const transparentStatus = ref(false)
const setTransparent = (toTransparent: boolean) => {
  transparentStatus.value = toTransparent
  setTransparentObjects.value.forEach(item => {
    const materials = Array.isArray(item.material) ? item.material : [item.material]
    materials.forEach(material => {
      material.transparent = toTransparent
      material.opacity = toTransparent ? 0.3 : 1
      material.needsUpdate = true
    })
  })
}
const enableDefaultHoverFeature = ref(true)
const changeColorObjects = ref<THREE.Mesh[]>([])
const handleNewChangeColorObjectsList = (list: THREE.Mesh[] = [], handleNext = true) => {
  try {
    for (const index in changeColorObjects.value) {
      const item = changeColorObjects.value[index]
      const material = item.material as THREE.MeshStandardMaterial & { defaultColor?: number }
      material.color.set(material.defaultColor || 0xffffff)
    }
    for (const index in list) {
      const item = list[index]
      const material = item.material as THREE.MeshStandardMaterial & { defaultColor?: number }
      material.defaultColor = JSON.parse(JSON.stringify(material.color))
      material.color.set(0x8aa2ff)
    }
    changeColorObjects.value = [...list]
  } catch (e) {}

  if (isBVH.value) {
    if (changeColorObjects.value.length) {
      const item = changeColorObjects.value[0] as any
      if (item) {
        handleHoverBVHNode(item as BVHThreeNode)
      }
    } else {
      handleClearHoverBVHNode()
    }
  } else {
    if (changeColorObjects.value.length) {
      const item = changeColorObjects.value[0] as any
      if (item) {
        handleHoverURDFNode(item as URDFJoint, handleNext)
      }
    } else {
      handleClearHoverURDFNode()
    }
  }
}

// 单关节角度设置（支持 BVH 和 URDF）
function applySingleJointAngle(
  robot: URDFRobot | BVHThreeNode | null,
  jointName: string,
  angle: number,
  isBVHModel: boolean
): boolean {
  if (!robot || !jointName) return false

  // 处理 global_xyz（机器人空间位置）
  if (jointName === 'global_x' || jointName === 'global_y' || jointName === 'global_z') {
    const axis = jointName.slice(-1) as 'x' | 'y' | 'z'

    if (isBVHModel) {
      // BVH: 直接设置位置（BVH已经旋转对齐到正确的坐标系）
      if (robot.position) {
        // robot.position[axis] = angle
        //   ; (robotRef.value as any)?.reCompute?.()
        const pos: Record<string, number> = {}
        pos[axis] = angle
        ;(robot as any).setRootPosition(pos)
        ;(robot as any).reCompute()
        return true
      }
    } else {
      // URDF: 需要坐标系转换
      // URDF坐标系 (x, y, z) -> Three坐标系 (x, z, -y)
      if (robot.position) {
        if (axis === 'x') {
          robot.position.x = angle
        } else if (axis === 'y') {
          robot.position.z = -angle
        } else if (axis === 'z') {
          robot.position.y = angle
        }
        updateURDFThreeObjectControls(robot as URDFRobot)
        return true
      }
    }
    return false
  }

  // 处理 quater_xyzw（机器人根部四元数）
  if (
    jointName === 'quater_x' ||
    jointName === 'quater_y' ||
    jointName === 'quater_z' ||
    jointName === 'quater_w'
  ) {
    const component = jointName.slice(-1) as 'x' | 'y' | 'z' | 'w'

    if (isBVHModel) {
      // BVH: 四元数需要转换为根关节的欧拉角
      // 获取当前四元数，更新指定分量
      const q = robot.quaternion as THREE.Quaternion | undefined
      const currentQuat = q ? q.clone() : new THREE.Quaternion()
      currentQuat[component] = angle
      currentQuat.normalize()

      // 更新机器人对象的四元数
      if (q) {
        q.copy(currentQuat)
      }

      // 查找根关节并更新欧拉角
      const rootJoint = robot.children.find((child: any) => child.isBone) as THREE.Bone | undefined
      if (rootJoint) {
        // 获取旋转顺序（从元数据中）
        const rotationOrder = (rootJoint as any).rotationOrder || 'XYZ'
        // 将四元数转换为欧拉角
        const euler = new THREE.Euler().setFromQuaternion(currentQuat, rotationOrder)

        // 转换为度数并设置根关节旋转
        const xDeg = THREE.MathUtils.radToDeg(euler.x)
        const yDeg = THREE.MathUtils.radToDeg(euler.y)
        const zDeg = THREE.MathUtils.radToDeg(euler.z)

        if ((rootJoint as any).setRotation) {
          ;(rootJoint as any).setRotation(
            { x: xDeg, y: yDeg, z: zDeg, order: rotationOrder },
            false
          )
        }
      }

      ;(robotRef.value as any)?.reCompute?.()
      return true
    } else {
      // URDF: 直接设置四元数（不需要坐标系转换）
      // 根据 api.robot.rotation.quaternion.setURDF 的实现，直接设置即可
      if (robot.quaternion) {
        // 获取当前四元数，更新指定分量
        const q = robot.quaternion as THREE.Quaternion
        const currentQuat = q.clone()
        currentQuat[component] = angle
        currentQuat.normalize()

        q.copy(currentQuat)
        updateURDFThreeObjectControls(robot as URDFRobot)
        return true
      }
    }
    return false
  }

  // 处理普通关节角度
  if (isBVHModel) {
    // 期望 jointName 形如 "Spine_x" / "_y" / "_z"
    const suffix = jointName.slice(-2)
    const axis = suffix === '_x' ? 'x' : suffix === '_y' ? 'y' : suffix === '_z' ? 'z' : null
    if (!axis) return false
    const baseName = jointName.slice(0, -2)

    // 深度优先查找 BVH 关节
    let target: any = null
    const dfs = (node: BVHThreeNode) => {
      if (node.name === baseName) {
        target = node
        return
      }
      for (const child of node.children) {
        if (target) return
        dfs(child)
      }
    }
    dfs(robot as BVHThreeNode)
    if (!target) return false

    // BVH rotation 以度为单位，需要传递完整的 x, y, z 角度
    // 先获取当前的旋转值，然后只更新指定轴
    const currentRotation = {
      x: target.rotation?.x ?? 0,
      y: target.rotation?.y ?? 0,
      z: target.rotation?.z ?? 0,
      order: target.rotation?.order || target.rotationOrder || 'XYZ',
    }
    currentRotation[axis] = angle

    if (target.setRotation) {
      target.setRotation(currentRotation, false)
    } else if (target.rotation) {
      target.rotation[axis] = angle
    }
    ;(robotRef.value as any)?.reCompute?.()
    return true
  }

  // URDF：角度为弧度，直接对单关节 setRotationFromAxisAngle
  const visit = (node: any): boolean => {
    if (node?.type === 'URDFJoint' && node.name === jointName) {
      const axisVec = new THREE.Vector3(node.axis.x, node.axis.y, node.axis.z)
      node.setRotationFromAxisAngle(axisVec, angle)
      node._angle = angle
      // 同步可视控制器
      updateURDFThreeObjectControls(robot as URDFRobot)
      return true
    }
    if (Array.isArray(node?.children)) {
      for (const child of node.children) {
        if (visit(child)) return true
      }
    }
    return false
  }
  return visit(robot)
}

const handleHoverURDFNode = (node: URDFJoint, enableEmit = true) => {
  traversalURDFThreeObject(robotRef.value as URDFRobot, node => {
    const urdfNode = node as URDFJoint
    if (urdfNode?.threeObjects?.highLightSphere)
      sceneRef.value?.remove(urdfNode?.threeObjects?.highLightSphere as THREE.Mesh)
  })
  const parentNode = node?.parent?.parent?.parent as URDFJoint | undefined
  if (parentNode?.threeObjects?.highLightSphere) {
    // threeSphere.show(parentNode?.threeObjects?.highLightSphere as THREE.Mesh)
    sceneRef.value?.add(parentNode?.threeObjects?.highLightSphere as THREE.Mesh)
    if (enableEmit) {
      emit('onHoverURDFNode', {
        detail: {
          jointName: parentNode?.name,
        },
      })
      emit('onMouseEnterJoint', {
        detail: {
          jointName: parentNode?.name,
        },
      })
    }
  }
}

const handleClearHoverURDFNode = () => {
  traversalURDFThreeObject(robotRef.value as URDFRobot, node => {
    const urdfNode = node as URDFJoint
    // if(urdfNode?.threeObjects?.highLightSphere)threeSphere.hide(urdfNode?.threeObjects?.highLightSphere as THREE.Mesh)
    if (urdfNode?.threeObjects?.highLightSphere)
      sceneRef.value?.remove(urdfNode?.threeObjects?.highLightSphere as THREE.Mesh)
  })
  emit('onMouseLeaveJoint', {
    detail: {
      jointName: undefined,
    },
  })
}

const handleClearHoverBVHNode = () => {
  emit('onHoverBVHNode', undefined)
  emit('onMouseLeaveJoint', {
    detail: {
      jointName: undefined,
    },
  })
}

const handleHoverBVHNode = (node: BVHThreeNode) => {
  if (node?.threeObjectType === 'sphere') {
    emit('onHoverBVHNode', {
      node,
      cameraPosition: cameraRef.value?.position.clone() || new THREE.Vector3(0, 0, 0),
    })
    emit('onMouseEnterJoint', {
      detail: {
        jointName: node.node?.name,
      },
    })
  }
}

const collectedURDFMesh = ref<THREE.Mesh[]>([])
const handleCollectURDFMesh = (robot: URDFRobot) => {
  const handleNode = (node: any) => {
    if (node.type === 'URDFLink') {
      const visual = node.children.find((child: any) => child.type === 'URDFVisual')
      if (visual) {
        const mesh = visual.children.find((child: any) => child.isMesh)
        if (!collectedURDFMesh.value.includes(mesh) && mesh) {
          try {
            mesh._hoverableThreeObject = true
          } catch (e) {}
          collectedURDFMesh.value.push(mesh)
          setTransparentObjects.value.push(mesh)
          // console.log('collected new', mesh)
        }
      }
    }
    for (const child of node.children) {
      handleNode(child)
    }
  }
  handleNode(robot)
}
const getURDFMeshByJointName = (jointName: string) => {
  for (const index in collectedURDFMesh.value) {
    const item = collectedURDFMesh.value[index]
    if (item.parent?.parent?.parent?.name === jointName) {
      return item
    }
  }
  return null
}

onMounted(async () => {
  if (containerRef.value === null) return
  // 创建场景
  sceneRef.value = markRaw(new THREE.Scene())
  sceneRef.value.background = new THREE.Color('black')
  createBeautifulFourLights(sceneRef.value)
  // 创建渲染器
  rendererRef.value = markRaw(
    new THREE.WebGLRenderer({
      antialias: true,
    })
  )
  rendererRef.value.setPixelRatio(getDpr())
  rendererRef.value.setSize(containerRef.value.clientWidth, containerRef.value.clientHeight)
  containerRef.value.innerHTML = ''
  containerRef.value.appendChild(rendererRef.value.domElement)
  rendererRef.value.shadowMap.enabled = true
  rendererRef.value.shadowMap.type = THREE.PCFSoftShadowMap
  // 创建摄像机
  cameraRef.value = markRaw(
    new THREE.PerspectiveCamera(
      75,
      containerRef.value.clientWidth / containerRef.value.clientHeight,
      0.1,
      1000
    )
  )
  cameraRef.value.position.set(1, 0.5, 1)
  cameraRef.value.lookAt(0, 0, 0)
  // 创建摄像机控制
  cameraControlRef.value = markRaw(new OrbitControls(cameraRef.value, rendererRef.value.domElement))
  cameraControlRef.value.enableDamping = false
  cameraControlRef.value.dampingFactor = 0
  cameraControlRef.value.target.set(0, 0, 0)

  // 创建网格辅助线
  const initialTheme = props.isDark ? 'dark' : 'light'
  const gridColors = themeColorConfig[initialTheme]
  // 调小单个网格尺寸：缩小 size 并增加 divisions
  const gridSize = 1000
  const gridDivisions = 2000
  gridHelperRef.value = markRaw(
    new THREE.GridHelper(
      gridSize,
      gridDivisions,
      new THREE.Color(gridColors.gridLine),
      new THREE.Color(gridColors.gridCenter)
    )
  )
  gridHelperRef.value.visible = false // 默认隐藏，可通过API控制
  sceneRef.value.add(gridHelperRef.value)

  // 创建坐标轴辅助线
  axesHelperRef.value = markRaw(new THREE.AxesHelper(100))
  axesHelperRef.value.visible = false // 默认隐藏，可通过API控制
  sceneRef.value.add(axesHelperRef.value)

  // 创建射线投射器
  raycasterRef.value = markRaw(new THREE.Raycaster())
  const mouse = new THREE.Vector2()
  containerRef.value.addEventListener('mousemove', (e: MouseEvent) => {
    if (
      !containerRef.value ||
      !cameraRef.value ||
      !raycasterRef.value ||
      !enableDefaultHoverFeature.value
    )
      return
    const rect = containerRef.value.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    raycasterRef.value.setFromCamera(mouse, cameraRef.value as THREE.Camera)
    const intersects = raycasterRef.value
      .intersectObjects(sceneRef.value?.children || [], true)
      .filter(item => (item.object as any)._hoverableThreeObject)
    handleNewChangeColorObjectsList(
      intersects.map(item => item.object as THREE.Mesh).slice(0, 1) as THREE.Mesh[]
    )
  })

  // 启动渲染循环
  startRenderLoop()

  window.addEventListener('resize', handleResize)

  viewerResizeObserver.value = new ResizeObserver(() => {
    if (viewerResizeTimer.value !== null) {
      clearTimeout(viewerResizeTimer.value)
      viewerResizeTimer.value = null
    }
    // handleResize()
    viewerResizeTimer.value = setTimeout(() => handleResize(), 10)
  })
  viewerResizeObserver.value?.observe(containerRef.value as HTMLElement)

  setTimeout(() => {
    if (props.isDark) {
      setSceneThemeDark(sceneRef.value as THREE.Scene)
    } else {
      setSceneThemeLight(sceneRef.value as THREE.Scene)
    }
  }, 100)

  emit('onReady', {
    loadBVH(bvhContent: string = ''): void {
      const parsedBVH: BVHData = parseBVH(bvhContent, 1.2)
      console.log(parsedBVH)
      parsedBVHRef.value = parsedBVH
      const bvhThreeObject: BVHThreeNode = generateBVHThreeObject(parsedBVH, true)
      robotForComputeRef.value = generateBVHThreeObject(parsedBVH, false)
      bvhThreeObject.toOutSize = true
      addBVHThreeObjectToScene(bvhThreeObject, sceneRef.value as THREE.Scene)
      handleLoadNext(true, parsedBVH, bvhThreeObject)
      isBVH.value = true
    },
    loadURDFAndSTL(urdfPath: string = '', stlPaths: Record<string, string> = {}): void {
      const urdfLoader: URDFLoader = new URDFLoader()
      let _rbt: URDFRobot | null = null
      urdfLoader.loadMeshCb = (
        stlName: string,
        mgr: THREE.LoadingManager,
        done: (mesh: THREE.Mesh) => void
      ): void => {
        const cleanedName: string = stlName.slice(0, stlName.length - 4)
        const nameParts: string[] = cleanedName.split('/')
        const finalName: string = nameParts[nameParts.length - 1]
        const stlLoad: STLLoader = new STLLoader(mgr)
        stlLoad.load(
          stlPaths[`${finalName}.STL`] || stlPaths[`${finalName}.stl`],
          (objG: THREE.BufferGeometry) => {
            done(
              markRaw(
                new THREE.Mesh(
                  objG,
                  new THREE.MeshPhysicalMaterial({
                    metalness: 0.8,
                    roughness: 0.3,
                    reflectivity: 1.0,
                    clearcoat: 0.6,
                    clearcoatRoughness: 0.1,
                    envMapIntensity: 1.2,
                    transparent: false,
                    depthWrite: true,
                    depthTest: true,
                  })
                )
              )
            )
            if (_rbt !== null) {
              handleCollectURDFMesh(_rbt)
            }
          }
        )
      }
      urdfLoader.load(urdfPath, (rbt: URDFRobot) => {
        _rbt = rbt
        addThreeJSAdaptToURDFThreeObject(rbt)
        addControlsToURDFThreeObject(rbt, sceneRef.value as THREE.Scene)
        sceneRef.value?.add(rbt)

        // 创建用于关节位置计算的非可视化机器人对象
        const urdfLoader2 = new URDFLoader()
        urdfLoader2.loadMeshCb = () => {}
        urdfLoader2.load(urdfPath, (rbt2: URDFRobot) => {
          addThreeJSAdaptToURDFThreeObject(rbt2)
          robotForComputeRef.value = rbt2
          console.log('robotForComputeRef', robotForComputeRef.value)
          handleLoadNext(false, null, null, rbt)
        })
      })
    },
  })
})

function handleLoadNext(
  isBVH: boolean,
  parsedBVH?: BVHData | null,
  bvhThreeObject?: BVHThreeNode | null,
  urdfThreeObject?: URDFRobot | null
) {
  // 统一存储当前相机/控制器，便于外部获取最新引用
  const cameraBridge = {
    camera: cameraRef.value as CameraWithProjection | null,
    controls: cameraControlRef.value as OrbitControls | null,
  }
  const urdfLikeRobot =
    isBVH && bvhThreeObject ? convertBVHThreeObjectToURDFLike(bvhThreeObject) : null
  const bvhMotionJSON = isBVH ? generateBVHMotionJSON(parsedBVH as BVHData) : null

  robotRef.value = (isBVH ? bvhThreeObject : urdfThreeObject) || null
  console.log('robot object', robotRef.value)

  const api = {
    isBVH,
    robot: isBVH ? bvhThreeObject : urdfThreeObject,
    bvhMotionJSON,

    dataAPI: {
      generateBVH: (bvhMotionJSON: BVHExportObject | null) => generateBVH(bvhMotionJSON),
      generateBVHDataFromMotionJSON: (motionJSON: MotionJSON) =>
        generateBVHDataFromMotionJSON(motionJSON),
    },

    threeAPI: {
      _cameraBridge: cameraBridge,
      // 网格辅助线控制
      gridHelper: {
        setVisible: (visible: boolean, position?: THREE.Vector3) => {
          if (!gridHelperRef.value) return
          gridHelperRef.value.visible = visible
          if (position) {
            gridHelperRef.value.position.copy(position)
          } else {
            gridHelperRef.value.position.set(0, 0, 0)
          }
        },
      },

      // 坐标轴辅助线控制
      axesHelper: {
        setVisible: (visible: boolean, scale = 1, position?: THREE.Vector3) => {
          if (!axesHelperRef.value) return
          axesHelperRef.value.visible = visible
          axesHelperRef.value.scale.setScalar(scale)
          if (position) {
            axesHelperRef.value.position.copy(position)
          } else {
            axesHelperRef.value.position.set(0, 0, 0)
          }
        },
      },

      // 设置帧数据
      setFrame(frameData: Record<string, number>) {
        if (isBVH) {
          applyMotionFrameObjectToBVHThreeObject(bvhThreeObject as BVHThreeNode, frameData)
        } else {
          setFrameDataToURDFThreeObject(
            urdfThreeObject as URDFRobot & { joints: Record<string, any> },
            frameData as FrameLike
          )
        }
      },

      // 直接暴露 Three.js 核心对象（随 cameraRef / controlsRef 实时更新）
      get camera(): CameraWithProjection | null {
        return cameraBridge.camera
      },
      set camera(cam: CameraWithProjection | null) {
        cameraBridge.camera = cam
      },
      get controls() {
        return cameraBridge.controls
      },
      set controls(ctrl: OrbitControls | null) {
        cameraBridge.controls = ctrl
      },
      get scene() {
        return sceneRef.value as THREE.Scene
      },
      get renderer() {
        return rendererRef.value as THREE.WebGLRenderer
      },
    },

    // viewer 对象（保持向后兼容）
    viewer: {
      _cameraBridge: cameraBridge,
      // 直接设置单个关节角度（仅应用到当前已加载的模型）
      setSingleJointValue(jointName: string, angle: number): boolean {
        return applySingleJointAngle(robotRef.value as any, jointName, angle, isBVH)
      },
      // 网格辅助线控制
      gridHelper: {
        setVisible: (visible: boolean, position?: THREE.Vector3) => {
          if (!gridHelperRef.value) return
          gridHelperRef.value.visible = visible
          if (position) {
            gridHelperRef.value.position.copy(position)
          } else {
            gridHelperRef.value.position.set(0, 0, 0)
          }
        },
      },

      // 坐标轴辅助线控制
      axesHelper: {
        setVisible: (visible: boolean, scale = 1, position?: THREE.Vector3) => {
          if (!axesHelperRef.value) return
          axesHelperRef.value.visible = visible
          axesHelperRef.value.scale.setScalar(scale)
          if (position) {
            axesHelperRef.value.position.copy(position)
          } else {
            axesHelperRef.value.position.set(0, 0, 0)
          }
        },
      },
      scene: sceneRef.value,
      get camera(): CameraWithProjection | null {
        return cameraBridge.camera
      },
      set camera(cam: CameraWithProjection | null) {
        cameraBridge.camera = cam
      },
      get renderer() {
        return rendererRef.value as THREE.WebGLRenderer
      },
      get controls() {
        return cameraBridge.controls
      },
      set controls(ctrl: OrbitControls | null) {
        cameraBridge.controls = ctrl
      },
      skeleton: isBVH ? (bvhThreeObject as BVHThreeNode | null) : null,
      clip: null,
      robot: isBVH ? urdfLikeRobot : urdfThreeObject,
      getRobot: () => (isBVH ? urdfLikeRobot : urdfThreeObject),
      getObject: () => (isBVH ? urdfLikeRobot || bvhThreeObject : urdfThreeObject),
      updateSize: () => handleResize(),
      addEventListener: (type: string, listener: EventListener) => {
        window.addEventListener(type, listener)
      },
      removeEventListener: (type: string, listener: EventListener) => {
        window.removeEventListener(type, listener)
      },
      setOrbitZoomSpeed(speed: number) {
        if (cameraControlRef.value) {
          console.log(speed)
          cameraControlRef.value.zoomSpeed = speed
        }
      },
      dispatchEvent: (event: Event | string, detail?: any) => {
        if (typeof event === 'string') {
          const customEvent = new CustomEvent(event, { detail })
          return window.dispatchEvent(customEvent)
        }
        return window.dispatchEvent(event)
      },
      setJointValue: (jointName: string, value: number) => {
        const robot = isBVH ? urdfLikeRobot : urdfThreeObject
        if (robot && (robot as any).joints && (robot as any).joints[jointName]) {
          const joint = (robot as any).joints[jointName]
          if (joint.setRotationFromAxisAngle) {
            joint.setRotationFromAxisAngle(joint.axis || new THREE.Vector3(0, 1, 0), value)
          }
        }
      },
      setJointValues: (values: Record<string, number>) => {
        Object.entries(values).forEach(([jointName, value]) => {
          const robot = isBVH ? urdfLikeRobot : urdfThreeObject
          if (robot && (robot as any).joints && (robot as any).joints[jointName]) {
            const joint = (robot as any).joints[jointName]
            if (joint.setRotationFromAxisAngle) {
              joint.setRotationFromAxisAngle(joint.axis || new THREE.Vector3(0, 1, 0), value)
            }
          }
        })
      },
      setFrameIndex: isBVH
        ? (frame: number, shouldPlay: boolean | null = null) => {
            console.log('setFrameIndex', frame, shouldPlay)
          }
        : undefined,
      updateContactState: isBVH
        ? (leftContact: boolean, rightContact: boolean) => {
            console.log('updateContactState', leftContact, rightContact)
          }
        : undefined,
      recenter: () => {
        if (cameraRef.value && cameraControlRef.value) {
          cameraControlRef.value.target.set(0, 0, 0)
          cameraRef.value.position.set(2, 1.5, 2)
          cameraRef.value.lookAt(0, 0, 0)
          cameraControlRef.value.update()
        }
      },
      setTransparent: (toTransparent: boolean) => {
        setTransparent(toTransparent)
      },
      setGroundBottomTransparent: (enable: boolean) => {
        if (!groundMeshesRef.value?.bottom) return
        const ground = groundMeshesRef.value.bottom
        if (ground.material) {
          const mat = ground.material as THREE.MeshStandardMaterial
          mat.transparent = enable
          mat.opacity = enable ? 0.2 : 1
          mat.depthWrite = !enable
          mat.needsUpdate = true
        }
      },
      setEnableControl: (enable: boolean) => {
        if (cameraControlRef.value) {
          cameraControlRef.value.enabled = !!enable
        }
      },
      setHideRelativeAxis: (hide: boolean) => {
        if (hide) {
          handleHideRelativeAxis()
        } else {
          handleShowRelativeAxis()
        }
      },
      setHoveredJoints: async (joints: string[]) => {
        const re = []
        if (isBVH) {
          traversalBVHThreeObject(bvhThreeObject as BVHThreeNode, node => {
            if (node.threeObjects.highLightSphere) {
              // threeSphere.hide(node.threeObjects.highLightSphere as THREE.Mesh)
              sceneRef.value?.remove(node.threeObjects.highLightSphere as THREE.Mesh)
            }
          })
          for (const jointName of joints) {
            const jointNode = (await searchRobotJointNode(jointName)) as BVHThreeNode | null
            if (jointNode?.threeObjects?.highLightSphere) {
              // threeSphere.show(jointNode.threeObjects.highLightSphere as THREE.Mesh)
              sceneRef.value?.add(jointNode.threeObjects.highLightSphere as THREE.Mesh)
            }
          }
        } else {
          for (const jointName of joints) {
            const jointNode = await searchRobotJointNode(jointName)
            re.push(getURDFMeshByJointName(jointName) as THREE.Mesh)
          }
          handleNewChangeColorObjectsList(re as any, false)
        }
      },
      jointPositionLine3D: {
        compute(start: number | undefined, end: number | undefined, motionData: object[]) {
          let startIndex = start || 0
          let endIndex = end || motionData.length - 1
          if (startIndex < 0) startIndex = 0
          if (endIndex > motionData.length - 1) endIndex = motionData.length - 1
          let arr = motionData.slice(startIndex, endIndex + 1)
          const robot = robotForComputeRef.value
          if (isBVH) {
            for (let i = 0; i < arr.length; i++) {
              const currentFrame = arr[i]
              applyMotionFrameObjectToBVHThreeObject(
                robot as BVHThreeNode,
                currentFrame as Record<string, number>
              )
              const jointPositionData = computeBVHJointPositions(robot as BVHThreeNode)
              for (const jointName in jointPositionData) {
                if (jointName.includes('global') || jointName.includes('quater')) continue
                const jointPosition = jointPositionData[jointName].position
                const jointRotation = jointPositionData[jointName].rotation
                jointPositionLineMgr.value.setData(
                  jointName,
                  i + startIndex,
                  jointPosition,
                  jointRotation
                )
              }
            }
            for (const jointName of jointPositionLineMgr.value.getLineThreeObjectsJointNames()) {
              jointPositionLineMgr.value.updateLineThreeObjects(jointName, startIndex, endIndex)
            }
          } else {
            for (let i = 0; i < arr.length; i++) {
              const currentFrame = arr[i]
              if (robot) {
                setFrameDataToURDFThreeObject(
                  robot as URDFRobot & { joints: Record<string, any> },
                  currentFrame as Record<string, number>
                )
                const jointPositionData = computeURDFJointPositions(robot as URDFRobot)
                for (const jointName in jointPositionData) {
                  if (jointName.includes('global') || jointName.includes('quater')) continue
                  const jointPosition = jointPositionData[jointName].position
                  const jointRotation = jointPositionData[jointName].rotation
                  jointPositionLineMgr.value.setData(
                    jointName,
                    i + startIndex,
                    jointPosition,
                    jointRotation
                  )
                }
              }
            }
            for (const jointName of jointPositionLineMgr.value.getLineThreeObjectsJointNames()) {
              jointPositionLineMgr.value.updateLineThreeObjects(jointName, startIndex, endIndex)
            }
            // let ind = 0
            // for (const jointName in arr[0]) {
            //   if (jointName.includes('global') || jointName.includes('quater')) continue
            //   console.log(jointName)
            //   jointPositionLineMgr.value.updateLineThreeObjects(jointName, startIndex, endIndex)
            //   ind++
            //   if (ind === 4) break
            // }
          }
        },
        updateRange(
          startIndex: number | undefined,
          endIndex: number | undefined,
          motionData?: any[]
        ) {
          if (startIndex !== undefined && startIndex < 0) startIndex = 0
          if (endIndex !== undefined && motionData && endIndex > motionData.length - 1)
            endIndex = motionData.length - 1
          const lastStartIndex = jointPositionLineMgr.value.lineThreeConfig.range.startIndex
          const lastEndIndex = jointPositionLineMgr.value.lineThreeConfig.range.endIndex
          jointPositionLineMgr.value.lineThreeConfig.range.startIndex = startIndex || 0
          jointPositionLineMgr.value.lineThreeConfig.range.endIndex =
            endIndex || (motionData ? motionData.length - 1 : 0)
          for (const jointName of jointPositionLineMgr.value.getLineThreeObjectsJointNames()) {
            jointPositionLineMgr.value.updateLineThreeObjects(
              jointName,
              Math.min(lastStartIndex, startIndex || 0),
              Math.max(lastStartIndex, startIndex || 0)
            )
            jointPositionLineMgr.value.updateLineThreeObjects(
              jointName,
              Math.min(lastEndIndex, endIndex || 0),
              Math.max(lastEndIndex, endIndex || 0)
            )
          }
        },
        setTotal(total: number) {
          jointPositionLineMgr.value.lineThreeConfig.total = total
        },
        showLineThreeObjects(jointName: string) {
          jointPositionLineMgr.value.updateLineThreeObjects(
            jointName,
            jointPositionLineMgr.value.lineThreeConfig.range.startIndex,
            jointPositionLineMgr.value.lineThreeConfig.range.endIndex
          )
        },
        hideLineThreeObjects(jointName: string) {
          jointPositionLineMgr.value.removeAndDeleteLineThreeObjects(jointName)
        },
        isLineThreeObjectsVisible(jointName: string) {
          return jointPositionLineMgr.value.lineThreeObjects[jointName] !== undefined
        },
        showNum() {
          return Object.keys(jointPositionLineMgr.value.lineThreeObjects).length
        },
        setCurrentIndex(index: number) {
          jointPositionLineMgr.value.lineThreeConfig.currentIndex = index
        },
        resetColor() {
          jointPositionLineMgr.value.resetColor()
        },
      },
      changeCameraType(name: 'perspective' | 'orthographic') {
        if (!containerRef.value || !rendererRef.value) return
        const currentCamera = cameraRef.value
        if (!currentCamera) return
        if (name === 'perspective' && currentCamera instanceof THREE.PerspectiveCamera) return
        if (name === 'orthographic' && currentCamera instanceof THREE.OrthographicCamera) return

        // 记录当前相机的姿态、位置与焦点
        const currentPosition = currentCamera.position.clone()
        const currentQuaternion = currentCamera.quaternion.clone()
        const currentUp = currentCamera.up.clone()
        const currentTarget = cameraControlRef.value?.target.clone() || new THREE.Vector3(0, 0, 0)
        // 记录当前控制器的速度参数
        const currentZoomSpeed = cameraControlRef.value?.zoomSpeed || 1.0
        // 保留已有的 change 监听，切换 OrbitControls 后重新绑定
        const oldChangeListeners =
          (cameraControlRef.value as any)?._listeners?.change?.slice?.() || []

        const width = containerRef.value.clientWidth
        const height = containerRef.value.clientHeight
        const aspect = width / height || 1

        let newCamera: CameraWithProjection

        if (name === 'perspective') {
          const fov = currentCamera instanceof THREE.PerspectiveCamera ? currentCamera.fov : 75
          newCamera = markRaw(new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000))
        } else {
          // 使用当前位置与焦点的距离作为视椎体大小，保证切换后画面尺度相近
          const distanceToTarget = currentPosition.clone().sub(currentTarget).length() || 1
          const viewSize = distanceToTarget * 2
          const halfH = viewSize / 2
          const halfW = halfH * aspect
          const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 2000)
          ortho.userData.viewSize = viewSize
          newCamera = markRaw(ortho)
        }

        // 恢复姿态与位置
        newCamera.position.copy(currentPosition)
        newCamera.quaternion.copy(currentQuaternion)
        newCamera.up.copy(currentUp)
        newCamera.lookAt(currentTarget)
        // 重新创建控制器并继承焦点
        if (cameraControlRef.value) {
          cameraControlRef.value.dispose()
        }
        cameraControlRef.value = markRaw(new OrbitControls(newCamera, rendererRef.value.domElement))
        cameraControlRef.value.enableDamping = false
        cameraControlRef.value.dampingFactor = 0
        cameraControlRef.value.target.copy(currentTarget)
        // 恢复控制器速度参数
        cameraControlRef.value.zoomSpeed = currentZoomSpeed
        cameraControlRef.value.update()
        // 重新绑定此前注册的 change 监听，确保外部回调（如 quatSphere 同步）继续生效
        for (const fn of oldChangeListeners) {
          if (typeof fn === 'function') {
            cameraControlRef.value.addEventListener('change', fn)
          }
        }

        ;(api.threeAPI as any)._cameraBridge.controls = cameraControlRef.value
        ;(api.viewer as any)._cameraBridge.controls = cameraControlRef.value

        // 更新 URDF 关节拖拽控件的控制器引用，避免切换摄像机后失效
        if (!isBVH && robotRef.value && cameraControlRef.value) {
          traversalURDFThreeObject(robotRef.value as URDFRobot, (node: URDFJoint) => {
            const torus = node.threeObjects?.jointAngleTorus
            if (torus?.api) {
              if (torus.api.setControls) {
                torus.api.setControls(cameraControlRef.value)
              }
              if (torus.api.setCamera) {
                torus.api.setCamera(newCamera)
              }
            }
          })
        }

        cameraRef.value = newCamera
        ;(api.threeAPI as any)._cameraBridge.camera = newCamera
        ;(api.viewer as any)._cameraBridge.camera = newCamera

        handleResize()
      },
      getBVHJointInfo(jointName: string) {
        return getBVHJointInfo(bvhThreeObject as BVHThreeNode, jointName)
      },
    },
  }

  emit('onLoaded', api)
}

const jointPositionLineMgr = shallowRef({
  data: {} as Record<string, Array<{ position: Vector3Like; rotation: EulerLike }>>,
  setData(jointName: string, frameIndex: number, position: Vector3Like, rotation: EulerLike) {
    const data = this.data
    if (data[jointName] === undefined) {
      data[jointName] = []
    }
    data[jointName][frameIndex] = { position, rotation }
  },
  getData(jointName: string, frameIndex: number) {
    const data = this.data
    return data[jointName][frameIndex]
  },
  lineThreeObjects: {} as Record<string, Array<{ sphere?: THREE.Mesh; cylinder?: THREE.Mesh }>>,
  lineThreeConfig: {
    range: {
      startIndex: 0,
      endIndex: 0,
    },
    total: 0,
    currentIndex: 0,
  },
  getLineThreeObjectsJointNames() {
    return Object.keys(this.lineThreeObjects)
  },
  removeAndDeleteLineThreeObjects(jointName: string) {
    for (let i = 0; i < this.lineThreeObjects[jointName]?.length || 0; i++) {
      const currentLineThreeObjects = this.lineThreeObjects[jointName]?.[i]
      if (currentLineThreeObjects?.sphere) {
        sceneRef.value?.remove(currentLineThreeObjects?.sphere)
      }
      if (currentLineThreeObjects?.cylinder) {
        sceneRef.value?.remove(currentLineThreeObjects?.cylinder)
      }
    }
    delete this.lineThreeObjects[jointName]
  },
  updateLineThreeObjects(jointName: string, startIndex: number, endIndex: number) {
    if (this.data[jointName] === undefined) return
    if (this.lineThreeObjects[jointName] === undefined) {
      this.lineThreeObjects[jointName] = []
    }
    const currentJointFrameNum = this.data[jointName].length
    for (let i = startIndex; i <= endIndex; i++) {
      const currentData = this.data[jointName][i]
      const nextData = this.data[jointName][i + 1]
      const currentLineThreeObjects = this.lineThreeObjects[jointName][i] || undefined
      if (
        currentData === undefined ||
        (() => {
          return (
            i < this.lineThreeConfig.range.startIndex || i > this.lineThreeConfig.range.endIndex
          )
        })()
      ) {
        if (currentLineThreeObjects === undefined) {
        } else {
          if (currentLineThreeObjects?.sphere) {
            const sphere: any = currentLineThreeObjects.sphere
            sceneRef.value?.remove(currentLineThreeObjects?.sphere)
            sphere.removeFromScene = true
          }
          if (currentLineThreeObjects?.cylinder) {
            const cylinder: any = currentLineThreeObjects.cylinder
            sceneRef.value?.remove(currentLineThreeObjects?.cylinder)
            cylinder.removeFromScene = true
          }
        }
      } else {
        if (currentLineThreeObjects === undefined) {
          // const sphere = threeSphere.create(
          //   0.001,
          //   '#ff0'
          // )
          // threeSphere.move(sphere, currentData.position)
          let cylinder = undefined
          if (nextData) {
            cylinder = threeCylinder.create(
              currentData.position,
              nextData.position,
              isBVH.value ? 0.0015 : 0.003,
              rainbowColor(jointPositionLineMgr.value.lineThreeConfig.total, i)
            )
          }
          const objects = {
            // sphere,
            cylinder,
          }
          // sceneRef.value?.add(sphere)
          if (cylinder) {
            sceneRef.value?.add(cylinder)
          }
          this.lineThreeObjects[jointName][i] = objects
        } else {
          if (currentLineThreeObjects?.sphere) {
            const sphere: any = currentLineThreeObjects.sphere
            threeSphere.move(currentLineThreeObjects?.sphere, currentData.position)
            if (sphere.removeFromScene) {
              sceneRef.value?.add(currentLineThreeObjects?.sphere)
              delete sphere.removeFromScene
            }
          }
          if (currentLineThreeObjects?.cylinder && nextData) {
            const cylinder: any = currentLineThreeObjects.cylinder
            threeCylinder.update(
              currentLineThreeObjects?.cylinder,
              currentData.position,
              nextData.position
            )
            if (cylinder.removeFromScene) {
              sceneRef.value?.add(currentLineThreeObjects?.cylinder)
              delete cylinder.removeFromScene
            }
          }
        }
      }
    }
  },
  resetColor() {
    for (const jointName of this.getLineThreeObjectsJointNames()) {
      for (let i = 0; i < this.lineThreeObjects[jointName].length; i++) {
        const currentLineThreeObjects = this.lineThreeObjects[jointName][i]
        if (currentLineThreeObjects?.cylinder) {
          const material = currentLineThreeObjects.cylinder.material as THREE.MeshStandardMaterial
          material.color.set(rainbowColor(this.lineThreeConfig.total, i))
        }
      }
    }
  },
})

function handleResize() {
  if (!containerRef.value || !cameraRef.value || !rendererRef.value) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  const aspect = width / height

  // 更新相机宽高比或正交投影视椎体
  if (cameraRef.value instanceof THREE.PerspectiveCamera) {
    cameraRef.value.aspect = aspect
    ;(cameraRef.value as THREE.PerspectiveCamera).updateProjectionMatrix()
  } else if (cameraRef.value instanceof THREE.OrthographicCamera) {
    const viewSize =
      (cameraRef.value as any).userData?.viewSize ||
      cameraControlRef.value?.object?.userData?.viewSize ||
      10
    const halfH = viewSize / 2
    const halfW = halfH * aspect
    cameraRef.value.left = -halfW
    cameraRef.value.right = halfW
    cameraRef.value.top = halfH
    cameraRef.value.bottom = -halfH
    ;(cameraRef.value as THREE.OrthographicCamera).updateProjectionMatrix()
  }

  // 更新渲染器大小
  rendererRef.value.setPixelRatio(getDpr())
  rendererRef.value.setSize(width, height)
}

function startRenderLoop() {
  function animate() {
    if (rendererRef.value === null || sceneRef.value === null || cameraRef.value === null) return

    // 更新控制器（如果启用了阻尼）
    // if (cameraControlRef.value) {
    //   cameraControlRef.value.update()
    // }

    rendererRef.value.render(sceneRef.value, cameraRef.value)
    animationFrameId = requestAnimationFrame(animate)
  }
  animate()
}

onUnmounted(() => {
  // 取消动画循环
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }

  // 移除事件监听
  window.removeEventListener('resize', handleResize)

  // 清理 Three.js 资源
  if (rendererRef.value) {
    rendererRef.value.dispose()
  }

  if (cameraControlRef.value) {
    cameraControlRef.value.dispose()
  }

  viewerResizeObserver.value?.disconnect()
})

function generateBVHMotionJSON(parsedBVH: BVHData): MotionJSON {
  const motionJSON: MotionJSON = {
    dof_names: [
      'floating_base_joint',
      ...(() => {
        const re = []
        const usedName: string[] = []
        for (let i = 0; i < parsedBVH.channels.length; i += 1) {
          const jointName = parsedBVH.channels[i].name
          const channel = parsedBVH.channels[i].channel
          if (usedName.includes(jointName)) continue
          if (channel.includes('rotation')) {
            re.push(`${jointName}_x`)
            re.push(`${jointName}_y`)
            re.push(`${jointName}_z`)
            usedName.push(jointName)
          }
        }
        return re
      })(),
    ],
    data: (() => {
      const re = []
      for (let i = 0; i < parsedBVH.frames.length; i++) {
        const currentFrame = parsedBVH.frames[i]
        let currentReFrame: number[] = []
        const usedName: string[] = []
        for (let i1 = 0; i1 < parsedBVH.channels.length; i1 += 1) {
          const jointName = parsedBVH.channels[i1].name
          const channel = parsedBVH.channels[i1].channel
          if (usedName.indexOf(jointName) > -1) continue
          usedName.push(jointName)
          if (jointName === parsedBVH.hierarchy?.name) {
            currentReFrame = [
              ...[
                currentFrame[parsedBVH.joints[jointName]['Xposition']],
                currentFrame[parsedBVH.joints[jointName]['Yposition']],
                currentFrame[parsedBVH.joints[jointName]['Zposition']],
                0,
                0,
                0,
                1,
                currentFrame[parsedBVH.joints[jointName]['Xrotation']],
                currentFrame[parsedBVH.joints[jointName]['Yrotation']],
                currentFrame[parsedBVH.joints[jointName]['Zrotation']],
              ],
              ...currentReFrame,
            ]
          } else {
            currentReFrame.push(currentFrame[parsedBVH.joints[jointName]['Xrotation']])
            currentReFrame.push(currentFrame[parsedBVH.joints[jointName]['Yrotation']])
            currentReFrame.push(currentFrame[parsedBVH.joints[jointName]['Zrotation']])
          }
        }
        re.push(currentReFrame)
      }
      return re
    })(),
    framerate: parsedBVH.frameRate,
    bvhAdapt: {
      orientationFieldName: parsedBVH.hierarchy?.name || '',
      positionScale: 1,
      standardRootPositionOffset: parsedBVH.standardRootPositionOffset,
      standardScale: parsedBVH.standardScale,
      standardHeight: parsedBVH.standardHeight,
      defaultHeight: parsedBVH.defaultHeight,
      rootToHeightMin: parsedBVH.rootToHeightMin,
      rootToHeightMax: parsedBVH.rootToHeightMax,
    },
    joints: parsedBVH.joints,
  }
  return motionJSON
}

/**
 * 将 MotionJSON 还原成 BVHData 结构（与 generateBVHMotionJSON 相反）
 *
 * MotionJSON.data 格式：
 * - 每帧前 10 个值：[pos_x, pos_y, pos_z, quat_x(0), quat_y(0), quat_z(0), quat_w(1), rot_x, rot_y, rot_z]
 *   （四元数是占位，实际不使用）
 * - 之后每 3 个值为一个关节的旋转：[rot_x, rot_y, rot_z]
 *
 * BVHData.frames 格式：按 channels 顺序排列，channel.index 表示在 frame 中的位置
 */
function generateBVHDataFromMotionJSON(motionJSON: MotionJSON): BVHData {
  const parsedBVH = parsedBVHRef.value
  const searchParsedBVHNode = (jointName: string): BVHNode | null => {
    let re = null as BVHNode | null
    const handle = (node: BVHNode | null) => {
      if (node === null) return
      if (node.name === jointName) {
        re = node
        return
      }
      for (const child of node.children) {
        handle(child)
      }
    }
    handle(parsedBVH?.hierarchy || null)
    return re
  }
  const parsedBVHJointInfos: Record<string, BVHNode | null> = {}
  for (const jointName of Object.keys(parsedBVH?.joints || {})) {
    parsedBVHJointInfos[jointName] = searchParsedBVHNode(jointName)
  }
  const frames = motionJSON?.data || []
  const frameRate = typeof motionJSON?.framerate === 'number' ? motionJSON.framerate : 0
  const frameTime = frameRate ? 1 / frameRate : 0
  const rootName = parsedBVH?.hierarchy?.name || (motionJSON as any)?.bvhAdapt?.orientationFieldName
  const positionScale = (motionJSON as any)?.bvhAdapt?.positionScale || 1
  let dof_names = JSON.parse(JSON.stringify(motionJSON?.dof_names))
  dof_names = [
    `${rootName}_px`,
    `${rootName}_py`,
    `${rootName}_pz`,
    undefined,
    undefined,
    undefined,
    undefined,
    ...dof_names.slice(1),
  ]

  const reFrames: number[][] = []
  for (const item of frames) {
    const currentFrame: number[] = []
    for (const channelItem of parsedBVH?.channels || []) {
      const fieldName = channelItem.name
      const jointInfo = parsedBVHJointInfos[fieldName]
      const channelName = channelItem.channel
      const isPositionChannel = channelName.includes('position')
      const channelName_component = channelName.slice(0, 1).toLocaleLowerCase()
      const getFieldName = `${fieldName}_${isPositionChannel ? 'p' : ''}${channelName_component}`
      const valueIndex = dof_names.indexOf(getFieldName)
      if (fieldName === rootName) {
        const value = item[valueIndex]
        currentFrame.push(value)
      } else {
        //   if (valueIndex === -1) {
        //   currentFrame.push(0)
        // } else {
        //   const value = item[valueIndex]
        //   currentFrame.push(value)
        // }
        if (isPositionChannel) {
          const value = jointInfo?.offset
            ? (jointInfo.offset as any)[channelName_component as keyof BVHOffset]
            : 0
          currentFrame.push(value)
        } else {
          const value = item[valueIndex]
          currentFrame.push(value)
        }
      }
    }
    reFrames.push(currentFrame)
  }
  if (parsedBVH) {
    parsedBVH.frames = reFrames
    parsedBVH.frameRate = frameRate
    parsedBVH.frameTime = frameTime
    parsedBVH.frameNum = reFrames.length
    return parsedBVH
  }
  throw new Error('parsedBVH is null')
}

function setFrameDataToURDFThreeObject(
  urdfThreeObject: URDFRobot & { joints: Record<string, any> },
  newFrameData: Record<string, number> | null = null
): void {
  if (!newFrameData) return
  if (urdfThreeObject.setPosition)
    urdfThreeObject.setPosition(
      urdfToThree({
        x: newFrameData['global_x'],
        y: newFrameData['global_y'],
        z: newFrameData['global_z'],
      })
    )

  const dataQuaternion: QuaternionLike = {
    x: newFrameData['quater_x'],
    y: newFrameData['quater_y'],
    z: newFrameData['quater_z'],
    w: newFrameData['quater_w'],
  }

  const q: THREE.Quaternion = new THREE.Quaternion(
    dataQuaternion.x,
    dataQuaternion.y,
    dataQuaternion.z,
    dataQuaternion.w
  )

  const rotationQ: THREE.Quaternion = new THREE.Quaternion()
  rotationQ.setFromEuler(new THREE.Euler(degToRad(-90), 0, 0, 'XYZ'))

  rotationQ.multiply(q)

  if (urdfThreeObject.setQuaternion) {
    urdfThreeObject.setQuaternion({
      x: rotationQ.x,
      y: rotationQ.y,
      z: rotationQ.z,
      w: rotationQ.w,
    })
  }

  for (const jointName in newFrameData) {
    if (
      jointName === 'global_x' ||
      jointName === 'global_y' ||
      jointName === 'global_z' ||
      jointName === 'quater_x' ||
      jointName === 'quater_y' ||
      jointName === 'quater_z' ||
      jointName === 'quater_w'
    )
      continue
    urdfThreeObject.joints[jointName].setRotationFromAxisAngle(
      urdfThreeObject.joints[jointName].axis,
      newFrameData[jointName]
    )
    console.log(urdfThreeObject.joints[jointName].setRotationFromAxisAngle)
    urdfThreeObject.joints[jointName]._angle = newFrameData[jointName]
  }

  updateURDFThreeObjectControls(urdfThreeObject)
}

function updateURDFThreeObjectControls(urdfThreeObject: URDFRobot): void {
  const computedJoints: ComputedJointPositions = computeURDFJointPositions(urdfThreeObject)

  const handleNode = (node: THREE.Object3D): void => {
    const urdfNode = node as URDFJoint

    if (
      urdfNode.type === 'URDFJoint' &&
      urdfNode._jointType === 'revolute' &&
      urdfNode.isThreeObjectNode &&
      urdfNode.threeObjects
    ) {
      const currentNodeThreeObjects = urdfNode.threeObjects
      const currentNodeComputedJoint: URDFJointPose = computedJoints[urdfNode.name]

      if (currentNodeThreeObjects.axis !== undefined) {
        threeRelativeAxis.move(currentNodeThreeObjects.axis, currentNodeComputedJoint.position)
        threeRelativeAxis.setRotation(
          currentNodeThreeObjects.axis,
          compoundEulerRotation(
            currentNodeComputedJoint.rotationDegree,
            urdfToThreeRotation(eulerRadToDeg(urdfNode.rotation)),
            'XYZ'
          )
        )
      }

      let rotationLineEndPosition: Vector3Like | undefined = undefined
      let rotationLineEndRotation: EulerLike | undefined = undefined
      if (currentNodeThreeObjects.rotationLine !== undefined) {
        const c: Vector3Like = urdfToThree(urdfNode.axis)
        rotationLineEndRotation = compoundEulerRotation(
          currentNodeComputedJoint.rotationDegree,
          urdfToThreeRotation(eulerRadToDeg(urdfNode.rotation)),
          'XYZ'
        )
        rotationLineEndPosition = threePoint.rotate(
          urdfNode.axisFarFromBasePosition || { x: 0, y: 0, z: 0 },
          {
            x: 0,
            y: 0,
            z: 0,
          },
          rotationLineEndRotation
        )
        rotationLineEndPosition.x += currentNodeComputedJoint.position.x
        rotationLineEndPosition.y += currentNodeComputedJoint.position.y
        rotationLineEndPosition.z += currentNodeComputedJoint.position.z
        threeLine.update(
          currentNodeThreeObjects.rotationLine,
          currentNodeComputedJoint.position,
          rotationLineEndPosition
        )

        if (currentNodeThreeObjects.rotationLine3D !== undefined) {
          threeCylinder.update(
            currentNodeThreeObjects.rotationLine3D,
            currentNodeComputedJoint.position,
            rotationLineEndPosition
          )
        }
      }

      if (currentNodeThreeObjects.jointAngleTorus !== undefined) {
        if (rotationLineEndPosition) {
          currentNodeThreeObjects.jointAngleTorus.api.setPosition(
            rotationLineEndPosition.x,
            rotationLineEndPosition.y,
            rotationLineEndPosition.z
          )
        }
        currentNodeThreeObjects.jointAngleTorus.api.setRotation(
          compoundEulerRotation(
            rotationLineEndRotation || null,
            eulerRadToDeg(
              computeEulerFromTwoVectors(
                {
                  x: 0,
                  y: 0,
                  z: 0,
                },
                {
                  x: 0,
                  y: 0,
                  z: 1,
                },
                {
                  x: 0,
                  y: 0,
                  z: 0,
                },
                urdfNode.axisFarFromBasePosition || { x: 0, y: 0, z: 0 }
              )
            ),
            'XYZ'
          )
          // currentNodeComputedJoint.rotationDegree
        )
      }

      if (urdfNode.threeObjects?.highLightSphere !== undefined) {
        threeSphere.move(
          urdfNode.threeObjects.highLightSphere as THREE.Mesh,
          computedJoints[urdfNode.name].position
        )
      }
    }

    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        handleNode(node.children[i])
      }
    }
  }

  handleNode(urdfThreeObject)
}

function addControlsToURDFThreeObject(urdfThreeObject: URDFRobot, scene: THREE.Scene): void {
  const computedJoints: ComputedJointPositions = computeURDFJointPositions(urdfThreeObject)
  urdfThreeObject.updateMatrixWorld(true)

  const handleNode = (node: THREE.Object3D): void => {
    const urdfNode = node as URDFJoint
    if (urdfNode.type === 'URDFJoint' && urdfNode._jointType === 'revolute') {
      urdfNode.isThreeObjectNode = true
      urdfNode.threeObjects = {}

      const sphere: THREE.Mesh = threeSphere.create(0.008, '#f00')
      threeSphere.move(sphere, computedJoints[urdfNode.name].position)
      const sphereMaterial = sphere.material as THREE.MeshStandardMaterial
      sphereMaterial.depthTest = false
      sphereMaterial.depthWrite = false

      const axis: THREE.Group = threeRelativeAxis.create(
        computedJoints[urdfNode.name].position,
        compoundEulerRotation(
          computedJoints[urdfNode.name].rotationDegree,
          urdfToThreeRotation({
            x: radToDeg(urdfNode.rotation.x),
            y: radToDeg(urdfNode.rotation.y),
            z: radToDeg(urdfNode.rotation.z),
            order: urdfNode.rotation.order,
          }),
          'XYZ'
        ),
        0.04
      )
      scene.add(axis)
      hideRelativeAxis.value.push(axis)
      threeRelativeAxis.hide(axis)
      urdfNode.threeObjects.axis = axis

      const rotationLineEndPosition: Vector3Like = threePoint.rotate(
        (() => {
          const c: Vector3Like = urdfToThree(urdfNode.axis)
          const length = 0.06
          const options = [
            {
              x: c.x * length,
              y: c.y * length,
              z: c.z * length,
            },
            {
              x: c.x * length * -1,
              y: c.y * length,
              z: c.z * length,
            },
            {
              x: c.x * length,
              y: c.y * length * -1,
              z: c.z * length,
            },
            {
              x: c.x * length,
              y: c.y * length,
              z: c.z * length * -1,
            },
          ].sort((a, b) => {
            return (
              (distanceBetweenPoints(
                {
                  x: a.x + (urdfNode.threeGetPosition ? urdfNode.threeGetPosition().x : 0),
                  y: a.y + (urdfNode.threeGetPosition ? urdfNode.threeGetPosition().y : 0),
                  z: a.z + (urdfNode.threeGetPosition ? urdfNode.threeGetPosition().z : 0),
                },
                (urdfThreeObject.threeGetPosition
                  ? urdfThreeObject.threeGetPosition()
                  : { x: 0, y: 0, z: 0 }) as Vector3Like
              ) -
                distanceBetweenPoints(
                  {
                    x: b.x + (urdfNode.threeGetPosition ? urdfNode.threeGetPosition().x : 0),
                    y: b.y + (urdfNode.threeGetPosition ? urdfNode.threeGetPosition().y : 0),
                    z: b.z + (urdfNode.threeGetPosition ? urdfNode.threeGetPosition().z : 0),
                  },
                  (urdfThreeObject.threeGetPosition
                    ? urdfThreeObject.threeGetPosition()
                    : { x: 0, y: 0, z: 0 }) as Vector3Like
                )) *
              -1
            )
          })
          urdfNode.axisFarFromBasePosition = options[0]
          return {
            x: options[0].x,
            y: options[0].y,
            z: options[0].z,
          }
        })(),
        {
          x: 0,
          y: 0,
          z: 0,
        },
        compoundEulerRotation(
          computedJoints[urdfNode.name].rotationDegree,
          urdfToThreeRotation({
            x: radToDeg(urdfNode.rotation.x),
            y: radToDeg(urdfNode.rotation.y),
            z: radToDeg(urdfNode.rotation.z),
            order: urdfNode.rotation.order,
          }),
          'XYZ'
        )
      )
      rotationLineEndPosition.x += computedJoints[urdfNode.name].position.x
      rotationLineEndPosition.y += computedJoints[urdfNode.name].position.y
      rotationLineEndPosition.z += computedJoints[urdfNode.name].position.z
      const rotationLine: THREE.Line = threeLine.create(
        computedJoints[urdfNode.name].position,
        rotationLineEndPosition,
        '#ff0',
        1,
        false
      )
      scene.add(rotationLine)
      threeLine.changeOpacity(rotationLine, 0)
      urdfNode.threeObjects.rotationLine = rotationLine

      const rotationLine3D = threeCylinder.create(
        computedJoints[urdfNode.name].position,
        rotationLineEndPosition,
        0.003,
        '#939393'
      )
      scene.add(rotationLine3D)
      urdfNode.threeObjects.rotationLine3D = rotationLine3D

      const highLightSphere = threeSphere.create(0.015, '#f00')
      threeSphere.move(highLightSphere, computedJoints[urdfNode.name].position)
      // threeSphere.hide(highLightSphere)
      const highLightMaterial = highLightSphere.material as THREE.MeshStandardMaterial
      highLightMaterial.depthTest = false
      highLightMaterial.depthWrite = false
      // scene.add(highLightSphere);
      urdfNode.threeObjects.highLightSphere = highLightSphere

      const jointAngleTorus = createRotatableTorus(
        0.016,
        0.0035,
        computedJoints[urdfNode.name].position,
        e => {
          const jointName = urdfNode.name
          const delta = e
          const currentAngle = urdfNode._angle || 0
          const angleMin = urdfNode.limit?.lower || -Math.PI
          const angleMax = urdfNode.limit?.upper || Math.PI
          let newAngle = currentAngle + delta
          if (newAngle < angleMin) {
            newAngle = angleMin
          }
          if (newAngle > angleMax) {
            newAngle = angleMax
          }
          emit('onURDFAngleChange', {
            jointName,
            angle: newAngle,
          })
          urdfNode.setRotationFromAxisAngle(
            new THREE.Vector3(urdfNode.axis.x, urdfNode.axis.y, urdfNode.axis.z),
            newAngle
          )
          urdfNode._angle = newAngle

          updateURDFThreeObjectControls(urdfThreeObject)
        },
        cameraRef.value as THREE.Camera,
        cameraControlRef.value as any,
        containerRef.value,
        () => {
          enableDefaultHoverFeature.value = false
          handleNewChangeColorObjectsList([])
          emit('onURDFManipulateStart')
        },
        () => {
          enableDefaultHoverFeature.value = true
          handleNewChangeColorObjectsList([])
          emit('onURDFManipulateEnd')
        }
      )
      scene.add(jointAngleTorus.object3D)
      ;(jointAngleTorus.object3D as any).api = jointAngleTorus.api
      urdfNode.threeObjects.jointAngleTorus = jointAngleTorus
    }
    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        handleNode(node.children[i])
      }
    }
  }
  handleNode(urdfThreeObject)
}

function addThreeJSAdaptToURDFThreeObject(urdfThreeObject: URDFRobot): void {
  urdfThreeObject.threeGetPosition = (): Vector3Like => {
    return urdfToThree(urdfThreeObject.position)
  }

  urdfThreeObject.threeSetPosition = (e: Vector3Like): void => {
    const converted: Vector3Like = threeToURDF(e)
    urdfThreeObject.position.x = converted.x
    urdfThreeObject.position.y = converted.y
    urdfThreeObject.position.z = converted.z
  }

  urdfThreeObject.threeGetRotation = (): EulerLike => {
    return urdfToThreeRotation(urdfThreeObject.rotation)
  }

  urdfThreeObject.threeSetRotation = (e: EulerLike): void => {
    const converted: EulerLike = threeToURDFRotation(e)
    urdfThreeObject.rotation.x = converted.x
    urdfThreeObject.rotation.y = converted.y
    urdfThreeObject.rotation.z = converted.z
    urdfThreeObject.rotation.order = converted.order as THREE.EulerOrder
  }

  urdfThreeObject.threeSetQuaternion = (e: QuaternionLike): void => {
    const converted: QuaternionLike = threeToURDFQuaternion(e)
    urdfThreeObject.quaternion.x = converted.x
    urdfThreeObject.quaternion.y = converted.y
    urdfThreeObject.quaternion.z = converted.z
    urdfThreeObject.quaternion.w = converted.w
  }

  urdfThreeObject.threeGetQuaternion = (): QuaternionLike => {
    return urdfToThreeQuaternion(urdfThreeObject.quaternion)
  }

  urdfThreeObject.setPosition = (e: Vector3Like): void => {
    urdfThreeObject.position.x = e.x
    urdfThreeObject.position.y = e.y
    urdfThreeObject.position.z = e.z
  }

  urdfThreeObject.getPosition = (): Vector3Like => {
    return {
      x: urdfThreeObject.position.x,
      y: urdfThreeObject.position.y,
      z: urdfThreeObject.position.z,
    }
  }

  urdfThreeObject.setQuaternion = (e: QuaternionLike): void => {
    urdfThreeObject.quaternion.x = e.x
    urdfThreeObject.quaternion.y = e.y
    urdfThreeObject.quaternion.z = e.z
    urdfThreeObject.quaternion.w = e.w
  }

  urdfThreeObject.getQuaternion = (): QuaternionLike => {
    return {
      x: urdfThreeObject.quaternion.x,
      y: urdfThreeObject.quaternion.y,
      z: urdfThreeObject.quaternion.z,
      w: urdfThreeObject.quaternion.w,
    }
  }

  const handleNode = (node: THREE.Object3D): void => {
    const urdfNode = node as URDFJoint
    if (urdfNode.type === 'URDFJoint' && urdfNode._jointType === 'revolute') {
      urdfNode.threeGetPosition = (): Vector3Like => {
        return urdfToThree(urdfNode.position)
      }

      urdfNode.threeGetRotation = (): EulerLike => {
        return urdfToThreeRotation(urdfNode.rotation)
      }

      urdfNode.threeSetRotation = (e: EulerLike): void => {
        const converted: EulerLike = threeToURDFRotation(e)
        urdfNode.rotation.x = converted.x
        urdfNode.rotation.y = converted.y
        urdfNode.rotation.z = converted.z
        urdfNode.rotation.order = converted.order as THREE.EulerOrder
      }
    }

    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        handleNode(node.children[i])
      }
    }
  }
  handleNode(urdfThreeObject)
}

function computeURDFJointPositions(urdfRoot: URDFRobot): ComputedJointPositions {
  const jointPoses: ComputedJointPositions = {}

  const traverse = (
    node: THREE.Object3D,
    parentTransform: THREE.Matrix4,
    parentRotationQuat: THREE.Quaternion
  ): void => {
    const urdfNode = node as URDFJoint
    let localPosition: THREE.Vector3
    let localQuaternion: THREE.Quaternion

    if (urdfNode.origPosition && urdfNode.origQuaternion) {
      localPosition = urdfNode.origPosition.clone()
      localQuaternion = urdfNode.origQuaternion.clone()
    } else {
      localPosition = new THREE.Vector3(node.position.x, node.position.y, node.position.z)
      localQuaternion = new THREE.Quaternion()
      localQuaternion.setFromEuler(node.rotation)
    }

    const localTransform: THREE.Matrix4 = new THREE.Matrix4()
    const scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
    localTransform.compose(localPosition, localQuaternion, scale)

    const globalTransform: THREE.Matrix4 = new THREE.Matrix4()
    globalTransform.multiplyMatrices(parentTransform, localTransform)

    const globalQuaternion: THREE.Quaternion = new THREE.Quaternion()
    globalQuaternion.multiplyQuaternions(parentRotationQuat, localQuaternion)

    if (urdfNode.type === 'URDFJoint' && urdfNode._jointType === 'revolute') {
      const currentPosition: THREE.Vector3 = new THREE.Vector3(
        node.position.x,
        node.position.y,
        node.position.z
      )
      const currentLocalTransform: THREE.Matrix4 = new THREE.Matrix4()
      const currentQuaternion: THREE.Quaternion = new THREE.Quaternion()
      currentQuaternion.setFromEuler(node.rotation)
      currentLocalTransform.compose(currentPosition, currentQuaternion, scale)

      const currentGlobalTransform: THREE.Matrix4 = new THREE.Matrix4()
      currentGlobalTransform.multiplyMatrices(parentTransform, currentLocalTransform)

      const globalPosition: THREE.Vector3 = new THREE.Vector3()
      globalPosition.setFromMatrixPosition(currentGlobalTransform)

      const parentEuler: THREE.Euler = new THREE.Euler()
      parentEuler.setFromQuaternion(parentRotationQuat, 'XYZ')

      const rotationDegree: EulerLike = compoundEulerRotation(
        {
          x: radToDeg(parentEuler.x),
          y: radToDeg(parentEuler.y),
          z: radToDeg(parentEuler.z),
          order: parentEuler.order,
        },
        {
          x: 90,
          y: 0,
          z: 0,
          order: 'XYZ',
        },
        'XYZ'
      )

      jointPoses[urdfNode.name] = {
        position: {
          x: globalPosition.x,
          y: globalPosition.y,
          z: globalPosition.z,
        },
        rotation: {
          x: degToRad(rotationDegree.x),
          y: degToRad(rotationDegree.y),
          z: degToRad(rotationDegree.z),
          order: rotationDegree.order,
        },
        rotationDegree: rotationDegree,
        angle: urdfNode.angle,
      }
    }

    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        traverse(node.children[i], globalTransform, globalQuaternion)
      }
    }
  }

  const rootTransform: THREE.Matrix4 = new THREE.Matrix4()
  rootTransform.identity()

  const rootRotationQuat: THREE.Quaternion = new THREE.Quaternion()
  rootRotationQuat.identity()

  traverse(urdfRoot, rootTransform, rootRotationQuat)

  return jointPoses
}

function urdfToThree(position: Vector3Like | THREE.Vector3): Vector3Like {
  return {
    x: position.x,
    y: position.z,
    z: -1 * position.y,
  }
}

function threeToURDF(position: Vector3Like): Vector3Like {
  return {
    x: position.x,
    y: -1 * position.z,
    z: position.y,
  }
}

function urdfToThreeRotation(euler: EulerLike | THREE.Euler): EulerLike {
  const { x: roll, y: pitch, z: yaw, order } = euler

  return {
    x: roll,
    y: yaw,
    z: -pitch,
    order,
  }
}

function threeToURDFRotation(euler: EulerLike): EulerLike {
  const { x, y, z, order } = euler

  return {
    x: x,
    y: -z,
    z: y,
    order,
  }
}

function urdfToThreeQuaternion(
  quaternion: QuaternionLike | THREE.Quaternion | number[]
): QuaternionLike {
  let x: number, y: number, z: number, w: number

  if (Array.isArray(quaternion)) {
    x = quaternion[0]
    y = quaternion[1]
    z = quaternion[2]
    w = quaternion[3]
  } else {
    x = (quaternion as QuaternionLike).x
    y = (quaternion as QuaternionLike).y
    z = (quaternion as QuaternionLike).z
    w = (quaternion as QuaternionLike).w
  }

  const q: THREE.Quaternion = new THREE.Quaternion(x, y, z, w)

  const qConverted: THREE.Quaternion = new THREE.Quaternion()
  qConverted.setFromEuler(new THREE.Euler(Math.PI, 0, -Math.PI / 2, 'XYZ'))

  q.multiply(qConverted)

  return {
    x: q.x,
    y: q.y,
    z: q.z,
    w: q.w,
  }
}

function threeToURDFQuaternion(
  quaternion: QuaternionLike | THREE.Quaternion | number[]
): QuaternionLike {
  let x: number, y: number, z: number, w: number

  if (Array.isArray(quaternion)) {
    x = quaternion[0]
    y = quaternion[1]
    z = quaternion[2]
    w = quaternion[3]
  } else {
    x = (quaternion as QuaternionLike).x
    y = (quaternion as QuaternionLike).y
    z = (quaternion as QuaternionLike).z
    w = (quaternion as QuaternionLike).w
  }

  const q: THREE.Quaternion = new THREE.Quaternion(x, y, z, w)

  const qConverted: THREE.Quaternion = new THREE.Quaternion()
  qConverted.setFromEuler(new THREE.Euler(Math.PI, 0, Math.PI / 2, 'XYZ'))

  q.multiply(qConverted)

  return {
    x: q.x,
    y: q.y,
    z: q.z,
    w: q.w,
  }
}

function eulerRadToDeg(euler: EulerLike | THREE.Euler): EulerLike {
  const rad2deg: number = 180 / Math.PI
  return {
    x: euler.x * rad2deg,
    y: euler.y * rad2deg,
    z: euler.z * rad2deg,
    order: euler.order,
  }
}

function eulerDegToRad(euler: EulerLike): EulerLike {
  const deg2rad: number = Math.PI / 180
  return {
    x: euler.x * deg2rad,
    y: euler.y * deg2rad,
    z: euler.z * deg2rad,
    order: euler.order,
  }
}

interface BVHOffset {
  x: number
  y: number
  z: number
}

interface BVHChannel {
  index: number
  name: string
  friendlyName: string
  channel: string
}

interface BVHNode {
  name: string
  friendlyName: string
  isRoot: boolean
  isEnd: boolean
  deep: number
  children: BVHNode[]
  channels: string[] | null
  offset: BVHOffset | null
  parent: BVHNode | null
}

interface BVHData {
  hierarchy: BVHNode | null
  joints: Record<string, Record<string, number>>
  channels: BVHChannel[]
  frameNum: number
  frameTime: number
  frameRate: number
  frames: number[][]
  rootToHeightMin: number
  rootToHeightMax: number
  defaultHeight: number
  standardHeight: number | null
  standardScale: number | null
  standardRootPositionOffset: BVHOffset
}

interface BVHThreeNode {
  rotationOrder: string
  toOutSize: boolean
  name: string
  friendlyName: string
  offset: BVHOffset
  channels: string[] | null
  rotation: EulerLike
  position: Vector3Like
  relativePosition: Vector3Like
  children: BVHThreeNode[]
  threeObjects: {
    sphere: THREE.Mesh
    axis: THREE.Group
    cylinder?: THREE.Mesh
    lineToParent?: THREE.Line
    highLightSphere?: THREE.Mesh
    highLightSpherePink?: THREE.Mesh
  }
  threeObjectType?: string
  node?: BVHThreeNode
  isRoot?: boolean
  setRootPosition?: (position: Partial<Vector3Like>) => void
  reCompute?: () => void
  setRotation?: (euler: Partial<EulerLike>, disabledReCompute?: boolean) => void
  quaternion?: QuaternionLike
  globalRotation?: EulerLike
  parent?: BVHThreeNode | null
}

interface BVHInfo {
  yMin: number
  yMax: number
  rootToHeightMin: number
  rootToHeightMax: number
}

interface BVHParsedLine {
  type: string
  [key: string]: any
}

function parseBVH(bvhContent: string = '', standardHeight: number | null = null): BVHData {
  function getFriendlyName(name: string): string {
    if (name.indexOf('mixamorig:') === 0) {
      return name.split('mixamorig:')[1]
    }
    return name
  }
  // console.log(bvhContent)
  if (bvhContent.split('{').length !== bvhContent.split('}').length) {
    throw new Error('前后尖括号数量不相等，文件损坏')
  }
  let bvhLines: (string | BVHParsedLine)[] = bvhContent.split('\n')
  let mode: number = 0 //0 none; 1 HIERARCHY; 2 MOTION
  let collectedFrameNum: number = 0
  for (let i = 0; i < bvhLines.length; i++) {
    if (typeof bvhLines[i] === 'string') {
      bvhLines[i] = (bvhLines[i] as string).replaceAll('\t', '')
      bvhLines[i] = (bvhLines[i] as string).replaceAll('\r', '')
    }
    const current = (bvhLines[i] as string).split(' ')
    // 切换Mode
    if (current[0] === 'HIERARCHY') {
      mode = 1
      bvhLines[i] = {
        type: 'ChangeDataType',
        dataType: 'Hierarchy',
      }
      continue
    }
    if (current[0] === 'MOTION') {
      mode = 2
      bvhLines[i] = {
        type: 'ChangeDataType',
        dataType: 'Motion',
      }
      continue
    }
    // 层级
    if (mode === 1) {
      if (current[0] === '{') {
        bvhLines[i] = {
          type: 'EnterArea',
        }
      }
      if (current[0] === '}') {
        bvhLines[i] = {
          type: 'LeaveArea',
        }
      }
      if (current[0] === 'ROOT') {
        bvhLines[i] = {
          type: 'Node',
          category: 'Root',
          name: current[1],
          friendlyName: getFriendlyName(current[1]),
        }
      }
      if (current[0] === 'OFFSET') {
        bvhLines[i] = {
          type: 'Offset',
          x: Number(current[1]),
          y: Number(current[2]),
          z: Number(current[3]),
        }
      }
      if (current[0] === 'CHANNELS') {
        bvhLines[i] = {
          type: 'Channels',
          num: parseInt(current[1]),
          names: current.slice(2),
        }
      }
      if (current[0] === 'JOINT') {
        bvhLines[i] = {
          type: 'Node',
          category: 'Joint',
          name: current[1],
          friendlyName: getFriendlyName(current[1]),
        }
      }
      if (current[0] === 'End' && current[1] === 'Site') {
        bvhLines[i] = {
          type: 'Node',
          category: 'EndSite',
        }
      }
    }
    // 动作
    if (mode === 2) {
      if (current[0] === 'Frames:') {
        bvhLines[i] = {
          type: 'FrameNum',
          value: Number(current[1]),
        }
      } else if (current[0] === 'Frame' && current[1] === 'Time:') {
        bvhLines[i] = {
          type: 'FrameTime',
          value: Number(current[2]),
        }
      } else if (current[0] !== '') {
        bvhLines[i] = {
          type: 'FrameData',
          values: (() => {
            const data: number[] = JSON.parse(JSON.stringify(current))
            for (let i1 = 0; i1 < data.length; i1++) {
              data[i1] = Number(data[i1])
            }
            return data
          })(),
          // index: collectedFrameNum
        }
        collectedFrameNum++
      }
    }
  }
  const bvhParsedData: BVHParsedLine[] = bvhLines.filter(item => item !== '') as BVHParsedLine[]

  const data: BVHData = {
    hierarchy: null,

    joints: {},
    channels: [],

    frameNum: 0,
    frameTime: 0,
    frameRate: 0,
    frames: [],

    rootToHeightMin: 0,
    rootToHeightMax: 0,

    defaultHeight: 0,
    standardHeight: standardHeight || null,
    standardScale: null,
    standardRootPositionOffset: {
      x: 0,
      y: 0,
      z: 0,
    },
  }

  data.hierarchy = (() => {
    function createNode(
      name: string,
      friendlyName: string,
      isRoot: boolean,
      isEnd: boolean,
      deep: number,
      parent: BVHNode | null = null
    ): BVHNode {
      return {
        name,
        friendlyName,
        isRoot,
        isEnd,
        deep,
        children: [],
        channels: null,
        offset: null,
        parent,
      }
    }
    function updateNode(item: BVHNode, channels: string[] | null, offset: BVHOffset | null): void {
      item.channels = channels || item.channels
      item.offset = offset || item.offset
      if (Array.isArray(item.channels)) {
        item.channels = item.channels.filter(item => item !== '')

        const currentNode = item
        if (currentNode.channels) {
          for (let i = 0; i < currentNode.channels.length; i++) {
            const currentIndex = data.channels.length
            data.channels.push({
              index: currentIndex,
              name: currentNode.name,
              friendlyName: currentNode.friendlyName,
              channel: currentNode.channels[i],
            })
            if (!data.joints[currentNode.name]) {
              data.joints[currentNode.name] = {}
            }
            data.joints[currentNode.name][currentNode.channels[i]] = currentIndex
          }
        }
      }
    }
    // 寻找根节点
    const result: { root: BVHNode[] } = {
      root: [],
    }
    const q: BVHNode[] = []
    for (let i0 = 0; i0 < bvhParsedData.length; i0++) {
      if (
        bvhParsedData[i0].type === 'ChangeDataType' &&
        bvhParsedData[i0].dataType === 'Hierarchy'
      ) {
        const hierarchyDataStartIndex = i0 + 1
        for (let i1 = hierarchyDataStartIndex; i1 < bvhParsedData.length; i1++) {
          if (bvhParsedData[i1].type === 'Node' && bvhParsedData[i1].category === 'Root') {
            const hierarchyRootDataIndex = i1
            const hierarchyRootData = bvhParsedData[hierarchyRootDataIndex]
            const rootNode = createNode(
              hierarchyRootData.name,
              hierarchyRootData.friendlyName,
              true,
              false,
              0
            )
            result.root.push(rootNode)
            let currentNode = rootNode
            let currentIndex = hierarchyRootDataIndex + 1
            while (1) {
              const currentData = bvhParsedData[currentIndex]
              if (currentData.type === 'EnterArea') {
                q.push(currentNode)
              }
              if (currentData.type === 'Offset') {
                updateNode(currentNode, null, {
                  x: currentData.x,
                  y: currentData.y,
                  z: currentData.z,
                })
              }
              if (currentData.type === 'Channels') {
                updateNode(currentNode, JSON.parse(JSON.stringify(currentData.names)), null)
              }
              if (currentData.type === 'Node' && currentData.category === 'Joint') {
                const newNode = createNode(
                  currentData.name,
                  currentData.friendlyName,
                  false,
                  false,
                  q.length,
                  currentNode
                )
                currentNode.children.push(newNode)
                currentNode = newNode
              }
              if (currentData.type === 'Node' && currentData.category === 'EndSite') {
                const newNode = createNode('EndSite', 'EndSite', false, true, q.length, currentNode)
                currentNode.children.push(newNode)
                currentNode = newNode
              }
              if (currentData.type === 'LeaveArea') {
                q.pop()
                currentNode = q[q.length - 1]
              }

              currentIndex++
              if (q.length === 0) break
            }
            break
          }
        }
        break
      }
    }
    return result.root[0]
  })()

  data.frameNum = (() => {
    for (let i = 0; i < bvhParsedData.length; i++) {
      if (bvhParsedData[i].type === 'FrameNum') {
        if (isNaN(bvhParsedData[i].value)) {
          throw new Error('Frames不是一个数')
        }
        return bvhParsedData[i].value
      }
    }
    return 0
  })()

  data.frameTime = (() => {
    for (let i = 0; i < bvhParsedData.length; i++) {
      if (bvhParsedData[i].type === 'FrameTime') {
        if (isNaN(bvhParsedData[i].value)) {
          throw new Error('FrameTime不是一个数')
        }
        return bvhParsedData[i].value
      }
    }
    return 0
  })()

  data.frameRate = 1 / data.frameTime

  data.frames = (() => {
    const re: number[][] = []
    for (let i = 0; i < bvhParsedData.length; i++) {
      if (bvhParsedData[i].type === 'FrameData') {
        // if (bvhContent[i].values.length !== data.channels.length) {
        //   console.log(bvhContent[i], data.channels)
        //   throw new Error(`第${bvhContent[i].index + 1}帧动作数据的通道数量和HIERARCHY里定义的通道数量不相等`)
        // }
        // for (let i1 = 0; i1 < data.channels.length; i1++) {
        //   if (data.channels[i1].channel.indexOf('Zrotation') !== -1) {
        //     console.log(bvhContent[i].values[i1])
        //     bvhParsedData[i].values[i1] *= -1
        //   }
        // }
        re.push(bvhParsedData[i].values)
      }
    }
    return re
  })()

  if (standardHeight !== null) {
    const threeObject: { o: BVHThreeNode } = {
      o: generateBVHThreeObject(data),
    }
    const info: {
      maxHeight: number
      yMin: number
      yMax: number
      maxRootToHeightMin: number
      maxRootToHeightMax: number
    } = {
      maxHeight: -1,
      yMin: 9999999999,
      yMax: -9999999999,
      maxRootToHeightMin: -9999999999,
      maxRootToHeightMax: -9999999999,
    }
    for (let i = 0; i < data.frames.length; i++) {
      applyFrameToBVHThreeObject(threeObject.o, data.frames[i])
      const currentInfo: BVHInfo = getBVHThreeObjectInfo(threeObject.o)
      if (currentInfo.yMax - currentInfo.yMin > info.maxHeight) {
        info.maxHeight = currentInfo.yMax - currentInfo.yMin
      }
      if (currentInfo.yMin < info.yMin) {
        info.yMin = currentInfo.yMin
      }
      if (currentInfo.yMax > info.yMax) {
        info.yMax = currentInfo.yMax
      }
      if (currentInfo.rootToHeightMin > info.maxRootToHeightMin) {
        info.maxRootToHeightMin = currentInfo.rootToHeightMin
      }
      if (currentInfo.rootToHeightMax > info.maxRootToHeightMax) {
        info.maxRootToHeightMax = currentInfo.rootToHeightMax
      }
    }
    // 清理临时对象
    threeObject.o = null as any

    const currentHeight = info.maxHeight
    const scale = standardHeight / currentHeight

    data.standardScale = scale
    data.rootToHeightMin = info.maxRootToHeightMin
    data.rootToHeightMax = info.maxRootToHeightMax
    data.defaultHeight = currentHeight

    const modifyOffset = (currentNode: BVHNode): void => {
      if (typeof currentNode.offset === 'object' && currentNode.offset !== null) {
        currentNode.offset.x *= scale
        currentNode.offset.y *= scale
        currentNode.offset.z *= scale
      }
      if (Array.isArray(currentNode.children)) {
        for (let i = 0; i < currentNode.children.length; i++) {
          modifyOffset(currentNode.children[i])
        }
      }
    }
    if (data.hierarchy) {
      modifyOffset(data.hierarchy)
    }

    for (let i = 0; i < data.channels.length; i++) {
      if (data.channels[i].channel.slice(1) === 'position') {
        for (let i1 = 0; i1 < data.frames.length; i1++) {
          data.frames[i1][data.channels[i].index] *= scale
        }
      }
    }

    data.rootToHeightMin *= scale
    data.rootToHeightMax *= scale

    if (data.hierarchy) {
      data.standardRootPositionOffset.x =
        data.frames[0][data.joints[data.hierarchy.name]['Xposition']] * -1 +
        0.5 * (standardHeight / 0.6)
      data.standardRootPositionOffset.z =
        data.frames[0][data.joints[data.hierarchy.name]['Zposition']] * -1 +
        0.5 * (standardHeight / 0.6)
      data.standardRootPositionOffset.y =
        data.rootToHeightMin - data.frames[0][data.joints[data.hierarchy.name]['Yposition']]
      for (let i = 0; i < data.frames.length; i++) {
        data.frames[i][data.joints[data.hierarchy.name]['Xposition']] +=
          data.standardRootPositionOffset.x
        data.frames[i][data.joints[data.hierarchy.name]['Zposition']] +=
          data.standardRootPositionOffset.z
        data.frames[i][data.joints[data.hierarchy.name]['Yposition']] +=
          data.standardRootPositionOffset.y
      }
    }
  }

  return data
}

interface URDFJoint extends THREE.Object3D {
  type: string
  _jointType: string
  name: string
  axis: Vector3Like
  angle: number
  rotation: THREE.Euler
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  origPosition?: THREE.Vector3
  origQuaternion?: THREE.Quaternion
  isThreeObjectNode?: boolean
  threeObjects?: {
    sphere?: THREE.Mesh
    axis?: THREE.Group
    rotationLine?: THREE.Line
    rotationLine3D?: THREE.Mesh
    jointAngleTorus?: { object3D: THREE.Mesh; api: any }
    highLightSphere?: THREE.Mesh
  }
  axisFarFromBasePosition?: Vector3Like
  _angle?: number
  limit?: {
    lower: number
    upper: number
  }
  threeGetPosition?: () => Vector3Like
  threeGetRotation?: () => EulerLike
  threeSetRotation?: (e: EulerLike) => void
  children: THREE.Object3D[]
}

interface URDFRobot extends THREE.Object3D {
  position: THREE.Vector3
  rotation: THREE.Euler
  quaternion: THREE.Quaternion
  children: THREE.Object3D[]
  threeGetPosition?: () => Vector3Like
  threeSetPosition?: (e: Vector3Like) => void
  threeGetRotation?: () => EulerLike
  threeSetRotation?: (e: EulerLike) => void
  threeSetQuaternion?: (e: QuaternionLike) => void
  threeGetQuaternion?: () => QuaternionLike
  setPosition?: (e: Vector3Like) => void
  getPosition?: () => Vector3Like
  setQuaternion?: (e: QuaternionLike) => void
  getQuaternion?: () => QuaternionLike
}

interface URDFJointPose {
  position: Vector3Like
  rotation: EulerLike
  rotationDegree: EulerLike
  angle: number
}

interface ComputedJointPositions {
  [jointName: string]: URDFJointPose
}

function getBVHJointInfo(
  bvhThreeObject: BVHThreeNode,
  jointName: string
): { globalRotation?: EulerLike; rotation?: EulerLike; node?: BVHThreeNode } {
  let re: { globalRotation?: EulerLike; rotation?: EulerLike; node?: BVHThreeNode } = {}
  const handle = (currentNode: BVHThreeNode): void => {
    if (currentNode.name === jointName) {
      re = {
        globalRotation: currentNode.globalRotation,
        rotation: currentNode.rotation,
        node: currentNode,
      }
      return
    }
    for (const child of currentNode.children) {
      handle(child)
    }
  }
  handle(bvhThreeObject)
  return re
}

function computeBVHJointPositions(bvhThreeObject: BVHThreeNode): ComputedJointPositions {
  const re: ComputedJointPositions = {}
  const handleNode = (node: BVHThreeNode): void => {
    const spherePosition = node.threeObjects.sphere.position
    const rotation = node.rotation // 注意：BVH 的 rotation 是度数格式

    re[node.name] = {
      position: {
        x: spherePosition.x,
        y: spherePosition.y,
        z: spherePosition.z,
      },
      rotation: {
        x: degToRad(rotation.x),
        y: degToRad(rotation.y),
        z: degToRad(rotation.z),
        order: rotation.order || 'XYZ',
      },
      rotationDegree: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        order: rotation.order || 'XYZ',
      },
      angle: (node as any)._angle || 0,
    }

    for (const child of node.children) {
      handleNode(child)
    }
  }
  handleNode(bvhThreeObject)
  return re
}

function addBVHThreeObjectToScene(bvhThreeObject: BVHThreeNode, scene: THREE.Scene): void {
  const handleNode = (node: BVHThreeNode): void => {
    for (const objectName in node.threeObjects) {
      if (objectName === 'highLightSphere') continue
      const threeObject = (node.threeObjects as any)[objectName]
      if (threeObject) {
        threeObject.castShadow = true
        threeObject.receiveShadow = true
        scene.add(threeObject)
      }
    }
    for (let i = 0; i < node.children.length; i++) {
      handleNode(node.children[i])
    }
  }
  handleNode(bvhThreeObject)
}

function getBVHThreeObjectInfo(bvhThreeObject: BVHThreeNode): BVHInfo {
  const re: BVHInfo = {
    yMin: 9999999999,
    yMax: -9999999999,
    rootToHeightMin: 0,
    rootToHeightMax: 0,
  }
  const handleNode = (node: BVHThreeNode): void => {
    const position = node.threeObjects.sphere.position
    if (position.y < re.yMin) {
      re.yMin = position.y
    }
    if (position.y > re.yMax) {
      re.yMax = position.y
    }
    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        handleNode(node.children[i])
      }
    }
  }
  handleNode(bvhThreeObject)
  re.rootToHeightMin = Math.abs(re.yMin - bvhThreeObject.threeObjects.sphere.position.y)
  re.rootToHeightMax = Math.abs(re.yMax - bvhThreeObject.threeObjects.sphere.position.y)
  return re
}

function applyMotionFrameObjectToBVHThreeObject(
  bvhThreeObject: BVHThreeNode,
  frameData: Record<string, number>
): void {
  let currentIndex: number = 0
  const handleNode = (node: BVHThreeNode, deep: number): void => {
    const positions: { x: number; y: number; z: number; have: boolean } = {
      x: 0,
      y: 0,
      z: 0,
      have: false,
    }
    const rotationOrder: string[] = []
    let rotations: { x: number; y: number; z: number; have: boolean; order?: string } = {
      x: 0,
      y: 0,
      z: 0,
      have: false,
    }

    if (node.isRoot) {
      positions.x = frameData['global_x']
      positions.y = frameData['global_y']
      positions.z = frameData['global_z']
      positions.have = true
    }

    if (frameData[`${node.name}_x`] !== undefined) {
      rotations.x = frameData[`${node.name}_x`]
      rotations.y = frameData[`${node.name}_y`]
      rotations.z = frameData[`${node.name}_z`]
      rotations.have = true
      for (const channelItem of node.channels as string[]) {
        if (channelItem.includes('rotation')) {
          rotationOrder.push(channelItem.slice(0, 1).toLowerCase())
        }
      }
    }

    if (node.isRoot && positions.have && node.setRootPosition) {
      node.setRootPosition(positions)
    }
    rotations.order = rotationOrder.join('').toUpperCase()
    // console.log(rotations.order, 1234, node.name)
    if (rotations.have && node.setRotation) {
      node.setRotation(rotations as EulerLike, true)
      if (node.isRoot) {
        const q = eulerToQuaternion({
          x: degToRad(rotations.x),
          y: degToRad(rotations.y),
          z: degToRad(rotations.z),
          order: rotations.order,
        })
        if (node as any) {
          ;(node as any).quaternion.x = q.x
          ;(node as any).quaternion.y = q.y
          ;(node as any).quaternion.z = q.z
          ;(node as any).quaternion.w = q.w
        }
      }
    }
    for (const i in node.children) {
      handleNode(node.children[i], deep + 1)
    }
  }
  handleNode(bvhThreeObject, 0)
  if (bvhThreeObject.reCompute) {
    bvhThreeObject.reCompute()
  }
}

function applyFrameToBVHThreeObject(bvhThreeObject: BVHThreeNode, frameData: number[]): void {
  let currentIndex: number = 0
  const handleNode = (node: BVHThreeNode, deep: number): void => {
    const positions: { x: number; y: number; z: number; have: boolean } = {
      x: 0,
      y: 0,
      z: 0,
      have: false,
    }
    const rotationOrder: string[] = []
    let rotations: { x: number; y: number; z: number; have: boolean; order?: string } = {
      x: 0,
      y: 0,
      z: 0,
      have: false,
    }
    if (Array.isArray(node.channels)) {
      for (const i in node.channels) {
        const channelKey = node.channels[i].slice(0, 1).toLowerCase() as 'x' | 'y' | 'z'
        if (node.channels[i].indexOf('position') !== -1) {
          positions[channelKey] = frameData[currentIndex]
          positions.have = true
        }
        if (node.channels[i].indexOf('rotation') !== -1) {
          // if(frameData[currentIndex]>360)console.log('get rotation', node.channels[i], frameData[currentIndex])
          rotations[channelKey] = frameData[currentIndex]
          rotationOrder.push(channelKey)
          rotations.have = true
        }
        currentIndex++
      }
    }
    if (node.isRoot && positions.have && node.setRootPosition) {
      // console.log(positions);
      node.setRootPosition(positions)
    }
    rotations.order = node.rotationOrder || 'XYZ'
    if (rotations.have && node.setRotation) {
      node.setRotation(rotations as EulerLike, true)
    }
    for (const i in node.children) {
      handleNode(node.children[i], deep + 1)
    }
  }
  handleNode(bvhThreeObject, 0)
  if (bvhThreeObject.reCompute) {
    bvhThreeObject.reCompute()
  }
}

function traversalBVHThreeObject(
  bvhThreeObject: BVHThreeNode,
  callback: (node: BVHThreeNode) => void
): void {
  const handleNode = (node: BVHThreeNode): void => {
    if (!node) return
    callback(node)
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) {
          handleNode(child)
        }
      }
    }
  }
  if (bvhThreeObject) {
    handleNode(bvhThreeObject)
  }
}

function traversalURDFThreeObject(
  urdfThreeObject: URDFRobot,
  callback: (node: URDFJoint) => void
): void {
  const handleNode = (node: URDFJoint): void => {
    if (!node) return
    callback(node)
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child) {
          handleNode(child as URDFJoint)
        }
      }
    }
  }
  if (urdfThreeObject) {
    handleNode(urdfThreeObject as URDFJoint)
  }
}

function generateBVHThreeObject(
  bvhObject: BVHData,
  addToTransparent: boolean = false
): BVHThreeNode {
  if (!bvhObject.hierarchy) {
    throw new Error('BVH hierarchy not found')
  }
  let currentNode: BVHNode = bvhObject.hierarchy
  const root: Partial<BVHThreeNode> = {}
  const getParentRelativeAxisEuler = (
    node: Partial<BVHThreeNode>,
    currentNode: Partial<BVHThreeNode> | null = null,
    parentAxisEuler: EulerLike = { x: 0, y: 0, z: 0, order: 'XYZ' }
  ): EulerLike | undefined => {
    if (!currentNode) {
      currentNode = root
    }
    if (node === currentNode) {
      return parentAxisEuler
    }
    if (!node.rotation || !currentNode.children) {
      return undefined
    }
    const currentRotation = compoundEulerRotation(
      parentAxisEuler,
      node.rotation,
      node.rotation.order
    )
    for (let i = 0; i < currentNode.children.length; i++) {
      const re = getParentRelativeAxisEuler(node, currentNode.children[i], currentRotation)
      if (re) return re
    }
    return undefined
  }
  const getParentPosition = (
    node: Partial<BVHThreeNode>,
    currentNode: Partial<BVHThreeNode> | null = null,
    parentNode: Partial<BVHThreeNode> | null = null
  ): Vector3Like => {
    if (!currentNode) {
      currentNode = root
    }
    if (node === currentNode) {
      return parentNode && parentNode.threeObjects
        ? parentNode.threeObjects.sphere.position
        : { x: 0, y: 0, z: 0 }
    }
    if (currentNode.children) {
      for (let i = 0; i < currentNode.children.length; i++) {
        const result = getParentPosition(node, currentNode.children[i], currentNode)
        if (result) return result
      }
    }
    return { x: 0, y: 0, z: 0 }
  }
  const handleNode = (
    node: BVHNode,
    reNode: Partial<BVHThreeNode>,
    parentReNode: Partial<BVHThreeNode> | null,
    parentPosition: Vector3Like,
    isRoot: boolean = false,
    deep: number = 0
  ): void => {
    if (!node.offset) {
      throw new Error('Node offset is required')
    }
    const offset: BVHOffset = node.offset
    const nodeSphere: THREE.Mesh = threeSphere.create(0.008 * Math.pow(0.9, deep), '#fff')
    ;(nodeSphere as any)._hoverableThreeObject = true
    setTransparentObjects.value.push(nodeSphere)
    nodeSphere.position.x = parentPosition.x + offset.x
    nodeSphere.position.y = parentPosition.y + offset.y
    nodeSphere.position.z = parentPosition.z + offset.z
    reNode.name = node.name
    reNode.friendlyName = node.friendlyName
    reNode.offset = node.offset
    reNode.channels = node.channels
    reNode.rotationOrder = (() => {
      const re = []
      for (const channelItem of (node.channels || []).filter(
        item => item.indexOf('rotation') !== -1
      )) {
        re.push(channelItem.slice(0, 1))
      }
      return re.join('').toUpperCase()
    })()
    reNode.rotation = {
      x: 0,
      y: 0,
      z: 0,
      order: 'XYZ',
    }
    reNode.position = {
      x: nodeSphere.position.x,
      y: nodeSphere.position.y,
      z: nodeSphere.position.z,
    }
    reNode.relativePosition = {
      x: nodeSphere.position.x - parentPosition.x,
      y: nodeSphere.position.y - parentPosition.y,
      z: nodeSphere.position.z - parentPosition.z,
    }
    reNode.children = []
    reNode.parent = parentReNode as BVHThreeNode | null
    if (isRoot) {
      reNode.isRoot = true
      reNode.setRootPosition = (
        position: Partial<Vector3Like> = {
          x: undefined,
          y: undefined,
          z: undefined,
        }
      ): void => {
        const updateNode = (node: Partial<BVHThreeNode>, parentPosition: Vector3Like): void => {
          if (!node.threeObjects) return

          const actualPosition: Vector3Like = {
            x: position.x !== undefined ? position.x : node.threeObjects.sphere?.position.x || 0,
            y: position.y !== undefined ? position.y : node.threeObjects.sphere?.position.y || 0,
            z: position.z !== undefined ? position.z : node.threeObjects.sphere?.position.z || 0,
          }

          if (node.threeObjects.sphere !== undefined) {
            threeSphere.move(node.threeObjects.sphere, actualPosition)
          }
          if (node.threeObjects.lineToParent !== undefined) {
            threeLine.move(node.threeObjects.lineToParent, actualPosition)
          }
          if (node.threeObjects.axis !== undefined) {
            threeRelativeAxis.move(node.threeObjects.axis, actualPosition)
          }
          if (node.threeObjects.sphere !== undefined) {
            node.position = {
              x: actualPosition.x,
              y: actualPosition.y,
              z: actualPosition.z,
            }
            node.relativePosition = {
              x: actualPosition.x - parentPosition.x,
              y: actualPosition.y - parentPosition.y,
              z: actualPosition.z - parentPosition.z,
            }
          }
          if (node.threeObjects?.highLightSphere !== undefined) {
            threeSphere.move(node.threeObjects.highLightSphere, actualPosition)
          }
          // if (Array.isArray(node.children)) {
          //   for (let i = 0; i < node.children.length; i++) {
          //     updateNode(node.children[i], node.threeObjects.sphere.position)
          //   }
          // }
        }
        updateNode(reNode as BVHThreeNode, { x: 0, y: 0, z: 0 })
      }
      reNode.reCompute = (): void => {
        if (!reNode.rotation || !reNode.children || !reNode.threeObjects) {
          return
        }
        let parentRelativeAxisEuler: EulerLike | undefined = getParentRelativeAxisEuler(reNode)
        let parentPosition: Vector3Like = getParentPosition(reNode)
        if (!parentRelativeAxisEuler) {
          parentRelativeAxisEuler = { x: 0, y: 0, z: 0, order: 'XYZ' }
        }
        reNode.globalRotation = compoundEulerRotation(
          parentRelativeAxisEuler,
          reNode.rotation,
          reNode.rotation.order
        )
        if (reNode.threeObjects.axis !== undefined) {
          threeRelativeAxis.setRotation(reNode.threeObjects.axis, reNode.globalRotation)
          // threeRelativeAxis.rotate(
          //   reNode.threeObjects.axis,
          //   reNode.threeObjects.sphere.position,
          //   reNode.rotation,
          //   // parentRelativeAxisEuler
          // )
        }
        // return
        // console.log(22, parentRelativeAxisEuler.x);
        const parentRelativeAxisEulerRotated: EulerLike = compoundEulerRotation(
          parentRelativeAxisEuler,
          reNode.rotation,
          reNode.rotation.order
        )
        const updateNode = (
          node: Partial<BVHThreeNode>,
          parentPosition: Vector3Like,
          parentAxis: EulerLike
        ): void => {
          if (!node.offset || !node.rotation || !node.threeObjects || !node.children) {
            return
          }
          // if (node.name === 'mixamorig:Spine') console.log(123, node.offset)
          const newOffset: Vector3Like = threePoint.rotate(
            node.offset,
            { x: 0, y: 0, z: 0 },
            parentAxis
          )
          newOffset.x += parentPosition.x
          newOffset.y += parentPosition.y
          newOffset.z += parentPosition.z
          // if (node.name === 'mixamorig:Spine') console.log(123, newOffset)
          // const newOffset = node.offset
          // 根据rotation在父坐标系中更新位置
          // const newPosition = threePoint.rotate(
          //   newOffset,
          //   { x: 0, y: 0, z: 0 },
          //   node.rotation,
          //   parentAxis
          // );
          // if (node.name === 'mixamorig:Spine') console.log(456, newPosition)
          // const newPosition = newOffset
          // newPosition.x += parentPosition.x;
          // newPosition.y += parentPosition.y;
          // newPosition.z += parentPosition.z;
          // if (node.name === "mixamorig:Spine") {
          //   console.log(1, parentAxis);
          //   console.log(2, node.rotation);
          // }
          const newAxis: EulerLike = compoundEulerRotation(
            parentAxis,
            node.rotation,
            node.rotation.order
          )

          node.globalRotation = newAxis
          // if (node.name === "mixamorig:Spine") console.log(3, newAxis);
          // const newAxis = parentAxis

          if (node.threeObjects.axis !== undefined) {
            threeRelativeAxis.move(node.threeObjects.axis, newOffset)
            threeRelativeAxis.setRotation(node.threeObjects.axis, newAxis)
          }

          if (node.threeObjects.sphere !== undefined) {
            threeSphere.move(node.threeObjects.sphere, newOffset)
          }

          if (node.threeObjects?.highLightSphere !== undefined) {
            threeSphere.move(node.threeObjects.highLightSphere, newOffset)
          }

          if (node.threeObjects?.highLightSpherePink !== undefined) {
            threeSphere.move(node.threeObjects.highLightSpherePink, newOffset)
          }

          // if (node.threeObjects?.highLightSphereYellow !== undefined) {
          //   threeSphere.move(node.threeObjects.highLightSphereYellow, (()=>{
          //     const re = JSON.parse(JSON.stringify(newOffset))
          //     re.y -= 0.004
          //     return re
          //   })());
          // }

          if (node.threeObjects.lineToParent !== undefined) {
            threeLine.update(node.threeObjects.lineToParent, newOffset, parentPosition)
          }

          if (node.threeObjects.cylinder !== undefined) {
            threeCylinder.update(node.threeObjects.cylinder, newOffset, parentPosition, false)
          }

          node.position = {
            x: newOffset.x,
            y: newOffset.y,
            z: newOffset.z,
          }

          node.relativePosition = {
            x: newOffset.x - parentPosition.x,
            y: newOffset.y - parentPosition.y,
            z: newOffset.z - parentPosition.z,
          }

          for (let i = 0; i < node.children.length; i++) {
            updateNode(node.children[i], newOffset, newAxis)
          }
        }
        for (let i = 0; i < reNode.children.length; i++) {
          updateNode(
            reNode.children[i],
            reNode.threeObjects.sphere.position,
            parentRelativeAxisEulerRotated
          )
        }
      }
    }
    reNode.setRotation = (euler: Partial<EulerLike>, disabledReCompute: boolean = false): void => {
      if (!reNode.rotation) {
        reNode.rotation = { x: 0, y: 0, z: 0, order: 'XYZ' }
      }
      reNode.rotation = {
        x: euler.x !== undefined ? euler.x : reNode.rotation.x,
        y: euler.y !== undefined ? euler.y : reNode.rotation.y,
        z: euler.z !== undefined ? euler.z : reNode.rotation.z,
        order: euler.order || 'XYZ',
      }
      if (!disabledReCompute && reNode.reCompute) {
        reNode.reCompute()
      }
    }
    ;(nodeSphere as any).node = reNode
    ;(nodeSphere as any).isBVHThreeObject = true
    ;(nodeSphere as any).threeObjectType = 'sphere'

    const cylinderMesh: THREE.Mesh | undefined = isRoot
      ? undefined
      : (() => {
          const re: THREE.Mesh = threeCylinder.create(
            reNode.position as Vector3Like,
            parentPosition,
            0.006 * Math.pow(0.86, deep),
            '#D6D6D6',
            0.02 * Math.pow(0.9, deep)
          )
          ;(re as any).fromNode = reNode
          ;(re as any).toNode = parentReNode
          ;(re as any).isBVHThreeObject = true
          ;(re as any).threeObjectType = 'cylinder'
          return re
        })()
    // if (cylinderMesh) (cylinderMesh as any)._hoverableThreeObject = true
    if (!isRoot && cylinderMesh) setTransparentObjects.value.push(cylinderMesh as THREE.Mesh)

    // const highLightSpherePink = threeSphere.create(0.005 * Math.pow(0.9, deep), "#ea3ff7")
    // threeSphere.move(highLightSpherePink, nodeSphere.position)
    // const highLightPinkMaterial = highLightSpherePink.material as THREE.MeshStandardMaterial
    // highLightPinkMaterial.depthTest = false
    // highLightPinkMaterial.depthWrite = false
    // sceneRef.value?.add(highLightSpherePink as THREE.Mesh)

    const highLightSphere = threeSphere.create(0.013 * Math.pow(0.9, deep), '#f00')
    threeSphere.move(highLightSphere, nodeSphere.position)
    // threeSphere.hide(highLightSphere)
    // sceneRef.value?.add(highLightSphere as THREE.Mesh)

    reNode.threeObjects = {
      sphere: nodeSphere,
      axis: threeRelativeAxis.create(
        nodeSphere.position,
        {
          x: 0,
          y: 0,
          z: 0,
        },
        0.02 * Math.pow(0.9, deep)
      ),
      cylinder: cylinderMesh,
      highLightSphere: highLightSphere,
      // highLightSpherePink: highLightSpherePink,
    } as BVHThreeNode['threeObjects']
    hideRelativeAxis.value.push(reNode.threeObjects.axis as THREE.Group)
    threeRelativeAxis.hide(reNode.threeObjects.axis as THREE.Group)

    if (!isRoot) {
      // const nodeLine: THREE.Line = threeLine.create(
      //   parentPosition,
      //   nodeSphere.position,
      //   "#ff0"
      // );
      // reNode.threeObjects!.lineToParent = nodeLine;
    }
    if (Array.isArray(node.children)) {
      for (let i = 0; i < node.children.length; i++) {
        const newReNode: Partial<BVHThreeNode> = {}
        handleNode(
          node.children[i],
          newReNode,
          reNode as BVHThreeNode,
          nodeSphere.position,
          false,
          deep + 1
        )
        reNode.children!.push(newReNode as BVHThreeNode)
      }
    }
  }
  handleNode(currentNode, root, null, { x: 0, y: 0, z: 0 }, true, 0)
  root.quaternion = {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
  }
  return root as BVHThreeNode
}

function convertBVHThreeObjectToURDFLike(bvhThreeObject: BVHThreeNode): URDFRobot {
  // 创建一个包装对象来保持对原始 BVH position 的引用
  const positionWrapper = bvhThreeObject.position
    ? {
        get x() {
          return bvhThreeObject.position?.x || 0
        },
        set x(v) {
          if (bvhThreeObject.position) bvhThreeObject.position.x = v
        },
        get y() {
          return bvhThreeObject.position?.y || 0
        },
        set y(v) {
          if (bvhThreeObject.position) bvhThreeObject.position.y = v
        },
        get z() {
          return bvhThreeObject.position?.z || 0
        },
        set z(v) {
          if (bvhThreeObject.position) bvhThreeObject.position.z = v
        },
      }
    : { x: 0, y: 0, z: 0 }

  // 创建一个包装对象来保持对原始 BVH rotation 的引用
  const rotationWrapper = bvhThreeObject.rotation
    ? {
        get x() {
          return degToRad(bvhThreeObject.rotation?.x || 0)
        },
        set x(v) {
          if (bvhThreeObject.rotation) bvhThreeObject.rotation.x = radToDeg(v)
        },
        get y() {
          return degToRad(bvhThreeObject.rotation?.y || 0)
        },
        set y(v) {
          if (bvhThreeObject.rotation) bvhThreeObject.rotation.y = radToDeg(v)
        },
        get z() {
          return degToRad(bvhThreeObject.rotation?.z || 0)
        },
        set z(v) {
          if (bvhThreeObject.rotation) bvhThreeObject.rotation.z = radToDeg(v)
        },
        get order() {
          return bvhThreeObject.rotation?.order || 'XYZ'
        },
        set order(v) {
          if (bvhThreeObject.rotation) bvhThreeObject.rotation.order = v
        },
      }
    : { x: 0, y: 0, z: 0, order: 'XYZ' }

  // 创建一个包装对象来保持对原始 BVH quaternion 的引用
  const quaternionWrapper = bvhThreeObject.quaternion
    ? {
        get x() {
          return bvhThreeObject.quaternion!.x
        },
        set x(v) {
          if (bvhThreeObject.quaternion) bvhThreeObject.quaternion.x = v
        },
        get y() {
          return bvhThreeObject.quaternion!.y
        },
        set y(v) {
          if (bvhThreeObject.quaternion) bvhThreeObject.quaternion.y = v
        },
        get z() {
          return bvhThreeObject.quaternion!.z
        },
        set z(v) {
          if (bvhThreeObject.quaternion) bvhThreeObject.quaternion.z = v
        },
        get w() {
          return bvhThreeObject.quaternion!.w
        },
        set w(v) {
          if (bvhThreeObject.quaternion) bvhThreeObject.quaternion.w = v
        },
      }
    : new THREE.Quaternion(0, 0, 0, 1)

  const urdfLikeObject: any = {
    name: bvhThreeObject.name || 'bvh_root',
    type: 'BVHAsURDF',
    isURDFRobot: false,
    isBVHAsURDF: true,
    joints: {} as Record<string, any>,
    links: {} as Record<string, any>,
    frames: {} as Record<string, any>,
    children: [] as any[],
    position: positionWrapper,
    quaternion: quaternionWrapper,
    rotation: rotationWrapper,
    scale: new THREE.Vector3(1, 1, 1),
    matrix: new THREE.Matrix4(),
    matrixWorld: new THREE.Matrix4(),
    parent: null,
    bvhNode: bvhThreeObject,

    setPosition: (pos: Vector3Like) => {
      if (bvhThreeObject.position) {
        bvhThreeObject.position.x = pos.x
        bvhThreeObject.position.y = pos.y
        bvhThreeObject.position.z = pos.z
      }
      if (bvhThreeObject.setRootPosition) {
        bvhThreeObject.setRootPosition(pos)
      }
    },

    getPosition: (): Vector3Like => {
      return {
        x: bvhThreeObject.position?.x || 0,
        y: bvhThreeObject.position?.y || 0,
        z: bvhThreeObject.position?.z || 0,
      }
    },

    setQuaternion: (quat: QuaternionLike) => {
      urdfLikeObject.quaternion.x = quat.x
      urdfLikeObject.quaternion.y = quat.y
      urdfLikeObject.quaternion.z = quat.z
      urdfLikeObject.quaternion.w = quat.w

      const euler = new THREE.Euler().setFromQuaternion(urdfLikeObject.quaternion, 'XYZ')
      const eulerDeg: EulerLike = {
        x: radToDeg(euler.x),
        y: radToDeg(euler.y),
        z: radToDeg(euler.z),
        order: euler.order,
      }
      if (bvhThreeObject.setRotation) {
        bvhThreeObject.setRotation(eulerDeg, false)
      }
    },

    getQuaternion: (): QuaternionLike => {
      if ((bvhThreeObject as any).quaternion) {
        const q = (bvhThreeObject as any).quaternion
        // 使用 x, y, z, w 属性直接访问
        return {
          x: q.x,
          y: q.y,
          z: q.z,
          w: q.w,
        }
      }
      if (bvhThreeObject.rotation) {
        const euler = new THREE.Euler(
          degToRad(bvhThreeObject.rotation.x),
          degToRad(bvhThreeObject.rotation.y),
          degToRad(bvhThreeObject.rotation.z),
          bvhThreeObject.rotation.order as THREE.EulerOrder
        )
        const quat = new THREE.Quaternion().setFromEuler(euler)
        return {
          x: quat.x,
          y: quat.y,
          z: quat.z,
          w: quat.w,
        }
      }
      return {
        x: urdfLikeObject.quaternion.x,
        y: urdfLikeObject.quaternion.y,
        z: urdfLikeObject.quaternion.z,
        w: urdfLikeObject.quaternion.w,
      }
    },

    threeGetPosition: () => {
      return {
        x: bvhThreeObject.position?.x || 0,
        y: bvhThreeObject.position?.y || 0,
        z: bvhThreeObject.position?.z || 0,
      }
    },

    threeSetPosition: (pos: Vector3Like) => {
      urdfLikeObject.setPosition(pos)
    },

    threeGetQuaternion: () => urdfLikeObject.getQuaternion(),

    threeSetQuaternion: (quat: QuaternionLike) => {
      urdfLikeObject.setQuaternion(quat)
    },

    threeGetRotation: (): EulerLike => {
      return {
        x: bvhThreeObject.rotation?.x || 0,
        y: bvhThreeObject.rotation?.y || 0,
        z: bvhThreeObject.rotation?.z || 0,
        order: bvhThreeObject.rotation?.order || 'XYZ',
      }
    },

    threeSetRotation: (euler: EulerLike) => {
      if (bvhThreeObject.setRotation) {
        bvhThreeObject.setRotation(euler, false)
      }
    },
  }

  const collectJoints = (node: BVHThreeNode, parentJoint: any = null) => {
    if (!node.name) return

    // 创建包装对象直接引用原始 node 的 position
    const nodePositionWrapper = node.position
      ? {
          get x() {
            return node.position?.x || 0
          },
          set x(v) {
            if (node.position) node.position.x = v
          },
          get y() {
            return node.position?.y || 0
          },
          set y(v) {
            if (node.position) node.position.y = v
          },
          get z() {
            return node.position?.z || 0
          },
          set z(v) {
            if (node.position) node.position.z = v
          },
        }
      : { x: 0, y: 0, z: 0 }

    // 创建包装对象直接引用原始 node 的 rotation
    const nodeRotationWrapper = node.rotation
      ? {
          get x() {
            return degToRad(node.rotation?.x || 0)
          },
          set x(v) {
            if (node.rotation) node.rotation.x = radToDeg(v)
          },
          get y() {
            return degToRad(node.rotation?.y || 0)
          },
          set y(v) {
            if (node.rotation) node.rotation.y = radToDeg(v)
          },
          get z() {
            return degToRad(node.rotation?.z || 0)
          },
          set z(v) {
            if (node.rotation) node.rotation.z = radToDeg(v)
          },
          get order() {
            return node.rotation?.order || 'XYZ'
          },
          set order(v) {
            if (node.rotation) node.rotation.order = v
          },
        }
      : { x: 0, y: 0, z: 0, order: 'XYZ' }

    const jointObject: any = {
      name: node.name,
      type: 'BVHJoint',
      isURDFJoint: false,
      isBVHJoint: true,
      _jointType: 'revolute',
      axis: new THREE.Vector3(0, 1, 0),
      angle: 0,
      position: nodePositionWrapper,
      quaternion: new THREE.Quaternion(0, 0, 0, 1),
      rotation: nodeRotationWrapper,
      parent: parentJoint || urdfLikeObject,
      children: [] as any[],
      bvhNode: node,

      // 动态计算关节限制范围（基于所有帧的数据）
      get limit() {
        // 如果没有动作数据，返回默认范围
        if (!props.motionData || props.motionData.length === 0) {
          return {
            get lower() {
              return -180
            },
            get upper() {
              return 180
            },
          }
        }

        // 收集该关节所有帧的旋转数据
        const jointName = node.name
        const xValues: number[] = []
        const yValues: number[] = []
        const zValues: number[] = []

        for (const frameData of props.motionData as any[]) {
          if (frameData && typeof frameData === 'object') {
            // 尝试获取该关节的旋转数据
            const xKey = `${jointName}_x`
            const yKey = `${jointName}_y`
            const zKey = `${jointName}_z`

            if (frameData[xKey] !== undefined) xValues.push(frameData[xKey])
            if (frameData[yKey] !== undefined) yValues.push(frameData[yKey])
            if (frameData[zKey] !== undefined) zValues.push(frameData[zKey])
          }
        }

        // 计算所有轴的最小值和最大值
        const allValues = [...xValues, ...yValues, ...zValues]

        if (allValues.length === 0) {
          return {
            get lower() {
              return -180
            },
            get upper() {
              return 180
            },
          }
        }

        const minVal = Math.min(...allValues)
        const maxVal = Math.max(...allValues)
        const range = maxVal - minVal
        const padding = range > 0 ? range * 0.1 : 10 // 添加10%的边距，如果范围为0则使用10度

        return {
          get lower() {
            return minVal - padding
          },
          get upper() {
            return maxVal + padding
          },
        }
      },

      setRotationFromAxisAngle: (axis: THREE.Vector3, angle: number) => {
        const quat = new THREE.Quaternion()
        quat.setFromAxisAngle(axis.normalize(), angle)
        const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ')
        const eulerDeg: EulerLike = {
          x: radToDeg(euler.x),
          y: radToDeg(euler.y),
          z: radToDeg(euler.z),
          order: euler.order,
        }
        if (node.setRotation) {
          node.setRotation(eulerDeg, false)
        }
      },

      getQuaternion: (): QuaternionLike => {
        if (node.rotation) {
          const euler = new THREE.Euler(
            degToRad(node.rotation.x),
            degToRad(node.rotation.y),
            degToRad(node.rotation.z),
            node.rotation.order as THREE.EulerOrder
          )
          const quat = new THREE.Quaternion().setFromEuler(euler)
          return {
            x: quat.x,
            y: quat.y,
            z: quat.z,
            w: quat.w,
          }
        }
        return {
          x: 0,
          y: 0,
          z: 0,
          w: 1,
        }
      },

      threeGetPosition: () => {
        return {
          x: node.position?.x || 0,
          y: node.position?.y || 0,
          z: node.position?.z || 0,
        }
      },

      threeGetRotation: (): EulerLike => {
        return {
          x: node.rotation?.x || 0,
          y: node.rotation?.y || 0,
          z: node.rotation?.z || 0,
          order: node.rotation?.order || 'XYZ',
        }
      },

      threeSetRotation: (euler: EulerLike) => {
        if (node.setRotation) {
          node.setRotation(euler, false)
        }
      },
    }

    if (node.threeObjects) {
      jointObject.threeObjects = node.threeObjects
      jointObject.isThreeObjectNode = true
    }

    urdfLikeObject.joints[node.name] = jointObject
    urdfLikeObject.frames[node.name] = jointObject

    // 为 BVH 关节创建拆分的 x, y, z 分量关节
    // 每个分量都有独立的 limit，基于该轴在所有帧中的数据范围
    const createAxisJoint = (axis: 'x' | 'y' | 'z') => {
      const axisJointName = `${node.name}_${axis}`
      const axisJoint = {
        name: axisJointName,
        type: 'BVHJoint',
        isURDFJoint: false,
        isBVHJoint: true,
        _jointType: 'revolute',
        axis: new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
        angle: 0,
        parent: jointObject,
        bvhNode: node,

        // 为该轴计算独立的 limit
        get limit() {
          if (!props.motionData || props.motionData.length === 0) {
            return {
              get lower() {
                return -180
              },
              get upper() {
                return 180
              },
            }
          }

          const values: number[] = []
          for (const frameData of props.motionData as any[]) {
            if (frameData && typeof frameData === 'object') {
              const key = axisJointName
              if (frameData[key] !== undefined) {
                values.push(frameData[key])
              }
            }
          }

          if (values.length === 0) {
            return {
              get lower() {
                return -180
              },
              get upper() {
                return 180
              },
            }
          }

          const minVal = Math.min(...values)
          const maxVal = Math.max(...values)
          const range = maxVal - minVal
          const padding = range > 0 ? range * 0.1 : 10

          return {
            get lower() {
              return minVal - padding
            },
            get upper() {
              return maxVal + padding
            },
          }
        },
      }

      urdfLikeObject.joints[axisJointName] = axisJoint
      urdfLikeObject.frames[axisJointName] = axisJoint
    }

    // 为 x, y, z 三个轴创建独立的关节对象
    createAxisJoint('x')
    createAxisJoint('y')
    createAxisJoint('z')

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const childJoint = collectJoints(child, jointObject)
        if (childJoint) {
          jointObject.children.push(childJoint)
        }
      }
    }

    return jointObject
  }

  const rootJoint = collectJoints(bvhThreeObject)
  if (rootJoint) {
    urdfLikeObject.children.push(rootJoint)
  }
  return urdfLikeObject as URDFRobot
}

function getRelativeEuler(
  newEuler: EulerLike,
  oldEuler: EulerLike,
  order: THREE.EulerOrder = 'XYZ'
) {
  const oldE = new THREE.Euler(
    degToRad(oldEuler.x),
    degToRad(oldEuler.y),
    degToRad(oldEuler.z),
    order as THREE.EulerOrder
  )
  const newE = new THREE.Euler(
    degToRad(newEuler.x),
    degToRad(newEuler.y),
    degToRad(newEuler.z),
    order as THREE.EulerOrder
  )

  const M_old = new THREE.Matrix4().makeRotationFromEuler(oldE)
  const M_new = new THREE.Matrix4().makeRotationFromEuler(newE)

  const M_delta = M_old.clone().invert().multiply(M_new)

  const deltaE = new THREE.Euler(0, 0, 0, order as THREE.EulerOrder).setFromRotationMatrix(M_delta)

  return {
    x: radToDeg(deltaE.x),
    y: radToDeg(deltaE.y),
    z: radToDeg(deltaE.z),
  }
}

function compoundEulerRotation(
  baseEuler: EulerLike | null,
  rotationEuler: EulerLike | null,
  resultOrder: string = 'XYZ'
): EulerLike {
  const safeBase = baseEuler || ({} as EulerLike)
  const safeRotation = rotationEuler || ({} as EulerLike)

  const baseOrder = (safeBase.order || 'XYZ').toUpperCase() as THREE.EulerOrder
  const rotationOrder = (safeRotation.order || 'XYZ').toUpperCase() as THREE.EulerOrder
  const targetOrder = (resultOrder || 'XYZ').toUpperCase() as THREE.EulerOrder

  const baseQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      degToRad(safeBase.x || 0),
      degToRad(safeBase.y || 0),
      degToRad(safeBase.z || 0),
      baseOrder
    )
  )

  const rotationQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      degToRad(safeRotation.x || 0),
      degToRad(safeRotation.y || 0),
      degToRad(safeRotation.z || 0),
      rotationOrder
    )
  )

  const combinedQuat = baseQuat.clone().multiply(rotationQuat)

  const combinedEuler = new THREE.Euler().setFromQuaternion(combinedQuat, targetOrder)

  return {
    x: radToDeg(combinedEuler.x),
    y: radToDeg(combinedEuler.y),
    z: radToDeg(combinedEuler.z),
    order: targetOrder,
  }
}

const threeCylinder = {
  create(
    startPosition: Vector3Like,
    endPosition: Vector3Like,
    radius: number,
    color: string = '#f00',
    subHeight: number = 0
  ): THREE.Mesh {
    const d = distanceBetweenPoints(startPosition, endPosition) - subHeight
    const centerPosition = {
      x: (startPosition.x + endPosition.x) / 2,
      y: (startPosition.y + endPosition.y) / 2,
      z: (startPosition.z + endPosition.z) / 2,
    }
    const euler = computeEulerFromTwoVectors(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      {
        x: 0,
        y: 1,
        z: 0,
      },
      startPosition,
      endPosition,
      'XYZ'
    )
    const objG = new THREE.CylinderGeometry(radius, radius, d, 32)
    const objM = new THREE.MeshStandardMaterial({
      color, // 任意塑料颜色
      roughness: 0.3, // 低粗糙度：高光清晰
      metalness: 0.0, // 塑料 -> 非金属
    })
    const threeObject = new THREE.Mesh(objG, objM)
    threeObject.position.x = centerPosition.x
    threeObject.position.y = centerPosition.y
    threeObject.position.z = centerPosition.z
    threeObject.rotation.x = euler.x
    threeObject.rotation.y = euler.y
    threeObject.rotation.z = euler.z
    return markRaw(threeObject)
  },
  move(threeObject: THREE.Mesh, toPosition: Vector3Like): void {
    const newPosition = threePoint.move(threeObject.position, toPosition)
    threeObject.position.x = newPosition.x
    threeObject.position.y = newPosition.y
    threeObject.position.z = newPosition.z
  },
  getPosition(threeObject: THREE.Mesh): Vector3Like {
    return {
      x: threeObject.position.x,
      y: threeObject.position.y,
      z: threeObject.position.z,
    }
  },
  getHeight(threeObject: THREE.Mesh): number {
    return (threeObject.geometry as THREE.CylinderGeometry).parameters.height
  },
  getEndPositions(threeObject: THREE.Mesh): {
    startPosition: Vector3Like
    endPosition: Vector3Like
  } {
    const center = threeCylinder.getPosition(threeObject)
    const height = threeCylinder.getHeight(threeObject)
    const rotation = threeObject.rotation.clone()
    rotation.order = 'XYZ'
    let endPosition = {
      x: 0,
      y: height / 2,
      z: 0,
    }
    endPosition = threePoint.rotate(
      endPosition,
      {
        x: 0,
        y: 0,
        z: 0,
      },
      rotation
    )
    let startPosition = {
      x: endPosition.x * -1 + center.x,
      y: endPosition.y * -1 + center.y,
      z: endPosition.z * -1 + center.z,
    }
    endPosition.x += center.x
    endPosition.y += center.y
    endPosition.z += center.z
    return {
      startPosition,
      endPosition,
    }
  },
  update(
    threeObject: THREE.Mesh,
    startPosition?: Vector3Like,
    endPosition?: Vector3Like,
    scale: boolean = true
  ): void {
    const newStartPosition = startPosition || this.getEndPositions(threeObject).startPosition
    const newEndPosition = endPosition || this.getEndPositions(threeObject).endPosition
    const newCenterPosition = {
      x: (newStartPosition.x + newEndPosition.x) / 2,
      y: (newStartPosition.y + newEndPosition.y) / 2,
      z: (newStartPosition.z + newEndPosition.z) / 2,
    }
    const currentHeight = this.getHeight(threeObject)
    const newEuler = computeEulerFromTwoVectors(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      {
        x: 0,
        y: 1,
        z: 0,
      },
      newStartPosition,
      newEndPosition,
      'XYZ'
    )
    const newHeight = distanceBetweenPoints(newStartPosition, newEndPosition)
    // threeObject.geometry.attributes.height = newHeight;
    // return
    threeObject.position.x = newCenterPosition.x
    threeObject.position.y = newCenterPosition.y
    threeObject.position.z = newCenterPosition.z
    threeObject.rotation.x = newEuler.x
    threeObject.rotation.y = newEuler.y
    threeObject.rotation.z = newEuler.z
    if (scale) threeObject.scale.y = newHeight / currentHeight
    // threeObject.geometry.attributes.height.needsUpdate = true;
    // threeObject.geometry.attributes.position.needsUpdate = true;
    // threeObject.geometry.attributes.rotation.needsUpdate = true;
  },
  rotate(
    threeObject: THREE.Mesh,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    euler: EulerLike = { x: 0, y: 0, z: 0, order: 'XYZ' },
    relativeAxisEuler: EulerLike | null = null
  ): void {
    const startPosition = this.getEndPositions(threeObject).startPosition
    const endPosition = this.getEndPositions(threeObject).endPosition
    const newStartPosition = threePoint.rotate(startPosition, center, euler, relativeAxisEuler)
    const newEndPosition = threePoint.rotate(endPosition, center, euler, relativeAxisEuler)
    this.update(threeObject, newStartPosition, newEndPosition)
  },
  hide(threeObject: THREE.Mesh): void {
    const material = threeObject.material as THREE.MeshStandardMaterial
    material.transparent = true
    material.opacity = 0
  },
  show(threeObject: THREE.Mesh): void {
    const material = threeObject.material as THREE.MeshStandardMaterial
    material.transparent = false
    material.opacity = 1
  },
}

const threeRelativeAxis = {
  hide(threeObject: THREE.Group) {
    const children = threeObject.children
    for (let i = 0; i < children.length; i++) {
      threeLine.changeOpacity(children[i] as THREE.Line, 0)
    }
  },
  show(threeObject: THREE.Group) {
    const children = threeObject.children
    for (let i = 0; i < children.length; i++) {
      threeLine.changeOpacity(children[i] as THREE.Line, 1)
    }
  },
  create(position: Vector3Like, euler: EulerLike, length: number = 1): THREE.Group {
    let eulerOrder = euler.order || 'XYZ'
    const group = new THREE.Group()
    let xLineEndPosition = (() => {
      const o = JSON.parse(JSON.stringify(position))
      o.x += length
      return o
    })()
    let yLineEndPosition = (() => {
      const o = JSON.parse(JSON.stringify(position))
      o.y += length
      return o
    })()
    let zLineEndPosition = (() => {
      const o = JSON.parse(JSON.stringify(position))
      o.z += length
      return o
    })()
    const eulerOrderArray = eulerOrder.toLowerCase().split('') as ('x' | 'y' | 'z')[]
    for (const axis of eulerOrderArray) {
      const angle = euler[axis] || 0
      xLineEndPosition = rotatePointAroundCenter(xLineEndPosition, position, axis, angle)
      yLineEndPosition = rotatePointAroundCenter(yLineEndPosition, position, axis, angle)
      zLineEndPosition = rotatePointAroundCenter(zLineEndPosition, position, axis, angle)
    }
    const xLine = threeLine.create(position, xLineEndPosition, '#f00', 0.6, false)
    if (xLine.material && !Array.isArray(xLine.material)) {
      ;(xLine.material as THREE.LineBasicMaterial).depthTest = false
    }
    xLine.renderOrder = 999
    xLine.raycast = () => {}
    const yLine = threeLine.create(position, yLineEndPosition, '#0f0', 0.6, false)
    if (yLine.material && !Array.isArray(yLine.material)) {
      ;(yLine.material as THREE.LineBasicMaterial).depthTest = false
    }
    yLine.renderOrder = 999
    yLine.raycast = () => {}
    const zLine = threeLine.create(position, zLineEndPosition, '#00f', 0.6, false)
    if (zLine.material && !Array.isArray(zLine.material)) {
      ;(zLine.material as THREE.LineBasicMaterial).depthTest = false
    }
    zLine.renderOrder = 999
    zLine.raycast = () => {}
    group.add(xLine)
    group.add(yLine)
    group.add(zLine)
    return markRaw(group)
  },
  move(threeObject: THREE.Group, toPosition: Vector3Like): void {
    const children = threeObject.children
    for (let i = 0; i < children.length; i++) {
      threeLine.move(children[i] as THREE.Line, toPosition)
    }
  },
  rotate(
    threeObject: THREE.Group,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    euler: EulerLike = { x: 0, y: 0, z: 0, order: 'XYZ' },
    relativeAxisEuler: EulerLike | null = null
  ): void {
    const children = threeObject.children
    for (let i = 0; i < children.length; i++) {
      threeLine.rotate(children[i] as THREE.Line, center, euler, relativeAxisEuler)
    }
  },
  getPosition(threeObject: THREE.Group): Vector3Like {
    const children = threeObject.children
    const firstChild = children[0] as THREE.Line
    return {
      x: firstChild.geometry.attributes.position.array[0],
      y: firstChild.geometry.attributes.position.array[1],
      z: firstChild.geometry.attributes.position.array[2],
    }
  },
  setRotation(
    threeObject: THREE.Group,
    euler: EulerLike = { x: 0, y: 0, z: 0, order: 'XYZ' }
  ): void {
    const position = threeRelativeAxis.getPosition(threeObject)
    const children = threeObject.children
    const length = threeLine.getLength(children[0] as THREE.Line)
    let xEndPosition = {
      x: length,
      y: 0,
      z: 0,
    }
    let yEndPosition = {
      x: 0,
      y: length,
      z: 0,
    }
    let zEndPosition = {
      x: 0,
      y: 0,
      z: length,
    }
    xEndPosition = threePoint.rotate(xEndPosition, { x: 0, y: 0, z: 0 }, euler)
    yEndPosition = threePoint.rotate(yEndPosition, { x: 0, y: 0, z: 0 }, euler)
    zEndPosition = threePoint.rotate(zEndPosition, { x: 0, y: 0, z: 0 }, euler)
    xEndPosition.x += position.x
    xEndPosition.y += position.y
    xEndPosition.z += position.z
    yEndPosition.x += position.x
    yEndPosition.y += position.y
    yEndPosition.z += position.z
    zEndPosition.x += position.x
    zEndPosition.y += position.y
    zEndPosition.z += position.z
    threeLine.update(children[0] as THREE.Line, position, xEndPosition)
    threeLine.update(children[1] as THREE.Line, position, yEndPosition)
    threeLine.update(children[2] as THREE.Line, position, zEndPosition)
  },
}

const threeLine = {
  changeOpacity(threeObject: THREE.Line, opacity: number): void {
    if (threeObject.material && !Array.isArray(threeObject.material)) {
      ;(threeObject.material as THREE.LineBasicMaterial).opacity = opacity
      ;(threeObject.material as THREE.LineBasicMaterial).transparent = true
    }
  },
  create(
    fromPosition: Vector3Like,
    toPosition: Vector3Like,
    color: string = '#f00',
    linewidth: number = 2,
    deepTest: boolean = true
  ): THREE.Line {
    const objG = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(fromPosition.x, fromPosition.y, fromPosition.z),
      new THREE.Vector3(toPosition.x, toPosition.y, toPosition.z),
    ])
    const objM = new THREE.LineBasicMaterial({
      color,
      linewidth,
    })
    if (!deepTest) {
      objM.depthTest = false
      objM.depthWrite = false
      objM.transparent = true
    }
    const o = new THREE.Line(objG, objM)
    // 避免视锥裁剪导致近距离或特定角度下线条消失
    o.frustumCulled = false
    // 提高渲染顺序，在不写深度时确保可见
    if (!deepTest) o.renderOrder = 9999
    // o.layers.set(1);
    return markRaw(o)
  },
  update(threeObject: THREE.Line, fromPosition?: Vector3Like, toPosition?: Vector3Like): void {
    if (fromPosition !== undefined) {
      threeObject.geometry.attributes.position.array[0] = fromPosition.x
      threeObject.geometry.attributes.position.array[1] = fromPosition.y
      threeObject.geometry.attributes.position.array[2] = fromPosition.z
    }
    if (toPosition !== undefined) {
      threeObject.geometry.attributes.position.array[3] = toPosition.x
      threeObject.geometry.attributes.position.array[4] = toPosition.y
      threeObject.geometry.attributes.position.array[5] = toPosition.z
    }
    threeObject.geometry.attributes.position.needsUpdate = true
  },
  getPosition(threeObject: THREE.Line): { fromPosition: Vector3Like; toPosition: Vector3Like } {
    return {
      fromPosition: {
        x: threeObject.geometry.attributes.position.array[0],
        y: threeObject.geometry.attributes.position.array[1],
        z: threeObject.geometry.attributes.position.array[2],
      },
      toPosition: {
        x: threeObject.geometry.attributes.position.array[3],
        y: threeObject.geometry.attributes.position.array[4],
        z: threeObject.geometry.attributes.position.array[5],
      },
    }
  },
  move(threeObject: THREE.Line, toFromPosition: Vector3Like): void {
    const currentFromPosition = threeLine.getPosition(threeObject).fromPosition
    const cx = toFromPosition.x - currentFromPosition.x
    const cy = toFromPosition.y - currentFromPosition.y
    const cz = toFromPosition.z - currentFromPosition.z
    const currentToPosition = threeLine.getPosition(threeObject).toPosition
    this.update(
      threeObject,
      {
        x: currentFromPosition.x + cx,
        y: currentFromPosition.y + cy,
        z: currentFromPosition.z + cz,
      },
      {
        x: currentToPosition.x + cx,
        y: currentToPosition.y + cy,
        z: currentToPosition.z + cz,
      }
    )
  },
  rotateSingleAxis(
    threeObject: THREE.Line,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    axis: string,
    angle: number,
    relativeAxisRotation: EulerLike | null = null
  ): void {
    const fromPosition = threeLine.getPosition(threeObject).fromPosition
    const toPosition = threeLine.getPosition(threeObject).toPosition
    const newFromPosition = threePoint.rotateSingleAxis(
      fromPosition,
      center,
      axis,
      angle,
      relativeAxisRotation
    )
    const newToPosition = threePoint.rotateSingleAxis(
      toPosition,
      center,
      axis,
      angle,
      relativeAxisRotation
    )
    this.update(threeObject, newFromPosition, newToPosition)
  },
  rotate(
    threeObject: THREE.Line,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    euler: EulerLike = { x: 0, y: 0, z: 0, order: 'XYZ' },
    relativeAxisEuler: EulerLike | null = null
  ): void {
    const fromPosition = threeLine.getPosition(threeObject).fromPosition
    const toPosition = threeLine.getPosition(threeObject).toPosition
    const newFromPosition = threePoint.rotate(fromPosition, center, euler, relativeAxisEuler)
    const newToPosition = threePoint.rotate(toPosition, center, euler, relativeAxisEuler)
    this.update(threeObject, newFromPosition, newToPosition)
  },
  getLength(threeObject: THREE.Line): number {
    function calculateDistance3D(p1: Vector3Like, p2: Vector3Like): number {
      // 计算各轴上的差值
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dz = p2.z - p1.z

      // 计算差值的平方和
      const squaredDistance = dx * dx + dy * dy + dz * dz

      // 返回平方根（即距离）
      return Math.sqrt(squaredDistance)
    }
    const positions = this.getPosition(threeObject)
    return calculateDistance3D(positions.fromPosition, positions.toPosition)
  },
}

const threeSphere = {
  create(radius: number = 3, color: string = '#f00'): THREE.Mesh {
    const objG = new THREE.SphereGeometry(radius, 32, 32)
    const objM = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
    })
    return markRaw(new THREE.Mesh(objG, objM))
  },
  move(threeObject: THREE.Mesh, toPosition: Vector3Like): void {
    const newPosition = threePoint.move(threeObject.position, toPosition)
    threeObject.position.x = newPosition.x
    threeObject.position.y = newPosition.y
    threeObject.position.z = newPosition.z
  },
  rotateSingleAxis(
    threeObject: THREE.Mesh,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    axis: string,
    angle: number,
    relativeAxisRotation: EulerLike | null = null
  ): void {
    threeObject.position.copy(
      rotatePointAroundCenter(
        threeObject.position,
        center,
        axis,
        angle,
        relativeAxisRotation
      ) as THREE.Vector3
    )
  },
  rotate(
    threeObject: THREE.Mesh,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    euler: EulerLike = { x: 0, y: 0, z: 0, order: 'XYZ' },
    relativeAxisEuler: EulerLike | null = null
  ): void {
    threeObject.position.copy(
      rotatePointAroundCenterEuler(
        threeObject.position,
        center,
        euler,
        relativeAxisEuler
      ) as THREE.Vector3
    )
  },
  hide(threeObject: THREE.Mesh) {
    const material = threeObject.material as THREE.MeshStandardMaterial
    material.transparent = true
    material.opacity = 0
    material.needsUpdate = true
  },
  show(threeObject: THREE.Mesh) {
    const material = threeObject.material as THREE.MeshStandardMaterial
    material.transparent = false
    material.opacity = 1
    material.needsUpdate = true
  },
}

const threePoint = {
  move(
    currentPosition: Vector3Like | THREE.Vector3,
    toPosition: Partial<Vector3Like>
  ): Vector3Like {
    const pos = JSON.parse(JSON.stringify(currentPosition)) as Vector3Like
    if (typeof toPosition.x === 'number') {
      pos.x = toPosition.x
    }
    if (typeof toPosition.y === 'number') {
      pos.y = toPosition.y
    }
    if (typeof toPosition.z === 'number') {
      pos.z = toPosition.z
    }
    return pos
  },
  rotateSingleAxis(
    currentPosition: Vector3Like | THREE.Vector3,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    axis: string,
    angle: number,
    relativeAxisRotation: EulerLike | null = null
  ): Vector3Like {
    return rotatePointAroundCenter(currentPosition, center, axis, angle, relativeAxisRotation)
  },
  rotate(
    currentPosition: Vector3Like | THREE.Vector3,
    center: Vector3Like = { x: 0, y: 0, z: 0 },
    euler: EulerLike = { x: 0, y: 0, z: 0, order: 'XYZ' },
    relativeAxisEuler: EulerLike | null = null
  ): Vector3Like {
    return rotatePointAroundCenterEuler(currentPosition, center, euler, relativeAxisEuler)
  },
}

function rotatePointAroundCenterEuler(
  point: Vector3Like | THREE.Vector3,
  center: Vector3Like,
  euler: EulerLike,
  relativeAxisEuler: EulerLike | null = null
): Vector3Like {
  const order = (euler.order || 'XYZ').toUpperCase() as THREE.EulerOrder
  const offset = new THREE.Vector3(point.x - center.x, point.y - center.y, point.z - center.z)

  const rotationEuler = new THREE.Euler(
    degToRad(euler.x || 0),
    degToRad(euler.y || 0),
    degToRad(euler.z || 0),
    order
  )
  const rotationQuat = new THREE.Quaternion().setFromEuler(rotationEuler)

  let basisQuat: THREE.Quaternion | null = null
  if (relativeAxisEuler) {
    const basisOrder = (relativeAxisEuler.order || 'XYZ').toUpperCase() as THREE.EulerOrder
    basisQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        degToRad(relativeAxisEuler.x || 0),
        degToRad(relativeAxisEuler.y || 0),
        degToRad(relativeAxisEuler.z || 0),
        basisOrder
      )
    )
    const basisInverse = basisQuat.clone().invert()
    offset.applyQuaternion(basisInverse)
  }

  offset.applyQuaternion(rotationQuat)

  if (basisQuat) {
    offset.applyQuaternion(basisQuat)
  }

  return {
    x: offset.x + center.x,
    y: offset.y + center.y,
    z: offset.z + center.z,
  }
}

function rotatePointAroundCenter(
  point: Vector3Like | THREE.Vector3,
  center: Vector3Like,
  axis: string,
  angle: number,
  relativeAxisEuler: EulerLike | null = null
): Vector3Like {
  const offset = new THREE.Vector3(point.x - center.x, point.y - center.y, point.z - center.z)

  let axisVec: THREE.Vector3
  switch (axis.toLowerCase()) {
    case 'x':
      axisVec = new THREE.Vector3(1, 0, 0)
      break
    case 'y':
      axisVec = new THREE.Vector3(0, 1, 0)
      break
    case 'z':
      axisVec = new THREE.Vector3(0, 0, 1)
      break
    default:
      throw new Error('Invalid rotation axis.')
  }

  if (relativeAxisEuler) {
    const basisOrder = (relativeAxisEuler.order || 'XYZ').toUpperCase() as THREE.EulerOrder
    const basisQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        degToRad(relativeAxisEuler.x || 0),
        degToRad(relativeAxisEuler.y || 0),
        degToRad(relativeAxisEuler.z || 0),
        basisOrder
      )
    )
    axisVec.applyQuaternion(basisQuat)
  }

  axisVec.normalize()

  const radians = THREE.MathUtils.degToRad(angle)
  const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, radians)

  offset.applyQuaternion(rotationQuat)

  return {
    x: offset.x + center.x,
    y: offset.y + center.y,
    z: offset.z + center.z,
  }
}

function toDegrees(radians: number): number {
  return radians * (180 / Math.PI)
}

function computeEulerFromTwoVectors(
  p1: Vector3Like | THREE.Vector3,
  p2: Vector3Like | THREE.Vector3,
  p3: Vector3Like | THREE.Vector3,
  p4: Vector3Like | THREE.Vector3,
  order: string = 'XYZ'
): EulerLike {
  // 向量1
  const v1 = new THREE.Vector3()
    .subVectors(
      p2 instanceof THREE.Vector3 ? p2 : new THREE.Vector3(p2.x, p2.y, p2.z),
      p1 instanceof THREE.Vector3 ? p1 : new THREE.Vector3(p1.x, p1.y, p1.z)
    )
    .normalize()
  // 向量2
  const v2 = new THREE.Vector3()
    .subVectors(
      p4 instanceof THREE.Vector3 ? p4 : new THREE.Vector3(p4.x, p4.y, p4.z),
      p3 instanceof THREE.Vector3 ? p3 : new THREE.Vector3(p3.x, p3.y, p3.z)
    )
    .normalize()

  // 计算旋转四元数：将 v1 旋转到 v2
  const quaternion = new THREE.Quaternion().setFromUnitVectors(v1, v2)

  // 转成欧拉角
  const euler = new THREE.Euler().setFromQuaternion(quaternion, order as THREE.EulerOrder)

  // 返回欧拉角（以弧度表示）
  return {
    x: euler.x,
    y: euler.y,
    z: euler.z,
    order,
  }
}

function distanceBetweenPoints(p1: Vector3Like, p2: Vector3Like): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const dz = p2.z - p1.z

  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function applyGridColors(themeKey: 'light' | 'dark') {
  if (!gridHelperRef.value) return
  const colors = themeColorConfig[themeKey]
  const materials = Array.isArray(gridHelperRef.value.material)
    ? (gridHelperRef.value.material as THREE.Material[])
    : [gridHelperRef.value.material as THREE.Material]
  // GridHelper 默认两个材质：中心线与网格线
  if (materials[0] && (materials[0] as THREE.LineBasicMaterial).color) {
    ;(materials[0] as THREE.LineBasicMaterial).color = new THREE.Color(colors.gridCenter)
  }
  if (materials[1] && (materials[1] as THREE.LineBasicMaterial).color) {
    ;(materials[1] as THREE.LineBasicMaterial).color = new THREE.Color(colors.gridLine)
  }
}

function setSceneThemeDark(scene: THREE.Scene): void {
  const colors = themeColorConfig.dark
  scene.background = new THREE.Color(colors.background)
  applyGridColors('dark')

  if (groundMeshesRef.value) {
    const { top, bottom } = groundMeshesRef.value
    if (top.material) {
      const mat = top.material as THREE.MeshStandardMaterial
      mat.color = new THREE.Color(colors.groundTop)
      mat.transparent = true
      mat.opacity = colors.groundTopOpacity
      mat.depthWrite = false
    }
    if (bottom.material) {
      const mat = bottom.material as THREE.MeshStandardMaterial
      mat.color = new THREE.Color(colors.groundBottom)
      // 注意：这里不要重置 transparent/opacity，因为可能已被 setGroundBottomTransparent 修改
      // 仅更新颜色即可，或者如果确实需要重置，请确认业务逻辑
      mat.color = new THREE.Color(colors.groundBottom)
    }
  }
}

function setSceneThemeLight(scene: THREE.Scene): void {
  const colors = themeColorConfig.light
  scene.background = new THREE.Color(colors.background)
  applyGridColors('light')

  if (groundMeshesRef.value) {
    const { top, bottom } = groundMeshesRef.value
    if (top.material) {
      const mat = top.material as THREE.MeshStandardMaterial
      mat.color = new THREE.Color(colors.groundTop)
      mat.transparent = true
      mat.opacity = colors.groundTopOpacity
      mat.depthWrite = false
    }
    if (bottom.material) {
      const mat = bottom.material as THREE.MeshStandardMaterial
      mat.color = new THREE.Color(colors.groundBottom)
    }
  }
}

function createBeautifulFourLights(scene: THREE.Scene): void {
  const intensity = 1.2 // 光强
  const distance = 20 // 光源距离中心的范围

  // 创建光源的工具函数
  function addLight(
    x: number,
    y: number,
    z: number,
    enableShadow: boolean = false
  ): THREE.DirectionalLight {
    const light = markRaw(new THREE.DirectionalLight(0xffffff, intensity))
    light.position.set(x, y, z)
    scene.add(light)

    if (enableShadow) {
      light.castShadow = true

      light.shadow.mapSize.width = 2048
      light.shadow.mapSize.height = 2048
      light.shadow.bias = -0.0001
    }

    return light
  }

  // 四个方向光（天空感 + 环绕感）
  addLight(distance, distance, distance)
  addLight(-distance, distance, distance, true)
  addLight(distance, distance, -distance)
  addLight(-distance, distance, -distance)

  // 可选：少量环境光提升亮度层次
  const ambient = markRaw(new THREE.AmbientLight(0xffffff, 0.15))
  scene.add(ambient)

  scene.background = new THREE.Color(0x1a1a1a) // 柔和

  const groundGeo = new THREE.PlaneGeometry(500, 500)
  // 顶面：朝上、半透明，确保从上往下看透
  const groundMatTop = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 1,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  })
  // 底面：朝下、不透明，挡住从下往上看的视线
  const groundMatBottom = new THREE.MeshStandardMaterial({
    color: 0x1f1f1f,
    roughness: 1,
    metalness: 1,
    side: THREE.BackSide,
    transparent: false,
  })

  const groundTop = markRaw(new THREE.Mesh(groundGeo, groundMatTop))
  const groundBottom = markRaw(new THREE.Mesh(groundGeo, groundMatBottom))

  for (const mesh of [groundTop, groundBottom]) {
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0
  }

  groundBottom.receiveShadow = true

  // 标记以便主题切换时调整颜色
  ;(groundTop as any)._globalGroundTop = true
  ;(groundBottom as any)._globalGround = true

  scene.add(groundTop)
  scene.add(groundBottom)

  groundMeshesRef.value = {
    top: groundTop,
    bottom: groundBottom,
  }
}

function rotatePositionAroundX(position: Vector3Like): Vector3Like {
  const { x, y, z } = position

  // 绕X轴旋转90度的四元数
  const q = new THREE.Quaternion()
  q.setFromEuler(new THREE.Euler(Math.PI / -2, 0, 0, 'XYZ'))

  // 旋转坐标
  const vector = new THREE.Vector3(x, y, z)
  vector.applyQuaternion(q)

  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  }
}

function rotateQuaternionAroundX(quaternion: QuaternionLike): QuaternionLike {
  const { x, y, z, w } = quaternion

  // 绕X轴旋转90度的四元数
  const rotationQ = new THREE.Quaternion()
  rotationQ.setFromEuler(new THREE.Euler(Math.PI / -2, 0, 0, 'XYZ'))

  // 当前四元数
  const q = new THREE.Quaternion(x, y, z, w)

  // 旋转四元数
  q.multiply(rotationQ)

  return {
    x: q.x,
    y: q.y,
    z: q.z,
    w: q.w,
  }
}

function quaternionToEuler(q: { x: number; y: number; z: number; w: number }) {
  const { w, x, y, z } = q

  const sinPitch = 2 * (w * y - z * x)
  const cosPitch = 1 - 2 * (y * y + z * z)
  const pitch = Math.atan2(sinPitch, cosPitch)

  const sinYaw = 2 * (w * z + x * y)
  const cosYaw = 1 - 2 * (z * z + y * y)
  const yaw = Math.atan2(sinYaw, cosYaw)

  const sinRoll = 2 * (w * x + y * z)
  const cosRoll = 1 - 2 * (x * x + y * y)
  const roll = Math.atan2(sinRoll, cosRoll)

  return {
    x: roll,
    y: pitch,
    z: yaw,
    order: 'XYZ',
  }
}

function eulerToQuaternion(euler: { x: number; y: number; z: number; order?: string }) {
  const { x: roll, y: pitch, z: yaw } = euler
  const cy = Math.cos(yaw * 0.5)
  const sy = Math.sin(yaw * 0.5)
  const cp = Math.cos(pitch * 0.5)
  const sp = Math.sin(pitch * 0.5)
  const cr = Math.cos(roll * 0.5)
  const sr = Math.sin(roll * 0.5)

  const w = cr * cp * cy + sr * sp * sy
  const x = sr * cp * cy - cr * sp * sy
  const y = cr * sp * cy + sr * cp * sy
  const z = cr * cp * sy - sr * sp * cy

  return {
    w,
    x,
    y,
    z,
  }
}

function createRotatableTorus(
  radius: number = 1,
  tube: number = 0.4,
  initialPosition: Vector3Like = { x: 0, y: 0, z: 0 },
  onRotateCallback: ((deltaAngle: number) => void) | null = null,
  camera: THREE.Camera,
  controls: any = null,
  domElement: HTMLElement | null = null,
  onStartRotate: (() => void) | null = null,
  onEndRotate: (() => void) | null = null
) {
  // 创建几何体
  let geometry = new THREE.TorusGeometry(radius, tube, 16, 100)

  // 创建材质，模拟塑料反光效果
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.1, // 低粗糙度，让它像塑料一样光滑
    metalness: 0.5, // 适度的金属感
    emissive: 0x000000, // 不发光
    color: 0xffffff, // 默认颜色白色，用于混合顶点颜色
    side: THREE.DoubleSide, // 确保两面都能看到
    vertexColors: true, // 启用顶点颜色（新版three.js使用布尔值）
    depthTest: false,
    depthWrite: false,
  })

  // 为每个顶点设置交替的黑白颜色（更宽的条纹）
  const colors: number[] = []
  const stripeWidth = 16 // 条纹宽度，数值越大条纹越宽
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    // 根据顶点索引分组，产生宽条纹
    if (Math.floor(i / stripeWidth) % 2 === 0) {
      colors.push(0, 0, 0) // 黑色
    } else {
      colors.push(1, 1, 1) // 白色
    }
  }

  // 为几何体设置颜色属性
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))

  const torus = markRaw(new THREE.Mesh(geometry, material))

  // 设置初始位置，默认环心朝向 x+ 方向
  torus.position.set(initialPosition.x, initialPosition.y, initialPosition.z)
  torus.rotation.set(0, Math.PI / 2, 0) // 默认朝向 x+

  // 旋转变量
  let previousAngle = 0
  let currentAngle = 0
  let isDragging = false
  let totalRotation = 0 // 累积旋转角度
  let currentStripeWidth = 16 // 当前条纹宽度

  // 用于计算旋转
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  // 圆环的局部法向量（默认沿着局部Z轴）
  const localAxis = new THREE.Vector3(0, 0, 1)

  // 获取标准化设备坐标 (NDC)
  function getNDCCoords(clientX: number, clientY: number) {
    if (domElement) {
      const rect = domElement.getBoundingClientRect()
      return {
        x: ((clientX - rect.left) / rect.width) * 2 - 1,
        y: -((clientY - rect.top) / rect.height) * 2 + 1,
      }
    }
    return {
      x: (clientX / window.innerWidth) * 2 - 1,
      y: -(clientY / window.innerHeight) * 2 + 1,
    }
  }

  // 获取鼠标相对角度
  function getAngleFromMouse(clientX: number, clientY: number) {
    const ndc = getNDCCoords(clientX, clientY)
    const mouseVector = new THREE.Vector2(ndc.x, ndc.y)
    return Math.atan2(mouseVector.y, mouseVector.x) // 计算相对角度
  }

  // 事件处理
  const onMouseDown = (event: MouseEvent) => {
    const ndc = getNDCCoords(event.clientX, event.clientY)
    mouse.x = ndc.x
    mouse.y = ndc.y
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(torus)

    if (intersects.length > 0) {
      isDragging = true
      previousAngle = getAngleFromMouse(event.clientX, event.clientY)

      // 禁用摄像机控制器（如果提供了）
      if (controls && controls.enabled !== undefined) {
        controls.enabled = false
      }

      // 阻止事件传播和默认行为，防止摄像机控制器响应
      event.stopPropagation()
      event.preventDefault()

      if (onStartRotate) {
        onStartRotate()
      }
    }
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!isDragging) return

    // 阻止事件传播和默认行为，防止摄像机移动
    event.stopPropagation()
    event.preventDefault()

    currentAngle = getAngleFromMouse(event.clientX, event.clientY)
    const deltaAngle = -(currentAngle - previousAngle) // 取反，使拖动方向和旋转方向一致

    // 绕圆环自己的法向量（局部Z轴）旋转
    torus.rotateOnAxis(localAxis, deltaAngle)
    totalRotation += deltaAngle
    previousAngle = currentAngle

    // 触发回调（如果有的话）
    if (onRotateCallback) {
      onRotateCallback(deltaAngle)
    }
  }

  const onMouseUp = (event: MouseEvent) => {
    if (isDragging) {
      // 重新启用摄像机控制器（如果提供了）
      if (controls && controls.enabled !== undefined) {
        controls.enabled = true
      }

      // 如果刚才在拖动，阻止事件传播
      event.stopPropagation()
      event.preventDefault()

      if (onEndRotate) {
        onEndRotate()
      }
    }
    isDragging = false
  }

  // 设置顶点颜色的辅助函数
  function setVertexColors(
    geometry: THREE.TorusGeometry,
    color1 = { r: 0, g: 0, b: 0 },
    color2 = { r: 1, g: 1, b: 1 },
    stripeWidth = 16
  ) {
    const colors: number[] = []
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      if (Math.floor(i / stripeWidth) % 2 === 0) {
        colors.push(color1.r, color1.g, color1.b)
      } else {
        colors.push(color2.r, color2.g, color2.b)
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
  }

  // 4. API 提供给外部调用
  const api = {
    setPosition(x: number, y: number, z: number) {
      torus.position.set(x, y, z)
    },
    setRotation(euler: { x: number; y: number; z: number; order?: THREE.EulerOrder }) {
      // 设置欧拉角旋转 (输入为角度，转换为弧度)
      torus.rotation.set(
        THREE.MathUtils.degToRad(euler.x),
        THREE.MathUtils.degToRad(euler.y),
        THREE.MathUtils.degToRad(euler.z),
        euler.order
      )
      totalRotation = 0 // 重置累积旋转
    },
    setSize(radius: number, tube: number) {
      const newGeometry = new THREE.TorusGeometry(radius, tube, 16, 100)
      // 重新设置顶点颜色（使用当前条纹宽度）
      setVertexColors(newGeometry, { r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, currentStripeWidth)
      torus.geometry.dispose()
      torus.geometry = newGeometry
    },
    setOrientation(quaternion: THREE.Quaternion) {
      // 设置朝向（使用四元数）
      torus.quaternion.copy(quaternion)
      totalRotation = 0 // 重置累积旋转
    },
    setColor(color1 = { r: 0, g: 0, b: 0 }, color2 = { r: 1, g: 1, b: 1 }) {
      // 设置交替的颜色（使用当前条纹宽度）
      setVertexColors(torus.geometry as THREE.TorusGeometry, color1, color2, currentStripeWidth)
      torus.geometry.attributes.color.needsUpdate = true
    },
    setStripeWidth(width: number) {
      // 设置条纹宽度（数值越大条纹越宽）
      currentStripeWidth = Math.max(1, width) // 确保至少为1
      // 重新应用当前颜色
      setVertexColors(
        torus.geometry as THREE.TorusGeometry,
        { r: 0, g: 0, b: 0 },
        { r: 1, g: 1, b: 1 },
        currentStripeWidth
      )
      torus.geometry.attributes.color.needsUpdate = true
    },
    setControls(newControls: any) {
      // 设置或更新摄像机控制器引用
      controls = newControls
    },
    setCamera(newCamera: THREE.Camera) {
      camera = newCamera
    },
    getRotation() {
      return totalRotation // 返回累积的旋转弧度
    },
    resetRotation() {
      totalRotation = 0 // 重置旋转计数
    },
    // 清理函数
    dispose() {
      // 移除事件监听
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)

      // 释放几何体和材质资源
      torus.geometry.dispose()
      torus.material.dispose()
    },
  }

  // 绑定事件
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)

  // 返回创建的 object3D 和 API
  return { object3D: torus, api: api }
}

function rainbowColor(total: number, current: number): string {
  const colors: [number, number, number][] = [
    [255, 0, 0],
    [255, 127, 0],
    [255, 255, 0],
    [0, 255, 0],
    [100, 150, 255],
    [150, 100, 230],
    [200, 120, 255],
  ]

  if (total <= 0) return 'rgb(0,0,0)'
  if (current <= 0) return 'rgb(255,0,0)'
  if (current >= total) return 'rgb(139,0,255)'

  const sections: number = colors.length - 1
  const ratio: number = current / total
  const index: number = Math.floor(ratio * sections)
  const t: number = ratio * sections - index

  const c1: [number, number, number] = colors[index]
  const c2: [number, number, number] = colors[index + 1]

  const r: number = Math.round(c1[0] + (c2[0] - c1[0]) * t)
  const g: number = Math.round(c1[1] + (c2[1] - c1[1]) * t)
  const b: number = Math.round(c1[2] + (c2[2] - c1[2]) * t)

  return `rgb(${r}, ${g}, ${b})`
}

// BVH 导出数据结构类型
interface BVHHierarchyNode {
  isRoot?: boolean
  isEnd?: boolean
  name?: string
  offset: { x: number; y: number; z: number }
  channels?: string[]
  children?: BVHHierarchyNode[]
}

interface BVHExportObject {
  hierarchy: BVHHierarchyNode
  standardScale?: number
  frameNum: number
  frameTime: number
  frames: number[][]
  channels: Array<string | { channel: string }>
  standardRootPositionOffset: { x: number; y: number; z: number }
}

function generateBVH(bvhObject: BVHExportObject | null = null): string {
  if (!bvhObject) {
    throw new Error('未输入BVH对象')
  }
  let bvhContent = 'HIERARCHY\n'
  let current: BVHHierarchyNode = bvhObject.hierarchy
  function getStartSpace(n: number) {
    let re = ''
    for (let i = 0; i < n; i++) {
      re += '\t'
    }
    return re
  }
  function printNode(current: BVHHierarchyNode, deep: number) {
    bvhContent += `${getStartSpace(deep)}${
      current.isRoot ? 'ROOT' : current.isEnd ? 'End Site' : 'JOINT'
    }${current.isEnd ? ' ' : ` ${current.name}`}\n`
    bvhContent += `${getStartSpace(deep)}{\n`
    bvhContent += `${getStartSpace(deep + 1)}OFFSET ${(
      current.offset.x / (bvhObject?.standardScale || 1)
    ).toFixed(6)} ${(current.offset.y / (bvhObject?.standardScale || 1)).toFixed(6)} ${(
      current.offset.z / (bvhObject?.standardScale || 1)
    ).toFixed(6)}\n`
    if (current.channels)
      bvhContent += `${getStartSpace(deep + 1)}CHANNELS ${
        current.channels.length
      } ${current.channels.join(' ')}\n`
    if (current.children)
      for (let i = 0; i < current.children.length; i++) {
        printNode(current.children[i], deep + 1)
      }
    bvhContent += `${getStartSpace(deep)}}\n`
  }
  printNode(current, 0)
  bvhContent += 'MOTION\n'
  bvhContent += `Frames: ${bvhObject.frameNum}\n`
  bvhContent += `Frame Time: ${bvhObject.frameTime.toFixed(6)}\n`

  for (let i = 0; i < bvhObject.frames.length; i++) {
    let currentLine = ''
    for (let i1 = 0; i1 < bvhObject.frames[i].length; i1++) {
      const currentChannel = bvhObject.channels[i1]
      if (currentLine === '') {
        currentLine = `${(
          (bvhObject.frames[i][i1] -
            (() => {
              if (
                typeof currentChannel === 'object' &&
                currentChannel.channel.indexOf('position') === 0
              ) {
                if (currentChannel.channel.indexOf('Xposition') !== -1) {
                  return bvhObject.standardRootPositionOffset.x
                }
                if (currentChannel.channel.indexOf('Zposition') !== -1) {
                  return bvhObject.standardRootPositionOffset.z
                }
                if (currentChannel.channel.indexOf('Yposition') !== -1) {
                  return bvhObject.standardRootPositionOffset.y
                }
              }
              return 0
            })()) /
          (typeof currentChannel === 'object' && currentChannel.channel.indexOf('position') !== -1
            ? bvhObject?.standardScale || 1
            : 1)
        ).toFixed(6)}`
      } else {
        currentLine += ` ${(
          (bvhObject.frames[i][i1] -
            (() => {
              if (
                typeof currentChannel === 'object' &&
                currentChannel.channel.indexOf('position') === 0
              ) {
                if (currentChannel.channel.indexOf('Xposition') !== -1) {
                  return bvhObject.standardRootPositionOffset.x
                }
              }
              if (
                typeof currentChannel === 'object' &&
                currentChannel.channel.indexOf('position') === 0
              ) {
                if (currentChannel.channel.indexOf('Zposition') !== -1) {
                  return bvhObject.standardRootPositionOffset.z
                }
              }
              if (
                typeof currentChannel === 'object' &&
                currentChannel.channel.indexOf('position') === 0
              ) {
                if (currentChannel.channel.indexOf('Yposition') !== -1) {
                  return bvhObject.standardRootPositionOffset.y
                }
              }
              return 0
            })()) /
          (typeof currentChannel === 'object' && currentChannel.channel.indexOf('position') !== -1
            ? bvhObject?.standardScale || 1
            : 1)
        ).toFixed(6)}`
      }
    }
    bvhContent += currentLine + '\n'
  }
  return bvhContent
}
</script>

<style scoped>
.motion-editor-3d-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  position: relative;
}

.viewer-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* 确保canvas元素正确自适应 */
.viewer-container :deep(canvas) {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
