<template>
  <div
    class="layer-load"
    :class="{
      'layer-load-hide': !windowStore.isLoading,
    }"
    :style="{
      'background-color': themeStore.isDark ? 'rgb(20,20,20)' : 'rgb(237,237,237)',
    }"
  >
    <!-- 顶部容器 -->
    <div class="container-top">
      <!-- 顶部右侧容器 -->
      <div class="flex-row-right">
        <!-- 最大化按钮 -->
        <div
          :title="windowStore.isMaximized ? '恢复' : '最大化'"
          @click="
            () => {
              if (windowStore.isMaximized) {
                windowStore.restore()
              } else {
                windowStore.maximize()
              }
            }
          "
          class="button-bg button-bg-square"
        >
          <div :class="`${!isDarkTheme ? 'button-slot-light' : ''}`" class="button-slot">
            <SVGWindowMax
              v-if="windowStore.isMaximized === false"
              class="svg-size"
              :style="{ color: themeStore.isDark ? '#fff' : '#000' }"
            />
            <SVGWindowNormal
              v-if="windowStore.isMaximized"
              class="svg-size"
              :style="{ color: themeStore.isDark ? '#fff' : '#000' }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 底部容器 -->
    <div v-if="isDev || 1" class="container-bottom">
      <button @click="() => handleSelectURDFAndStl()" v-if="selectStatus === 0">
        选择包含URDF文件和STL文件的文件夹
      </button>
      <button @click="() => handleSelectBVH()" v-if="selectStatus === 0">选择BVH文件</button>
      <button @click="() => handleSelectJSON()" v-if="selectStatus === 1">选择JSON动作文件</button>
    </div>

    <!-- 加载动画指示器 -->
    <div class="cl_1" :class="{ 'cl_1-light': isDarkTheme }">
      <!-- <el-icon class="loading-icon" :size="32" :color="themeStore.isDark ? '#fff' : 'rgb(138,162,255)'">
          <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" class="loading">
             <path fill="currentColor" d="M512 64a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V96a32 32 0 0 1 32-32zm0 640a32 32 0 0 1 32 32v192a32 32 0 1 1-64 0V736a32 32 0 0 1 32-32zm448-192a32 32 0 0 1-32 32H736a32 32 0 1 1 0-64h192a32 32 0 0 1 32 32zm-640 0a32 32 0 0 1-32 32H96a32 32 0 0 1 0-64h192a32 32 0 0 1 32 32zM195.2 195.2a32 32 0 0 1 45.248 0L376.32 331.008a32 32 0 0 1-45.248 45.248L195.2 240.448a32 32 0 0 1 0-45.248zm452.544 452.544a32 32 0 0 1 45.248 0L828.8 783.552a32 32 0 0 1-45.248 45.248L647.744 692.992a32 32 0 0 1 0-45.248zM828.8 195.264a32 32 0 0 1 0 45.184L692.992 376.32a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0zm-452.544 452.48a32 32 0 0 1 0 45.248L240.448 828.8a32 32 0 0 1-45.248-45.248l135.808-135.808a32 32 0 0 1 45.248 0z" />
          </svg>
       </el-icon> -->
    </div>
    <div class="loading-text-wrapper">
      <span
        class="loading-text-1"
        :style="{
          color: themeStore.isDark ? '#fff' : '#000',
        }"
        >{{ windowStore.isSettedData ? '正在加载' : '等待选择动作数据' }}</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

// SVG 图标导入
import SVGWindowMax from '@/assets/svg/motion-editor-window-max.svg'
import SVGWindowNormal from '@/assets/svg/motion-editor-window-normal.svg'
import { sf } from '../tools/motionEditorTools'
import { ElMessage } from 'element-plus'

// 定义 Props 接口
interface LoadingUIProps {
  windowStore: any
  themeStore: any
  isDarkTheme: boolean
  robotModelStore: any
  motionStore: any
}
// 接收 props
const props = defineProps<LoadingUIProps>()

// 解构 props 为局部变量
const { windowStore, themeStore, robotModelStore, motionStore } = props

const isDarkTheme = computed(() => props.isDarkTheme)
const isDev = process.env.NODE_ENV === 'development'

const selectStatus = ref(0)

const handleSelectBVH = async () => {
  windowStore.setIsLoadUserUploadData(true)
  let re = await pickSingleFile(['.bvh', '.BVH'])
  if (re) {
    let fileContent = await readFileTextFromBlobUrl(re.url)
    if (fileContent) {
      try {
        robotModelStore.setBVHContent(fileContent as string)
        robotModelStore.setIsBVH(true)
        selectStatus.value = 2
        windowStore.setIsSettedData(true)
      } catch (e) {
        ElMessage.error('加载BVH文件失败')
        console.error('加载BVH文件失败:', e)
      }
    } else {
      ElMessage.error('未选择BVH文件')
    }
  }
}

