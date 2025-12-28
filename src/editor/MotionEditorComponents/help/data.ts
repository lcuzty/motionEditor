import { CSSProperties, ref, Ref } from 'vue'
import { HelpAssets } from './assets'

export interface IHelpPageData {
  title: string
  content: IHelpPageContentItem[]
}
export interface IHelpPageContentItem {
  id?: string
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'p'
    | 'button'
    | 'image'
    | 'video'
    | 'list'
    | 'code'
    | 'list-button'
    | 'feature-card'
    | 'note'
    | 'table'
    | 'divider'
    | 'cards-grid'
  html?: string
  src?: string
  list?: string[]
  code?: string
  text?: string
  title?: string
  description?: string
  image?: string
  cards?: Array<{
    title: string
    description: string
    image?: string
    onClick?: () => void
  }>
  style?: CSSProperties
  onClick?: () => void
}

export interface IHelpData {
  currentPageName: any
  pageHistory: string[]
  show: boolean
  getPageData: () => IHelpPageData
  getPageDataByName: (pageName: string) => IHelpPageData
  handlePageChange: (pageName: string) => void
  handleBack: () => void
  canGoBack: () => boolean
}

interface IHelpDependencies {
  // Stores
  themeStore: any
  viewerStore: any
  robotModelStore: any
  windowStore: any
  motionStore: any
  selectedFieldStore: any
  withDrawStore: any

  // Module Data Objects
  pathPanel: any
  jointQuatSphere: any
  positionPanel: any
  dragJointSettingsPanel: any
  player: any
  dataPanel: any
  quatSphere: any
  jointPositionLine3D: any
  jointFloatingMenu: any
  camera: any
  currentHoverJointTip: any
  operationHsitoryPanel: any
  viewerJointControl: any
  saveType: any
  basePositionLine: any
  jointPositionLine: any
  urdfView: any

  // UI State
  isDarkTheme: Ref<boolean>
  textColor: Ref<string>

  // Viewer & API
  viewer: any
  api: any
}

