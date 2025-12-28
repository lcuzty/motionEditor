import { watch, nextTick, type Ref } from 'vue'
import type { FrameLike } from './tools/motionEditorTools'
import type { IPathPanel } from './pathPanel/data'
import type { IJointQuatSphere } from './jointQuatSphere/data'
import type { IPositionPanel } from './positionPanel/data'
import type { IDragJointSettingsPanel } from './dragJointSettingsPanel/data'
import type { IPlayer } from './player/data'
import type { IDataPanel } from './dataPanel/data'
import type { IQuatSphere } from './quatSphere/data'
import type { IJointPositionLine3D } from './jointPositionLine3D/data'

interface WatchesDependencies {
  // Stores
  themeStore: any
  selectedFieldStore: any
  robotModelStore: any
  windowStore: any
  viewerStore: any
  motionStore: any
  withDrawStore: any

  // Refs
  isDarkTheme: Ref<boolean>
  textColor: Ref<string>
  pathPanel: Ref<IPathPanel>
  dataPanel: Ref<IDataPanel>
  dataListScrollRef: Ref<any>
  pathPanelScrollRef: Ref<any>
  viewer: Ref<any>
  basePositionLine: Ref<any>
  jointPositionLine: Ref<any>
  camera: Ref<any>
  jointQuatSphere: Ref<IJointQuatSphere>
  quatSphere: Ref<IQuatSphere>
  isJointManipulating: Ref<boolean>
  dragJointSettingsPanel: Ref<IDragJointSettingsPanel>
  positionPanel: Ref<IPositionPanel>
  player: Ref<IPlayer>
  jointPositionLine3D: Ref<IJointPositionLine3D>

  // Functions
  scrollToJoint: (scrollRef: any, jointName: string) => void
  handleModifyWindowsLocation: () => void
  handleViewerSizeChange: () => void
  handleCloseAllMenu: () => void

  // API
  api: any

  motionEditorEmit: (event: string, ...args: any[]) => void
}

