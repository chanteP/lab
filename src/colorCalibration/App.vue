<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';

// 色阶步长
const scaleStep = 10;

interface ColorItem {
    hue: number;
    saturation: number;
    lightness: number;
}

const mainColorList = ref<ColorItem[]>([
    {
        hue: 0,
        saturation: 0,
        lightness: 0,
    },
    {
        hue: 0,
        saturation: 0,
        lightness: 100,
    },
    {
        hue: 0,
        saturation: 100,
        lightness: 50,
    },
    {
        hue: 120,
        saturation: 100,
        lightness: 50,
    },
    {
        hue: 240,
        saturation: 100,
        lightness: 50,
    },
]);

const subColorList = ref<ColorItem[]>([
    {
        hue: 60,
        saturation: 100,
        lightness: 50,
    },
    {
        hue: 180,
        saturation: 100,
        lightness: 50,
    },
    {
        hue: 300,
        saturation: 100,
        lightness: 50,
    },
    // 橙色
    {
        hue: 30,
        saturation: 100,
        lightness: 50,
    },
    // 紫色（典型的校准颜色）
    {
        hue: 270,
        saturation: 100,
        lightness: 50,
    },
]);

// 全屏相关状态
const isFullscreen = ref(false);
const selectedColor = ref<ColorItem | null>(null);
const expandedColor = ref<ColorItem | null>(null); // 展开的单个颜色

// 将HSL转换为CSS颜色字符串
function hslToCss(hue: number, saturation: number, lightness: number): string {
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// 生成lightness渐变列表（0-100，每10一份）
const lightnessSteps = computed(() => {
    if (!selectedColor.value) return [];
    const steps: number[] = [];
    for (let i = 0; i <= 100; i += scaleStep) {
        steps.push(i);
    }
    return steps;
});

// 生成saturation渐变列表（0-100，每10一份）
const saturationSteps = computed(() => {
    if (!selectedColor.value) return [];
    const steps: number[] = [];
    for (let i = 0; i <= 100; i += scaleStep) {
        steps.push(i);
    }
    return steps;
});

// 进入全屏模式
async function enterFullscreen(color: ColorItem) {
    selectedColor.value = color;
    expandedColor.value = null;
    
    try {
        const element = document.documentElement;
        if (element.requestFullscreen) {
            await element.requestFullscreen();
        } else if ((element as any).webkitRequestFullscreen) {
            await (element as any).webkitRequestFullscreen();
        } else if ((element as any).mozRequestFullScreen) {
            await (element as any).mozRequestFullScreen();
        } else if ((element as any).msRequestFullscreen) {
            await (element as any).msRequestFullscreen();
        }
        isFullscreen.value = true;
    } catch (error) {
        console.error('进入全屏失败:', error);
        // 即使全屏API失败，也显示全屏模式
        isFullscreen.value = true;
    }
}

// 退出全屏模式
async function exitFullscreen() {
    try {
        if (document.exitFullscreen) {
            await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
            await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
            await (document as any).msExitFullscreen();
        }
    } catch (error) {
        console.error('退出全屏失败:', error);
    }
    isFullscreen.value = false;
    selectedColor.value = null;
    expandedColor.value = null;
}

// 处理全屏模式下的点击
function handleFullscreenClick(color?: ColorItem) {
    if (expandedColor.value) {
        // 如果已经展开，点击退出全屏
        exitFullscreen();
    } else if (color) {
        // 如果点击了某个颜色块，展开该颜色
        expandedColor.value = color;
    } else {
        // 如果点击了上半部分的纯色区域，展开该颜色
        if (selectedColor.value) {
            expandedColor.value = selectedColor.value;
        }
    }
}

// 监听全屏状态变化
onMounted(() => {
    const handleFullscreenChange = () => {
        const isCurrentlyFullscreen = !!(
            document.fullscreenElement ||
            (document as any).webkitFullscreenElement ||
            (document as any).mozFullScreenElement ||
            (document as any).msFullscreenElement
        );
        if (!isCurrentlyFullscreen && isFullscreen.value) {
            isFullscreen.value = false;
            selectedColor.value = null;
            expandedColor.value = null;
        }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
});

</script>

<template>
    <div class="color-calibration-container">
        <!-- 颜色选择页面 -->
        <div v-if="!isFullscreen" class="color-select-page">
            <div class="color-row main-color-row">
                <div
                    v-for="(color, index) in mainColorList"
                    :key="`main-${index}`"
                    class="color-circle"
                    :style="{ backgroundColor: hslToCss(color.hue, color.saturation, color.lightness) }"
                    @click="enterFullscreen(color)"
                >
                </div>
            </div>
            <div class="color-row sub-color-row">
                <div
                    v-for="(color, index) in subColorList"
                    :key="`sub-${index}`"
                    class="color-circle"
                    :style="{ backgroundColor: hslToCss(color.hue, color.saturation, color.lightness) }"
                    @click="enterFullscreen(color)"
                >
                </div>
            </div>
        </div>

        <!-- 全屏模式 -->
        <div v-if="isFullscreen" class="fullscreen-mode" @click="handleFullscreenClick()">
            <!-- 展开单个颜色模式 -->
            <div v-if="expandedColor" class="expanded-color-view" :style="{ backgroundColor: hslToCss(expandedColor.hue, expandedColor.saturation, expandedColor.lightness) }">
                <div class="exit-hint">点击退出全屏</div>
            </div>
            
            <!-- 正常全屏模式：上半部分纯色 + 中间部分saturation渐变 + 下半部分lightness渐变 -->
            <template v-else-if="selectedColor">
                <div class="fullscreen-top" :style="{ backgroundColor: hslToCss(selectedColor.hue, selectedColor.saturation, selectedColor.lightness) }">
                    <div class="exit-hint">点击展开当前颜色</div>
                </div>
                <div class="fullscreen-middle">
                    <div
                        v-for="(saturation, index) in saturationSteps"
                        :key="index"
                        class="saturation-block"
                        :style="{ backgroundColor: hslToCss(selectedColor.hue, saturation, 50) }"
                        @click.stop="handleFullscreenClick({ hue: selectedColor.hue, saturation, lightness: 50 })"
                    >
                    </div>
                </div>
                <div class="fullscreen-bottom">
                    <div
                        v-for="(lightness, index) in lightnessSteps"
                        :key="index"
                        class="lightness-block"
                        :style="{ backgroundColor: hslToCss(selectedColor.hue, selectedColor.saturation, lightness) }"
                        @click.stop="handleFullscreenClick({ hue: selectedColor.hue, saturation: selectedColor.saturation, lightness })"
                    >
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.color-calibration-container {
    width: 100%;
    height: 100vh;
    overflow: hidden;
}

/* 颜色选择页面 */
.color-select-page {
    width: 100%;
    height: 100vh;
    background: 
        radial-gradient(ellipse at top left, #1a1a1a 0%, transparent 50%),
        radial-gradient(ellipse at bottom right, #0d0d0d 0%, transparent 50%),
        linear-gradient(135deg, #000000 0%, #0a0a0a 25%, #0f0f0f 50%, #0a0a0a 75%, #000000 100%);
    background-size: 100% 100%, 100% 100%, 100% 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 60px;
    padding: 40px;
    box-sizing: border-box;
}

.color-select-page::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: 
        repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.01) 2px,
            rgba(255, 255, 255, 0.01) 4px
        ),
        repeating-linear-gradient(
            90deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.01) 2px,
            rgba(255, 255, 255, 0.01) 4px
        );
    pointer-events: none;
    opacity: 0.3;
}

.color-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 40px;
    flex-wrap: wrap;
    position: relative;
    z-index: 1;
}

