import { ref, type Ref } from 'vue'
import type { IPathPanel } from '../pathPanel/data'

export interface IDataPanel {
    show: boolean
    editedCurrentFrame: boolean
    handleItemClick: (fieldName: string) => void
}

interface DataPanelDependencies {
    selectedFieldStore: any
    pathPanel: Ref<IPathPanel>
}

export function createDataPanelData({
    selectedFieldStore,
    pathPanel
}: DataPanelDependencies) {

    /**
     * 左侧数据面板控制器
     * 
     * 管理动作编辑器左侧的数据面板，这个面板显示当前帧的所有关节角度和位置数据。
     * 用户可以在这里查看和编辑具体的数值，也可以点击字段名来在轨迹面板中查看该字段的变化曲线。
     * 
     * 主要功能：
     * 1. 控制数据面板的显示/隐藏
     * 2. 跟踪当前帧的编辑状态
     * 3. 处理字段点击事件，与轨迹面板联动
     * 
     * 这个面板是精确数值编辑的主要工具，适合需要精确控制关节角度的场景。
     */
    const dataPanel = ref({
        show: false,
        editedCurrentFrame: false,
        handleItemClick(fieldName: string) {
            selectedFieldStore.handleSelectField(fieldName)
            // 自动打开轨迹面板
            if (pathPanel.value.show === 0) {
                pathPanel.value.handleShowWithLoad()
            }
        }
    })
    return dataPanel
}