export function createWatches({
  motionEditorEmit,
  themeStore,
  selectedFieldStore,
  robotModelStore,
  windowStore,
  viewerStore,
  motionStore,
  withDrawStore,
  isDarkTheme,
  textColor,
  pathPanel,
  dataPanel,
  dataListScrollRef,
  pathPanelScrollRef,
  viewer,
  basePositionLine,
  jointPositionLine,
  camera,
  jointQuatSphere,
  quatSphere,
  isJointManipulating,
  dragJointSettingsPanel,
  positionPanel,
  player,
  jointPositionLine3D,
  scrollToJoint,
  handleModifyWindowsLocation,
  handleViewerSizeChange,
  handleCloseAllMenu,
  api,
}: WatchesDependencies) {
  watch(
    () => motionStore.isMotionJSONEdited,
    to => {
        console.log('isMotionJSONEdited', to)
      if (to) {
        motionEditorEmit('onMotionJSONEdited')
      }
    }
  )

  watch(
    () => themeStore.isDark,
    to => {
      isDarkTheme.value = to
      textColor.value = to ? '#fff' : '#000'
      // 切换 lineChart 主题
      if (
        pathPanel.value &&
        pathPanel.value.setTheme &&
        typeof pathPanel.value.setTheme === 'function'
      ) {
        pathPanel.value.setTheme(to ? 'dark' : 'light')
      }
    },
    { immediate: true }
  )

  // 监听选中的关节变化，自动滚动到对应位置
  watch(
    () => selectedFieldStore.selectedFieldName,
    newFieldName => {
      if (!newFieldName) return

      nextTick(() => {
        // 滚动数据列表（如果显示）
        if (dataPanel.value.show && dataListScrollRef.value) {
          scrollToJoint(dataListScrollRef.value, newFieldName)
        }

        // 滚动轨迹面板关节列表（如果显示）
        if (pathPanel.value.show === 2 && pathPanelScrollRef.value) {
          scrollToJoint(pathPanelScrollRef.value, newFieldName)
        }
      })
    }
  )

  // 监听 hover 的关节变化，自动滚动到对应位置
  watch(
    () => selectedFieldStore.hoveredJointName,
    newJointName => {
      if (!newJointName) return

      nextTick(() => {
        // 需要处理 BVH 模型的关节名称映射
        // BVH 的字段名带有后缀 _x/_y/_z，需要找到对应的完整字段名
        let targetFieldName = newJointName

        if (robotModelStore.isBVH) {
          // 对于 BVH，需要找到以 jointName_ 开头的字段
          // 例如：hoveredJointName 是 "Hips"，需要找到 "Hips_x" 等
          targetFieldName = `${newJointName}_x` // 使用 _x 作为代表
        }

        // 滚动数据列表（如果显示）
        if (dataPanel.value.show && dataListScrollRef.value) {
          scrollToJoint(dataListScrollRef.value, targetFieldName)
        }

        // 滚动轨迹面板关节列表（如果显示）
        if (pathPanel.value.show === 2 && pathPanelScrollRef.value) {
          scrollToJoint(pathPanelScrollRef.value, targetFieldName)
        }
      })
    }
  )

  // 监听完成设置数据
  watch(
    () => windowStore.isSettedData,
    async to => {
      if (to) {
        while (1) {
          if (viewerStore.viewerOnReadyOutput !== null) {
            const output = viewerStore.viewerOnReadyOutput as any
            if (robotModelStore.isBVH) {
              output.loadBVH?.(robotModelStore.BVHContent)
            } else {
              output.loadURDFAndSTL?.(robotModelStore.urdfUrl, robotModelStore.stlUrls)
            }
            return
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }
  )

  /**
   * 监听窗口最大化状态变化的响应处理
   *
   * 当用户点击窗口右上角的最大化/恢复按钮时，窗口尺寸会发生变化。
   * 这个监听器确保编辑器界面能够正确适应新的窗口尺寸：
   * 1. 等待10毫秒让窗口尺寸变化完全生效
   * 2. 刷新轨迹面板的滚动容器宽度，让滚动条正确显示
   * 3. 重新计算各个面板的位置和布局
   * 4. 调整3D查看器的尺寸以适应新窗口
   */
  watch(
    () => windowStore.isMaximized,
    () => {
      setTimeout(() => {
        pathPanel.value.location.refreshScrollContainerWidth()
        handleModifyWindowsLocation()
        handleViewerSizeChange()
      }, 10)
    }
  )
  /**
   * 监听3D场景网格线显示开关的控制逻辑
   *
   * 网格线是3D场景中的辅助工具，类似于方格纸上的网格，帮助用户：
   * 1. 更好地判断机器人在空间中的位置
   * 2. 估算距离和比例关系
   * 3. 作为参考基准来调整动作
   *
   * 当用户在界面上切换网格线显示开关时，这个监听器会：
   * - 如果开启：在3D场景地面添加网格线
   * - 如果关闭：移除网格线以减少视觉干扰
   * - 立即刷新3D场景让变化生效
   */
  watch(
    () => viewerStore.isGridVisible,
    to => {
      viewer.value.gridHelper.setVisible(to)
      // console.log(api)
      // if (to) {
      //     api.scene.gridHelper.set()
      // } else {
      //     api.scene.gridHelper.remove()
      // }
      api.forceRender()
    }
  )
  /**
   * 监听3D场景坐标轴显示开关的控制逻辑
   *
   * 坐标轴是3D空间的方向指示器，显示X、Y、Z三个轴的方向：
   * - X轴通常为红色，表示左右方向
   * - Y轴通常为绿色，表示上下方向
   * - Z轴通常为蓝色，表示前后方向
   *
   * 这个辅助工具帮助用户：
   * 1. 理解3D空间的方向概念
   * 2. 在编辑动作时确定机器人的朝向
   * 3. 调试和验证动作的空间正确性
   *
   * 当用户切换坐标轴显示时，立即在3D场景中添加或移除坐标轴显示
   */
  watch(
    () => viewerStore.isAxesVisible,
    to => {
      if (to) {
        // api.scene.axesHelper.set()
        viewer.value.axesHelper.setVisible(to)
        viewer.value?.setHideRelativeAxis(false)
      } else {
        // api.scene.axesHelper.remove()
        viewer.value.axesHelper.setVisible(to)
        viewer.value?.setHideRelativeAxis(true)
      }
      api.forceRender()
    }
  )
  /**
   * 监听机器人Base位置轨迹线显示开关的控制逻辑
   *
   * Base位置轨迹线是一条连接机器人在整个动作过程中所有位置点的线条，
   * 类似于在地图上画出一个人的行走路线。这个功能对于分析机器人的移动模式很有用：
   *
   * 1. 可以直观看到机器人是否按预期路径移动
   * 2. 检查是否有不合理的跳跃或偏移
   * 3. 分析动作的空间连续性
   * 4. 优化机器人的移动效率
   *
   * 当开启轨迹线显示时：
   * - 从动作数据中提取所有帧的Base位置信息
   * - 在3D场景中绘制连接这些位置的线条
   * - 同时显示位置控制面板，提供相关调整选项
   *
   * 当关闭时则移除轨迹线和控制面板
   */
  watch(
    () => viewerStore.isBasePositionLineVisible,
    to => {
      if (to) {
        basePositionLine.value.handleShow()
      } else {
        basePositionLine.value.handleHide()
      }
    }
  )

  /**
   * 监听关节位置轨迹线显示开关的控制逻辑
   *
   * 关节位置轨迹线显示当前选中关节在整个动作过程中的3D空间运动轨迹。
   * 这个功能对于分析关节运动模式很有用：
   *
   * 1. 可以直观看到关节的运动路径
   * 2. 检查关节运动是否平滑连续
   * 3. 分析关节的运动范围和模式
   * 4. 优化关节运动轨迹
   *
   * 当开启轨迹线显示时：
   * - 根据当前选中的关节字段计算其在所有帧中的空间位置
   * - 在3D场景中绘制连接这些位置的线条（蓝色到紫色渐变）
   *
   * 当关闭时则移除轨迹线
   */
  watch(
    () => viewerStore.isJointPositionLineVisible,
    to => {
      if (to) {
        jointPositionLine.value.handleShow()
      } else {
        jointPositionLine.value.handleHide()
      }
    }
  )
  /**
   * 监听当前播放帧变化的核心响应逻辑
   *
   * 这是整个动作编辑器最重要的监听器之一，负责处理帧切换时的所有同步更新。
   * 帧切换可能由以下操作触发：
   * - 点击播放按钮进行动画播放
   * - 拖拽时间轴进度条
   * - 使用键盘快捷键切换帧
   * - 点击帧数输入框直接跳转
   *
   * 每次帧切换时需要同步更新的内容：
   * 1. 3D机器人模型的姿态（所有关节角度）
   * 2. 摄像机位置（如果开启了跟随模式）
   * 3. 轨迹面板中的当前帧标记线
   * 4. 各个控制面板中的四元数球显示
   * 5. 数据面板的编辑状态管理
   * 6. 特殊情况处理（首次加载、摄像机初始化等）
   *
   * 这个函数确保用户在任何时候看到的都是当前帧对应的正确状态
   */
  watch(
    () => motionStore.currentFrameIndex,
    async (to, from) => {
      const currentFrame = motionStore.getCurrentFrame() as FrameLike
      api.robot.setFrame(currentFrame)
      camera.value.track.updatePosition()
      if (pathPanel.value.setMarker)
        (pathPanel.value.setMarker as Function)(motionStore.currentFrameIndex + 1)
      // positionPanel.value.spread.update()
      // dragJointSettingsPanel.value.spread.update()
      // quatSphere.value.spread.update()
      jointQuatSphere.value.updateQuat()

      // 更新Base位置线和关节位置线的当前帧标记球体
      if (viewerStore.isBasePositionLineVisible) {
        api.robot.basePositionLine.updateCurrentFrameMarker(to)
      }
      if (viewerStore.isJointPositionLineVisible) {
        api.robot.jointPosition.JointPositionLine.updateCurrentFrameMarker(to)
      }

      if (from !== -1 && dataPanel.value.editedCurrentFrame) {
        motionStore.cleanTempFieldsForFrame(from)
        dataPanel.value.editedCurrentFrame = false
      }

      if (from === -1) {
        setTimeout(() => {
          camera.value.toStartPosition()
        }, 10)
      }

      quatSphere.value.updateRobotQuat()

      viewer.value.jointPositionLine3D.setCurrentIndex(to)
      // setTimeout(() => {

      // }, 50)
    }
  )
  /**
   * 监听动作JSON文件加载完成状态的初始化处理
   *
   * 当用户选择的动作JSON文件成功加载并解析后，需要进行一系列初始化操作
   * 来确保编辑器处于可用状态：
   *
   * 1. 重置摄像机到默认位置，提供最佳的初始观察角度
   * 2. 初始化四元数球控件，这个控件用于直观地显示和编辑机器人的旋转姿态
   * 3. 如果 viewer 已加载且 currentFrameIndex 为 -1，则设置为 0 并应用第一帧数据
   *
   * 注意：四元数球的初始化必须等到URDF机器人模型和JSON动作数据都加载完成后
   * 才能进行，因为它需要读取机器人的当前姿态信息
   */
  watch(
    () => motionStore.isJsonLoaded,
    isLoaded => {
      if (!isLoaded) return
    }
  )
  /**
   * 监听数据字段选择变化的轨迹面板联动逻辑
   *
   * 在动作编辑器中，用户可以选择查看不同的数据字段（比如某个关节的角度变化）。
   * 当用户在数据面板或其他地方选择了一个字段后，轨迹面板需要显示该字段
   * 在整个动作过程中的数值变化曲线。
   *
   * 这个功能类似于股票软件中选择不同指标后显示对应的走势图：
   * 1. 用户选择一个关节或数据字段
   * 2. 系统提取该字段在所有帧中的数值
   * 3. 在轨迹面板中绘制数值变化的曲线图
   * 4. 用户可以通过曲线图直观地分析数据趋势
   *
   * 如果没有选中任何字段，则不进行任何操作
   */
  watch(
    () => selectedFieldStore.selectedFieldName,
    (to, from) => {
      if (to === null) {
        // 选中字段变为空时，不自动关闭位置线（位置线独立管理）
        return
      }

      pathPanel.value.handleLoad(to)

      // 注意：不在这里自动更新关节位置线
      // 关节位置线的更新应该只在以下情况触发：
      // 1. 用户主动切换显示的关节（通过悬浮菜单）
      // 2. 用户编辑了关节数据（拖动关节、编辑数值等）
      // 3. 撤销/重做操作
      // 不应该在仅切换编辑字段或拖动进度条时触发重绘
    }
  )
  /**
   * 监听动作播放状态变化的UI控制逻辑
   *
   * 当动作开始播放时，需要隐藏一些设置菜单，防止用户在播放过程中
   * 修改设置导致播放异常或界面混乱：
   *
   * 1. 隐藏刷新率设置菜单 - 播放时修改刷新率可能导致播放卡顿
   * 2. 隐藏播放倍速设置菜单 - 播放时修改倍速可能导致播放异常
   *
   * 这样可以确保播放过程的稳定性和用户体验的一致性
   */
  watch(
    () => motionStore.playStatus,
    to => {
      if (to === 1) {
        player.value.refreshRate.showMenu = false
        player.value.xSpeed.showMenu = false
      }
    }
  )

  /**
   * 监听播放状态变化的菜单管理逻辑
   *
   * 当动作开始播放时，关闭所有打开的菜单和弹窗，
   * 让用户专注于观看播放效果，避免界面元素遮挡视线
   */
  watch(
    () => motionStore.play_status,
    to => {
      if (to) {
        handleCloseAllMenu()
      }
    }
  )

  /**
   * 监听撤销/重做操作的联动逻辑
   *
   * 当用户执行撤销或重做（doWithDrawCount变化）时：
   * 1. 强制刷新界面，确保所有数据和视图同步更新
   * 2. 通知轨迹面板(pathPanel)重新加载数据，反映最新的动作帧变化
   *
   * 这样可以保证撤销/重做后，界面和数据始终保持一致，用户体验更流畅
   */
  watch(
    () => withDrawStore.doWithDrawCount,
    () => {
      api.robot.setFrame(motionStore.getCurrentFrame() as FrameLike)
      basePositionLine.value.handleUpdate()
      // 撤销/重做时，只有在没有正在进行的拖动操作时才更新关节位置线
      if (
        !isJointManipulating.value &&
        !jointQuatSphere.value.move.moving &&
        !dragJointSettingsPanel.value.drag.moving &&
        !positionPanel.value.offset.moving &&
        !quatSphere.value.spread.moving &&
        !pathPanel.value.move.moving
      ) {
        jointPositionLine.value.handleUpdate()
      }
      api.forceRender()
      pathPanel.value.handleUpDateData()
      jointQuatSphere.value.updateQuat()
      quatSphere.value.updateRobotQuat()
      if (withDrawStore.needUpdateFrameRange.updateTotal) {
        viewer.value.jointPositionLine3D.setTotal(motionStore.frame_getNum() - 1)
        jointPositionLine3D.value.range.modify()
      }
      if (
        withDrawStore.needUpdateFrameRange.startIndex !== undefined &&
        withDrawStore.needUpdateFrameRange.endIndex !== undefined &&
        motionStore.motionData?.parsed
      ) {
        viewer.value.jointPositionLine3D.compute(
          withDrawStore.needUpdateFrameRange.startIndex - 1,
          withDrawStore.needUpdateFrameRange.endIndex,
          motionStore.motionData.parsed
        )
        viewer.value.jointPositionLine3D.resetColor()
      }
    }
  )
}
