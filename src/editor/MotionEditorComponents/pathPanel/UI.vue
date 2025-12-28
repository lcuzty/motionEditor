<template>
  <div
    v-if="pathPanel.show > 0"
    class="layer-path-board"
    :class="{
      'layer-path-board-show': pathPanel.show === 2,
      'layer-path-board-light': !isDarkTheme,
    }"
    :style="{
      height: `${pathPanel.height}px`,
    }"
  >
    <!-- 内部容器，实现边框效果 -->
    <div
      class="path-board-container"
      :class="{
        'path-board-container-light': !isDarkTheme,
      }"
    >
      <!-- 关节列表 -->
      <div
        class="path-board-left-list"
        :class="{
          'path-board-left-list-light': !isDarkTheme,
        }"
      >
        <ScrollView
          ref="pathPanelScrollRef"
          :scroll-y="true"
          :is-dark="isDarkTheme"
          class="path-board-scroll-view"
        >
          <div style="width: 100%; height: 8px"></div>
          <div class="path-board-joint-list">
            <div v-if="positionList.length" class="path-board-section">
              <div
                class="path-board-section-label"
                :class="{
                  'path-board-section-label-light': !isDarkTheme,
                }"
                :style="{ color: textColor }"
              >
                位置
              </div>
              <div
                :data-joint-name="item"
                @mouseenter="
                  () => {
                    props?.viewer?.setHoveredJoints([
                      item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0)),
                    ])
                  }
                "
                @mouseleave="
                  () => {
                    props?.viewer?.setHoveredJoints([])
                  }
                "
                @click="
                  () => {
                    selectedFieldStore.handleSelectField(item)
                  }
                "
                class="path-board-joint-item"
                v-for="item in positionList"
                :key="item"
                :class="{
                  button2: item !== selectedFieldStore.selectedFieldName,
                  button3: item === selectedFieldStore.selectedFieldName,
                  'button-hovered':
                    isDarkTheme &&
                    (!robotModelStore.isBVH ? item : item.slice(0, item.length - 2)) ===
                      selectedFieldStore.hoveredJointName,
                  'button-hovered-light':
                    !isDarkTheme &&
                    (!robotModelStore.isBVH ? item : item.slice(0, item.length - 2)) ===
                      selectedFieldStore.hoveredJointName,
                  'button2-light': !isDarkTheme && item !== selectedFieldStore.selectedFieldName,
                }"
              >
                <div
                  class="joint-item-name"
                  :style="{
                    color: item !== selectedFieldStore.selectedFieldName ? textColor : 'white',
                  }"
                >
                  <div
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: flex-start;
                      gap: 4px;
                    "
                  >
                    <span>
                      {{
                        getFieldNameDisplay(
                          (() => {
                            const arr = item.split(':')
                            if (arr.length === 1) {
                              return arr[0]
                            }
                            return arr[arr.length - 1]
                          })()
                        )
                      }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="attitudeList.length" class="path-board-section">
              <div
                class="path-board-section-label"
                :class="{
                  'path-board-section-label-light': !isDarkTheme,
                }"
                :style="{ color: textColor }"
              >
                姿态
              </div>
              <div
                :data-joint-name="item"
                @mouseenter="
                  () => {
                    props?.viewer?.setHoveredJoints([
                      item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0)),
                    ])
                  }
                "
                @mouseleave="
                  () => {
                    props?.viewer?.setHoveredJoints([])
                  }
                "
                @click="
                  () => {
                    selectedFieldStore.handleSelectField(item)
                  }
                "
                class="path-board-joint-item"
                v-for="item in attitudeList"
                :key="item"
                :class="{
                  button2: item !== selectedFieldStore.selectedFieldName,
                  button3: item === selectedFieldStore.selectedFieldName,
                  'button-hovered':
                    isDarkTheme &&
                    (!robotModelStore.isBVH ? item : item.slice(0, item.length - 2)) ===
                      selectedFieldStore.hoveredJointName,
                  'button-hovered-light':
                    !isDarkTheme &&
                    (!robotModelStore.isBVH ? item : item.slice(0, item.length - 2)) ===
                      selectedFieldStore.hoveredJointName,
                  'button2-light': !isDarkTheme && item !== selectedFieldStore.selectedFieldName,
                }"
              >
                <div
                  class="joint-item-name"
                  :style="{
                    color: item !== selectedFieldStore.selectedFieldName ? textColor : 'white',
                  }"
                >
                  <div
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: flex-start;
                      gap: 4px;
                    "
                  >
                    <span>
                      {{
                        getFieldNameDisplay(
                          (() => {
                            const arr = item.split(':')
                            if (arr.length === 1) {
                              return arr[0]
                            }
                            return arr[arr.length - 1]
                          })()
                        )
                      }}
                    </span>
                    <div
                      v-if="!isGlobalOrQuat(item) || robotModelStore.isBVH"
                      class="red-dot"
                      style="
                        display: inline-block;
                        width: 9px;
                        height: 9px;
                        background-color: red;
                        border-radius: 50%;
                        min-width: 9px;
                        min-height: 9px;
                      "
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="jointList.length" class="path-board-section">
              <div
                class="path-board-section-label"
                :class="{
                  'path-board-section-label-light': !isDarkTheme,
                }"
                :style="{ color: textColor }"
              >
                关节
              </div>
              <div
                :data-joint-name="item"
                @mouseenter="
                  () => {
                    props?.viewer?.setHoveredJoints([
                      item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0)),
                    ])
                  }
                "
                @mouseleave="
                  () => {
                    props?.viewer?.setHoveredJoints([])
                  }
                "
                @click="
                  () => {
                    selectedFieldStore.handleSelectField(item)
                  }
                "
                class="path-board-joint-item"
                v-for="item in jointList"
                :key="item"
                :class="{
                  button2: item !== selectedFieldStore.selectedFieldName,
                  button3: item === selectedFieldStore.selectedFieldName,
                  'button-hovered':
                    isDarkTheme &&
                    (!robotModelStore.isBVH ? item : item.slice(0, item.length - 2)) ===
                      selectedFieldStore.hoveredJointName,
                  'button-hovered-light':
                    !isDarkTheme &&
                    (!robotModelStore.isBVH ? item : item.slice(0, item.length - 2)) ===
                      selectedFieldStore.hoveredJointName,
                  'button2-light': !isDarkTheme && item !== selectedFieldStore.selectedFieldName,
                }"
              >
                <div
                  class="joint-item-name"
                  :style="{
                    color: item !== selectedFieldStore.selectedFieldName ? textColor : 'white',
                  }"
                >
                  <div
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: flex-start;
                      gap: 4px;
                    "
                  >
                    <span>
                      {{
                        (() => {
                          const arr = item.split(':')
                          if (arr.length === 1) {
                            return arr[0]
                          }
                          return arr[arr.length - 1]
                        })()
                      }}
                    </span>
                    <div
                      v-if="!isGlobalOrQuat(item)"
                      class="red-dot"
                      style="
                        display: inline-block;
                        width: 9px;
                        height: 9px;
                        background-color: red;
                        border-radius: 50%;
                        min-width: 9px;
                        min-height: 9px;
                      "
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollView>
      </div>
      <!-- 选中的关节图 -->
      <div
        class="path-board-right-chart"
        @mouseenter="
          () => {
            if (selectedFieldStore.selectedFieldName) {
              props?.viewer?.setHoveredJoints([
                selectedFieldStore.selectedFieldName.slice(
                  0,
                  selectedFieldStore.selectedFieldName.length - (robotModelStore.isBVH ? 2 : 0)
                ),
              ])
            }
          }
        "
        @mouseleave="
          () => {
            props?.viewer?.setHoveredJoints([])
          }
        "
      >
        <div v-if="selectedFieldStore.selectedFieldName !== null" class="path-board-chart-full">
          <!-- 标题栏 -->
          <div class="path-board-title-bar">
            <div class="path-board-title-content">
              <!-- 选中字段名称 -->
              <div
                class="path-board-field-name"
                :style="{
                  color: textColor,
                }"
              >
                <div
                  style="
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    gap: 8px;
                    position: relative;
                    z-index: 10;
                  "
                >
                  <HoverTip
                    :position="'bottom-right'"
                    :dark="isDarkTheme"
                    :offset-y="0"
                    :offset-x="-5"
                    v-if="robotModelStore.isBVH || (pathPanel.selectedFieldType || 0) < 2"
                  >
                    <div
                      style="
                        height: 100%;
                        width: 200px;
                        display: flex;
                        align-items: center;
                        justify-content: flex-start;
                        gap: 8px;
                      "
                    >
                      <div
                        v-if="
                          (!robotModelStore.isBVH && pathPanel.selectedFieldType === 1) ||
                          (robotModelStore.isBVH && pathPanel.selectedFieldType !== 0)
                        "
                        :title="robotModelStore.isBVH ? '打开关节旋转球' : '打开姿态旋转球'"
                        @click="() => {
                          // 从 selectedFieldName 提取关节名称
                          const fieldName = selectedFieldStore.selectedFieldName
                          if (!fieldName) return
                          
                          // 处理命名空间（如 'namespace:jointName_x'）
                          const parts = fieldName.split(':')
                          const lastPart = parts[parts.length - 1]
                          
                          // 去掉 _x/_y/_z 后缀得到关节名称
                          const jointName = lastPart.replace(/_(x|y|z)$/, '')
                          
                          if (jointName && jointQuatSphere) {
                            jointQuatSphere.handleShow(jointName)
                          }
                        }"
                        class="button-bg path-board-close-button button-round"
                        style="margin-right: 0px"
                      >
                        <div
                          :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                          class="button-slot path-board-button-slot"
                        >
                          <SVGRotate style="scale: 0.8" class="svg-size path-board-close-icon" />
                        </div>
                      </div>
                      <span>
                        {{
                          getFieldNameDisplay(
                            (() => {
                              const arr = selectedFieldStore.selectedFieldName.split(':')
                              if (arr.length === 1) {
                                return arr[0]
                              }
                              return arr[arr.length - 1]
                            })()
                          )
                        }}
                      </span>
                      <div
                        v-if="!isGlobalOrQuat(selectedFieldStore.selectedFieldName)"
                        class="red-dot"
                        style="
                          display: inline-block;
                          width: 9px;
                          height: 9px;
                          background-color: red;
                          border-radius: 50%;
                          min-width: 9px;
                          min-height: 9px;
                        "
                      ></div>
                    </div>

                    <template #hoverTemplate>
                      <div class="path-panel-field-tip">
                        <div class="path-panel-tip-label" :style="{ color: textColor }">
                          {{
                            (() => {
                              if (pathPanel.selectedFieldType === 0) return '位置'
                              if (pathPanel.selectedFieldType === 1 && !robotModelStore.isBVH)
                                return '四元数'
                              return '欧拉角'
                            })()
                          }}
                        </div>
                        <div class="path-panel-tip-buttons">
                          <div
                            v-for="btn in getSwitchButtons(pathPanel.field as string)"
                            :key="btn.label"
                            class="button-bg"
                            style="height: 24px; width: 100%; border-radius: 6px; overflow: hidden"
                            @click="btn.onClick"
                          >
                            <div
                              class="button-slot justify-center camera-type-slot"
                              :class="[
                                !isDarkTheme ? 'button-slot-light button2-light' : '',
                                btn.active ? 'camera-type-selected' : '',
                              ]"
                              :style="{ color: textColor }"
                              @mouseenter="btn.onHover"
                              @mouseleave="btn.onLeave"
                            >
                              {{ btn.label }}
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </HoverTip>
                  <!-- 保留非HoverTip情况下的显示（如未选中或不支持时，虽然v-if限制了） -->
                  <span v-if="!(robotModelStore.isBVH || (pathPanel.selectedFieldType || 0) < 2)">
                    {{
                      getFieldNameDisplay(
                        (() => {
                          const arr = selectedFieldStore.selectedFieldName.split(':')
                          if (arr.length === 1) {
                            return arr[0]
                          }
                          return arr[arr.length - 1]
                        })()
                      )
                    }}
                  </span>
                  <div
                    v-if="
                      !isGlobalOrQuat(selectedFieldStore.selectedFieldName) &&
                      !(robotModelStore.isBVH || (pathPanel.selectedFieldType || 0) < 2)
                    "
                    class="red-dot"
                    style="
                      display: inline-block;
                      width: 9px;
                      height: 9px;
                      background-color: red;
                      border-radius: 50%;
                      min-width: 9px;
                      min-height: 9px;
                    "
                  ></div>
                </div>
              </div>
              <!-- 靠右侧的按钮 -->
              <div class="flex-row-right">
                <!-- Y轴翻转 -->
                <!-- <div
                  @click="pathPanel.yFlip.change(!pathPanel.yFlip.enable)"
                  class="path-board-sync-frame"
                >
                  <SVGSelected class="svg-size icon-zoom-small" v-if="pathPanel.yFlip.enable" />
                  <SVGNotSelected class="svg-size icon-zoom-small" v-if="!pathPanel.yFlip.enable" />
                  <span
                    class="path-board-sync-text"
                    :style="{
                      color: textColor,
                    }"
                    >Y轴翻转</span
                  >
                </div> -->
                <!-- 绘制的时候切换帧 -->
                <!-- <div
                  @click="pathPanel.move.syncFrameIndex = !pathPanel.move.syncFrameIndex"
                  class="path-board-sync-frame"
                >
                  <SVGSelected
                    class="svg-size icon-zoom-small"
                    v-if="pathPanel.move.syncFrameIndex"
                  />
                  <SVGNotSelected
                    class="svg-size icon-zoom-small"
                    v-if="!pathPanel.move.syncFrameIndex"
                  />
                  <span
                    class="path-board-sync-text"
                    :style="{
                      color: textColor,
                    }"
                    >绘制时切换帧</span
                  >
                </div> -->
                <!-- 关闭轨迹面板按钮 -->
                <div
                  :title="'关闭轨迹面板'"
                  @click="
                    () => {
                      pathPanel.handleHide()
                    }
                  "
                  class="button-bg path-board-close-button button-round"
                  style="margin-right: 8px"
                >
                  <div
                    :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                    class="button-slot path-board-button-slot"
                  >
                    <SVGClose style="scale: 0.8" class="svg-size path-board-close-icon" />
                  </div>
                </div>
              </div>
            </div>
            <div class="path-board-center-buttons">
              <!-- 复制按钮 -->
              <!-- <div
                :title="'复制当前帧'"
                @click="() => pathPanel.handleCopy()"
                class="button-bg path-board-action-button"
              >
                <div
                  :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                  class="button-slot path-board-button-slot"
                >
                  <SVGCopy class="svg-size path-board-action-icon" />
                </div>
              </div> -->

              <!-- 删除按钮 -->
              <!-- <div
                :title="'删除当前帧'"
                @click="() => pathPanel.handleDelete()"
                class="button-bg path-board-action-button"
              >
                <div
                  :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                  class="button-slot path-board-button-slot"
                >
                  <SVGDelete class="svg-size path-board-action-icon" />
                </div>
              </div> -->

              <!-- 取消关键帧并平滑按钮 -->
              <div
                :title="'取消关键帧并平滑'"
                @click="() => pathPanel.handleSmoothDelete()"
                class="button-bg path-board-action-button"
              >
                <div
                  class="button-slot path-board-button-slot"
                  :class="{
                    'button-slot-light': !isDarkTheme,
                    'button2-light': !isDarkTheme,
                  }"
                >
                  <SVGDelete style="scale: 0.75" class="svg-size path-board-action-icon" />
                </div>
              </div>

              <!-- 取消选区按钮 -->
              <div
                v-if="pathPanel.selectionCount > 0"
                :title="'取消选择'"
                @click="
                  () => {
                    pathPanel.clearKeyframeSelection?.()
                  }
                "
                class="button-bg path-board-action-button"
              >
                <div
                  class="button-slot path-board-button-slot"
                  :class="{
                    'button-slot-light': !isDarkTheme,
                    'button2-light': !isDarkTheme,
                  }"
                >
                  <SVGClose class="svg-size path-board-action-icon" />
                </div>
              </div>

              <!-- 关键帧按钮 -->
              <div
                :title="
                  pathPanel.keyframe.isCurrentKeyframe() ? '删除关键帧 (K)' : '添加关键帧 (K)'
                "
                @click="() => pathPanel.keyframe.toggleCurrent()"
                class="button-bg path-board-action-button"
              >
                <div
                  :class="[
                    'button-slot',
                    'path-board-button-slot',
                    {
                      'button-slot-light': !isDarkTheme,
                      'button2-light': !isDarkTheme,
                      'path-board-key-button-active': pathPanel.keyframe.isCurrentKeyframe(),
                    },
                  ]"
                >
                  <span class="path-board-keyframe-button-label">K</span>
                </div>
              </div>

              <!-- 控制柄类型菜单 -->
              <HoverTip
                :position="'bottom'"
                :persist-on-panel="true"
                :close-delay="120"
                :dark="isDarkTheme"
              >
                <template #default>
                  <div
                    style="
                      height: 32px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                    "
                  >
                    <div
                      :class="[
                        'button-bg path-board-action-button',
                        { 'path-board-button-disabled': handleTypeDisabled },
                      ]"
                      :title="`控制柄类型：${pathPanel.keyframe.currentHandleType}`"
                    >
                      <div
                        class="button-slot path-board-button-slot"
                        :class="{
                          'button-slot-light': !isDarkTheme,
                          'button2-light': !isDarkTheme,
                        }"
                      >
                        <span class="path-board-action-icon path-board-handle-type-icon">
                          {{
                            (() => {
                              const type = pathPanel.keyframe.currentHandleType
                              const namesp = type.split('_')
                              if (namesp.length === 1) {
                                return namesp[0].slice(0, 2).toLocaleUpperCase()
                              }
                              return (
                                namesp[0].slice(0, 1).toLocaleUpperCase() +
                                namesp[1].slice(0, 1).toLocaleUpperCase()
                              )
                            })()
                          }}
                        </span>
                      </div>
                    </div>
                  </div>
                </template>
                <template #hoverTemplate>
                  <div class="pathpanel-menu-panel">
                    <div
                      style="height: 24px"
                      :class="['button-bg', { 'path-board-button-disabled': handleTypeDisabled }]"
                      v-for="type in pathPanel.keyframe.handleTypes"
                      :key="type"
                      @click="() => selectHandleType(type)"
                    >
                      <div
                        class="button-slot justify-start"
                        :class="[
                          `${!isDarkTheme ? 'button-slot-light' : ''}`,
                          pathPanel.keyframe.currentHandleType === type
                            ? 'camera-track-selected'
                            : '',
                        ]"
                      >
                        {{ type }}
                      </div>
                    </div>
                  </div>
                </template>
              </HoverTip>

              <!-- 当前帧数值精调 -->
              <template v-if="windowStore.editorSize.width > 850">
                <span
                  style="font-size: 12px; margin-left: 8px"
                  :style="{
                    color: textColor,
                  }"
                  >单位</span
                >
                <NumberInput
                  :drag-pixel-per-step="pathPanel.frameValueControl.minUnit"
                  :dark="isDarkTheme"
                  :model-value="pathPanel.frameValueControl.unitValue"
                  :step="pathPanel.frameValueControl.minUnit"
                  :min="pathPanel.frameValueControl.minUnit"
                  :max="pathPanel.frameValueControl.maxUnit"
                  :middle-width="70"
                  :precision="4"
                  @update:modelValue="pathPanel.frameValueControl.setUnitValue"
                />
                <span
                  style="font-size: 12px; margin-left: 4px"
                  :style="{
                    color: textColor,
                  }"
                  >当前帧</span
                >
                <NumberInput
                  :drag-pixel-per-step="pathPanel.frameValueControl.unitValue"
                  :dark="isDarkTheme"
                  :model-value="pathPanel.frameValueControl.value"
                  :step="pathPanel.frameValueControl.unitValue"
                  :middle-width="70"
                  :precision="pathPanel.frameValueControl.precision"
                  :min="limitRange.min ?? undefined"
                  :max="limitRange.max ?? undefined"
                  :disabled="!pathPanel.frameValueControl.editable"
                  @update:modelValue="pathPanel.frameValueControl.setValue"
                  :allow-exceed="true"
                />
              </template>

              <!-- <div class="path-board-keyframe-legend">
                <span
                  class="path-board-keyframe-dot"
                  :style="{ backgroundColor: pathPanel.keyframe.color }"
                ></span>
                <span class="path-board-keyframe-label" :style="{ color: textColor }">关键帧</span>
              </div> -->
            </div>
          </div>
          <!-- 轨迹图容器 -->
          <div class="path-board-chart-container">
            <div class="path-board-chart-wrapper">
              <!-- 图表 -->
              <div
                @mousemove="
                  (e: MouseEvent) => {
                    const chartEvent = e as any
                    chartEvent.isContainer = true
                    pathPanel.move.handleMove(chartEvent)
                  }
                "
                id="path-board-chart"
                class="path-board-chart"
                style="position: relative"
              >
                <div v-if="0" class="path-board-right-scroll-container">
                  <div
                    style="
                      width: 100%;
                      height: 40px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      position: absolute;
                      left: 0;
                      bottom: 0;
                    "
                  >
                    <!-- 设置按钮 -->
                    <div class="menu-button-wrapper">
                      <div
                        :title="'轨迹图设置'"
                        @click="
                          () => {
                            pathPanel.multiple.showMenu = !pathPanel.multiple.showMenu
                          }
                        "
                        class="button-bg button-bg-small"
                        style="margin: 0"
                      >
                        <div
                          :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                          class="button-slot"
                        >
                          <SVGSettings style="zoom: 0.4" class="svg-size" />
                        </div>
                      </div>
                      <div
                        class="menu-container menu-position-left-top"
                        :class="{
                          'menu-container-hide': !pathPanel.multiple.showMenu,
                          'menu-container-light': !isDarkTheme,
                        }"
                      >
                        <div
                          class="button-bg"
                          :class="{
                            'button-disabled': !pathPanel.multiple.showMenu,
                          }"
                          @click="
                            () => {
                              pathPanel.multiple.mode = 0
                              pathPanel.multiple.showMenu = false
                            }
                          "
                        >
                          <div
                            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                            class="button-slot justify-start"
                          >
                            缩放轨迹{{ pathPanel.multiple.mode === 0 ? '（当前）' : '' }}
                          </div>
                        </div>
                        <div
                          class="button-bg"
                          :class="{
                            'button-disabled': !pathPanel.multiple.showMenu,
                          }"
                          @click="
                            () => {
                              pathPanel.multiple.mode = 1
                              pathPanel.multiple.showMenu = false
                            }
                          "
                        >
                          <div
                            :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                            class="button-slot justify-start"
                          >
                            平移轨迹{{ pathPanel.multiple.mode === 1 ? '（当前）' : '' }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    id="path-board-scroll-bar-right"
                    class="path-board-left-scroll-track"
                    :class="{
                      'path-board-left-scroll-track-light': !isDarkTheme,
                    }"
                  >
                    <div
                      class="path-board-right-scroll-offset-main"
                      :style="{
                        transform: 'translateY(50%)',
                      }"
                    >
                      <div
                        @mousedown="e => pathPanel.multiple.handleStart(e)"
                        class="path-board-right-scroll-offset-main-drag"
                        :class="{
                          'path-board-right-scroll-offset-main-drag-light': !isDarkTheme,
                        }"
                        :style="{
                          transform: `translate(-50%, ${pathPanel.multiple.position - 2.5}px)`,
                        }"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
              <!-- 滚动条 -->
              <div class="path-board-bottom-scroll-bar">
                <!-- 当前位置数字显示 -->
                <div class="path-board-position-info">
                  <span
                    :style="{
                      color: textColor,
                    }"
                    v-if="pathPanel.move.currentX !== null"
                    >X {{ pathPanel.move.currentX }}</span
                  >
                  <span
                    :style="{
                      color: textColor,
                    }"
                    v-if="pathPanel.move.currentY !== null"
                    >Y {{ pathPanel.move.currentY }}</span
                  >

                  <div
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      gap: 6px;
                      position: absolute;
                      right: 0;
                      top: 0;
                      height: 100%;
                      width: 72px;
                    "
                  >
                    <!-- 纵向重置按钮 -->
                    <div
                      :class="{
                        'button-disabled': pathPanel.isYAxisDefault(),
                      }"
                      :title="'重置纵坐标区间'"
                      @click="
                        () => {
                          pathPanel.resetYAxis()
                        }
                      "
                      class="button-bg button-bg-small"
                      style="margin: 0"
                    >
                      <div
                        :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                        class="button-slot"
                      >
                        <SVGReset style="zoom: 0.4" class="svg-size" />
                      </div>
                    </div>

                    <!-- 横向重置按钮 -->
                    <div
                      :class="{
                        'button-disabled': pathPanel.location.isFullDisplay(),
                      }"
                      :title="'重置横坐标区间'"
                      @click="
                        () => {
                          pathPanel.location.reset()
                        }
                      "
                      class="button-bg button-bg-small"
                      style="margin: 0"
                    >
                      <div
                        :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                        class="button-slot"
                      >
                        <SVGReset style="zoom: 0.4" class="svg-size" />
                      </div>
                    </div>
                  </div>
                </div>
                <!-- 当前位置滚动条 -->
                <div class="path-board-scroll-wrapper">
                  <!-- 滚动条容器 -->
                  <div
                    id="path-board-scroll-bar"
                    ref="pathBoardScrollBar"
                    class="path-board-scroll-track-bottom"
                    :class="{
                      'path-board-scroll-track-bottom-light': !isDarkTheme,
                    }"
                  >
                    <!-- 滚动条 -->
                    <div
                      @mousedown="
                        () => {
                          pathPanel.location.mousemove.handleStart()
                        }
                      "
                      :title="`${pathPanel.location.startFrameIndex + 1} ~ ${pathPanel.location.startFrameIndex + parseInt(`${pathPanel.location.size}`)} (${pathPanel.location.size})`"
                      class="path-board-scroll-thumb-bottom"
                      :class="{
                        'path-board-scroll-thumb-bottom-light': !isDarkTheme,
                      }"
                      :style="{
                        left: `${pathPanel.location.getScrollLeft()}px`,
                        width: `${pathPanel.location.getScrollSizePer() * 100}%`,
                        transition: pathPanel.location.disableScrollAnim
                          ? ''
                          : 'width .3s cubic-bezier(0.1, 0.9, 0.2, 1), left .3s cubic-bezier(0.1, 0.9, 0.2, 1)',
                      }"
                    >
                      <div
                        class="button-bg path-board-scroll-thumb-bg"
                        :class="{
                          'button-disabled': pathPanel.location.getScrollSizePer() === 1,
                        }"
                        style="backdrop-filter: blur(10px)"
                      >
                        <div
                          @mousedown="
                            (e: MouseEvent) => pathPanel.location.edge.handleStart(e, true)
                          "
                          class="path-panel-location-bottom-edge-left path-panel-location-edge"
                        ></div>
                        <div
                          @mousedown="(e: MouseEvent) => pathPanel.location.edge.handleStart(e)"
                          class="path-panel-location-bottom-edge-right path-panel-location-edge"
                        ></div>
                        <div
                          :class="`${!isDarkTheme ? 'button-slot-light' : ''}`"
                          class="button-slot path-board-scroll-thumb-slot"
                        >
                          <div
                            class="path-board-scroll-thumb-text"
                            :style="{
                              color: textColor,
                            }"
                          >
                            {{
                              pathPanel.location.getScrollSizePer() === 1
                                ? `已显示全部帧（${motionStore.getFrameCount()}）`
                                : `${pathPanel.location.startFrameIndex + 1} ~ ${pathPanel.location.startFrameIndex + Number(pathPanel.location.size)} (${pathPanel.location.size})`
                            }}
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- 当前播放位置指示 -->
                    <div
                      class="path-board-play-indicator"
                      :style="{
                        left:
                          'calc((100% - 1px) * ' +
                          motionStore.getCurrentFrameProgress().default +
                          ')',
                      }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="path-board-chart-scroll-container"></div>
          </div>
        </div>
      </div>
    </div>
    <!-- resizer -->
    <div
      @mousedown="(e: MouseEvent) => pathPanel.resize.handleStart(e)"
      class="path-board-height-resizer"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { IPathPanel } from './data'
