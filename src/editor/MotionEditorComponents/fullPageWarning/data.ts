import { ref, watch } from 'vue'

export type IFullPageWarningDependencies = {
  windowStore: any
}

export type IFullPageWarning = {
  show: boolean
  handleMax: () => void
  init: () => void
}

export function createFullPageWarningData(dependencies: IFullPageWarningDependencies) {
  const { windowStore } = dependencies
  const fullPageWarning = ref({
    show: false,
    handleMax() {
      windowStore.maximize()
    },
    init() {
      if (windowStore.editorSize.width < 650) {
        this.show = true
      }
      watch(
        () => windowStore.editorSize.width,
        (width, widthOld) => {
          if (width < 650 && widthOld >= 650) {
            this.show = true
          }
          if (width >= 650 && widthOld < 650) {
            this.show = false
          }
        }
      )
    },
  })

  return fullPageWarning
}
