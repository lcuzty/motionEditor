<template>
  <div v-if="help.show" class="help-container" :style="{ color: textColor }">
    <!-- Header -->
    <div class="help-header">
      <div class="help-header-left">
        <div
          v-if="help.canGoBack()"
          class="button-bg button-bg-square button-round back-button close-button"
          @click="help.handleBack()"
          :title="'返回上一页'"
          style="margin-left: -8px"
        >
          <div
            class="button-slot button-round"
            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
          >
            <SVGBack
              class="svg-size"
              :style="{
                color: textColor,
              }"
              style="zoom: 0.6"
            />
          </div>
        </div>
        <div class="help-title">{{ pageData?.title }}</div>
      </div>

      <div style="flex: 1"></div>

      <!-- 设置按钮 -->
      <HoverTip position="bottom" :dark="isDarkTheme" :offset-x="-50">
        <div
          style="
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: -8px;
            width: 35px;
          "
        >
          <div
            class="button-bg button-bg-square button-round settings-button close-button"
            :class="{ 'close-button-light': !isDarkTheme }"
          >
            <div
              class="button-slot button-round"
              :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
            >
              <SVGSettings class="svg-size" :style="{ color: textColor }" style="zoom: 0.6" />
            </div>
          </div>
        </div>
        <template #hoverTemplate>
          <div
            class="do-not-show-toggle"
            @click="toggleDoNotShow"
            :title="doNotShow ? '点击恢复自动显示' : '点击设置为不再自动显示'"
          >
            <div class="toggle-checkbox" :class="{ checked: doNotShow }">
              <div class="toggle-checkbox-inner" v-if="doNotShow"></div>
            </div>
            <span class="toggle-text">不再自动显示</span>
          </div>
        </template>
      </HoverTip>

      <div
        class="button-bg button-bg-square button-round close-button"
        :class="{ 'close-button-light': !isDarkTheme }"
        @click="help.show = false"
        :title="'关闭'"
        style="margin-right: -8px"
      >
        <div class="button-slot button-round" :class="`${!isDarkTheme ? 'button-slot-light' : ''}`">
          <SVGClose
            class="svg-size"
            :style="{
              color: textColor,
            }"
            style="zoom: 0.6"
          />
        </div>
      </div>
    </div>

    <!-- Content - Multiple Pages Stack -->
    <div class="help-content">
      <!-- Render all pages in history + current page -->
      <div
        v-for="(pageName, pageIndex) in allVisiblePages"
        :key="pageName"
        class="help-page-layer"
        :class="{
          'help-page-layer-inactive': pageIndex < allVisiblePages.length - 1,
        }"
      >
        <ScrollView :is-dark="isDarkTheme" :scroll-y="true" style="width: 100%; height: 100%">
          <div class="help-content-inner">
            <template
              v-for="(item, index) in getPageContentByName(pageName)"
              :key="item.id || index"
            >
              <!-- Headers -->
              <h1 v-if="item.type === 'h1'" class="help-h1" v-html="item.html"></h1>
              <h2 v-else-if="item.type === 'h2'" class="help-h2" v-html="item.html"></h2>
              <h3 v-else-if="item.type === 'h3'" class="help-h3" v-html="item.html"></h3>
              <h4 v-else-if="item.type === 'h4'" class="help-h4" v-html="item.html"></h4>
              <h5 v-else-if="item.type === 'h5'" class="help-h5" v-html="item.html"></h5>
              <h6 v-else-if="item.type === 'h6'" class="help-h6" v-html="item.html"></h6>

              <!-- Paragraph -->
              <p v-else-if="item.type === 'p'" class="help-p" v-html="item.html"></p>

              <!-- List Button -->
              <div
                v-else-if="item.type === 'list-button'"
                class="help-list-button"
                :class="{ 'help-list-button-light': !isDarkTheme }"
                @click="item.onClick && item.onClick()"
                :style="item.style"
              >
                <span class="help-list-button-text">{{ item.text || item.html }}</span>
                <SVGArrowRight class="help-list-button-icon" :style="{ color: textColor }" />
              </div>

              <!-- Button -->
              <div v-else-if="item.type === 'button'" class="help-button-wrapper">
                <div
                  class="button-bg help-button"
                  :style="item.style"
                  @click="item.onClick && item.onClick()"
                >
                  <div
                    class="button-slot"
                    :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                    v-html="item.html"
                  ></div>
                </div>
              </div>

              <!-- Image -->
              <div v-else-if="item.type === 'image'" class="help-image-wrapper">
                <img
                  :src="item.src"
                  class="help-image"
                  :style="{ ...item.style, objectFit: 'contain', cursor: 'pointer' }"
                  @click="handleImageClick(item.src)"
                  title="点击在新标签页查看大图"
                />
              </div>

              <!-- Video -->
              <div v-else-if="item.type === 'video'" class="help-video-wrapper">
                <video controls :src="item.src" class="help-video" :style="item.style"></video>
              </div>

              <!-- List -->
              <ul v-else-if="item.type === 'list'" class="help-list" :style="item.style">
                <li v-for="(listItem, liIndex) in item.list" :key="liIndex">{{ listItem }}</li>
              </ul>

              <!-- Code -->
              <div v-else-if="item.type === 'code'" class="help-code-wrapper" :style="item.style">
                <pre
                  class="help-code-pre"
                  :class="{ 'help-code-pre-light': !isDarkTheme }"
                ><code>{{ item.code }}</code></pre>
              </div>

              <!-- Feature Card -->
              <div
                v-else-if="item.type === 'feature-card'"
                class="help-feature-card"
                :class="{ 'help-feature-card-light': !isDarkTheme }"
                @click="item.onClick && item.onClick()"
                :style="item.style"
              >
                <div v-if="item.image" class="feature-card-image-wrapper">
                  <img v-if="item.image" :src="item.image" class="feature-card-image" />
                </div>
                <h4 class="feature-card-title">{{ item.title }}</h4>
                <p class="feature-card-desc">{{ item.description }}</p>
              </div>

              <!-- Note/Tip (formerly placeholder-hint) -->
              <div
                v-else-if="item.type === 'note'"
                class="help-note"
                :class="{ 'help-note-light': !isDarkTheme }"
                :style="item.style"
              >
                <span v-html="item.html || item.text"></span>
              </div>

              <!-- Table -->
              <div
                v-else-if="item.type === 'table'"
                class="help-table-wrapper"
                :class="{ 'help-table-wrapper-light': !isDarkTheme }"
                :style="item.style"
              >
                <div v-html="item.html"></div>
              </div>

              <!-- Divider -->
              <div
                v-else-if="item.type === 'divider'"
                class="help-divider"
                :class="{ 'help-divider-light': !isDarkTheme }"
                :style="item.style"
              ></div>

              <!-- Cards Grid -->
              <div
                v-else-if="item.type === 'cards-grid'"
                class="help-cards-grid"
                :style="item.style"
              >
                <div
                  v-for="(card, cardIndex) in item.cards"
                  :key="cardIndex"
                  class="help-feature-card"
                  :class="{ 'help-feature-card-light': !isDarkTheme }"
                  @click="card.onClick && card.onClick()"
                >
                  <div v-if="card.image" class="feature-card-image-wrapper">
                    <img :src="card.image" class="feature-card-image" />
                  </div>
                  <h4 class="feature-card-title">{{ card.title }}</h4>
                  <p class="feature-card-desc">{{ card.description }}</p>
                </div>
              </div>
            </template>
          </div>
        </ScrollView>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { IHelpData } from './data'
