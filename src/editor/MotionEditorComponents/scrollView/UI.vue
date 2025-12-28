<template>
    <div @mousemove="() => data.refresh()" ref="container"
        style="display: inline-block;position: relative;overflow: hidden;">
        <div @scroll="() => data.refresh()" ref="containerInside" class="hide-scrollbar"
            style="width: 100%;height: 100%;overflow: auto;position: absolute;left: 0;top: 0;" :style="{
                overflowY: props.scrollY ? 'auto' : 'hidden',
                overflowX: props.scrollX ? 'auto' : 'hidden',
            }">
            <slot></slot>
        </div>
        <div @mousedown="() => data.yMove.start()" v-if="data.y.show" class="bar-y" :class="{ 'bar-light': !props.isDark }" :style="{
            top: data.y.top,
            height: data.y.height
        }"></div>
        <div @mousedown="() => data.xMove.start()" v-if="data.x.show" class="bar-x" :class="{ 'bar-light': !props.isDark }" :style="{
            left: data.x.left,
            width: data.x.width
        }"></div>
        <div v-if="data.xMove.allow || data.yMove.allow"
            style="width: 100%;height: 100%;position: absolute;left: 0;top: 0;z-index: 9999999;">

        </div>
    </div>
</template>

<script setup>
import { onMounted, ref, reactive, nextTick, onUnmounted, defineEmits, defineProps, watch } from 'vue';

const container = ref(null)
const containerInside = ref(null)

const props = defineProps({
    scrollY: {
        type: Boolean,
        default: false
    },
    scrollX: {
        type: Boolean,
        default: false
    },
    isDark: {
        type: Boolean,
        default: true
    }
})

watch(() => props, () => {
    data.value.refresh()
}, {
    deep: true
})

const data = ref({
    yMove: {
        last: null,
        allow: false,
        handle(e) {
            if (this.allow === false) return
            if (this.last === null) {
                this.last = e.y
            } else {
                let c = e.y - this.last
                this.last = e.y
                const containerHeight = container.value.clientHeight
                const containerScrollHeight = containerInside.value.scrollHeight
                c = c / ((containerHeight - data.value.y.heightNum) / (containerScrollHeight - containerHeight))
                containerInside.value.scrollTop += c
            }
        },
        start() {
            this.allow = true
        },
        end() {
            this.allow = false
            this.last = null
        }
    },
    xMove: {
        last: null,
        allow: false,
        handle(e) {
            if (this.allow === false) return
            if (this.last === null) {
                this.last = e.x
            } else {
                let c = e.x - this.last
                this.last = e.x
                const containerWidth = container.value.clientWidth
                const containerScrollWidth = containerInside.value.scrollWidth
                c = c / ((containerWidth - data.value.x.widthNum) / (containerScrollWidth - containerWidth))
                containerInside.value.scrollLeft += c
            }
        },
        start() {
            this.allow = true
        },
        end() {
            this.allow = false
            this.last = null
        }
    },
    refresh() {
        // Y
        const containerHeight = container.value.clientHeight
        const containerScrollHeight = containerInside.value.scrollHeight
        const containerScrollTop = containerInside.value.scrollTop
        let yHeightNum = containerHeight / containerScrollHeight * containerHeight
        this.y.height = `${yHeightNum}px`
        this.y.heightNum = yHeightNum
        let yLocation = containerScrollTop / (containerScrollHeight - containerHeight)
        this.y.top = `${(containerHeight - yHeightNum) * yLocation}px`
        if (props.scrollY && containerScrollHeight > containerHeight) {
            this.y.show = true
        } else {
            this.y.show = false
        }

        // X
        const containerWidth = container.value.clientWidth
        const containerScrollWidth = containerInside.value.scrollWidth
        const containerScrollLeft = containerInside.value.scrollLeft
        let xWidthNum = containerWidth / containerScrollWidth * containerWidth
        this.x.width = `${xWidthNum}px`
        this.x.widthNum = xWidthNum
        let xLocation = containerScrollLeft / (containerScrollWidth - containerWidth)
        this.x.left = `${(containerWidth - xWidthNum) * xLocation}px`
        if (props.scrollX && containerScrollWidth > containerWidth) {
            this.x.show = true
        } else {
            this.x.show = false
        }
    },
    y: {
        show: false,
        top: '0px',
        height: '0px',
        heightNum: 0
    },
    x: {
        show: false,
        left: '0px',
        width: '0px',
        widthNum: 0
    },
})

const scrollMouseMove = (e) => {
    data.value.xMove.handle(e)
    data.value.yMove.handle(e)
}
const scrollMouseUp = () => {
    data.value.xMove.end()
    data.value.yMove.end()
}

const resizeRefresh = () => {
    data.value.refresh()
}

let resizeObserver = null

onMounted(() => {
    data.value.refresh()
    document.body.addEventListener('mousemove', scrollMouseMove)
    document.body.addEventListener('mouseup', scrollMouseUp)
    window.addEventListener('resize', resizeRefresh)
    
    // 监听容器尺寸变化
    if (container.value) {
        resizeObserver = new ResizeObserver(() => {
            data.value.refresh()
        })
        resizeObserver.observe(container.value)
    }
    
    // 监听内部容器内容尺寸变化
    if (containerInside.value) {
        const innerObserver = new ResizeObserver(() => {
            data.value.refresh()
        })
        innerObserver.observe(containerInside.value)
        // 将 innerObserver 也存储起来以便清理
        if (!resizeObserver.innerObserver) {
            resizeObserver.innerObserver = innerObserver
        }
    }
})

onUnmounted(() => {
    document.body.removeEventListener('mousemove', scrollMouseMove)
    document.body.removeEventListener('mouseup', scrollMouseUp)
    window.removeEventListener('resize', resizeRefresh)
    
    // 清理 ResizeObserver
    if (resizeObserver) {
        resizeObserver.disconnect()
        if (resizeObserver.innerObserver) {
            resizeObserver.innerObserver.disconnect()
        }
        resizeObserver = null
    }
})

</script>

<style scoped>
.hide-scrollbar {
    overflow: auto;
    /* 保留滚动功能 */

    /* 针对 IE/Edge 旧版 */
    -ms-overflow-style: none;
    /* 隐藏滚动条 */

    /* 针对 Firefox */
    scrollbar-width: none;
    /* 隐藏滚动条 */
}

/* 针对 Chrome / Safari / 新版 Edge */
.hide-scrollbar::-webkit-scrollbar {
    display: none;
    /* 隐藏滚动条 */
}

.bar-y {
    width: 2px;
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.5);
    transition: width .1s cubic-bezier(0.1, 0.9, 0.2, 1);
    position: absolute;
    top: 0;
    right: 2px;
    z-index: 10000000;
}

.bar-y.bar-light {
    background-color: rgba(0, 0, 0, 0.5);
}

.bar-y:hover {
    width: 6px;
}

.bar-x {
    height: 2px;
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.5);
    transition: height .1s cubic-bezier(0.1, 0.9, 0.2, 1);
    position: absolute;
    left: 0;
    bottom: 2px;
    z-index: 10000000;
}

.bar-x.bar-light {
    background-color: rgba(0, 0, 0, 0.5);
}

.bar-x:hover {
    height: 6px;
}
</style>