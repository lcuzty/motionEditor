// 动作编辑器帮助中心资源管理文件
// 用于集中管理所有图片和视频资源的引入
// 目前资源尚未录制，使用空字符串占位，请根据注释说明录制/制作对应资源
import img_home_feature3D from './images/home_feature3D.png'
import img_home_featureCurve from './images/home_featureCurve.png'
import img_home_featurePlayer from './images/home_featurePlayer.png'

import img_common_mouseInteraction from './images/common_mouseInteraction.gif'
import img_common_addKeyframeVideo from './images/common_addKeyframeVideo.gif'
import img_common_playerControls from './images/common_playerControls.png'
import img_common_undoRedo from './images/common_undoRedo.png'

import img_urdf_jointEdit from './images/urdf_jointEdit.gif'

import img_bvh_quatSphereDragVideo from './images/bvh_quatSphereDragVideo.gif'
import img_bvh_componentEdit from './images/bvh_componentEdit.gif'

import img_view3d_cameraFollowModes from './images/view3d_cameraFollowModes.png'
import img_view3d_zoomSpeedSlider from './images/view3d_zoomSpeedSlider.gif'
import img_view3d_showHideTrajectoryVideo from './images/view3d_showHideTrajectoryVideo.gif'

import img_pathPanel_keyframeInterface from './images/pathPanel_keyframeInterface.png'
import img_pathPanel_handleTypesVideo from './images/pathPanel_handleTypesVideo.gif'
import img_pathPanel_valueInput from './images/pathPanel_valueInput.gif'

import img_player_refreshRateSettings from './images/player_refreshRateSettings.png'

import img_quatSphere_interface from './images/quatSphere_interface.png'
import img_quatSphere_axisConstraint from './images/quatSphere_axisConstraint.png'

import img_camera_focusButton from './images/camera_focusButton.gif'


export const HelpAssets = {
  // ==================== 首页 ====================
  home: {
    // 动图：新手引导视频
    // 推荐时长：3-5分钟
    // 格式：GIF/WebP, 1920x1080px
    // 内容：演示基础操作流程
    introVideo: '',

    // 图片：3D视图交互卡片封面
    // 推荐尺寸：400x225px, PNG, 透明背景
    feature3D: img_home_feature3D,

    // 图片：曲线编辑器卡片封面
    // 推荐尺寸：400x225px, PNG, 透明背景
    featureCurve: img_home_featureCurve,

    // 图片：实时预览卡片封面
    // 推荐尺寸：400x225px, PNG, 透明背景
    featurePlayer: img_home_featurePlayer,
  },

  // ==================== 1.1 通用功能 ====================
  common: {
    // 动图：3D视图鼠标操作演示
    // 推荐时长：20-30秒, GIF/WebP
    // 内容：演示左键旋转、中键平移、滚轮缩放等操作
    mouseInteraction: img_common_mouseInteraction,

    // 动图：添加关键帧操作演示
    // 推荐时长：30秒, GIF/WebP
    // 内容：演示按K键添加关键帧
    addKeyframeVideo: img_common_addKeyframeVideo,

    // 图片：播放控制栏截图
    // 推荐尺寸：800x200px, PNG
    // 内容：标注各个按钮功能
    playerControls: img_common_playerControls,

    // 图片：撤销/重做操作示意图
    // 推荐尺寸：600x300px, PNG
    undoRedo: img_common_undoRedo,
  },

  // ==================== 1.2 URDF 专用功能 ====================
  urdf: {
    // 图片：关节角度编辑界面截图
    // 推荐尺寸：600x400px, PNG
    // 内容：显示数值输入框
    jointEdit: img_urdf_jointEdit,
  },

  // ==================== 1.3 BVH 专用功能 ====================
  bvh: {
    // 动图：拖拽旋转球操作演示
    // 推荐时长：20秒, GIF/WebP
    // 内容：演示球体拖拽旋转
    bvh: img_bvh_quatSphereDragVideo,

    // 图片：X/Y/Z 分量编辑界面截图
    // 推荐尺寸：800x400px, PNG
    componentEdit: img_bvh_componentEdit,
  },

  // ==================== 2.1 3D 视图交互系统 ====================
  view3d: {
    // 图片：3种摄像机跟随模式示意图
    // 推荐尺寸：1200x400px, PNG
    // 内容：3个子图展示不同模式（默认、固定距离和朝向、仅固定朝向）
    cameraFollowModes: img_view3d_cameraFollowModes,

    // 图片：缩放速度调节滑块截图
    // 推荐尺寸：600x150px, PNG
    zoomSpeedSlider: img_view3d_zoomSpeedSlider,

    // 动图：显示/隐藏轨迹线操作
    // 推荐时长：15秒, GIF/WebP
    showHideTrajectoryVideo: img_view3d_showHideTrajectoryVideo,
  },

  // ==================== 2.2 轨迹面板 ====================
  pathPanel: {
    // 图片：关键帧界面截图
    // 推荐尺寸：1000x400px, PNG
    // 内容：标注关键帧位置
    keyframeInterface: img_pathPanel_keyframeInterface,

    // 动图：5种控制柄类型对比演示
    // 推荐时长：40秒, GIF/WebP
    // 内容：分别展示每种类型的效果
    handleTypesVideo: img_pathPanel_handleTypesVideo,

    // 图片：数值输入框截图
    // 推荐尺寸：600x200px, PNG
    valueInput: img_pathPanel_valueInput,
  },

  // ==================== 2.3 播放控制系统 ====================
  player: {
    // 图片：刷新率设置界面截图
    // 推荐尺寸：600x200px, PNG
    refreshRateSettings: img_player_refreshRateSettings,
  },

  // ==================== 2.4 四元数球编辑器 ====================
  quatSphere: {
    // 图片：四元数球界面截图
    // 推荐尺寸：500x500px, PNG
    interface: img_quatSphere_interface,

    // 图片：轴约束选项界面截图
    // 推荐尺寸：600x300px, PNG
    axisConstraint: img_quatSphere_axisConstraint,
  },

  // ==================== 2.5 摄像机控制系统 ====================
  camera: {
    // 图片：焦点按钮位置截图
    // 推荐尺寸：800x200px, PNG
    // 内容：标注按钮位置
    focusButton: img_camera_focusButton,

    // 图片：视角预设选项截图
    // 推荐尺寸：600x300px, PNG
    viewPresets: img_camera_focusButton,

  },



  // ==================== FAQ ====================
  faq: {
    // 图片：播放状态指示器截图 (小白用户)
    // 推荐尺寸：600x200px, PNG
    // 内容：标注播放/暂停按钮
    playStatus: img_home_featurePlayer,

    // 动图：平滑删除 vs 普通删除对比演示 (学生)
    // 推荐时长：30秒, GIF/WebP
    // 内容：左右分屏对比
    smoothDeleteVideo: img_pathPanel_keyframeInterface,

    // 图片：控制柄类型切换界面截图 (动画师)
    // 推荐尺寸：600x400px, PNG
    handleTypeSwitch: img_pathPanel_handleTypesVideo,

    // 动图：3种方法演示视频 (动画师 - 调整动作幅度)
    // 推荐时长：60秒, GIF/WebP
    // 内容：分段展示3种方法
    amplitudeAdjustmentVideo: img_view3d_showHideTrajectoryVideo,
  },
}