import ScrollView from '../scrollView/UI.vue'
import SVGUndo from '@/assets/svg/motion-editor-undo.svg'
import SVGClose from '@/assets/svg/motion-editor-close.svg'
import SVGArrowRight from '@/assets/svg/motion-editor-frame-next.svg'
import SVGBack from '@/assets/svg/motion-editor-back.svg'
import SVGSettings from '@/assets/svg/motion-editor-settings.svg'
import HoverTip from '../hoverTip/UI.vue'

const props = defineProps<{
  help: IHelpData
  isDarkTheme: boolean
  textColor: string
}>()

// Do Not Show Again Logic
const doNotShow = ref(false)
const updateDoNotShowState = () => {
  doNotShow.value = !!localStorage.getItem('motion-editor-do-not-show-help')
}
// Initialize state
updateDoNotShowState()

const toggleDoNotShow = () => {
  if (doNotShow.value) {
    localStorage.removeItem('motion-editor-do-not-show-help')
  } else {
    localStorage.setItem('motion-editor-do-not-show-help', 'true')
  }
  updateDoNotShowState()
}

// 监听帮助面板的显示状态，关闭时清空历史栈
watch(
  () => props.help.show,
  newShow => {
    if (newShow) {
      updateDoNotShowState()
    } else {
      // 关闭时清空历史栈并返回首页
      props.help.pageHistory = []
      props.help.currentPageName = 'home'
    }
  }
)

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)