const handleSelectJSON = async () => {
  let re = await pickSingleFile(['.json', '.JSON'])
  if (re) {
    let fileContent = await readFileTextFromBlobUrl(re.url)
    if (fileContent) {
      try {
        motionStore.setMotionJSON(JSON.parse(fileContent as string))
        selectStatus.value = 2
        windowStore.setIsSettedData(true)
      } catch (e) {
        ElMessage.error('加载JSON文件失败')
        console.error('加载JSON文件失败:', e)
      }
    }
  }
}

const handleSelectURDFAndStl = async () => {
  windowStore.setIsLoadUserUploadData(true)
  let files = await pickDirectoryFiles()
  const stls: Record<string, string> = {}
  let urdfURL = null
  for (const item of files) {
    if (item.ext === 'stl') {
      stls[item.name + '.STL'] = item.url
    }
    if (item.ext === 'urdf') {
      urdfURL = item.url
    }
  }
  if (urdfURL) {
    try {
      robotModelStore.setURDFAndSTLUrls(urdfURL, stls)
      selectStatus.value = 1
    } catch (error) {
      ElMessage.error('加载URDF文件失败')
      console.error('加载URDF文件失败:', error)
    }
  } else {
    ElMessage.error('未选择URDF文件')
  }
}

type PickedFileInfo = {
  name: string
  url: string
  ext: string
}

// 生成文件信息（文件名不含路径和扩展名、blob URL、扩展名）
const buildFileInfo = (file: File): PickedFileInfo => {
  const fullName = file.name
  const lastDot = fullName.lastIndexOf('.')
  const ext = lastDot >= 0 ? fullName.slice(lastDot + 1).toLowerCase() : ''
  const name = lastDot >= 0 ? fullName.slice(0, lastDot) : fullName
  const url = URL.createObjectURL(file)
  return { name, url, ext }
}

// 选择文件夹，返回“最深层级”内所有文件的信息（文件名/Blob URL/扩展名）
const pickDirectoryFiles = async (): Promise<PickedFileInfo[]> => {
  // 首选原生目录选择器
  if ((window as any).showDirectoryPicker) {
    const dirHandle = await (window as any).showDirectoryPicker()
    const files: PickedFileInfo[] = []
    const walk = async (handle: any) => {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile()
          files.push(buildFileInfo(file))
        } else if (entry.kind === 'directory') {
          await walk(entry)
        }
      }
    }
    await walk(dirHandle)
    return files
  }

  // 兼容方案：使用隐藏 input + webkitdirectory
  return await new Promise<PickedFileInfo[]>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    ;(input as any).webkitdirectory = true
    input.onchange = () => {
      try {
        const files = Array.from(input.files || []).map(buildFileInfo)
        resolve(files)
      } catch (e) {
        reject(e)
      }
    }
    input.click()
  })
}

// 选择单个文件，可指定扩展名（例如 ['.json', '.bvh']）
const pickSingleFile = async (acceptExtensions: string[] = []): Promise<PickedFileInfo | null> => {
  return await new Promise<PickedFileInfo | null>((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = acceptExtensions.join(',')
    input.onchange = () => {
      try {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        resolve(buildFileInfo(file))
      } catch (e) {
        reject(e)
      }
    }
    input.click()
  })
}

// 输入文件的 Blob URL，返回文本内容；若非文本文件则返回 null
const readFileTextFromBlobUrl = async (blobUrl: string): Promise<string | null> => {
  try {
    const resp = await fetch(blobUrl)
    const blob = await resp.blob()
    const mime = (blob.type || '').toLowerCase()
    const isTextLike =
      !mime ||
      mime.startsWith('text/') ||
      mime.includes('json') ||
      mime.includes('xml') ||
      mime.includes('javascript')
    if (!isTextLike) return null
    return await blob.text()
  } catch (e) {
    return null
  }
}
</script>

<style scoped>
@import '../style.css';

.loading-icon-wrapper {
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
}

.loading-icon {
  animation: loading-rotate 2s linear infinite;
}

@keyframes loading-rotate {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.cl_1 {
  width: 30px;
  height: 30px;
  border: 2px solid #000;
  border-top-color: transparent;
  border-radius: 100%;
  animation: cl_1 infinite 0.75s linear;
  opacity: 0.6;
}
.cl_1-light {
  border: 2px solid #fff;
  border-top-color: transparent;
  border-radius: 100%;
  animation: cl_1 infinite 0.75s linear;
  opacity: 0.6;
}
@keyframes cl_1 {
  0% {
    transform: rotate(0);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
