import { ref, type Ref } from 'vue'
import * as THREE from 'three'
import type { FrameLike } from '../tools/motionEditorTools'
import type { IPathPanel } from '../pathPanel/data'

export interface IQuatSphere {
    settingMenu: {
        show: boolean
    }
    init: () => void
    onScroll: (e: THREE.Quaternion | { x: number; y: number; z: number; w: number }) => void
    updateRobotQuat: () => void
    spread: {
        enable: boolean
        moving: boolean
        startArr: number[][]
        startFrameIndex: number
        startQuat: { x: number; y: number; z: number; w: number } | null
        value: number
        applyTimer: NodeJS.Timeout | null
        handleStart: () => void
        handleMove: (quat: any) => void
        apply: (forceUpdate?: boolean) => void
        handleEnd: () => void
        getAfterCanMoveFrameNum: () => number
        update: () => void
    }
    api: any
    dispose: any
    constraint: {
        selected: undefined | 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ'
        change: (to: undefined | 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ') => void
    }
    lockedCameraQuater: boolean
    pathReorientation: {
        enable: boolean
        startQuater: any
        startArr: any[]
        startFrameIndex: number
        handleStart: () => void
        handleMove: () => void
        handleEnd: () => void
    }
}

interface QuatSphereAPI {
    setEuler: (euler: { x: number; y: number; z: number }) => void
    setQuaternion: (q: { x: number; y: number; z: number; w: number }) => void
    setAxisConstraint?: (axis: undefined | 'X' | 'Y' | 'Z' | 'RX' | 'RY' | 'RZ') => void
}

interface BVHAdapt {
    orientationFieldName?: string
    positionScale?: number
}

interface QuatSphereDependencies {
    initQuatSphere: (dom: HTMLElement | null, options: any) => { api: any; dispose: () => void }
    robotModelStore: any
    api: any
    motionStore: any
    jointPositionLine: Ref<any>
    pathPanel: Ref<IPathPanel>
    withDrawStore: any
    rotateTrajectoryEuler: (arr: number[][], frameIndex: number, startQuat: any, endQuat: any, radius: number) => number[][]
    rotateTrajectory: (arr: number[][], frameIndex: number, startQuat: any, endQuat: any, radius: number) => number[][]
    viewer: Ref<any>
    basePositionLine: Ref<any>
    transformPath: (arr: any[], startQuater: any, currentQuat: any) => any[]
    onLabelClick: (axis: 'X' | 'Y' | 'Z', sign: 1 | -1) => void
}

export function createQuatSphereData({
    initQuatSphere,
    robotModelStore,
    api,
    motionStore,
    jointPositionLine,
    pathPanel,
    withDrawStore,
    rotateTrajectoryEuler,
    rotateTrajectory,
    viewer,
    basePositionLine,
    transformPath,
    onLabelClick
}: QuatSphereDependencies){
    /**
 * 右侧四元数球控制系统
 * 
 * 这是动作编辑器中最重要的旋转姿态编辑工具，提供直观的3D交互方式来调整机器人的旋转。
 * 
 * 主要功能：
 * 1. 3D球体交互：用户可以直接拖拽球体来调整机器人姿态
 * 2. 多种数据格式支持：四元数和欧拉角两种模式
 * 3. 扩散调整：调整当前帧时可以影响前后多个帧，创造平滑过渡
 * 4. 旋转约束：可以限制只绕特定轴旋转
 * 5. 摄像机同步：与3D场景摄像机角度联动
 * 6. 路径重定向：调整姿态时自动调整后续帧的移动轨迹
 * 
 * 这个工具让复杂的3D旋转编辑变得直观易用，是专业动作编辑的核心功能。
 */
const quatSphere = ref<IQuatSphere>({
    settingMenu: {
        show: false,
    },
    /**
     * 四元数球初始化方法
     * 
     * 创建3D四元数球控件并进行初始设置：
     * 1. 在指定DOM容器中创建3D交互球体
     * 2. 设置球体大小和交互回调
     * 3. 根据机器人模型类型选择数据格式（BVH用欧拉角，其他用四元数）
     * 4. 同步球体初始姿态与机器人当前姿态
     * 5. 保存API接口供后续操作使用
     */
    init() {
        const re = initQuatSphere(document.getElementById('quat-sphere'), {
            radius: 0.8,
            onChange: ((e: THREE.Quaternion | { x: number; y: number; z: number; w: number }) => {
                this.onScroll(e)
            }) as (() => void),
            onEnd: () => {
                // 四元数球旋转结束时更新关节位置线条
                // 只有在spread.moving为true时才是真正的手动拖动
                if (this.spread.moving) {
                    // 注意：spread.moving会在spread.handleEnd中被设置为false
                    // 所以这里不需要额外检查，因为spread.handleEnd会处理更新
                } else {
                    // 非扩散模式的简单旋转，直接更新
                    jointPositionLine.value.handleUpdate()
                }
            },
            mode: robotModelStore.isBVH ? 'euler' : 'quaternion',
            onLabelClick: onLabelClick,
            enableDragRotate: false,
        })
        this.api = re.api
        this.dispose = re.dispose

        // 默认内部球体朝向为 0,0,0；四元数为 (0,0,0,1)
        if (robotModelStore.isBVH) {
            re.api.setEuler({ x: 0, y: 0, z: 0 })
        } else {
            re.api.setQuaternion({ x: 0, y: 0, z: 0, w: 1 })
        }
    },
    /**
     * 四元数球交互事件处理器
     * 
     * 当用户拖拽四元数球时触发，负责将球体的旋转变化应用到机器人姿态上。
     * 
     * 处理流程：
     * 1. 检查是否启用扩散模式（影响多个帧）
     * 2. 根据机器人模型类型选择数据格式处理方式
     * 3. 更新当前帧的旋转数据
     * 4. 立即应用到3D机器人模型显示
     * 5. 更新轨迹面板数据
     * 6. 刷新3D场景渲染
     * 
     * 支持两种模式：
     * - 单帧模式：只影响当前帧
     * - 扩散模式：影响当前帧及前后指定范围的帧
     */
    onScroll(e: THREE.Quaternion | { x: number; y: number; z: number; w: number }) {
        if (!this.spread.moving) return

        if (this.spread.enable) {
            if (this.spread.startQuat === null) {
                if (robotModelStore.isBVH) {
                    this.spread.startQuat = e
                } else {
                    this.spread.startQuat = api.robot.quater.threeQuatToUrdf(e)
                }
            } else {
                this.spread.handleMove(e)
            }
        } else {
            if (robotModelStore.isBVH) {
                const rootBoneName = (motionStore.motionData as { bvhAdapt?: BVHAdapt })?.bvhAdapt?.orientationFieldName
                if (rootBoneName) {
                    // 更新根关节的欧拉角
                    motionStore.frame_changeCurrentValue(`${rootBoneName}_x`, e.x)
                    motionStore.frame_changeCurrentValue(`${rootBoneName}_y`, e.y)
                    motionStore.frame_changeCurrentValue(`${rootBoneName}_z`, e.z)
                    
                    // 同步更新四元数字段
                    // 从欧拉角转换为四元数
                    const metadata = (motionStore.motionData as any)?.bvhMetadata
                    if (metadata) {
                        const rootIndex = typeof metadata.rootIndex === 'number' ? metadata.rootIndex : 0
                        const rotationOrder = (metadata.rotationOrders?.[rootIndex] ?? 'XYZ') as 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
                        
                        // 将度数转换为弧度
                        const euler = new THREE.Euler(
                            THREE.MathUtils.degToRad(e.x),
                            THREE.MathUtils.degToRad(e.y),
                            THREE.MathUtils.degToRad(e.z),
                            rotationOrder
                        )
                        
                        // 转换为四元数
                        const quat = new THREE.Quaternion().setFromEuler(euler)
                        
                        // 更新四元数字段
                        motionStore.frame_changeCurrentValue('quater_x', quat.x)
                        motionStore.frame_changeCurrentValue('quater_y', quat.y)
                        motionStore.frame_changeCurrentValue('quater_z', quat.z)
                        motionStore.frame_changeCurrentValue('quater_w', quat.w)
                    }
                }
                pathPanel.value.handleUpDateData()
                // 移除实时更新，改为在onEnd回调中更新
            } else {
                const u = api.robot.quater.threeQuatToUrdf(e)
                motionStore.frame_changeCurrentValue('quater_x', u.x)
                motionStore.frame_changeCurrentValue('quater_y', u.y)
                motionStore.frame_changeCurrentValue('quater_z', u.z)
                motionStore.frame_changeCurrentValue('quater_w', u.w)
                // 移除实时更新，改为在onEnd回调中更新
            }
            const cf = motionStore.getCurrentFrame()
            if (cf) api.robot.setFrame(cf as FrameLike)
        }
        api.forceRender()
    },

    /**
     * 更新四元数球显示状态
     * 
     * 将机器人当前的旋转姿态同步到四元数球显示上，
     * 确保球体始终反映机器人的实际姿态。
     * 
     * 根据机器人模型类型选择合适的数据格式：
     * - BVH模型：使用欧拉角格式
     * - 其他模型：使用四元数格式
     */
    updateRobotQuat() {
        (quatSphere.value.api as QuatSphereAPI).setEuler({
            x: 0,
            y: 0,
            z: 0
        })
        return
        if (robotModelStore.isBVH) {
            const eulerData = motionStore.getCurrentFrameEulerData()
            if (eulerData) {
                (quatSphere.value.api as QuatSphereAPI).setEuler(eulerData)
            }
        } else {
            (quatSphere.value.api as QuatSphereAPI).setQuaternion((() => {
                return api.robot.quater.get()
            })())
        }
    },
    /**
     * 四元数球扩散调整系统
     * 
     * 这是四元数球最强大的功能之一，允许调整当前帧的旋转姿态时同时影响前后多个帧，
     * 创造出平滑自然的旋转过渡效果。
     * 
     * 工作原理：
     * 1. 记录开始调整时所有帧的位置和旋转数据
     * 2. 计算当前帧的旋转变化量
     * 3. 使用轨迹旋转算法将这个变化应用到指定范围的帧上
     * 4. 同时调整位置和旋转，保持动作的连贯性
     * 
     * 应用场景：
     * - 调整机器人转身动作，让转身更加平滑
     * - 修正动作中的朝向偏差，避免突兀的跳跃
     * - 创建复杂的旋转动作序列
     * 
     * 这个功能让单帧的姿态调整能够产生多帧的协调效果，是专业动作编辑的核心工具。
     */
    spread: {
        enable: false,
        moving: false,
        startArr: [] as number[][],
        startFrameIndex: 0,
        startQuat: null as { x: number; y: number; z: number; w: number } | null,
        value: 0,
        applyTimer: null as NodeJS.Timeout | null,
        handleStart() {
            if (this.moving) return
            this.startFrameIndex = motionStore.currentFrameIndex
            const bvhAdapt = motionStore.motionData?.bvhAdapt
            this.startArr = (() => {
                const re: number[][] = [
                    [], [], [], [], [], [], ...(() => robotModelStore.isBVH ? [] : [[]])()
                ]
                if (!motionStore.motionData) return re
                for (let i = 0; i < motionStore.frame_getNum(); i++) {
                    const frame = motionStore.motionData.parsed[i]
                    re[0].push(frame.global_x)
                    re[1].push(frame.global_y)
                    re[2].push(frame.global_z)
                    if (robotModelStore.isBVH && typeof bvhAdapt === 'object' && bvhAdapt && 'orientationFieldName' in bvhAdapt) {
                        const fieldName = (bvhAdapt as BVHAdapt).orientationFieldName!
                        re[3].push(frame[fieldName + '_x'] || 0)
                        re[4].push(frame[fieldName + '_y'] || 0)
                        re[5].push(frame[fieldName + '_z'] || 0)
                    } else {
                        re[3].push(frame.quater_x)
                        re[4].push(frame.quater_y)
                        re[5].push(frame.quater_z)
                        re[6].push(frame.quater_w)
                    }
                }
                return re
            })()
            this.startQuat = null
            this.moving = true
            withDrawStore.setOperationInfo('姿态', null)
        },
        handleMove(quat) {
            if (this.moving === false) return
            this.value = parseInt(`${this.value}`)
            const bvhAdapt = motionStore.motionData?.bvhAdapt
            const modifiedArr = robotModelStore.isBVH ? rotateTrajectoryEuler(JSON.parse(JSON.stringify(this.startArr)), this.startFrameIndex, this.startQuat!, quat, this.value) : rotateTrajectory(JSON.parse(JSON.stringify(this.startArr)), this.startFrameIndex, this.startQuat!, robotModelStore.isBVH ? quat : api.robot.quater.threeQuatToUrdf(quat), this.value)
            for (let i = 0; i < modifiedArr[0].length; i++) {
                motionStore.setFrameFieldValue(i, 'global_x', modifiedArr[0][i])
                motionStore.setFrameFieldValue(i, 'global_y', modifiedArr[1][i])
                motionStore.setFrameFieldValue(i, 'global_z', modifiedArr[2][i])
                if (i !== this.startFrameIndex || !this.value) {
                    if (robotModelStore.isBVH) {
                        const rootJointName = (motionStore.motionData as { bvhAdapt?: BVHAdapt })?.bvhAdapt?.orientationFieldName
                        if (rootJointName) {
                            // 更新根关节的欧拉角
                            motionStore.setFrameFieldValue(i, `${rootJointName}_x`, modifiedArr[3][i])
                            motionStore.setFrameFieldValue(i, `${rootJointName}_y`, modifiedArr[4][i])
                            motionStore.setFrameFieldValue(i, `${rootJointName}_z`, modifiedArr[5][i])
                            
                            // 同步更新四元数字段
                            const metadata = (motionStore.motionData as any)?.bvhMetadata
                            if (metadata) {
                                const rootIndex = typeof metadata.rootIndex === 'number' ? metadata.rootIndex : 0
                                const rotationOrder = (metadata.rotationOrders?.[rootIndex] ?? 'XYZ') as 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'
                                
                                // 将度数转换为弧度
                                const euler = new THREE.Euler(
                                    THREE.MathUtils.degToRad(modifiedArr[3][i]),
                                    THREE.MathUtils.degToRad(modifiedArr[4][i]),
                                    THREE.MathUtils.degToRad(modifiedArr[5][i]),
                                    rotationOrder
                                )
                                
                                // 转换为四元数
                                const quat = new THREE.Quaternion().setFromEuler(euler)
                                
                                // 更新四元数字段
                                motionStore.setFrameFieldValue(i, 'quater_x', quat.x)
                                motionStore.setFrameFieldValue(i, 'quater_y', quat.y)
                                motionStore.setFrameFieldValue(i, 'quater_z', quat.z)
                                motionStore.setFrameFieldValue(i, 'quater_w', quat.w)
                            }
                        }
                    } else {
                        motionStore.setFrameFieldValue(i, 'quater_x', modifiedArr[3][i])
                        motionStore.setFrameFieldValue(i, 'quater_y', modifiedArr[4][i])
                        motionStore.setFrameFieldValue(i, 'quater_z', modifiedArr[5][i])
                        motionStore.setFrameFieldValue(i, 'quater_w', modifiedArr[6][i])
                    }
                }
            }

            // basePositionLine.value.handleUpdate()
            // 移除实时更新，改为在handleEnd时更新
            api.robot.setFrame((motionStore.getCurrentFrame() as FrameLike))
            // pathPanel.value.handleUpDateData()

            if(this.applyTimer){
                clearTimeout(this.applyTimer)
            }
            this.applyTimer = setTimeout(() => {
                this.apply()
            }, 10)
        },
        apply(forceUpdate: boolean = false){
            if(viewer.value.jointPositionLine3D.showNum() || forceUpdate)viewer.value.jointPositionLine3D.compute(
                motionStore.currentFrameIndex - 1, 
                motionStore.frame_getNum() - 1, 
                motionStore.motionData?.parsed || []
            )
        },
        handleEnd() {
            if (this.moving) {
                this.apply(true);
            }
            this.moving = false
            // 四元数球扩散模式结束时更新关节位置线条
        },
        getAfterCanMoveFrameNum() {
            const currentFrameIndex = motionStore.currentFrameIndex
            return motionStore.frame_getNum() - (currentFrameIndex + 1)
        },
        update() {
            if (this.value > this.getAfterCanMoveFrameNum()) {
                this.value = this.getAfterCanMoveFrameNum()
            }
            if (this.value < 0) {
                this.value = 0
            }
        }
    },
    api: null,
    dispose: null,

    /**
     * 旋转轴约束控制系统
     * 
     * 允许用户限制四元数球只能绕特定轴旋转，这在某些编辑场景下非常有用：
     * 
     * 约束类型：
     * - X轴约束：只能绕X轴旋转（俯仰）
     * - Y轴约束：只能绕Y轴旋转（偏航）
     * - Z轴约束：只能绕Z轴旋转（翻滚）
     * - RX/RY/RZ：绕机器人自身的XYZ轴旋转
     * - 无约束：自由旋转
     * 
     * 使用场景：
     * - 调整机器人头部左右转动（Y轴约束）
     * - 调整机器人身体前后倾斜（X轴约束）
     * - 精确控制特定方向的旋转
     */
    constraint: {
        selected: undefined,
        change(to) {
            this.selected = to
            quatSphere.value.api?.setAxisConstraint(to)
        }
    },

    lockedCameraQuater: true,
    /**
     * 路径重定向控制系统（实验性功能）
     * 
     * 这是一个高级功能，当用户调整当前帧的机器人姿态时，
     * 自动调整后续帧的移动路径，使整个动作序列保持连贯性。
     * 
     * 工作原理：
     * 1. 记录调整前的机器人姿态和后续帧的路径数据
     * 2. 计算当前帧姿态的变化量
     * 3. 将这个变化应用到后续所有帧的位置和姿态上
     * 4. 确保机器人的移动轨迹与新的朝向保持一致
     * 
     * 应用场景：
     * - 调整机器人行走时的朝向，自动修正后续的移动方向
     * - 修正动作序列中的方向偏差
     * - 创建复杂的转向和移动组合动作
     * 
     * 注意：此功能目前处于实验阶段，可能会产生意外的结果。
     */
    pathReorientation: {
        enable: false,
        startQuater: null,
        startArr: [],
        startFrameIndex: 0,
        handleStart() {
            return
            this.enable = true
            this.startQuater = api.robot.quater.get()
            this.startFrameIndex = motionStore.currentFrameIndex
            this.startArr = motionStore.getLaterPathReorientationData(motionStore.currentFrameIndex)
        },
        handleMove() {
            if (!this.enable) return
            if (!this.startQuater) return
            const currentQuat = api.robot.quater.get()
            const modifiedArr = transformPath(this.startArr, this.startQuater, currentQuat)
            for (let i = 0; i < modifiedArr.length; i++) {
                const realIndex = i + this.startFrameIndex
                modifiedArr[i].quaternion = api.robot.quater.threeQuatToUrdf(modifiedArr[i].quaternion)
                motionStore.setFrameFieldValue(realIndex, 'global_x', modifiedArr[i].position.x)
                motionStore.setFrameFieldValue(realIndex, 'global_y', modifiedArr[i].position.z)
                motionStore.setFrameFieldValue(realIndex, 'global_z', modifiedArr[i].position.y)
                motionStore.setFrameFieldValue(realIndex, 'quater_x', modifiedArr[i].quaternion.x)
                motionStore.setFrameFieldValue(realIndex, 'quater_y', modifiedArr[i].quaternion.y)
                motionStore.setFrameFieldValue(realIndex, 'quater_z', modifiedArr[i].quaternion.z)
                motionStore.setFrameFieldValue(realIndex, 'quater_w', modifiedArr[i].quaternion.w)
                if (!i) {
                    const f = motionStore.getCurrentFrame()
                    if (f) api.robot.setFrame(f as FrameLike)
                }
            }

            basePositionLine.value.handleUpdate()
            api.forceRender()
        },
        handleEnd() {
            this.enable = false
        }
    }
})
return quatSphere
}