import NumberInput from '../numberInput/UI.vue'
import HoverTip from '../hoverTip/UI.vue'
import ScrollView from '../scrollView/UI.vue'

// SVG 图标导入
import SVGSelected from '@/assets/svg/motion-editor-path-board-sync-frame-selected.svg'
import SVGNotSelected from '@/assets/svg/motion-editor-path-board-sync-frame-selected-off.svg'
import SVGClose from '@/assets/svg/motion-editor-close.svg'
import SVGCopy from '@/assets/svg/motion-editor-path-board-copy.svg'
import SVGDelete from '@/assets/svg/motion-editor-delete.svg'
import SVGReset from '@/assets/svg/motion-editor-reset.svg'
import SVGSettings from '@/assets/svg/motion-editor-settings.svg'
import SVGRotate from '@/assets/svg/motion-editor-rotate.svg'

// 定义 Props 接口
interface PathPanelUIProps {
  pathPanel: IPathPanel
  isDarkTheme: boolean
  textColor: string
  viewer: any | null
  robotModelStore: any
  selectedFieldStore: any
  motionStore: any
  windowStore: any
  jointQuatSphere: any
}

// 接收 props
const props = defineProps<PathPanelUIProps>()

// 解构 props 为局部变量（可选，保持原代码风格）
const { pathPanel, viewer, robotModelStore, selectedFieldStore, motionStore, windowStore, jointQuatSphere } = props