const pageData = computed(() => {
  return props.help.getPageData()
})

// 获取所有可见页面（历史栈 + 当前页）
const allVisiblePages = computed(() => {
  // 如果没有历史，只返回当前页
  if (props.help.pageHistory.length === 0) {
    return [props.help.currentPageName]
  }
  // 返回历史栈中的所有页面 + 当前页
  return [...props.help.pageHistory, props.help.currentPageName]
})

// 根据页面名称获取页面内容
const getPageContentByName = (pageName: string) => {
  return props.help.getPageDataByName(pageName)?.content || []
}

// 处理图片点击，在新标签页打开
const handleImageClick = (src?: string) => {
  if (src) {
    window.open(src, '_blank')
  }
}
</script>

<style scoped>
@import '../style.css';

.help-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-button {
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
}

.do-not-show-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  opacity: 0.8;
  transition: opacity 0.2s;
  white-space: nowrap;
  width: 100%;
}

.do-not-show-toggle:hover {
  opacity: 1;
}

.toggle-checkbox {
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1px;
  box-sizing: border-box;
}

.toggle-checkbox-inner {
  width: 8px;
  height: 8px;
  background-color: currentColor;
  border-radius: 1px;
}

.help-header {
  height: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.help-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-title {
  font-size: 14px;
  line-height: 1.1;
  width: 100%;
}

.back-button {
  cursor: pointer;
}

.close-button {
  cursor: pointer;
  background-color: transparent !important; /* Force transparent background initially */
  transition: background-color 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  width: 20px;
  height: 20px;
}

.close-button:hover {
  background-color: rgba(255, 255, 255, 0.1) !important;
}

.close-button:active {
  background-color: rgba(255, 255, 255, 0.15) !important;
}

/* Light mode overrides */
.close-button-light:hover {
  background-color: rgba(0, 0, 0, 0.05) !important;
}

.close-button-light:active {
  background-color: rgba(0, 0, 0, 0.1) !important;
}

.help-content {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* Page Layer Stack */
.help-page-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 1;
  pointer-events: all;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: inherit;
  z-index: 1;
}

.help-page-layer-inactive {
  opacity: 0;
  pointer-events: none;
  z-index: 0;
}

.help-content-inner {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Typography */
.help-h1 {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 4px;
}

.help-h2 {
  font-size: 18px;
  font-weight: bold;
  margin-top: 8px;
  margin-bottom: 6px;
}

.help-h3 {
  font-size: 16px;
  font-weight: bold;
  margin-top: 6px;
  margin-bottom: 4px;
}

.help-h4 {
  font-size: 14px;
  font-weight: bold;
  margin-top: 4px;
  margin-bottom: 4px;
}

.help-h5 {
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 2px;
}

.help-h6 {
  font-size: 12px;
  font-weight: bold;
  opacity: 0.8;
}

.help-p {
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.9;
}

/* List Button */
.help-list-button {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  user-select: none;
  background-color: transparent;
  border: 1px solid transparent;
}

.help-list-button:hover {
  background-color: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.help-list-button:active {
  background-color: rgba(255, 255, 255, 0.06);
  transform: translateX(2px);
}

.help-list-button-light:hover {
  background-color: rgba(0, 0, 0, 0.06);
}

.help-list-button-light:active {
  background-color: rgba(0, 0, 0, 0.05);
}

.help-list-button-text {
  font-size: 13px;
  font-weight: 500;
  text-align: left;
}

.help-list-button-icon {
  width: 18px;
  height: 18px;
  opacity: 0.6;
}

/* Button */
.help-button-wrapper {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.help-button {
  cursor: pointer;
  min-width: 80px;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.help-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.help-button:active {
  transform: translateY(0);
}

/* Media */
.help-image-wrapper,
.help-video-wrapper {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background-color: rgba(0, 0, 0, 0.2);
}

.help-image,
.help-video {
  width: 100%;
  height: auto;
  display: block;
}

/* List */
.help-list {
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.9;
}

.help-list li {
  margin-bottom: 4px;
  list-style-type: disc;
}

/* Code */
.help-code-wrapper {
  width: 100%;
}

.help-code-pre {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.4;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.help-code-pre-light {
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

/* Feature Card */
.help-feature-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  user-select: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.help-feature-card:hover {
  background-color: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-4px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
}

.help-feature-card:active {
  transform: translateY(-2px);
  transition: all 0.1s;
}

.help-feature-card-light {
  background-color: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.help-feature-card-light:hover {
  background-color: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

.feature-card-image-wrapper {
  width: 100%;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  background-color: rgba(128, 128, 128, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.feature-card-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.feature-card-title {
  font-size: 14px;
  font-weight: bold;
  margin: 0;
}

.feature-card-desc {
  font-size: 12px;
  opacity: 0.8;
  margin: 0;
  line-height: 1.4;
}

/* Note/Tip */
.help-note {
  font-size: 13px;
  opacity: 0.9;
  font-style: normal;
  padding: 10px 14px;
  background-color: rgba(255, 165, 0, 0.1);
  border-left: 3px solid rgba(255, 165, 0, 0.6);
  border-radius: 4px;
  margin: 8px 0;
  line-height: 1.5;
}

.help-note-light {
  background-color: rgba(255, 165, 0, 0.08);
  border-left-color: rgba(255, 165, 0, 0.6);
  color: rgba(0, 0, 0, 0.85);
}

/* Table */
.help-table-wrapper {
  width: 100%;
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.help-table-wrapper::-webkit-scrollbar {
  height: 8px;
}

.help-table-wrapper::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.help-table-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.help-table-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.help-table-wrapper table {
  width: 100%;
  min-width: 500px;
  border-collapse: collapse;
  font-size: 13px;
}

.help-table-wrapper th,
.help-table-wrapper td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.help-table-wrapper th {
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.05));
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.9);
  position: sticky;
  top: 0;
  z-index: 1;
}

.help-table-wrapper tbody tr {
  transition: background-color 0.2s;
}

.help-table-wrapper tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

.help-table-wrapper tr:last-child td {
  border-bottom: none;
}

.help-table-wrapper td strong {
  color: rgba(255, 255, 255, 1);
}

/* Light theme table styles */
.help-table-wrapper-light {
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.help-table-wrapper-light::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.03);
}

.help-table-wrapper-light::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

.help-table-wrapper-light::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.help-table-wrapper-light th,
.help-table-wrapper-light td {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.help-table-wrapper-light th {
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.03));
  color: rgba(0, 0, 0, 0.85);
}

.help-table-wrapper-light tbody tr:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.help-table-wrapper-light td strong {
  color: rgba(0, 0, 0, 0.95);
}

/* Divider */
.help-divider {
  width: 100%;
  height: 1px;
  background-color: rgba(255, 255, 255, 0.1);
  margin: 8px 0;
}

.help-divider-light {
  background-color: rgba(0, 0, 0, 0.1);
}

/* Cards Grid */
.help-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  width: 100%;
}
</style>