.color-circle {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.6),
        0 4px 16px rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(255, 255, 255, 0.15);
}

.color-circle::before {
    content: '';
    position: absolute;
    top: -3px;
    left: -3px;
    right: -3px;
    bottom: -3px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    z-index: -1;
    opacity: 0;
    transition: opacity 0.4s ease;
}

.color-circle::after {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    z-index: -2;
    opacity: 0.4;
}

.color-circle:hover {
    transform: scale(1.15) translateY(-4px);
    box-shadow: 
        0 16px 48px rgba(0, 0, 0, 0.8),
        0 8px 24px rgba(0, 0, 0, 0.6),
        0 0 40px rgba(255, 255, 255, 0.15),
        0 0 0 2px rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.3);
}

.color-circle:hover::before {
    opacity: 1;
    background: rgba(255, 255, 255, 0.25);
}

.color-circle:hover::after {
    opacity: 0.7;
    background: rgba(255, 255, 255, 0.2);
}

/* 全屏模式 */
.fullscreen-mode {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
}

.fullscreen-top {
    width: 100%;
    height: 33.33%;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    border: none;
}

.fullscreen-middle {
    width: 100%;
    height: 33.33%;
    display: flex;
    flex-direction: row;
}

.fullscreen-bottom {
    width: 100%;
    height: 33.33%;
    display: flex;
    flex-direction: row;
}

.saturation-block {
    flex: 1;
    height: 100%;
    cursor: pointer;
    transition: opacity 0.2s ease;
    border-right: 1px solid #000000;
}

.saturation-block:last-child {
    border-right: none;
}

.saturation-block:hover {
    opacity: 0.95;
}

.lightness-block {
    flex: 1;
    height: 100%;
    cursor: pointer;
    transition: opacity 0.2s ease;
    border-right: 1px solid #000000;
}

.lightness-block:last-child {
    border-right: none;
}

.lightness-block:hover {
    opacity: 0.95;
}

.expanded-color-view {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
}

.exit-hint {
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.7);
    font-size: 16px;
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 20px;
    backdrop-filter: blur(10px);
    pointer-events: none;
    transition: opacity 0.3s ease;
}

.fullscreen-mode:hover .exit-hint {
    opacity: 1;
}
</style>