export function createHelpData(dependencies: IHelpDependencies) {
  const help = ref<IHelpData>({
    currentPageName: 'home',
    pageHistory: [],
    show: false,
    getPageData() {
      return pages[this.currentPageName] || pages['home']
    },
    getPageDataByName(pageName: string) {
      return pages[pageName] || pages['home']
    },
    handlePageChange(pageName: string) {
      if (pages[pageName]) {
        // 将当前页面加入历史栈
        if (this.currentPageName !== pageName) {
          this.pageHistory.push(this.currentPageName)
        }
        this.currentPageName = pageName
      }
    },
    handleBack() {
      // 从历史栈中弹出上一页
      if (this.pageHistory.length > 0) {
        this.currentPageName = this.pageHistory.pop()!
      }
    },
    canGoBack() {
      return this.pageHistory.length > 0
    },
  })

  const pages: Record<string, IHelpPageData> = {
    // ==================== 首页 ====================
    home: {
      title: '动作编辑器帮助中心',
      content: [
        {
          type: 'h1',
          html: '🎬 动作编辑器帮助中心',
        },
        {
          type: 'p',
          html: '欢迎使用动作编辑器！本编辑器支持 <strong>URDF</strong>（机器人刚体模型）和 <strong>BVH</strong>（骨骼动画）两种格式的动作编辑。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '✨ 特色功能',
        },
        {
          type: 'cards-grid',
          cards: [
            {
              title: '🎮 3D视图交互',
              description: '直观的3D模型操作，支持多种摄像机模式和关节选择',
              image: HelpAssets.home.feature3D,
              onClick: () => help.value.handlePageChange('detailed-3d-view'),
            },
            {
              title: '📈 曲线编辑器',
              description: '专业的贝塞尔曲线编辑，支持5种控制柄类型',
              image: HelpAssets.home.featureCurve,
              onClick: () => help.value.handlePageChange('detailed-path-panel'),
            },
            {
              title: '▶️ 实时预览',
              description: '灵活的播放控制，支持倍速和跳帧播放',
              image: HelpAssets.home.featurePlayer,
              onClick: () => help.value.handlePageChange('detailed-player'),
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📚 文档导航',
        },
        {
          type: 'list-button',
          text: '一、核心功能总结',
          onClick: () => help.value.handlePageChange('core-features'),
        },
        {
          type: 'list-button',
          text: '二、详细功能说明',
          onClick: () => help.value.handlePageChange('detailed-features'),
        },
        {
          type: 'list-button',
          text: '三、快捷键速查表',
          onClick: () => help.value.handlePageChange('shortcuts'),
        },
        {
          type: 'list-button',
          text: '四、常见问题解答（FAQ）',
          onClick: () => help.value.handlePageChange('faq'),
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📮 表单反馈',
        },
        {
          type: 'p',
          html: '遇到问题或有改进建议？点击下方表单提交反馈，我们会尽快跟进处理。',
        },
        {
          type: 'button',
          html: '打开反馈表单',
          style: { minWidth: '160px' },
          onClick: () =>
            window.open(
              'https://f0exxg5fp6u.feishu.cn/share/base/form/shrcnayTNWJciplzH9UOmiAzhEe',
              '_blank'
            ),
        },
      ],
    },

    // ==================== 核心功能总结 ====================
    'core-features': {
      title: '核心功能总结',
      content: [
        {
          type: 'h2',
          html: '核心功能总结',
        },
        {
          type: 'p',
          html: '本编辑器提供了丰富的动作编辑功能，针对不同格式和使用场景进行了优化。',
        },
        {
          type: 'divider',
        },
        {
          type: 'list-button',
          text: '1.1 通用功能（URDF & BVH）',
          onClick: () => help.value.handlePageChange('core-features-common'),
        },
        {
          type: 'list-button',
          text: '1.2 URDF 专用功能',
          onClick: () => help.value.handlePageChange('core-features-urdf'),
        },
        {
          type: 'list-button',
          text: '1.3 BVH 专用功能',
          onClick: () => help.value.handlePageChange('core-features-bvh'),
        },
      ],
    },

    'core-features-common': {
      title: '通用功能',
      content: [
        {
          type: 'h2',
          html: '通用功能',
        },
        {
          type: 'p',
          html: '无论编辑 URDF 机器人动作还是 BVH 骨骼动画，以下功能均可使用：',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🎮 3D 视图交互',
        },
        {
          type: 'list',
          list: [
            '视角控制：鼠标左键旋转、中键平移、滚轮缩放',
            '关节高亮：鼠标悬停自动高亮关节并显示名称提示',
            '关节选择：点击关节自动在轨迹面板中定位对应字段',
            '3D 轨迹线：显示关节在空间中的运动轨迹，最多同时显示 4 条',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.common.mouseInteraction,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '👆 <strong>技巧</strong>：如果您找不到模型，可以尝试点击工具栏的"重置焦点"按钮，或按 F 键（如果已绑定）聚焦模型。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📈 轨迹面板',
        },
        {
          type: 'list',
          list: [
            '关键帧系统：支持添加/删除关键帧（快捷键 K）',
            '平滑删除：删除关键帧时自动调整相邻控制柄保持曲线平滑',
            '曲线编辑：5种控制柄类型（auto、auto_clamped、free、aligned、vector）',
            '数值精调：输入框直接修改数值，支持自定义步长',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.common.addKeyframeVideo,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '⚠️ <strong>注意</strong>：删除关键帧后，曲线形状可能会发生变化。建议使用"平滑删除"功能以尽可能保持动作连贯性。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '▶️ 播放控制',
        },
        {
          type: 'list',
          list: [
            '播放/暂停：空格键',
            '循环播放',
            '左右方向键逐帧切换（防抖间隔 16.66ms）',
            '倍速播放：0.1x - 10x',
            '跳帧播放：自定义刷新率',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.common.playerControls,
          style: { minHeight: '150px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '💾 数据管理',
        },
        {
          type: 'list',
          list: ['撤销：Ctrl + Z', '重做：Ctrl + Y', '保存导出：支持工程文件和标准格式导出'],
        },
        {
          type: 'image',
          src: HelpAssets.common.undoRedo,
          style: { minHeight: '150px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '💡 <strong>建议</strong>：在进行复杂编辑前，建议先保存一份工程文件备份，以防万一。',
        },
      ],
    },

    'core-features-urdf': {
      title: 'URDF 专用功能',
      content: [
        {
          type: 'h2',
          html: 'URDF 专用功能',
        },
        {
          type: 'p',
          html: '针对机器人刚体模型的编辑优化：',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🎯 精确角度控制',
        },
        {
          type: 'p',
          html: '每个关节自由度（DOF）独立编辑，提供精确到小数点后多位的角度控制。',
        },
        {
          type: 'image',
          src: HelpAssets.urdf.jointEdit,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
      ],
    },

    'core-features-bvh': {
      title: 'BVH 专用功能',
      content: [
        {
          type: 'h2',
          html: 'BVH 专用功能',
        },
        {
          type: 'p',
          html: '针对骨骼动画的编辑优化：',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🌐 旋转编辑球（JointQuatSphere）',
        },
        {
          type: 'p',
          html: '3D 球体交互界面，直观调整骨骼旋转：',
        },
        {
          type: 'list',
          list: ['通过右键菜单快速呼出/隐藏', '支持轴约束：限制只绕 X、Y 或 Z 轴旋转'],
        },
        {
          type: 'image',
          src: HelpAssets.bvh.bvh,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '🌟 <strong>推荐</strong>：在编辑 BVH 动作时，优先使用旋转编辑球，因为它内部使用四元数插值（Slerp），能产生比欧拉角更平滑自然的过渡。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🔄 四元数/欧拉角转换',
        },
        {
          type: 'p',
          html: '编辑器层提供友好的欧拉角可视化，底层使用四元数避免万向节死锁（Gimbal Lock）。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📊 分量编辑',
        },
        {
          type: 'list',
          list: [
            '独立编辑位置分量（X、Y、Z）',
            '独立编辑旋转分量（RX、RY、RZ）',
            '支持批量调整多个关键帧',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.bvh.componentEdit,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📤 标准 BVH 导出',
        },
        {
          type: 'p',
          html: '支持标准 BVH 骨骼层级结构导出，兼容主流动画软件。',
        },
      ],
    },

    // ==================== 详细功能说明 ====================
    'detailed-features': {
      title: '详细功能说明',
      content: [
        {
          type: 'h2',
          html: '详细功能说明',
        },
        {
          type: 'p',
          html: '深入了解编辑器各个模块的详细功能和使用方法。',
        },
        {
          type: 'divider',
        },
        {
          type: 'list-button',
          text: '2.1 3D 视图交互系统',
          onClick: () => help.value.handlePageChange('detailed-3d-view'),
        },
        {
          type: 'list-button',
          text: '2.2 轨迹面板（Timeline/Graph Editor）',
          onClick: () => help.value.handlePageChange('detailed-path-panel'),
        },
        {
          type: 'list-button',
          text: '2.3 播放控制系统',
          onClick: () => help.value.handlePageChange('detailed-player'),
        },
        {
          type: 'list-button',
          text: '2.4 四元数球编辑器',
          onClick: () => help.value.handlePageChange('detailed-quat-sphere'),
        },
        {
          type: 'list-button',
          text: '2.5 摄像机控制系统',
          onClick: () => help.value.handlePageChange('detailed-camera'),
        },
        {
          type: 'list-button',
          text: '2.6 数据管理',
          onClick: () => help.value.handlePageChange('detailed-data-management'),
        },
      ],
    },

    'detailed-3d-view': {
      title: '3D 视图交互系统',
      content: [
        {
          type: 'h2',
          html: '3D 视图交互系统',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📷 摄像机类型',
        },
        {
          type: 'p',
          html: '编辑器支持两种摄像机投影模式：',
        },
        {
          type: 'list',
          list: [
            '透视（Perspective）：符合真实视觉效果，近大远小',
            '正交（Orthographic）：无透视变形，适合精确测量和技术观察',
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🎯 摄像机跟随模式',
        },
        {
          type: 'p',
          html: '提供 3 种跟随模式满足不同观察需求：',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>模式编号</th>
                  <th>名称</th>
                  <th>说明</th>
                  <th>适用场景</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>0</td>
                  <td>默认</td>
                  <td>完全自由控制，用户可手动调整摄像机到任意位置和角度</td>
                  <td>静态模型观察、自由视角切换</td>
                </tr>
                <tr>
                  <td>1</td>
                  <td>固定距离和朝向</td>
                  <td>摄像机与模型保持固定的相对位置和方向，随模型移动而移动</td>
                  <td>观察完整动作流程、保持稳定视角</td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>仅固定朝向</td>
                  <td>摄像机朝向固定不变，但与模型的距离可以变化</td>
                  <td>从固定视角观察模型的位移和动作变化</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'note',
          html: '🖱️ <strong>操作提示</strong>：在"跟随模式"下，鼠标拖动视角不会打断跟随状态，可以自由调整观察角度。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '⚡ 缩放速度',
        },
        {
          type: 'list',
          list: ['范围：1-10（整数）', '默认值：1', '调节方式：拖动滑块或滚轮调节输入框'],
        },
        {
          type: 'image',
          src: HelpAssets.view3d.zoomSpeedSlider,
          style: { minHeight: '150px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📍 关节 3D 轨迹线',
        },
        {
          type: 'list',
          list: [
            '最大同时显示数量：4 条',
            '功能：以实线/虚线显示关节在空间中的历史和未来轨迹',
            '操作：左键点击关节打开菜单 → 显示/隐藏关节位置线',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.view3d.showHideTrajectoryVideo,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '✨ <strong>用途</strong>：轨迹线对于检查动作的流畅度和空间弧度非常有用，特别是调整摆臂或腿部运动时。',
        },
      ],
    },

    'detailed-path-panel': {
      title: '轨迹面板',
      content: [
        {
          type: 'h2',
          html: '轨迹面板（Timeline/Graph Editor）',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🔑 关键帧系统',
        },
        {
          type: 'list',
          list: [
            '添加/删除：K 键或点击关键帧按钮',
            '平滑删除：删除关键帧时自动调整相邻关键帧的控制柄',
            '多选操作：Ctrl 点击连续选择',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.pathPanel.keyframeInterface,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '📈 贝塞尔曲线控制柄',
        },
        {
          type: 'p',
          html: '<strong>5 种控制柄类型</strong>：',
        },
        {
          type: 'list',
          list: [
            'auto（自动）：系统自动计算控制柄方向和长度，左右控制柄镜像对齐',
            'auto_clamped（自动钳制）：类似 auto，但限制控制柄不超出相邻关键帧范围',
            'free（自由）：左右控制柄完全独立，可创建尖锐转折',
            'aligned（对齐）：左右控制柄方向相反但共线，长度可独立调整',
            'vector（向量）：控制柄指向下一个/上一个关键帧，创建线性过渡',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.pathPanel.handleTypesVideo,
          style: { minHeight: '250px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '💡 <strong>提示</strong>：要创建如"脚触地"或"撞击"等突变动作，请将关键帧控制柄设置为 <strong>Free</strong> 或 <strong>Vector</strong> 类型。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '⌨️ 轨迹面板快捷键',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>快捷键</th>
                  <th>功能</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>K</td>
                  <td>添加/删除关键帧</td>
                  <td>在当前帧位置切换关键帧状态</td>
                </tr>
                <tr>
                  <td>Delete</td>
                  <td>平滑删除</td>
                  <td>删除选中关键帧并保持曲线平滑</td>
                </tr>
                <tr>
                  <td>Escape</td>
                  <td>取消选择</td>
                  <td>清除关键帧选择或框选区间</td>
                </tr>
                <tr>
                  <td>. （句号）</td>
                  <td>聚焦选中关键帧</td>
                  <td>自动调整视图范围框选所有选中关键帧</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🎯 数值精调',
        },
        {
          type: 'list',
          list: [
            '当前帧数值：直接输入框修改',
            '调节步长：自定义步长单位（范围 0.0001 - 10）',
            '拖拽调节：在输入框上左右拖动鼠标快速调整',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.pathPanel.valueInput,
          style: { minHeight: '150px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
      ],
    },

    'detailed-player': {
      title: '播放控制系统',
      content: [
        {
          type: 'h2',
          html: '播放控制系统',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '⚡ 播放倍速',
        },
        {
          type: 'p',
          html: '支持 0.1x 到 10x 的倍速范围：',
        },
        {
          type: 'code',
          code: '0.1  0.2  0.3  0.4  0.5  0.6  0.7  0.8  0.9\n1    2    3    4    5    6    7    8    9    10',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '⏭️ 跳帧播放',
        },
        {
          type: 'list',
          list: [
            '功能：设置刷新率，跳过指定数量的帧',
            '用途：快速预览长动作 / 降低播放时 CPU/GPU 负载 / 检查动作整体节奏',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.player.refreshRateSettings,
          style: { minHeight: '150px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '⚠️ <strong>注意</strong>：跳帧播放仅影响预览效果，不会影响最终导出的动作数据。',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '⏱️ 帧切换防抖',
        },
        {
          type: 'list',
          list: ['间隔：16.66 毫秒（约 60 fps）', '作用：防止快速连按方向键导致性能问题'],
        },
      ],
    },

    'detailed-quat-sphere': {
      title: '四元数球编辑器',
      content: [
        {
          type: 'h2',
          html: '四元数球编辑器',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'ℹ️ 基本信息',
        },
        {
          type: 'list',
          list: [
            '位置：界面右侧悬浮面板',
            'URDF 模式：使用四元数（Quaternion）表示',
            'BVH 模式：使用欧拉角（Euler）表示，单位为度',
            '交互方式：鼠标拖拽球体改变旋转',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.quatSphere.interface,
          style: { minHeight: '250px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🎯 轴约束功能',
        },
        {
          type: 'p',
          html: '支持限制旋转只绕特定轴：',
        },
        {
          type: 'list',
          list: ['位置约束：X、Y、Z', '旋转约束：RX、RY、RZ', '取消约束：选择"无约束"选项'],
        },
        {
          type: 'image',
          src: HelpAssets.quatSphere.axisConstraint,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'note',
          html: '💡 <strong>技巧</strong>：使用轴约束可以精确调整特定方向的旋转，例如只调整头部的左右转动（Y轴），而不影响上下俯仰。',
        },
        {
          type: 'divider',
        },
      ],
    },

    'detailed-camera': {
      title: '摄像机控制系统',
      content: [
        {
          type: 'h2',
          html: '摄像机控制系统',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '🎯 焦点控制',
        },
        {
          type: 'list',
          list: [
            '快捷访问：顶部工具栏"摄像机焦点"按钮（瞄准镜图标）',
            '功能：将摄像机焦点立即对准模型中心',
            '用途：视角丢失时快速复位',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.camera.focusButton,
          style: { minHeight: '150px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '👁️ 视角预设',
        },
        {
          type: 'list',
          list: ['默认位置：面向模型的标准观察角度', '起始位置：播放开始时的摄像机位置'],
        },
        {
          type: 'image',
          src: HelpAssets.camera.viewPresets,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
      ],
    },

    'detailed-data-management': {
      title: '数据管理',
      content: [
        {
          type: 'h2',
          html: '数据管理',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: '💾 保存格式',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>格式</th>
                  <th>扩展名</th>
                  <th>包含内容</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>工程文件（URDF）</td>
                  <td>-</td>
                  <td>保留编辑状态（关键帧、控制柄等）</td>
                </tr>
                <tr>
                  <td>JSON 导出（URDF）</td>
                  <td>.json</td>
                  <td>仅包含采样后的帧数据（Baked）</td>
                </tr>
                <tr>
                  <td>工程文件（BVH）</td>
                  <td>-</td>
                  <td>保留编辑状态</td>
                </tr>
                <tr>
                  <td>BVH 导出</td>
                  <td>.bvh</td>
                  <td>标准 BVH 格式，包含骨骼层级和动作数据</td>
                </tr>
              </tbody>
            </table>
          `,
        },
      ],
    },

    // ==================== 快捷键速查表 ====================
    shortcuts: {
      title: '快捷键速查表',
      content: [
        {
          type: 'h2',
          html: ' 快捷键速查表',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: ' 全局快捷键',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>快捷键</th>
                  <th>功能</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>空格</td>
                  <td>播放/暂停</td>
                  <td>切换动作播放状态</td>
                </tr>
                <tr>
                  <td>/</td>
                  <td>上一帧/下一帧</td>
                  <td>逐帧浏览动作</td>
                </tr>
                <tr>
                  <td>Ctrl + Z</td>
                  <td>撤销</td>
                  <td>撤销上一步操作</td>
                </tr>
                <tr>
                  <td>Ctrl + Y</td>
                  <td>重做</td>
                  <td>重做被撤销的操作</td>
                </tr>
                <tr>
                  <td>F</td>
                  <td>摄像机聚焦模型</td>
                  <td>将模型位置设为摄像机焦点</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: ' 轨迹面板快捷键',
        },
        {
          type: 'p',
          html: '（仅在轨迹面板展开且焦点在面板上时生效）',
          style: { fontSize: '12px', opacity: 0.7 },
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>快捷键</th>
                  <th>功能</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>K</td>
                  <td>添加/删除关键帧</td>
                  <td>在当前帧切换关键帧状态</td>
                </tr>
                <tr>
                  <td>Delete</td>
                  <td>平滑删除关键帧</td>
                  <td>删除并保持曲线平滑</td>
                </tr>
                <tr>
                  <td>Escape</td>
                  <td>取消选择</td>
                  <td>清除关键帧选择</td>
                </tr>
                <tr>
                  <td>. （句号键）</td>
                  <td>聚焦选中关键帧</td>
                  <td>自动调整视图范围</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: ' 鼠标操作',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>操作</th>
                  <th>功能</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>左键拖拽（3D 视图）</td>
                  <td>旋转视角</td>
                  <td>环绕模型旋转</td>
                </tr>
                <tr>
                  <td>右键拖拽</td>
                  <td>平移视角</td>
                  <td>上下左右移动</td>
                </tr>
                <tr>
                  <td>滚轮</td>
                  <td>缩放视角</td>
                  <td>拉近/拉远</td>
                </tr>
                <tr>
                  <td>左键点击关节</td>
                  <td>打开关节菜单</td>
                  <td>快速访问关节功能</td>
                </tr>
                <tr>
                  <td>左键点击关节</td>
                  <td>选择字段</td>
                  <td>在轨迹面板中定位</td>
                </tr>
                <tr>
                  <td>拖拽控制柄</td>
                  <td>调整曲线</td>
                  <td>修改贝塞尔曲线形状</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'divider',
        },
      ],
    },

    // ==================== FAQ ====================
    faq: {
      title: '常见问题解答',
      content: [
        {
          type: 'h2',
          html: '❓ 常见问题解答（FAQ）',
        },
        {
          type: 'p',
          html: '根据您的使用水平选择对应的分类：',
        },
        {
          type: 'divider',
        },
        {
          type: 'list-button',
          text: '👶 针对小白用户',
          onClick: () => help.value.handlePageChange('faq-beginner'),
        },
        {
          type: 'list-button',
          text: '🎓 针对学生/初学者',
          onClick: () => help.value.handlePageChange('faq-student'),
        },
        {
          type: 'list-button',
          text: '🎨 针对动画师',
          onClick: () => help.value.handlePageChange('faq-animator'),
        },
        {
          type: 'list-button',
          text: '👨‍💻 针对专业用户/开发者',
          onClick: () => help.value.handlePageChange('faq-developer'),
        },
      ],
    },

    'faq-beginner': {
      title: '针对小白用户',
      content: [
        {
          type: 'h2',
          html: '👶 针对小白用户',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 为什么我用鼠标拖动模型关节，模型没有反应？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> 请检查以下几点：',
        },
        {
          type: 'list',
          list: [
            '播放状态：播放时无法编辑，请按空格键暂停',
            '关节类型：某些关节是固定的（Fixed Joint），无法拖动',
            '模型类型：确认模型已正确加载，检查控制台是否有错误信息',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.faq.playStatus,
          style: { minHeight: '150px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 怎么把现在的动作保存成视频发给别人？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> 编辑器目前仅支持导出动作数据文件（JSON/BVH），不直接支持视频导出。建议：',
        },
        {
          type: 'list',
          list: [
            'Windows：Win + G 开启 Xbox Game Bar',
            'macOS：Shift + Cmd + 5 开启屏幕录制',
            '跨平台：OBS Studio（免费开源）',
          ],
        },
        {
          type: 'p',
          html: '录制时建议：',
        },
        {
          type: 'list',
          list: [
            '隐藏不必要的 UI 元素（坐标轴、网格线等）',
            '调整到合适的播放倍速',
            '使用透视摄像机获得更自然的视觉效果',
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 画面太乱了，找不到模型在哪怎么办？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> 快速复位方法：',
        },
        {
          type: 'list',
          list: [
            '点击顶部工具栏的"摄像机焦点"按钮（瞄准镜图标），快速将视角对准模型中心',
            '或使用快捷键重置摄像机到默认位置',
            '如果模型完全不可见，检查模型是否已加载或透明度设置',
          ],
        },
      ],
    },

    'faq-student': {
      title: '针对学生/初学者',
      content: [
        {
          type: 'h2',
          html: '🎓 针对学生/初学者',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 我应该用 URDF 还是 BVH 模式？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> 根据应用场景选择：',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>场景类别</th>
                  <th>推荐格式</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>机械臂控制</td>
                  <td>URDF</td>
                  <td>精确的关节角度控制</td>
                </tr>
                <tr>
                  <td>双足/四足机器人步态</td>
                  <td>URDF</td>
                  <td>物理仿真友好</td>
                </tr>
                <tr>
                  <td>轨迹规划</td>
                  <td>URDF</td>
                  <td>便于程序化生成</td>
                </tr>
                <tr>
                  <td>虚拟主播/数字人</td>
                  <td>BVH</td>
                  <td>支持完整骨骼层级</td>
                </tr>
                <tr>
                  <td>游戏角色动画</td>
                  <td>BVH</td>
                  <td>业界标准格式</td>
                </tr>
                <tr>
                  <td>动捕数据清洗</td>
                  <td>BVH</td>
                  <td>直接兼容动捕设备</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 为什么导出的 JSON 文件里有很多小数位？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> 编辑器保留高精度浮点数（通常 6-8 位小数）以确保：',
        },
        {
          type: 'list',
          list: ['动作足够平滑', '累积误差最小', '插值计算精确'],
        },
        {
          type: 'p',
          html: '如需减小文件体积，可在导出后使用脚本处理：',
        },
        {
          type: 'code',
          code: `// 示例：保留 4 位小数
const roundedData = JSON.parse(jsonString).parsed.map(frame => {
  const newFrame = {}
  for (const [key, value] of Object.entries(frame)) {
    newFrame[key] = typeof value === 'number' 
      ? Math.round(value * 10000) / 10000 
      : value
  }
  return newFrame
})`,
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 什么是"平滑删除"？和普通删除有什么区别？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong>',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>操作类型</th>
                  <th>效果</th>
                  <th>适用场景</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>普通删除</td>
                  <td>直接移除关键帧，前后曲线可能突变</td>
                  <td>明确要打断动作的地方</td>
                </tr>
                <tr>
                  <td>平滑删除</td>
                  <td>删除关键帧，同时调整相邻控制柄保持形状</td>
                  <td>精简关键帧数量但保持动作流畅</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'p',
          html: '<strong>平滑删除原理：</strong>',
        },
        {
          type: 'list',
          list: [
            '分析被删除关键帧的曲线形状',
            '调整相邻关键帧的贝塞尔控制柄',
            '使新曲线尽可能接近原曲线',
            '保持删除前后的运动趋势',
          ],
        },
        {
          type: 'image',
          src: HelpAssets.faq.smoothDeleteVideo,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
      ],
    },

    'faq-animator': {
      title: '针对动画师',
      content: [
        {
          type: 'h2',
          html: '🎨 针对动画师',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 为什么调整曲线控制柄时，左右两边会一起动？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> 这是因为当前控制柄类型是 <strong>"auto"</strong>（自动）或 <strong>"aligned"</strong>（对齐）模式。',
        },
        {
          type: 'p',
          html: '<strong>解决方法：</strong>',
        },
        {
          type: 'list',
          list: [
            '在轨迹面板中选中关键帧',
            '在控制柄类型菜单中选择 "Free"（自由）',
            '现在可以独立调整左右控制柄，创建尖锐转折',
          ],
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>类型</th>
                  <th>左右控制柄关系</th>
                  <th>适用场景</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>auto</td>
                  <td>完全镜像</td>
                  <td>一般平滑运动</td>
                </tr>
                <tr>
                  <td>auto_clamped</td>
                  <td>镜像但限制范围</td>
                  <td>避免超调</td>
                </tr>
                <tr>
                  <td><strong>free</strong></td>
                  <td><strong>完全独立</strong></td>
                  <td><strong>尖锐转折、机械运动</strong></td>
                </tr>
                <tr>
                  <td>aligned</td>
                  <td>共线但长度独立</td>
                  <td>保持切线连续但不同曲率</td>
                </tr>
                <tr>
                  <td>vector</td>
                  <td>指向相邻关键帧</td>
                  <td>线性过渡</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'image',
          src: HelpAssets.faq.handleTypeSwitch,
          style: { minHeight: '200px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 如何在不改变动作节奏的情况下，整体增强或减弱某个动作幅度？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> 当前版本有以下方法：',
        },
        {
          type: 'p',
          html: '<strong>方法1：使用旋转编辑球（BVH 模式）</strong>',
        },
        {
          type: 'list',
          list: ['在关键姿态帧上使用旋转编辑球', '统一叠加旋转增量'],
        },
        {
          type: 'p',
          html: '<strong>方法2：数值输入框精调</strong>',
        },
        {
          type: 'list',
          list: ['选中极值点关键帧', '使用数值输入框按比例调整', '对称地调整另一侧极值点'],
        },
        {
          type: 'image',
          src: HelpAssets.faq.amplitudeAdjustmentVideo,
          style: { minHeight: '250px', backgroundColor: 'rgba(128, 128, 128, 0.2)' },
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 这里的轴向是局部坐标还是世界坐标？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong>',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>数据类型</th>
                  <th>坐标系</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>关节旋转</td>
                  <td><strong>局部坐标系</strong></td>
                  <td>相对于父骨骼/关节的旋转</td>
                </tr>
                <tr>
                  <td>根节点位移</td>
                  <td><strong>世界坐标系</strong></td>
                  <td>相对于场景原点的绝对位置</td>
                </tr>
                <tr>
                  <td>摄像机位置</td>
                  <td><strong>世界坐标系</strong></td>
                  <td>场景中的绝对位置</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'p',
          html: '<strong>注意事项：</strong>',
        },
        {
          type: 'list',
          list: [
            'URDF 模型的关节角度是局部的，链式累积计算末端位置',
            'BVH 模型的骨骼旋转也是局部的，但根节点位移是全局的',
            '编辑旋转时，实际影响的是骨骼的局部旋转矩阵',
          ],
        },
      ],
    },

    'faq-developer': {
      title: '针对专业用户/开发者',
      content: [
        {
          type: 'h2',
          html: '👨‍💻 针对专业用户/开发者',
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 我可以导入自己的 URDF 模型吗？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> <strong>可以</strong>，编辑器支持标准 URDF 格式。',
        },
        {
          type: 'p',
          html: '<strong>加载要求：</strong>',
        },
        {
          type: 'list',
          list: [
            '文件结构：URDF XML 文件 + mesh 文件（STL、OBJ、DAE 等）+ 材质贴图（可选）',
            '路径规范：推荐使用相对路径，避免绝对路径，支持 package:// 协议',
            '几何体支持：Box、Sphere、Cylinder、Mesh（STL、OBJ、DAE）',
          ],
        },
        {
          type: 'p',
          html: '<strong>常见问题排查：</strong>',
        },
        {
          type: 'code',
          code: `// 问题：Mesh 文件加载失败
// 解决：使用 urlModifier 映射路径
viewerStore.loadRobotWithUrlModifier(
  'https://example.com/robot.urdf',
  (url) => {
    if (url.startsWith('package://my_robot/')) {
      return url.replace('package://my_robot/', 'https://cdn.example.com/')
    }
    return url
  }
)`,
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 既然支持贝塞尔曲线，导出的数据包含控制点信息吗？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong> <strong>分两种情况</strong>：',
        },
        {
          type: 'table',
          html: `
            <table>
              <thead>
                <tr>
                  <th>导出方式</th>
                  <th>是否保留控制点</th>
                  <th>数据内容</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>标准格式导出</strong>（JSON/BVH）</td>
                  <td>❌ <strong>否</strong></td>
                  <td>采样后的帧数据（Baked）</td>
                </tr>
                <tr>
                  <td><strong>工程文件保存</strong></td>
                  <td>✅ <strong>是</strong></td>
                  <td>关键帧、控制柄、编辑状态</td>
                </tr>
              </tbody>
            </table>
          `,
        },
        {
          type: 'p',
          html: '<strong>技术说明：</strong>',
        },
        {
          type: 'list',
          list: [
            'Baking 过程：遍历所有帧 → 通过贝塞尔插值计算每帧数值 → 输出固定帧率采样数据',
            '为什么要 Bake：JSON/BVH 是标准交换格式，不支持曲线数据',
            '如何保留曲线：使用编辑器的"保存"功能（非"导出"），保存为工程文件格式',
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'h3',
          html: 'Q: 如何解决万向节死锁 (Gimbal Lock) 问题？',
        },
        {
          type: 'p',
          html: '<strong>A:</strong>',
        },
        {
          type: 'p',
          html: '<strong>什么是 Gimbal Lock：</strong>',
        },
        {
          type: 'list',
          list: [
            '使用欧拉角表示 3D 旋转时的固有问题',
            '当某个轴旋转到 ±90° 时，另外两个轴重合',
            '导致一个自由度丢失，无法表示某些旋转',
          ],
        },
        {
          type: 'p',
          html: '<strong>编辑器的解决方案：</strong>',
        },
        {
          type: 'p',
          html: '<strong>1. BVH 模式 - 优先使用旋转编辑球：</strong>',
        },
        {
          type: 'list',
          list: [
            '球体交互基于四元数，天然避免 Gimbal Lock',
            '转换为欧拉角时使用最优路径',
            '插值计算使用球形线性插值（Slerp）',
          ],
        },
        {
          type: 'p',
          html: '<strong>2. URDF 模式 - 天然避免：</strong>',
        },
        {
          type: 'list',
          list: ['关节角度是单自由度的，不存在 Gimbal Lock', '每个关节独立旋转，无欧拉角组合问题'],
        },
        {
          type: 'p',
          html: '<strong>最佳实践：</strong>',
        },
        {
          type: 'code',
          code: `姿态编辑优先级：
1. 旋转编辑球（BVH） > 直接拖动骨骼
2. 控制柄调整 > 直接修改数值
3. 分段编辑 > 一次性大幅度旋转`,
        },
      ],
    },
  }

  return help
}
