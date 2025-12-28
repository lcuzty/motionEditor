/**
 * 动作编辑器统一工具库
 *
 * 整合了动作编辑、3D渲染、数据处理等核心功能的工具函数集合。
 * 为动作编辑器提供完整的底层技术支持。
 */
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js'
import { BVHParser } from '@/renderer/parsers/bvh-parser'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore external module without types
import URDFManipulator from '../../../urdfLoader/urdf-manipulator-element.js'
import type {
  BvhParseData,
  ParseBvhByProjectRequest,
  ProcessMotionHubBvhRequest,
} from '@/infrastructure/api/motionRetarget/bvhParse'
import {
  bvhParse,
  bvhParseApi,
  convertBvhParseDataToMotionJSON,
} from '@/infrastructure/api/motionRetarget/bvhParse'
import { computed } from 'vue'


/**
 * 波纹调整算法（Ripple Adjust）
 *
 * 这是动作编辑器中最重要的数据调整算法之一，实现了类似音频/视频编辑软件中的"波纹效应"。
 * 当用户修改某一帧的数值时，变化会以渐减的方式影响周围的帧，创造自然的过渡效果。
 *
 * 核心特性：
 * 1. 中心点完全变化：指定索引处应用完整的变化量
 * 2. 渐减影响：使用Hann余弦窗函数实现平滑的权重衰减
 * 3. 双向扩散：可以向前、向后或双向影响相邻帧
 * 4. 灵活控制：支持不同的影响范围和模式
 *
 * 权重函数（Hann窗）：
 * - 在中心点权重为1（完全影响）
 * - 随距离增加按余弦曲线衰减
 * - 在边界处权重为0（无影响）
 * - 提供最自然的过渡效果
 *
 * 影响模式：
 * - prevCount/nextCount = 0：无影响
 * - prevCount/nextCount > 0：影响指定数量的帧
 * - prevCount/nextCount = -1：影响到数组边界的所有帧
 *
 * 应用场景：
 * - 轨迹面板中的关键帧调整
 * - 动作序列的局部修改
 * - 姿态调整的自然过渡
 * - 动作编辑的智能辅助
 *
 * 这种算法让用户的单点编辑产生连贯的动作效果，避免了生硬的数据跳跃。
 *
 * @param arr 原始数据数组
 * @param index 调整的中心索引
 * @param delta 变化量
 * @param prevCount 向前影响的帧数（0=无影响，-1=影响到开头）
 * @param nextCount 向后影响的帧数（0=无影响，-1=影响到结尾）
 * @returns 调整后的数据数组
 */
export function rippleAdjust(
  arr: ReadonlyArray<number>,
  index: number,
  delta: number,
  prevCount: number = 0,
  nextCount: number = 0
): number[] {
  const n = arr.length
  if (n === 0) return []
  const idx = Math.min(Math.max(0, Math.floor(index)), n - 1)
  const out = [...arr]

  out[idx] = (arr[idx] ?? 0) + delta

  const hann = (d: number, count: number) => {
    if (count <= 0) return 0
    if (d <= 0) return 1
    if (d >= count) return 0
    return 0.5 * (1 + Math.cos(Math.PI * (d / count)))
  }

  if (prevCount === -1) {
    for (let i = 0; i < idx; i++) out[i] = (arr[i] ?? 0) + delta
  } else if (prevCount > 0) {
    const maxSpan = Math.min(prevCount, idx)
    for (let d = 1; d <= maxSpan; d++) {
      const i = idx - d
      const w = hann(d, prevCount)
      out[i] = (arr[i] ?? 0) + delta * w
    }
  }

  const rightAvail = n - 1 - idx
  if (nextCount === -1) {
    for (let i = idx + 1; i < n; i++) out[i] = (arr[i] ?? 0) + delta
  } else if (nextCount > 0) {
    const maxSpan = Math.min(nextCount, rightAvail)
    for (let d = 1; d <= maxSpan; d++) {
      const i = idx + d
      const w = hann(d, nextCount)
      out[i] = (arr[i] ?? 0) + delta * w
    }
  }

  return out
}
/**
 * 欧拉角对象波纹调整算法（Euler Angle Object Ripple Adjust）
 *
 * 基于普通波纹调整，支持欧拉角对象的批量平滑修改，但不再对角度做归一化。
 * 主要提供差值计算和衰减分布能力，保留原始角度范围（可能超过±180°）。
 *
 * 应用场景：
 * - 机器人关节角度的平滑调整
 * - 欧拉角姿态的连续编辑
 * - 旋转动画的关键帧调整
 * - 角度序列的局部修改
 * - BVH动作数据的角度调整
 *
 * 影响模式说明：
 * - 模式0（完全变化）：受影响的帧应用完整的角度变化，无衰减
 * - 模式1（衰减变化）：使用Hann窗函数或距离衰减
 * - 模式2（无影响）：不对相应方向的帧进行任何修改
 *
 * @param arr 原始欧拉角对象数组，每个对象包含{x, y, z}属性（度数）
 * @param index 调整的中心索引
 * @param toValue 目标欧拉角对象{x, y, z}（度数）
 * @param prevCount 向前影响的帧数（0=无影响，-1=影响到开头）
 * @param nextCount 向后影响的帧数（0=无影响，-1=影响到结尾）
 * @param prevInfluenceMode 前面帧的影响模式（0=完全变化无衰减，1=使用衰减算法，2=无影响）
 * @param nextInfluenceMode 后面帧的影响模式（0=完全变化无衰减，1=使用衰减算法，2=无影响）
 * @returns 调整后的欧拉角对象数组
 */
export function rippleAdjustEulerObject(
  arr: ReadonlyArray<{ x: number; y: number; z: number }>,
  index: number,
  toValue: { x: number; y: number; z: number },
  prevCount: number = 0,
  nextCount: number = 0,
  prevInfluenceMode: number = 1,
  nextInfluenceMode: number = 1
): { x: number; y: number; z: number }[] {
  const n = arr.length
  if (n === 0) return []
  const idx = Math.min(Math.max(0, Math.floor(index)), n - 1)
  const out = arr.map(item => ({ ...item })) // 深拷贝对象数组

  // 计算每个轴的变化量（直接差值，不做归一化）
  const currentValue = arr[idx] ?? { x: 0, y: 0, z: 0 }
  const deltaX = toValue.x - currentValue.x
  const deltaY = toValue.y - currentValue.y
  const deltaZ = toValue.z - currentValue.z

  // 应用目标值到中心点
  out[idx] = {
    x: toValue.x,
    y: toValue.y,
    z: toValue.z,
  }

  // Hann窗函数
  const hann = (d: number, count: number) => {
    if (count <= 0) return 0
    if (d <= 0) return 1
    if (d >= count) return 0
    return 0.5 * (1 + Math.cos(Math.PI * (d / count)))
  }

  // 向前影响
  if (prevInfluenceMode !== 2 && prevCount !== 0) {
    if (prevInfluenceMode === 0) {
      // 影响到开头的所有帧
      for (let i = 0; i < idx; i++) {
        const current = arr[i] ?? { x: 0, y: 0, z: 0 }
        if (prevInfluenceMode === 0) {
          // 模式0：完全变化，无衰减
          out[i] = {
            x: current.x + deltaX,
            y: current.y + deltaY,
            z: current.z + deltaZ,
          }
        } else if (prevInfluenceMode === 1) {
          // 模式1：使用衰减算法（对于-1的情况，我们可以使用距离作为衰减因子）
          const distance = idx - i
          const w = 1 / (1 + distance * 0.1) // 简单的距离衰减
          out[i] = {
            x: current.x + deltaX * w,
            y: current.y + deltaY * w,
            z: current.z + deltaZ * w,
          }
        }
      }
    } else if (prevCount > 0) {
      // 影响指定数量的帧
      const maxSpan = Math.min(prevCount, idx)
      for (let d = 1; d <= maxSpan; d++) {
        const i = idx - d
        const current = arr[i] ?? { x: 0, y: 0, z: 0 }
        if (prevInfluenceMode === 0) {
          // 模式0：完全变化，无衰减
          out[i] = {
            x: current.x + deltaX,
            y: current.y + deltaY,
            z: current.z + deltaZ,
          }
        } else if (prevInfluenceMode === 1) {
          // 模式1：使用Hann窗函数衰减
          const w = hann(d, prevCount)
          out[i] = {
            x: current.x + deltaX * w,
            y: current.y + deltaY * w,
            z: current.z + deltaZ * w,
          }
        }
      }
    }
  }

  // 向后影响
  const rightAvail = n - 1 - idx
  if (nextInfluenceMode !== 2 && nextCount !== 0) {
    if (nextInfluenceMode === 0) {
      // 影响到结尾的所有帧
      for (let i = idx + 1; i < n; i++) {
        const current = arr[i] ?? { x: 0, y: 0, z: 0 }
        if (nextInfluenceMode === 0) {
          // 模式0：完全变化，无衰减
          out[i] = {
            x: current.x + deltaX,
            y: current.y + deltaY,
            z: current.z + deltaZ,
          }
        } else if (nextInfluenceMode === 1) {
          // 模式1：使用衰减算法（对于-1的情况，我们可以使用距离作为衰减因子）
          const distance = i - idx
          const w = 1 / (1 + distance * 0.1) // 简单的距离衰减
          out[i] = {
            x: current.x + deltaX * w,
            y: current.y + deltaY * w,
            z: current.z + deltaZ * w,
          }
        }
      }
    } else if (nextCount > 0) {
      // 影响指定数量的帧
      const maxSpan = Math.min(nextCount, rightAvail)
      for (let d = 1; d <= maxSpan; d++) {
        const i = idx + d
        const current = arr[i] ?? { x: 0, y: 0, z: 0 }
        if (nextInfluenceMode === 0) {
          // 模式0：完全变化，无衰减
          out[i] = {
            x: current.x + deltaX,
            y: current.y + deltaY,
            z: current.z + deltaZ,
          }
        } else if (nextInfluenceMode === 1) {
          // 模式1：使用Hann窗函数衰减
          const w = hann(d, nextCount)
          out[i] = {
            x: current.x + deltaX * w,
            y: current.y + deltaY * w,
            z: current.z + deltaZ * w,
          }
        }
      }
    }
  }

  return out
}
/**
 * 动作帧数据结构
 *
 * 定义单个动作帧的标准数据格式，包含位置和姿态信息。
 * 这是动作编辑器中处理3D空间变换的基础数据结构。
 */
export interface IFrame {
  position: { x: number; y: number; z: number }
  quaternion: { x: number; y: number; z: number; w: number }
}

/**
 * 四元数数据结构
 *
 * 标准的四元数表示，用于3D旋转计算。
 * 四元数是表示3D旋转最稳定和高效的数学工具。
 */
export interface IQuater {
  x: number
  y: number
  z: number
  w: number
}

/**
 * 路径变换算法
 *
 * 这是四元数球路径重定向功能的核心算法，实现动作路径的3D空间变换。
 * 当用户调整机器人的姿态时，后续的动作路径会相应地进行空间变换。
 *
 * 变换原理：
 * 1. 计算姿态差异：从起始姿态到目标姿态的四元数差
 * 2. 位置变换：以第一帧为中心，对所有位置进行旋转变换
 * 3. 姿态变换：对所有帧的姿态应用相同的旋转差异
 * 4. 保持相对关系：变换后的路径保持原有的相对空间关系
 *
 * 技术特点：
 * - 使用四元数避免万向锁问题
 * - 以第一帧为变换中心，保持路径的连续性
 * - 同时变换位置和姿态，确保完整的空间变换
 * - 保持帧间的相对关系不变
 *
 * 应用场景：
 * - 四元数球的路径重定向预览
 * - 动作序列的空间调整
 * - 机器人姿态的批量修正
 * - 动作数据的空间对齐
 *
 * 这种变换让用户可以直观地预览姿态调整对整个动作序列的影响。
 *
 * @param frames 原始动作帧序列
 * @param qStartObj 起始姿态四元数
 * @param qNowObj 目标姿态四元数
 * @returns 变换后的动作帧序列
 */
export function transformPath(frames: IFrame[], qStartObj: IQuater, qNowObj: IQuater): IFrame[] {
  if (frames.length === 0) return []
  const qStart = new THREE.Quaternion(qStartObj.x, qStartObj.y, qStartObj.z, qStartObj.w)
  const qNow = new THREE.Quaternion(qNowObj.x, qNowObj.y, qNowObj.z, qNowObj.w)
  const qDiff = qNow.clone().multiply(qStart.clone().invert())
  const center = new THREE.Vector3(frames[0].position.x, frames[0].position.y, frames[0].position.z)
  return frames.map(frame => {
    const pos = new THREE.Vector3(frame.position.x, frame.position.y, frame.position.z)
    const quat = new THREE.Quaternion(
      frame.quaternion.x,
      frame.quaternion.y,
      frame.quaternion.z,
      frame.quaternion.w
    )
    pos.sub(center)
    pos.applyQuaternion(qDiff)
    pos.add(center)
    quat.premultiply(qDiff)
    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
    }
  })
}

/**
 * 字符串数据JSON文件保存器
 *
 * 将字符串内容保存为JSON格式文件并自动下载。
 * 这是动作编辑器导出功能的基础工具。
 *
 * 保存流程：
 * 1. 将字符串内容包装为JSON格式
 * 2. 创建Blob对象用于文件下载
 * 3. 生成临时下载链接
 * 4. 自动触发下载并清理资源
 *
 * 技术特点：
 * - 自动JSON格式化（2空格缩进）
 * - 浏览器兼容的下载机制
 * - 自动资源清理，避免内存泄漏
 * - 标准的JSON MIME类型
 *
 * 应用场景：
 * - 动作数据的导出保存
 * - 配置文件的下载
 * - 用户数据的备份
 * - 调试信息的导出
 *
 * @param content 要保存的字符串内容
 * @param filename 文件名（不含扩展名）
 */
export function saveStringAsJSON(content: string, filename: string): void {
  const data: string = content
  const jsonString: string = JSON.stringify(data, null, 2)
  const blob: Blob = new Blob([jsonString], { type: 'application/json' })
  const link: HTMLAnchorElement = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * URDF查看器初始化系统
 *
 * 这是动作编辑器3D渲染系统的核心初始化函数，负责设置URDF查看器的完整功能。
 * 包含自定义元素注册、多格式模型加载器、视觉样式配置和交互系统设置。
 *
 * 初始化流程：
 * 1. 自定义元素注册：注册urdf-viewer Web组件
 * 2. 查看器获取：获取页面中的查看器实例
 * 3. 样式配置：应用专业的视觉效果设置
 * 4. 交互设置：配置悬停高亮和点击响应
 * 5. 加载器配置：设置多格式3D模型加载支持
 * 6. 相机设置：配置默认的观察视角
 *
 * 支持的3D模型格式：
 * - GLTF/GLB：现代标准格式，支持动画和材质
 * - OBJ：经典格式，广泛兼容
 * - DAE（Collada）：支持复杂场景和动画
 * - STL：3D打印常用格式，自动添加材质
 *
 * 视觉增强特性：
 * - 专业的渲染质量设置
 * - 高质量阴影效果
 * - 优化的光照配置
 * - 交互式悬停高亮
 *
 * 技术特点：
 * - 异步初始化，避免阻塞页面加载
 * - 错误容错处理，确保系统稳定性
 * - 多格式加载器，支持各种3D模型
 * - 自动样式配置，提供一致的视觉体验
 *
 * 这个初始化系统为动作编辑器提供了完整的3D可视化基础。
 */
export function init(): void {
  if (!customElements.get('urdf-viewer')) {
    customElements.define('urdf-viewer', URDFManipulator as any)
  }
  const urdfViewer = document.querySelector('urdf-viewer') as any
  if (!urdfViewer) return

  try {
    applyURDFViewerStyle(urdfViewer)
  } catch { }

  try {
    setupHoverHighlight(urdfViewer)
  } catch { }

  document.addEventListener('WebComponentsReady', () => {
    urdfViewer.loadMeshFunc = (path: string, manager: any, done: (obj: any, err?: any) => void) => {
      const fileExtension = path.split(/\./g).pop()?.toLowerCase()
      switch (fileExtension) {
        case 'gltf':
        case 'glb':
          new GLTFLoader(manager).load(
            path,
            (loadedModel: any) => done(loadedModel.scene),
            undefined,
            (loadError: any) => done(null, loadError)
          )
          break
        case 'obj':
          new OBJLoader(manager).load(
            path,
            (loadedModel: any) => done(loadedModel),
            undefined,
            (loadError: any) => done(null, loadError)
          )
          break
        case 'dae':
          new ColladaLoader(manager).load(
            path,
            (loadedModel: any) => done(loadedModel.scene),
            undefined,
            (loadError: any) => done(null, loadError)
          )
          break
        case 'stl':
          new STLLoader(manager).load(
            path,
            (loadedModel: any) => {
              const meshMaterial = new THREE.MeshPhongMaterial()
              const stlMesh = new THREE.Mesh(loadedModel, meshMaterial)
              done(stlMesh)
            },
            undefined,
            (loadError: any) => done(null, loadError)
          )
          break
        default:
          done(null, new Error('Unsupported mesh format'))
      }
    }

    try {
      applyURDFViewerStyle(urdfViewer)
    } catch { }

    const onURDFProcessed = () => {
      try {
        setupHoverHighlight(urdfViewer)
        // 修复相机控制问题
        fixCameraControls(urdfViewer)
      } catch { }
    }
    urdfViewer.addEventListener?.('urdf-processed', onURDFProcessed)
    if (/javascript\/example\/bundle/i.test((window as any).location)) {
      urdfViewer.package = '../../../urdf'
    }

    // 优化初始相机位置和控制器设置
    if (urdfViewer?.camera?.position?.set) {
      urdfViewer.camera.position.set(2, 1, -1)  // 使用与URDFViewer.vue相同的初始位置
    }

    // 立即修复相机控制（在URDF加载前）
    try {
      fixCameraControls(urdfViewer)
    } catch { }
  })
}

/**
 * 零值数组生成器
 *
 * 创建指定长度的零值数组，用于数据初始化和重置操作。
 * 这是动作编辑器中常用的数据初始化工具。
 *
 * 应用场景：
 * - 关节角度数组的初始化
 * - 动作数据的重置
 * - 临时数据缓冲区的创建
 * - 默认值的批量设置
 *
 * @param len 数组长度
 * @returns 包含指定数量零值的数组
 */
export function getZeroArr(len: number): number[] {
  return Array.from({ length: len }, () => 0)
}

/**
 * 动作编辑器API接口定义
 *
 * 定义了动作编辑器中使用的所有核心数据结构和接口。
 * 这些接口为3D渲染、动作数据处理和机器人控制提供了统一的类型定义。
 */

/**
 * 3D向量接口
 *
 * 标准的3D空间坐标表示，用于位置、方向等空间计算。
 */
export interface Vector3Like {
  x: number
  y: number
  z: number
}

/**
 * 四元数接口
 *
 * 标准的四元数表示，用于3D旋转计算。
 * 四元数避免了万向锁问题，是3D旋转的最佳表示方法。
 */
export interface QuaternionLike {
  x: number
  y: number
  z: number
  w: number
}

/**
 * 机器人关节接口
 *
 * 定义单个关节的状态和物理限制。
 * 包含当前角度和可选的运动范围限制。
 */
export interface Joint {
  angle: number
  limit?: { upper: number; lower: number }
}

/**
 * 关节映射类型
 *
 * 将关节名称映射到关节对象的数据结构。
 * 用于管理机器人的所有关节状态。
 */
export type JointsMap = Record<string, Joint>

/**
 * 机器人对象接口
 *
 * 定义机器人在3D空间中的完整状态。
 * 包含位置、姿态和所有关节的状态信息。
 */
export interface RobotObject {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  joints: JointsMap
}

/**
 * 查看器控制接口
 *
 * 定义3D查看器的相机控制功能。
 * 提供目标点设置和更新方法。
 */
export interface ViewerControls {
  target: THREE.Vector3
  update: () => void
}

/**
 * 3D查看器接口
 *
 * 定义完整的3D查看器功能，包含渲染器、场景、相机和机器人控制。
 * 这是动作编辑器3D可视化的核心接口。
 */
export interface Viewer {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
  controls: ViewerControls
  robot: RobotObject
  setJointValue?: (jointName: string, angleRadians: number) => boolean | void
  setJointValues?: (jointAngles: Record<string, number>) => boolean | void
  setTransparent?: (toTransparent: boolean) => void
}

/**
 * 动作JSON数据接口
 *
 * 定义原始动作数据的标准格式。
 * 包含自由度名称列表和对应的数值数据矩阵。
 */
interface BVHMetadata {
  jointNames: string[]
  parentIndices: number[]
  offsets: number[][]
  rotationOrders: string[]
  positionScale: number
  nameToIndex: Record<string, number>
  rootIndex: number
}

/**
 * BVH关节全局欧拉角计算器
 * 
 * 计算从根骨骼到指定关节的累积旋转（全局旋转）
 * 
 * @param jointName 关节名称
 * @param frameData 当前帧数据
 * @param metadata BVH元数据（包含父子关系）
 * @returns 全局欧拉角 {x, y, z} 或 null
 */
export function calculateBVHJointGlobalEuler(
  jointName: string,
  frameData: ParsedFrame,
  metadata: BVHMetadata
): { x: number; y: number; z: number } | null {
  if (!metadata || !metadata.nameToIndex || !metadata.parentIndices) {
    return null
  }

  const jointIndex = metadata.nameToIndex[jointName]
  if (jointIndex === undefined) {
    return null
  }

  // 收集从根到当前关节的路径
  const pathIndices: number[] = []
  let currentIndex = jointIndex
  while (currentIndex !== -1) {
    pathIndices.unshift(currentIndex)
    const parentIndex = metadata.parentIndices[currentIndex]
    currentIndex = parentIndex
  }

  // 累积旋转（使用四元数避免万向锁）
  let accumulatedQuat = new THREE.Quaternion()

  for (const index of pathIndices) {
    const jointNameAtIndex = metadata.jointNames[index]
    const rotationOrder = metadata.rotationOrders?.[index] || 'XYZ'

    // 获取局部欧拉角
    const localX = frameData[`${jointNameAtIndex}_x`] || 0
    const localY = frameData[`${jointNameAtIndex}_y`] || 0
    const localZ = frameData[`${jointNameAtIndex}_z`] || 0

    // 根据旋转顺序逐轴应用旋转（与BVH解析器保持一致）
    const localQuat = new THREE.Quaternion()
    for (let i = 0; i < rotationOrder.length; i++) {
      const axis = rotationOrder[i].toUpperCase()
      const angleDeg = axis === 'X' ? localX : axis === 'Y' ? localY : localZ
      const angleRad = (angleDeg * Math.PI) / 180
      const axisVector = axis === 'X' ? new THREE.Vector3(1, 0, 0) :
        axis === 'Y' ? new THREE.Vector3(0, 1, 0) :
          new THREE.Vector3(0, 0, 1)
      const axisQuat = new THREE.Quaternion().setFromAxisAngle(axisVector, angleRad)
      localQuat.multiply(axisQuat)
    }

    // 累积旋转
    accumulatedQuat.multiply(localQuat)
  }

  // 将累积的四元数转换为欧拉角
  const euler = new THREE.Euler().setFromQuaternion(accumulatedQuat, 'XYZ')
  return {
    x: (euler.x * 180) / Math.PI,
    y: (euler.y * 180) / Math.PI,
    z: (euler.z * 180) / Math.PI
  }
}
/**
 * BVH关节局部欧拉角反算器
 * 
 * 从全局欧拉角反算出局部欧拉角（相对于父关节）
 * 
 * @param jointName 关节名称
 * @param globalEuler 全局欧拉角 {x, y, z}（度数）
 * @param frameData 当前帧数据
 * @param metadata BVH元数据
 * @returns 局部欧拉角 {x, y, z} 或 null
 */
export function calculateBVHJointLocalEuler(
  jointName: string,
  globalEuler: { x: number; y: number; z: number },
  frameData: ParsedFrame,
  metadata: BVHMetadata
): { x: number; y: number; z: number } | null {
  if (!metadata || !metadata.nameToIndex || !metadata.parentIndices) {
    return null
  }

  const jointIndex = metadata.nameToIndex[jointName]
  if (jointIndex === undefined) {
    return null
  }

  // 将全局欧拉角转换为四元数
  const globalQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      (globalEuler.x * Math.PI) / 180,
      (globalEuler.y * Math.PI) / 180,
      (globalEuler.z * Math.PI) / 180,
      'XYZ'
    )
  )

  // 计算父链的累积旋转
  const pathIndices: number[] = []
  let currentIndex = jointIndex
  while (currentIndex !== -1) {
    pathIndices.unshift(currentIndex)
    const parentIndex = metadata.parentIndices[currentIndex]
    currentIndex = parentIndex
  }

  // 累积父链的旋转（不包括当前关节）
  let parentAccumulatedQuat = new THREE.Quaternion()
  for (let i = 0; i < pathIndices.length - 1; i++) {
    const index = pathIndices[i]
    const jointNameAtIndex = metadata.jointNames[index]
    const rotationOrder = metadata.rotationOrders?.[index] || 'XYZ'

    const localX = frameData[`${jointNameAtIndex}_x`] || 0
    const localY = frameData[`${jointNameAtIndex}_y`] || 0
    const localZ = frameData[`${jointNameAtIndex}_z`] || 0

    const localQuat = new THREE.Quaternion()
    for (let j = 0; j < rotationOrder.length; j++) {
      const axis = rotationOrder[j].toUpperCase()
      const angleDeg = axis === 'X' ? localX : axis === 'Y' ? localY : localZ
      const angleRad = (angleDeg * Math.PI) / 180
      const axisVector = axis === 'X' ? new THREE.Vector3(1, 0, 0) :
        axis === 'Y' ? new THREE.Vector3(0, 1, 0) :
          new THREE.Vector3(0, 0, 1)
      const axisQuat = new THREE.Quaternion().setFromAxisAngle(axisVector, angleRad)
      localQuat.multiply(axisQuat)
    }

    parentAccumulatedQuat.multiply(localQuat)
  }

  // 计算局部旋转: local = parent^-1 * global
  const localQuat = parentAccumulatedQuat.clone().invert().multiply(globalQuat)

  // 获取当前关节的旋转顺序
  const rotationOrder = (metadata.rotationOrders?.[jointIndex] || 'XYZ') as THREE.EulerOrder

  // 将四元数转换为欧拉角（使用关节的旋转顺序）
  const euler = new THREE.Euler().setFromQuaternion(localQuat, rotationOrder)

  return {
    x: (euler.x * 180) / Math.PI,
    y: (euler.y * 180) / Math.PI,
    z: (euler.z * 180) / Math.PI
  }
}

export interface MotionJSON {
  dof_names: string[]
  data: number[][]
  joint_names?: string[]
  [key: string]: unknown
}
/**
 * 解析后的动作帧类型
 *
 * 将原始数据矩阵解析为键值对格式的单帧数据。
 * 便于按字段名访问和修改数据。
 */
export type ParsedFrame = Record<string, number>

/**
 * 解析后的动作数据类型
 *
 * 将原始动作JSON转换为便于编辑的格式。
 * 用解析后的帧数组替换原始的数据矩阵。
 */
export type ParsedMotion = Omit<MotionJSON, 'data'> & { parsed: ParsedFrame[] }

/**
 * 动作帧数据接口
 *
 * 定义单个动作帧的标准字段结构。
 * 包含全局位置、姿态和所有关节角度。
 */
export interface FrameLike {
  global_x: number
  global_y: number
  global_z: number
  quater_w: number
  quater_x: number
  quater_y: number
  quater_z: number
  [jointName: string]: number
}

/**
 * 坐标轴标签类型
 *
 * 用于3D场景中显示坐标轴标签的精灵对象。
 */
type AxisLabel = THREE.Sprite

/**
 * 全局查看器引用
 *
 * 保存当前活动的3D查看器实例，用于全局访问和控制。
 */
let viewerRef: Viewer | null = null
let threeJSAPI: any = null
const tempMarkerPositionBVH = new THREE.Vector3()
const tempBVHRootPosition = new THREE.Vector3()
const tempBVHBoneWorldPosition = new THREE.Vector3()
const tempBVHGridPosition = new THREE.Vector3()
const tempBVHAxesPosition = new THREE.Vector3()

const stripBVHPrefix = (name?: string | null): string => {
  if (typeof name !== 'string') return ''
  const colonIndex = name.lastIndexOf(':')
  return colonIndex >= 0 ? name.slice(colonIndex + 1) : name
}

const normalizeBVHJointName = (name?: string | null): string => {
  const stripped = stripBVHPrefix(name)
  return typeof stripped === 'string'
    ? stripped.toLowerCase().replace(/[^a-z0-9]/g, '')
    : ''
}

const collectBVHNameVariants = (...names: Array<string | null | undefined>): string[] => {
  const variants = new Set<string>()
  names.forEach((rawName) => {
    if (!rawName || typeof rawName !== 'string') return
    variants.add(rawName)
    const stripped = stripBVHPrefix(rawName)
    if (stripped && stripped !== rawName) {
      variants.add(stripped)
    }
  })
  return Array.from(variants)
}

const computeBVHSkeletonMetrics = (): {
  skeleton: THREE.Skeleton | null
  rootPosition: THREE.Vector3
  minY: number
  maxY: number
  height: number
} => {
  const result = {
    skeleton: null as THREE.Skeleton | null,
    rootPosition: tempBVHRootPosition,
    minY: 0,
    maxY: 0,
    height: 0,
  }

  result.rootPosition.set(0, 0, 0)
  let minY = Infinity
  let maxY = -Infinity

  const viewerAny = viewerRef as any
  let skeleton: THREE.Skeleton | null = viewerAny?.skeleton ?? null

  if (!skeleton && viewerAny?.scene) {
    viewerAny.scene.traverse((obj: any) => {
      if (!skeleton && obj.isSkinnedMesh && obj.skeleton) {
        skeleton = obj.skeleton
      }
    })
  }

  if (skeleton && Array.isArray(skeleton.bones) && skeleton.bones.length > 0) {
    result.skeleton = skeleton
    const rootBone = skeleton.bones[0]
    try {
      rootBone.updateWorldMatrix(true, true)
      rootBone.getWorldPosition(result.rootPosition)
    } catch (error) {
      console.warn('[computeBVHSkeletonMetrics] 获取根骨骼世界位置失败', error)
    }

    skeleton.bones.forEach((bone) => {
      try {
        bone.updateWorldMatrix(true, true)
        bone.getWorldPosition(tempBVHBoneWorldPosition)
        minY = Math.min(minY, tempBVHBoneWorldPosition.y)
        maxY = Math.max(maxY, tempBVHBoneWorldPosition.y)
      } catch (error) {
        console.warn('[computeBVHSkeletonMetrics] 采样骨骼位置失败', error)
      }
    })
  }

  if (!Number.isFinite(minY)) minY = 0
  if (!Number.isFinite(maxY)) maxY = 0

  const height = maxY - minY

  result.minY = minY
  result.maxY = maxY
  result.height = Number.isFinite(height) && height > 0 ? height : 1

  return result
}

/**
 * 动作编辑器核心API
 *
 * 这是动作编辑器的统一API接口，提供了3D渲染、机器人控制、相机操作、
 * 数据处理等完整功能。所有的动作编辑操作都通过这个API进行。
 */
export const api = {
  /**
   * 强制渲染刷新器
   *
   * 强制刷新3D场景的渲染，确保所有视觉变化立即生效。
   * 这是解决渲染同步问题的核心方法，特别适用于动态场景更新。
   *
   * 刷新流程：
   * 1. 异步渲染调度：使用requestAnimationFrame确保渲染时机
   * 2. 材质更新：遍历场景中所有对象，标记材质需要更新
   * 3. 控制器更新：刷新相机控制器状态
   * 4. 矩阵更新：强制更新场景的世界变换矩阵
   * 5. 窗口事件：触发resize事件，确保布局正确
   *
   * 应用场景：
   * - 机器人姿态变化后的视觉更新
   * - 材质或纹理修改后的刷新
   * - 场景对象添加/移除后的重绘
   * - 窗口大小变化后的适配
   *
   * 这种多层次的刷新机制确保了3D场景的视觉一致性。
   */
  forceRender(): void {
    // // 对于 BVH 和 URDF，都使用 viewerRef（已在 handleBVHViewerLoaded 中通过 initAPI 设置）
    // if (!viewerRef) return

    // requestAnimationFrame(() => {
    //   if (viewerRef && viewerRef.renderer && viewerRef.scene && viewerRef.camera) {
    //     viewerRef.renderer.render(viewerRef.scene, viewerRef.camera)
    //   }
    // })

    // if (viewerRef.scene) {
    //   viewerRef.scene.traverse((sceneObject: THREE.Object3D) => {
    //     const objectMaterial: any = (sceneObject as any).material
    //     if (objectMaterial) objectMaterial.needsUpdate = true
    //   })
    // }
    // if (viewerRef.controls) viewerRef.controls.update()
    // if (viewerRef.scene) viewerRef.scene.updateMatrixWorld(true)

    // setTimeout(() => {
    //   window.dispatchEvent(new Event('resize'))
    // }, 1)
  },
  /**
   * 3D场景管理模块
   *
   * 提供场景级别的渲染控制和辅助对象管理功能。
   * 包含网格线、坐标轴等可视化辅助工具。
   */
  scene: {
    /**
     * 多次强制渲染器
     *
     * 在短时间内执行多次渲染刷新，确保复杂场景变化的完全生效。
     * 适用于需要多帧才能稳定的渲染场景。
     *
     * @param times 渲染次数，默认3次
     */
    forceRenderMultiple(times: number = 3): void {
      for (let i = 0; i < times; i++)
        setTimeout(() => {
          ; (api as any).forceRender()
        }, i * 50)
    },

    /**
     * 地面网格辅助系统
     *
     * 提供专业的地面网格显示功能，帮助用户判断空间位置和距离。
     * 采用高级渲染技术避免Z-fighting问题，确保视觉效果的专业性。
     *
     * 技术特点：
     * - 深度测试：正确处理与机器人的遮挡关系
     * - 透明渲染：半透明效果不影响其他对象
     * - 多边形偏移：避免与地面的Z-fighting闪烁
     * - 位置微调：轻微抬高避免渲染冲突
     *
     * 网格规格：
     * - 尺寸：50x50单位的正方形区域
     * - 分割：100条网格线，提供精确的空间参考
     * - 透明度：28%，既可见又不干扰主要内容
     *
     * 这种专业级的网格系统为动作编辑提供了准确的空间参考。
     */
    gridHelper: {
      _: (() => {
        const gridHelperObject = new THREE.GridHelper(50, 100)
          ; (gridHelperObject.material as any).depthTest = true
          ; (gridHelperObject.material as any).depthWrite = false
          ; (gridHelperObject.material as any).transparent = true
          ; (gridHelperObject.material as any).opacity = 0.28
          ; (gridHelperObject.material as any).polygonOffset = true
          ; (gridHelperObject.material as any).polygonOffsetFactor = -1
          ; (gridHelperObject.material as any).polygonOffsetUnits = -1
        gridHelperObject.position.y = 0.001
        gridHelperObject.renderOrder = 0
        return gridHelperObject
      })(),
      show: false as boolean,
      set(this: any): void {
        console.log('[gridHelper.set] isBVH:', isBVH, 'threeJSAPI:', !!threeJSAPI)
        if (isBVH) {
          const metrics = computeBVHSkeletonMetrics()
          if (threeJSAPI && threeJSAPI.gridHelper) {
            tempBVHGridPosition.set(metrics.rootPosition.x, metrics.minY, metrics.rootPosition.z)
            threeJSAPI.gridHelper.setVisible(true, tempBVHGridPosition)
            console.log('[gridHelper.set] BVH 网格线已显示', {
              position: {
                x: tempBVHGridPosition.x,
                y: tempBVHGridPosition.y,
                z: tempBVHGridPosition.z,
              }
            })
          } else {
            console.warn('[gridHelper.set] threeJSAPI 或 threeJSAPI.gridHelper 不存在')
          }
          return
        }
        if (!viewerRef) return
        viewerRef.scene.add(this._)
        this.show = true
      },
      remove(this: any): void {
        console.log('[gridHelper.remove] isBVH:', isBVH, 'threeJSAPI:', !!threeJSAPI)
        if (isBVH) {
          if (threeJSAPI && threeJSAPI.gridHelper) {
            threeJSAPI.gridHelper.setVisible(false)
            console.log('[gridHelper.remove] BVH 网格线已隐藏')
          } else {
            console.warn('[gridHelper.remove] threeJSAPI 或 threeJSAPI.gridHelper 不存在')
          }
          return
        }
        if (!viewerRef) return
        viewerRef.scene.remove(this._)
        this.show = false
      },
    },
    /**
     * 坐标轴辅助系统
     *
     * 显示3D空间的坐标轴，帮助用户理解空间方向和机器人的朝向。
     * 包含彩色坐标轴和对应的文字标签。
     *
     * 坐标轴规格：
     * - X轴：红色，长度5单位
     * - Y轴：绿色，长度5单位
     * - Z轴：蓝色，长度5单位
     * - 标签：位于轴端1.2单位处，清晰标识方向
     *
     * 颜色编码遵循国际标准：
     * - 红色X轴：通常表示左右方向
     * - 绿色Y轴：通常表示上下方向
     * - 蓝色Z轴：通常表示前后方向
     *
     * 这种标准化的坐标系显示帮助用户快速理解3D空间的方向关系。
     */
    axesHelper: {
      _: new THREE.AxesHelper(5),
      _x: createAxisLabel('X', new THREE.Vector3(1.2, 0, 0), 0xff0000),
      _y: createAxisLabel('Y', new THREE.Vector3(0, 1.2, 0), 0x00ff00),
      _z: createAxisLabel('Z', new THREE.Vector3(0, 0, 1.2), 0x0000ff),
      show: false as boolean,
      set(this: any): void {
        console.log('[axesHelper.set] isBVH:', isBVH, 'threeJSAPI:', !!threeJSAPI)
        if (isBVH) {
          if (threeJSAPI && threeJSAPI.axesHelper) {
            const metrics = computeBVHSkeletonMetrics()
            useStore((e) => {
              const motionStore = e.useMotionStore()
              const positionScale = motionStore.motionData?.bvhAdapt?.positionScale
              let scale = metrics.height
              if (!(scale > 0) || !Number.isFinite(scale)) {
                if (typeof positionScale === 'number' && positionScale > 0) {
                  scale = positionScale * 10
                } else {
                  scale = 1
                }
              }
              scale = Math.max(scale, 0.5)
              tempBVHAxesPosition.set(metrics.rootPosition.x, metrics.minY, metrics.rootPosition.z)
              threeJSAPI.axesHelper.setVisible(true, scale, tempBVHAxesPosition)
              console.log('[axesHelper.set] BVH 坐标轴已显示', {
                scale,
                height: metrics.height,
                position: {
                  x: tempBVHAxesPosition.x,
                  y: tempBVHAxesPosition.y,
                  z: tempBVHAxesPosition.z,
                }
              })
            })
          } else {
            console.warn('[axesHelper.set] threeJSAPI 或 threeJSAPI.axesHelper 不存在')
          }
          return
        }
        if (!viewerRef) return
        viewerRef.scene.add(this._)
        this.show = true
      },
      remove(this: any): void {
        console.log('[axesHelper.remove] isBVH:', isBVH, 'threeJSAPI:', !!threeJSAPI)
        if (isBVH) {
          if (threeJSAPI && threeJSAPI.axesHelper) {
            threeJSAPI.axesHelper.setVisible(false)
            console.log('[axesHelper.remove] BVH 坐标轴已隐藏')
          } else {
            console.warn('[axesHelper.remove] threeJSAPI 或 threeJSAPI.axesHelper 不存在')
          }
          return
        }
        if (!viewerRef) return
        viewerRef.scene.remove(this._)
        viewerRef.scene.remove(this._x)
        viewerRef.scene.remove(this._y)
        viewerRef.scene.remove(this._z)
        this.show = false
      },
    },
  },
  /**
   * 机器人控制和管理模块
   *
   * 提供完整的机器人操作接口，包括位置控制、关节操作、姿态管理等。
   * 支持URDF和BVH两种机器人格式，自动处理坐标系转换。
   */
  robot: {
    getObject(): RobotObject {
      if (isBVH) {
        return viewerRef?.robot as RobotObject
        console.log('viewerRef', viewerRef)
        const viewerInstance: any = viewerRef ?? null
        const skeleton = viewerInstance?.skeleton ?? null
        const jointsMap: Record<string, Joint> = {}

        // 获取根骨骼的位置和旋转
        let rootPosition = new THREE.Vector3()
        let rootQuaternion = new THREE.Quaternion()

        if (skeleton && Array.isArray(skeleton.bones) && skeleton.bones.length > 0) {
          const createJointEntry = (): Joint => ({
            angle: 0,
            limit: { lower: -180, upper: 180 },
          })
          const registerJoint = (name: string) => {
            if (!name) return
            if (!jointsMap[name]) {
              jointsMap[name] = createJointEntry()
            }
          }
          skeleton.bones.forEach((bone: any, index: number) => {
            const boneName =
              (bone && typeof bone.name === 'string' && bone.name.length > 0)
                ? bone.name
                : `joint_${index}`
            registerJoint(boneName)
              ;['_x', '_y', '_z', '_rx', '_ry', '_rz'].forEach(suffix => {
                registerJoint(`${boneName}${suffix}`)
              })
          })

          // 获取根骨骼的世界位置和旋转
          const rootBone = skeleton.bones[0]
          if (rootBone) {
            rootBone.updateWorldMatrix(true, false)
            rootBone.getWorldPosition(rootPosition)
            rootBone.getWorldQuaternion(rootQuaternion)
          }
        }

        return {
          position: rootPosition,
          quaternion: rootQuaternion,
          joints: jointsMap,
          skeleton,
          clip: viewerInstance?.clip ?? null,
        } as unknown as RobotObject
      }
      return (viewerRef as Viewer).robot
    },

    /**
     * 机器人包围盒可视化系统
     *
     * 提供机器人边界框的显示和管理功能，支持URDF和BVH两种模式的包围盒计算。
     * 包围盒帮助用户理解机器人的空间占用和碰撞边界。
     *
     * 技术特点：
     * - 双模式支持：URDF模式使用标准包围盒，BVH模式基于骨骼计算
     * - 动态更新：机器人姿态变化时自动重新计算包围盒
     * - 颜色定制：支持自定义包围盒颜色
     * - 资源管理：自动处理几何体和材质的创建与销毁
     *
     * BVH模式特殊处理：
     * - 遍历所有骨骼节点计算世界坐标
     * - 处理骨骼矩阵更新和位置获取
     * - 提供默认尺寸作为后备方案
     *
     * 这种智能的包围盒系统为动作编辑提供了重要的空间参考。
     */
    bbox: {
      _helper: null as THREE.Box3Helper | null,
      _lastColor: 0x00ff88 as number,
      set(this: any, color: number = 0x00ff88): void {
        if (!viewerRef || !(viewerRef as any).scene) return
        const viewerInstance: any = viewerRef
        const robotObject: any = (api as any).robot.getObject()
        if (!robotObject) return

        this._lastColor = color

        let boundingBox: THREE.Box3
        if (isBVH) {
          boundingBox = new THREE.Box3()
          try {
            if (robotObject.skeleton && robotObject.skeleton.bones) {
              robotObject.skeleton.bones.forEach((skeletonBone: any) => {
                if (skeletonBone && typeof skeletonBone.updateWorldMatrix === 'function') {
                  skeletonBone.updateWorldMatrix(true, true)
                  const boneWorldPosition = new THREE.Vector3()
                  skeletonBone.getWorldPosition(boneWorldPosition)
                  boundingBox.expandByPoint(boneWorldPosition)
                }
              })
            }
            if (boundingBox.isEmpty()) {
              boundingBox.setFromCenterAndSize(
                new THREE.Vector3(0, 0.85, 0),
                new THREE.Vector3(0.6, 1.7, 0.3)
              )
            }
          } catch (error) {
            console.warn('BVH包围盒计算失败，使用默认值:', error)
            boundingBox.setFromCenterAndSize(
              new THREE.Vector3(0, 0.85, 0),
              new THREE.Vector3(0.6, 1.7, 0.3)
            )
          }
        } else {
          boundingBox = new THREE.Box3().setFromObject(robotObject)
        }

        if (!this._helper) {
          this._helper = new THREE.Box3Helper(boundingBox, color)
          viewerInstance.scene.add(this._helper)
        } else {
          this._helper.box.copy(boundingBox)
          try {
            ; (this._helper.material as any)?.color?.set?.(color)
          } catch { }
          if (!this._helper.parent) viewerInstance.scene.add(this._helper)
        }
        this._helper.visible = true
      },
      /**
       * 包围盒动态更新器
       *
       * 当机器人姿态发生变化时，重新计算并更新包围盒显示。
       * 采用完全重建的策略确保包围盒的准确性。
       *
       * 更新流程：
       * 1. 清理现有包围盒：移除场景对象并释放资源
       * 2. 重新计算边界：根据当前机器人姿态计算新的包围盒
       * 3. 创建新对象：使用相同颜色创建新的包围盒辅助对象
       * 4. 添加到场景：将新包围盒添加到3D场景中
       *
       * 资源管理：
       * - 自动释放几何体和材质资源
       * - 处理数组和单个材质的不同情况
       * - 提供错误容错机制
       *
       * 这种重建式更新确保了包围盒与机器人姿态的完美同步。
       */
      update(this: any): void {
        if (!viewerRef) return
        const viewerInstance: any = viewerRef
        const robotObject: any = (api as any).robot.getObject()
        if (!robotObject) return

        if (this._helper) {
          try {
            viewerInstance.scene.remove(this._helper)
            if (this._helper.geometry) {
              this._helper.geometry.dispose()
            }
            if (this._helper.material) {
              if (Array.isArray(this._helper.material)) {
                this._helper.material.forEach((mat: any) => mat?.dispose?.())
              } else {
                ; (this._helper.material as any)?.dispose?.()
              }
            }
          } catch (error) {
            console.warn('清理包围盒辅助对象失败:', error)
          }
          this._helper = null

          let boundingBox: THREE.Box3
          if (isBVH) {
            boundingBox = new THREE.Box3()
            try {
              if (robotObject.skeleton && robotObject.skeleton.bones) {
                robotObject.skeleton.bones.forEach((skeletonBone: any) => {
                  if (skeletonBone && typeof skeletonBone.updateWorldMatrix === 'function') {
                    skeletonBone.updateWorldMatrix(true, true)
                    const boneWorldPosition = new THREE.Vector3()
                    skeletonBone.getWorldPosition(boneWorldPosition)
                    boundingBox.expandByPoint(boneWorldPosition)
                  }
                })
              }
              if (boundingBox.isEmpty()) {
                boundingBox.setFromCenterAndSize(
                  new THREE.Vector3(0, 0.85, 0),
                  new THREE.Vector3(0.6, 1.7, 0.3)
                )
              }
            } catch (error) {
              console.warn('BVH包围盒更新失败，使用默认值:', error)
              boundingBox.setFromCenterAndSize(
                new THREE.Vector3(0, 0.85, 0),
                new THREE.Vector3(0.6, 1.7, 0.3)
              )
            }
          } else {
            boundingBox = new THREE.Box3().setFromObject(robotObject)
          }

          try {
            const boxColor = this._lastColor || 0x00ff88
            this._helper = new THREE.Box3Helper(boundingBox, boxColor)
            viewerInstance.scene.add(this._helper)
            this._helper.visible = true
          } catch (error) {
            console.error('创建新包围盒辅助对象失败:', error)
          }
        }
      },

      remove(this: any): void {
        if (!this._helper || !viewerRef) return
        const v: any = viewerRef
        try {
          v.scene.remove(this._helper)
            ; (this._helper.geometry as any)?.dispose?.()
          if (Array.isArray(this._helper.material))
            this._helper.material.forEach((m: any) => m?.dispose?.())
          else (this._helper.material as any)?.dispose?.()
        } catch { }
        this._helper = null
      },
    },

    /**
     * 机器人高度计算系统
     *
     * 智能计算机器人的实际高度，支持URDF和BVH两种模式的不同计算方法。
     * 高度信息用于相机距离计算、包围盒尺寸确定等多种场景。
     *
     * 计算方法：
     * - URDF模式：基于包围盒的Y轴范围计算
     * - BVH模式：遍历所有骨骼节点，找到最高和最低点
     *
     * BVH模式特殊处理：
     * - 更新所有骨骼的世界变换矩阵
     * - 获取每个骨骼的世界坐标位置
     * - 计算Y轴方向的最大和最小值
     * - 提供1.7米的默认高度作为后备
     *
     * 这种双模式的高度计算确保了在不同机器人格式下都能获得准确的尺寸信息。
     */
    height: {
      get(): number {
        if (isBVH) {
          try {
            const robotObject = (api as any).robot.getObject()
            if (robotObject && robotObject.skeleton && robotObject.skeleton.bones) {
              let minimumYPosition = Infinity
              let maximumYPosition = -Infinity

              robotObject.skeleton.bones.forEach((skeletonBone: any) => {
                if (skeletonBone && typeof skeletonBone.updateWorldMatrix === 'function') {
                  skeletonBone.updateWorldMatrix(true, true)
                  const boneWorldPosition = new THREE.Vector3()
                  skeletonBone.getWorldPosition(boneWorldPosition)
                  minimumYPosition = Math.min(minimumYPosition, boneWorldPosition.y)
                  maximumYPosition = Math.max(maximumYPosition, boneWorldPosition.y)
                }
              })

              return maximumYPosition - minimumYPosition
            }
            return 1.7
          } catch (error) {
            console.warn('BVH高度计算失败，使用默认值:', error)
            return 1.7
          }
        }

        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return 0
        const boundingBox = new THREE.Box3().setFromObject(robotObject as any)
        return boundingBox.max.y - boundingBox.min.y
      },
    },
    /**
     * 机器人位置控制系统
     *
     * 提供机器人在3D空间中的位置管理，支持URDF和BVH两种坐标系统。
     * 自动处理不同坐标系之间的转换，确保位置操作的一致性。
     *
     * 坐标系转换原理：
     * - URDF坐标系：标准的右手坐标系，Y轴向上
     * - Three.js坐标系：Y轴向上，但与URDF在YZ轴上有差异
     * - 转换公式：URDF(x,y,z) ↔ Three.js(x,z,-y)
     *
     * 功能特点：
     * - 双模式支持：BVH模式直接使用URDF坐标，URDF模式需要转换
     * - 智能转换：自动识别坐标系并进行相应转换
     * - 部分更新：支持只更新X、Y、Z中的部分坐标
     * - 地面接触：提供机器人接触地面的辅助功能
     *
     * 这种统一的位置控制接口简化了不同机器人格式的位置操作。
     */
    position: {
      get(): Vector3Like {
        if (isBVH || 1) {
          return this.getURDF()
        }
        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return { x: 0, y: 0, z: 0 }
        const robotPosition = robotObject.position
        return { x: robotPosition.x, y: robotPosition.z, z: robotPosition.y * -1 }
      },
      set({
        x = undefined,
        y = undefined,
        z = undefined,
      }: {
        x?: number
        y?: number
        z?: number
      }): void {
        if (isBVH || 1) {
          this.setURDF({ x, y, z })
        } else {
          const robotObject = (api as any).robot.getObject()
          if (!robotObject) return
          const robotPosition = (this as any).get()
          robotObject.position.set(
            isNaN(x as any) ? robotPosition.x : (x as number),
            isNaN(z as any) ? robotPosition.z * -1 : (z as number) * -1,
            isNaN(y as any) ? robotPosition.y : (y as number)
          )
        }
      },
      getURDF(): Vector3Like {
        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return { x: 0, y: 0, z: 0 }
        const robotPosition = robotObject.position
        return { x: robotPosition.x, y: robotPosition.y, z: robotPosition.z }
      },
      setURDF({
        x = undefined,
        y = undefined,
        z = undefined,
      }: {
        x?: number
        y?: number
        z?: number
      }): void {
        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return
        const robotPosition = (this as any).get()
        robotObject.position.set(
          isNaN(x as any) ? robotPosition.x : (x as number),
          isNaN(y as any) ? robotPosition.y : (y as number),
          isNaN(z as any) ? robotPosition.z : (z as number)
        )
      },
      touchGround(): void {
        void (api as any).robot.bbox.get()
      },
      urdfToThree({ x, y, z }: Vector3Like): Vector3Like {
        return { x, y: z, z: y * -1 }
      },
      threeToURDF({ x, y, z }: Vector3Like): Vector3Like {
        return { x, y: z * -1, z: y }
      },
    },
    /**
     * 机器人关节控制系统
     *
     * 提供完整的机器人关节操作接口，支持单个关节和批量关节的角度控制。
     * 支持弧度和角度两种单位，提供灵活的关节信息查询和操作功能。
     *
     * 核心功能：
     * - 关节信息查询：获取单个或所有关节的详细信息
     * - 角度控制：支持弧度和角度两种单位的角度设置
     * - 批量操作：支持同时设置多个关节的角度
     * - 状态获取：获取当前所有关节的角度状态
     * - 重置功能：一键将所有关节重置为零位
     *
     * 单位转换：
     * - 内部存储使用弧度制（符合数学标准）
     * - 提供角度制接口（符合用户习惯）
     * - 自动进行弧度与角度的转换
     *
     * 安全特性：
     * - 关节存在性检查：操作前验证关节是否存在
     * - 加载状态检查：确保机器人已正确加载
     * - 错误处理：提供友好的错误提示和默认值
     *
     * 这个系统是动作编辑的核心，为精确的机器人姿态控制提供了基础。
     */
    joint: {
      getSingleInfo(jointName: string) {
        return this.getAll()[jointName]
      },
      getAll(): JointsMap {
        const robotObject = (api as any).robot.getObject()
        if (!robotObject || !robotObject.joints) return {} as JointsMap
        return robotObject.joints
      },
      getNames(): string[] {
        const jointsMap = (this as any).getAll()
        return Object.keys(jointsMap)
      },
      getAngle(jointName: string): number {
        const robotObject = (api as any).robot.getObject()
        if (!robotObject || !robotObject.joints || !robotObject.joints[jointName]) {
          return 0
        }
        return robotObject.joints[jointName].angle
      },
      getAngleDegrees(jointName: string): number {
        return ((this as any).getAngle(jointName) * 180) / Math.PI
      },
      setAngle(jointName: string, angle: number): boolean {
        if (!viewerRef || !viewerRef.setJointValue) {
          console.warn('机器人未加载完成')
          return false
        }
        return !!viewerRef.setJointValue(jointName, angle)
      },
      setAngleDegrees(jointName: string, degrees: number): boolean {
        const radianAngle = (degrees * Math.PI) / 180
        return (this as any).setAngle(jointName, radianAngle)
      },
      setAngles(jointAngles: Record<string, number>): boolean {
        if (!viewerRef || !viewerRef.setJointValues) {
          console.warn('机器人未加载完成')
          return false
        }
        return !!viewerRef.setJointValues(jointAngles)
      },
      setAnglesDegrees(jointAngles: Record<string, number>): boolean {
        const radianAngles: Record<string, number> = {}
        for (const [name, degrees] of Object.entries(jointAngles)) {
          radianAngles[name] = ((degrees as number) * Math.PI) / 180
        }
        return (this as any).setAngles(radianAngles)
      },
      getAllAngles(): Record<string, number> {
        const jointsMap = (this as any).getAll()
        const jointAngles: Record<string, number> = {}
        for (const [name, joint] of Object.entries(jointsMap))
          jointAngles[name] = (joint as Joint).angle
        return jointAngles
      },
      getAllAnglesDegrees(): Record<string, number> {
        const jointAngles = (this as any).getAllAngles()
        const degreeAngles: Record<string, number> = {}
        for (const [name, radians] of Object.entries(jointAngles))
          degreeAngles[name] = ((radians as number) * 180) / Math.PI
        return degreeAngles
      },
      resetAll(): boolean {
        const jointsMap = (this as any).getAll()
        const zeroAngles: Record<string, number> = {}
        for (const name of Object.keys(jointsMap)) zeroAngles[name] = 0
        return (this as any).setAngles(zeroAngles)
      },
    },
    /**
     * 机器人四元数姿态控制系统
     *
     * 管理机器人的旋转姿态，支持URDF和BVH两种坐标系的四元数操作。
     * 提供坐标系间的自动转换，确保姿态控制的一致性和准确性。
     *
     * 四元数优势：
     * - 无万向节锁：避免欧拉角的万向节锁问题
     * - 插值平滑：支持平滑的旋转插值
     * - 计算高效：旋转组合计算效率高
     * - 数值稳定：避免三角函数的数值误差
     *
     * 坐标系转换：
     * - URDF坐标系：机器人标准坐标系
     * - Three.js坐标系：3D渲染坐标系
     * - 转换方法：通过X轴90度旋转进行坐标系转换
     *
     * 功能特点：
     * - 双模式支持：BVH直接使用URDF，URDF需要转换
     * - 智能转换：自动识别输入格式（对象、数组、键值对）
     * - 部分更新：支持只更新四元数的部分分量
     * - 标准化处理：自动进行四元数标准化
     *
     * 这个系统为机器人的精确姿态控制提供了数学基础。
     */
    quater: {
      getURDF(): QuaternionLike {
        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return { x: 0, y: 0, z: 0, w: 1 }
        const quaternion = robotObject.quaternion as THREE.Quaternion
        return { w: quaternion.w, x: quaternion.x, y: quaternion.y, z: quaternion.z }
      },
      setURDF({
        w = undefined,
        x = undefined,
        y = undefined,
        z = undefined,
      }: {
        w?: number
        x?: number
        y?: number
        z?: number
      }): void {
        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return
        robotObject.quaternion.set(x as number, y as number, z as number, w as number)

        // BVH模式：同步更新根关节的欧拉角和四元数到当前帧数据
        if (isBVH && currentBVHMetadata) {
          try {
            const rootIndex = typeof currentBVHMetadata.rootIndex === 'number' ? currentBVHMetadata.rootIndex : 0
            const rootJointName = currentBVHMetadata.jointNames?.[rootIndex]

            if (rootJointName) {
              // 获取旋转顺序
              const rotationOrder = (currentBVHMetadata.rotationOrders?.[rootIndex] ?? 'XYZ') as THREE.EulerOrder

              // 将四元数转换为欧拉角
              const euler = new THREE.Euler().setFromQuaternion(robotObject.quaternion, rotationOrder)

              // 转换为度数
              const xDeg = THREE.MathUtils.radToDeg(euler.x)
              const yDeg = THREE.MathUtils.radToDeg(euler.y)
              const zDeg = THREE.MathUtils.radToDeg(euler.z)

              // 动态导入 motionStore 来更新当前帧数据
              import('../store/motionEditor').then(({ useMotionStore }) => {
                const motionStore = useMotionStore()

                // 更新根关节的欧拉角
                motionStore.setCurrentFrameFieldValue(`${rootJointName}_x`, xDeg)
                motionStore.setCurrentFrameFieldValue(`${rootJointName}_y`, yDeg)
                motionStore.setCurrentFrameFieldValue(`${rootJointName}_z`, zDeg)

                // 更新四元数
                motionStore.setCurrentFrameFieldValue('quater_x', robotObject.quaternion.x)
                motionStore.setCurrentFrameFieldValue('quater_y', robotObject.quaternion.y)
                motionStore.setCurrentFrameFieldValue('quater_z', robotObject.quaternion.z)
                motionStore.setCurrentFrameFieldValue('quater_w', robotObject.quaternion.w)
              }).catch(err => {
                console.error('更新BVH根关节欧拉角失败:', err)
              })
            }
          } catch (error) {
            console.error('BVH姿态球更新根关节失败:', error)
          }
        }
      },
      get(): QuaternionLike {
        if (isBVH || 1) {
          return this.getURDF()
        }
        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return { x: 0, y: 0, z: 0, w: 1 }
        const robotQuaternion = robotObject.quaternion as THREE.Quaternion
        const threeQuaternion = (this as any).urdfQuatToThree(robotQuaternion)
        return {
          w: threeQuaternion.w,
          x: threeQuaternion.x,
          y: threeQuaternion.y,
          z: threeQuaternion.z,
        }
      },
      set({
        x = undefined,
        y = undefined,
        z = undefined,
        w = undefined,
      }: {
        x?: number
        y?: number
        z?: number
        w?: number
      }): void {
        if (isBVH || 1) {
          this.setURDF({ x, y, z, w })
          return
        }
        const robotObject = (api as any).robot.getObject()
        if (!robotObject) return
        const urdfQuaternion = (this as any).threeQuatToUrdf({ x, y, z, w })
        robotObject.quaternion.set(
          urdfQuaternion.x,
          urdfQuaternion.y,
          urdfQuaternion.z,
          urdfQuaternion.w
        )
      },
      threeQuatToUrdf(threeQuaternion: QuaternionLike | THREE.Quaternion): QuaternionLike {
        const quaternion = (threeQuaternion as any).isQuaternion
          ? (threeQuaternion as THREE.Quaternion).clone().normalize()
          : new THREE.Quaternion(
            (threeQuaternion as QuaternionLike).x,
            (threeQuaternion as QuaternionLike).y,
            (threeQuaternion as QuaternionLike).z,
            (threeQuaternion as QuaternionLike).w
          ).normalize()
        const Rx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
        const urdfQuaternion = Rx.multiply(quaternion).normalize()
        return {
          w: urdfQuaternion.w,
          x: urdfQuaternion.x,
          y: urdfQuaternion.y,
          z: urdfQuaternion.z,
        }
      },
      urdfQuatToThree(
        urdfQuaternion: QuaternionLike | number[] | { [key: string]: number }
      ): THREE.Quaternion {
        let x: number, y: number, z: number, w: number
        if (Array.isArray(urdfQuaternion)) {
          ;[x, y, z, w] = urdfQuaternion as number[]
        } else if ('w' in urdfQuaternion) {
          ; ({ x, y, z, w } = urdfQuaternion as QuaternionLike)
        } else {
          ; ({ x, y, z, w } = urdfQuaternion as any)
        }
        const quaternion = new THREE.Quaternion(x, y, z, w).normalize()
        const Rx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
        const threeQuaternion = Rx.multiply(quaternion).normalize()
        return threeQuaternion
      },
    },
    /**
     * 机器人帧数据设置器
     *
     * 将完整的帧数据应用到机器人，包括全局位置、姿态和所有关节角度。
     * 支持URDF和BVH两种机器人格式的帧数据设置。
     *
     * 帧数据结构：
     * - 全局位置：global_x, global_y, global_z
     * - 全局姿态：quater_w, quater_x, quater_y, quater_z
     * - 关节角度：各个关节的角度值
     *
     * 设置流程：
     * 1. 根据机器人类型选择设置方法
     * 2. 设置全局位置和姿态
     * 3. 遍历设置所有关节角度
     * 4. 更新相关的可视化元素
     *
     * 兼容性处理：
     * - BVH模式：直接调用ThreeJS API
     * - URDF模式：分别设置位置、姿态和关节
     * - 自动过滤：跳过全局和姿态相关的键
     *
     * 这个函数是动画播放的核心，确保机器人状态与帧数据完全同步。
     */
    setFrame(frame: FrameLike): void {
      if (isBVH || 1) {
        threeJSAPI.setFrame(frame)
      } else {
        ; (api as any).robot.position.setURDF({
          x: frame.global_x,
          y: frame.global_y,
          z: frame.global_z,
        })
          ; (api as any).robot.quater.setURDF({
            w: frame.quater_w,
            x: frame.quater_x,
            y: frame.quater_y,
            z: frame.quater_z,
          })
        for (const fieldName of Object.keys(frame)) {
          const fieldValue = (frame as any)[fieldName]
          if (
            fieldName.indexOf('global') === -1 &&
            fieldName.indexOf('orient') === -1 &&
            fieldName.indexOf('quater') === -1
          ) {
            ; (api as any).robot.joint.setAngle(fieldName, fieldValue)
          }
        }
      }
      try {
        ; (api as any).robot.hide.update()
          ; (api as any).robot.bbox.update?.()
      } catch (e) { console.log(e) }
    },

    getJointObject(jointName: string): Joint {
      if (isBVH) {
        return {
          angle: 0,
          limit: { lower: Number.NEGATIVE_INFINITY, upper: Number.POSITIVE_INFINITY }
        }
      }
      const robotObject: any = (this as any).getObject?.()
      if (!robotObject || !robotObject.joints || !robotObject.joints[jointName]) {
        return {
          angle: 0,
          limit: { lower: Number.NEGATIVE_INFINITY, upper: Number.POSITIVE_INFINITY }
        }
      }
      return robotObject.joints[jointName]
    },
    /**
     * 关节空间位置和朝向计算系统
     *
     * 计算指定关节在3D空间坐标系中的位置和朝向，支持URDF和BVH两种机器人格式。
     * 根据机器人类型返回不同格式的朝向数据：URDF使用四元数，BVH使用欧拉角。
     *
     * 核心功能：
     * - 位置计算：获取关节在世界坐标系中的3D位置
     * - 朝向计算：计算关节的空间朝向（四元数或欧拉角）
     * - 双格式支持：自动识别机器人类型并使用相应的计算方法
     * - 帧数据集成：基于完整帧数据进行精确计算
     *
     * URDF模式特点：
     * - 基于关节对象的世界变换矩阵
     * - 返回四元数格式的朝向数据
     * - 支持复杂的关节层次结构
     * - 精确的变换链计算
     *
     * BVH模式特点：
     * - 基于骨骼系统的世界坐标
     * - 返回欧拉角格式的朝向数据
     * - 支持骨骼动画的实时计算
     * - 自动处理骨骼层次关系
     *
     * 应用场景：
     * - 动作分析：分析关节在空间中的运动轨迹
     * - 碰撞检测：获取关节的精确空间位置
     * - 可视化：为关节添加空间标记或辅助线
     * - 数据导出：导出关节的空间运动数据
     *
     * 这个系统为精确的关节空间分析提供了统一的接口。
     *
     * 使用示例：
     * ```typescript
     * // 获取所有可用的关节名称
     * const jointNames = api.robot.jointPosition.getAvailableJointNames()
     * console.log('可用关节:', jointNames)
     *
     * // 获取特定关节在某一帧的位置和朝向（默认使用直接计算，不修改机器人状态）
     * const frameData = {
     *   global_x: 0, global_y: 0, global_z: 0,
     *   quater_w: 1, quater_x: 0, quater_y: 0, quater_z: 0,
     *   joint1: 0.5, joint2: -0.3, // ... 其他关节角度
     * }
     * 
     * // 方法1：直接数学计算（推荐，不修改机器人显示状态）
     * const jointInfo = api.robot.jointPosition.get('joint1', frameData, true)
     * 
     * // 方法2：传统方法（会临时修改机器人状态）
     * const jointInfo2 = api.robot.jointPosition.get('joint1', frameData, false)
     * 
     * if (jointInfo) {
     *   console.log('关节位置:', jointInfo.position)
     *   console.log('关节朝向:', jointInfo.orientation)
     *   // URDF机器人: orientation 是 QuaternionLike {w, x, y, z}
     *   // BVH机器人: orientation 是 {x, y, z} 欧拉角（度）
     * }
     * 
     * // 批量计算多个关节（高效，不影响显示）
     * const joints = ['joint1', 'joint2', 'joint3']
     * const jointPositions = joints.map(jointName => ({
     *   name: jointName,
     *   ...api.robot.jointPosition.get(jointName, frameData, true)
     * }))
     * ```
     */
    jointPosition: {
      /**
       * 获取关节的空间位置和朝向
       *
       * @param jointName 关节名称
       * @param frameData 完整的帧数据，包含全局位置、姿态和所有关节角度
       * @param useDirectCalculation 是否使用直接数学计算（不修改机器人状态），默认为true
       * @returns 包含位置和朝向的对象，朝向格式根据机器人类型而定
       */
      get(
        jointName: string,
        frameData: FrameLike,
        useDirectCalculation: boolean = true
      ): {
        position: { x: number; y: number; z: number }
        orientation: QuaternionLike | { x: number; y: number; z: number }
      } | null {
        try {
          if (!viewerRef || !frameData) {
            console.warn('机器人未加载或帧数据无效')
            return null
          }

          if (useDirectCalculation) {
            // 使用直接数学计算，不修改机器人状态
            if (isBVH) {
              if (currentBVHMetadata) {
                const pureResult = this._calculateBVHJointPositionPure(jointName, frameData, currentBVHMetadata)
                if (pureResult) return pureResult
              }
              return this._calculateBVHJointPositionDirect(jointName, frameData)
            } else {
              const re = this._calculateURDFJointPositionDirect(jointName, frameData)
              if (re && re.position) {
                re.position = api.robot.position.urdfToThree(re.position)
              }
              return re
            }
          } else {
            // 传统方法：应用帧数据到机器人后计算
            ; (api as any).robot.setFrame(frameData)
            if (isBVH) {
              return this._getBVHJointPosition(jointName, frameData)
            } else {
              return this._getURDFJointPosition(jointName, frameData)
            }
          }
        } catch (error) {
          console.error(`获取关节 "${jointName}" 位置失败:`, error)
          return null
        }
      },

      /**
       * 计算URDF机器人关节的空间位置和四元数朝向
       */
      _getURDFJointPosition(
        jointName: string,
        frameData: FrameLike
      ): {
        position: { x: number; y: number; z: number }
        orientation: QuaternionLike
      } | null {
        try {
          const robotObject = (api as any).robot.getObject()
          if (!robotObject || !robotObject.joints || !robotObject.joints[jointName]) {
            console.warn(`URDF关节 "${jointName}" 不存在`)
            return null
          }

          const joint = robotObject.joints[jointName]

          // 检查关节是否是THREE.Object3D类型
          if (!joint || typeof joint.updateMatrixWorld !== 'function') {
            console.warn(`关节 "${jointName}" 不是有效的3D对象`)
            return null
          }

          // 更新世界矩阵
          joint.updateMatrixWorld(true)

          // 获取关节的世界变换矩阵
          if (!joint.matrixWorld) {
            console.warn(`关节 "${jointName}" 缺少世界变换矩阵`)
            return null
          }

          // 从世界矩阵中提取位置
          const position = new THREE.Vector3()
          position.setFromMatrixPosition(joint.matrixWorld)

          // 从世界矩阵中提取旋转（四元数）
          const quaternion = new THREE.Quaternion()
          const scale = new THREE.Vector3()
          joint.matrixWorld.decompose(position, quaternion, scale)

          // 转换为URDF坐标系
          const urdfPosition = (api as any).robot.position.threeToURDF({
            x: position.x,
            y: position.y,
            z: position.z
          })

          // 转换四元数到URDF坐标系
          const urdfQuaternion = (api as any).robot.quater.threeQuatToUrdf(quaternion)

          return {
            position: urdfPosition,
            orientation: urdfQuaternion
          }
        } catch (error) {
          console.error(`计算URDF关节 "${jointName}" 位置失败:`, error)
          return null
        }
      },

      /**
       * 批量并发计算BVH关节位置（使用Three.js场景实例）
       * 
       * 在独立的3D场景中创建多个骨骼实例，每个实例应用不同帧的数据，
       * 然后直接读取关节的世界坐标，充分利用Three.js的矩阵计算能力。
       * 
       * @param jointName 关节名称
       * @param frames 帧数据数组
       * @param metadata BVH元数据
       * @returns 每一帧的关节位置和朝向数组
       */
      _calculateBVHJointPositionBatch(
        jointName: string,
        frames: FrameLike[],
        metadata: BVHMetadata
      ): Array<{
        position: { x: number; y: number; z: number }
        orientation: { x: number; y: number; z: number }
      } | null> {
        try {
          const self = this as typeof api.robot.jointPosition
          const canonicalName = resolveBVHCanonicalName(jointName) ?? jointName
          const jointIndex =
            getBVHJointIndex(metadata, canonicalName) ??
            (canonicalName !== jointName ? getBVHJointIndex(metadata, jointName) : undefined)

          if (jointIndex === undefined) {
            return frames.map(() => null)
          }

          const baseViewer: any = viewerRef ?? null
          const baseSkeleton: THREE.Skeleton | null =
            (baseViewer?.skeleton as THREE.Skeleton | undefined | null) ?? null
          const baseRootBone: THREE.Bone | null =
            baseSkeleton?.bones?.[0] instanceof THREE.Bone ? (baseSkeleton.bones[0] as THREE.Bone) : null

          if (!baseSkeleton || !baseRootBone) {
            return frames.map((frameData) =>
              self._calculateBVHJointPositionPure(jointName, frameData, metadata)
            )
          }

          const tempScene = new THREE.Scene()
          const skeletonInstances = frames.map(() => {
            const rootClone = SkeletonUtils.clone(baseRootBone) as THREE.Bone
            if (!rootClone) return null
            rootClone.position.copy(baseRootBone.position)
            rootClone.quaternion.copy(baseRootBone.quaternion)
            rootClone.scale.copy(baseRootBone.scale)
            tempScene.add(rootClone)

            const boneList: THREE.Bone[] = []
            const nameMap = new Map<string, THREE.Bone>()

            rootClone.traverse((obj) => {
              if ((obj as any)?.isBone) {
                const bone = obj as THREE.Bone
                boneList.push(bone)
                if (bone.name) {
                  nameMap.set(bone.name, bone)
                  const stripped = stripBVHPrefix(bone.name)
                  if (stripped && stripped !== bone.name && !nameMap.has(stripped)) {
                    nameMap.set(stripped, bone)
                  }
                }
              }
            })

            return {
              root: rootClone,
              bones: boneList,
              map: nameMap
            }
          })

          const axisVectors: Record<'X' | 'Y' | 'Z', THREE.Vector3> = {
            X: new THREE.Vector3(1, 0, 0),
            Y: new THREE.Vector3(0, 1, 0),
            Z: new THREE.Vector3(0, 0, 1)
          }

          const findBoneFromVariants = (
            map: Map<string, THREE.Bone>,
            variants: string[]
          ): THREE.Bone | null => {
            for (const variant of variants) {
              if (map.has(variant)) return map.get(variant) ?? null
              const stripped = stripBVHPrefix(variant)
              if (stripped && map.has(stripped)) return map.get(stripped) ?? null
            }
            return null
          }

          const results = frames.map((frameData, frameIdx) => {
            const instance = skeletonInstances[frameIdx]
            if (!instance) {
              return self._calculateBVHJointPositionPure(jointName, frameData, metadata)
            }

            const { root, bones, map } = instance
            if (!root || !map.size) {
              return self._calculateBVHJointPositionPure(jointName, frameData, metadata)
            }

            const px = (frameData as any).global_x
            const py = (frameData as any).global_y
            const pz = (frameData as any).global_z
            root.position.set(
              typeof px === 'number' ? px : root.position.x,
              typeof py === 'number' ? py : root.position.y,
              typeof pz === 'number' ? pz : root.position.z
            )

            const qx = (frameData as any).quater_x ?? 0
            const qy = (frameData as any).quater_y ?? 0
            const qz = (frameData as any).quater_z ?? 0
            const qw = (frameData as any).quater_w ?? 1
            root.quaternion.set(qx, qy, qz, qw).normalize()

            bones.forEach((bone) => {
              if (bone !== root) {
                bone.quaternion.identity()
              }
            })

            for (let metaIndex = 0; metaIndex < metadata.jointNames.length; metaIndex++) {
              const metaName = metadata.jointNames[metaIndex]
              const variants = collectBVHNameVariants(metaName, resolveBVHCanonicalName(metaName) ?? undefined)
              const bone = findBoneFromVariants(map, variants)
              if (!bone || bone === root) continue

              const rotationOrder = metadata.rotationOrders[metaIndex] ?? 'XYZ'
              const localQuat = new THREE.Quaternion()

              for (let orderIdx = 0; orderIdx < rotationOrder.length; orderIdx++) {
                const axisKey = rotationOrder[orderIdx].toUpperCase() as 'X' | 'Y' | 'Z'
                const angleDeg = getBVHRotationValueFromVariants(
                  frameData,
                  variants,
                  axisKey === 'X' ? 'x' : axisKey === 'Y' ? 'y' : 'z'
                )

                if (!angleDeg || Math.abs(angleDeg) < 1e-6) continue

                const angleRad = THREE.MathUtils.degToRad(angleDeg)
                const axisVector = axisVectors[axisKey]
                const axisQuat = new THREE.Quaternion().setFromAxisAngle(axisVector, angleRad)
                localQuat.multiply(axisQuat)
              }

              bone.quaternion.copy(localQuat)
            }

            root.updateWorldMatrix(true, true)

            const targetVariants = collectBVHNameVariants(
              metadata.jointNames[jointIndex],
              canonicalName,
              jointName
            )
            const targetBone = findBoneFromVariants(map, targetVariants)
            if (!targetBone) {
              return self._calculateBVHJointPositionPure(jointName, frameData, metadata)
            }

            const worldPosition = new THREE.Vector3()
            targetBone.getWorldPosition(worldPosition)

            const worldQuaternion = new THREE.Quaternion()
            targetBone.getWorldQuaternion(worldQuaternion)

            const orientationEuler = new THREE.Euler().setFromQuaternion(worldQuaternion, 'XYZ')

            return {
              position: {
                x: worldPosition.x,
                y: worldPosition.y,
                z: worldPosition.z,
              },
              orientation: {
                x: THREE.MathUtils.radToDeg(orientationEuler.x),
                y: THREE.MathUtils.radToDeg(orientationEuler.y),
                z: THREE.MathUtils.radToDeg(orientationEuler.z),
              },
            }
          })

          skeletonInstances.forEach((instance) => {
            if (!instance?.root) return
            tempScene.remove(instance.root)
          })
          tempScene.clear()

          return results
        } catch (error) {
          console.error(`批量计算BVH关节 "${jointName}" 位置失败:`, error)
          return frames.map(() => null)
        }
      },

      /**
       * 纯数学前向运动学计算BVH关节位置（单帧，已废弃，保留用于兼容）
       */
      _calculateBVHJointPositionPure(
        jointName: string,
        frameData: FrameLike,
        metadata: BVHMetadata
      ): {
        position: { x: number; y: number; z: number }
        orientation: { x: number; y: number; z: number }
      } | null {
        // 使用批量方法计算单帧
        const results = this._calculateBVHJointPositionBatch(jointName, [frameData], metadata)
        return results[0] ?? null
      },

      /**
       * 计算BVH机器人关节的空间位置和欧拉角朝向
       */
      _getBVHJointPosition(
        jointName: string,
        frameData: FrameLike
      ): {
        position: { x: number; y: number; z: number }
        orientation: { x: number; y: number; z: number }
      } | null {
        try {
          const robotObject = (api as any).robot.getObject()
          if (!robotObject || !robotObject.skeleton || !robotObject.skeleton.bones) {
            console.warn('BVH机器人骨骼系统不存在')
            return null
          }

          // 在BVH中，关节名称对应骨骼名称
          const bone = robotObject.skeleton.bones.find((b: any) => b.name === jointName)
          if (!bone) {
            console.warn(`BVH骨骼 "${jointName}" 不存在`)
            return null
          }

          // 更新骨骼的世界变换矩阵
          bone.updateWorldMatrix(true, true)

          // 获取世界位置
          const worldPosition = new THREE.Vector3()
          bone.getWorldPosition(worldPosition)

          // 获取世界四元数
          const worldQuaternion = new THREE.Quaternion()
          bone.getWorldQuaternion(worldQuaternion)

          // 将四元数转换为欧拉角（度）
          const eulerAngles = (api as any).quater.toEuler(worldQuaternion, 'XYZ')

          return {
            position: {
              x: worldPosition.x,
              y: worldPosition.y,
              z: worldPosition.z
            },
            orientation: {
              x: eulerAngles.x,
              y: eulerAngles.y,
              z: eulerAngles.z
            }
          }
        } catch (error) {
          console.error(`计算BVH关节 "${jointName}" 位置失败:`, error)
          return null
        }
      },

      /**
       * 获取所有可用的关节名称
       *
       * @returns 关节名称数组，如果机器人未加载则返回空数组
       */
      getAvailableJointNames(): string[] {
        try {
          if (isBVH) {
            if (currentBVHMetadata) {
              return [...currentBVHMetadata.jointNames]
            }
            const robotObject = (api as any).robot.getObject()
            if (!robotObject || !robotObject.skeleton || !robotObject.skeleton.bones) {
              return []
            }
            return robotObject.skeleton.bones.map((bone: any) => bone.name).filter((name: string) => name)
          } else {
            const jointNames = (api as any).robot.joint.getNames()
            return Array.isArray(jointNames) ? jointNames : []
          }
        } catch (error) {
          console.error('获取关节名称失败:', error)
          return []
        }
      },

      /**
       * 直接计算URDF机器人关节的空间位置和朝向（不修改机器人状态）
       *
       * 使用临时克隆的Three.js对象在独立场景中计算，完全避免修改当前显示的机器人。
       * 这种方法确保计算结果准确，同时不会触发任何渲染更新。
       */
      _calculateURDFJointPositionDirect(
        jointName: string,
        frameData: FrameLike
      ): {
        position: { x: number; y: number; z: number }
        orientation: QuaternionLike
      } | null {
        try {
          const robotObject = (api as any).robot.getObject()
          if (!robotObject || !robotObject.joints || !robotObject.joints[jointName]) {
            console.warn(`URDF关节 "${jointName}" 不存在`)
            return null
          }

          const targetJoint = robotObject.joints[jointName]
          if (!targetJoint) {
            console.warn(`关节 "${jointName}" 不存在`)
            return null
          }

          // 创建临时场景用于计算（不会被渲染）
          const tempScene = new THREE.Scene()

          // 克隆整个机器人对象树（深度克隆，包含所有关节层次）
          const clonedRobot = robotObject.clone(true)
          tempScene.add(clonedRobot)

          // 在克隆的机器人上应用帧数据
          // 1. 设置全局位置和姿态
          const globalUrdfPosition = {
            x: frameData.global_x || 0,
            y: frameData.global_y || 0,
            z: frameData.global_z || 0
          }
          const globalPosition = (api as any).robot.position.urdfToThree(globalUrdfPosition)
          clonedRobot.position.set(globalPosition.x, globalPosition.y, globalPosition.z)

          const globalUrdfQuaternion = {
            w: frameData.quater_w || 1,
            x: frameData.quater_x || 0,
            y: frameData.quater_y || 0,
            z: frameData.quater_z || 0
          }
          const globalQuaternion = (api as any).robot.quater.urdfQuatToThree(globalUrdfQuaternion)
          clonedRobot.quaternion.copy(globalQuaternion)

          // 2. 设置所有关节角度
          if (clonedRobot.joints) {
            for (const jName in clonedRobot.joints) {
              const joint = clonedRobot.joints[jName]
              const angleValue = (frameData as any)[jName]

              if (angleValue !== undefined && joint && joint.setJointValue) {
                joint.setJointValue(angleValue)
              }
            }
          }

          // 强制更新整个变换层次
          clonedRobot.updateMatrixWorld(true)

          // 获取克隆机器人中对应的目标关节
          const clonedJoint = clonedRobot.joints[jointName]
          if (!clonedJoint || !clonedJoint.matrixWorld) {
            console.warn(`克隆的关节 "${jointName}" 无效`)
            // 清理临时对象
            tempScene.clear()
            return null
          }

          // 从世界矩阵中提取位置和朝向
          const worldPosition = new THREE.Vector3()
          const worldQuaternion = new THREE.Quaternion()
          const scale = new THREE.Vector3()
          clonedJoint.matrixWorld.decompose(worldPosition, worldQuaternion, scale)

          // 转换回URDF坐标系
          const urdfPosition = (api as any).robot.position.threeToURDF({
            x: worldPosition.x,
            y: worldPosition.y,
            z: worldPosition.z
          })

          const urdfQuaternion = (api as any).robot.quater.threeQuatToUrdf(worldQuaternion)

          // 清理临时对象
          tempScene.clear()

          return {
            position: urdfPosition,
            orientation: urdfQuaternion
          }
        } catch (error) {
          console.error(`直接计算URDF关节 "${jointName}" 位置失败:`, error)
          return null
        }
      },
      /**
       * 构建URDF关节的变换链
       *
       * 从根关节到目标关节构建完整的变换链，包括每个关节的局部变换。
       */
      _buildURDFTransformChain(jointName: string, frameData: FrameLike): THREE.Matrix4[] | null {
        try {
          const robotObject = (api as any).robot.getObject()
          if (!robotObject || !robotObject.joints) {
            return null
          }

          const targetJoint = robotObject.joints[jointName]
          if (!targetJoint) {
            return null
          }

          const transformChain: THREE.Matrix4[] = []

          // 构建从根到目标关节的路径
          const jointPath = this._getJointPath(targetJoint)

          // 为路径中的每个关节计算变换矩阵
          for (const joint of jointPath) {
            const jointTransform = this._calculateJointTransform(joint, frameData)
            if (jointTransform) {
              transformChain.push(jointTransform)
            }
          }

          return transformChain
        } catch (error) {
          console.error('构建URDF变换链失败:', error)
          return null
        }
      },

      /**
       * 获取从根到目标关节的路径
       */
      _getJointPath(targetJoint: any): any[] {
        const path: any[] = []
        let currentJoint = targetJoint

        // 从目标关节向上遍历到根关节
        while (currentJoint) {
          path.unshift(currentJoint)  // 添加到路径开头
          currentJoint = currentJoint.parent
        }

        return path
      },

      /**
       * 计算单个关节的变换矩阵
       */
      _calculateJointTransform(joint: any, frameData: FrameLike): THREE.Matrix4 | null {
        try {
          if (!joint.name) {
            return null
          }

          // 获取关节角度
          const jointAngle = (frameData as any)[joint.name] || 0

          // 创建变换矩阵
          const transform = new THREE.Matrix4()

          // 应用关节的固定变换（来自URDF定义）
          if (joint.position) {
            const position = new THREE.Vector3(
              joint.position.x || 0,
              joint.position.y || 0,
              joint.position.z || 0
            )
            transform.setPosition(position)
          }

          // 应用关节旋转
          if (joint.axis && jointAngle !== 0) {
            const axis = new THREE.Vector3(
              joint.axis.x || 0,
              joint.axis.y || 0,
              joint.axis.z || 0
            ).normalize()

            const rotationMatrix = new THREE.Matrix4()
            rotationMatrix.makeRotationAxis(axis, jointAngle)
            transform.multiplyMatrices(transform, rotationMatrix)
          }

          return transform
        } catch (error) {
          console.error(`计算关节 "${joint.name}" 变换失败:`, error)
          return new THREE.Matrix4()  // 返回单位矩阵
        }
      },

      /**
       * 直接计算BVH机器人关节的空间位置和朝向（不修改机器人状态）
       *
       * 对于BVH机器人，由于直接计算比较复杂，我们使用传统方法但保存和恢复机器人状态
       */
      _calculateBVHJointPositionDirect(
        jointName: string,
        frameData: FrameLike
      ): {
        position: { x: number; y: number; z: number }
        orientation: { x: number; y: number; z: number }
      } | null {
        try {
          const robotObject = (api as any).robot.getObject()
          if (!robotObject || !robotObject.skeleton || !robotObject.skeleton.bones) {
            console.warn('BVH机器人骨骼系统不存在')
            return null
          }

          // 找到目标骨骼
          const canonicalName = resolveBVHCanonicalName(jointName) ?? jointName
          const targetBone = findBVHBone(canonicalName, robotObject.skeleton.bones)
          if (!targetBone) {
            console.warn(`BVH骨骼 "${jointName}" 不存在`)
            return null
          }

          // 保存当前机器人状态（位置和旋转）
          const originalPosition = robotObject.position.clone()
          const originalQuaternion = robotObject.quaternion.clone()

          // 保存所有骨骼的原始状态
          const originalBoneStates = new Map()
          robotObject.skeleton.bones.forEach((bone: any) => {
            originalBoneStates.set(bone, {
              position: bone.position.clone(),
              quaternion: bone.quaternion.clone(),
              scale: bone.scale.clone()
            })
          })

          try {
            // 临时应用帧数据
            ; (api as any).robot.setFrame(frameData)

            // 更新骨骼的世界变换矩阵
            targetBone.updateWorldMatrix(true, true)

            // 获取世界位置
            const worldPosition = new THREE.Vector3()
            targetBone.getWorldPosition(worldPosition)

            // 获取世界四元数
            const worldQuaternion = new THREE.Quaternion()
            targetBone.getWorldQuaternion(worldQuaternion)

            // 将四元数转换为欧拉角（度）
            const eulerAngles = (api as any).quater.toEuler(worldQuaternion, 'XYZ')

            const result = {
              position: {
                x: worldPosition.x,
                y: worldPosition.y,
                z: worldPosition.z
              },
              orientation: {
                x: eulerAngles.x,
                y: eulerAngles.y,
                z: eulerAngles.z
              }
            }

            return result
          } finally {
            // 恢复机器人原始状态
            robotObject.position.copy(originalPosition)
            robotObject.quaternion.copy(originalQuaternion)

            // 恢复所有骨骼的原始状态
            originalBoneStates.forEach((state, bone) => {
              bone.position.copy(state.position)
              bone.quaternion.copy(state.quaternion)
              bone.scale.copy(state.scale)
            })

            // 更新矩阵
            if (typeof robotObject.updateMatrixWorld === 'function') {
              robotObject.updateMatrixWorld(true)
            } else if (robotObject.skeleton && Array.isArray(robotObject.skeleton.bones)) {
              robotObject.skeleton.bones.forEach((bone: any) => {
                if (bone && typeof bone.updateMatrixWorld === 'function') {
                  bone.updateMatrixWorld(true, true)
                }
              })
            }
          }
        } catch (error) {
          console.error(`直接计算BVH关节 "${jointName}" 位置失败:`, error)
          return null
        }
      },
      /**
       * 获取从根到目标骨骼的链
       */
      _getBVHBoneChain(targetBone: any): any[] {
        const chain: any[] = []
        let currentBone = targetBone

        // 从目标骨骼向上遍历到根骨骼
        while (currentBone) {
          chain.unshift(currentBone)  // 添加到链的开头
          currentBone = currentBone.parent
        }

        return chain
      },
      /**
       * 计算单个BVH骨骼的变换矩阵
       */
      _calculateBVHBoneTransform(bone: any, frameData: FrameLike): THREE.Matrix4 {
        try {
          const transform = new THREE.Matrix4()

          // 应用骨骼的固定偏移（来自BVH文件的OFFSET）
          if (bone.position) {
            transform.setPosition(bone.position.x || 0, bone.position.y || 0, bone.position.z || 0)
          }

          // 应用骨骼的旋转（来自帧数据）
          if (bone.name && bone.name !== 'root') {
            // 尝试多种可能的BVH帧数据格式
            const rotationX = this._getBVHRotationValue(frameData, bone.name, 'x') * Math.PI / 180
            const rotationY = this._getBVHRotationValue(frameData, bone.name, 'y') * Math.PI / 180
            const rotationZ = this._getBVHRotationValue(frameData, bone.name, 'z') * Math.PI / 180

            if (rotationX !== 0 || rotationY !== 0 || rotationZ !== 0) {
              const rotation = new THREE.Euler(rotationX, rotationY, rotationZ, 'XYZ')
              const rotationMatrix = new THREE.Matrix4()
              rotationMatrix.makeRotationFromEuler(rotation)

              transform.multiplyMatrices(transform, rotationMatrix)
            }
          }

          return transform
        } catch (error) {
          console.error(`计算BVH骨骼 "${bone.name}" 变换失败:`, error)
          return new THREE.Matrix4()  // 返回单位矩阵
        }
      },

      /**
       * 获取BVH骨骼的旋转值，支持多种命名格式
       */
      _getBVHRotationValue(frameData: FrameLike, boneName: string, axis: 'x' | 'y' | 'z'): number {
        const variants = collectBVHNameVariants(boneName, resolveBVHCanonicalName(boneName) ?? undefined)
        return getBVHRotationValueFromVariants(frameData, variants, axis)
      },
      /**
       * 关节运动轨迹可视化系统
       *
       * 提供关节在3D空间中运动轨迹的可视化功能，支持URDF和BVH两种机器人格式。
       * 通过直接数学计算获取关节位置，无需修改机器人状态，适合实时轨迹分析。
       *
       * 核心功能：
       * - 轨迹绘制：显示关节在时间序列中的3D运动路径
       * - 颜色渐变：从蓝色到紫色的时间进度指示
       * - 实时更新：支持动态更新轨迹数据
       * - 资源管理：自动处理几何体和材质的创建与销毁
       *
       * 技术特点：
       * - 高性能渲染：使用BufferGeometry和Float32Array
       * - 直接计算：基于数学运算，不依赖机器人状态
       * - 内存优化：自动清理旧的轨迹对象
       * - 双格式支持：自动适配URDF和BVH机器人
       *
       * 应用场景：
       * - 动作分析：分析关节的运动模式和轨迹
       * - 质量检查：检查动作的连续性和合理性
       * - 可视化调试：直观显示关节运动路径
       * - 教学演示：展示机器人关节的运动规律
       *
       * 使用示例：
       * ```typescript
       * // 显示关节轨迹
       * const allFrames = [frame1, frame2, frame3, ...] // 所有帧数据
       * api.robot.jointPosition.JointPositionLine.set('left_hand', allFrames)
       * 
       * // 更新轨迹
       * api.robot.jointPosition.JointPositionLine.update(newFrames)
       * 
       * // 移除轨迹
       * api.robot.jointPosition.JointPositionLine.remove()
       * ```
       */
      JointPositionLine: {
        _currentJointName: null as string | null,
        _trajectoryGroup: null as THREE.Group | null,
        _viewerInstance: null as any,
        _lineObject: null as THREE.Line | null,
        _pointsObject: null as THREE.Points | null,
        _currentFrameMarker: null as THREE.Mesh | null,
        _onClick: null as ((index: number) => void) | null,
        _handler: null as ((event: PointerEvent) => void) | null,
        _positionBuffer: null as Float32Array | null,
        _clickPixelThreshold: 12,
        _options: null as ({ onPointClick?: (index: number) => void; clickPixelThreshold?: number } | null),

        /**
         * 设置并显示关节的运动轨迹
         *
         * @param jointName 关节名称
         * @param allFramesData 所有帧的数据数组
         */
        set(
          jointName: string,
          allFramesData: FrameLike[],
          options: { onPointClick?: (index: number) => void; clickPixelThreshold?: number } = {}
        ): boolean {
          try {
            // 对于 BVH 和 URDF，都使用 viewerRef
            const activeViewer = viewerRef
            if (!activeViewer || !activeViewer.scene) {
              console.warn('3D场景未初始化')
              return false
            }

            if (!jointName || !Array.isArray(allFramesData) || allFramesData.length === 0) {
              console.warn('关节名称或帧数据无效')
              return false
            }

            // 计算所有帧中该关节的位置
            const jointPositions: { x: number; y: number; z: number }[] = []

            console.log(`开始计算关节 "${jointName}" 的轨迹，共 ${allFramesData.length} 帧`)

            for (let i = 0; i < allFramesData.length; i++) {
              const frameData = allFramesData[i]
              const jointInfo = (api as any).robot.jointPosition.get(jointName, frameData, true)

              if (jointInfo && jointInfo.position) {
                jointPositions.push({
                  x: jointInfo.position.x,
                  y: jointInfo.position.y,
                  z: jointInfo.position.z
                })

                // 每10帧输出一次调试信息
                if (i % 10 === 0) {
                  // console.log(`第${i}帧关节位置:`, jointInfo.position)
                }
              } else {
                console.warn(`第${i}帧中关节 "${jointName}" 位置计算失败`)
                // 使用前一个有效位置或默认位置
                if (jointPositions.length > 0) {
                  jointPositions.push({ ...jointPositions[jointPositions.length - 1] })
                } else {
                  jointPositions.push({ x: 0, y: 0, z: 0 })
                }
              }
            }

            console.log(`关节 "${jointName}" 轨迹计算完成，有效位置点: ${jointPositions.length}`)

            if (jointPositions.length === 0) {
              console.warn('没有有效的关节位置数据')
              return false
            }

            // 创建轨迹可视化
            return this._renderTrajectory(jointName, jointPositions, options)
          } catch (error) {
            console.error(`设置关节 "${jointName}" 轨迹失败:`, error)
            return false
          }
        },

        /**
         * 使用预先计算的位置数组设置关节轨迹
         *
         * @param jointName 关节名称
         * @param jointPositions 关节在各帧的世界空间位置数组
         */
        setFromPositions(
          jointName: string,
          jointPositions: { x: number; y: number; z: number }[],
          options: { onPointClick?: (index: number) => void; clickPixelThreshold?: number } = {}
        ): boolean {
          try {
            if (!jointName || !Array.isArray(jointPositions) || jointPositions.length === 0) {
              console.warn('关节轨迹位置数组无效')
              return false
            }
            return this._renderTrajectory(jointName, jointPositions, options)
          } catch (error) {
            console.error(`使用预计算位置设置关节 "${jointName}" 轨迹失败:`, error)
            return false
          }
        },

        /**
         * 内部方法：根据位置数组渲染轨迹
         */
        _renderTrajectory(
          jointName: string,
          jointPositions: { x: number; y: number; z: number }[],
          options: { onPointClick?: (index: number) => void; clickPixelThreshold?: number } = {}
        ): boolean {
          try {
            // 对于 BVH 和 URDF，都使用 viewerRef
            const activeViewer = viewerRef

            if (!activeViewer || !activeViewer.scene) {
              console.warn('3D场景未初始化')
              return false
            }
            this._viewerInstance = activeViewer

            if (!jointName || !Array.isArray(jointPositions) || jointPositions.length === 0) {
              console.warn('关节轨迹数据无效')
              return false
            }

            // 移除之前的轨迹
            this.remove()

            // 记录当前关节名称
            this._currentJointName = jointName
            this._options = options || null
            this._onClick = typeof options.onPointClick === 'function' ? options.onPointClick : null
            this._clickPixelThreshold =
              typeof options.clickPixelThreshold === 'number'
                ? Math.max(4, Math.min(48, options.clickPixelThreshold))
                : 12

            const renderSuccess = this._createTrajectoryVisualization(jointPositions)
            if (!renderSuccess) {
              this._onClick = null
              this._options = null
              return false
            }

            const domElement = this._viewerInstance?.renderer?.domElement
            if (this._handler && domElement) {
              domElement.removeEventListener('pointerdown', this._handler)
              this._handler = null
            }

            if (this._onClick && domElement && this._viewerInstance?.camera) {
              const clickHandler = (event: PointerEvent) => {
                if (event.button !== 0) return
                if (!this._positionBuffer || !this._onClick) return
                const canvas = domElement
                const rect = canvas.getBoundingClientRect()
                const mouseX = event.clientX - rect.left
                const mouseY = event.clientY - rect.top
                const thresholdPx = this._clickPixelThreshold || 12
                const threshold2 = thresholdPx * thresholdPx

                const camera = this._viewerInstance!.camera as THREE.Camera
                const tmp = new THREE.Vector3()
                const totalPoints = this._positionBuffer.length / 3
                let bestIndex = -1
                let bestDist2 = Infinity

                for (let i = 0; i < totalPoints; i++) {
                  tmp
                    .set(
                      this._positionBuffer[i * 3],
                      this._positionBuffer[i * 3 + 1],
                      this._positionBuffer[i * 3 + 2]
                    )
                    .project(camera)
                  const sx = (tmp.x * 0.5 + 0.5) * rect.width
                  const sy = (-tmp.y * 0.5 + 0.5) * rect.height
                  const dx = sx - mouseX
                  const dy = sy - mouseY
                  const d2 = dx * dx + dy * dy
                  if (d2 <= threshold2 && d2 < bestDist2) {
                    bestDist2 = d2
                    bestIndex = i
                  }
                }

                if (bestIndex !== -1) {
                  this._onClick(bestIndex)
                }
              }
              domElement.addEventListener('pointerdown', clickHandler)
              this._handler = clickHandler
            }

            return true
          } catch (error) {
            console.error(`渲染关节 "${jointName}" 轨迹失败:`, error)
            return false
          }
        },

        /**
         * 更新关节轨迹显示
         *
         * @param allFramesData 新的所有帧数据
         */
        update(allFramesData: FrameLike[]): boolean {
          try {
            if (!this._currentJointName) {
              console.warn('没有当前显示的关节轨迹')
              return false
            }

            // 重新设置轨迹
            return this.set(this._currentJointName, allFramesData, this._options || undefined)
          } catch (error) {
            console.error('更新关节轨迹失败:', error)
            return false
          }
        },

        /**
         * 移除关节轨迹显示
         */
        remove(): void {
          try {
            // 使用存储的 viewer 实例，如果没有则使用 viewerRef
            const viewerInstance = this._viewerInstance || viewerRef
            if (!viewerInstance || !viewerInstance.scene) {
              return
            }

            if (this._handler && viewerInstance.renderer && viewerInstance.renderer.domElement) {
              viewerInstance.renderer.domElement.removeEventListener('pointerdown', this._handler)
              this._handler = null
            }

            // 移除轨迹组
            if (this._trajectoryGroup) {
              viewerInstance.scene.remove(this._trajectoryGroup)

              // 清理几何体和材质资源
              this._trajectoryGroup.traverse((child: any) => {
                if (child.geometry) {
                  child.geometry.dispose()
                }
                if (child.material) {
                  if (Array.isArray(child.material)) {
                    child.material.forEach((mat: any) => mat?.dispose?.())
                  } else {
                    child.material?.dispose?.()
                  }
                }
              })

              this._trajectoryGroup = null
            }

            // 清理引用
            this._lineObject = null
            this._pointsObject = null
            this._currentFrameMarker = null
            this._currentJointName = null
            this._onClick = null
            this._positionBuffer = null
            this._options = null
            this._viewerInstance = null

              // 强制渲染更新
              ; (api as any).forceRender()
          } catch (error) {
            console.error('移除关节轨迹失败:', error)
          }
        },
        /**
         * 创建轨迹可视化对象
         *
         * @param positions 关节位置数组
         */
        _createTrajectoryVisualization(positions: { x: number; y: number; z: number }[]): boolean {
          try {
            // 使用存储的 viewer 实例，如果没有则使用 viewerRef
            const viewerInstance = this._viewerInstance || viewerRef
            if (!viewerInstance || !viewerInstance.scene) {
              return false
            }

            const positionCount = positions.length
            if (positionCount < 2) {
              console.warn('需要至少2个位置点才能绘制轨迹')
              return false
            }

            // 创建位置缓冲区
            const positionBuffer = new Float32Array(positionCount * 3)
            for (let i = 0; i < positionCount; i++) {
              positionBuffer[i * 3 + 0] = positions[i].x
              positionBuffer[i * 3 + 1] = positions[i].y
              positionBuffer[i * 3 + 2] = positions[i].z
            }
            this._positionBuffer = positionBuffer

            // 创建颜色缓冲区（蓝色到紫色的渐变）
            const colorBuffer = new Float32Array(positionCount * 3)
            const startColor = { r: 0.0, g: 0.5, b: 1.0 }  // 蓝色
            const endColor = { r: 0.8, g: 0.0, b: 1.0 }    // 紫色

            for (let i = 0; i < positionCount; i++) {
              const progress = positionCount > 1 ? i / (positionCount - 1) : 0
              const r = startColor.r + (endColor.r - startColor.r) * progress
              const g = startColor.g + (endColor.g - startColor.g) * progress
              const b = startColor.b + (endColor.b - startColor.b) * progress

              colorBuffer[i * 3 + 0] = r
              colorBuffer[i * 3 + 1] = g
              colorBuffer[i * 3 + 2] = b
            }

            // 创建轨迹组
            this._trajectoryGroup = new THREE.Group()
            this._trajectoryGroup.name = `JointTrajectory_${this._currentJointName}`

            // 创建线条几何体
            const lineGeometry = new THREE.BufferGeometry()
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(positionBuffer, 3))
            lineGeometry.setAttribute('color', new THREE.BufferAttribute(colorBuffer, 3))

            // 创建线条材质（透明度0.6，取消深度测试确保始终可见）
            const lineMaterial = new THREE.LineBasicMaterial({
              vertexColors: true,
              linewidth: 2,
              transparent: true,
              opacity: 0.6,
              depthTest: false,  // 取消深度测试，确保在任何角度下都能显示
              depthWrite: false  // 不写入深度，避免遮挡其他透明物体
            })

            // 创建线条对象
            this._lineObject = new THREE.Line(lineGeometry, lineMaterial)
            this._lineObject.name = `JointTrajectoryLine_${this._currentJointName}`
            this._lineObject.renderOrder = 100  // 确保线条在骨骼和地面之上渲染
              ; (this._lineObject as any).raycast = () => {
                /* 禁用线条的raycast，避免阻挡URDF拖拽 */
              }
            this._trajectoryGroup.add(this._lineObject)

            // 创建点几何体
            const pointsGeometry = new THREE.BufferGeometry()
            pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positionBuffer.slice(), 3))
            pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colorBuffer.slice(), 3))

            // 创建点材质（点的大小设置为很小，避免干扰观看，透明度0.6，取消深度测试确保始终可见）
            const pointsMaterial = new THREE.PointsMaterial({
              size: 0.005,
              sizeAttenuation: true,
              vertexColors: true,
              transparent: true,
              opacity: 0.6,
              depthTest: false,  // 取消深度测试，确保在任何角度下都能显示
              depthWrite: false  // 不写入深度，避免遮挡其他透明物体
            })

            // 创建点对象
            this._pointsObject = new THREE.Points(pointsGeometry, pointsMaterial)
            this._pointsObject.name = `JointTrajectoryPoints_${this._currentJointName}`
            this._pointsObject.renderOrder = 101  // 确保点在线条之上渲染
              ; (this._pointsObject as any).raycast = () => {
                /* 禁用点的raycast，避免覆盖机器人拾取 */
              }
            this._trajectoryGroup.add(this._pointsObject)

            // 创建当前帧标记球体（白色）
            // BVH 使用厘米单位，所以球体需要更大，尺寸缩小到原来的0.8倍
            const markerSize = isBVH ? 0.8 : 0.012
            const markerGeometry = new THREE.SphereGeometry(markerSize, 16, 16)
            const markerMaterial = new THREE.MeshBasicMaterial({
              color: 0xffffff,  // 白色
              transparent: true,
              opacity: 0.9,      // 略微透明，更自然
              depthTest: false,  // 取消深度测试，确保在任何角度下都能显示
              depthWrite: false  // 不写入深度，保持在其他物体之上
            })
            this._currentFrameMarker = new THREE.Mesh(markerGeometry, markerMaterial)
            this._currentFrameMarker.name = `JointTrajectoryMarker_${this._currentJointName}`
            this._currentFrameMarker.renderOrder = 999  // 确保在最后渲染，始终可见
              ; (this._currentFrameMarker as any).raycast = () => {
                /* 禁用标记球体的raycast */
              }
            this._trajectoryGroup.add(this._currentFrameMarker)

            // 添加到场景
            viewerInstance.scene.add(this._trajectoryGroup)

              // 强制渲染更新
              ; (api as any).forceRender()

            return true
          } catch (error) {
            console.error('创建轨迹可视化失败:', error)
            return false
          }
        },

        /**
         * 获取当前显示的关节名称
         */
        getCurrentJointName(): string | null {
          return this._currentJointName
        },

        /**
         * 检查是否有轨迹正在显示
         */
        isVisible(): boolean {
          return this._trajectoryGroup !== null && this._currentJointName !== null
        },

        /**
         * 更新当前帧标记球体的位置
         * 
         * @param frameIndex 当前帧索引
         */
        updateCurrentFrameMarker(frameIndex: number): void {
          try {
            if (!this._currentFrameMarker) return

            const viewerInstance = this._viewerInstance || viewerRef

            if (
              isBVH &&
              viewerInstance &&
              viewerInstance.skeleton &&
              Array.isArray(viewerInstance.skeleton.bones) &&
              this._currentJointName
            ) {
              const targetBone = findBVHBone(this._currentJointName, viewerInstance.skeleton.bones)
              if (targetBone) {
                targetBone.updateWorldMatrix(true, true)
                targetBone.getWorldPosition(tempMarkerPositionBVH)
                this._currentFrameMarker.position.copy(tempMarkerPositionBVH)
                this._currentFrameMarker.visible = true
                  ; (api as any).forceRender()
                return
              }
            }

            if (!this._positionBuffer) return

            const totalFrames = this._positionBuffer.length / 3
            if (frameIndex < 0 || frameIndex >= totalFrames) {
              this._currentFrameMarker.visible = false
              return
            }

            this._currentFrameMarker.position.set(
              this._positionBuffer[frameIndex * 3 + 0],
              this._positionBuffer[frameIndex * 3 + 1],
              this._positionBuffer[frameIndex * 3 + 2]
            )
            this._currentFrameMarker.visible = true
              ; (api as any).forceRender()
          } catch (error) {
            console.error('更新当前帧标记失败:', error)
          }
        },

        /**
         * 测试方法：显示根骨骼的轨迹（用于BVH调试）
         */
        testBVHRootTrajectory(allFramesData: FrameLike[]): boolean {
          try {
            if (!isBVH) {
              console.warn('此方法仅适用于BVH机器人')
              return false
            }

            const robotObject = (api as any).robot.getObject()
            if (!robotObject || !robotObject.skeleton || !robotObject.skeleton.bones) {
              console.warn('BVH机器人骨骼系统不存在')
              return false
            }

            // 获取根骨骼名称
            const rootBone = robotObject.skeleton.bones[0]
            if (!rootBone) {
              console.warn('找不到根骨骼')
              return false
            }

            console.log('根骨骼名称:', rootBone.name)
            console.log('可用骨骼:', robotObject.skeleton.bones.map((b: any) => b.name))

            // 使用根骨骼进行测试
            return this.set(rootBone.name, allFramesData)
          } catch (error) {
            console.error('BVH根骨骼轨迹测试失败:', error)
            return false
          }
        }
      }
    },
    /**
     * 机器人基础位置线可视化系统
       *
       * 创建机器人运动轨迹的3D可视化，显示机器人在时间序列中的位置变化。
       * 支持位置点、连接线、姿态指示线的综合显示，提供交互式的轨迹分析功能。
       *
       * 可视化组件：
       * - 位置点：显示每个时间点的机器人位置
       * - 连接线：连接相邻位置点形成轨迹路径
       * - 姿态线：显示机器人在特定帧的朝向（可选）
       * - 颜色渐变：从红色到绿色的时间进度指示
       *
       * 交互功能：
       * - 点击检测：支持点击位置点触发回调
       * - 射线检测：使用Three.js射线投射进行精确点击
       * - 事件处理：自动管理鼠标事件监听器
       *
       * 姿态指示：
       * - X轴：朝向方向（前进方向）
       * - Y轴：上方向
       * - Z轴：垂直于XOY平面的方向（侧向）
       * - 抽帧显示：通过frameSkip参数控制显示密度
       *
       * 技术特点：
       * - 高性能渲染：使用BufferGeometry和Float32Array
       * - 内存管理：自动清理几何体和材质资源
       * - 灵活配置：支持颜色、姿态轴、线长等参数定制
       *
       * 这个系统为动作编辑提供了直观的轨迹可视化和分析工具。
       */
    basePositionLine: {
      _group: null as THREE.Group | null,
      _pointsObj: null as THREE.Points | null,
      _linesGroup: null as THREE.Group | null,
      _currentFrameMarker: null as THREE.Mesh | null,
      _positionBuffer: null as Float32Array | null,
      _onClick: null as ((index: number) => void) | null,
      _handler: null as ((event: PointerEvent) => void) | null,
      set(
        coordinatesArray: Array<Vector3Like | number[]>,
        onClick: ((index: number) => void) | null = null,
        options: {
          orientationAxis?: 'X' | 'Y' | 'Z'
          orientationValueType?: 'quaternion' | 'euler'
          eulerOrder?: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
          frameSkip?: number
          lineLength?: number
          clickPixelThreshold?: number
        } = {}
      ): boolean {
        try {
          if (!viewerRef || !viewerRef.scene || !viewerRef.camera || !viewerRef.renderer)
            return false
              ; (this as any).remove()
          const parseCoordinate = (
            coordinateInput: Vector3Like | number[] | null | undefined
          ): {
            position: Vector3Like
            quaternion: { x: number; y: number; z: number; w: number } | null
            eulerDeg?: { x: number; y: number; z: number } | null
          } => {
            if (!coordinateInput) return { position: { x: 0, y: 0, z: 0 }, quaternion: null }
            if (Array.isArray(coordinateInput)) {
              const position = {
                x: +coordinateInput[0] || 0,
                y: +coordinateInput[1] || 0,
                z: +coordinateInput[2] || 0,
              }
              const valueType =
                options.orientationValueType ||
                (coordinateInput.length >= 7
                  ? 'quaternion'
                  : coordinateInput.length >= 6
                    ? 'euler'
                    : undefined)
              if (valueType === 'quaternion' && coordinateInput.length >= 7) {
                const quaternion = {
                  x: +coordinateInput[3] || 0,
                  y: +coordinateInput[4] || 0,
                  z: +coordinateInput[5] || 0,
                  w: +coordinateInput[6] || 1,
                }
                return { position, quaternion }
              } else if (valueType === 'euler' && coordinateInput.length >= 6) {
                const eulerDeg = {
                  x: +coordinateInput[3] || 0,
                  y: +coordinateInput[4] || 0,
                  z: +coordinateInput[5] || 0,
                }
                return { position, quaternion: null, eulerDeg }
              }
              return { position, quaternion: null }
            }
            return {
              position: {
                x: +(coordinateInput as Vector3Like).x || 0,
                y: +(coordinateInput as Vector3Like).y || 0,
                z: +(coordinateInput as Vector3Like).z || 0,
              },
              quaternion: null,
            }
          }
          const parsedCoordinates = Array.isArray(coordinatesArray)
            ? coordinatesArray.map(parseCoordinate)
            : []

          if (parsedCoordinates.length === 0) return false
          const positionBuffer = new Float32Array(parsedCoordinates.length * 3)
          for (let i = 0; i < parsedCoordinates.length; i++) {
            positionBuffer[i * 3 + 0] = parsedCoordinates[i].position.x
            positionBuffer[i * 3 + 1] = parsedCoordinates[i].position.y
            positionBuffer[i * 3 + 2] = parsedCoordinates[i].position.z
          }
          const colorBuffer = new Float32Array(parsedCoordinates.length * 3)
          // 单次线性渐变：从红色到绿色，不重复
          const startColor = { r: 255, g: 0, b: 0 }
          const endColor = { r: 0, g: 255, b: 0 }
          const totalFrames = Math.max(1, parsedCoordinates.length - 1)
          for (let i = 0; i < parsedCoordinates.length; i++) {
            const progressRatio = i / totalFrames
            const redValue = (startColor.r + (endColor.r - startColor.r) * progressRatio) / 255
            const greenValue = (startColor.g + (endColor.g - startColor.g) * progressRatio) / 255
            const blueValue = (startColor.b + (endColor.b - startColor.b) * progressRatio) / 255
            colorBuffer[i * 3 + 0] = redValue
            colorBuffer[i * 3 + 1] = greenValue
            colorBuffer[i * 3 + 2] = blueValue
          }
          const lineGeometry = new THREE.BufferGeometry()
          lineGeometry.setAttribute('position', new THREE.BufferAttribute(positionBuffer, 3))
          lineGeometry.setAttribute('color', new THREE.BufferAttribute(colorBuffer, 3))
          const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: isBVH ? 1 : 0.5,
            transparent: true,
            opacity: 0.6,
            depthTest: false,  // 穿透显示
            depthWrite: false
          })
          const lineObject = new THREE.Line(lineGeometry, lineMaterial)
          lineObject.name = 'GlobalLine'
            ; (lineObject as any).raycast = () => {
              /* disable direct raycast to avoid blocking机器人交互 */
            }
          const pointsGeometry = new THREE.BufferGeometry()
          const pickPositions = new Float32Array(positionBuffer)
          pointsGeometry.setAttribute('position', new THREE.BufferAttribute(pickPositions, 3))
          pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colorBuffer, 3))
          const pointsMaterial = new THREE.PointsMaterial({
            size: 0.005,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            depthTest: false,  // 穿透显示
            depthWrite: false
          })
          const pointsObject = new THREE.Points(pointsGeometry, pointsMaterial)
          pointsObject.name = 'GlobalLinePoints'
            ; (pointsObject as any).raycast = () => {
              /* disable direct raycast to avoid阻挡 */
            }
          const lineGroup = new THREE.Group()
          lineGroup.name = 'GlobalLineGroup'
          lineGroup.add(lineObject)
          lineGroup.add(pointsObject)

          // 保存位置缓冲区供后续更新当前帧标记使用
          this._positionBuffer = positionBuffer

          // 创建当前帧标记球体（白色）
          // BVH 使用厘米单位，所以球体需要更大，尺寸缩小到原来的0.8倍
          const markerSize = isBVH ? 0.8 : 0.012
          const markerGeometry = new THREE.SphereGeometry(markerSize, 16, 16)
          const markerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,  // 白色
            transparent: false,
            depthTest: false,  // 始终显示在最前面
            depthWrite: false
          })
          this._currentFrameMarker = new THREE.Mesh(markerGeometry, markerMaterial)
          this._currentFrameMarker.name = 'BasePositionMarker'
          this._currentFrameMarker.renderOrder = 999  // 确保在最后渲染
            ; (this._currentFrameMarker as any).raycast = () => {
              /* 禁用标记球体的raycast */
            }
          lineGroup.add(this._currentFrameMarker)
          // 创建姿态指示线条
          let orientationGroup: THREE.Group | null = null
          if (options.orientationAxis) {
            const { frameSkip = 5 } = options
            const orientationAxis = (options.orientationAxis || 'X').toUpperCase() as
              | 'X'
              | 'Y'
              | 'Z'
            const orientationValueType = (options.orientationValueType || null) as
              | 'quaternion'
              | 'euler'
              | null
            const eulerOrder = options.eulerOrder || 'XYZ'

            // 基于轨迹空间尺寸与相机距离自适应的默认线长，避免线条过小不可见
            let rangeX = 0,
              rangeY = 0,
              rangeZ = 0
            let minX = +Infinity,
              maxX = -Infinity
            let minY = +Infinity,
              maxY = -Infinity
            let minZ = +Infinity,
              maxZ = -Infinity
            if (parsedCoordinates.length >= 1) {
              for (let i = 0; i < parsedCoordinates.length; i++) {
                const px = positionBuffer[i * 3 + 0]
                const py = positionBuffer[i * 3 + 1]
                const pz = positionBuffer[i * 3 + 2]
                if (px < minX) minX = px
                if (px > maxX) maxX = px
                if (py < minY) minY = py
                if (py > maxY) maxY = py
                if (pz < minZ) minZ = pz
                if (pz > maxZ) maxZ = pz
              }
              rangeX = isFinite(maxX - minX) ? maxX - minX : 0
              rangeY = isFinite(maxY - minY) ? maxY - minY : 0
              rangeZ = isFinite(maxZ - minZ) ? maxZ - minZ : 0
            }
            const bboxRange = Math.max(rangeX, rangeY, rangeZ)
            let autoLength = Math.max(0.01, bboxRange * 0.02)
            // 若轨迹几乎为点，按相机距离的2%估算
            if (bboxRange < 1e-6 && viewerRef && viewerRef.camera) {
              const camPos = (viewerRef.camera as any).position as THREE.Vector3
              const cx = isFinite(minX) && isFinite(maxX) ? (minX + maxX) * 0.5 : 0
              const cy = isFinite(minY) && isFinite(maxY) ? (minY + maxY) * 0.5 : 0
              const cz = isFinite(minZ) && isFinite(maxZ) ? (minZ + maxZ) * 0.5 : 0
              const center = new THREE.Vector3(cx, cy, cz)
              const dist = camPos ? camPos.distanceTo(center) : 1
              autoLength = Math.max(autoLength, dist * 0.02)
            }
            const lineLength =
              typeof options.lineLength === 'number' && options.lineLength > 0
                ? options.lineLength
                : autoLength
            orientationGroup = new THREE.Group()
            orientationGroup.name = 'OrientationLinesGroup'

            // 抽帧显示姿态线条
            for (let i = 0; i < parsedCoordinates.length; i += frameSkip + 1) {
              const frameData = parsedCoordinates[i]
              const position = frameData.position
              // 计算该帧姿态所用的四元数（支持四元数或欧拉角输入）
              let threeQuaternion: THREE.Quaternion | null = null
              const orientationType =
                orientationValueType ||
                (frameData.quaternion ? 'quaternion' : frameData.eulerDeg ? 'euler' : undefined)
              if (orientationType === 'quaternion' && frameData.quaternion) {
                const q = frameData.quaternion
                const len = Math.hypot(q.x || 0, q.y || 0, q.z || 0, q.w || 0)
                if (!isFinite(len) || len < 1e-8) {
                  threeQuaternion = new THREE.Quaternion(0, 0, 0, 1)
                } else {
                  threeQuaternion = new THREE.Quaternion(q.x, q.y, q.z, q.w).normalize()
                }
              } else if (orientationType === 'euler') {
                // 欧拉模式：允许缺少个别帧欧拉时回退到四元数
                if (frameData.eulerDeg) {
                  const ex = ((frameData.eulerDeg.x || 0) * Math.PI) / 180
                  const ey = ((frameData.eulerDeg.y || 0) * Math.PI) / 180
                  const ez = ((frameData.eulerDeg.z || 0) * Math.PI) / 180
                  const e = new THREE.Euler(ex, ey, ez, eulerOrder)
                  threeQuaternion = new THREE.Quaternion().setFromEuler(e)
                } else if (frameData.quaternion) {
                  const q = frameData.quaternion
                  const len = Math.hypot(q.x || 0, q.y || 0, q.z || 0, q.w || 0)
                  threeQuaternion =
                    isFinite(len) && len >= 1e-8
                      ? new THREE.Quaternion(q.x, q.y, q.z, q.w).normalize()
                      : new THREE.Quaternion(0, 0, 0, 1)
                }
              }
              if (!threeQuaternion) continue

              let orientationVector: THREE.Vector3
              if (orientationAxis === 'X') {
                // X轴：朝向方向（前进方向）
                orientationVector = new THREE.Vector3(1, 0, 0)
                  .applyQuaternion(threeQuaternion)
                  .normalize()
              } else if (orientationAxis === 'Y') {
                // Y轴：上方向
                orientationVector = new THREE.Vector3(0, 1, 0)
                  .applyQuaternion(threeQuaternion)
                  .normalize()
              } else {
                // Z轴：垂直于XOY平面的方向（侧向）
                orientationVector = new THREE.Vector3(0, 0, 1)
                  .applyQuaternion(threeQuaternion)
                  .normalize()
              }

              // 创建线段：从位置点向两个方向延伸
              const framePosition = new THREE.Vector3(position.x, position.y, position.z)
              const lineStart = framePosition
                .clone()
                .addScaledVector(orientationVector, -lineLength / 2)
              const lineEnd = framePosition
                .clone()
                .addScaledVector(orientationVector, lineLength / 2)

              const lineGeometry = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd])

              // 使用与位置点相同的颜色
              const progressRatio = i / Math.max(1, parsedCoordinates.length - 1)
              const redValue = (startColor.r + (endColor.r - startColor.r) * progressRatio) / 255
              const greenValue = (startColor.g + (endColor.g - startColor.g) * progressRatio) / 255
              const blueValue = (startColor.b + (endColor.b - startColor.b) * progressRatio) / 255

              const lineMaterial = new THREE.LineBasicMaterial({
                color: new THREE.Color(redValue, greenValue, blueValue),
                linewidth: isBVH ? 1 : 0.5,
              })
              const line = new THREE.Line(lineGeometry, lineMaterial)
              line.name = `OrientationLine_${i}`
                ; (line as any).raycast = () => {
                  /* disable direct raycast to avoid覆盖操作 */
                }
              orientationGroup.add(line)
            }

            lineGroup.add(orientationGroup)
          }

          viewerRef.scene.add(lineGroup)
            ; (this as any)._group = lineGroup
            ; (this as any)._pointsObj = pointsObject
            ; (this as any)._linesGroup = orientationGroup
            ; (this as any)._onClick = typeof onClick === 'function' ? onClick : null
          const clickHandler = (event: PointerEvent) => {
            if (event.button !== 0) return
            if (!(this as any)._pointsObj) return
            const canvas = viewerRef!.renderer.domElement
            const rect = canvas.getBoundingClientRect()
            const mouseX = event.clientX - rect.left
            const mouseY = event.clientY - rect.top
            const thresholdPx = Math.max(4, Math.min(32, options.clickPixelThreshold || 14))
            const threshold2 = thresholdPx * thresholdPx

            const camera = viewerRef!.camera as THREE.Camera
            const tmp = new THREE.Vector3()
            let bestIndex = -1
            let bestDist2 = Infinity

            for (let i = 0; i < parsedCoordinates.length; i++) {
              tmp
                .set(
                  positionBuffer[i * 3 + 0],
                  positionBuffer[i * 3 + 1],
                  positionBuffer[i * 3 + 2]
                )
                .project(camera)
              const sx = (tmp.x * 0.5 + 0.5) * rect.width
              const sy = (-tmp.y * 0.5 + 0.5) * rect.height
              const dx = sx - mouseX
              const dy = sy - mouseY
              const d2 = dx * dx + dy * dy
              if (d2 <= threshold2 && d2 < bestDist2) {
                bestDist2 = d2
                bestIndex = i
              }
            }
            if (bestIndex !== -1 && (this as any)._onClick) (this as any)._onClick(bestIndex)
          }
          viewerRef.renderer.domElement.addEventListener('pointerdown', clickHandler)
            ; (this as any)._handler = clickHandler
            ; (api as any).forceRender()
          return true
        } catch (err) {
          console.error('[globalLine.set] error:', err)
          return false
        }
      },
      remove(): void {
        try {
          if (!viewerRef) return
          if ((this as any)._handler && viewerRef.renderer && viewerRef.renderer.domElement) {
            viewerRef.renderer.domElement.removeEventListener('pointerdown', (this as any)._handler)
              ; (this as any)._handler = null
          }
          if ((this as any)._group && viewerRef.scene) {
            viewerRef.scene.remove((this as any)._group)
              ; (this as any)._group.traverse((sceneObject: any) => {
                if (sceneObject.geometry) sceneObject.geometry.dispose()
                if (sceneObject.material) {
                  if (Array.isArray(sceneObject.material))
                    sceneObject.material.forEach(
                      (materialItem: any) => materialItem && materialItem.dispose()
                    )
                  else sceneObject.material.dispose()
                }
              })
          }
          ; (this as any)._group = null
            ; (this as any)._pointsObj = null
            ; (this as any)._linesGroup = null
            ; (this as any)._currentFrameMarker = null
            ; (this as any)._positionBuffer = null
            ; (this as any)._onClick = null
            ; (api as any).forceRender()
        } catch (err) {
          console.error('[globalLine.remove] error:', err)
        }
      },
      /**
       * 更新Base位置线的当前帧标记球体位置
       * 
       * @param frameIndex 当前帧索引
       */
      updateCurrentFrameMarker(frameIndex: number): void {
        try {
          if (!(this as any)._currentFrameMarker || !(this as any)._positionBuffer) {
            return
          }

          const positionBuffer = (this as any)._positionBuffer as Float32Array
          const totalFrames = positionBuffer.length / 3
          if (frameIndex < 0 || frameIndex >= totalFrames) {
            // 如果帧索引超出范围，隐藏标记
            ; (this as any)._currentFrameMarker.visible = false
            return
          }

          // 获取当前帧的位置
          const x = positionBuffer[frameIndex * 3 + 0]
          const y = positionBuffer[frameIndex * 3 + 1]
          const z = positionBuffer[frameIndex * 3 + 2]

            // 更新标记位置
            ; (this as any)._currentFrameMarker.position.set(x, y, z)
            ; (this as any)._currentFrameMarker.visible = true

            // 强制渲染更新
            ; (api as any).forceRender()
        } catch (error) {
          console.error('更新Base位置当前帧标记失败:', error)
        }
      },
    },
    /**
     * 机器人半透明显示系统（替代隐藏/球体/包围盒）
     *
     * 将URDF或BVH机器人以 0.3 透明度显示，避免完全隐藏，保持空间感。
     * - 对目标节点（Mesh/SkinnedMesh/Line/LineSegments）克隆材质并设置透明度
     * - 记录原始材质并支持完整恢复，避免共享材质被污染
     * - 兼容BVH骨骼辅助对象（名称含 joint/bone 或带 isJoint/isBone 标记）
     */
    hide: {
      _originalMaterials: new Map() as Map<any, any>,
      _modifiedObjects: new Set() as Set<any>,

      _shouldAffectNode(this: any, child: any): boolean {
        if (!child) return false

        // 排除轨迹线条：关节位置线条和基础位置线条
        const name: string = child.name || ''
        if (name.includes('JointTrajectory') || name.includes('BasePositionLine')) {
          return false
        }
        // 排除轨迹线条的父组
        if (child.parent && child.parent.name) {
          const parentName = child.parent.name
          if (parentName.includes('JointTrajectory') || parentName.includes('BasePositionLine')) {
            return false
          }
        }

        // 影响 Mesh/SkinnedMesh/Line/LineSegments
        const isRenderable = !!(child.isMesh || child.isSkinnedMesh || child.isLine || child.isLineSegments)
        if (!isRenderable) return false

        // 若BVH，额外考虑名称/标记；URDF直接处理自身子树
        if (isBVH) {
          // 仅对BVH骨骼、关节相关的可视对象生效，避免网格/地面等辅助物体被影响
          if (child.isJoint || child.isBone || child.isSkinnedMesh) {
            return true
          }
          if (name.toLowerCase().includes('joint') || name.toLowerCase().includes('bone')) {
            return true
          }
          if (child.parent && (child.parent.isBone || child.parent.isJoint)) {
            return true
          }
          if (child.userData && (child.userData.isBVHBone || child.userData.isBVHJoint)) {
            return true
          }
          return false
        }
        return true
      },

      _applyTransparencyToNode(this: any, child: any): void {
        try {
          const material: any = (child as any).material
          if (!material) return
          if (this._originalMaterials.has(child)) return

          // 记录原始材质引用
          this._originalMaterials.set(child, material)

          // 克隆材质，避免污染共享材质
          let cloned: any
          if (Array.isArray(material)) {
            cloned = material.map((m: any) => (typeof m?.clone === 'function' ? m.clone() : m))
            cloned.forEach((m: any) => {
              if (m && typeof m === 'object') {
                m.transparent = true
                m.opacity = 0.3
              }
            })
          } else {
            cloned = typeof material?.clone === 'function' ? material.clone() : material
            if (cloned && typeof cloned === 'object') {
              cloned.transparent = true
              cloned.opacity = 0.3
            }
          }
          ; (child as any).material = cloned
          this._modifiedObjects.add(child)
        } catch (e) {
          console.warn('应用半透明失败:', e)
        }
      },

      _traverseAndApply(this: any, root: any): void {
        if (!root || typeof root.traverse !== 'function') return
        root.traverse((child: any) => {
          if (this._shouldAffectNode(child)) {
            this._applyTransparencyToNode(child)
          }
        })
      },

      _applyTransparency(this: any): void {
        const robot: any = (api as any).robot.getObject()
        if (!robot) return
        // 首先对机器人子树应用
        this._traverseAndApply(robot)

        // BVH：可能存在在场景中的骨骼可视化对象，补充处理
        if (isBVH) {
          const v: any = viewerRef
          if (v && v.scene) {
            this._traverseAndApply(v.scene)
          }
        }
      },

      _restoreTransparency(this: any): void {
        try {
          // 逐个对象恢复原材质，并释放半透明材质资源
          this._modifiedObjects.forEach((obj: any) => {
            const original = this._originalMaterials.get(obj)
            if (original) {
              const current = (obj as any).material
              // 释放当前半透明材质（如果不是原材质引用）
              const disposeMaterial = (mat: any) => {
                if (!mat) return
                if (Array.isArray(mat)) {
                  mat.forEach((m) => m?.dispose?.())
                } else {
                  mat?.dispose?.()
                }
              }
              if (current && current !== original) disposeMaterial(current)
                ; (obj as any).material = original
            }
          })
        } catch (e) {
          console.warn('恢复半透明失败:', e)
        } finally {
          this._modifiedObjects.clear()
          this._originalMaterials.clear()
        }
      },

      // 兼容原有调用点：将"隐藏"语义替换为"应用半透明"
      _hideRobot(this: any): void {
        this._applyTransparency()
      },

      // 兼容原有调用点：将"显示"语义替换为"恢复原材质"
      _showRobot(this: any): void {
        this._restoreTransparency()
      },
      // 不再需要位置更新逻辑
      update(this: any): void { },

      set(this: any): void {
        if (!viewerRef || !(viewerRef as any).scene) return
        const robotObject: any = (api as any).robot.getObject()
        if (!robotObject) return
        viewerRef.setTransparent?.(true)
        console.log(`${isBVH ? 'BVH' : 'URDF'}机器人已切换为半透明显示 (opacity=0.3) `)
      },

      remove(this: any): void {
        if (!viewerRef || !(viewerRef as any).scene) return
        viewerRef.setTransparent?.(false)
        console.log(`${isBVH ? 'BVH' : 'URDF'}机器人已恢复原始显示`)
      },
    },
  },
  /**
   * 3D相机控制系统
   *
   * 提供完整的3D场景相机操作接口，支持位置、目标点、姿态的精确控制。
   * 为动作编辑器提供灵活的视角管理和距离计算功能。
   *
   * 控制组件：
   * - 相机位置：3D空间中相机的位置坐标
   * - 目标点：相机观察的焦点位置
   * - 相机姿态：相机的旋转方向（四元数）
   * - 距离计算：相机到机器人的空间距离
   *
   * 功能特点：
   * - 部分更新：支持只更新X、Y、Z中的部分坐标
   * - 智能默认：未指定的坐标保持当前值不变
   * - 四元数支持：使用四元数进行精确的旋转控制
   * - 距离测量：提供相机到机器人基座的精确距离
   *
   * 应用场景：
   * - 视角切换：快速切换到预设的观察角度
   * - 跟踪模式：相机跟随机器人运动
   * - 距离控制：保持相机与机器人的固定距离
   * - 动画录制：为动画录制提供平滑的相机运动
   *
   * 技术特点：
   * - 实时响应：相机参数变化立即生效
   * - 数值安全：自动处理NaN值和边界情况
   * - 控制器集成：与Three.js轨道控制器无缝集成
   *
   * 这个系统为动作编辑提供了专业级的3D视角控制能力。
   */
  camera: {
    position: {
      get(): THREE.Vector3 {
        return (viewerRef as Viewer).camera.position as THREE.Vector3
      },
      set({
        x = undefined,
        y = undefined,
        z = undefined,
      }: {
        x?: number
        y?: number
        z?: number
      }): void {
        ; (viewerRef as Viewer).camera.position.set(
          isNaN(x as any) ? (this as any).get().x : (x as number),
          isNaN(y as any) ? (this as any).get().y : (y as number),
          isNaN(z as any) ? (this as any).get().z : (z as number)
        )
          ; (api as any).forceRender?.()
      },
    },
    target: {
      get(): THREE.Vector3 {
        if (isBVH && threeJSAPI?.controls) {
          return threeJSAPI.controls.target
        }
        return (viewerRef as Viewer).controls.target
      },
      set({
        x = undefined,
        y = undefined,
        z = undefined,
      }: {
        x?: number
        y?: number
        z?: number
      }): void {
        const currentTarget = (this as any).get()
        const newX = isNaN(x as any) ? currentTarget.x : (x as number)
        const newY = isNaN(y as any) ? currentTarget.y : (y as number)
        const newZ = isNaN(z as any) ? currentTarget.z : (z as number)

        if (isBVH && threeJSAPI?.controls) {
          threeJSAPI.controls.target.set(newX, newY, newZ)
          threeJSAPI.controls.update()
        } else {
          ; (viewerRef as Viewer).controls.target.set(newX, newY, newZ)
        }
        ; (api as any).forceRender?.()
      },
    },
    quater: {
      get(): THREE.Quaternion {
        return (viewerRef as Viewer).camera.quaternion.clone()
      },
      set({
        x = undefined,
        y = undefined,
        z = undefined,
        w = undefined,
      }: {
        x?: number
        y?: number
        z?: number
        w?: number
      }): void {
        const cameraQuaternion = new THREE.Quaternion(
          x as number,
          y as number,
          z as number,
          w as number
        ).normalize()
          ; (viewerRef as Viewer).camera.quaternion.copy(cameraQuaternion)
          ; (api as any).forceRender?.()
      },
    },
    getToBaseDistance(): number {
      const cameraPos = (api as any).camera.position.get()
      const robotPos = (api as any).robot.position.get()
      return (api as any).distance.compute(
        cameraPos.x,
        cameraPos.y,
        cameraPos.z,
        robotPos.x,
        robotPos.y,
        robotPos.z
      )
    },
  },
  /**
   * 四元数数学工具库
   *
   * 提供完整的四元数数学运算功能，支持3D旋转的各种计算需求。
   * 包含位置计算、轨道运动、四元数运算、欧拉角转换等核心功能。
   *
   * 核心功能：
   * - 位置计算：基于四元数和距离计算3D位置
   * - 轨道运动：计算围绕目标点的轨道位置
   * - 四元数运算：反转、相对、组合等基础运算
   * - 角度转换：四元数与欧拉角的双向转换
   * - 坐标系转换：Three.js与BVH坐标系的转换
   *
   * 数学特性：
   * - 数值稳定：自动处理边界情况和数值误差
   * - 标准化处理：所有四元数自动标准化
   * - 多格式支持：支持对象和数组格式的四元数
   * - 精度保证：使用高精度浮点运算
   *
   * 应用场景：
   * - 相机控制：计算相机的轨道运动和朝向
   * - 机器人姿态：处理机器人的旋转和朝向
   * - 动画插值：提供平滑的旋转动画
   * - 坐标转换：不同坐标系间的旋转转换
   *
   * 技术优势：
   * - 无万向节锁：避免欧拉角的万向节锁问题
   * - 高效计算：四元数运算比矩阵运算更高效
   * - 平滑插值：支持球面线性插值（SLERP）
   * - 组合简单：旋转组合通过四元数乘法实现
   *
   * 这个工具库为3D数学运算提供了专业级的四元数支持。
   */
  quater: {
    computePositionFromQuat(
      originPoint: Vector3Like | THREE.Vector3,
      rotationQuat: QuaternionLike | THREE.Quaternion,
      distance: number,
      forwardAxis: THREE.Vector3 = new THREE.Vector3(0, 0, -1)
    ): THREE.Vector3 {
      const originVector =
        originPoint instanceof THREE.Vector3
          ? originPoint.clone()
          : new THREE.Vector3(originPoint.x, originPoint.y, originPoint.z)
      const normalizedQuat =
        rotationQuat instanceof THREE.Quaternion
          ? rotationQuat.clone().normalize()
          : new THREE.Quaternion(
            rotationQuat.x,
            rotationQuat.y,
            rotationQuat.z,
            rotationQuat.w
          ).normalize()
      const directionVector = forwardAxis.clone().applyQuaternion(normalizedQuat).normalize()
      return originVector.addScaledVector(directionVector, distance)
    },
    computeOrbitPosition(
      targetPoint: Vector3Like | THREE.Vector3,
      rotationQuat: QuaternionLike | THREE.Quaternion,
      distance: number,
      forwardAxis: THREE.Vector3 = new THREE.Vector3(0, 0, -1)
    ): THREE.Vector3 {
      const targetVector =
        targetPoint instanceof THREE.Vector3
          ? targetPoint.clone()
          : new THREE.Vector3(targetPoint.x, targetPoint.y, targetPoint.z)
      const normalizedQuat =
        rotationQuat instanceof THREE.Quaternion
          ? rotationQuat.clone().normalize()
          : new THREE.Quaternion(
            rotationQuat.x,
            rotationQuat.y,
            rotationQuat.z,
            rotationQuat.w
          ).normalize()
      const forwardVector = forwardAxis.clone().applyQuaternion(normalizedQuat).normalize()
      return targetVector.sub(forwardVector.multiplyScalar(distance))
    },
    invert(inputQuaternion: QuaternionLike | number[]): QuaternionLike {
      let quatX: number, quatY: number, quatZ: number, quatW: number
      if (Array.isArray(inputQuaternion)) {
        ;[quatX, quatY, quatZ, quatW] = inputQuaternion
      } else {
        ; ({ x: quatX, y: quatY, z: quatZ, w: quatW } = inputQuaternion)
      }
      quatX = +quatX || 0
      quatY = +quatY || 0
      quatZ = +quatZ || 0
      quatW = +quatW || 0
      const normSquared = quatX * quatX + quatY * quatY + quatZ * quatZ + quatW * quatW
      if (!isFinite(normSquared) || normSquared <= 1e-20) {
        return { x: 0, y: 0, z: 0, w: 1 }
      }
      const inverseNorm = 1 / normSquared
      return {
        x: -quatX * inverseNorm,
        y: -quatY * inverseNorm,
        z: -quatZ * inverseNorm,
        w: quatW * inverseNorm,
      }
    },
    get(
      startPoint: Vector3Like | THREE.Vector3,
      endPoint: Vector3Like | THREE.Vector3,
      upVector: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
    ): THREE.Quaternion {
      const startVector = (startPoint as any).isVector3
        ? (startPoint as THREE.Vector3)
        : new THREE.Vector3(
          (startPoint as Vector3Like).x,
          (startPoint as Vector3Like).y,
          (startPoint as Vector3Like).z
        )
      const endVector = (endPoint as any).isVector3
        ? (endPoint as THREE.Vector3)
        : new THREE.Vector3(
          (endPoint as Vector3Like).x,
          (endPoint as Vector3Like).y,
          (endPoint as Vector3Like).z
        )
      const directionVector = endVector.clone().sub(startVector)
      const vectorLength = directionVector.length()
      if (vectorLength < 1e-12) return new THREE.Quaternion()
      directionVector.divideScalar(vectorLength)
      const upDirection = upVector.clone().normalize()
      let rightDirection = directionVector.clone().cross(upDirection)
      if (rightDirection.lengthSq() < 1e-12) {
        const fallback =
          Math.abs(directionVector.y) < 0.99
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 0, 1)
        rightDirection = directionVector.clone().cross(fallback)
      }
      rightDirection.normalize()
      const correctedUp = rightDirection.clone().cross(directionVector).normalize()
      const rotationMatrix = new THREE.Matrix4()
      rotationMatrix.makeBasis(directionVector, correctedUp, rightDirection)
      const resultQuaternion = new THREE.Quaternion()
        .setFromRotationMatrix(rotationMatrix)
        .normalize()
      return resultQuaternion
    },
    relative(
      firstQuat: QuaternionLike | THREE.Quaternion,
      secondQuat: QuaternionLike | THREE.Quaternion
    ): THREE.Quaternion {
      const normalizedFirst =
        firstQuat instanceof THREE.Quaternion
          ? firstQuat.clone().normalize()
          : new THREE.Quaternion(firstQuat.x, firstQuat.y, firstQuat.z, firstQuat.w).normalize()
      const normalizedSecond =
        secondQuat instanceof THREE.Quaternion
          ? secondQuat.clone().normalize()
          : new THREE.Quaternion(secondQuat.x, secondQuat.y, secondQuat.z, secondQuat.w).normalize()
      const firstInverse = normalizedFirst.clone().invert()
      return firstInverse.multiply(normalizedSecond).normalize()
    },
    combine(
      firstQuat: QuaternionLike | THREE.Quaternion,
      secondQuat: QuaternionLike | THREE.Quaternion
    ): THREE.Quaternion {
      const normalizedFirst =
        firstQuat instanceof THREE.Quaternion
          ? firstQuat.clone().normalize()
          : new THREE.Quaternion(firstQuat.x, firstQuat.y, firstQuat.z, firstQuat.w).normalize()
      const normalizedSecond =
        secondQuat instanceof THREE.Quaternion
          ? secondQuat.clone().normalize()
          : new THREE.Quaternion(secondQuat.x, secondQuat.y, secondQuat.z, secondQuat.w).normalize()
      return normalizedFirst.multiply(normalizedSecond).normalize()
    },
    toEuler(
      inputQuaternion: QuaternionLike | THREE.Quaternion,
      order: 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY' = 'XYZ'
    ): { x: number; y: number; z: number } {
      const normalizedQuat =
        inputQuaternion instanceof THREE.Quaternion
          ? inputQuaternion.clone().normalize()
          : new THREE.Quaternion(
            inputQuaternion.x,
            inputQuaternion.y,
            inputQuaternion.z,
            inputQuaternion.w
          ).normalize()

      const eulerAngles = new THREE.Euler().setFromQuaternion(normalizedQuat, order)
      const degreeMultiplier = 180 / Math.PI
      return {
        x: eulerAngles.x * degreeMultiplier,
        y: eulerAngles.y * degreeMultiplier,
        z: eulerAngles.z * degreeMultiplier,
      }
    },
    fromEuler(
      eulerInput: { x: number; y: number; z: number },
      order: 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY' = 'XYZ'
    ): THREE.Quaternion {
      const radianMultiplier = Math.PI / 180
      const eulerObject = new THREE.Euler(
        eulerInput.x * radianMultiplier,
        eulerInput.y * radianMultiplier,
        eulerInput.z * radianMultiplier,
        order
      )
      return new THREE.Quaternion().setFromEuler(eulerObject).normalize()
    },
    rotateXYZ(
      inputQuaternion: QuaternionLike,
      xAngle: number = 0,
      yAngle: number = 0,
      zAngle: number = 0
    ): QuaternionLike {
      const xQuat = {
        x: Math.sin(xAngle / 2),
        y: 0,
        z: 0,
        w: Math.cos(xAngle / 2),
      }

      const yQuat = {
        x: 0,
        y: Math.sin(yAngle / 2),
        z: 0,
        w: Math.cos(yAngle / 2),
      }

      const zQuat = {
        x: 0,
        y: 0,
        z: Math.sin(zAngle / 2),
        w: Math.cos(zAngle / 2),
      }

      let combinedQuat = multiplyQuaternions(xQuat, inputQuaternion)
      combinedQuat = multiplyQuaternions(yQuat, combinedQuat)
      combinedQuat = multiplyQuaternions(zQuat, combinedQuat)

      return normalizeQuaternion(combinedQuat)
    },
    threeToBVH(inputQuaternion: QuaternionLike | THREE.Quaternion) {
      inputQuaternion = api.quater.rotateXYZ(inputQuaternion, Math.PI / 2, 0, Math.PI / 2)
      const convertedEuler = api.quater.toEuler(inputQuaternion)
      const robotAngles = {
        y: convertedEuler.z,
        z: convertedEuler.x,
        x: convertedEuler.y,
      }
      return api.quater.fromEuler(robotAngles)
    },
    BVHToThree(inputQuaternion: QuaternionLike | THREE.Quaternion) {
      const eulerAngles = api.quater.toEuler(inputQuaternion)
      const adjustedQuat = api.quater.fromEuler({
        x: eulerAngles.z,
        y: eulerAngles.x,
        z: eulerAngles.y,
      })
      return api.quater.rotateXYZ(adjustedQuat, Math.PI / -2, Math.PI / -2, 0)
    },
    charThreeToBVH(char: string) {
      char = char.toLocaleUpperCase()
      if (char === 'Z') return 'Y'
      if (char === 'X') return 'Z'
      if (char === 'Y') return 'X'
      return char
    },
    charBVHToThree(char: string) {
      char = char.toLocaleUpperCase()
      if (char === 'Z') return 'X'
      if (char === 'X') return 'Y'
      if (char === 'Y') return 'Z'
      return char
    },
  },
  /**
   * 3D空间距离计算工具
   *
   * 提供高效的3D空间距离计算功能，使用Three.js的优化算法。
   * 支持任意两点间的欧几里得距离计算。
   *
   * 应用场景：
   * - 相机距离：计算相机到机器人的距离
   * - 碰撞检测：判断物体间的距离关系
   * - 运动分析：分析机器人运动的空间特征
   * - 性能优化：基于距离进行LOD（细节层次）控制
   */
  distance: {
    compute(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
      return new THREE.Vector3(x1, y1, z1).distanceTo(new THREE.Vector3(x2, y2, z2))
    },
  },

  /**
   * 运动数据JSON解析器
   *
   * 将紧凑的MotionJSON格式转换为易于操作的ParsedMotion格式。
   * 处理机器人运动数据的结构化解析，支持全局位置、姿态和关节角度。
   *
   * 数据结构转换：
   * - 输入：MotionJSON（数组格式，紧凑存储）
   * - 输出：ParsedMotion（对象格式，便于访问）
   *
   * 解析规则：
   * - floating_base_joint：解析为全局位置和四元数姿态
   * - 其他关节：直接映射为关节角度
   * - 保留元数据：帧率、DOF名称等信息
   *
   * 特殊处理：
   * - 浮动基座：7个值（位置xyz + 四元数xyzw）
   * - 普通关节：1个值（角度）
   * - 深拷贝：避免原始数据污染
   *
   * 这个解析器为运动数据的编辑和分析提供了便利的数据格式。
   */
  parseMotionJSON(motionJSON: MotionJSON): ParsedMotion {
    const isBVH = !!motionJSON.bvhAdapt
    const degreeOfFreedomNames = motionJSON.dof_names
    const motionData = motionJSON.data
    const parsedFrames: ParsedFrame[] = []
    for (let frameIndex = 0; frameIndex < motionData.length; frameIndex++) {
      const frameData = motionData[frameIndex]
      const parsedFrame: ParsedFrame = {}
      let dataIndex = 0
      for (let dofIndex = 0; dofIndex < degreeOfFreedomNames.length; dofIndex++) {
        const dofName = degreeOfFreedomNames[dofIndex]
        if (dofName === 'floating_base_joint') {
          parsedFrame['global_x'] = frameData[0]
          parsedFrame['global_y'] = frameData[1]
          parsedFrame['global_z'] = frameData[2]
          {
            const quat = normalizeQuaternion({
              x: frameData[3],
              y: frameData[4],
              z: frameData[5],
              w: frameData[6],
            })
            parsedFrame['quater_x'] = quat.x
            parsedFrame['quater_y'] = quat.y
            parsedFrame['quater_z'] = quat.z
            parsedFrame['quater_w'] = quat.w
          }
          dataIndex += 7
        } else {
          parsedFrame[dofName] = frameData[dataIndex]
          dataIndex++
        }
      }
      parsedFrames.push(parsedFrame)
    }
    motionJSON = JSON.parse(JSON.stringify(motionJSON))
    delete (motionJSON as any).data
    return { ...motionJSON, parsed: parsedFrames }
  },
  /**
   * 运动数据JSON反解析器
   *
   * 将ParsedMotion格式还原为紧凑的MotionJSON格式，用于数据存储和传输。
   * 执行与parseMotionJSON相反的转换过程，确保数据格式的完整性。
   *
   * 转换流程：
   * 1. 深拷贝DOF名称避免污染
   * 2. 遍历每个解析后的帧
   * 3. 按DOF顺序重新组装数据数组
   * 4. 特殊处理浮动基座的7个值
   * 5. 组装最终的MotionJSON对象
   *
   * 数据完整性：
   * - 严格按照parseMotionJSON的顺序
   * - 保留所有元数据字段
   * - 确保浮动基座数据的正确顺序
   *
   * 这个反解析器确保了运动数据在编辑后能够正确保存。
   */
  unparseMotionJSON(parsedMotion: ParsedMotion): MotionJSON {
    const degreeOfFreedomNames = JSON.parse(JSON.stringify(parsedMotion.dof_names))
    const parsedFrames = parsedMotion.parsed
    const motionDataArray: number[][] = []

    for (let frameIndex = 0; frameIndex < parsedFrames.length; frameIndex++) {
      const frameData = parsedFrames[frameIndex]
      const frameDataArray: number[] = []
      for (let nameIndex = 0; nameIndex < degreeOfFreedomNames.length; nameIndex++) {
        const currentDofName = degreeOfFreedomNames[nameIndex]
        if (currentDofName === 'floating_base_joint') {
          frameDataArray.push(
            frameData['global_x'],
            frameData['global_y'],
            frameData['global_z'],
            frameData['quater_x'],
            frameData['quater_y'],
            frameData['quater_z'],
            frameData['quater_w']
          )
        } else {
          frameDataArray.push(frameData[currentDofName])
        }
      }
      motionDataArray.push(frameDataArray)
    }

    const { parsed: excludedParsed, ...motionMetadata } = parsedMotion as unknown as MotionJSON & {
      parsed?: ParsedFrame[]
    }
    const finalMotion: MotionJSON = { ...(motionMetadata as any), data: motionDataArray }
    return finalMotion
  },

  /**
   * 异步等待工具
   *
   * 提供基于Promise的延时功能，用于动画、测试和流程控制。
   * 支持秒级精度的等待时间设置。
   */
  wait(delaySeconds: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve()
      }, delaySeconds * 1000)
    })
  },

  /**
   * JSON文件选择和读取器
   *
   * 创建文件选择对话框，允许用户选择并读取JSON文件。
   * 提供异步的文件读取功能，自动解析JSON内容。
   *
   * 功能特点：
   * - 文件类型过滤：只接受JSON文件
   * - 异步处理：基于Promise的文件读取
   * - 错误处理：完整的错误捕获和提示
   * - 自动解析：读取后自动进行JSON解析
   *
   * 应用场景：
   * - 导入运动数据
   * - 加载配置文件
   * - 读取用户数据
   */
  selectAndReadJSON(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.accept = '.json,application/json'
      fileInput.onchange = async (event: Event) => {
        const eventTarget = event.target as HTMLInputElement
        const selectedFile = eventTarget.files && eventTarget.files[0]
        if (!selectedFile) {
          reject(new Error('没有选择文件'))
          return
        }
        try {
          const fileContent = await selectedFile.text()
          const parsedJson = JSON.parse(fileContent)
          resolve(parsedJson)
        } catch (parseError) {
          reject(parseError)
        }
      }
      fileInput.click()
    })
  },

  /**
   * 播放时间显示格式化器
   *
   * 将帧索引转换为可读的时间显示格式，支持当前时间和总时间的显示。
   * 提供类似视频播放器的时间显示功能。
   *
   * 时间格式：MM:SS:mmm
   * - MM：分钟（自动计算）
   * - SS：秒钟（补零显示）
   * - mmm：毫秒（三位数显示）
   *
   * 计算原理：
   * - 单帧时间 = 1 / 帧率
   * - 当前时间 = 单帧时间 × 当前帧索引
   * - 总时间 = 单帧时间 × 最大帧索引
   *
   * 应用场景：
   * - 动画播放器的时间显示
   * - 进度条的时间标签
   * - 时间轴的刻度显示
   */
  playedTimeDisplay(
    currentFrameIndex: number,
    maxFrameIndex: number,
    frameRate: number
  ): { current: string; total: string } {
    const timePerFrame = 1 / frameRate
    const elapsedTime = timePerFrame * currentFrameIndex
    const durationTime = timePerFrame * maxFrameIndex
    const padWithZeros = (numberString: string, targetLength: number): string => {
      let paddedString = `${numberString}`
      const currentLength = paddedString.length
      for (let i = 0; i < targetLength - currentLength; i++) paddedString = '0' + paddedString
      return paddedString
    }
    const formatTime = (timeValue: number): string => {
      let wholeSeconds = parseInt(`${timeValue}`)
      const millisecondString = padWithZeros(
        `${parseInt(`${(timeValue - wholeSeconds) * 1000}`)}`,
        3
      )
      timeValue = wholeSeconds
      const remainingSeconds = timeValue % 60
      timeValue -= remainingSeconds
      timeValue /= 60
      return `${timeValue}:${padWithZeros(`${remainingSeconds}`, 2)}:${millisecondString}`
    }
    return { current: formatTime(elapsedTime), total: formatTime(durationTime) }
  },
}

/**
 * ThreeJS API初始化器
 *
 * 设置外部ThreeJS API的引用，主要用于BVH机器人的帧数据操作。
 * 这个API提供了与BVH格式机器人交互的专用接口。
 */
export const initThreeJSAPI = (tjsapi: any) => {
  threeJSAPI = tjsapi
}

/**
 * 3D查看器初始化器
 *
 * 设置主要的3D查看器引用，这是整个工具库的核心依赖。
 * 所有的机器人操作、场景管理、相机控制都基于这个查看器实例。
 */
export const initAPI = (v: Viewer): void => {
  viewerRef = v
}
/**
 * 3D坐标轴标签创建器
 *
 * 创建用于标识坐标轴的3D文本标签，使用Canvas纹理和Sprite技术。
 * 提供清晰的坐标系指示，帮助用户理解3D空间的方向。
 *
 * 技术实现：
 * - Canvas渲染：使用2D Canvas绘制文本
 * - 纹理映射：将Canvas转换为Three.js纹理
 * - Sprite显示：使用Sprite确保标签始终面向相机
 * - 自适应缩放：合适的尺寸比例确保可读性
 *
 * 应用场景：
 * - 坐标轴辅助：X、Y、Z轴的标识
 * - 方向指示：帮助用户理解3D空间方向
 * - 调试辅助：开发和调试时的空间参考
 *
 * 这个工具为3D场景提供了重要的空间导航辅助。
 */
function createAxisLabel(
  text: string,
  position: THREE.Vector3,
  color: number = 0xffffff
): AxisLabel {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  context.font = 'Bold 48px Arial'
  context.fillStyle = '#ffffff'
  context.fillText(text, 0, 50)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, color })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(0.5, 0.25, 1)
  sprite.position.copy(position)
  return sprite
}

/**
 * URDF查看器视觉样式应用器
 *
 * 为3D查看器应用专业级的视觉样式，创建适合机器人展示的渲染环境。
 * 基于URDFViewer.vue的样式设计，提供一致的视觉体验。
 *
 * 渲染器配置：
 * - 背景色：深灰蓝色调（Studio Dark Slate）避免与UI控件冲突
 * - 色彩空间：SRGB标准色彩空间确保颜色准确性
 * - 透明度：完全不透明的背景
 *
 * 光照系统：
 * - 主光源：高强度方向光提供主要照明
 * - 环境光：冷色系环境光提升整体亮度
 * - 补光系统：填充光和轮廓光增强形体可读性
 *
 * 光照特点：
 * - 三点照明：主光、填充光、轮廓光的经典配置
 * - 冷暖对比：冷色环境光与暖色主光的对比
 * - 性能优化：补光不投射阴影减少计算负担
 *
 * 视觉增强：
 * - 对比度优化：深色背景突出机器人模型
 * - 色彩平衡：冷暖色调平衡提升视觉舒适度
 * - 专业外观：类似工业设计软件的渲染效果
 *
 * 这个样式系统为机器人展示创造了专业、清晰的视觉环境。
 */
function applyURDFViewerStyle(viewer: any) {
  const r: THREE.WebGLRenderer | undefined = viewer?.renderer
  if (r) {
    r.setClearAlpha(1)
    r.setClearColor(0x1e2227)
    r.outputColorSpace = THREE.SRGBColorSpace
  }
  const dl: THREE.DirectionalLight | undefined = viewer?.directionalLight
  if (dl) {
    dl.intensity = 1.15
    dl.position.set(5, 5, 5)
  }
  const amb: THREE.Light | undefined = viewer?.ambientLight
  if ((amb as any)?.intensity !== undefined) {
    ; (amb as any).intensity = 0.85
      ; (amb as any).color?.set?.(0xc8d2e6)
  }

  const scene: THREE.Scene | undefined = viewer?.scene
  if (scene && !viewer.__extraLights) {
    const fill = new THREE.DirectionalLight(0xdde7ff, 0.5)
    fill.position.set(-6, 4, -4)
    const rim = new THREE.DirectionalLight(0xffffff, 0.35)
    rim.position.set(-3, 3, 6)
    fill.castShadow = false
    rim.castShadow = false
    scene.add(fill)
    scene.add(rim)
    viewer.__extraLights = [fill, rim]
  }

  if (r) {
    r.setClearColor(0x20252b)
  }

  if (viewer.__grid) {
    try {
      viewer.__grid.parent && viewer.__grid.parent.remove(viewer.__grid)
    } catch { }
    viewer.__grid = null
  }
}
/**
 * 修复URDF查看器的相机控制问题
 * 
 * 解决旧版Web Component中相机控制的以下问题：
 * 1. 相机目标跳动：只更新Y轴导致的不稳定
 * 2. 循环调用：controls的change事件触发recenter导致的循环
 * 3. 平移控制：确保鼠标右键拖动垂直于画面朝向
 * 
 * 修复策略：
 * - 移除controls的change事件监听器，避免循环调用
 * - 优化OrbitControls配置，改善平移和旋转体验
 * - 设置合理的阻尼系数，提供平滑的相机运动
 * - 修正相机目标更新逻辑，避免跳动
 * 
 * @param viewer URDF查看器实例
 */
function fixCameraControls(viewer: any) {
  if (!viewer || !viewer.controls) return

  const controls = viewer.controls

  // 移除可能导致循环调用的change事件监听器
  // 通过重新创建监听器列表来清除
  if (controls._listeners && controls._listeners.change) {
    controls._listeners.change = []
  }

  // 优化OrbitControls配置
  controls.enableDamping = true  // 启用阻尼，提供平滑运动
  controls.dampingFactor = 0.05  // 设置阻尼系数
  controls.rotateSpeed = 1.0     // 降低旋转速度，更精确控制
  controls.zoomSpeed = 1.2       // 优化缩放速度
  controls.panSpeed = 0.8        // 优化平移速度
  controls.screenSpacePanning = true  // 启用屏幕空间平移，确保垂直于画面

  // 重写viewer的_updateEnvironment方法，修复相机目标跳动问题
  const originalUpdateEnvironment = viewer._updateEnvironment
  if (originalUpdateEnvironment) {
    viewer._updateEnvironment = function () {
      const robot = this.robot
      if (!robot) return

      this.world.updateMatrixWorld()

      const bbox = new THREE.Box3()
      bbox.makeEmpty()
      robot.traverse((c: any) => {
        if (c.isURDFVisual) {
          bbox.expandByObject(c)
        }
      })

      const center = bbox.getCenter(new THREE.Vector3())

      // 修复：使用lerp平滑过渡相机目标，避免跳动
      // 只在目标位置变化较大时才更新
      const currentTarget = this.controls.target
      const distance = currentTarget.distanceTo(center)

      if (distance > 0.01) {  // 只有当距离超过阈值时才更新
        this.controls.target.lerp(center, 0.1)  // 使用插值平滑过渡
      }

      // 保持地面在世界y=0
      this.plane.position.y = 0

      // 更新阴影
      const dirLight = this.directionalLight
      dirLight.castShadow = this.displayShadow

      if (this.displayShadow) {
        const sphere = bbox.getBoundingSphere(new THREE.Sphere())
        const minmax = Math.max(8, sphere.radius * 1.5)
        const cam = dirLight.shadow.camera
        cam.left = cam.bottom = -minmax
        cam.right = cam.top = minmax

        const offset = dirLight.position.clone().sub(dirLight.target.position)
        dirLight.target.position.copy(center)
        dirLight.position.copy(center).add(offset)

        cam.updateProjectionMatrix()
      }
    }
  }

  // 设置noAutoRecenter标志，避免自动重新居中
  viewer.noAutoRecenter = true

  console.log('相机控制已修复：移除循环调用，优化平移和旋转')
}
/**
 * URDF网格悬停高亮效果系统
 *
 * 为URDF机器人模型提供交互式的悬停高亮效果，增强用户体验。
 * 支持鼠标悬停、点击检测和自定义事件分发，提供丰富的交互反馈。
 *
 * 核心功能：
 * - 悬停高亮：鼠标悬停时高亮显示机器人部件
 * - 关节识别：自动识别URDF关节并触发相应事件
 * - 材质管理：保存和恢复原始材质，避免材质丢失
 * - 事件分发：分发自定义事件供外部组件监听
 *
 * 交互事件：
 * - grid-joint-enter：鼠标进入关节时触发
 * - grid-joint-leave：鼠标离开关节时触发
 * - grid-joint-click：点击关节时触发
 * - grid-mouseenter：鼠标进入画布时触发
 * - grid-mouseleave：鼠标离开画布时触发
 *
 * 技术实现：
 * - 射线投射：使用Three.js Raycaster进行精确的3D拾取
 * - 材质缓存：Map结构缓存原始材质避免重复创建
 * - 事件节流：避免重复绑定事件监听器
 * - 坐标转换：屏幕坐标到NDC坐标的精确转换
 *
 * 视觉效果：
 * - 高亮颜色：蓝色系高亮材质提供清晰的视觉反馈
 * - 发光效果：emissive属性创建发光效果
 * - 透明度：适度透明度保持原始几何细节可见
 * - 光标变化：悬停时改变光标样式提示可交互
 *
 * 这个系统为机器人模型提供了专业级的交互体验。
 */
export function setupHoverHighlight(viewer: any) {
  const canvas = viewer?.renderer?.domElement as HTMLCanvasElement | undefined
  const scene = viewer?.scene as THREE.Scene | undefined
  const camera = viewer?.camera as THREE.Camera | undefined
  if (!canvas || !scene || !camera) return
  if (viewer.__hoverHighlightBound) return
  viewer.__hoverHighlightBound = true

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const originalMaterials = new Map<any, any>()
  const highlightColor = new THREE.Color(0x409eff)
  const highlightMaterial = new THREE.MeshLambertMaterial({
    color: highlightColor,
    emissive: highlightColor.clone().multiplyScalar(0.3),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.9,
  })
  let hoveredMesh: any = null
  let lastHoveredJointName: string | null = null

  function __getJointNameFromMesh(mesh: any): string | null {
    let p: any = mesh
    while (p) {
      if (p.isURDFJoint && p.name) return p.name as string
      p = p.parent
    }
    return mesh && mesh.name ? (mesh.name as string) : null
  }
  function __getHoverJointName(mesh: any): string | null {
    return __getJointNameFromMesh(mesh)
  }
  function restoreOriginalMaterial(mesh: any) {
    const orig = originalMaterials.get(mesh)
    if (!orig) return
    // 若处于半透明模式，恢复为半透明克隆，避免丢失0.3透明度
    const v: any = viewer
    if (v && v.__robotTransparencyActive) {
      try {
        let cloned: any
        if (Array.isArray(orig)) {
          cloned = orig.map((m: any) => (typeof m?.clone === 'function' ? m.clone() : m))
          cloned.forEach((m: any) => {
            if (m && typeof m === 'object') {
              m.transparent = true
              m.opacity = 0.3
            }
          })
        } else {
          cloned = typeof orig?.clone === 'function' ? orig.clone() : orig
          if (cloned && typeof cloned === 'object') {
            cloned.transparent = true
            cloned.opacity = 0.3
          }
        }
        mesh.material = cloned
        return
      } catch { }
    }
    mesh.material = orig
  }
  function applyHoverEffect(mesh: any) {
    if (!originalMaterials.has(mesh)) originalMaterials.set(mesh, mesh.material)
    mesh.material = highlightMaterial
  }
  function onMouseMove(event: MouseEvent) {
    const rect = (canvas as HTMLCanvasElement).getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, camera as THREE.Camera)
    const root: any = (viewer as any)?.robot || scene
    const intersects = raycaster.intersectObjects(
      root ? [root] : (scene as THREE.Scene).children,
      true
    )
    const hit = intersects.find(i => (i.object as any).isMesh && (i.object as any).visible)
    if (hit && hit.object !== hoveredMesh) {
      if (hoveredMesh) {
        const prevJoint = __getHoverJointName(hoveredMesh)
        if (prevJoint && prevJoint !== lastHoveredJointName) {
          try {
            viewer.dispatchEvent(
              new CustomEvent('grid-joint-leave', { detail: { jointName: prevJoint } })
            )
          } catch { }
        }
        restoreOriginalMaterial(hoveredMesh)
      }
      hoveredMesh = hit.object
      applyHoverEffect(hoveredMesh)
      const curJoint = __getHoverJointName(hoveredMesh)
      if (curJoint && curJoint !== lastHoveredJointName) {
        try {
          viewer.dispatchEvent(
            new CustomEvent('grid-joint-enter', { detail: { jointName: curJoint } })
          )
        } catch { }
        lastHoveredJointName = curJoint
      }
      ; (canvas as HTMLCanvasElement).style.cursor = 'pointer'
    } else if (!hit) {
      if (hoveredMesh) {
        const prevJoint = __getHoverJointName(hoveredMesh)
        if (prevJoint) {
          try {
            viewer.dispatchEvent(
              new CustomEvent('grid-joint-leave', { detail: { jointName: prevJoint } })
            )
          } catch { }
        }
        restoreOriginalMaterial(hoveredMesh)
      }
      hoveredMesh = null
      lastHoveredJointName = null
        ; (canvas as HTMLCanvasElement).style.cursor = 'default'
    }
  }
  function onMouseLeave() {
    if (hoveredMesh) {
      const prevJoint = __getHoverJointName(hoveredMesh)
      if (prevJoint) {
        try {
          viewer.dispatchEvent(
            new CustomEvent('grid-joint-leave', { detail: { jointName: prevJoint } })
          )
        } catch { }
      }
      restoreOriginalMaterial(hoveredMesh)
    }
    hoveredMesh = null
    lastHoveredJointName = null
      ; (canvas as HTMLCanvasElement).style.cursor = 'default'
  }
  ; (canvas as HTMLCanvasElement).addEventListener('mousemove', onMouseMove)
    ; (canvas as HTMLCanvasElement).addEventListener('mouseleave', onMouseLeave)
    ; (canvas as HTMLCanvasElement).addEventListener('pointerenter', () => {
      try {
        viewer.dispatchEvent(new CustomEvent('grid-mouseenter'))
      } catch { }
    })
    ; (canvas as HTMLCanvasElement).addEventListener('mouseleave', () => {
      try {
        viewer.dispatchEvent(new CustomEvent('grid-mouseleave'))
      } catch { }
    })
    ; (canvas as HTMLCanvasElement).addEventListener('click', (event: MouseEvent) => {
      try {
        const rect = (canvas as HTMLCanvasElement).getBoundingClientRect()
        const ndc = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        )
        raycaster.setFromCamera(ndc, camera as THREE.Camera)
        const root: any = (viewer as any)?.robot || scene
        const hits = raycaster.intersectObjects(root ? [root] : (scene as THREE.Scene).children, true)
        if (hits && hits.length > 0) {
          const mesh = hits[0].object as any
          const jointName = __getJointNameFromMesh(mesh)
          if (jointName)
            viewer.dispatchEvent(new CustomEvent('grid-joint-click', { detail: { jointName } }))
        } else if (hoveredMesh) {
          const jointName = __getJointNameFromMesh(hoveredMesh)
          if (jointName)
            viewer.dispatchEvent(new CustomEvent('grid-joint-click', { detail: { jointName } }))
        }
      } catch { }
    })
  viewer.__hoverHandlers = { onMouseMove, onMouseLeave, highlightMaterial, originalMaterials }
}

/**
 * BVH机器人构建选项接口
 *
 * 定义创建BVH机器人时的各种配置参数，支持外观、尺寸和行为的定制。
 */
export interface BVHRobotBuildOptions {
  eulerOrder?: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
  boneThickness?: number
  jointSize?: number
  boneColor?: number
  targetHeightMeters?: number
  keepOriginalXZ?: boolean
}

/**
 * BVH机器人构建结果接口
 *
 * 定义BVH机器人构建完成后返回的对象结构，提供完整的控制和管理接口。
 */
export interface BVHRobotBuildResult {
  object3d: THREE.Object3D
  robot: RobotObject
  setJointValue: (jointName: string, angleRadians: number) => boolean
  setJointValues: (jointAngles: Record<string, number>) => boolean
  updateVisualization: () => void
  dispose: () => void
}

/**
 * BVH机器人构建器
 *
 * 从BVH动作捕捉数据创建完整的3D机器人模型，提供与URDF机器人一致的控制接口。
 * 这是动作编辑器支持BVH格式的核心功能，实现了BVH到机器人模型的完整转换。
 *
 * 核心特性：
 * - 格式转换：将BVH骨骼动画转换为可控制的机器人模型
 * - 关节映射：每个BVH骨骼拆分为X/Y/Z三个独立的旋转关节
 * - 可视化：创建高质量的3D可视化（关节球体+骨骼连线）
 * - 统一接口：提供与URDF机器人相同的控制API
 *
 * 技术实现：
 * - BVH解析：使用Three.js BVHLoader解析BVH文件
 * - 单位检测：智能检测BVH文件的单位（米/厘米）并自动缩放
 * - 坐标转换：处理BVH（Y-up）到URDF（Z-up）的坐标系转换
 * - 地面对齐：确保机器人正确站立在地面上
 *
 * 可视化系统：
 * - 关节球体：使用PBR材质的高质量球体表示关节
 * - 骨骼连线：锥形圆柱体连接关节，增强视觉效果
 * - 材质系统：金属质感材质提供专业外观
 * - 性能优化：批量更新和requestAnimationFrame优化
 *
 * 控制系统：
 * - 欧拉角控制：支持多种欧拉角顺序（XYZ、YXZ等）
 * - 角度限制：可配置的关节角度限制
 * - 批量操作：支持同时设置多个关节角度
 * - 实时更新：关节变化时自动更新可视化
 *
 * 这个系统为BVH动作数据提供了完整的3D机器人表示和控制能力。
 */
export async function createBVHRobotFromBVH(
  bvhContent: string | ArrayBuffer,
  options: BVHRobotBuildOptions = {}
): Promise<BVHRobotBuildResult> {
  const eulerOrder = options.eulerOrder || 'XYZ'
  const boneThickness = Math.max(0.01, options.boneThickness || 0.4)
  const jointSize = Math.max(0.01, options.jointSize || 0.24)
  const boneColor = (options.boneColor ?? 0x888888) >>> 0
  const targetHeight = Math.max(0.1, options.targetHeightMeters ?? 0.34)
  const keepOriginalXZ = !!options.keepOriginalXZ

  // 解析 BVH
  const loader = new BVHLoader()
  let text: string
  if (typeof bvhContent === 'string') {
    text = bvhContent
  } else {
    text = new TextDecoder().decode(bvhContent)
  }
  const parsed = loader.parse(text) as any
  const skeleton: THREE.Skeleton = parsed.skeleton
  const bones: THREE.Bone[] = skeleton.bones
  const clip: THREE.AnimationClip | undefined = parsed.clip
  if (!bones || bones.length === 0) throw new Error('BVH 解析失败：未得到骨骼')

  // 使用 AnimationMixer 采样第 0 帧，确保骨骼姿态与 BVHViewer 一致（避免所有关节重叠）
  try {
    if (clip && bones[0]) {
      const mixer = new THREE.AnimationMixer(bones[0])
      const action = mixer.clipAction(clip)
      action.play()
      mixer.setTime(0)
      mixer.update(0)
      bones[0].updateWorldMatrix(true, true)
    }
  } catch { }

  // 智能检测BVH文件单位并返回合适的scale值（基于BVHViewer.vue的实现）
  function detectBVHUnitsAndScale(bones: THREE.Bone[]): number {
    const offsets: { boneName: string; length: number }[] = []

    // 收集所有骨骼的offset长度
    bones.forEach((bone, index) => {
      if (bone.parent && (bone.parent as any).isBone) {
        const offset = new THREE.Vector3()
        offset.setFromMatrixPosition(bone.matrix)
        const length = offset.length()

        if (length > 0.001) {
          // 过滤掉几乎为0的offset
          offsets.push({
            boneName: bone.name || `bone_${index}`,
            length: length,
          })
        }
      }
    })

    if (offsets.length === 0) {
      console.warn('未找到有效的骨骼offset，使用默认scale=1')
      return 1
    }

    // 按长度排序，取中位数作为参考
    offsets.sort((a, b) => b.length - a.length)

    const maxOffset = offsets[0].length
    const avgOffset = offsets.reduce((sum, item) => sum + item.length, 0) / offsets.length

    console.log('BVH单位检测:', {
      maxOffset: maxOffset.toFixed(3),
      avgOffset: avgOffset.toFixed(3),
      offsetCount: offsets.length,
    })

    // 判断单位的阈值（基于BVHViewer.vue的逻辑）
    const thresholdForCm = 15 // 如果最大offset > 15，认为是厘米
    const thresholdForM = 2 // 如果最大offset < 2，认为是米

    let detectedScale = 1
    let detectedUnit = 'cm'

    if (maxOffset > thresholdForCm) {
      // 大概率是厘米单位
      detectedScale = 1
      detectedUnit = 'cm'
      console.log(`✓ 检测到单位：厘米 (最大offset: ${maxOffset.toFixed(3)} > ${thresholdForCm})`)
    } else if (maxOffset < thresholdForM) {
      // 大概率是米单位
      detectedScale = 100
      detectedUnit = 'm'
      console.log(`✓ 检测到单位：米 (最大offset: ${maxOffset.toFixed(3)} < ${thresholdForM})`)
    } else {
      // 中间范围，使用平均值判断
      if (avgOffset > 5) {
        detectedScale = 1
        detectedUnit = 'cm'
        console.log(`✓ 基于平均值检测到单位：厘米 (平均offset: ${avgOffset.toFixed(3)} > 5)`)
      } else {
        detectedScale = 100
        detectedUnit = 'm'
        console.log(`✓ 基于平均值检测到单位：米 (平均offset: ${avgOffset.toFixed(3)} <= 5)`)
      }
    }

    console.log(`=== 单位检测完成：${detectedUnit}，scale=${detectedScale} ===`)
    return detectedScale
  }

  // 计算原始动画中的全局最低点（缩放前）
  function calculateOriginalGlobalMinY(bones: THREE.Bone[], clip?: THREE.AnimationClip): number {
    if (!clip) return 0

    const frameCount = 60
    const totalFrames = Math.ceil(clip.duration * frameCount)

    console.log('计算原始全局最低点，采样帧数:', totalFrames)

    const tempSkeleton = skeleton.clone()
    const tempMixer = new THREE.AnimationMixer(tempSkeleton.bones[0])
    const tempAction = tempMixer.clipAction(clip)
    tempAction.play()

    let originalGlobalMinY = Infinity

    for (let i = 0; i < totalFrames; i++) {
      const time = i / frameCount
      tempMixer.setTime(time)
      tempMixer.update(0)

      let frameMinY = Infinity
      tempSkeleton.bones.forEach(bone => {
        bone.updateWorldMatrix(true, false)
        const worldPos = new THREE.Vector3()
        bone.getWorldPosition(worldPos)

        if (worldPos.y < frameMinY) {
          frameMinY = worldPos.y
        }
      })

      if (frameMinY < originalGlobalMinY) {
        originalGlobalMinY = frameMinY
      }
    }

    tempMixer.stopAllAction()
    tempMixer.uncacheRoot(tempMixer.getRoot())

    return Number.isFinite(originalGlobalMinY) ? originalGlobalMinY : 0
  }

  // 预处理动画轨道数据 - 仅缩放并确保脚在地面上（基于BVHViewer.vue）
  function preprocessAnimationTracks(clip: THREE.AnimationClip, scale: number, globalMinY: number) {
    const positionTrack = clip.tracks.find(track => track.name === 'Hips.position')
    if (positionTrack) {
      const values = positionTrack.values
      const numValues = values.length

      // 只调整Y轴，确保脚在地面上，保持机器人原始的X、Z位置
      const offsetY = -globalMinY * scale

      console.log('预处理动画轨道:', {
        scale,
        globalMinY: globalMinY.toFixed(3),
        offsetY: offsetY.toFixed(3),
        valuesLength: numValues,
      })

      for (let i = 0; i < numValues; i += 3) {
        values[i] = values[i] * scale // X - 保持原始位置
        values[i + 1] = values[i + 1] * scale + offsetY // Y - 确保脚在地面上
        values[i + 2] = values[i + 2] * scale // Z - 保持原始位置
      }
    } else {
      console.warn('Position track not found in animation clip.')
    }
  }

  // 根容器（作为 RobotObject 挂到场景）
  const rootGroup = new THREE.Group()
  rootGroup.name = 'BVHRobotRoot'

  // 将骨架根挂到容器（骨骼自身层级保持不变）
  rootGroup.add(bones[0])

  // 智能检测BVH单位并设置合适的scale
  const detectedScale = detectBVHUnitsAndScale(bones)

  // 计算原始动画中的全局最低点，确保脚在地面上
  const originalGlobalMinY = calculateOriginalGlobalMinY(bones, clip)
  console.log('原始全局最低点 (缩放前):', originalGlobalMinY.toFixed(3))

  // 设置最终缩放 - 应用1.8%缩放（避免双重缩放）
  const finalScale = detectedScale * 0.018

  // 预处理动画轨道数据 - 使用最终缩放并确保脚在地面上，不强制居中
  if (clip) {
    preprocessAnimationTracks(clip, finalScale, originalGlobalMinY)
  }
  // 设置骨骼缩放用于可视化 - 不再应用缩放，因为动画轨道已经缩放过了
  bones[0].scale.set(1, 1, 1)

  // 坐标系对齐：将 BVH（Y-up）旋转到与 URDF 视图一致的 Z-up
  try {
    rootGroup.rotateX(-Math.PI / 2) // 使用-90度，让机器人正确站立
    rootGroup.updateMatrixWorld(true)

    // 旋转后重新调整位置，确保机器人在地面上
    try {
      const bbox = new THREE.Box3().setFromObject(rootGroup)
      const minY = bbox.min.y
      if (minY < 0) {
        rootGroup.position.y = -minY // 抬升到地面
      }
    } catch (error) {
      console.warn('BVH地面调整失败:', error)
      // 使用默认位置调整
      rootGroup.position.y = 0
    }
  } catch { }

  // 可视化：为每个关节创建球体；为每段骨骼创建圆柱体
  const jointMeshes: THREE.Mesh[] = []
  const boneMeshes: THREE.Mesh[] = []

  // 创建关节球体材质（基于BVHViewer.vue的高质量材质）
  const jointMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x66ccff, // 浅蓝色
    metalness: 0.6, // 金属感
    roughness: 0.2, // 光滑
    emissive: 0x1a3d5c, // 深蓝色发光
    emissiveIntensity: 0.4, // 发光强度
    transparent: true,
    opacity: 0.9, // 轻微透明
    clearcoat: 1.0, // 完全清漆层
    clearcoatRoughness: 0.1, // 很光滑的清漆
  })

  // 创建骨骼圆柱材质（基于BVHViewer.vue的锥形骨骼）
  const boneMaterial = new THREE.MeshPhysicalMaterial({
    color: boneColor,
    metalness: 0.4, // 金属感
    roughness: 0.3, // 适度粗糙
    emissive: 0x222222, // 灰色发光
    emissiveIntensity: 0.2, // 发光强度
    transparent: true,
    opacity: 0.85, // 轻微透明
    clearcoat: 0.8, // 清漆层
    clearcoatRoughness: 0.2, // 清漆粗糙度
    transmission: 0.1, // 透射效果
  })

  const jointGeometry = new THREE.SphereGeometry(0.2, 16, 16)
  const boneGeometry = new THREE.CylinderGeometry(0.04, 0.2, 1, 12) // 锥形骨骼增强视觉效果

  // 创建关节球体
  bones.forEach((bone, index) => {
    const j = new THREE.Mesh(jointGeometry, jointMaterial)
    j.name = `bvh_joint_${index}`
    j.castShadow = true
    j.receiveShadow = true
    j.scale.setScalar(jointSize)
    rootGroup.add(j)
    jointMeshes.push(j)
  })

  // 创建骨骼连线（圆柱体）
  bones.forEach((bone, index) => {
    if (bone.parent && (bone.parent as any).isBone) {
      const m = new THREE.Mesh(boneGeometry, boneMaterial)
      m.name = `bvh_bone_${index}`
      m.castShadow = true
      m.receiveShadow = true
      m.scale.x = boneThickness
      m.scale.z = boneThickness
      rootGroup.add(m)
      boneMeshes.push(m)
    }
  })

  // 记录每个骨骼的基础姿态与当前欧拉旋转（以便将 3 轴角度叠加）
  type BoneState = { baseQuat: THREE.Quaternion; euler: THREE.Euler }
  const boneStates = new Map<THREE.Bone, BoneState>()
  bones.forEach(b => {
    b.matrixAutoUpdate = true
    boneStates.set(b, {
      baseQuat: b.quaternion.clone(),
      euler: new THREE.Euler(0, 0, 0, eulerOrder),
    })
  })

  // 关节表：每个骨骼生成 x/y/z 三个"伪关节"（欧拉角三轴）
  const joints: JointsMap = {}
  const jointNameToSetter = new Map<string, (angle: number) => void>()

  function safeBoneName(bone: THREE.Bone, fallbackIndex: number): string {
    const n = (bone.name || '').trim()
    return n.length > 0 ? n : `bone_${fallbackIndex}`
  }

  bones.forEach((bone, index) => {
    const baseName = safeBoneName(bone, index)
      ; (['x', 'y', 'z'] as const).forEach(axis => {
        const jointName = `${baseName}_${axis}`
        joints[jointName] = { angle: 0, limit: { lower: -Math.PI, upper: Math.PI } }
        jointNameToSetter.set(jointName, (angle: number) => {
          const st = boneStates.get(bone)!
          // 限幅
          const lim = joints[jointName].limit
          const clamped = lim ? Math.max(lim.lower, Math.min(lim.upper, angle)) : angle
          joints[jointName].angle = clamped
          // 更新对应轴的欧拉角
          if (axis === 'x') st.euler.x = clamped
          if (axis === 'y') st.euler.y = clamped
          if (axis === 'z') st.euler.z = clamped
          // 应用：bone.quaternion = base * euler
          const q = new THREE.Quaternion().setFromEuler(st.euler)
          bone.quaternion.copy(st.baseQuat).multiply(q)
        })
      })
  })

  // 同步关节球与骨骼段可视化（基于BVHViewer.vue的更新逻辑）
  const tempV1 = new THREE.Vector3()
  const tempV2 = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const tmpQ = new THREE.Quaternion()

  function updateVisualization(): void {
    // 确保整棵骨架先更新一次世界矩阵，避免父子重叠
    if (bones[0]) bones[0].updateWorldMatrix(true, true)

    // 更新关节球体位置
    bones.forEach((bone, index) => {
      if (jointMeshes[index]) {
        bone.updateWorldMatrix(true, false)
        bone.getWorldPosition(tempV1)
        jointMeshes[index].position.copy(tempV1)
      }
    })

    // 更新骨骼圆柱位置和方向
    let boneMeshIndex = 0
    bones.forEach(bone => {
      if (bone.parent && (bone.parent as any).isBone && boneMeshes[boneMeshIndex]) {
        const boneMesh = boneMeshes[boneMeshIndex]

        bone.parent.updateWorldMatrix(true, false)
        bone.updateWorldMatrix(true, false)

        const parentWorldPos = new THREE.Vector3()
        const currentWorldPos = new THREE.Vector3()
        bone.parent.getWorldPosition(parentWorldPos)
        bone.getWorldPosition(currentWorldPos)

        const midPoint = new THREE.Vector3()
          .addVectors(parentWorldPos, currentWorldPos)
          .multiplyScalar(0.5)
        boneMesh.position.copy(midPoint)

        const direction = new THREE.Vector3().subVectors(currentWorldPos, parentWorldPos)
        const length = direction.length()

        boneMesh.scale.y = length

        if (length > 0.001) {
          const quaternion = new THREE.Quaternion()
          quaternion.setFromUnitVectors(up, direction.normalize())
          boneMesh.quaternion.copy(quaternion)
        }

        boneMeshIndex++
      }
    })
  }

  // 初始一次可视化同步
  updateVisualization()

  // 确保所有子对象可见
  rootGroup.traverse(obj => {
    ; (obj as any).visible = true
  })

    // 标记为BVH机器人（用于API中的特殊处理）
    ; (rootGroup as any).userData = (rootGroup as any).userData || {}
    ; (rootGroup as any).userData.__isBVHRobot = true

  // 批量更新节流：将多次 setJointValue 合并到同一帧只更新一次几何，提升性能
  let pendingVisualUpdate = false
  function scheduleVisualization(): void {
    if (pendingVisualUpdate) return
    pendingVisualUpdate = true
    requestAnimationFrame(() => {
      pendingVisualUpdate = false
      updateVisualization()
    })
  }
  // URDF 风格的"机器人对象"，直接复用 rootGroup 的变换（position/quaternion）
  const robotObj = rootGroup as unknown as RobotObject
    ; (robotObj as any).joints = joints

  // 控制函数：与 api.joint.setAngle / setAngles 对齐
  function setJointValue(jointName: string, angleRadians: number): boolean {
    const fn = jointNameToSetter.get(jointName)
    if (!fn) {
      console.warn(`[BVHRobot] 未找到关节: ${jointName}`)
      return false
    }
    fn(angleRadians)
    scheduleVisualization()
    return true
  }

  function setJointValues(jointAngles: Record<string, number>): boolean {
    let ok = true
    for (const [name, angle] of Object.entries(jointAngles)) {
      const r = setJointValue(name, angle as number)
      if (!r) ok = false
    }
    return ok
  }

  function dispose(): void {
    try {
      jointMeshes.forEach(m => {
        m.geometry.dispose()
        if (Array.isArray(m.material)) m.material.forEach(mm => mm.dispose())
        else m.material.dispose()
        m.removeFromParent()
      })
      boneMeshes.forEach(m => {
        if (m) {
          // 检查是否为null
          m.geometry.dispose()
          if (Array.isArray(m.material)) m.material.forEach(mm => mm.dispose())
          else m.material.dispose()
          m.removeFromParent()
        }
      })
    } catch { }
  }

  return {
    object3d: rootGroup,
    robot: robotObj,
    setJointValue,
    setJointValues,
    updateVisualization,
    dispose,
  }
}

/**
 * Store动态导入工具
 *
 * 使用动态导入避免循环依赖问题，安全地访问Pinia store模块。
 * 这是一个重要的架构设计，确保工具库可以独立使用而不强依赖于store。
 *
 * 设计原理：
 * - 异步导入：避免模块加载时的循环依赖
 * - 错误容忍：导入失败时不影响其他功能
 * - 回调模式：提供灵活的store访问方式
 *
 * 应用场景：
 * - BVH模式状态同步：通知store当前使用BVH格式
 * - 跨模块通信：工具库与Vue组件的状态同步
 * - 解耦设计：减少模块间的强耦合关系
 */
function useStore(callBack = (mod: any) => { }) {
  import('../store/motionEditor')
    .then((mod: any) => {
      callBack(mod)
    })
    .catch(() => { })
}

/**
 * BVH模式状态标记
 *
 * 全局标记当前是否处于BVH模式，用于API行为的条件判断。
 * 这个标记影响相机聚焦、包围盒计算等多个功能的具体实现。
 */
let isBVH = false
let currentBVHMetadata: BVHMetadata | null = null

const resolveBVHCanonicalName = (jointName: string): string | null => {
  if (!jointName) return null

  if (currentBVHMetadata) {
    const directIndex = currentBVHMetadata.nameToIndex[jointName]
    if (directIndex !== undefined) {
      return currentBVHMetadata.jointNames[directIndex]
    }
    const normalized = normalizeBVHJointName(jointName)
    if (normalized && currentBVHMetadata.nameToIndex[normalized] !== undefined) {
      return currentBVHMetadata.jointNames[currentBVHMetadata.nameToIndex[normalized]]
    }
  }

  const bones = (viewerRef as any)?.skeleton?.bones
  if (Array.isArray(bones)) {
    for (const bone of bones) {
      if (!bone || typeof bone.name !== 'string') continue
      if (bone.name === jointName) return bone.name
    }
    const normalized = normalizeBVHJointName(jointName)
    if (normalized) {
      const matchedBone = bones.find((bone: any) => normalizeBVHJointName(bone?.name) === normalized)
      if (matchedBone && typeof matchedBone.name === 'string') {
        return matchedBone.name
      }
    }
  }

  return null
}
const findBVHBone = (jointName: string, bonesOverride?: any[]): any | null => {
  const bones = Array.isArray(bonesOverride)
    ? bonesOverride
    : (viewerRef as any)?.skeleton?.bones
  if (!Array.isArray(bones)) return null

  const canonical = resolveBVHCanonicalName(jointName)
  const candidates = collectBVHNameVariants(jointName, canonical ?? undefined)

  for (const candidate of candidates) {
    const bone = bones.find((b: any) => b && b.name === candidate)
    if (bone) return bone
  }

  const normalized = normalizeBVHJointName(jointName)
  if (normalized) {
    const bone = bones.find((b: any) => normalizeBVHJointName(b?.name) === normalized)
    if (bone) return bone
  }

  return null
}

const getBVHJointIndex = (metadata: BVHMetadata | null, name: string): number | undefined => {
  if (!metadata || !name) return undefined
  if (metadata.nameToIndex[name] !== undefined) return metadata.nameToIndex[name]
  const normalized = normalizeBVHJointName(name)
  if (normalized && metadata.nameToIndex[normalized] !== undefined) {
    return metadata.nameToIndex[normalized]
  }
  return undefined
}

const getBVHRotationValueFromVariants = (
  frameData: FrameLike,
  variants: string[],
  axis: 'x' | 'y' | 'z'
): number => {
  for (const variant of variants) {
    if (!variant) continue
    const keys = [
      `${variant}_rotation_${axis}`,
      `${variant}_${axis}`,
      `${variant}${axis.toUpperCase()}`,
      `${variant}${axis}`,
    ]
    for (const key of keys) {
      const value = (frameData as any)[key]
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return value
      }
    }
  }
  return 0
}

/**
 * BVH模式设置器
 *
 * 设置当前的BVH模式状态，影响后续API调用的行为。
 * 主要用于在URDF和BVH模式之间切换时的状态管理。
 */
export function setIsBVH(to: boolean) {
  isBVH = to
  if (!to) {
    currentBVHMetadata = null
  }
}
/**
 * BVH机器人API挂载器
 *
 * 将构建完成的BVH机器人挂载到3D查看器，使其可以通过统一的API进行控制。
 * 这是BVH支持的关键步骤，实现了BVH机器人与URDF机器人的API统一。
 *
 * 挂载流程：
 * 1. 验证查看器：确保3D查看器已正确初始化
 * 2. 接口绑定：将BVH机器人的控制接口绑定到查看器
 * 3. 状态同步：更新全局BVH状态和store状态
 * 4. 场景集成：确保机器人对象已添加到3D场景
 * 5. 视图调整：自动调整相机以适合机器人显示
 * 6. 渲染刷新：触发渲染更新显示变化
 *
 * 技术特点：
 * - 统一接口：BVH机器人使用与URDF相同的控制API
 * - 自动集成：自动处理场景添加和状态同步
 * - 容错设计：各步骤独立，单步失败不影响整体
 * - 即时生效：挂载后立即可用，无需额外配置
 *
 * 这个函数是BVH支持的核心，实现了格式无关的机器人控制体验。
 */
export function attachBVHRobotToAPI(build: BVHRobotBuildResult): void {
  if (!viewerRef) {
    console.warn('[attachBVHRobotToAPI] viewer 未初始化，请先调用 initAPI')
    return
  }
  ; (viewerRef as any).robot = build.robot
    ; (viewerRef as any).setJointValue = build.setJointValue
    ; (viewerRef as any).setJointValues = build.setJointValues
  isBVH = true
  useStore((mod: any) => {
    try {
      const store = mod.useRobotModelStore()
      store.setIsBVH(true)
    } catch { }
  })
  try {
    const inScene = (viewerRef as any).scene?.children?.includes?.(build.object3d)
    if (!inScene && (viewerRef as any).scene) (viewerRef as any).scene.add(build.object3d)
  } catch { }
  try {
    focusCameraOnRobot()
  } catch { }
  try {
    ; (api as any).forceRender?.()
  } catch { }
}

/**
 * BVH缩放系数
 *
 * 用于BVH数据的全局缩放，目前设置为1表示不缩放。
 * 这个系数可以根据需要调整BVH机器人的整体尺寸。
 */
const bvhScale = 1
/**
 * 机器人相机聚焦器
 *
 * 自动调整3D相机位置和角度，确保机器人完整显示在视野中。
 * 支持URDF和BVH两种机器人格式，使用不同的包围盒计算策略。
 *
 * 核心功能：
 * - 智能包围盒：根据机器人类型计算准确的空间范围
 * - 相机定位：基于视场角和包围盒自动计算最佳相机距离
 * - 视角优化：确保机器人在视野中心且完整可见
 * - 容错处理：包围盒计算失败时使用合理的默认值
 *
 * 计算策略：
 * - BVH模式：遍历所有骨骼节点，计算世界坐标包围盒
 * - URDF模式：使用Three.js内置的对象包围盒计算
 * - 距离计算：基于相机FOV和包围盒最大尺寸的几何计算
 * - 高度调整：确保相机位置略高于机器人中心
 *
 * 技术特点：
 * - 双模式支持：URDF和BVH机器人的统一处理
 * - 数学精确：基于透视投影的精确距离计算
 * - 视觉优化：合理的padding确保机器人不会贴边显示
 * - 平滑过渡：保持当前视角方向，只调整距离和目标
 *
 * 这个函数解决了"机器人加载后看不见"的常见问题，提供了专业的相机控制体验。
 */
export function focusCameraOnRobot(padding: number = 1.35): void {
  const v = viewerRef as any
  if (!v || !v.scene || !v.camera || !v.controls || !v.robot) return

  let bbox: THREE.Box3
  if (isBVH) {
    bbox = new THREE.Box3()
    try {
      const robot = v.robot
      if (robot.skeleton && robot.skeleton.bones) {
        robot.skeleton.bones.forEach((bone: any) => {
          if (bone && typeof bone.updateWorldMatrix === 'function') {
            bone.updateWorldMatrix(true, true)
            const worldPos = new THREE.Vector3()
            bone.getWorldPosition(worldPos)
            bbox.expandByPoint(worldPos)
          }
        })
      }
      if (bbox.isEmpty()) {
        bbox.setFromCenterAndSize(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0.6, 1.7, 0.3))
      }
    } catch (error) {
      console.warn('BVH相机聚焦失败，使用默认值:', error)
      bbox.setFromCenterAndSize(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0.6, 1.7, 0.3))
    }
  } else {
    bbox = new THREE.Box3().setFromObject(v.robot as any)
  }
  if (!bbox.isEmpty()) {
    const center = bbox.getCenter(new THREE.Vector3())
    const size = bbox.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = ((v.camera.fov || 45) * Math.PI) / 180
    const distance = (maxDim * padding) / Math.tan(fov / 2)
    v.controls.target.copy(center)
    const dir = new THREE.Vector3(0, 0, 1)
    v.camera.getWorldDirection(dir)
    if (!Number.isFinite(dir.lengthSq()) || dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
    const pos = center.clone().addScaledVector(dir.normalize(), -distance)
    pos.y = Math.max(center.y + maxDim * 0.4, center.y + 1)
    v.camera.position.copy(pos)
    v.camera.updateProjectionMatrix?.()
    v.controls.update?.()
  }
}

/**
 * BVH前视相机定位器
 *
 * 在编辑BVH动作时，根据骨骼身高和root朝向智能设置摄像机位置。
 * 摄像机位置 = root位置 + root朝向前方 × (身高 × 1.5)
 */
export function focusBVHFrontView(options: {
  paddingMultiplier?: number
  verticalOffsetRatio?: number
  direction?: THREE.Vector3
} = {}): void {
  console.log('[focusBVHFrontView] 被调用', { viewerRef: !!viewerRef, isBVH, options })
  if (!viewerRef || !isBVH) {
    console.warn('[focusBVHFrontView] 提前返回:', { viewerRef: !!viewerRef, isBVH })
    return
  }
  const v = viewerRef as any

  try {
    // 尝试从 skeleton 获取根骨骼
    let skeleton = v?.skeleton

    // 如果没有直接的 skeleton，从 scene 中查找 SkinnedMesh
    if (!skeleton && v?.scene) {
      v.scene.traverse((obj: any) => {
        if (!skeleton && obj.isSkinnedMesh && obj.skeleton) {
          skeleton = obj.skeleton
        }
      })
    }

    if (!skeleton || !skeleton.bones || skeleton.bones.length === 0) {
      console.warn('[focusBVHFrontView] 未找到骨骼')
      return
    }

    // 获取根骨骼
    const rootBone = skeleton.bones[0]
    rootBone.updateWorldMatrix(true, true)

    // 获取根骨骼的世界位置
    const rootPosition = new THREE.Vector3()
    rootBone.getWorldPosition(rootPosition)

    // 获取根骨骼的世界四元数（朝向）
    const rootQuaternion = new THREE.Quaternion()
    rootBone.getWorldQuaternion(rootQuaternion)

    // 计算骨骼身高：遍历所有骨骼，找到最大Y和最小Y
    let minY = Infinity
    let maxY = -Infinity

    skeleton.bones.forEach((bone: any) => {
      bone.updateWorldMatrix(true, true)
      const worldPos = new THREE.Vector3()
      bone.getWorldPosition(worldPos)
      minY = Math.min(minY, worldPos.y)
      maxY = Math.max(maxY, worldPos.y)
    })

    const skeletonHeight = maxY - minY

    console.log('[focusBVHFrontView] 骨骼信息:', {
      rootPosition: { x: rootPosition.x, y: rootPosition.y, z: rootPosition.z },
      rootQuaternion: { x: rootQuaternion.x, y: rootQuaternion.y, z: rootQuaternion.z, w: rootQuaternion.w },
      minY,
      maxY,
      skeletonHeight
    })

    // 计算root的前方向量（Z轴负方向在局部坐标系中通常是前方）
    const forwardDirection = new THREE.Vector3(0, 0, 1)
    forwardDirection.applyQuaternion(rootQuaternion)
    forwardDirection.normalize()

    // 计算摄像机距离：身高 × 1.5
    const cameraDistance = skeletonHeight * 2

    // 计算摄像机位置：root位置 + 前方向 × 距离
    const cameraPosition = rootPosition.clone().add(
      forwardDirection.multiplyScalar(cameraDistance)
    )

    console.log('[focusBVHFrontView] 计算结果:', {
      forwardDirection: { x: forwardDirection.x, y: forwardDirection.y, z: forwardDirection.z },
      cameraDistance,
      cameraPosition: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z }
    })

    // 直接设置 viewer 的 camera 位置
    if (v.camera) {
      v.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z)
      console.log('[focusBVHFrontView] 设置 v.camera.position')
    }

    // 设置 controls 的 target 为 root 位置
    if (v.controls && v.controls.target) {
      v.controls.target.set(rootPosition.x, rootPosition.y, rootPosition.z)
      console.log('[focusBVHFrontView] 设置 v.controls.target')
    }

    // 让摄像机看向 root 位置
    v.camera?.lookAt?.(rootPosition)
    console.log('[focusBVHFrontView] 调用 lookAt')

    // 更新 controls
    v.controls?.update?.()
    console.log('[focusBVHFrontView] 调用 controls.update')

    // 手动渲染
    if (v.renderer) {
      v.renderer.render(v.scene, v.camera)
      console.log('[focusBVHFrontView] 手动渲染')
    }

    console.log('[focusBVHFrontView] 设置完成:', {
      finalCameraPos: v.camera ? { x: v.camera.position.x, y: v.camera.position.y, z: v.camera.position.z } : null,
      finalTarget: v.controls?.target ? { x: v.controls.target.x, y: v.controls.target.y, z: v.controls.target.z } : null
    })

  } catch (error) {
    console.error('[focusBVHFrontView] 执行失败:', error)
  }
}

/**
 * BVH到MotionJSON转换器（支持Mixamo）
 *
 * 将BVH动作捕捉文件转换为动作编辑器使用的MotionJSON格式。
 * 这是支持BVH格式的核心转换功能，实现了格式间的无缝桥接，特别针对Mixamo文件进行了优化。
 *
 * 转换流程：
 * 1. 文件解析：支持文本和二进制BVH文件的解析
 * 2. Mixamo检测：自动识别并处理Mixamo BVH文件
 * 3. 结构分析：解析BVH的骨骼层次结构和通道信息
 * 4. 数据修复：修复Mixamo文件的旋转数据和轨道问题
 * 5. 数据提取：提取帧率、帧数和运动数据
 * 6. 格式转换：将BVH数据转换为MotionJSON结构
 * 7. 尺寸适配：智能缩放确保机器人尺寸合适
 *
 * 核心特性：
 * - 完整解析：支持BVH文件的完整结构解析
 * - Mixamo支持：专门处理Mixamo BVH文件的兼容性问题
 * - 智能映射：将BVH关节映射为欧拉角三轴控制
 * - 单位处理：自动检测和处理不同的长度单位
 * - 坐标转换：处理BVH和MotionJSON间的坐标系差异
 * - 数据完整性：确保转换后的数据格式正确
 *
 * Mixamo增强功能：
 * - 自动检测：通过'mixamorig:'前缀识别Mixamo文件
 * - 数据质量检查：验证旋转轨道数据的有效性
 * - 自定义解析器：处理标准解析器无法正确解析的Mixamo文件
 * - 通道映射：正确解析Mixamo特有的通道结构
 * - 旋转修复：修复骨骼旋转顺序和四元数转换问题
 * - 轨道重建：重新构建正确的动画轨道
 *
 * 技术实现：
 * - Three.js集成：使用BVHLoader和AnimationMixer进行精确解析
 * - 递归遍历：构建完整的骨骼层次结构
 * - 数据映射：将BVH通道数据映射到标准关节角度
 * - 缩放计算：基于骨骼长度的智能缩放算法
 * - 格式标准化：输出符合MotionJSON规范的数据
 *
 * 数据结构：
 * - floating_base_joint：机器人基座的位置和姿态
 * - 关节角度：每个BVH骨骼对应X/Y/Z三个旋转轴
 * - 帧率信息：保持原始BVH的时间信息
 * - 元数据：包含缩放和适配信息
 *
 * 这个转换器使BVH动作数据（包括Mixamo文件）能够在动作编辑器中无缝使用，大大扩展了编辑器的格式支持能力。
 */
// 解析BVH文件的CHANNELS定义
function parseBVHChannels(lines: string[]) {
  const channelMapping: Record<string, any> = {}
  let currentBone: string | null = null
  let dataIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 检测ROOT或JOINT定义
    if (line.startsWith('ROOT ') || line.startsWith('JOINT ')) {
      const boneName = line.split(' ')[1]
      currentBone = boneName
      continue
    }

    // 检测CHANNELS定义
    if (line.startsWith('CHANNELS ') && currentBone) {
      const parts = line.split(' ')
      const channelCount = parseInt(parts[1])
      const channelTypes = parts.slice(2)

      console.log(`骨骼 ${currentBone}: ${channelCount} 通道 [${channelTypes.join(', ')}]`)

      const channels = {
        position: [] as number[],
        rotation: [] as number[],
      }

      // 根据通道类型分配数据索引
      for (let j = 0; j < channelTypes.length; j++) {
        const channelType = channelTypes[j]

        if (channelType.includes('position')) {
          if (channelType === 'Xposition') channels.position[0] = dataIndex
          else if (channelType === 'Yposition') channels.position[1] = dataIndex
          else if (channelType === 'Zposition') channels.position[2] = dataIndex
        } else if (channelType.includes('rotation')) {
          if (channelType === 'Xrotation') channels.rotation[0] = dataIndex
          else if (channelType === 'Yrotation') channels.rotation[1] = dataIndex
          else if (channelType === 'Zrotation') channels.rotation[2] = dataIndex
        }

        dataIndex++
      }

      channelMapping[currentBone] = channels
    }

    // 遇到MOTION就停止解析
    if (line === 'MOTION') {
      break
    }
  }

  return channelMapping
}
// 自定义Mixamo BVH解析器 - 修复Three.js BVHLoader的Mixamo兼容性问题
function parseCustomMixamoBVH(bvhText: string, originalResult: any) {
  console.log('=== 开始自定义Mixamo BVH解析 ===')

  try {
    // 解析动画数据部分
    const lines = bvhText.split('\n')
    const motionIndex = lines.findIndex(line => line.trim() === 'MOTION')

    if (motionIndex === -1) {
      console.warn('未找到MOTION部分')
      return null
    }

    // 读取帧数和帧时间
    const framesLine = lines[motionIndex + 1]
    const frameTimeLine = lines[motionIndex + 2]

    const frameMatch = framesLine.match(/Frames:\s*(\d+)/)
    const frameTimeMatch = frameTimeLine.match(/Frame Time:\s*([\d.]+)/)

    if (!frameMatch || !frameTimeMatch) {
      console.warn('无法解析帧数或帧时间')
      return null
    }

    const frameCount = parseInt(frameMatch[1])
    const frameTime = parseFloat(frameTimeMatch[1])

    console.log(`解析到: ${frameCount} 帧, 帧时间: ${frameTime}`)

    // 解析动画数据
    const dataLines = lines.slice(motionIndex + 3, motionIndex + 3 + frameCount)
    console.log(`动画数据行数: ${dataLines.length}`)

    if (dataLines.length === 0) {
      console.warn('没有找到动画数据')
      return null
    }

    // 解析BVH文件的CHANNELS定义来确定正确的数据映射
    const channelMapping = parseBVHChannels(lines)
    console.log('解析到的通道映射:', Object.keys(channelMapping).length, '个骨骼')

    // 基于通道映射重新创建正确的动画轨道
    const newTracks: THREE.KeyframeTrack[] = []

    // 创建时间数组
    const times = new Float32Array(frameCount)
    for (let i = 0; i < frameCount; i++) {
      times[i] = i * frameTime
    }

    // 为每个有通道的骨骼创建轨道（位置 + 四元数旋转）
    Object.entries(channelMapping).forEach(([boneName, channels]: [string, any]) => {
      const bone = originalResult.skeleton.bones.find((b: THREE.Bone) => b.name === boneName)
      if (!bone) {
        console.warn(`❌ 未找到骨骼: ${boneName}`)
        return
      }

      console.log(`✅ 为骨骼 ${boneName} 创建轨道`)

      // 检查是否有位置通道
      const hasPosition = channels.position.length === 3
      const hasRotation = channels.rotation.length === 3

      if (hasPosition) {
        // 创建位置轨道
        const positionValues = new Float32Array(frameCount * 3)
        for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
          const frameData = dataLines[frameIdx].trim().split(/\s+/).map(parseFloat)
          positionValues[frameIdx * 3] = frameData[channels.position[0]] // X位置
          positionValues[frameIdx * 3 + 1] = frameData[channels.position[1]] // Y位置
          positionValues[frameIdx * 3 + 2] = frameData[channels.position[2]] // Z位置
        }

        const positionTrack = new THREE.VectorKeyframeTrack(
          bone.name + '.position',
          times,
          positionValues
        )
        newTracks.push(positionTrack)
      }

      if (hasRotation) {
        // 创建四元数旋转轨道（从XYZ欧拉角生成）
        const quatValues = new Float32Array(frameCount * 4)
        for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
          const frameData = dataLines[frameIdx].trim().split(/\s+/).map(parseFloat)
          const ex = (frameData[channels.rotation[0]] * Math.PI) / 180
          const ey = (frameData[channels.rotation[1]] * Math.PI) / 180
          const ez = (frameData[channels.rotation[2]] * Math.PI) / 180
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ex, ey, ez, 'XYZ'))
          const base = frameIdx * 4
          quatValues[base] = q.x
          quatValues[base + 1] = q.y
          quatValues[base + 2] = q.z
          quatValues[base + 3] = q.w
        }

        const trackName = bone.name + '.quaternion'
        const rotationTrack = new THREE.QuaternionKeyframeTrack(trackName, times, quatValues)
        newTracks.push(rotationTrack)

        console.log(
          `🎭 创建四元数轨道: ${trackName}, 值数量: ${quatValues.length}, 时间数量: ${times.length}`
        )
      }
    })

    console.log(`创建了 ${newTracks.length} 个新轨道`)

    // 创建新的动画剪辑
    const newClip = new THREE.AnimationClip('mixamo_animation', frameCount * frameTime, newTracks)

    // 返回修复后的结果
    const fixedResult = {
      skeleton: originalResult.skeleton,
      clip: newClip,
    }

    console.log('自定义解析完成，新动画时长:', newClip.duration)
    return fixedResult
  } catch (error) {
    console.error('自定义Mixamo解析失败:', error)
    return null
  }
}

// 修复骨骼旋转顺序问题 - 专门处理Mixamo BVH文件
function fixBoneRotationOrder(result: any) {
  console.log('=== 开始修复Mixamo BVH文件 ===')

  if (!result.skeleton || !result.skeleton.bones) {
    console.warn('没有找到骨骼数据')
    return
  }

  // 检测是否是Mixamo BVH文件
  const isMixamoFile = result.skeleton.bones.some(
    (bone: THREE.Bone) => bone.name && bone.name.includes('mixamorig:')
  )

  console.log('是否为Mixamo文件:', isMixamoFile)
  console.log('骨骼总数:', result.skeleton.bones.length)

  if (!isMixamoFile) {
    console.log('非Mixamo文件，跳过特殊处理')
    return
  }

  // Mixamo文件特殊处理
  console.log('🔧 开始Mixamo文件修复...')

  // 1. 修复骨骼旋转顺序
  result.skeleton.bones.forEach((bone: THREE.Bone, index: number) => {
    if (bone) {
      // Mixamo文件使用XYZ旋转顺序，但Three.js可能解析错误
      bone.rotation.order = 'XYZ'

      // 确保四元数标准化
      if (bone.quaternion) {
        bone.quaternion.normalize()
      }

      // 对于根骨骼，确保初始变换正确
      if (index === 0) {
        console.log('根骨骼初始状态:', {
          position: bone.position.toArray(),
          rotation: bone.rotation.toArray(),
          scale: bone.scale.toArray(),
        })
      }
    }
  })
  // 2. 修复动画轨道
  if (result.clip && result.clip.tracks) {
    console.log('原始轨道数量:', result.clip.tracks.length)

    const positionTracks = result.clip.tracks.filter((track: THREE.KeyframeTrack) =>
      track.name.includes('.position')
    )
    const rotationTracks = result.clip.tracks.filter((track: THREE.KeyframeTrack) =>
      track.name.includes('.rotation')
    )

    console.log(`位置轨道: ${positionTracks.length}, 旋转轨道: ${rotationTracks.length}`)

    // 3. 处理过多的位置轨道问题
    // Mixamo文件很多骨骼都有位置轨道，但实际上只有根骨骼需要位置动画
    const rootPositionTrack = positionTracks.find(
      (track: THREE.KeyframeTrack) =>
        track.name === 'Pelvis.position' ||
        track.name.includes('mixamorig:Hips.position') ||
        track.name.includes('Pelvis.position')
    )

    if (rootPositionTrack) {
      console.log('找到根骨骼位置轨道:', rootPositionTrack.name)

      // 过滤掉非根骨骼的位置轨道，只保留旋转轨道
      const filteredTracks = result.clip.tracks.filter((track: THREE.KeyframeTrack) => {
        if (track.name.includes('.position')) {
          // 只保留根骨骼的位置轨道
          return track === rootPositionTrack
        }
        return true // 保留所有旋转轨道和其他轨道
      })

      console.log(`轨道过滤: ${result.clip.tracks.length} → ${filteredTracks.length}`)
      result.clip.tracks = filteredTracks
    }

    // 5. 重新计算动画时长
    result.clip.resetDuration()
    console.log('修复后动画时长:', result.clip.duration)
  }

  console.log('=== Mixamo BVH文件修复完成 ===')
}

// 重建动画轨道以确保旋转数据正确应用
function rebuildAnimationTracks(result: any) {
  console.log('=== 开始最终动画轨道验证 ===')

  if (!result.clip || !result.clip.tracks) {
    console.warn('没有找到动画轨道')
    return
  }

  // 最终验证：确保所有轨道数据完整性
  let fixedTracks = 0
  result.clip.tracks.forEach((track: THREE.KeyframeTrack) => {
    if (track.values && track.times) {
      // 检查数据完整性
      let hasInvalidValues = false
      for (let i = 0; i < track.values.length; i++) {
        if (!isFinite(track.values[i]) || isNaN(track.values[i])) {
          track.values[i] = 0
          hasInvalidValues = true
        }
      }

      if (hasInvalidValues) {
        fixedTracks++
        console.warn(`轨道 ${track.name} 包含无效值，已修复`)
      }
    }
  })

  if (fixedTracks > 0) {
    console.log(`修复了 ${fixedTracks} 个轨道的无效数据`)
  }

  console.log('最终轨道数量:', result.clip.tracks.length)
  console.log('=== 动画轨道验证完成 ===')
}

export interface ConvertBVHToMotionJSONOptions {
  eulerOrder?: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
  parserType?: 'legacy' | 'bvhParse' | 'viewer'
  bvhParseData?: BvhParseData
  bvhParseRequest?: {
    project?: ParseBvhByProjectRequest
    motionHub?: ProcessMotionHubBvhRequest
    preferMotionHub?: boolean
    orientationFieldName?: string
  }
}
async function convertBVHToMotionJSONLegacy(
  bvhContent: string | ArrayBuffer,
  options: ConvertBVHToMotionJSONOptions = {}
): Promise<MotionJSON> {
  let text: string
  if (typeof bvhContent === 'string') text = bvhContent
  else text = new TextDecoder().decode(bvhContent)

  const lines = text.split('\n').map(line => line.trim())

  const frameMatch = text.match(/Frames:\s*(\d+)/i)
  const frameTimeMatch = text.match(/Frame Time:\s*([\d.]+)/i)
  let frames = frameMatch ? Math.max(1, parseInt(frameMatch[1])) : 1
  let frameTime = frameTimeMatch ? Math.max(1e-6, parseFloat(frameTimeMatch[1])) : 0.033333
  let framerate = frameTime > 1e-8 ? 1 / frameTime : 30

  interface Joint {
    name: string
    channels: string[]
    offset: [number, number, number]
  }

  const joints: Joint[] = []
  let rootJoint: Joint | null = null
  let currentJoint: Joint | null = null
  let motionStartLine = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('ROOT ')) {
      const name = line.substring(5).trim()
      rootJoint = { name, channels: [], offset: [0, 0, 0] }
      currentJoint = rootJoint
      joints.push(rootJoint)
    } else if (line.startsWith('JOINT ')) {
      const name = line.substring(6).trim()
      currentJoint = { name, channels: [], offset: [0, 0, 0] }
      joints.push(currentJoint)
    } else if (line.startsWith('OFFSET ')) {
      if (currentJoint) {
        const values = line.substring(7).trim().split(/\s+/).map(parseFloat)
        if (values.length >= 3) {
          currentJoint.offset = [values[0], values[1], values[2]]
        }
      }
    } else if (line.startsWith('CHANNELS ')) {
      if (currentJoint) {
        const parts = line.substring(9).trim().split(/\s+/)
        const channelCount = parseInt(parts[0])
        currentJoint.channels = parts.slice(1, channelCount + 1)
      }
    } else if (line === 'MOTION') {
      motionStartLine = i
      break
    }
  }

  if (!rootJoint || motionStartLine === -1) {
    throw new Error('BVH 解析失败：缺少根关节或运动数据')
  }

  const jointNames: string[] = []
  joints.forEach(joint => {
    const rotationChannels = joint.channels.filter(ch => ch.toLowerCase().includes('rotation'))
    if (rotationChannels.length > 0) {
      jointNames.push(`${joint.name}_x`, `${joint.name}_y`, `${joint.name}_z`)
    }
  })
  const dof_names: string[] = ['floating_base_joint', ...jointNames]

  const data: number[][] = []

  const loader = new BVHLoader()
  let bvhResult = loader.parse(text)

  const isMixamoFile = bvhResult.skeleton.bones.some(
    (bone: THREE.Bone) => bone.name && bone.name.includes('mixamorig:')
  )

  if (isMixamoFile) {
    const rotationTracks = bvhResult.clip.tracks.filter(
      (track: THREE.KeyframeTrack) =>
        track.name.includes('.quaternion') || track.name.includes('.rotation')
    )
    let hasValidRotationData = false

    if (rotationTracks.length > 0) {
      for (let i = 0; i < Math.min(3, rotationTracks.length); i++) {
        const track = rotationTracks[i]
        if (track.values && track.values.length > 0) {
          const maxValue = Math.max(...track.values.map(Math.abs))
          if (maxValue > 0.01) {
            hasValidRotationData = true
            break
          }
        }
      }
    }

    if (!hasValidRotationData) {
      const customResult = parseCustomMixamoBVH(text, bvhResult)
      if (customResult) {
        bvhResult = customResult
      }
    }
  }

  if (isMixamoFile) {
    fixBoneRotationOrder(bvhResult)
    rebuildAnimationTracks(bvhResult)
  }

  if (bvhResult.clip) {
    const clip = bvhResult.clip
    const duration = clip.duration
    const tracks = clip.tracks

    if (tracks && tracks.length > 0) {
      const positionTrack = tracks.find(
        track =>
          track.name.includes('position') ||
          track.name.includes('Hips') ||
          track.name.includes('.position')
      )

      if (positionTrack && positionTrack.times) {
        const timeArray = positionTrack.times
        const actualFrameCount = timeArray.length

        frames = actualFrameCount

        if (timeArray.length > 1 && duration > 0) {
          const timeStep = timeArray[1] - timeArray[0]
          const calculatedFrameRate = timeStep > 0 ? 1 / timeStep : 30
          framerate = Math.round(calculatedFrameRate)

          if (framerate > 0) {
            ; (frameTime as any) = 1 / framerate
          }
        }
      }
    }
  }

  const mixer = new THREE.AnimationMixer(bvhResult.skeleton.bones[0])
  let currentAction = mixer.clipAction(bvhResult.clip)
  currentAction.setLoop(THREE.LoopOnce, 0)
  currentAction.clampWhenFinished = true
  currentAction.play()

  const boneByName = new Map<string, THREE.Bone>()
  bvhResult.skeleton.bones.forEach((bone: THREE.Bone) => {
    if (bone.name) {
      boneByName.set(bone.name, bone)
    }
  })

  const resolveBoneForJoint = (jointName: string): THREE.Bone | undefined => {
    const candidates = [
      jointName,
      jointName.startsWith('mixamorig:')
        ? jointName.replace('mixamorig:', '')
        : `mixamorig:${jointName}`,
      jointName.replace(/^mixamorig:/, ''),
    ]
    for (const name of candidates) {
      const b = boneByName.get(name)
      if (b) return b
    }
    return undefined
  }

  try {
    if (bvhResult.clip && Array.isArray(bvhResult.clip.tracks)) {
      bvhResult.clip.tracks.forEach((track: THREE.KeyframeTrack) => {
        if (track.name.includes('.quaternion')) {
          const rawName = track.name.replace('.quaternion', '')
          const bone = resolveBoneForJoint(rawName)
          if (bone && track.name !== `${bone.uuid}.quaternion`) {
            track.name = `${bone.uuid}.quaternion`
          }
        } else if (track.name.includes('.position')) {
          const rawName = track.name.replace('.position', '')
          const bone = resolveBoneForJoint(rawName)
          if (bone && track.name !== `${bone.uuid}.position`) {
            track.name = `${bone.uuid}.position`
          }
        }
      })
      bvhResult.clip = new THREE.AnimationClip(
        bvhResult.clip.name,
        bvhResult.clip.duration,
        bvhResult.clip.tracks
      )
      currentAction = mixer.clipAction(bvhResult.clip)
      currentAction.setLoop(THREE.LoopOnce, 0)
      currentAction.clampWhenFinished = true
      currentAction.play()
    }
  } catch (e) {
    console.warn('轨道UUID绑定修正失败，继续使用原始轨道名称:', e)
  }

  for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
    const time = frameIndex * frameTime

    mixer.setTime(time)
    currentAction.time = time
    mixer.update(0)

    bvhResult.skeleton.bones.forEach((bone: THREE.Bone) => {
      bone.updateWorldMatrix(true, true)
    })

    const frameData: Record<string, number> = {}

    if (rootJoint) {
      const rootBone = resolveBoneForJoint(rootJoint.name) || bvhResult.skeleton.bones[0]
      if (rootBone) {
        frameData['global_x'] = rootBone.position.x
        frameData['global_y'] = rootBone.position.y
        frameData['global_z'] = rootBone.position.z
      }
    }

    joints.forEach(joint => {
      const rotationChannels = joint.channels.filter(ch => ch.toLowerCase().includes('rotation'))
      if (rotationChannels.length > 0) {
        const bone = resolveBoneForJoint(joint.name)
        if (bone) {
          const rotationX = (bone.rotation.x * 180) / Math.PI
          const rotationY = (bone.rotation.y * 180) / Math.PI
          const rotationZ = (bone.rotation.z * 180) / Math.PI

          frameData[`${joint.name}_x`] = rotationX
          frameData[`${joint.name}_y`] = rotationY
          frameData[`${joint.name}_z`] = rotationZ
        }
      }
    })

    frameData['quater_x'] = 0
    frameData['quater_y'] = 0
    frameData['quater_z'] = 0
    frameData['quater_w'] = 1

    const row: number[] = []
    for (const dofName of dof_names) {
      if (dofName === 'floating_base_joint') {
        row.push(
          frameData['global_x'] || 0,
          frameData['global_y'] || 0,
          frameData['global_z'] || 0,
          frameData['quater_x'] || 0,
          frameData['quater_y'] || 0,
          frameData['quater_z'] || 0,
          frameData['quater_w'] || 1
        )
      } else {
        row.push(frameData[dofName] || 0)
      }
    }
    data.push(row)
  }

  const rootJointName = rootJoint.name

  const detectBVHUnitsAndScale = (result: any): number => {
    const bones = result.skeleton.bones
    const offsets: Array<{ boneName: string; length: number; offset: THREE.Vector3 }> = []

    bones.forEach((bone: any, index: number) => {
      if (bone.parent && (bone.parent as THREE.Bone).isBone) {
        const offset = new THREE.Vector3()
        offset.setFromMatrixPosition(bone.matrix)
        const length = offset.length()

        if (length > 0.001) {
          offsets.push({
            boneName: bone.name || `bone_${index}`,
            length: length,
            offset: offset,
          })
        }
      }
    })

    if (offsets.length === 0) {
      console.warn('未找到有效的骨骼offset，使用默认scale=1')
      return 1
    }

    offsets.sort((a, b) => b.length - a.length)

    const maxOffset = offsets[0].length
    const avgOffset = offsets.reduce((sum, item) => sum + item.length, 0) / offsets.length

    const thresholdForCm = 15
    const thresholdForM = 2

    let detectedScale = 1

    if (maxOffset > thresholdForCm) {
      detectedScale = 1
    } else if (maxOffset < thresholdForM) {
      detectedScale = 100
    } else {
      const possibleLegBones = offsets.filter(
        item =>
          item.boneName.toLowerCase().includes('leg') ||
          item.boneName.toLowerCase().includes('thigh') ||
          item.boneName.toLowerCase().includes('upleg') ||
          item.length > avgOffset * 1.5
      )

      if (possibleLegBones.length > 0) {
        const avgLegLength =
          possibleLegBones.reduce((sum, item) => sum + item.length, 0) / possibleLegBones.length

        if (avgLegLength > 8) {
          detectedScale = 1
        } else {
          detectedScale = 100
        }
      } else {
        if (avgOffset > 5) {
          detectedScale = 1
        } else {
          detectedScale = 100
        }
      }
    }

    return detectedScale
  }

  const bvhScale = detectBVHUnitsAndScale(bvhResult)

  let robotHeight = 0
  const boneTree: Record<string, { name: string; offset: [number, number, number]; children: string[] }> = {}
  let currentBoneName = ''
  const boneStack: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('ROOT ') || line.startsWith('JOINT ')) {
      const name = line.startsWith('ROOT ') ? line.substring(5).trim() : line.substring(6).trim()
      currentBoneName = name
      boneTree[name] = { name, offset: [0, 0, 0], children: [] }
      if (boneStack.length > 0) {
        const parent = boneStack[boneStack.length - 1]
        if (boneTree[parent]) {
          boneTree[parent].children.push(name)
        }
      }
      boneStack.push(name)
    } else if (line.startsWith('OFFSET ')) {
      if (currentBoneName && boneTree[currentBoneName]) {
        const values = line.substring(7).trim().split(/\s+/).map(parseFloat)
        if (values.length >= 3) {
          boneTree[currentBoneName].offset = [values[0], values[1], values[2]]
        }
      }
    } else if (line === '}') {
      if (boneStack.length > 0) {
        boneStack.pop()
        currentBoneName = boneStack[boneStack.length - 1] || ''
      }
    } else if (line === 'MOTION') {
      break
    }
  }

  const calculateHeightFromBone = (boneName: string, currentHeight: number): number => {
    const bone = boneTree[boneName]
    if (!bone) return currentHeight

    const yOffset = Math.abs(bone.offset[1])
    const totalHeight = currentHeight + yOffset

    let maxChildHeight = totalHeight

    for (const childName of bone.children) {
      const childHeight = calculateHeightFromBone(childName, totalHeight)
      maxChildHeight = Math.max(maxChildHeight, childHeight)
    }

    return maxChildHeight
  }

  if (rootJoint && boneTree[rootJoint.name]) {
    robotHeight = calculateHeightFromBone(rootJoint.name, 0)
    robotHeight = robotHeight * bvhScale
  }

  const positionScale = (() => {
    const re = (1 / Math.abs(robotHeight || 1)) * 140
    if (re < 1) return 1
    return re
  })()

  const jointMapping = (arr: number[]) => {
    return arr
    for (let i = 7; i < arr.length; i += 3) {
      const x = arr[i]
      const y = arr[i + 1]
      const z = arr[i + 2]
      if (rootJointName === 'Hips') {
        const cx = y
        const cy = x
        const cz = z

        arr[i] = cx
        arr[i + 1] = cy
        arr[i + 2] = cz

        break
      }
    }
    return arr
  }

  for (let i = 0; i < data.length; i++) {
    data[i][0] = data[i][0] * positionScale
    data[i][1] = data[i][1] * positionScale
    data[i][2] = data[i][2] * positionScale

    data[i] = jointMapping(data[i])
  }

  return {
    dof_names,
    data,
    framerate: parseFloat(framerate.toFixed(2)),
    bvhAdapt: {
      orientationFieldName: rootJoint.name,
      positionScale: positionScale,
    },
    robotHeight: Math.abs(robotHeight),
  } as MotionJSON
}

async function convertBVHToMotionJSONViaViewerParser(
  bvhContent: string | ArrayBuffer,
  options: ConvertBVHToMotionJSONOptions = {}
): Promise<MotionJSON | null> {
  try {
    const text = typeof bvhContent === 'string' ? bvhContent : new TextDecoder().decode(bvhContent)
    if (!text.trim()) return null

    const parser = new BVHParser(text)
    const allJoints = parser.getJoints()
    if (!Array.isArray(allJoints) || allJoints.length === 0) return null

    const usableJointEntries = allJoints
      .map((joint, index) => ({ joint, index }))
      .filter(({ joint }) => joint.type !== 'End Site')

    if (usableJointEntries.length === 0) return null

    const jointNames = usableJointEntries.map(({ joint }) => joint.name)
    const rootJointName = parser.getRootJointName() ?? jointNames[0]
    const fallbackRootIndex = allJoints.findIndex(joint => joint.name === rootJointName)
    const rootIndex = fallbackRootIndex >= 0 ? fallbackRootIndex : usableJointEntries[0].index
    const frameCount = parser.getFrameCount()
    const framerate = parser.getFramePerSecond(false)

    // 使用原始BVH数据（按照文件中定义的通道顺序）
    const rawData = parser.getRawData()
    if (!rawData) return null

    // 构建每个关节的通道信息
    const jointChannelInfo: Array<{
      jointIndex: number
      jointName: string
      channelTypes: Array<{ axis: string; isPosition: boolean; index: number }>
      channelCount: number
      channelStart: number
    }> = []
    let channelOffset = 0

    for (let i = 0; i < allJoints.length; i++) {
      const joint = allJoints[i]
      const channels = joint.channels || ''
      const channelTypes: Array<{ axis: string; isPosition: boolean; index: number }> = []
      const channelCount = channels.length

      for (let c = 0; c < channelCount; c++) {
        const axis = channels[c].toUpperCase()
        const isPosition = channelCount === 6 && c < 3
        channelTypes.push({ axis, isPosition, index: c })
      }

      jointChannelInfo.push({
        jointIndex: i,
        jointName: joint.name,
        channelTypes,
        channelCount,
        channelStart: channelOffset
      })

      channelOffset += channelCount
    }

    const totalChannelsPerFrame = channelOffset
    const dofNames: string[] = ['floating_base_joint']
    jointNames.forEach(name => {
      dofNames.push(`${name}_x`, `${name}_y`, `${name}_z`)
    })

    const jointOffsets = parser.getJointOffset() as number[][]
    const parentIndices = parser.getParentIndexList()

    // 构建metadata（只包含usable joints）
    const metadataJointNames: string[] = []
    const metadataOffsets: number[][] = []
    const metadataRotationOrders: string[] = []
    const metadataParentNames: Array<string | null> = []
    const metadataNameToIndex: Record<string, number> = {}

    usableJointEntries.forEach(({ joint, index }) => {
      const currentIndex = metadataJointNames.length
      metadataJointNames.push(joint.name)
      metadataNameToIndex[joint.name] = currentIndex

      const strippedJointName = stripBVHPrefix(joint.name)
      if (strippedJointName && metadataNameToIndex[strippedJointName] === undefined) {
        metadataNameToIndex[strippedJointName] = currentIndex
      }

      const normalizedJointName = normalizeBVHJointName(joint.name)
      if (normalizedJointName && metadataNameToIndex[normalizedJointName] === undefined) {
        metadataNameToIndex[normalizedJointName] = currentIndex
      }

      metadataOffsets.push(jointOffsets?.[index] ?? [0, 0, 0])

      // 从channels中提取旋转顺序
      const info = jointChannelInfo[index]
      const rotationChannels = info.channelTypes.filter(ct => !ct.isPosition)
      const rotationOrder = rotationChannels.map(ct => ct.axis).join('') || 'XYZ'
      metadataRotationOrders.push(rotationOrder)

      metadataParentNames.push(joint.parentName ?? null)
    })

    const metadataParentIndices = metadataParentNames.map(parentName =>
      parentName ? metadataNameToIndex[parentName] ?? -1 : -1
    )

    const computeRobotHeight = (): number | undefined => {
      try {
        const jointCount = allJoints.length
        const memo: Array<THREE.Vector3 | null> = new Array(jointCount).fill(null)
        const getGlobalPosition = (jointIndex: number): THREE.Vector3 => {
          if (memo[jointIndex]) return memo[jointIndex] as THREE.Vector3
          const offset = jointOffsets?.[jointIndex] ?? [0, 0, 0]
          const vector = new THREE.Vector3(offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0)
          const parentIndex = parentIndices?.[jointIndex] ?? -1
          if (parentIndex >= 0) {
            vector.add(getGlobalPosition(parentIndex))
          }
          memo[jointIndex] = vector
          return vector
        }

        let minY = Number.POSITIVE_INFINITY
        let maxY = Number.NEGATIVE_INFINITY
        for (let i = 0; i < jointCount; i++) {
          const position = getGlobalPosition(i)
          if (!Number.isFinite(position.y)) continue
          if (position.y < minY) minY = position.y
          if (position.y > maxY) maxY = position.y
        }
        const height = maxY - minY
        if (!Number.isFinite(height) || height <= 0) return undefined
        return Math.abs(height)
      } catch {
        return undefined
      }
    }

    const robotHeight = computeRobotHeight()
    const positionScale = (() => {
      if (!robotHeight || !Number.isFinite(robotHeight) || robotHeight === 0) return 1
      const scale = (1 / Math.abs(robotHeight)) * 140
      if (!Number.isFinite(scale) || scale <= 0) return 1
      return scale < 1 ? 1 : scale
    })()

    const data: number[][] = []

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const row: number[] = []
      const frameOffset = frameIndex * totalChannelsPerFrame

      // 提取根骨骼的位置和旋转
      const rootInfo = jointChannelInfo[rootIndex]
      const rootPosition = { x: 0, y: 0, z: 0 }
      const rootRotation = new THREE.Quaternion()

      for (let c = 0; c < rootInfo.channelCount; c++) {
        const dataIndex = frameOffset + rootInfo.channelStart + c
        const value = rawData[dataIndex]
        const channelType = rootInfo.channelTypes[c]

        if (channelType.isPosition) {
          if (channelType.axis === 'X') rootPosition.x = value
          else if (channelType.axis === 'Y') rootPosition.y = value
          else if (channelType.axis === 'Z') rootPosition.z = value
        } else {
          // 旋转通道：逐个应用（与BVHViewer一致）
          const angleRad = (value * Math.PI) / 180
          const axis =
            channelType.axis === 'X'
              ? new THREE.Vector3(1, 0, 0)
              : channelType.axis === 'Y'
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(0, 0, 1)
          const axisQuat = new THREE.Quaternion().setFromAxisAngle(axis, angleRad)
          rootRotation.multiply(axisQuat)
        }
      }

      // 存储根骨骼的全局位置和旋转
      row.push(
        rootPosition.x * positionScale,
        rootPosition.y * positionScale,
        rootPosition.z * positionScale
      )
      row.push(rootRotation.x, rootRotation.y, rootRotation.z, rootRotation.w)

      // 提取其他关节的旋转（按usableJointEntries顺序）
      usableJointEntries.forEach(({ index }) => {
        const info = jointChannelInfo[index]
        const rotationValues = { x: 0, y: 0, z: 0 }

        for (let c = 0; c < info.channelCount; c++) {
          const dataIndex = frameOffset + info.channelStart + c
          const value = rawData[dataIndex]
          const channelType = info.channelTypes[c]

          if (!channelType.isPosition) {
            // 旋转通道
            if (channelType.axis === 'X') rotationValues.x = value
            else if (channelType.axis === 'Y') rotationValues.y = value
            else if (channelType.axis === 'Z') rotationValues.z = value
          }
        }

        // 存储为度数（与之前一致）
        row.push(rotationValues.x, rotationValues.y, rotationValues.z)
      })

      data.push(row)
    }

    const metadataRootIndex =
      metadataNameToIndex[rootJointName] ?? (metadataJointNames.length > 0 ? 0 : -1)

    const metadata: BVHMetadata = {
      jointNames: metadataJointNames,
      parentIndices: metadataParentIndices,
      offsets: metadataOffsets,
      rotationOrders: metadataRotationOrders,
      positionScale,
      nameToIndex: metadataNameToIndex,
      rootIndex: metadataRootIndex,
    }

    currentBVHMetadata = metadata

    const motionJSON: MotionJSON = {
      dof_names: dofNames,
      data,
      framerate,
      joint_names: jointNames,
      bvhAdapt: {
        orientationFieldName: rootJointName,
        positionScale,
      },
      robotHeight,
      bvhMetadata: metadata,
    }

    return motionJSON
  } catch (error) {
    console.warn('convertBVHToMotionJSON: viewer parser failed', error)
    return null
  }
}

export async function convertBVHToMotionJSON(
  bvhContent: string | ArrayBuffer,
  options: ConvertBVHToMotionJSONOptions = {}
): Promise<MotionJSON> {
  const parserType = options.parserType ?? 'bvhParse'

  if (parserType === 'viewer' || parserType === 'bvhParse') {
    const viewerParsed = await convertBVHToMotionJSONViaViewerParser(bvhContent, options)
    if (viewerParsed) {
      return viewerParsed
    }
    currentBVHMetadata = null
    console.warn('convertBVHToMotionJSON: viewer 解析失败，尝试备用解析器')
  }

  if (parserType === 'bvhParse') {
    const parsed = await convertBVHToMotionJSONViaBvhParse(bvhContent, options)
    if (parsed) {
      return parsed
    }
    console.warn('convertBVHToMotionJSON: bvhParse 解析失败，回退到 legacy 解析器')
  }

  if (parserType === 'viewer') {
    currentBVHMetadata = null
    return convertBVHToMotionJSONLegacy(bvhContent, options)
  }

  currentBVHMetadata = null
  return convertBVHToMotionJSONLegacy(bvhContent, options)
}

async function convertBVHToMotionJSONViaBvhParse(
  _bvhContent: string | ArrayBuffer,
  options: ConvertBVHToMotionJSONOptions
): Promise<MotionJSON | null> {
  try {
    let parseData: BvhParseData | null | undefined = options.bvhParseData
    const request = options.bvhParseRequest

    const tryMotionHub = async (): Promise<BvhParseData | null> => {
      if (!request?.motionHub) return null
      try {
        const response = await bvhParseApi.processMotionHubBvh(request.motionHub)
        if ((response.code === 0 || response.code === 200) && response.data) {
          return response.data
        }
      } catch (error) {
        console.warn('processMotionHubBvh 调用失败:', error)
      }
      return null
    }

    const tryProject = async (): Promise<BvhParseData | null> => {
      if (!request?.project) return null
      try {
        const response = await bvhParseApi.parseBvhByProject(request.project)
        if ((response.code === 0 || response.code === 200) && response.data) {
          return response.data
        }
      } catch (error) {
        console.warn('parseBvhByProject 调用失败:', error)
      }
      return null
    }

    if (!parseData && request) {
      if (request.preferMotionHub) {
        parseData = await tryMotionHub()
        if (!parseData) {
          parseData = await tryProject()
        }
      } else {
        parseData = await tryProject()
        if (!parseData) {
          parseData = await tryMotionHub()
        }
      }
    }

    if (!parseData) {
      return null
    }

    const converted = convertBvhParseDataToMotionJSON(parseData, {
      orientationFieldName: request?.orientationFieldName,
    })

    if (!converted || !Array.isArray(converted.data) || converted.data.length === 0) {
      return null
    }

    return converted as unknown as MotionJSON
  } catch (error) {
    console.warn('使用 bvhParse 解析失败，回退到 legacy 解析器:', error)
    return null
  }
}

/**
 * 解析后的动作帧类型
 *
 * 将原始数据矩阵解析为键值对格式的单帧数据。
 */
export type ParsedMotionFrame = Record<string, number>
/**
 * URDF文件选择器系统
 *
 * 提供完整的URDF机器人文件加载功能，支持文件夹和单文件选择。
 * 这是动作编辑器加载机器人模型的核心工具，处理复杂的文件依赖关系。
 */
/**
 * 文件列表到文件映射转换器
 *
 * 将浏览器FileList转换为路径到文件的映射表，便于后续处理。
 * 支持文件夹选择时的相对路径处理，确保文件引用关系正确。
 *
 * 处理特点：
 * - 路径标准化：统一使用"/"作为路径分隔符
 * - 空文件过滤：自动过滤掉大小为0的无效文件
 * - 相对路径支持：正确处理webkitRelativePath属性
 * - 映射表生成：创建便于查找的文件映射结构
 */
function filesToFileMap(fileList: FileList) {
  const files: Record<string, File> = {}
  Array.from(fileList)
    .filter(f => f.size !== 0)
    .forEach(f => {
      const path = (f as any).webkitRelativePath || f.name
      files['/' + path] = f
    })
  return files
}

/**
 * URDF文件处理器
 *
 * 处理URDF机器人包的文件加载和查看器配置，建立完整的文件引用系统。
 * 这是URDF加载的核心处理逻辑，解决了复杂的文件依赖和路径解析问题。
 *
 * 核心功能：
 * - 路径清理：标准化文件路径，处理相对路径引用
 * - URL修改器：为查看器提供文件URL解析功能
 * - 模型发现：自动发现可用的URDF模型文件
 * - 界面更新：更新UI选项以显示可用模型
 * - 坐标系设置：配置正确的坐标系方向
 *
 * 技术实现：
 * - Blob URL：为本地文件创建临时URL
 * - 路径匹配：智能匹配文件引用和实际文件
 * - 内存管理：自动清理临时URL避免内存泄漏
 * - DOM操作：动态更新UI选项列表
 *
 * 文件支持：
 * - URDF文件：机器人描述文件
 * - Mesh文件：STL、DAE、OBJ等3D模型
 * - 纹理文件：PNG、JPG等图像文件
 * - 配置文件：XACRO等扩展格式
 *
 * 这个处理器解决了URDF机器人包的复杂加载需求，提供了完整的文件系统支持。
 */
function processFiles(files: Record<string, File>, viewer: any, callback?: () => void) {
  const cleanFilePath = (path: string) =>
    path
      .replace(/\\/g, '/')
      .split(/\//g)
      .reduce((acc: string[], el: string) => {
        if (el === '..') acc.pop()
        else if (el !== '.') acc.push(el)
        return acc
      }, [])
      .join('/')
  const fileNames = Object.keys(files).map(n => cleanFilePath(n))
  viewer.urlModifierFunc = (url: string) => {
    const cleaned = cleanFilePath(url.replace(viewer.package, ''))
    const fileName = fileNames
      .filter(name => {
        const len = Math.min(name.length, cleaned.length)
        return cleaned.substr(cleaned.length - len) === name.substr(name.length - len)
      })
      .pop()
    if (fileName !== undefined) {
      const bloburl = URL.createObjectURL(files[fileName])
      requestAnimationFrame(() => URL.revokeObjectURL(bloburl))
      return bloburl
    }
    return url
  }
  const filesNames = Object.keys(files)
  viewer.up = '+Z'
  const upSelect = document.getElementById('up-select') as HTMLSelectElement | null
  if (upSelect) upSelect.value = viewer.up
  const availableModels = fileNames.filter(n => /urdf$/i.test(n))
  const urdfOptionsContainer = document.querySelector('#urdf-options')
  if (urdfOptionsContainer) {
    while (urdfOptionsContainer.firstChild)
      urdfOptionsContainer.removeChild(urdfOptionsContainer.firstChild)
    availableModels.forEach(model => {
      const li = document.createElement('li')
      li.setAttribute('urdf', model)
      li.setAttribute('color', '#333')
      li.textContent = model.split(/[\\\/]/).pop() || model
      urdfOptionsContainer.appendChild(li)
    })
  }
  viewer.urdf = filesNames.filter(n => /urdf$/i.test(n)).shift()
  if (callback) callback()
}

/**
 * URDF文件验证器
 *
 * 验证用户选择的文件中是否包含有效的URDF机器人描述文件。
 * 提供友好的错误提示，指导用户选择正确的文件格式。
 *
 * 验证规则：
 * - 文件扩展名：支持.urdf和.xacro格式
 * - 文件存在性：确保至少有一个有效的机器人描述文件
 * - 用户提示：提供清晰的错误信息和操作指导
 *
 * 这个验证器确保了文件选择的有效性，避免了无效文件导致的加载失败。
 */
function validateFiles(fileList: FileList) {
  const files = Array.from(fileList)
  const urdfFiles = files.filter(
    file => file.name.toLowerCase().endsWith('.urdf') || file.name.toLowerCase().endsWith('.xacro')
  )
  if (urdfFiles.length === 0) {
    alert('未找到机器人描述文件！\n\n请选择包含 .urdf 或 .xacro 文件的文件夹或文件。')
    return false
  }
  return true
}

/**
 * URDF查看器获取器
 *
 * 获取当前页面中的URDF查看器实例，支持多种查找方式。
 * 提供灵活的查看器访问机制，适应不同的页面结构。
 *
 * 查找策略：
 * - 全局变量：优先查找window.viewer全局实例
 * - DOM查询：通过CSS选择器查找urdf-viewer元素
 * - 错误处理：未找到时提供清晰的错误信息
 *
 * 这个获取器确保了查看器实例的可靠访问。
 */
function getViewer() {
  // @ts-ignore
  if ((window as any).viewer) return (window as any).viewer
  const viewerElement = document.querySelector('urdf-viewer')
  if (viewerElement) return viewerElement
  console.error('未找到 viewer 实例')
  return null
}

/**
 * 机器人加载回调生成器
 *
 * 生成机器人加载完成后的回调函数，触发自定义事件通知系统。
 * 提供标准化的加载完成通知机制，便于其他组件监听。
 *
 * 事件特点：
 * - 自定义事件：使用CustomEvent提供丰富的事件信息
 * - 时间戳：包含加载完成的精确时间
 * - 全局分发：通过document分发，便于全局监听
 *
 * 这个回调生成器提供了标准化的加载完成通知。
 */
function getCallback() {
  return () => {
    const event = new CustomEvent('robot-loaded', { detail: { timestamp: Date.now() } })
    document.dispatchEvent(event)
  }
}
/**
 * URDF文件选择器接口对象
 *
 * 提供完整的URDF机器人文件选择和加载功能集合。
 * 这是一个统一的接口，封装了所有与URDF文件处理相关的操作。
 *
 * 主要功能：
 * - 文件夹选择：加载完整的机器人包（推荐方式）
 * - 多文件选择：选择URDF文件及其依赖的mesh文件
 * - 单文件选择：仅选择URDF文件（可能缺少依赖）
 * - 智能加载：提供用户友好的加载方式选择
 * - 批处理：支持外部传入的文件列表处理
 *
 * 设计特点：
 * - 用户友好：提供清晰的操作指导和选择建议
 * - 容错处理：完善的错误处理和用户提示
 * - 灵活接口：支持多种使用场景和集成方式
 * - 标准化：统一的处理流程和回调机制
 */
export const sf = {
  /**
   * 文件夹选择器
   *
   * 选择包含完整机器人包的文件夹，这是推荐的加载方式。
   * 能够正确处理URDF文件及其所有依赖的mesh、纹理等文件。
   */
  selectFolder() {
    const input = document.createElement('input')
    input.type = 'file'
      ; (input as any).webkitdirectory = true
    input.multiple = true
    input.onchange = (e: any) => {
      const fileList: FileList = e.target.files
      if (fileList.length > 0) {
        if (!validateFiles(fileList)) {
          e.target.value = ''
          return
        }
        const files = filesToFileMap(fileList)
        const viewer = getViewer()
        const callback = getCallback()
        if (viewer) {
          processFiles(files, viewer, callback)
        } else {
          alert('未找到 URDF 查看器实例')
        }
      }
      e.target.value = ''
    }
    input.click()
  },

  /**
   * 多文件选择器
   *
   * 选择多个相关文件，包括URDF文件和其依赖的mesh、纹理文件。
   * 适用于文件分散存储或需要精确控制加载文件的场景。
   */
  selectFiles() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.urdf,.xacro,.stl,.dae,.obj,.gltf,.glb,.ply,.png,.jpg,.jpeg,.bmp,.tiff'
    input.onchange = (e: any) => {
      const fileList: FileList = e.target.files
      if (fileList.length > 0) {
        if (!validateFiles(fileList)) {
          e.target.value = ''
          return
        }
        const files = filesToFileMap(fileList)
        const viewer = getViewer()
        const callback = getCallback()
        if (viewer) {
          processFiles(files, viewer, callback)
        } else {
          alert('未找到 URDF 查看器实例')
        }
      }
      e.target.value = ''
    }
    input.click()
  },

  /**
   * 单URDF文件选择器
   *
   * 仅选择URDF或XACRO文件，不包含依赖文件。
   * 适用于自包含的URDF文件或测试场景，但可能导致mesh显示不完整。
   */
  selectUrdf() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.urdf,.xacro'
    input.multiple = false
    input.onchange = (e: any) => {
      const fileList: FileList = e.target.files
      if (fileList.length > 0) {
        console.warn('⚠️ 注意：只选择了 URDF 文件，如果引用外部 mesh 文件可能无法正确显示')
        const files = filesToFileMap(fileList)
        const viewer = getViewer()
        const callback = getCallback()
        if (viewer) {
          processFiles(files, viewer, callback)
        } else {
          alert('未找到 URDF 查看器实例')
        }
      }
      e.target.value = ''
    }
    input.click()
  },

  /**
   * 智能机器人加载器
   *
   * 提供用户友好的加载方式选择，推荐使用文件夹方式加载完整机器人包。
   * 通过确认对话框让用户选择最适合的加载方式。
   */
  loadRobot() {
    const choice = confirm(
      '选择加载方式：\n\n' +
      '确定 = 选择文件夹（推荐，包含完整机器人包）\n' +
      '取消 = 选择文件（可多选 URDF + mesh 文件）'
    )
    if (choice) {
      this.selectFolder()
    } else {
      this.selectFiles()
    }
  },

  /**
   * 文件列表批处理器
   *
   * 处理外部传入的文件列表，支持拖拽等场景的文件处理。
   * 提供灵活的集成接口，可指定自定义的查看器和回调函数。
   */
  processFileList(fileList: FileList, viewer?: any, callback?: () => void) {
    if (!validateFiles(fileList)) return false
    const files = filesToFileMap(fileList)
    processFiles(files, viewer || getViewer(), callback || getCallback())
    return true
  },
}

/**
 * "拧铁丝"式轨迹旋转算法
 *
 * 实现高级的轨迹旋转效果，模拟拧铁丝的物理行为。
 * 这是动作编辑器中用于轨迹调整的核心算法，提供自然的旋转过渡效果。
 *
 * 算法特点：
 * - 固定起点：起始帧位置保持不变，仅旋转姿态
 * - 渐进衰减：旋转影响随距离逐渐减小，形成自然的弯曲效果
 * - 平滑过渡：使用smoothstep函数确保平滑的过渡曲线
 * - 刚体延续：衰减区域外保持刚体变换，确保连续性
 *
 * 物理模拟：
 * - 拧点固定：起始帧如同被手指固定的拧点
 * - 弹性传递：旋转力通过"铁丝"向远端传递
 * - 衰减效应：距离越远，旋转影响越小
 * - 刚体保持：远端区域作为整体刚体旋转
 *
 * 数学原理：
 * - 四元数插值：使用球面线性插值(SLERP)实现平滑旋转
 * - 坐标变换：正确处理局部和世界坐标系的转换
 * - 向量旋转：使用四元数旋转向量实现位置变换
 * - 平滑函数：smoothstep提供优美的过渡曲线
 *
 * 应用场景：
 * - 轨迹编辑：调整机器人运动轨迹的方向
 * - 动作优化：创建自然的动作过渡效果
 * - 路径规划：实现复杂的路径调整算法
 * - 动画制作：生成专业的动画过渡效果
 *
 * 这个算法为轨迹编辑提供了直观、自然的操作体验，是动作编辑器的重要创新功能。
 */
export function rotateTrajectory(
  trajectoryData: number[][], // [x[], y[], z[], qx[], qy[], qz[], qw[]]
  startFrameIndex: number,
  startQuaternion: { x: number; y: number; z: number; w: number },
  currentQuaternion: { x: number; y: number; z: number; w: number },
  decayDistance: number = 0
): number[][] {
  if (!trajectoryData || trajectoryData.length !== 7) {
    throw new Error('轨迹数据必须包含7个数组 [x, y, z, quat_x, quat_y, quat_z, quat_w]')
  }
  const frameCount = trajectoryData[0].length
  if (startFrameIndex < 0 || startFrameIndex >= frameCount) {
    throw new Error('起始帧下标超出范围')
  }

  const result = trajectoryData.map(arr => [...arr])

  // 旋转差值（从起始姿态到当前姿态）- 局部坐标
  const rotationDeltaLocal = calculateQuaternionDelta(startQuaternion, currentQuaternion)
  // 将局部Δ映射到世界坐标，避免Three.js下X/Z轴错位
  const rotationDeltaWorld = multiplyQuaternions(
    startQuaternion,
    multiplyQuaternions(rotationDeltaLocal, conjugateQuaternion(startQuaternion))
  )

  // 起始帧位置（初始旋转中心）
  const startCenter = {
    x: trajectoryData[0][startFrameIndex],
    y: trajectoryData[1][startFrameIndex],
    z: trajectoryData[2][startFrameIndex],
  }

  const hasDecay = decayDistance > 0
  const endDecayIndex = hasDecay
    ? Math.min(startFrameIndex + decayDistance, frameCount - 1)
    : startFrameIndex

  // 1) 起始帧：位置不变，姿态按满角度旋转（拧点位置固定、朝向随手柄转动）
  {
    const oq = {
      x: trajectoryData[3][startFrameIndex],
      y: trajectoryData[4][startFrameIndex],
      z: trajectoryData[5][startFrameIndex],
      w: trajectoryData[6][startFrameIndex],
    }
    // 方向修正：左乘世界旋转，表示在世界系对刚体整体加旋转
    const nq = multiplyQuaternions(rotationDeltaWorld, oq)
    result[3][startFrameIndex] = nq.x
    result[4][startFrameIndex] = nq.y
    result[5][startFrameIndex] = nq.z
    result[6][startFrameIndex] = nq.w
    // 位置不动
  }

  // 2) 衰减区间 [start+1, endDecayIndex]：角度从小到大（越远作用越强）
  for (let i = startFrameIndex + 1; i <= endDecayIndex; i++) {
    const originalPos = {
      x: trajectoryData[0][i],
      y: trajectoryData[1][i],
      z: trajectoryData[2][i],
    }
    const originalQuat = {
      x: trajectoryData[3][i],
      y: trajectoryData[4][i],
      z: trajectoryData[5][i],
      w: trajectoryData[6][i],
    }

    let factor = 1
    if (hasDecay) {
      const s = Math.max(0, Math.min(1, (i - startFrameIndex) / Math.max(1, decayDistance)))
      // 平滑"拧弯"曲线：smoothstep，让姿态与位置形成弧形过渡
      factor = smoothstep(s)
    }

    // 在单位四元数与满旋转（世界）之间做球面插值
    const decayedRotation = slerpQuaternion({ x: 0, y: 0, z: 0, w: 1 }, rotationDeltaWorld, factor)

    // 以起始帧位置为中心做位置旋转
    const rel = {
      x: originalPos.x - startCenter.x,
      y: originalPos.y - startCenter.y,
      z: originalPos.z - startCenter.z,
    }
    const relRot = rotateVectorByQuaternion(rel, decayedRotation)
    const newPos = {
      x: startCenter.x + relRot.x,
      y: startCenter.y + relRot.y,
      z: startCenter.z + relRot.z,
    }

    // 姿态采用左乘，确保"跟随机器人一起旋转"
    const newQuat = multiplyQuaternions(decayedRotation, originalQuat)

    result[0][i] = newPos.x
    result[1][i] = newPos.y
    result[2][i] = newPos.z
    result[3][i] = newQuat.x
    result[4][i] = newQuat.y
    result[5][i] = newQuat.z
    result[6][i] = newQuat.w
  }

  // 3) 衰减区间之外：使用与边界帧一致的刚体变换（世界R与平移t）保持连续
  if (endDecayIndex < frameCount - 1) {
    // 边界帧原始与新位置
    const endOrigPos = {
      x: trajectoryData[0][endDecayIndex],
      y: trajectoryData[1][endDecayIndex],
      z: trajectoryData[2][endDecayIndex],
    }
    const endNewPos = {
      x: result[0][endDecayIndex],
      y: result[1][endDecayIndex],
      z: result[2][endDecayIndex],
    }
    // 计算平移t，满足 p_end_new = R_world * p_end_orig + t
    const rotatedEndOrig = rotateVectorByQuaternion(endOrigPos, rotationDeltaWorld)
    const t = {
      x: endNewPos.x - rotatedEndOrig.x,
      y: endNewPos.y - rotatedEndOrig.y,
      z: endNewPos.z - rotatedEndOrig.z,
    }

    for (let i = endDecayIndex + 1; i < frameCount; i++) {
      const originalPos = {
        x: trajectoryData[0][i],
        y: trajectoryData[1][i],
        z: trajectoryData[2][i],
      }
      const originalQuat = {
        x: trajectoryData[3][i],
        y: trajectoryData[4][i],
        z: trajectoryData[5][i],
        w: trajectoryData[6][i],
      }

      // 刚体变换：p' = R_world * p + t
      const rotated = rotateVectorByQuaternion(originalPos, rotationDeltaWorld)
      const newPos = {
        x: rotated.x + t.x,
        y: rotated.y + t.y,
        z: rotated.z + t.z,
      }

      // 满角度，仍用左乘（世界旋转）
      const newQuat = multiplyQuaternions(rotationDeltaWorld, originalQuat)

      result[0][i] = newPos.x
      result[1][i] = newPos.y
      result[2][i] = newPos.z
      result[3][i] = newQuat.x
      result[4][i] = newQuat.y
      result[5][i] = newQuat.z
      result[6][i] = newQuat.w
    }
  }

  return result
}

/**
 * "拧铁丝"式轨迹旋转算法（欧拉角版本）
 *
 * 欧拉角版本的轨迹旋转算法，直接使用欧拉角进行计算，避免四元数转换。
 * 适用于以欧拉角为主要旋转表示的系统，提供更直观的角度操作体验。
 *
 * 算法特点：
 * - 直接计算：避免四元数与欧拉角间的转换损失
 * - 角度直观：所有计算都在度数空间进行，便于理解
 * - 万向锁处理：使用角度归一化避免角度跳跃问题
 * - 矩阵旋转：使用旋转矩阵进行精确的向量旋转
 *
 * 与四元数版本的区别：
 * - 输入格式：使用6个数组[x,y,z,rx,ry,rz]而非7个数组
 * - 角度单位：直接使用度数，无需弧度转换
 * - 计算方式：基于欧拉角差值和旋转矩阵
 * - 适用场景：欧拉角为主的动画系统
 *
 * 数学原理：
 * - 角度差值：计算起始和当前欧拉角的差值
 * - 角度归一化：将角度限制在[-180,180]度范围
 * - 旋转矩阵：使用XYZ欧拉角构建旋转矩阵
 * - 向量旋转：通过矩阵乘法实现向量旋转
 *
 * 这个版本为欧拉角系统提供了原生的轨迹旋转支持。
 */
export function rotateTrajectoryEuler(
  trajectoryData: number[][], // [x[], y[], z[], rx[], ry[], rz[]] (欧拉角为度数)
  startFrameIndex: number,
  startEuler: { x: number; y: number; z: number }, // 起始欧拉角（度数）
  currentEuler: { x: number; y: number; z: number }, // 当前欧拉角（度数）
  decayDistance: number = 0
): number[][] {
  if (!trajectoryData || trajectoryData.length !== 6) {
    throw new Error('轨迹数据必须包含6个数组 [x, y, z, euler_x, euler_y, euler_z]')
  }
  const frameCount = trajectoryData[0].length
  if (startFrameIndex < 0 || startFrameIndex >= frameCount) {
    throw new Error('起始帧下标超出范围')
  }

  const result = trajectoryData.map(arr => [...arr])

  // 计算欧拉角旋转差值（度数，不做归一化）
  const rotationDeltaEuler = {
    x: currentEuler.x - startEuler.x,
    y: currentEuler.y - startEuler.y,
    z: currentEuler.z - startEuler.z,
  }

  // 起始帧位置（初始旋转中心）
  const startCenter = {
    x: trajectoryData[0][startFrameIndex],
    y: trajectoryData[1][startFrameIndex],
    z: trajectoryData[2][startFrameIndex],
  }

  const hasDecay = decayDistance > 0
  const endDecayIndex = hasDecay
    ? Math.min(startFrameIndex + decayDistance, frameCount - 1)
    : startFrameIndex

  // 1) 起始帧：位置不变，姿态按满角度旋转（拧点位置固定、朝向随手柄转动）
  {
    const originalEuler = {
      x: trajectoryData[3][startFrameIndex],
      y: trajectoryData[4][startFrameIndex],
      z: trajectoryData[5][startFrameIndex],
    }
    // 直接叠加欧拉角旋转差值
    const newEuler = {
      x: originalEuler.x + rotationDeltaEuler.x,
      y: originalEuler.y + rotationDeltaEuler.y,
      z: originalEuler.z + rotationDeltaEuler.z,
    }
    result[3][startFrameIndex] = newEuler.x
    result[4][startFrameIndex] = newEuler.y
    result[5][startFrameIndex] = newEuler.z
    // 位置不动
  }

  // 2) 衰减区间 [start+1, endDecayIndex]：角度从小到大（越远作用越强）
  for (let i = startFrameIndex + 1; i <= endDecayIndex; i++) {
    const originalPos = {
      x: trajectoryData[0][i],
      y: trajectoryData[1][i],
      z: trajectoryData[2][i],
    }
    const originalEuler = {
      x: trajectoryData[3][i],
      y: trajectoryData[4][i],
      z: trajectoryData[5][i],
    }

    let factor = 1
    if (hasDecay) {
      const s = Math.max(0, Math.min(1, (i - startFrameIndex) / Math.max(1, decayDistance)))
      // 平滑"拧弯"曲线：smoothstep，让姿态与位置形成弧形过渡
      factor = smoothstep(s)
    }

    // 计算衰减后的旋转角度
    const decayedRotation = {
      x: rotationDeltaEuler.x * factor,
      y: rotationDeltaEuler.y * factor,
      z: rotationDeltaEuler.z * factor,
    }

    // 以起始帧位置为中心做位置旋转（使用欧拉角旋转矩阵）
    const rel = {
      x: originalPos.x - startCenter.x,
      y: originalPos.y - startCenter.y,
      z: originalPos.z - startCenter.z,
    }
    const relRot = rotateVectorByEuler(rel, decayedRotation)
    const newPos = {
      x: startCenter.x + relRot.x,
      y: startCenter.y + relRot.y,
      z: startCenter.z + relRot.z,
    }

    // 姿态直接叠加衰减后的欧拉角
    const newEuler = {
      x: originalEuler.x + decayedRotation.x,
      y: originalEuler.y + decayedRotation.y,
      z: originalEuler.z + decayedRotation.z,
    }

    result[0][i] = newPos.x
    result[1][i] = newPos.y
    result[2][i] = newPos.z
    result[3][i] = newEuler.x
    result[4][i] = newEuler.y
    result[5][i] = newEuler.z
  }

  // 3) 衰减区间之外：使用与边界帧一致的刚体变换（欧拉角旋转与平移）保持连续
  if (endDecayIndex < frameCount - 1) {
    // 边界帧原始与新位置
    const endOrigPos = {
      x: trajectoryData[0][endDecayIndex],
      y: trajectoryData[1][endDecayIndex],
      z: trajectoryData[2][endDecayIndex],
    }
    const endNewPos = {
      x: result[0][endDecayIndex],
      y: result[1][endDecayIndex],
      z: result[2][endDecayIndex],
    }
    // 计算平移t，满足 p_end_new = R_euler * p_end_orig + t
    const rotatedEndOrig = rotateVectorByEuler(endOrigPos, rotationDeltaEuler)
    const t = {
      x: endNewPos.x - rotatedEndOrig.x,
      y: endNewPos.y - rotatedEndOrig.y,
      z: endNewPos.z - rotatedEndOrig.z,
    }

    for (let i = endDecayIndex + 1; i < frameCount; i++) {
      const originalPos = {
        x: trajectoryData[0][i],
        y: trajectoryData[1][i],
        z: trajectoryData[2][i],
      }
      const originalEuler = {
        x: trajectoryData[3][i],
        y: trajectoryData[4][i],
        z: trajectoryData[5][i],
      }

      // 刚体变换：p' = R_euler * p + t
      const rotated = rotateVectorByEuler(originalPos, rotationDeltaEuler)
      const newPos = {
        x: rotated.x + t.x,
        y: rotated.y + t.y,
        z: rotated.z + t.z,
      }

      // 满角度，直接叠加欧拉角
      const newEuler = {
        x: originalEuler.x + rotationDeltaEuler.x,
        y: originalEuler.y + rotationDeltaEuler.y,
        z: originalEuler.z + rotationDeltaEuler.z,
      }

      result[0][i] = newPos.x
      result[1][i] = newPos.y
      result[2][i] = newPos.z
      result[3][i] = newEuler.x
      result[4][i] = newEuler.y
      result[5][i] = newEuler.z
    }
  }

  return result
}

/**
 * 数学工具函数库
 *
 * 提供轨迹旋转算法所需的各种数学计算函数，包括四元数运算和欧拉角处理。
 * 这些函数是动作编辑器数学计算的基础，确保旋转操作的精确性和稳定性。
 */

/**
 * 平滑步进函数
 *
 * 实现平滑的0到1过渡曲线，提供比线性插值更自然的过渡效果。
 * 使用三次Hermite插值公式：f(t) = t²(3-2t)，在端点处导数为0。
 *
 * 特点：
 * - 平滑过渡：在0和1处导数为0，避免突变
 * - 单调递增：在[0,1]区间内严格递增
 * - 边界安全：自动限制输入到[0,1]范围
 *
 * 应用：轨迹旋转中的衰减曲线，创造自然的"拧弯"效果。
 */
function smoothstep(t: number): number {
  const s = Math.max(0, Math.min(1, t))
  return s * s * (3 - 2 * s)
}
/**
 * 四元数差值计算器
 *
 * 计算从起始四元数到当前四元数的旋转差值。
 * 返回的差值四元数表示需要应用的相对旋转。
 *
 * 数学原理：Δq = q1⁻¹ * q2
 * 其中q1⁻¹是起始四元数的共轭，q2是目标四元数。
 *
 * 应用：轨迹旋转中计算需要应用的旋转量。
 */
function calculateQuaternionDelta(
  qStart: { x: number; y: number; z: number; w: number },
  qCurrent: { x: number; y: number; z: number; w: number }
): { x: number; y: number; z: number; w: number } {
  const q1 = normalizeQuaternion(qStart)
  const q2 = normalizeQuaternion(qCurrent)
  const q1Inv = conjugateQuaternion(q1)
  return normalizeQuaternion(multiplyQuaternions(q1Inv, q2))
}

/**
 * 四元数归一化器
 *
 * 将四元数归一化为单位四元数，确保其表示有效的旋转。
 * 单位四元数的模长为1，是表示旋转的标准形式。
 *
 * 处理特殊情况：
 * - 零四元数：返回单位四元数(0,0,0,1)
 * - 数值误差：通过归一化消除累积误差
 */
function normalizeQuaternion(q: { x: number; y: number; z: number; w: number }) {
  const len = Math.hypot(q.x, q.y, q.z, q.w)
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 }
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len }
}

/**
 * 四元数共轭计算器
 *
 * 计算四元数的共轭，相当于反向旋转。
 * 对于单位四元数，共轭等于逆四元数。
 *
 * 数学定义：q* = (w, -x, -y, -z)
 * 几何意义：表示相反方向的旋转。
 */
function conjugateQuaternion(q: { x: number; y: number; z: number; w: number }) {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w }
}

/**
 * 四元数乘法器
 *
 * 计算两个四元数的乘积，表示旋转的复合。
 * 四元数乘法不满足交换律，顺序很重要。
 *
 * 数学公式：基于Hamilton四元数乘法规则
 * 几何意义：q1 * q2表示先应用q2旋转，再应用q1旋转。
 */
function multiplyQuaternions(
  q1: { x: number; y: number; z: number; w: number },
  q2: { x: number; y: number; z: number; w: number }
) {
  return {
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
  }
}
/**
 * 四元数球面线性插值器（SLERP）
 *
 * 在两个四元数之间进行球面线性插值，产生平滑的旋转过渡。
 * SLERP确保插值路径是最短的旋转路径，角速度恒定。
 *
 * 算法特点：
 * - 最短路径：自动选择较短的旋转路径
 * - 恒定角速度：插值过程中角速度保持恒定
 * - 数值稳定：处理近似平行的四元数情况
 *
 * 应用：创建平滑的旋转动画和过渡效果。
 */
function slerpQuaternion(
  q1: { x: number; y: number; z: number; w: number },
  q2: { x: number; y: number; z: number; w: number },
  t: number
) {
  t = Math.max(0, Math.min(1, t))
  let dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w

  let q2c = { ...q2 }
  if (dot < 0) {
    q2c.x = -q2c.x
    q2c.y = -q2c.y
    q2c.z = -q2c.z
    q2c.w = -q2c.w
    dot = -dot
  }

  if (dot > 0.9995) {
    return normalizeQuaternion({
      x: q1.x + t * (q2c.x - q1.x),
      y: q1.y + t * (q2c.y - q1.y),
      z: q1.z + t * (q2c.z - q1.z),
      w: q1.w + t * (q2c.w - q1.w),
    })
  }

  const theta0 = Math.acos(dot)
  const sinTheta0 = Math.sin(theta0)
  const theta = theta0 * t
  const sinTheta = Math.sin(theta)

  const s0 = Math.cos(theta) - dot * (sinTheta / sinTheta0)
  const s1 = sinTheta / sinTheta0

  return {
    x: s0 * q1.x + s1 * q2c.x,
    y: s0 * q1.y + s1 * q2c.y,
    z: s0 * q1.z + s1 * q2c.z,
    w: s0 * q1.w + s1 * q2c.w,
  }
}

/**
 * 四元数向量旋转器
 *
 * 使用四元数旋转3D向量，这是四元数的主要应用之一。
 * 实现公式：v' = q * v * q*，其中q*是q的共轭。
 *
 * 优势：
 * - 无万向锁：避免欧拉角的万向锁问题
 * - 数值稳定：比旋转矩阵更稳定
 * - 高效计算：比矩阵乘法更高效
 *
 * 应用：轨迹旋转中的位置变换。
 */
function rotateVectorByQuaternion(
  v: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number; w: number }
) {
  const qConj = conjugateQuaternion(q)
  const vq = { x: v.x, y: v.y, z: v.z, w: 0 }
  const tmp = multiplyQuaternions(q, vq)
  const rq = multiplyQuaternions(tmp, qConj)
  return { x: rq.x, y: rq.y, z: rq.z }
}

/**
 * 欧拉角工具函数库
 *
 * 提供欧拉角相关的数学计算函数，支持欧拉角版本的轨迹旋转算法。
 * 处理向量旋转等欧拉角特有的计算需求。
 */

/**
 * 欧拉角向量旋转器
 *
 * 使用欧拉角旋转3D向量，采用XYZ旋转顺序。
 * 通过构建旋转矩阵实现精确的向量旋转。
 *
 * 旋转顺序：Rz * Ry * Rx（先绕X轴，再绕Y轴，最后绕Z轴）
 *
 * 技术特点：
 * - 精确计算：使用完整的旋转矩阵
 * - 标准顺序：采用常用的XYZ旋转顺序
 * - 度数输入：直接接受度数，内部转换为弧度
 *
 * 应用：欧拉角版本轨迹旋转中的位置变换。
 */
function rotateVectorByEuler(
  v: { x: number; y: number; z: number },
  euler: { x: number; y: number; z: number } // 度数
): { x: number; y: number; z: number } {
  const rx = (euler.x * Math.PI) / 180
  const ry = (euler.y * Math.PI) / 180
  const rz = (euler.z * Math.PI) / 180

  const cosX = Math.cos(rx),
    sinX = Math.sin(rx)
  const cosY = Math.cos(ry),
    sinY = Math.sin(ry)
  const cosZ = Math.cos(rz),
    sinZ = Math.sin(rz)

  const m11 = cosY * cosZ
  const m12 = -cosY * sinZ
  const m13 = sinY

  const m21 = cosX * sinZ + sinX * sinY * cosZ
  const m22 = cosX * cosZ - sinX * sinY * sinZ
  const m23 = -sinX * cosY

  const m31 = sinX * sinZ - cosX * sinY * cosZ
  const m32 = sinX * cosZ + cosX * sinY * sinZ
  const m33 = cosX * cosY

  return {
    x: m11 * v.x + m12 * v.y + m13 * v.z,
    y: m21 * v.x + m22 * v.y + m23 * v.z,
    z: m31 * v.x + m32 * v.y + m33 * v.z,
  }
}
/**
 * MotionJSON到BVH反向转换器
 *
 * 将动作编辑器的MotionJSON格式转换回标准BVH文件格式。
 * 这是BVH支持的重要组成部分，实现了编辑后动作数据的导出功能。
 *
 * 转换流程：
 * 1. 模板解析：使用原始BVH文件作为结构模板
 * 2. 数据映射：将MotionJSON数据映射回BVH通道顺序
 * 3. 格式重建：重建完整的BVH文件结构
 * 4. 数据还原：还原原始的位置缩放和单位
 * 5. 文件生成：生成符合BVH标准的文件内容
 *
 * 核心特性：
 * - 格式保真：保持原始BVH文件的结构和格式
 * - 数据完整：确保所有编辑的动作数据正确导出
 * - 单位还原：自动还原原始BVH文件的单位和缩放
 * - 兼容性：生成的BVH文件与标准工具兼容
 *
 * 技术实现：
 * - 模板解析：解析原始BVH的骨骼结构和通道配置
 * - 索引映射：建立MotionJSON字段到BVH通道的映射关系
 * - 数据重排：按BVH通道顺序重新排列动作数据
 * - 格式输出：生成标准BVH文件格式的文本内容
 *
 * 应用场景：
 * - 动作导出：将编辑后的动作导出为BVH文件
 * - 格式转换：在不同动画软件间转换动作数据
 * - 数据备份：保存编辑结果的标准格式副本
 * - 工作流集成：与其他BVH工具的数据交换
 *
 * 这个转换器完成了BVH支持的闭环，使动作编辑器能够完整支持BVH工作流。
 */
export function convertMotionJSONToBVH(
  motionJSON: MotionJSON,
  originalBVHContent: string,
  options: {
    eulerOrder?: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
    scaleFactor?: number
  } = {}
): string {
  const { dof_names, data, framerate, bvhAdapt } = motionJSON

  if (!Array.isArray(dof_names) || !Array.isArray(data) || data.length === 0) {
    throw new Error('无效的 MotionJSON 数据')
  }

  // 提取位置缩放参数和根关节名称，用于还原原始BVH位置数据
  const positionScale = (bvhAdapt as any)?.positionScale || 1
  const orientationFieldName = (bvhAdapt as any)?.orientationFieldName || 'Hips'
  console.log('使用位置缩放还原参数:', positionScale)
  console.log('根关节名称:', orientationFieldName)

  // 1) 拆分原始 BVH，保留 HIERARCHY 文本
  const lines = originalBVHContent.split('\n')
  let motionStartIndex = -1
  for (let i = 0; i < lines.length; i++)
    if (lines[i].trim() === 'MOTION') {
      motionStartIndex = i
      break
    }
  if (motionStartIndex === -1) throw new Error('原始 BVH 文件格式无效：未找到 MOTION 部分')
  const hierarchyPart = lines.slice(0, motionStartIndex).join('\n')

  // 解析原始帧时间（作为兜底）
  let originalFrameTime = 0.033333
  for (let i = motionStartIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('Frame Time:')) {
      const m = line.match(/Frame Time:\s*([\d.]+)/i)
      if (m) originalFrameTime = parseFloat(m[1])
      break
    }
  }

  // 2) 解析原始 BVH 的通道与关节顺序（严格按出现顺序）
  function parseBVHChannels() {
    const root: { name: string; channels: string[] } = { name: '', channels: [] }
    const joints: Array<{ name: string; channels: string[] }> = []

    let currentJointName: string | null = null
    let currentJointChannels: string[] = []
    let rootChannelsCaptured = false

    for (let i = 0; i < motionStartIndex; i++) {
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('ROOT ')) {
        const name = trimmed.slice(5).trim()
        root.name = name
        currentJointName = null
        currentJointChannels = []
      } else if (trimmed.startsWith('JOINT ')) {
        if (currentJointName && currentJointChannels.length > 0) {
          joints.push({ name: currentJointName, channels: [...currentJointChannels] })
        }
        currentJointName = trimmed.slice(6).trim()
        currentJointChannels = []
      } else if (trimmed.startsWith('CHANNELS ')) {
        const channelMatch = trimmed.match(/CHANNELS\s+\d+\s+(.+)/)
        if (channelMatch) {
          const channelNames = channelMatch[1].trim().split(/\s+/)
          if (!rootChannelsCaptured && !currentJointName) {
            root.channels = [...channelNames]
            rootChannelsCaptured = true
          } else if (currentJointName) {
            currentJointChannels = [...channelNames]
          }
        }
      } else if (trimmed === '}' && currentJointName) {
        if (currentJointChannels.length > 0) {
          joints.push({ name: currentJointName, channels: [...currentJointChannels] })
        }
        currentJointName = null
        currentJointChannels = []
      }
    }

    // 末尾兜底
    if (currentJointName && currentJointChannels.length > 0) {
      joints.push({ name: currentJointName, channels: [...currentJointChannels] })
    }

    return { root, joints }
  }

  const { root, joints } = parseBVHChannels()

  // 3) 根据 dof_names 构建列索引映射
  type DofMap = {
    base: { pos: [number, number, number]; quat: [number, number, number, number] }
    joints: Record<string, { x?: number; y?: number; z?: number }>
  }

  function buildDofIndexMap(dofNames: string[]): DofMap {
    const map: DofMap = {
      base: { pos: [-1, -1, -1], quat: [-1, -1, -1, -1] },
      joints: {},
    }
    // 允许 dof_names 中的 base 出现在任意位置，但数据列顺序必须与之对应
    let dataIndex = 0
    for (let i = 0; i < dofNames.length; i++) {
      const name = dofNames[i]
      if (name === 'floating_base_joint') {
        map.base.pos = [dataIndex + 0, dataIndex + 1, dataIndex + 2]
        map.base.quat = [dataIndex + 3, dataIndex + 4, dataIndex + 5, dataIndex + 6]
        dataIndex += 7
        continue
      }
      const m = name.match(/^(.*)_([xyz])$/i)
      if (m) {
        const jointName = m[1]
        const axis = m[2].toLowerCase() as 'x' | 'y' | 'z'
        if (!map.joints[jointName]) map.joints[jointName] = {}
          ; (map.joints[jointName] as any)[axis] = dataIndex
        dataIndex += 1
      } else {
        // 未知字段，跳过其一列
        dataIndex += 1
      }
    }
    // 校验 base
    if (map.base.pos.includes(-1) || map.base.quat.includes(-1)) {
      throw new Error('dof_names 缺少 floating_base_joint 或其数据列不完整(7)')
    }
    return map
  }
  const dofMap = buildDofIndexMap(dof_names)

  // 逆向关节映射函数 - 与 convertBVHToMotionJSON 中的 jointMapping 相对应
  const reverseJointMapping = (arr: number[]) => {
    // 前向 jointMapping 当前为恒等映射，这里保持恒等以精确逆向
    return arr
  }

  // 从 BVH CHANNELS 推导该关节的欧拉顺序（只看旋转通道的出现顺序）
  function getRotationOrderFromChannels(
    channels: string[]
  ): 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX' {
    const axes: string[] = []
    for (const ch of channels) {
      const k = ch.toLowerCase()
      if (k === 'xrotation') axes.push('X')
      else if (k === 'yrotation') axes.push('Y')
      else if (k === 'zrotation') axes.push('Z')
    }
    const order = (axes.join('') || 'XYZ') as any
    return order
  }

  const toRadians = (deg: number) => ((deg || 0) * Math.PI) / 180
  const toDegrees = (rad: number) => ((rad || 0) * 180) / Math.PI

  // 将欧拉角从 srcOrder 重新表达为 dstOrder（保持同一空间姿态）
  function remapEulerAngles(
    eulerDeg: { x: number; y: number; z: number },
    srcOrder: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX',
    dstOrder: 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
  ): { x: number; y: number; z: number } {
    // 构造以度为单位的欧拉，转弧度并按源顺序建立旋转矩阵
    const eSrc = new THREE.Euler(
      toRadians(eulerDeg.x),
      toRadians(eulerDeg.y),
      toRadians(eulerDeg.z),
      srcOrder
    )
    const m = new THREE.Matrix4().makeRotationFromEuler(eSrc)
    // 以目标顺序从矩阵提取欧拉角
    const eDst = new THREE.Euler(0, 0, 0, dstOrder)
    eDst.setFromRotationMatrix(m)
    return { x: toDegrees(eDst.x), y: toDegrees(eDst.y), z: toDegrees(eDst.z) }
  }

  // 4) 将一帧 Motion 数据按 BVH 的 CHANNELS 顺序重排
  function arrangeDataForFrame(frame: number[]): number[] {
    const out: number[] = []

    // 首先应用逆向关节映射，还原原始的轴顺序
    const reverseMappedFrame = reverseJointMapping(frame)

    // 根：位置取自 base.pos，旋转取自 base.quat -> 按 root 的旋转通道顺序求欧拉
    const [pxi, pyi, pzi] = dofMap.base.pos
    // 将位置数据除以positionScale进行还原，然后再应用scaleFactor
    const pos = {
      x: (reverseMappedFrame[pxi] || 0) / positionScale,
      y: (reverseMappedFrame[pyi] || 0) / positionScale,
      z: (reverseMappedFrame[pzi] || 0) / positionScale,
    }
    // 根旋转：忽略四元数，直接使用 dof_names 中根关节（ROOT 名称）的 x/y/z（已为度）
    const rootIdxMap = dofMap.joints[root.name] || {}
    const eRootDeg = {
      x: rootIdxMap.x !== undefined ? reverseMappedFrame[rootIdxMap.x] : 0,
      y: rootIdxMap.y !== undefined ? reverseMappedFrame[rootIdxMap.y] : 0,
      z: rootIdxMap.z !== undefined ? reverseMappedFrame[rootIdxMap.z] : 0,
    }
    // 源顺序来自于 MotionJSON（默认 XYZ，可通过 options.eulerOrder 指定）；目标顺序来自 BVH root 的 CHANNELS
    const srcOrder = (options.eulerOrder || 'XYZ') as 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
    const rootDstOrder = getRotationOrderFromChannels(root.channels)
    const eRootRemapped = remapEulerAngles(eRootDeg, srcOrder, rootDstOrder)

    for (const ch of root.channels) {
      const key = ch.toLowerCase()
      if (key === 'xposition') out.push(pos.x)
      else if (key === 'yposition') out.push(pos.y)
      else if (key === 'zposition') out.push(pos.z)
      else if (key === 'xrotation') out.push(eRootRemapped.x)
      else if (key === 'yrotation') out.push(eRootRemapped.y)
      else if (key === 'zrotation') out.push(eRootRemapped.z)
    }

    // 各关节：按各自 CHANNELS 顺序输出对应轴角度（弧度->度）
    for (const j of joints) {
      const idxMap = dofMap.joints[j.name] || {}
      const eDeg = {
        x: idxMap.x !== undefined ? reverseMappedFrame[idxMap.x] : 0,
        y: idxMap.y !== undefined ? reverseMappedFrame[idxMap.y] : 0,
        z: idxMap.z !== undefined ? reverseMappedFrame[idxMap.z] : 0,
      }
      const jDstOrder = getRotationOrderFromChannels(j.channels)
      const eRemapped = remapEulerAngles(eDeg, srcOrder, jDstOrder)
      for (const ch of j.channels) {
        const lower = ch.toLowerCase()
        if (lower === 'xposition') out.push(0)
        else if (lower === 'yposition') out.push(0)
        else if (lower === 'zposition') out.push(0)
        else if (lower === 'xrotation') out.push(eRemapped.x)
        else if (lower === 'yrotation') out.push(eRemapped.y)
        else if (lower === 'zrotation') out.push(eRemapped.z)
      }
    }

    return out
  }

  // 5) 生成 MOTION 文本
  const frameCount = data.length
  const newFrameTime =
    typeof framerate !== 'undefined' && framerate !== null
      ? 1 / (parseFloat(String(framerate)) || 0)
      : 0
  const frameTime =
    newFrameTime > 0 && Number.isFinite(newFrameTime) ? newFrameTime : originalFrameTime

  let motionText = 'MOTION\n'
  motionText += `Frames: ${frameCount}\n`
  motionText += `Frame Time: ${frameTime.toFixed(6)}\n`
  for (let i = 0; i < frameCount; i++) {
    const arranged = arrangeDataForFrame(data[i])
    motionText += arranged.map(v => (Number.isFinite(v) ? v : 0).toFixed(6)).join(' ') + '\n'
  }

  return hierarchyPart + '\n' + motionText
}

/**
 * 字符串文件下载器
 *
 * 将字符串内容作为文件下载到用户本地，支持各种文本格式文件的导出。
 * 这是动作编辑器文件导出功能的基础工具，提供简单可靠的文件下载体验。
 *
 * 技术实现：
 * - Blob创建：将字符串内容转换为Blob对象
 * - URL生成：创建临时的下载URL
 * - 自动下载：通过隐藏链接触发浏览器下载
 * - 资源清理：下载完成后自动清理临时资源
 *
 * 支持格式：
 * - BVH文件：动作捕捉数据文件
 * - JSON文件：结构化数据文件
 * - 文本文件：各种文本格式文件
 * - 配置文件：应用配置和设置文件
 *
 * 使用特点：
 * - 即时下载：无需服务器支持，纯前端实现
 * - 格式灵活：支持任意文本内容和文件名
 * - 兼容性好：支持所有现代浏览器
 * - 用户友好：遵循浏览器标准下载流程
 *
 * 应用场景：
 * - 动作导出：导出编辑后的BVH动作文件
 * - 数据备份：保存项目数据和配置
 * - 格式转换：导出不同格式的数据文件
 * - 分享协作：生成可分享的文件内容
 *
 * 这个工具为动作编辑器提供了完整的文件导出能力。
 */
export function downloadStringAsFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
/**
 * 四元数控制球初始化器
 *
 * 创建一个交互式的3D四元数控制球，提供直观的旋转姿态编辑体验。
 * 这是动作编辑器中用于旋转控制的高级UI组件，支持多种交互模式和视觉反馈。
 *
 * 核心功能：
 * - 3D交互：通过鼠标拖拽直接操作3D旋转
 * - 双模式支持：同时支持四元数和欧拉角模式
 * - 视觉指示：彩色半球和引导线提供清晰的方向指示
 * - 约束控制：支持单轴约束和自由旋转模式
 * - 实时反馈：拖拽过程中实时更新旋转数据
 *
 * 视觉设计：
 * - 半球着色：前半球（绿色）和后半球（红色）区分方向
 * - 引导线：白色线指示前方向，黄色线指示上方向
 * - 坐标轴：世界坐标轴辅助空间理解
 * - 分界环：黑色环线清晰标示前后分界
 *
 * 交互特性：
 * - 指针捕获：支持精确的拖拽操作
 * - 多点触控：兼容触摸设备操作
 * - 滚轮禁用：防止意外的页面滚动
 * - 约束模式：支持世界坐标系和机器人坐标系约束
 *
 * 技术实现：
 * - Three.js渲染：使用WebGL实现高性能3D渲染
 * - 物理材质：PBR材质提供真实的光照效果
 * - 自适应布局：响应容器尺寸变化
 * - 内存管理：完善的资源清理机制
 *
 * API接口：
 * - 旋转读写：支持四元数和欧拉角的读取和设置
 * - 视觉定制：可调整球体颜色、引导方向等
 * - 相机控制：支持程序化的相机位置调整
 * - 约束设置：灵活的旋转轴约束配置
 *
 * 应用场景：
 * - 机器人姿态控制：直观调整机器人的旋转姿态
 * - 相机方向设置：设置3D场景的观察方向
 * - 动画关键帧：创建旋转动画的关键帧
 * - 物体定向：精确控制3D物体的朝向
 *
 * 这个控制球为复杂的3D旋转操作提供了直观、专业的用户界面。
 */
export function initQuatSphere(
  container: any,
  {
    // 球体半径（世界单位）
    radius = 0.8,
    // 旋转变化回调：每次交互更新后回调当前四元数或欧拉角
    onChange = (e: any) => { },
    // 拖拽结束回调：当用户释放鼠标时调用
    onEnd = () => { },
    // 控制模式：'quaternion' 使用四元数，'euler' 使用欧拉角
    mode = 'quaternion' as 'quaternion' | 'euler',
    // 标签点击回调
    onLabelClick = (axis: 'X' | 'Y' | 'Z', sign: 1 | -1) => { },
    // 是否开启标签 hover/指针样式（用于关节旋转球可选关闭）
    enableLabelHoverCursor = true,
    // 是否允许拖拽旋转球体（禁用后仍保留标签点击/hover）
    enableDragRotate = true,
  } = {}
) {
  // 创建场景（承载所有3D对象）
  const scene = new THREE.Scene()
  // 读取容器尺寸并做下限保护，防止 0 宽/高导致渲染报错
  const w = Math.max(1, container.clientWidth)
  const h = Math.max(1, container.clientHeight)

  // 透视相机：40度视角，近裁剪0.01，远裁剪100
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100)
  // 相机初始位置：拉远以避免端点被遮挡
  camera.position.set(2.1, 2.1, 2.1)
  // 设定世界上方向为Y+
  camera.up.set(0, 1, 0)
  // 看向原点：球体放置在(0,0,0)
  camera.lookAt(0, 0, 0)

  // WebGL 渲染器：开启抗锯齿与透明
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  // 限制像素比，兼顾清晰与性能
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  // 设置画布尺寸并挂载到容器
  renderer.setSize(w, h)
  container.appendChild(renderer.domElement)

  type AxisKey = 'X' | 'Y' | 'Z'
  // 统一与 BVH 一致的轴颜色：X=红，Y=绿，Z=蓝
  const axisColors: Record<AxisKey, THREE.Color> = {
    X: new THREE.Color(0xff5555), // 红色 X
    Y: new THREE.Color(0x8fd14f), // 绿色 Y
    Z: new THREE.Color(0x4f9dff), // 蓝色 Z
  }
  const hoverTargets: THREE.Object3D[] = []
  const billboardSprites: THREE.Sprite[] = []
  const materials: THREE.Material[] = []
  const geometries: THREE.BufferGeometry[] = []
  const textures: (THREE.Texture | THREE.CanvasTexture)[] = []
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hoverAxis: AxisKey | null = null
  let backdropActive = false

  // 球体与背景：统一灰色、半透明，贴近 Blender 风格
  const sphereGeom = new THREE.SphereGeometry(radius, 64, 32)
  geometries.push(sphereGeom)
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x606060,
    metalness: 0,
    roughness: 0.85,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  })
  materials.push(sphereMat)
  const sphere = new THREE.Mesh(sphereGeom, sphereMat)
  scene.add(sphere)

  const backdropGeom = new THREE.CircleGeometry(radius * 1.15, 64)
  geometries.push(backdropGeom)
  const backdropMat = new THREE.MeshBasicMaterial({
    color: 0x4f4f4f,
    transparent: true,
    opacity: 0.0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  materials.push(backdropMat)
  const backdrop = new THREE.Mesh(backdropGeom, backdropMat)
  scene.add(backdrop)

  // 轴线与端点
  const lineRadius = radius * 0.82
  const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-lineRadius, 0, 0),
    new THREE.Vector3(lineRadius, 0, 0),
  ])
  const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -lineRadius, 0),
    new THREE.Vector3(0, lineRadius, 0),
  ])
  const zAxisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -lineRadius),
    new THREE.Vector3(0, 0, lineRadius),
  ])
  geometries.push(xAxisGeom, yAxisGeom, zAxisGeom)

  const capGeom = new THREE.SphereGeometry(radius * 0.15, 24, 16)
  geometries.push(capGeom)
  // 统一与 BVH 一致的轴位置：X 右，Y 上，Z 前
  const axisBasis: Record<AxisKey, THREE.Vector3> = {
    X: new THREE.Vector3(1, 0, 0),
    Y: new THREE.Vector3(0, 1, 0),
    Z: new THREE.Vector3(0, 0, 1),
  }
  const positiveLabels: Record<AxisKey, THREE.Sprite> = {} as any
  const negativeLabels: Record<AxisKey, THREE.Sprite> = {} as any
  const negativeCaps: Record<AxisKey, THREE.Mesh> = {} as any
  const capDistance = lineRadius
  const labelDistance = radius * 1

  function createTextSprite(text: string, background: string, darker = false) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.beginPath()
      ctx.fillStyle = darker ? background : background
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 8, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = 'bold 120px Inter, Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4)
    }
    const map = new THREE.CanvasTexture(canvas)
    textures.push(map)
    const material = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    materials.push(material)
    const sprite = new THREE.Sprite(material)
    sprite.renderOrder = 10
    const scale = radius * 0.6
    sprite.scale.set(scale, scale, scale)
    billboardSprites.push(sprite)
    scene.add(sprite)
    hoverTargets.push(sprite) // Add sprite to hover targets
    return sprite
  }

  function createAxis(axis: AxisKey, geom: THREE.BufferGeometry) {
    const color = axisColors[axis]
    const lineMat = new THREE.LineBasicMaterial({ color: color.getHex(), linewidth: 2 })
    materials.push(lineMat)
    const line = new THREE.Line(geom, lineMat)
    sphere.add(line)

    const negMat = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.55),
      emissive: color.clone().multiplyScalar(0.15),
      roughness: 0.35,
      metalness: 0.05,
      transparent: true,
      opacity: 0.9,
    })
    materials.push(negMat)
    const negCap = new THREE.Mesh(capGeom, negMat)
    negCap.position.copy(axisBasis[axis]).multiplyScalar(-capDistance)
    negCap.userData.axis = axis
    negCap.userData.sign = -1 // Negative cap
    sphere.add(negCap)
    negativeCaps[axis] = negCap
    hoverTargets.push(negCap)

    positiveLabels[axis] = createTextSprite(axis, color.getStyle())
    positiveLabels[axis].userData.axis = axis
    positiveLabels[axis].userData.sign = 1

    negativeLabels[axis] = createTextSprite(`-${axis}`, color.clone().multiplyScalar(0.65).getStyle(), true)
    negativeLabels[axis].visible = false
    negativeLabels[axis].userData.axis = axis
    negativeLabels[axis].userData.sign = -1
  }

  // 轴线几何体：统一与 BVH 一致（X/Y/Z 分别沿对应世界轴）
  createAxis('X', xAxisGeom)
  createAxis('Y', yAxisGeom)
  createAxis('Z', zAxisGeom)


  // 环境光与主光：确保球体与指示线清晰可见
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.0))
  const key = new THREE.DirectionalLight(0xffffff, 0.9)
  key.position.set(3, 4, 5)
  scene.add(key)

  // 四元数转欧拉角的辅助函数（XYZ顺序，返回度数）
  function quaternionToEuler(quat: THREE.Quaternion): { x: number; y: number; z: number } {
    const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ')
    return {
      x: (euler.x * 180) / Math.PI,
      y: (euler.y * 180) / Math.PI,
      z: (euler.z * 180) / Math.PI,
    }
  }

  // 欧拉角转四元数的辅助函数（输入度数，XYZ顺序）
  function eulerToQuaternion(euler: { x: number; y: number; z: number }): THREE.Quaternion {
    const eulerRad = new THREE.Euler(
      (euler.x * Math.PI) / 180,
      (euler.y * Math.PI) / 180,
      (euler.z * Math.PI) / 180,
      'XYZ'
    )
    return new THREE.Quaternion().setFromEuler(eulerRad)
  }

  // 根据模式返回相应格式的旋转数据
  function getRotationData(quat: THREE.Quaternion) {
    if (mode === 'euler') {
      return quaternionToEuler(quat)
    } else {
      return { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
    }
  }

  // 交互状态与临时量：用于把指针移动映射为四元数旋转
  let isDragging = false
  let lastX = 0,
    lastY = 0
  const sphereQuat = new THREE.Quaternion()
  const dqYaw = new THREE.Quaternion()
  const dqPitch = new THREE.Quaternion()
  const tmp = new THREE.Vector3()
  const omega = new THREE.Vector3()
  const worldAxisX = new THREE.Vector3(1, 0, 0)
  const worldAxisY = new THREE.Vector3(0, 1, 0)
  const worldAxisZ = new THREE.Vector3(0, 0, 1)
  let axisConstraint: 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ' | null = null
  function updateBillboards() {
    ; (['X', 'Y', 'Z'] as AxisKey[]).forEach(axis => {
      const dir = axisBasis[axis].clone().applyQuaternion(sphereQuat)
      positiveLabels[axis].position.copy(dir.clone().multiplyScalar(labelDistance))
      positiveLabels[axis].quaternion.copy(camera.quaternion)

      negativeLabels[axis].position.copy(dir.clone().negate().multiplyScalar(labelDistance))
      negativeLabels[axis].quaternion.copy(camera.quaternion)
    })
    backdrop.quaternion.copy(camera.quaternion)
  }

  function setHoverAxis(axis: AxisKey | null) {
    if (hoverAxis === axis) return
    hoverAxis = axis
      ; (['X', 'Y', 'Z'] as AxisKey[]).forEach(key => {
        negativeLabels[key].visible = hoverAxis === key
        const mat = negativeCaps[key].material as THREE.MeshStandardMaterial
        mat.emissiveIntensity = hoverAxis === key ? 0.5 : 0.15
        mat.opacity = hoverAxis === key ? 1.0 : 0.9
      })
    if (enableLabelHoverCursor) {
      renderer.domElement.style.cursor = axis ? 'pointer' : 'default'
    }
    render()
  }

  function updatePointer(ev: any) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
  }

  function handleHover(ev: any) {
    if (!hoverTargets.length) return
    if (!enableLabelHoverCursor) return
    updatePointer(ev)
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(hoverTargets, false)[0]
    const axis = (hit?.object?.userData?.axis as AxisKey | undefined) ?? null
    setHoverAxis(axis)
  }
  function setBackdropVisible(flag: boolean) {
    backdropActive = flag
  }
  function onPointerEnter() {
    setBackdropVisible(true)
    render()
  }
  function onPointerLeaveCanvas(ev: any) {
    onPointerUp(ev)
    setBackdropVisible(false)
    setHoverAxis(null)
    render()
  }
  // 指针按下：开始拖拽并记录起点
  let pointerDownTarget: THREE.Object3D | null = null
  let pointerDownPos = new THREE.Vector2()

  function onPointerDown(ev: any) {
    isDragging = !!enableDragRotate
    renderer.domElement.setPointerCapture(ev.pointerId)
    lastX = ev.clientX
    lastY = ev.clientY

    updatePointer(ev)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(hoverTargets, false)
    pointerDownTarget = hits.length > 0 ? hits[0].object : null
    pointerDownPos.set(ev.clientX, ev.clientY)
  }
  // 指针移动：将屏幕位移映射为绕相机 up/right 的角速度，再累乘到球体四元数
  function onPointerMove(ev: any) {
    handleHover(ev)
    if (!isDragging) return
    const dx = (ev.clientX - lastX) / w
    const dy = (ev.clientY - lastY) / h
    lastX = ev.clientX
    lastY = ev.clientY

    const rotSpeed = Math.PI
    const forward = camera.getWorldDirection(new THREE.Vector3()).normalize()
    const right = tmp.copy(forward).cross(camera.up).normalize()

    // 角速度矢量：沿相机up与right方向叠加
    omega
      .copy(camera.up)
      .multiplyScalar(dx * rotSpeed)
      .addScaledVector(right, dy * rotSpeed)

    if (axisConstraint) {
      let constraintAxis: THREE.Vector3

      if (axisConstraint === 'X' || axisConstraint === 'Y' || axisConstraint === 'Z') {
        // 世界坐标系约束：仅保留在指定世界轴上的分量，得到单轴旋转
        constraintAxis =
          axisConstraint === 'X' ? worldAxisX : axisConstraint === 'Y' ? worldAxisY : worldAxisZ
      } else {
        // 机器人坐标系约束：计算机器人自身的坐标轴
        const robotAxisX = new THREE.Vector3(1, 0, 0).applyQuaternion(sphereQuat).normalize() // 白线方向
        const robotAxisY = new THREE.Vector3(0, 1, 0).applyQuaternion(sphereQuat).normalize() // 黄线方向（与 BVH 一致）
        const robotAxisZ = new THREE.Vector3().crossVectors(robotAxisX, robotAxisY).normalize() // 垂直轴

        constraintAxis =
          axisConstraint === 'RX' ? robotAxisX : axisConstraint === 'RY' ? robotAxisY : robotAxisZ
      }

      const scalar = omega.dot(constraintAxis)
      dqYaw.setFromAxisAngle(constraintAxis, scalar)
      sphereQuat.premultiply(dqYaw).normalize()
    } else {
      // 自由旋转：分别计算绕 up 与 right 的旋转并按顺序累乘
      dqYaw.setFromAxisAngle(camera.up, dx * rotSpeed)
      dqPitch.setFromAxisAngle(right, dy * rotSpeed)
      sphereQuat.premultiply(dqYaw).premultiply(dqPitch).normalize()
    }
    sphere.quaternion.copy(sphereQuat)
    onChange(getRotationData(sphereQuat))
    render()
  }
  // 指针抬起：结束拖拽并释放捕获
  function onPointerUp(ev: any) {
    const wasDragging = isDragging
    isDragging = false
    renderer.domElement.releasePointerCapture(ev.pointerId)
    setHoverAxis(null)
    // 如果之前正在拖拽，则调用结束回调
    if (wasDragging) {
      onEnd()
    }

    // Check for click on label/cap
    const moveDist = pointerDownPos.distanceTo(new THREE.Vector2(ev.clientX, ev.clientY))
    if (moveDist < 5 && pointerDownTarget) {
      updatePointer(ev)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(hoverTargets, false)
      if (hits.length > 0 && hits[0].object === pointerDownTarget) {
        const userData = hits[0].object.userData
        if (userData && userData.axis && userData.sign) {
          onLabelClick(userData.axis, userData.sign)
        }
      }
    }
    pointerDownTarget = null
  }
  // 绑定交互事件：按下/移动/抬起/离开 与 鼠标滚轮（阻止默认滚动）
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointerenter', onPointerEnter)
  renderer.domElement.addEventListener('pointerleave', onPointerLeaveCanvas)
  renderer.domElement.addEventListener('wheel', (e: WheelEvent) => e.preventDefault(), {
    passive: false,
  })

  // 对外API：读/写旋转数据、修改引导方向/配色、设置约束与相机
  const api = {
    // 读取当前球体旋转数据（根据模式返回四元数或欧拉角）
    getRotation() {
      return getRotationData(sphere.quaternion)
    },
    // 读取当前球体四元数（兼容性方法）
    getQuaternion() {
      const q = sphere.quaternion
      return { x: q.x, y: q.y, z: q.z, w: q.w }
    },
    // 设置球体旋转（支持四元数或欧拉角，根据输入自动判断）
    setRotation(data: any) {
      let quat: THREE.Quaternion

      if (data && typeof data === 'object') {
        // 如果有w属性，认为是四元数
        if ('w' in data) {
          quat =
            data && data.isQuaternion
              ? data
              : new THREE.Quaternion(data?.x ?? 0, data?.y ?? 0, data?.z ?? 0, data?.w ?? 1)
        } else {
          // 否则认为是欧拉角（度数）
          quat = eulerToQuaternion({
            x: data?.x ?? 0,
            y: data?.y ?? 0,
            z: data?.z ?? 0,
          })
        }
      } else {
        quat = new THREE.Quaternion()
      }

      sphereQuat.copy(quat).normalize()
      sphere.quaternion.copy(sphereQuat)
      onChange(getRotationData(sphereQuat))
      render()
    },
    // 设置球体四元数（兼容性方法）
    setQuaternion(q: any) {
      const quat =
        q && q.isQuaternion ? q : new THREE.Quaternion(q?.x ?? 0, q?.y ?? 0, q?.z ?? 0, q?.w ?? 1)
      sphereQuat.copy(quat).normalize()
      sphere.quaternion.copy(sphereQuat)
      onChange(getRotationData(sphereQuat))
      render()
    },
    // 设置欧拉角（输入度数）
    setEuler(euler: { x: number; y: number; z: number }) {
      const quat = eulerToQuaternion(euler)
      sphereQuat.copy(quat).normalize()
      sphere.quaternion.copy(sphereQuat)
      onChange(getRotationData(sphereQuat))
      render()
    },
    // 修改X轴直径线朝向（保持API兼容性）
    setGuideDirection(dir = new THREE.Vector3(1, 0, 0)) {
      const d = dir.clone().normalize().multiplyScalar(lineRadius)
      xAxisGeom.setFromPoints([d.clone().negate(), d])
      xAxisGeom.attributes.position.needsUpdate = true
      render()
    },
    // 设置球体材质颜色与透明度
    setSphereColor(color = 0x0078d7, opacity = 0.2) {
      sphereMat.color = new THREE.Color(color)
      sphereMat.opacity = opacity
      sphereMat.transparent = opacity < 1.0
      sphereMat.needsUpdate = true
      render()
    },
    // 设置旋转轴约束：'X' | 'Y' | 'Z' 为世界坐标系，'RX' | 'RY' | 'RZ' 为机器人坐标系，undefined 表示自由旋转
    setAxisConstraint(axis?: 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ') {
      axisConstraint = axis ?? null
    },
    // 通过目标四元数布置相机位置（相机始终看向原点）
    setCameraByQuaternion(
      qInput: any,
      { distance = null, forwardAxis = new THREE.Vector3(0, 0, -1) } = {}
    ) {
      const q =
        qInput && qInput.isQuaternion
          ? qInput.clone().normalize()
          : new THREE.Quaternion(
            qInput?.x ?? 0,
            qInput?.y ?? 0,
            qInput?.z ?? 0,
            qInput?.w ?? 1
          ).normalize()
      const forward = forwardAxis.clone().applyQuaternion(q).normalize()
      const dist = distance != null ? distance : camera.position.length() || 1.8
      camera.position.copy(forward.multiplyScalar(-dist))
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      render()
    },
    // 直接设置相机位置（仍然看向原点）
    setCameraPosition(pos = { x: 1.8, y: 1.8, z: 1.8 }) {
      camera.position.set(pos.x, pos.y, pos.z)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      render()
    },
  }

  // 单帧渲染：根据当前相机/场景状态绘制
  function render() {
    updateBillboards()
    backdropMat.opacity = backdropActive ? 0.18 : 0.0
    renderer.render(scene, camera)
  }

  // 首帧渲染：初始化完成后立即出图
  render()

  // 自适应容器尺寸变化：保持正确宽高比与清晰度
  const ro = new ResizeObserver(() => {
    const ww = Math.max(1, container.clientWidth)
    const hh = Math.max(1, container.clientHeight)
    camera.aspect = ww / hh
    camera.updateProjectionMatrix()
    renderer.setSize(ww, hh)
    render()
  })
  ro.observe(container)
  // 销毁方法：移除监听、释放GPU资源并从DOM移除画布
  function dispose() {
    ro.disconnect()
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointerenter', onPointerEnter)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeaveCanvas)
    billboardSprites.forEach(s => {
      if (s.parent) s.parent.remove(s)
    })
    textures.forEach(t => t.dispose())
    materials.forEach(m => m.dispose())
    geometries.forEach(g => g.dispose())
    renderer.dispose()
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement)
    }
  }

  // 暴露API与销毁函数
  return { api, dispose }
}

/**
 * 关节四元数球初始化器（简化版）
 * 
 * 创建用于关节旋转控制的简化版四元数球，采用淡蓝色网格线包裹，
 * 移除标签和坐标轴，提供更简洁的交互界面。
 * 
 * 核心特性：
 * - 淡蓝色网格线包裹：使用线框几何体创建网格效果
 * - 无标签无坐标轴：只保留球体和网格线，界面更简洁
 * - 欧拉角模式：专为BVH关节旋转设计
 * - 完整交互：支持拖拽旋转和轴约束
 * - 相机控制：可程序化调整观察角度
 */
export function initJointQuatSphere(
  container: any,
  {
    radius = 0.8,
    onChange = (e: any) => { },
    onEnd = () => { },
    mode = 'euler' as 'quaternion' | 'euler',
    // 是否显示坐标系（X红Y绿Z蓝）
    showAxes = false,
    // 坐标轴长度（默认略大于球体半径）
    axesSize,
    // 坐标系空间：'sphere' 表示跟随球体姿态（显示欧拉角朝向），'world' 表示固定世界坐标系
    axesSpace = 'sphere' as 'sphere' | 'world',
    // 欧拉角分解/合成顺序（BVH 关节可能不是 XYZ；若 setEuler 传入 order，会动态覆盖）
    eulerOrder = 'XYZ' as THREE.EulerOrder,
    // 根关节全局旋转（用于“根关节约束”），可传 three Quaternion 或 {x,y,z,w}
    rootAxisQuaternion = null as THREE.Quaternion | { x: number; y: number; z: number; w: number } | null,
  }: {
    radius?: number
    onChange?: (e: any) => void
    onEnd?: () => void
    mode?: 'quaternion' | 'euler'
    showAxes?: boolean
    axesSize?: number
    axesSpace?: 'sphere' | 'world'
    eulerOrder?: THREE.EulerOrder
    rootAxisQuaternion?: THREE.Quaternion | { x: number; y: number; z: number; w: number } | null
  } = {}
) {
  const scene = new THREE.Scene()
  const w = Math.max(1, container.clientWidth)
  const h = Math.max(1, container.clientHeight)

  const camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100)
  camera.position.set(2.1, 2.1, 2.1)
  camera.up.set(0, 1, 0)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  container.appendChild(renderer.domElement)

  const materials: THREE.Material[] = []
  const geometries: THREE.BufferGeometry[] = []

  // 半透明球体
  const sphereGeom = new THREE.SphereGeometry(radius, 64, 32)
  geometries.push(sphereGeom)
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x606060,
    metalness: 0,
    roughness: 0.85,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  })
  materials.push(sphereMat)
  const sphere = new THREE.Mesh(sphereGeom, sphereMat)
  scene.add(sphere)

  // 坐标系：默认挂到球体上，随球体旋转（显示“欧拉角朝向坐标系”）
  const resolvedAxesSize = typeof axesSize === 'number' && Number.isFinite(axesSize) ? axesSize : radius * 1.1
  const axesHelper: THREE.AxesHelper | null = showAxes ? new THREE.AxesHelper(resolvedAxesSize) : null
  const axesParent: THREE.Object3D | null =
    axesHelper ? (axesSpace === 'world' ? scene : sphere) : null
  if (axesHelper && axesParent) {
    axesParent.add(axesHelper)
  }

  // 淡蓝色网格线包裹（使用线框几何体）
  const wireframeGeom = new THREE.WireframeGeometry(sphereGeom)
  geometries.push(wireframeGeom)
  const wireframeMat = new THREE.LineBasicMaterial({
    color: 0x87ceeb, // 淡蓝色 Sky Blue
    transparent: true,
    opacity: 0.4,
    linewidth: 1,
  })
  materials.push(wireframeMat)
  const wireframe = new THREE.LineSegments(wireframeGeom, wireframeMat)
  sphere.add(wireframe)

  // 背景圆盘（鼠标悬停时显示）
  const backdropGeom = new THREE.CircleGeometry(radius * 1.15, 64)
  geometries.push(backdropGeom)
  const backdropMat = new THREE.MeshBasicMaterial({
    color: 0x4f4f4f,
    transparent: true,
    opacity: 0.0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  materials.push(backdropMat)
  const backdrop = new THREE.Mesh(backdropGeom, backdropMat)
  scene.add(backdrop)

  // 环境光
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.0))
  const key = new THREE.DirectionalLight(0xffffff, 0.9)
  key.position.set(3, 4, 5)
  scene.add(key)

  const EULER_ORDERS: ReadonlySet<THREE.EulerOrder> = new Set([
    'XYZ',
    'XZY',
    'YXZ',
    'YZX',
    'ZXY',
    'ZYX',
  ] as const)
  const normalizeEulerOrder = (order?: any): THREE.EulerOrder => {
    const o = (order || 'XYZ').toUpperCase()
    return EULER_ORDERS.has(o as THREE.EulerOrder) ? (o as THREE.EulerOrder) : 'XYZ'
  }
  let currentEulerOrder: THREE.EulerOrder = normalizeEulerOrder(eulerOrder)

  function quaternionToEuler(quat: THREE.Quaternion): { x: number; y: number; z: number; order: THREE.EulerOrder } {
    const euler = new THREE.Euler().setFromQuaternion(quat, currentEulerOrder)
    return {
      x: (euler.x * 180) / Math.PI,
      y: (euler.y * 180) / Math.PI,
      z: (euler.z * 180) / Math.PI,
      order: currentEulerOrder,
    }
  }

  function eulerToQuaternion(euler: { x: number; y: number; z: number; order?: any }): THREE.Quaternion {
    // 若输入携带 order，则以输入为准（用于 BVH 各关节不同 order）
    currentEulerOrder = normalizeEulerOrder(euler?.order ?? currentEulerOrder)
    const eulerRad = new THREE.Euler(
      (euler.x * Math.PI) / 180,
      (euler.y * Math.PI) / 180,
      (euler.z * Math.PI) / 180,
      currentEulerOrder
    )
    return new THREE.Quaternion().setFromEuler(eulerRad)
  }

  function getRotationData(quat: THREE.Quaternion) {
    if (mode === 'euler') {
      return quaternionToEuler(quat)
    } else {
      return { x: quat.x, y: quat.y, z: quat.z, w: quat.w }
    }
  }

  // 交互状态
  let isDragging = false
  let lastX = 0,
    lastY = 0
  const sphereQuat = new THREE.Quaternion()
  const dqYaw = new THREE.Quaternion()
  const dqPitch = new THREE.Quaternion()
  const tmp = new THREE.Vector3()
  const omega = new THREE.Vector3()
  const worldAxisX = new THREE.Vector3(1, 0, 0)
  const worldAxisY = new THREE.Vector3(0, 1, 0)
  const worldAxisZ = new THREE.Vector3(0, 0, 1)
  const rootAxisQuat = (() => {
    if (!rootAxisQuaternion) return null
    if ((rootAxisQuaternion as any).isQuaternion) {
      return (rootAxisQuaternion as THREE.Quaternion).clone().normalize()
    }
    const q = rootAxisQuaternion as any
    return new THREE.Quaternion(q?.x ?? 0, q?.y ?? 0, q?.z ?? 0, q?.w ?? 1).normalize()
  })()
  let axisConstraint: 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ' | null = null
  let backdropActive = false

  function updateBackdrop() {
    backdrop.quaternion.copy(camera.quaternion)
  }

  function setBackdropVisible(flag: boolean) {
    backdropActive = flag
  }

  function onPointerEnter() {
    setBackdropVisible(true)
    render()
  }

  function onPointerLeaveCanvas(ev: any) {
    onPointerUp(ev)
    setBackdropVisible(false)
    render()
  }

  function onPointerDown(ev: any) {
    isDragging = true
    renderer.domElement.setPointerCapture(ev.pointerId)
    lastX = ev.clientX
    lastY = ev.clientY
  }

  function onPointerMove(ev: any) {
    if (!isDragging) return
    const dx = (ev.clientX - lastX) / w
    const dy = (ev.clientY - lastY) / h
    lastX = ev.clientX
    lastY = ev.clientY

    const rotSpeed = Math.PI
    const forward = camera.getWorldDirection(new THREE.Vector3()).normalize()
    const right = tmp.copy(forward).cross(camera.up).normalize()

    omega
      .copy(camera.up)
      .multiplyScalar(dx * rotSpeed)
      .addScaledVector(right, dy * rotSpeed)

    if (axisConstraint) {
      const axis = axisConstraint.startsWith('R') ? axisConstraint.slice(1) : axisConstraint
      const isRobotSpace = axisConstraint.startsWith('R')
      let constraintAxis: THREE.Vector3
      if (axis === 'X') constraintAxis = rootAxisQuat ? worldAxisX.clone().applyQuaternion(rootAxisQuat) : worldAxisX
      else if (axis === 'Y') constraintAxis = rootAxisQuat ? worldAxisY.clone().applyQuaternion(rootAxisQuat) : worldAxisY
      else constraintAxis = rootAxisQuat ? worldAxisZ.clone().applyQuaternion(rootAxisQuat) : worldAxisZ

      if (isRobotSpace) {
        constraintAxis = constraintAxis.clone().applyQuaternion(sphereQuat).normalize()
      }

      const proj = omega.dot(constraintAxis)
      omega.copy(constraintAxis).multiplyScalar(proj)
    }

    const angle = omega.length()
    if (angle > 1e-6) {
      const rotAxis = omega.clone().normalize()
      dqYaw.setFromAxisAngle(rotAxis, angle)
      sphereQuat.premultiply(dqYaw).normalize()
      sphere.quaternion.copy(sphereQuat)
      onChange(getRotationData(sphereQuat))
      render()
    }
  }

  function onPointerUp(ev: any) {
    if (isDragging) {
      isDragging = false
      renderer.domElement.releasePointerCapture(ev.pointerId)
      onEnd()
    }
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointerenter', onPointerEnter)
  renderer.domElement.addEventListener('pointerleave', onPointerLeaveCanvas)
  renderer.domElement.addEventListener('wheel', (e: WheelEvent) => e.preventDefault(), {
    passive: false,
  })

  const api = {
    getRotation() {
      return getRotationData(sphere.quaternion)
    },
    getQuaternion() {
      const q = sphere.quaternion
      return { x: q.x, y: q.y, z: q.z, w: q.w }
    },
    setRotation(data: any) {
      let quat: THREE.Quaternion
      if (data && typeof data === 'object') {
        if ('w' in data) {
          quat =
            data && data.isQuaternion
              ? data
              : new THREE.Quaternion(data?.x ?? 0, data?.y ?? 0, data?.z ?? 0, data?.w ?? 1)
        } else {
          quat = eulerToQuaternion({
            x: data?.x ?? 0,
            y: data?.y ?? 0,
            z: data?.z ?? 0,
          })
        }
      } else {
        quat = new THREE.Quaternion()
      }
      sphereQuat.copy(quat).normalize()
      sphere.quaternion.copy(sphereQuat)
      onChange(getRotationData(sphereQuat))
      render()
    },
    setQuaternion(q: any) {
      const quat =
        q && q.isQuaternion ? q : new THREE.Quaternion(q?.x ?? 0, q?.y ?? 0, q?.z ?? 0, q?.w ?? 1)
      sphereQuat.copy(quat).normalize()
      sphere.quaternion.copy(sphereQuat)
      onChange(getRotationData(sphereQuat))
      render()
    },
    setEuler(euler: { x: number; y: number; z: number }) {
      const quat = eulerToQuaternion(euler as any)
      sphereQuat.copy(quat).normalize()
      sphere.quaternion.copy(sphereQuat)
      onChange(getRotationData(sphereQuat))
      render()
    },
    setSphereColor(color = 0x606060, opacity = 0.15) {
      sphereMat.color = new THREE.Color(color)
      sphereMat.opacity = opacity
      sphereMat.transparent = opacity < 1.0
      sphereMat.needsUpdate = true
      render()
    },
    setAxisConstraint(axis?: 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ') {
      axisConstraint = axis ?? null
    },
    setCameraByQuaternion(
      qInput: any,
      { distance = null, forwardAxis = new THREE.Vector3(0, 0, -1) } = {}
    ) {
      const q =
        qInput && qInput.isQuaternion
          ? qInput.clone().normalize()
          : new THREE.Quaternion(
            qInput?.x ?? 0,
            qInput?.y ?? 0,
            qInput?.z ?? 0,
            qInput?.w ?? 1
          ).normalize()
      const forward = forwardAxis.clone().applyQuaternion(q).normalize()
      const dist = distance != null ? distance : camera.position.length() || 1.8
      camera.position.copy(forward.multiplyScalar(-dist))
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      render()
    },
    setCameraPosition(pos = { x: 1.8, y: 1.8, z: 1.8 }) {
      camera.position.set(pos.x, pos.y, pos.z)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      render()
    },
  }

  function render() {
    updateBackdrop()
    backdropMat.opacity = backdropActive ? 0.18 : 0.0
    renderer.render(scene, camera)
  }

  render()

  const ro = new ResizeObserver(() => {
    const ww = Math.max(1, container.clientWidth)
    const hh = Math.max(1, container.clientHeight)
    camera.aspect = ww / hh
    camera.updateProjectionMatrix()
    renderer.setSize(ww, hh)
    render()
  })
  ro.observe(container)

  function dispose() {
    ro.disconnect()
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('pointerenter', onPointerEnter)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeaveCanvas)
    if (axesHelper) {
      // AxesHelper 自带 geometry/material，需要手动释放
      ; (axesHelper.geometry as any)?.dispose?.()
      const mat = axesHelper.material as any
      if (Array.isArray(mat)) mat.forEach((m: any) => m?.dispose?.())
      else mat?.dispose?.()
      axesParent?.remove(axesHelper)
    }
    materials.forEach(m => m.dispose())
    geometries.forEach(g => g.dispose())
    renderer.dispose()
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement)
    }
  }

  return { api, dispose }
}

/**
 * 线性图表选项接口
 *
 * 定义线性图表组件的配置选项和事件回调接口。
 * 支持丰富的交互事件和视觉定制选项。
 */
interface ILineChartOptions {
  data?: number[]
  yMin?: number
  yMax?: number
  color?: string
  xLabels?: (string | number)[]
  keyframes?: number[]
  keyframeColor?: string
  currentFrameColor?: string
  handleData?: Record<
    number,
    {
      in: { x: number; y: number }
      out: { x: number; y: number }
    }
  >
  selectedKeyframe?: number | null
  onClick?: (e: any) => void
  onBlankClick?: (e: any) => void
  onPointClick?: (e: any) => void
  onHover?: (e: any) => void
  onLeftDown?: (e: any) => void
  onRightDown?: (e: any) => void
  onMouseUp?: (e: any) => void
  onCtrlWheel?: (e: WheelEvent) => void
  onWheel?: (e: WheelEvent) => void
  onMouseLeave?: (e: any) => void
  onCtrlShiftWheel?: (e: WheelEvent) => void
  onShiftWheel?: (e: WheelEvent) => void
  onMiddleDown?: (e: any) => void
  onMiddleDrag?: (e: any) => void
  onMiddleUp?: (e: any) => void
  onHandleDragStart?: (e: any) => void
  onHandleDrag?: (e: any) => void
  onHandleDragEnd?: (e: any) => void
  theme?: 'dark' | 'light' // 主题：深色或浅色
  limitLines?: Array<number | { value: number }>
}

interface HandleDragState {
  index: number
  kind: 'in' | 'out'
}
/**
 * 线性图表创建器
 *
 * 创建高性能的Canvas线性图表组件，专为动作编辑器的轨迹面板设计。
 * 提供丰富的交互功能和专业的数据可视化体验。
 *
 * 核心功能：
 * - 高性能渲染：使用Canvas 2D API实现流畅的图表渲染
 * - 交互式编辑：支持点击、拖拽、滚轮等多种交互方式
 * - 实时更新：支持数据的实时更新和重绘
 * - 标记系统：支持时间轴标记和当前帧指示
 * - 缩放平移：支持图表的缩放和平移操作
 *
 * 视觉特性：
 * - 专业外观：深色主题配色，适合专业工具
 * - 网格系统：清晰的网格线和坐标轴
 * - 数据点：突出显示的数据点和连线
 * - 悬停反馈：鼠标悬停时的十字线和高亮
 * - 标记线：红色垂直线标记当前时间位置
 *
 * 交互系统：
 * - 鼠标事件：点击、悬停、拖拽等基础交互
 * - 键盘修饰：支持Ctrl、Shift等修饰键组合
 * - 滚轮控制：区分不同修饰键的滚轮操作
 * - 右键菜单：禁用默认右键菜单，支持自定义操作
 * - 插值悬停：智能的鼠标移动插值，提供平滑的交互体验
 *
 * 技术实现：
 * - Canvas渲染：高效的2D Canvas渲染引擎
 * - 事件系统：完整的鼠标和键盘事件处理
 * - 坐标映射：精确的屏幕坐标到数据坐标转换
 * - 自适应布局：响应容器尺寸变化的自动重绘
 * - 内存管理：完善的事件监听器清理机制
 *
 * 数据处理：
 * - 范围限制：自动处理Y轴范围和数据边界
 * - 标签系统：支持自定义X轴标签
 * - 数据验证：完善的数据有效性检查
 * - 插值计算：鼠标移动时的数据插值计算
 *
 * 应用场景：
 * - 轨迹编辑：显示和编辑机器人关节角度曲线
 * - 数据分析：可视化时间序列数据
 * - 动画制作：编辑动画曲线和关键帧
 * - 性能监控：实时显示系统性能数据
 *
 * 这个图表组件为动作编辑器提供了专业级的数据可视化和编辑能力。
 */
export function createLineChart(
  target: HTMLElement | HTMLCanvasElement,
  {
    data = [],
    yMin = 0,
    yMax = 1,
    color = '#00D1FF',
    xLabels = [],
    keyframes = [],
    keyframeColor,
    currentFrameColor,
    handleData = {},
    selectedKeyframe = null,
    onClick = () => { },
    onBlankClick = () => { },
    onPointClick = () => { },
    onHover = () => { },
    onLeftDown = () => { },
    onRightDown = () => { },
    onMouseUp = () => { },
    onCtrlWheel = () => { },
    onWheel = () => { },
    onMouseLeave = () => { },
    onCtrlShiftWheel = () => { },
    onShiftWheel = () => { },
    onMiddleDown = () => { },
    onMiddleDrag = () => { },
    onMiddleUp = () => { },
    onHandleDragStart = () => { },
    onHandleDrag = () => { },
    onHandleDragEnd = () => { },
    theme = 'dark', // 'dark' | 'light'
    limitLines = [],
  }: ILineChartOptions = {}
) {
  const canvas =
    target instanceof HTMLCanvasElement
      ? target
      : (() => {
        const c = document.createElement('canvas')
        c.style.width = '100%'
        c.style.height = '100%'
        c.style.display = 'block'
        target.appendChild(c)
        return c
      })()
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  const normalizedTheme = theme === 'light' ? 'light' : 'dark'
  const hasCustomKeyframeColor = typeof keyframeColor === 'string' && keyframeColor.trim() !== ''
  const hasCustomCurrentFrameColor =
    typeof currentFrameColor === 'string' && currentFrameColor.trim() !== ''
  const fallbackKeyframeColor = normalizedTheme === 'light' ? '#FFFFFF' : '#000000'
  const fallbackCurrentFrameColor = normalizedTheme === 'light' ? '#000000' : '#FFFFFF'
  const resolvedKeyframeColor = hasCustomKeyframeColor ? String(keyframeColor) : fallbackKeyframeColor
  const resolvedCurrentFrameColor = hasCustomCurrentFrameColor
    ? String(currentFrameColor)
    : fallbackCurrentFrameColor

  const normalizeLimitLines = (lines: any): number[] => {
    if (!Array.isArray(lines)) return []
    return lines
      .map((line: any) => {
        if (typeof line === 'number') return line
        if (line && typeof line === 'object' && Number.isFinite((line as any).value)) {
          return (line as any).value
        }
        return null
      })
      .filter((v: any) => Number.isFinite(v))
      .map((v: any) => Number(v))
  }
  const limitLineColor = 'rgba(255, 0, 0, 0.5)'

  let state: any = {
    data: Array.isArray(data) ? data.slice() : [],
    yMin: Number.isFinite(+yMin) ? +yMin : 0,
    yMax: Number.isFinite(+yMax) ? +yMax : 1,
    color: String(color || '#00D1FF'),
    xLabels: Array.isArray(xLabels) ? xLabels.slice() : [],
    // 新增：是否翻转Y轴（仅影响显示与交互映射）
    flipY: false,
    // 主题：'dark' | 'light'
    theme: normalizedTheme,
    keyframes: new Set(
      Array.isArray(keyframes) ? keyframes.map(i => Math.max(0, Math.floor(i))) : []
    ),
    keyframeColor: resolvedKeyframeColor,
    currentFrameColor: resolvedCurrentFrameColor,
    handleData: new Map(
      Object.entries(handleData || {}).map(([idx, val]) => [
        Number(idx),
        {
          in: { x: Number(val.in.x), y: Number(val.in.y) },
          out: { x: Number(val.out.x), y: Number(val.out.y) },
        },
      ])
    ),
    selectedKeyframe:
      typeof selectedKeyframe === 'number' && Number.isFinite(selectedKeyframe)
        ? selectedKeyframe
        : null,
    limitLines: normalizeLimitLines(limitLines),
    // 幽灵点：用于拖动关键帧时的实时预览，不需要更新整个图表数据
    // 格式: [{ xLabel: number, yValue: number, isSelected?: boolean }]
    ghostPoints: [] as Array<{ xLabel: number; yValue: number; isSelected?: boolean }>,
  }
  normalizeYAxis()

  // 主题颜色配置
  const getThemeColors = () => {
    if (state.theme === 'light') {
      return {
        background: 'rgba(120, 120, 120, 0)',  // 透明背景
        gridBorder: 'rgba(0, 0, 0, 0.1)',      // 浅色主题：半透明黑色边框
        gridLine: 'rgba(0, 0, 0, 0.1)',        // 浅色主题：半透明黑色网格线
        gridLineStrong: 'rgba(0, 0, 0, 0.15)', // 浅色主题：稍深的网格线（顶部和底部）
        textColor: '#333333',                  // 浅色主题：深色文字
        textColorSecondary: '#666666',         // 浅色主题：次要文字
        hoverLine: '#999999',                  // 浅色主题：悬停线
        markerLine: '#8AA2FF',                 // 标记线（滑块蓝）
        hoverDot: '#333333',                   // 浅色主题：悬停点
      }
    } else {
      return {
        background: 'rgba(28, 28, 28, 0)', // 透明背景
        gridBorder: '#4a4a4a',             // 深色主题：亮灰色边框
        gridLine: '#3a3a3a',               // 深色主题：深灰色网格线
        gridLineStrong: '#555555',         // 深色主题：亮一点的网格线（顶部和底部）
        textColor: '#cccccc',              // 深色主题：浅色文字
        textColorSecondary: '#999999',     // 深色主题：次要文字
        hoverLine: '#777777',              // 深色主题：悬停线
        markerLine: '#8AA2FF',             // 标记线（滑块蓝）
        hoverDot: '#ffffff',               // 深色主题：悬停点（白色）
      }
    }
  }
  const getKeyframePalette = () => {
    const keyframe =
      state.keyframeColor || (state.theme === 'light' ? '#FFFFFF' : '#000000')
    const current =
      state.currentFrameColor || (state.theme === 'light' ? '#00E676' : '#FFFFFF')
    return { keyframe, current }
  }

  let handleHitRegions: {
    in?: { x: number; y: number; index: number }
    out?: { x: number; y: number; index: number }
  } = {}
  let draggingHandle: HandleDragState | null = null
  let middleDragActive = false
  let selectionChangeCb: (count: number) => void = () => { }

  let handlers = {
    onClick,
    onBlankClick,
    onPointClick,
    onHover,
    onLeftDown,
    onRightDown,
    onMouseUp,
    onCtrlWheel,
    onWheel,
    onMouseLeave,
    onCtrlShiftWheel,
    onShiftWheel,
    onMiddleDown,
    onMiddleDrag,
    onMiddleUp,
    onHandleDragStart,
    onHandleDrag,
    onHandleDragEnd,
  }

  let markerIndex: number | null = null
  let markerRect: { x: number; y: number; w: number; h: number } | null = null
  let markerDragActive = false
  // 旧的横向选择逻辑保留接口但不再使用，改为矩形框选
  let selectionRange: { start: number; end: number } | null = null
  const selectedKeyframes = new Set<number>()
  const boxSelect = {
    active: false,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  }
  let boxRect: { x: number; y: number; w: number; h: number } | null = null
  let clearSelectionBtn: { x: number; y: number; w: number; h: number } | null = null
  let dpr = Math.min(window.devicePixelRatio || 1, 2)
  let bbox = canvas.getBoundingClientRect()
  let width = Math.max(1, Math.floor(bbox.width * dpr))
  let height = Math.max(1, Math.floor(bbox.height * dpr))
  // 顶部预留更多空间给旋转后的横轴标签，底部压缩留白
  // 左侧纵轴标签的内边距
  const padding = { left: 90, right: 16, top: 48, bottom: 8 }

  function setSize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    bbox = canvas.getBoundingClientRect()
    width = Math.max(1, Math.floor(bbox.width * dpr))
    height = Math.max(1, Math.floor(bbox.height * dpr))
    canvas.width = width
    canvas.height = height
  }
  const getPlotRect = () => ({
    x: padding.left,
    y: padding.top,
    w: Math.max(1, width - padding.left - padding.right),
    h: Math.max(1, height - padding.top - padding.bottom),
  })
  const getXValue = (index: number) => {
    if (Array.isArray(state.xLabels) && state.xLabels[index] != null) {
      const val = Number(state.xLabels[index])
      if (Number.isFinite(val)) return val
    }
    return index
  }
  const getXRange = () => {
    if (Array.isArray(state.xLabels) && state.xLabels.length > 0) {
      const first = Number(state.xLabels[0])
      const last = Number(state.xLabels[state.xLabels.length - 1])
      if (Number.isFinite(first) && Number.isFinite(last)) {
        return { min: first, max: last || first + 1 }
      }
    }
    return { min: 0, max: state.data.length > 0 ? state.data.length - 1 : 1 }
  }
  function mapXValue(value: number, plot: any) {
    const { min, max } = getXRange()
    if (max === min) return plot.x
    const t = (value - min) / (max - min)
    const clamped = Math.max(0, Math.min(1, t))
    return plot.x + clamped * plot.w
  }
  function mapX(i: number, n: number, plot: any) {
    return mapXValue(getXValue(i), plot)
  }
  function unmapXValue(px: number, plot: any) {
    const { min, max } = getXRange()
    if (max === min) return min
    const normalized = (px - plot.x) / plot.w
    const clamped = Math.max(0, Math.min(1, normalized))
    return min + clamped * (max - min)
  }
  function mapY(v: number, plot: any) {
    const range = state.yMax - state.yMin
    if (Math.abs(range) < 1e-12) return plot.y + plot.h / 2
    const clamped = Math.max(Math.min(v, state.yMax), state.yMin)
    // 当 flipY=true 时，y 值越大应处于越靠下的位置
    return state.flipY
      ? plot.y + ((clamped - state.yMin) * plot.h) / range
      : plot.y + ((state.yMax - clamped) * plot.h) / range
  }
  function unmapY(py: number, plot: any) {
    const range = state.yMax - state.yMin || 1e-12
    const t = (py - plot.y) / plot.h
    // 映射回数据值时同样遵循 flipY
    return state.flipY ? state.yMin + t * range : state.yMax - t * range
  }
  function clearBackground() {
    const colors = getThemeColors()
    ctx.clearRect(0, 0, width, height) // 先清除画布
    ctx.fillStyle = colors.background
    ctx.fillRect(0, 0, width, height)
  }
  function drawSelectionRect(plot: any) {
    if (!boxSelect.active && !boxRect) return
    const rect = boxSelect.active
      ? {
        x: Math.min(boxSelect.start.x, boxSelect.end.x),
        y: Math.min(boxSelect.start.y, boxSelect.end.y),
        w: Math.abs(boxSelect.end.x - boxSelect.start.x),
        h: Math.abs(boxSelect.end.y - boxSelect.start.y),
      }
      : boxRect
    if (!rect) return
    const colors = getThemeColors()
    ctx.save()
    ctx.setLineDash([6 * dpr, 4 * dpr])
    ctx.lineWidth = 1 * dpr
    ctx.strokeStyle = state.theme === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)'
    ctx.fillStyle = state.theme === 'light' ? 'rgba(255,200,80,0.12)' : 'rgba(255,212,90,0.12)'
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
    ctx.restore()
  }
  function drawAxesAndGrid(plot: any) {
    const colors = getThemeColors()
    ctx.save()
    clearBackground()
    ctx.strokeStyle = colors.gridBorder
    ctx.lineWidth = 1 * dpr
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h)
    ctx.fillStyle = colors.textColor
    ctx.font = `${12 * dpr}px system-ui, sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    // 自适应 Y 轴刻度数量：高度越小刻度越少，避免拥挤
    const minYPx = 22 * dpr
    const ticks = Math.max(2, Math.min(12, Math.floor(plot.h / minYPx)))
    for (let t = 0; t <= ticks; t++) {
      const v = state.yMin + (t * (state.yMax - state.yMin)) / ticks
      const yy = mapY(v, plot)
      ctx.strokeStyle = t === 0 || t === ticks ? colors.gridLineStrong : colors.gridLine
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(plot.x, yy)
      ctx.lineTo(plot.x + plot.w, yy)
      ctx.stroke()
      ctx.fillStyle = colors.textColorSecondary
      ctx.fillText(formatNum(v), plot.x - 6 * dpr, yy)
    }
    const n = state.data.length
    if (n > 0) {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      // 自适应 X 轴标签与网格：宽度越宽越密集，越窄则自动稀疏
      const minXPx = 28 * dpr
      const maxLabels = Math.max(2, Math.floor(plot.w / minXPx))
      const step = Math.max(1, Math.ceil(n / maxLabels))
      for (let i = 0; i < n; i += step) {
        const xx = mapX(i, n, plot)
        ctx.strokeStyle = colors.gridLine
        ctx.lineWidth = 1 * dpr
        ctx.beginPath()
        ctx.moveTo(xx, plot.y)
        ctx.lineTo(xx, plot.y + plot.h)
        ctx.stroke()
        const label = state.xLabels[i] != null ? String(state.xLabels[i]) : String(i)
        ctx.fillStyle = colors.textColorSecondary
        ctx.save()
        ctx.translate(xx, plot.y - 6 * dpr)
        ctx.rotate(-Math.PI / 4)
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
      if ((n - 1) % step !== 0) {
        const xx = mapX(n - 1, n, plot)
        const label = state.xLabels[n - 1] != null ? String(state.xLabels[n - 1]) : String(n - 1)
        ctx.save()
        ctx.translate(xx, plot.y - 6 * dpr)
        ctx.rotate(-Math.PI / 4)
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }
    ctx.restore()
  }
  function drawLimitLines(plot: any) {
    if (!Array.isArray(state.limitLines) || state.limitLines.length === 0) return
    ctx.save()
    ctx.strokeStyle = limitLineColor
    ctx.lineWidth = 1.5 * dpr
    state.limitLines.forEach((val: number) => {
      if (!Number.isFinite(val)) return
      if (val < state.yMin || val > state.yMax) return
      const y = mapY(val, plot)
      ctx.beginPath()
      ctx.moveTo(plot.x, y)
      ctx.lineTo(plot.x + plot.w, y)
      ctx.stroke()
    })
    ctx.restore()
  }
  function drawSeries(plot: any) {
    const n = state.data.length
    if (!n) return
    const isValid = (v: number) => typeof v === 'number' && Number.isFinite(v)
    const inYRange = (v: number) => v >= state.yMin && v <= state.yMax
    const clampValue = (v: number) => {
      if (v < state.yMin) return state.yMin
      if (v > state.yMax) return state.yMax
      return v
    }
    const segmentIntersectsRange = (a: number, b: number) => {
      const minVal = Math.min(a, b)
      const maxVal = Math.max(a, b)
      return maxVal >= state.yMin && minVal <= state.yMax
    }

    ctx.save()
    ctx.lineWidth = Math.max(1, 1 * dpr)
    ctx.strokeStyle = state.color
    ctx.beginPath()

    let prevValue: number | null = null
    let prevX: number | null = null
    for (let i = 0; i < n; i++) {
      const value = state.data[i]
      if (!isValid(value)) {
        prevValue = null
        prevX = null
        continue
      }
      const x = mapX(i, n, plot)
      if (prevValue !== null && prevX !== null && segmentIntersectsRange(prevValue, value)) {
        const clampedPrev = clampValue(prevValue)
        const clampedCurr = clampValue(value)
        const yPrev = mapY(clampedPrev, plot)
        const yCurr = mapY(clampedCurr, plot)
        ctx.moveTo(prevX, yPrev)
        ctx.lineTo(x, yCurr)
      }
      prevValue = value
      prevX = x
    }
    ctx.stroke()

    const r = Math.max(1.5, 1.5 * dpr)
    const palette = getKeyframePalette()
    const selectedColor = state.theme === 'light' ? '#C08A00' : '#FFD45A'
    const currentIndex = markerIndex == null ? null : markerIndex

    type Point = { x: number; y: number; i: number }
    const normalPoints: Point[] = []
    const keyPoints: Point[] = []
    let currentPoint: Point | null = null

    for (let i = 0; i < n; i++) {
      const v = state.data[i]
      if (!isValid(v) || !inYRange(v)) continue
      const x = mapX(i, n, plot)
      const y = mapY(v, plot)
      const point: Point = { x, y, i }
      const isKeyframePoint = state.keyframes.has(i)
      const isCurrentFrame = currentIndex !== null && currentIndex === i
      if (isCurrentFrame) {
        currentPoint = point
      } else if (isKeyframePoint) {
        keyPoints.push(point)
      } else {
        normalPoints.push(point)
      }
    }

    const drawPoint = (p: Point, color: string, radius: number, withStroke = true) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      if (withStroke) {
        ctx.strokeStyle = color
        ctx.lineWidth = 1 * dpr
        ctx.stroke()
      }
    }

    // 只绘制关键帧/当前帧；默认曲线点不再绘制圆点以保持简洁
    // 绘制其他关键帧
    keyPoints.forEach(p => {
      const color = selectedKeyframes.has(p.i) ? selectedColor : palette.keyframe
      drawPoint(p, color, Math.max(2.2, 2.2 * dpr))
    })
    // 最后画当前帧，确保最上层
    if (currentPoint) {
      drawPoint(currentPoint, palette.current, Math.max(3, 3 * dpr))
    }

    // 绘制幽灵点（拖动关键帧时的预览点）
    if (state.ghostPoints && state.ghostPoints.length > 0) {
      const ghostColor = state.theme === 'light' ? 'rgba(192, 138, 0, 0.7)' : 'rgba(255, 212, 90, 0.7)'
      const ghostSelectedColor = state.theme === 'light' ? 'rgba(192, 138, 0, 1)' : 'rgba(255, 212, 90, 1)'
      // 连线颜色使用默认的曲线颜色（紫色），带透明度
      const ghostLineColor = (() => {
        const c = state.color
        // 处理 rgb(...) 格式
        if (c.startsWith('rgb(')) {
          return c.replace('rgb(', 'rgba(').replace(')', ', 0.7)')
        }
        // 处理 rgba(...) 格式
        if (c.startsWith('rgba(')) {
          return c.replace(/,\s*[\d.]+\)$/, ', 0.7)')
        }
        // 处理 #RRGGBB 或 #RGB 格式
        if (c.startsWith('#')) {
          let hex = c.slice(1)
          if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
          }
          const r = parseInt(hex.slice(0, 2), 16)
          const g = parseInt(hex.slice(2, 4), 16)
          const b = parseInt(hex.slice(4, 6), 16)
          return `rgba(${r}, ${g}, ${b}, 0.7)`
        }
        // 默认返回带透明度的紫色
        return 'rgba(138, 162, 255, 0.7)'
      })()

      // 先计算所有幽灵点的屏幕坐标
      const ghostScreenPoints: Array<{ x: number; y: number; dataIndex: number; ghost: any }> = []

      state.ghostPoints.forEach((ghost: { xLabel: number; yValue: number; isSelected?: boolean }) => {
        // xLabel 是从1开始的标签，需要转换为数据索引
        const labels = state.xLabels
        let dataIndex = -1
        if (Array.isArray(labels) && labels.length > 0) {
          dataIndex = labels.findIndex((l: number) => l === ghost.xLabel)
        } else {
          dataIndex = Math.round(ghost.xLabel - 1)
        }

        if (dataIndex < 0 || dataIndex >= n) return
        if (!isValid(ghost.yValue) || !inYRange(ghost.yValue)) return

        const x = mapX(dataIndex, n, plot)
        const y = mapY(ghost.yValue, plot)

        ghostScreenPoints.push({ x, y, dataIndex, ghost })
      })

      // 按 dataIndex 排序，确保连线顺序正确
      ghostScreenPoints.sort((a, b) => a.dataIndex - b.dataIndex)

      // 绘制连线（使用默认曲线颜色）
      if (ghostScreenPoints.length > 1) {
        ctx.save()
        ctx.strokeStyle = ghostLineColor
        ctx.lineWidth = 2 * dpr
        ctx.setLineDash([4 * dpr, 4 * dpr]) // 虚线效果
        ctx.beginPath()
        ctx.moveTo(ghostScreenPoints[0].x, ghostScreenPoints[0].y)
        for (let i = 1; i < ghostScreenPoints.length; i++) {
          ctx.lineTo(ghostScreenPoints[i].x, ghostScreenPoints[i].y)
        }
        ctx.stroke()
        ctx.setLineDash([]) // 恢复实线
        ctx.restore()
      }

      // 绘制幽灵点
      ghostScreenPoints.forEach(({ x, y, ghost }) => {
        const color = ghost.isSelected ? ghostSelectedColor : ghostColor
        const radius = Math.max(3, 3 * dpr)

        // 绘制幽灵点（带透明度的圆圈）
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5 * dpr
        ctx.stroke()
      })
    }

    ctx.restore()
  }
  function drawMarker(plot: any) {
    markerRect = null
    if (markerIndex == null) return
    const n = state.data.length
    if (markerIndex < 0 || markerIndex >= n) return
    const colors = getThemeColors()
    const xx = mapX(markerIndex, n, plot)
    ctx.save()
    // 竖线
    ctx.strokeStyle = colors.markerLine
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    ctx.moveTo(xx, plot.y)
    ctx.lineTo(xx, plot.y + plot.h)
    ctx.stroke()
    // 顶部滑块（圆角，高度为标尺区域的2/3，底部贴合竖线）
    const sliderH = (plot.y * 2) / 3
    const sliderW = 34 * dpr
    const sliderX = xx - sliderW / 2
    const sliderY = plot.y - sliderH
    markerRect = { x: sliderX, y: sliderY, w: sliderW, h: sliderH }
    ctx.fillStyle = colors.markerLine
    ctx.strokeStyle = colors.markerLine
    const radius = Math.min(sliderH * 0.4, sliderW * 0.25)
    ctx.beginPath()
    ctx.moveTo(sliderX + radius, sliderY)
    ctx.lineTo(sliderX + sliderW - radius, sliderY)
    ctx.quadraticCurveTo(sliderX + sliderW, sliderY, sliderX + sliderW, sliderY + radius)
    ctx.lineTo(sliderX + sliderW, sliderY + sliderH - radius)
    ctx.quadraticCurveTo(sliderX + sliderW, sliderY + sliderH, sliderX + sliderW - radius, sliderY + sliderH)
    ctx.lineTo(sliderX + radius, sliderY + sliderH)
    ctx.quadraticCurveTo(sliderX, sliderY + sliderH, sliderX, sliderY + sliderH - radius)
    ctx.lineTo(sliderX, sliderY + radius)
    ctx.quadraticCurveTo(sliderX, sliderY, sliderX + radius, sliderY)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `${12 * dpr}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label =
      markerIndex < state.xLabels.length && state.xLabels[markerIndex] != null
        ? String(state.xLabels[markerIndex])
        : String(markerIndex)
    // 将文本向下偏移，增大与顶部的内边距
    ctx.fillText(label, sliderX + sliderW / 2, sliderY + sliderH / 2 + 1.3 * dpr)
    ctx.restore()
  }
  function drawClearSelectionButton(plot: any) {
    clearSelectionBtn = null
    if (!selectedKeyframes.size) return
    const paddingX = 8 * dpr
    const paddingY = 4 * dpr
    const text = '取消选择'
    ctx.save()
    ctx.font = `${12 * dpr}px system-ui, sans-serif`
    const textWidth = ctx.measureText(text).width
    const w = textWidth + paddingX * 2
    const h = 22 * dpr
    const x = plot.x
    const y = Math.max(4 * dpr, plot.y - h - 6 * dpr)
    clearSelectionBtn = { x, y, w, h }
    const colors = getThemeColors()
    ctx.fillStyle = state.theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
    ctx.strokeStyle = state.theme === 'light' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    const r = 6 * dpr
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = colors.textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + w / 2, y + h / 2)
    ctx.restore()
  }
  function drawHandles(plot: any) {
    handleHitRegions = {}
    if (state.selectedKeyframe == null) return
    const index = state.selectedKeyframe
    const value = state.data[index]
    if (value == null || Number.isNaN(value)) return
    const handle = state.handleData.get(index)
    if (!handle) return

    // 检查关键帧点是否在Y轴可见范围内
    if (value < state.yMin || value > state.yMax) return

    // 检查关键帧点是否在X轴可见范围内
    const xValue = getXValue(index)
    if (Array.isArray(state.xLabels) && state.xLabels.length > 0) {
      const visibleXMin = Number(state.xLabels[0])
      const visibleXMax = Number(state.xLabels[state.xLabels.length - 1])
      if (Number.isFinite(visibleXMin) && Number.isFinite(visibleXMax)) {
        if (xValue < visibleXMin || xValue > visibleXMax) return
      }
    }

    const baseX = mapXValue(xValue, plot)
    const baseY = mapY(value, plot)
    const inPos = {
      x: mapXValue(handle.in.x, plot),
      y: mapY(handle.in.y, plot),
    }
    const outPos = {
      x: mapXValue(handle.out.x, plot),
      y: mapY(handle.out.y, plot),
    }
    const handleColor = state.theme === 'light' ? '#000000' : '#FFFFFF'
    ctx.save()
    ctx.strokeStyle = handleColor
    ctx.fillStyle = handleColor
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    ctx.moveTo(baseX, baseY)
    ctx.lineTo(inPos.x, inPos.y)
    ctx.moveTo(baseX, baseY)
    ctx.lineTo(outPos.x, outPos.y)
    ctx.stroke()
    const size = Math.max(6, 6 * dpr)
    ctx.fillRect(inPos.x - size / 2, inPos.y - size / 2, size, size)
    ctx.fillRect(outPos.x - size / 2, outPos.y - size / 2, size, size)
    ctx.restore()
    handleHitRegions = {
      in: { x: inPos.x, y: inPos.y, index },
      out: { x: outPos.x, y: outPos.y, index },
    }
  }
  function detectHandleHit(cursor: { x: number; y: number }) {
    const radius = 10 * dpr
    const hit = (region?: { x: number; y: number; index: number }): HandleDragState | null => {
      if (!region) return null
      const dx = cursor.x - region.x
      const dy = cursor.y - region.y
      if (dx * dx + dy * dy <= radius * radius) {
        return { index: region.index, kind: region === handleHitRegions.in ? 'in' : 'out' }
      }
      return null
    }
    return hit(handleHitRegions.in) || hit(handleHitRegions.out)
  }
  function buildHandlePayload(
    dragState: HandleDragState,
    cursor: { x: number; y: number },
    plot: any,
    nativeEvent: MouseEvent
  ) {
    const keyframeLabel = Number(state.xLabels?.[dragState.index] ?? dragState.index)
    const keyframeValue = state.data[dragState.index]
    const maxXForHandle =
      dragState.kind === 'in' ? keyframeLabel - 0.001 : keyframeLabel + 0.001
    let xValue = unmapXValue(cursor.x, plot)
    if (dragState.kind === 'in') {
      xValue = Math.min(xValue, maxXForHandle)
    } else {
      xValue = Math.max(xValue, maxXForHandle)
    }
    const yValue = unmapY(cursor.y, plot)
    return {
      index: dragState.index,
      handle: dragState.kind,
      xValue,
      yValue,
      keyframeLabel,
      keyframeValue,
      nativeEvent,
    }
  }
  function nearestIndex(mx: number, my: number, plot: any) {
    const n = state.data.length
    if (!n) return -1
    const inRange = (v: number) => v >= state.yMin && v <= state.yMax
    let best = -1,
      bestDist = Infinity
    for (let i = 0; i < n; i++) {
      const v = state.data[i]
      if (!inRange(v)) continue
      const x = mapX(i, n, plot)
      const y = mapY(v, plot)
      const dx = mx - x,
        dy = my - y
      const dist2 = dx * dx + dy * dy
      if (dist2 < bestDist) {
        bestDist = dist2
        best = i
      }
    }
    const thr2 = (7 * dpr) ** 2
    return bestDist <= thr2 ? best : -1
  }
  function nearestColumnIndex(mx: number, plot: any) {
    const n = state.data.length
    if (!n) return -1
    let best = 0,
      bestDx = Infinity
    for (let i = 0; i < n; i++) {
      const x = mapX(i, n, plot)
      const dx = Math.abs(mx - x)
      if (dx < bestDx) {
        bestDx = dx
        best = i
      }
    }
    return best
  }
  function clampToPlot(p: { x: number; y: number }, plot: any) {
    return {
      x: Math.max(plot.x, Math.min(plot.x + plot.w, p.x)),
      y: Math.max(plot.y, Math.min(plot.y + plot.h, p.y)),
    }
  }
  function applyBoxSelection(
    rect: { x: number; y: number; w: number; h: number },
    plot: any,
    isCtrl: boolean = false
  ) {
    const n = state.data.length
    if (!n) return
    const inRect = (x: number, y: number) =>
      x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
    const boxedIndices: number[] = []
    state.keyframes.forEach((idx: number) => {
      if (idx < 0 || idx >= n) return
      const v = state.data[idx]
      if (v == null || Number.isNaN(v)) return
      if (v < state.yMin || v > state.yMax) return
      const px = mapX(idx, n, plot)
      const py = mapY(v, plot)
      if (inRect(px, py)) {
        boxedIndices.push(idx)
      }
    })
    if (isCtrl) {
      boxedIndices.forEach(idx => {
        if (selectedKeyframes.has(idx)) {
          selectedKeyframes.delete(idx)
        } else {
          selectedKeyframes.add(idx)
        }
      })
    } else {
      selectedKeyframes.clear()
      boxedIndices.forEach(idx => selectedKeyframes.add(idx))
    }
    selectionChangeCb(selectedKeyframes.size)
  }
  function clearSelection() {
    selectedKeyframes.clear()
    boxRect = null
    clearSelectionBtn = null
    selectionChangeCb(0)
  }
  function clearAndRender(cursor?: { x: number; y: number }) {
    const plot = getPlotRect()
    drawAxesAndGrid(plot)
    drawLimitLines(plot)
    drawSelectionRect(plot)
    // 先画控制柄，后画点，确保当前帧圆点在最上层
    drawHandles(plot)
    drawSeries(plot)
    drawMarker(plot)
    // drawClearSelectionButton(plot)
    const hit = cursor ? nearestIndex(cursor.x, cursor.y, plot) : -1
    feedbackHover(hit, plot, cursor)
  }
  function feedbackHover(hitIndex: number, plot: any, cursor?: { x: number; y: number }) {
    const colors = getThemeColors()
    ctx.save()
    if (hitIndex >= 0) {
      const n = state.data.length
      const x = mapX(hitIndex, n, plot)
      const y = mapY(state.data[hitIndex], plot)
      ctx.strokeStyle = colors.hoverLine
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(x, plot.y)
      ctx.lineTo(x, plot.y + plot.h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(plot.x, y)
      ctx.lineTo(plot.x + plot.w, y)
      ctx.stroke()
      ctx.fillStyle = colors.hoverDot
      ctx.beginPath()
      ctx.arc(x, y, Math.max(3, 3 * dpr), 0, Math.PI * 2)
      ctx.fill()
    } else if (cursor) {
      const x = Math.max(plot.x, Math.min(plot.x + plot.w, cursor.x))
      const y = Math.max(plot.y, Math.min(plot.y + plot.h, cursor.y))
      ctx.strokeStyle = colors.hoverLine
      ctx.lineWidth = 1 * dpr
      ctx.beginPath()
      ctx.moveTo(x, plot.y)
      ctx.lineTo(x, plot.y + plot.h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(plot.x, y)
      ctx.lineTo(plot.x + plot.w, y)
      ctx.stroke()
    }
    ctx.restore()
  }
  function canvasToLocal(evt: MouseEvent) {
    const rect = canvas.getBoundingClientRect()
    const x = (evt.clientX - rect.left) * dpr
    const y = (evt.clientY - rect.top) * dpr
    return { x, y }
  }
  function emitPayload(base: any, plot: any) {
    const col = base.index >= 0 ? base.index : nearestColumnIndex(base.x, plot)
    const xLabel =
      col >= 0 && state.xLabels[col] != null ? state.xLabels[col] : col >= 0 ? col : null
    const yValue = col >= 0 ? state.data[col] : null
    const isKeyframePoint = col != null && state.keyframes.has(col)
    return { ...base, index: col, xLabel, yValue, isKeyframe: isKeyframePoint }
  }
  let lastXLabel: number | null = null
  let lastYAtCursor: number | null = null

  function onMove(evt: MouseEvent) {
    const p = canvasToLocal(evt)
    const plot = getPlotRect()
    if (boxSelect.active) {
      const clamped = clampToPlot(p, plot)
      boxSelect.end = clamped
      boxRect = {
        x: Math.min(boxSelect.start.x, boxSelect.end.x),
        y: Math.min(boxSelect.start.y, boxSelect.end.y),
        w: Math.abs(boxSelect.end.x - boxSelect.start.x),
        h: Math.abs(boxSelect.end.y - boxSelect.start.y),
      }
      clearAndRender(undefined)
      return
    }
    if (middleDragActive) {
      evt.preventDefault()
      const payload = emitPayload(
        {
          index: -1,
          x: p.x,
          y: p.y,
          yAtCursor: unmapY(p.y, plot),
          deltaX: evt.movementX,
          deltaY: evt.movementY,
        },
        plot
      )
      handlers.onMiddleDrag({ ...payload, nativeEvent: evt })
      return
    }
    if (draggingHandle) {
      evt.preventDefault()
      const payload = buildHandlePayload(draggingHandle, p, plot, evt)
      handlers.onHandleDrag(payload)
      return
    }
    if (markerDragActive) {
      evt.preventDefault()
      moveMarkerToX(p.x, plot, evt)
      return
    }
    const hit = nearestIndex(p.x, p.y, plot)
    clearAndRender(p)

    const currentPayload = emitPayload(
      { index: hit, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) },
      plot
    )
    const currentXLabel = currentPayload.xLabel as number | null
    const currentYAtCursor = currentPayload.yAtCursor as number | null

    if (lastXLabel !== null && lastYAtCursor !== null && currentXLabel !== null) {
      const labelDiff = Math.abs(currentXLabel - lastXLabel)
      if (labelDiff > 1) {
        const startLabel = Math.min(lastXLabel, currentXLabel)
        const endLabel = Math.max(lastXLabel, currentXLabel)
        const startY = lastXLabel < currentXLabel ? lastYAtCursor : currentYAtCursor
        const endY = lastXLabel < currentXLabel ? currentYAtCursor : lastYAtCursor
        for (let i = startLabel + 1; i < endLabel; i++) {
          const progress = (i - startLabel) / (endLabel - startLabel)
          const interpolatedY =
            (startY as number) + ((endY as number) - (startY as number)) * progress
          const interpolatedPayload = {
            ...currentPayload,
            xLabel: i,
            yAtCursor: interpolatedY,
            index: i - 1,
            yValue: state.data[i - 1] || null,
          }
          handlers.onHover(interpolatedPayload)
        }
      }
    }
    handlers.onHover(currentPayload)
    lastXLabel = currentXLabel
    lastYAtCursor = currentYAtCursor
  }
  function moveMarkerToX(mx: number, plot: any, evt: MouseEvent) {
    const col = nearestColumnIndex(mx, plot)
    if (col < 0) return
    markerIndex = col
    const payload = emitPayload({ index: col, x: mx, y: plot.y, yAtCursor: unmapY(plot.y, plot) }, plot)
    handlers.onClick({ ...payload, nativeEvent: evt })
    clearAndRender({ x: mx, y: plot.y })
  }
  function isInsidePlot(p: { x: number; y: number }, plot: any) {
    return p.x >= plot.x && p.x <= plot.x + plot.w && p.y >= plot.y && p.y <= plot.y + plot.h
  }
  function onClickEvt(evt: MouseEvent) {
    if (evt.button !== 0) return
    const p = canvasToLocal(evt)
    const plot = getPlotRect()
    // 点击“取消选择”按钮
    if (clearSelectionBtn) {
      const { x, y, w, h } = clearSelectionBtn
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) {
        clearSelection()
        clearAndRender(undefined)
        return
      }
    }
    const isInRuler = p.x >= plot.x && p.x <= plot.x + plot.w && p.y < plot.y
    // 仅允许在顶部标尺或点击滑块区域时切换当前帧，避免图表区域点击误切换
    if (isInRuler) {
      moveMarkerToX(p.x, plot, evt)
      return
    }
    if (markerRect) {
      const pad = 4 * dpr
      const hitSlider =
        p.x >= markerRect.x - pad &&
        p.x <= markerRect.x + markerRect.w + pad &&
        p.y >= markerRect.y - pad &&
        p.y <= markerRect.y + markerRect.h + pad
      if (hitSlider) {
        moveMarkerToX(p.x, plot, evt)
      }
    }
    if (isInsidePlot(p, plot)) {
      const hitIndex = nearestIndex(p.x, p.y, plot)
      if (hitIndex >= 0) {
        const payload = emitPayload(
          { index: hitIndex, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) },
          plot
        )
        handlers.onPointClick({ ...payload, nativeEvent: evt })
        return
      }
      // 点击空白处：通知外部隐藏控制柄等
      const payload = emitPayload(
        { index: -1, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) },
        plot
      )
      handlers.onBlankClick({ ...payload, nativeEvent: evt })
      return
    }
  }
  function onMouseDown(evt: MouseEvent) {
    const p = canvasToLocal(evt)
    const plot = getPlotRect()
    const handleHit = detectHandleHit(p)
    if (markerRect && evt.button === 0) {
      const pad = 4 * dpr
      if (
        p.x >= markerRect.x - pad &&
        p.x <= markerRect.x + markerRect.w + pad &&
        p.y >= markerRect.y - pad &&
        p.y <= markerRect.y + markerRect.h + pad
      ) {
        markerDragActive = true
        moveMarkerToX(p.x, plot, evt)
        return
      }
    }
    // 检测是否点击横轴标尺区域（在 x 范围内，但不在 plot 内部）
    if (evt.button === 0 && p.x >= plot.x && p.x <= plot.x + plot.w && p.y < plot.y) {
      markerDragActive = true
      moveMarkerToX(p.x, plot, evt)
      return
    }
    if (handleHit && evt.button === 0) {
      draggingHandle = handleHit
      const payload = buildHandlePayload(handleHit, p, plot, evt)
      handlers.onHandleDragStart(payload)
      return
    }

    // 计算点击位置的信息
    const hit = nearestIndex(p.x, p.y, plot)
    const payload = emitPayload({ index: hit, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) }, plot)

    // 左键按下：优先尝试onLeftDown处理（用于拖拽已选中的关键帧等）
    if (evt.button === 0 && isInsidePlot(p, plot)) {
      // 检查是否点击了关键帧（无论是否已选中）
      const isKeyframe = payload.isKeyframe && hit >= 0

      // 如果点击了关键帧，调用onLeftDown并阻止框选
      if (isKeyframe) {
        handlers.onLeftDown({ ...payload, nativeEvent: evt })
        return
      }

      // 否则，启动框选
      const clamped = clampToPlot(p, plot)
      boxSelect.active = true
      boxSelect.start = clamped
      boxSelect.end = clamped
      boxRect = null
      return
    }

    if (evt.button === 1) {
      evt.preventDefault()
      middleDragActive = true
      const payload = emitPayload({ index: -1, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) }, plot)
      handlers.onMiddleDown({ ...payload, nativeEvent: evt })
      return
    }

    if (evt.button === 2) {
      handlers.onRightDown({ ...payload, nativeEvent: evt })
    }
  }
  function onMouseUpEvt(evt: MouseEvent) {
    const p = canvasToLocal(evt)
    const plot = getPlotRect()
    if (boxSelect.active) {
      const clamped = clampToPlot(p, plot)
      boxSelect.end = clamped
      const rect = {
        x: Math.min(boxSelect.start.x, boxSelect.end.x),
        y: Math.min(boxSelect.start.y, boxSelect.end.y),
        w: Math.abs(boxSelect.end.x - boxSelect.start.x),
        h: Math.abs(boxSelect.end.y - boxSelect.start.y),
      }
      boxSelect.active = false
      boxRect = null
      const isCtrl = evt.ctrlKey || evt.metaKey
      applyBoxSelection(rect, plot, isCtrl)
      clearAndRender(undefined)
      return
    }
    if (markerDragActive) {
      moveMarkerToX(p.x, plot, evt)
      markerDragActive = false
      return
    }
    if (middleDragActive) {
      evt.preventDefault()
      const payload = emitPayload({ index: -1, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) }, plot)
      handlers.onMiddleUp({ ...payload, nativeEvent: evt })
      middleDragActive = false
      return
    }
    if (draggingHandle) {
      const payload = buildHandlePayload(draggingHandle, p, plot, evt)
      handlers.onHandleDragEnd(payload)
      draggingHandle = null
      return
    }
    const hit = nearestIndex(p.x, p.y, plot)
    const payload = emitPayload({ index: hit, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) }, plot)
    handlers.onMouseUp({ ...payload, nativeEvent: evt })
  }
  function onMouseLeaveEvt(evt: MouseEvent) {
    const p = canvasToLocal(evt)
    const plot = getPlotRect()
    if (boxSelect.active) {
      boxSelect.active = false
      boxRect = null
      clearAndRender(undefined)
    }
    markerDragActive = false
    if (draggingHandle) {
      const payload = buildHandlePayload(draggingHandle, p, plot, evt)
      handlers.onHandleDragEnd(payload)
      draggingHandle = null
    }
    if (middleDragActive) {
      const payload = emitPayload({ index: -1, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) }, plot)
      handlers.onMiddleUp({ ...payload, nativeEvent: evt })
      middleDragActive = false
    }
    const hit = nearestIndex(p.x, p.y, plot)
    const payload = emitPayload({ index: hit, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot) }, plot)
    handlers.onMouseLeave({ ...payload, nativeEvent: evt })
    lastXLabel = null
    lastYAtCursor = null
  }

  // 重点：新增滚轮区分（Ctrl+Shift / Ctrl / Shift / Plain）
  function onWheelEvt(evt: WheelEvent) {
    const p = canvasToLocal(evt as any)
    const plot = getPlotRect()
    const hit = nearestIndex(p.x, p.y, plot)
    const base = { index: hit, x: p.x, y: p.y, yAtCursor: unmapY(p.y, plot), delta: evt.deltaY }
    const payload = emitPayload(base, plot)
    if (evt.ctrlKey && evt.shiftKey) {
      evt.preventDefault()
      handlers.onCtrlShiftWheel({ ...payload, nativeEvent: evt })
    } else if (evt.ctrlKey) {
      evt.preventDefault()
      handlers.onCtrlWheel({ ...payload, nativeEvent: evt })
    } else if (evt.shiftKey) {
      evt.preventDefault()
      handlers.onShiftWheel({ ...payload, nativeEvent: evt })
    } else {
      handlers.onWheel({ ...payload, nativeEvent: evt })
    }
  }

  const onContextMenu = (e: Event) => e.preventDefault()
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousemove', onMove)
  canvas.addEventListener('click', onClickEvt)
  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mouseup', onMouseUpEvt)
  canvas.addEventListener('mouseleave', onMouseLeaveEvt)
  canvas.addEventListener('wheel', onWheelEvt, { passive: false })

  const ro = new ResizeObserver(() => {
    setSize()
    clearAndRender(undefined)
  })
  ro.observe(canvas.parentElement || canvas)

  setSize()
  clearAndRender(undefined)

  function normalizeYAxis() {
    if (!Number.isFinite(state.yMin)) state.yMin = 0
    if (!Number.isFinite(state.yMax)) state.yMax = 1
    if (state.yMin === state.yMax) {
      const eps = Math.abs(state.yMin) > 1 ? 1e-6 * Math.abs(state.yMin) : 1e-3
      state.yMin -= eps
      state.yMax += eps
    }
    if (state.yMin > state.yMax) {
      const t = state.yMin
      state.yMin = state.yMax
      state.yMax = t
    }
  }
  function formatNum(v: number) {
    // 显示2位小数，用于Y轴标签
    if (Math.abs(v) >= 1000 || Math.abs(v) < 0.000001) return v.toExponential(2)
    return String(+v.toFixed(2))
  }

  function setKeyframes(indices: number[] = []) {
    const normalized = Array.isArray(indices)
      ? indices.map(i => Math.max(0, Math.floor(i)))
      : []
    state.keyframes = new Set(normalized)
    clearAndRender(undefined)
  }

  function setKeyframeColor(color: string) {
    if (typeof color !== 'string' || !color.trim()) return
    state.keyframeColor = color
    clearAndRender(undefined)
  }

  function setHandlesMap(
    map: Record<
      number,
      {
        in: { x: number; y: number }
        out: { x: number; y: number }
      }
    > = {}
  ) {
    state.handleData = new Map(
      Object.entries(map).map(([idx, val]) => [
        Number(idx),
        {
          in: { x: Number(val.in.x), y: Number(val.in.y) },
          out: { x: Number(val.out.x), y: Number(val.out.y) },
        },
      ])
    )
    clearAndRender(undefined)
  }

  function setSelectedKeyframeIndex(index: number | null) {
    state.selectedKeyframe =
      typeof index === 'number' && Number.isFinite(index) ? index : null
    clearAndRender(undefined)
  }

  return {
    updateData(opts: any = {}) {
      if ('data' in opts && Array.isArray(opts.data)) state.data = opts.data.slice()
      const yMinIn = 'yMin' in opts ? opts.yMin : 'ymin' in opts ? opts.ymin : undefined
      const yMaxIn = 'yMax' in opts ? opts.yMax : 'ymax' in opts ? opts.ymax : undefined
      if (yMinIn !== undefined) state.yMin = Number(yMinIn)
      if (yMaxIn !== undefined) state.yMax = Number(yMaxIn)
      if ('limitLines' in opts) state.limitLines = normalizeLimitLines((opts as any).limitLines)
      if ('color' in opts && typeof opts.color === 'string') state.color = opts.color
      if ('xLabels' in opts && Array.isArray(opts.xLabels)) state.xLabels = opts.xLabels.slice()
      normalizeYAxis()
      clearAndRender(undefined)
    },
    applyOptions(opts: any = {}) {
      if (!opts || typeof opts !== 'object') {
        clearAndRender(undefined)
        return
      }
      if ('data' in opts && Array.isArray(opts.data)) state.data = opts.data.slice()
      const yMinIn = 'yMin' in opts ? opts.yMin : 'ymin' in opts ? opts.ymin : undefined
      const yMaxIn = 'yMax' in opts ? opts.yMax : 'ymax' in opts ? opts.ymax : undefined
      if (yMinIn !== undefined) state.yMin = Number(yMinIn)
      if (yMaxIn !== undefined) state.yMax = Number(yMaxIn)
      if ('color' in opts && typeof opts.color === 'string') state.color = String(opts.color)
      if ('xLabels' in opts && Array.isArray(opts.xLabels)) state.xLabels = opts.xLabels.slice()
      if ('limitLines' in opts) state.limitLines = normalizeLimitLines((opts as any).limitLines)
      // 支持通过选项设置Y轴翻转
      if ('flipY' in opts) state.flipY = !!(opts as any).flipY
      // 支持通过选项设置主题
      if ('theme' in opts && (opts.theme === 'dark' || opts.theme === 'light')) {
        state.theme = opts.theme
      }
      if (typeof opts.onClick === 'function') handlers.onClick = opts.onClick
      if (typeof opts.onBlankClick === 'function') handlers.onBlankClick = opts.onBlankClick
      if (typeof opts.onPointClick === 'function') handlers.onPointClick = opts.onPointClick
      if (typeof opts.onHover === 'function') handlers.onHover = opts.onHover
      if (typeof opts.onLeftDown === 'function') handlers.onLeftDown = opts.onLeftDown
      if (typeof opts.onRightDown === 'function') handlers.onRightDown = opts.onRightDown
      if (typeof opts.onMouseUp === 'function') handlers.onMouseUp = opts.onMouseUp
      if (typeof opts.onCtrlWheel === 'function') handlers.onCtrlWheel = opts.onCtrlWheel
      if (typeof opts.onWheel === 'function') handlers.onWheel = opts.onWheel
      // 新增热更新
      if (typeof opts.onCtrlShiftWheel === 'function')
        handlers.onCtrlShiftWheel = opts.onCtrlShiftWheel
      if (typeof opts.onShiftWheel === 'function') handlers.onShiftWheel = opts.onShiftWheel
      if (typeof opts.onMiddleDown === 'function') handlers.onMiddleDown = opts.onMiddleDown
      if (typeof opts.onMiddleDrag === 'function') handlers.onMiddleDrag = opts.onMiddleDrag
      if (typeof opts.onMiddleUp === 'function') handlers.onMiddleUp = opts.onMiddleUp
      if (typeof (opts as any).onSelectionChange === 'function') {
        selectionChangeCb = (opts as any).onSelectionChange
      }
      normalizeYAxis()
      clearAndRender(undefined)
    },
    // 新增：控制是否翻转Y轴（仅影响显示/交互映射，不改动数据）
    setYFlip(flip: boolean) {
      state.flipY = !!flip
      clearAndRender(undefined)
    },
    setLimitLines(lines: number[] | any) {
      state.limitLines = normalizeLimitLines(lines)
      clearAndRender(undefined)
    },
    // 新增：切换主题
    setTheme(theme: 'dark' | 'light') {
      if (theme === 'dark' || theme === 'light') {
        state.theme = theme
        if (!hasCustomCurrentFrameColor) {
          state.currentFrameColor = theme === 'light' ? '#00E676' : '#FFFFFF'
        }
        clearAndRender(undefined)
      }
    },
    redraw() {
      clearAndRender(undefined)
    },
    clearKeyframeSelection() {
      clearSelection()
      clearAndRender(undefined)
    },
    getSelectedKeyframes(): number[] {
      return Array.from(selectedKeyframes).sort((a, b) => a - b)
    },
    setSelectionChangeListener(cb: (count: number) => void) {
      selectionChangeCb = typeof cb === 'function' ? cb : () => { }
    },
    setMarker(value: number) {
      if (value == null) {
        markerIndex = null
        clearAndRender(undefined)
        return
      }
      const n = state.data.length
      const numericVal = Number(value)
      if (!Number.isFinite(numericVal)) {
        markerIndex = null
        clearAndRender(undefined)
        return
      }
      if (Array.isArray(state.xLabels) && state.xLabels.length > 0) {
        const labels = state.xLabels
        // 检查是否在可见范围内
        const minLabel = Number(labels[0])
        const maxLabel = Number(labels[labels.length - 1])
        if (!Number.isFinite(minLabel) || !Number.isFinite(maxLabel)) {
          markerIndex = null
          clearAndRender(undefined)
          return
        }
        if (numericVal < minLabel || numericVal > maxLabel) {
          markerIndex = null
          clearAndRender(undefined)
          return
        }
        // 精确匹配标签
        const exact = labels.findIndex((label: any) => String(label) === String(value))
        markerIndex = exact >= 0 && exact < n ? exact : null
      } else {
        const i = Math.floor(numericVal)
        markerIndex = i >= 0 && i < n ? i : null
      }
      clearAndRender(undefined)
    },
    setYAxis(min: number, max: number) {
      state.yMin = Number(min)
      state.yMax = Number(max)
      normalizeYAxis()
      clearAndRender(undefined)
    },
    setSelectionRange(range: { start: number; end: number } | null) {
      selectionRange = range
        ? { start: Math.floor(range.start), end: Math.floor(range.end) }
        : null
      clearAndRender(undefined)
    },
    setKeyframes,
    setKeyframeColor,
    setHandles: setHandlesMap,
    setSelectedKeyframe: setSelectedKeyframeIndex,
    setSelectedKeyframes(indices: number[]) {
      selectedKeyframes.clear()
      indices.forEach(i => selectedKeyframes.add(i))
      clearAndRender(undefined)
    },
    /**
     * 设置幽灵点（拖动关键帧时的预览点）
     * 
     * 用于高性能的关键帧拖动预览：
     * - 拖动时只更新幽灵点位置，不需要更新整个图表数据
     * - 松手后清除幽灵点，执行实际的数据移动
     * 
     * @param points 幽灵点数组，格式: [{ xLabel: number, yValue: number, isSelected?: boolean }]
     *               xLabel 是从1开始的帧标签
     *               yValue 是数值
     *               isSelected 是否为选中状态（影响颜色）
     */
    setGhostPoints(points: Array<{ xLabel: number; yValue: number; isSelected?: boolean }> | null) {
      state.ghostPoints = Array.isArray(points) ? points : []
      clearAndRender(undefined)
    },
    /**
     * 清除幽灵点
     */
    clearGhostPoints() {
      state.ghostPoints = []
      clearAndRender(undefined)
    },
    destroy() {
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClickEvt)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mouseup', onMouseUpEvt)
      canvas.removeEventListener('mouseleave', onMouseLeaveEvt)
      canvas.removeEventListener('wheel', onWheelEvt)
      ro.disconnect()
      if (!(target instanceof HTMLCanvasElement) && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
    },
  }
}


export function smoothData(data: number[], threshold: number) {
  const n = data.length
  if (n === 0) return []
  const result = data.slice()
  const segments: Array<[number, number]> = []
  let segStart = 0
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(data[i + 1] - data[i]) > threshold) {
      segments.push([segStart, i])
      segStart = i + 1
    }
  }
  segments.push([segStart, n - 1])
  for (const [start, end] of segments) {
    if (end - start < 2) continue
    for (let pass = 0; pass < 3; pass++) {
      const tempSegment = result.slice(start, end + 1)
      for (let i = start + 1; i < end; i++) {
        tempSegment[i - start] = (result[i - 1] + result[i] + result[i + 1]) / 3
      }
      for (let j = start + 1; j < end; j++) {
        result[j] = tempSegment[j - start]
      }
    }
  }
  return result
}