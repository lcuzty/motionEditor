<template>
  <!-- 无 UI 组件，仅作为逻辑容器 -->
  <slot></slot>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

/**
 * 开发者工具防护组件
 * 
 * 用于检测和阻止开发者工具的打开，保护生产环境的代码安全。
 * 该组件没有可见 UI，仅提供运行时防护逻辑。
 * 
 * 工作原理：
 * 1. 定期执行 debugger 语句
 * 2. 测量执行时间，如果超过阈值则认为开发者工具已打开
 * 3. 检测到后执行阻止措施（清空页面、跳转 about:blank）
 * 
 * 环境变量配置：
 * - VITE_ENABLE_DEVTOOLS_GUARD: 是否启用防护（默认 false）
 * - VITE_DEVTOOLS_GUARD_ENABLE_IN_DEV: 开发环境是否启用（默认 false）
 */

// ==================== 配置常量 ====================

/**
 * debugger 执行时间阈值（毫秒）
 * 超过此时间认为开发者工具已打开
 */
const DEVTOOLS_THRESHOLD_MS = 75

/**
 * 检测轮询间隔（毫秒）
 */
const DEVTOOLS_POLL_INTERVAL_MS = 50

// ==================== 环境变量读取 ====================

/**
 * 是否启用防护功能
 */
const guardFlag = 
  (import.meta.env.VITE_ENABLE_DEVTOOLS_GUARD ?? 'false') === 'true'

/**
 * 开发环境是否允许启用
 */
const allowInDev = 
  (import.meta.env.VITE_DEVTOOLS_GUARD_ENABLE_IN_DEV ?? 'false') === 'true'

/**
 * 最终是否启用防护
 * 生产环境启用，或者开发环境且配置了允许
 */
const isGuardEnabled = guardFlag && 
  (import.meta.env.MODE === 'production' || allowInDev)

// ==================== 核心函数 ====================

/**
 * 触发调试器断点
 * 使用 Function 构造函数确保生产构建不会移除 debugger 语句
 */
function triggerDebuggerBreakpoint(): void {
  try {
    // eslint-disable-next-line no-new-func
    debugger
  } catch (error) {
    // 忽略错误
  }
}

/**
 * 执行开发者工具阻止措施
 * 
 * 采取以下步骤：
 * 1. 修改 URL hash 为 #devtools-blocked
 * 2. 清空页面内容
 * 3. 跳转到 about:blank
 */
function enforceDevtoolsBlock(): void {
  // 1. 修改 URL hash
  try {
    history.replaceState(null, '', '#devtools-blocked')
  } catch (error) {
    // 忽略错误
  }

  // 2. 清空应用根节点内容
  try {
    const appRoot = document.getElementById('app')
    if (appRoot) {
      appRoot.innerHTML = ''
    }
  } catch (error) {
    // 忽略错误
  }

  // 3. 跳转到空白页
  try {
    window.location.replace('about:blank')
  } catch (error) {
    // 忽略错误
  }
}

// ==================== 生命周期钩子 ====================

let disposed = false
let timer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  // 检查是否启用防护
  if (!isGuardEnabled) {
    return
  }

  // 仅在浏览器环境执行
  if (typeof window === 'undefined') {
    return
  }

  // 检查是否被禁用（测试环境或手动禁用）
  if (
    (window as any).Cypress ||
    (window as any).__DEVTOOLS_GUARD_DISABLED__
  ) {
    return
  }

  // 重置标志
  disposed = false

  /**
   * 检测循环
   * 定期执行 debugger 并测量执行时间
   */
  const loop = () => {
    if (disposed) {
      return
    }

    timer = setTimeout(() => {
      // 记录开始时间
      const start = performance.now()
      console.log(123)
      // 触发调试器断点
      triggerDebuggerBreakpoint()
      
      // 计算执行耗时
      const elapsed = performance.now() - start

      // 如果耗时超过阈值，认为开发者工具已打开
      if (elapsed > DEVTOOLS_THRESHOLD_MS) {
        disposed = true
        
        // 清理定时器
        if (timer) {
          clearTimeout(timer)
          timer = null
        }

        // 执行阻止措施
        enforceDevtoolsBlock()
        return
      }

      // 继续下一轮检测
      loop()
    }, DEVTOOLS_POLL_INTERVAL_MS)
  }

  // 启动检测循环
  loop()
})

onUnmounted(() => {
  // 停止检测
  disposed = true
  
  // 清理定时器
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
})
</script>

<style scoped>
/* 无样式组件 */
</style>