const isDarkTheme = computed(() => props.isDarkTheme)
const textColor = computed(() => props.textColor)

const isGlobalOrQuat = (name: string) =>
  !!name && (name.startsWith('global_') || name.startsWith('quater_'))

const orientationFieldName = computed(() => {
  const adapt = motionStore.motionData?.bvhAdapt
  if (!adapt || typeof adapt !== 'object') return ''
  return (adapt as { orientationFieldName?: string }).orientationFieldName || ''
})

const isPositionField = (name: string) => !!name && name.startsWith('global_')
const isBVHOrientationField = (name: string) =>
  robotModelStore.isBVH &&
  !!orientationFieldName.value &&
  !!name &&
  name.startsWith(`${orientationFieldName.value}_`)
const isAttitudeField = (name: string) => {
  if (!name) return false
  if (robotModelStore.isBVH) return isBVHOrientationField(name)
  return name.startsWith('quater_')
}

const allFields = computed(() => (motionStore.getJointNames?.() as string[]) || [])
const positionList = computed(() => allFields.value.filter(item => isPositionField(item)))
const attitudeList = computed(() => allFields.value.filter(item => isAttitudeField(item)))
const jointList = computed(() =>
  allFields.value.filter(item => !isPositionField(item) && !isAttitudeField(item))
)
// 只要存在选中关键帧即可操作控制柄类型
const handleTypeDisabled = computed(() => pathPanel.selectionCount === 0)

