import { ref, type Ref } from 'vue'
import type { IJointQuatSphere } from '../jointQuatSphere/data'

export interface IJointFloatingMenu {
    show: boolean
    jointName: string
    handleShow: (jointName: string) => void
    options: { title: string; onClick: () => void | Promise<void> }[]
    handleHide: () => void
}

interface FloatingMenuDependencies {
    getJointBaseName: (jointName: string) => string | null
    viewerStore: any
    jointPositionLine: Ref<any>
    viewer: Ref<any>
    robotModelStore: any
    selectedFieldStore: any
    getAvailableJointFields: (baseName: string, suffixes: string[]) => { field: string; label: string }[]
    jointQuatSphere: Ref<IJointQuatSphere>
}

export function createFloatingMenuData({
    getJointBaseName,
    viewerStore,
    jointPositionLine,
    viewer,
    robotModelStore,
    selectedFieldStore,
    getAvailableJointFields,
    jointQuatSphere
}: FloatingMenuDependencies){
    

const jointFloatingMenu = ref({
    show: false,
    jointName: '',
    handleShow(jointName: string) {
        this.jointName = jointName
        this.show = true
    },
    get options() {
        const options: { title: string; onClick: () => void | Promise<void> }[] = []
        const baseJointName = getJointBaseName(this.jointName)
        const targetJointName = baseJointName || this.jointName
        const isLineVisibleForJoint =
            viewerStore.isJointPositionLineVisible &&
            jointPositionLine.value.currentJointName === targetJointName

        // if (isLineVisibleForJoint) {
        //     options.push({
        //         title: '隐藏关节位置线',
        //         onClick: () => {
        //             jointPositionLine.value.handleHide()
        //             viewerStore.setJointPositionLineVisible(false)
        //             jointFloatingMenu.value.handleHide()
        //         }
        //     })
        // } else {
        //     const showTitle = viewerStore.isJointPositionLineVisible
        //         ? '切换到当前关节的位置线'
        //         : '显示关节位置线'
        //     options.push({
        //         title: showTitle,
        //         onClick: () => {
        //             jointPositionLine.value.showForJoint(targetJointName)
        //             jointFloatingMenu.value.handleHide()
        //         }
        //     })
        // }


        if (viewer.value.jointPositionLine3D.isLineThreeObjectsVisible(targetJointName)) {
            options.push({
                title: '隐藏关节位置线',
                onClick: () => {
                    viewer.value.jointPositionLine3D.hideLineThreeObjects(targetJointName)
                    jointFloatingMenu.value.handleHide()
                }
            })
        } else {
            if (viewer.value.jointPositionLine3D.showNum() < 4) {
                options.push({
                    title: '显示关节位置线',
                    onClick: () => {
                        viewer.value.jointPositionLine3D.showLineThreeObjects(targetJointName)
                        jointFloatingMenu.value.handleHide()
                    }
                })
            }
        }

        if (!robotModelStore.isBVH) {
            options.push({
                title: '编辑关节角度',
                onClick: () => {
                    selectedFieldStore.handleSelectField(jointFloatingMenu.value.jointName)
                    jointFloatingMenu.value.handleHide()
                }
            })
            return options
        }

        const baseName = baseJointName
        const appendedFields = new Set<string>()

        if (baseName) {
            const translationFields = getAvailableJointFields(baseName, ['_x', '_y', '_z'])
            if (translationFields.length > 0) {
                translationFields.forEach(({ field, label }) => {
                    appendedFields.add(field)
                    options.push({
                        title: `编辑分量 ${label}`,
                        onClick: () => {
                            selectedFieldStore.handleSelectField(field)
                            jointFloatingMenu.value.handleHide()
                        }
                    })
                })
            }

            const rotationFields = getAvailableJointFields(baseName, ['_rx', '_ry', '_rz'])
            if (rotationFields.length > 0) {
                rotationFields.forEach(({ field, label }) => {
                    appendedFields.add(field)
                    options.push({
                        title: `编辑旋转 ${label}`,
                        onClick: () => {
                            selectedFieldStore.handleSelectField(field)
                            jointFloatingMenu.value.handleHide()
                        }
                    })
                })
            }

            if (this.jointName && !appendedFields.has(this.jointName)) {
                options.push({
                    title: `编辑字段 (${this.jointName})`,
                    onClick: () => {
                        selectedFieldStore.handleSelectField(jointFloatingMenu.value.jointName)
                        jointFloatingMenu.value.handleHide()
                    }
                })
            }

            const isQuatSphereActive =
                jointQuatSphere.value.show && jointQuatSphere.value.jointName === baseName
            options.push({
                title: isQuatSphereActive ? '关闭旋转编辑球' : '打开旋转编辑球',
                onClick: async () => {
                    if (isQuatSphereActive) {
                        jointQuatSphere.value.handleHide()
                    } else {
                        await jointQuatSphere.value.handleShow(baseName)
                    }
                    jointFloatingMenu.value.handleHide()
                }
            })
        } else if (this.jointName) {
            options.push({
                title: `编辑字段 (${this.jointName})`,
                onClick: () => {
                    selectedFieldStore.handleSelectField(jointFloatingMenu.value.jointName)
                    jointFloatingMenu.value.handleHide()
                }
            })
        }

        return options
    },
    handleHide() {
        this.show = false
    }
})
return jointFloatingMenu
}