const limitRange = computed(() => {
  const lines = pathPanel.limitLines
  if (!Array.isArray(lines) || !lines.length)
    return { min: null as number | null, max: null as number | null }
  const nums = lines.filter(v => typeof v === 'number' && Number.isFinite(v)) as number[]
  if (!nums.length) return { min: null, max: null }
  return { min: Math.min(...nums), max: Math.max(...nums) }
})

// Refs
const pathPanelScrollRef = ref<HTMLElement | null>(null)
const pathBoardScrollBar = ref<HTMLElement | null>(null)
const selectHandleType = (type: 'auto' | 'auto_clamped' | 'free' | 'aligned' | 'vector') => {
  if (handleTypeDisabled.value) return
  pathPanel.keyframe.setHandleType(type)
}

function getFieldNameDisplay(fieldName: string) {
  if (fieldName.includes('quater')) return `quaternion_${fieldName.slice(-2)}`
  if (fieldName.includes('global')) return `position_${fieldName.slice(-2)}`
  return fieldName
}

/**
 * 快速切换按钮配置
 */
const getSwitchButtons = (fieldName: string) => {
  if (!fieldName) return []

  const createButton = (label: string, active: boolean, targetField: string) => ({
    label,
    active,
    onClick: () => {
      if (active) return
      // 使用选区 Store 进行统一的字段切换
      selectedFieldStore.handleSelectField(targetField)
    },
    onHover: () => {
      // 3D 预览高亮：逻辑同左侧列表
      // BVH 需要去除后两位 (_Xrotation -> _), URDF 保持原名
      const jointName = robotModelStore.isBVH
        ? targetField.slice(0, targetField.length - 2) // 这里的假设是基于左侧列表逻辑：item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0))
        : // 实际上左侧列表逻辑是：
          // props?.viewer?.setHoveredJoints([item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0))])
          // 对于 BVH, item 类似于 "Hips_Xrotation", 减2位是 "Hips_Xrotatio" ?
          // 检查一下左侧列表逻辑。
          // 左侧列表代码：item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0))
          // BVH 的字段名通常是 "JointName_Xrotation".
          // 如果 "JointName_Xrotation".length - 2 -> "JointName_Xrotati". 这不对。
          // 可能是旧逻辑或者特定的字段命名。
          // 让我们看看 MotionEditorComponents/pathPanel/UI.vue 左侧列表的逻辑。

          // 回头看左侧列表的 mouseenter:
          // props?.viewer?.setHoveredJoints([
          //   item.slice(0, item.length - (robotModelStore.isBVH ? 2 : 0)),
          // ])

          // 如果是 URDF, isBVH 为 false, slice(0, length - 0) => 原名。
          // 如果是 BVH, isBVH 为 true, slice(0, length - 2).
          // 假设 BVH 字段名以 "_X" 结尾？
          // 如果字段名是 "RightArm_X", 去掉最后2位变成 "RightArm".
          // 在 `data.ts` 里面：
          // if (arr.length === 1) return arr[0]
          // return arr[arr.length - 1]

          // 不管怎样，我们需要保持和左侧列表一致的逻辑。
          targetField

      // 修正 BVH 逻辑：参考左侧列表
      const nameToHover = robotModelStore.isBVH
        ? targetField.slice(0, targetField.length - 2)
        : targetField

      props?.viewer?.setHoveredJoints([nameToHover])
    },
    onLeave: () => {
      props?.viewer?.setHoveredJoints([])
    },
  })

  // 1. 位置: global_x, global_y, global_z
  if (fieldName.startsWith('global_')) {
    const currentAxis = fieldName.split('_')[1] // x, y, z
    return ['X', 'Y', 'Z'].map(axis =>
      createButton(axis, currentAxis.toUpperCase() === axis, `global_${axis.toLowerCase()}`)
    )
  }

  // 2. 姿态 (BVH): 欧拉角 (XYZ)
  if (
    robotModelStore.isBVH &&
    orientationFieldName.value &&
    fieldName.startsWith(`${orientationFieldName.value}_`)
  ) {
    const allAttitudeFields = attitudeList.value
    const relatedFields = allAttitudeFields.filter(f =>
      f.startsWith(`${orientationFieldName.value}_`)
    )

    return relatedFields
      .map(field => {
        const suffix = field.split('_').pop() || ''
        const label = suffix.charAt(0).toUpperCase()
        return createButton(label, field === fieldName, field)
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  // 3. 姿态 (URDF): 四元数 (XYZW)
  if (fieldName.startsWith('quater_')) {
    const axes = ['X', 'Y', 'Z', 'W']
    // 假设 quater_0, quater_1... 顺序对应 X Y Z W
    const allQuatFields = attitudeList.value.filter(f => f.startsWith('quater_')).sort()

    return allQuatFields.map((field, index) => {
      const label = index < 4 ? axes[index] : String(index)
      return createButton(label, field === fieldName, field)
    })
  }

  // 4. BVH 关节: 欧拉角 (XYZ)
  if (robotModelStore.isBVH) {
    const parts = fieldName.split('_')
    if (parts.length >= 2) {
      const axisPart = parts.pop()
      const jointName = parts.join('_')
      const relatedFields = jointList.value.filter(f => f.startsWith(`${jointName}_`))

      return relatedFields
        .map(field => {
          const suffix = field.split('_').pop() || ''
          const label = suffix.charAt(0).toUpperCase()
          return createButton(label, field === fieldName, field)
        })
        .sort((a, b) => a.label.localeCompare(b.label))
    }
  }

  return []
}
</script>

<style scoped>
@import '../style.css';

.path-panel-field-tip {
  display: flex;
  gap: 8px;
  padding: 4px;
  align-items: center;
  justify-content: center;
}

.path-panel-tip-label {
  font-size: 12px;
  color: #999;
  font-weight: 500;
}

.path-panel-tip-buttons {
  display: flex;
  gap: 4px;
}

.camera-type-slot {
  min-width: 24px;
  padding: 0 8px;
  font-size: 12px;
  width: 100%;
}

.camera-type-selected {
  background-color: rgb(138, 162, 255) !important;
  color: white !important;
  border-radius: 6px;
}

.menu-item-selected {
  font-weight: bold;
}

.path-board-handle-menu {
  position: relative;
  z-index: 6000;
}

.path-board-handle-menu .menu-container {
  z-index: 6001;
}

.path-board-handle-menu .button-bg {
  width: 26px;
  height: 26px;
  min-height: 26px;
}

.path-board-handle-menu .button-slot {
  width: 26px;
  height: 26px;
  min-height: 26px;
}

.path-board-handle-menu .menu-container .button-bg,
.path-board-handle-menu .menu-container .button-slot {
  width: auto;
  height: auto;
  min-height: 0;
}

.path-board-handle-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 0.2px;
}

:deep(.path-board-tooltip),
:deep(.path-board-tooltip-positioned) {
  z-index: 1500;
  pointer-events: none;
}

.pathpanel-menu-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
