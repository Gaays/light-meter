<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useLightMeter } from '../hooks/useLightMeter'
import CameraPreview from '../components/CameraPreview.vue'

// 引入测光计算相关的状态和方法
const {
  currentEV,
  aperture,
  shutterSpeed,
  iso,
  exposureCompensation,
  typeFlag,
  standardApertureValues,
  standardShutterSpeeds,
  calculateEV,
  updateExposureParams,
  toggleMeteringMode
} = useLightMeter()

// UI 状态控制
const showApertureSelector = ref(false)
const showShutterSelector = ref(false)
const showIsoSelector = ref(false)
const showEvSelector = ref(false)

// 摄像头预览组件引用
const cameraPreview = ref()

// 分析亮度并计算曝光参数
async function analyzeBrightness() {
  if (!cameraPreview.value?.video?.value || !cameraPreview.value?.isStreaming) return

  const video = cameraPreview.value.video.value
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) return

  // 设置画布大小为视频的实际尺寸
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  // 将视频帧绘制到画布上
  context.drawImage(video, 0, 0, canvas.width, canvas.height)

  // 获取画布中心区域的像素数据
  const centerSize = Math.min(canvas.width, canvas.height) / 3
  const x = (canvas.width - centerSize) / 2
  const y = (canvas.height - centerSize) / 2
  const imageData = context.getImageData(x, y, centerSize, centerSize)

  // 计算平均亮度
  let totalLuminance = 0
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // 使用相对亮度公式计算亮度值
    totalLuminance += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  }

  const averageLuminance = totalLuminance / (data.length / 4)
  const ev = calculateEV(averageLuminance)
  updateExposureParams(ev)
}

// 关闭所有选择器
function closeAllSelectors() {
  showApertureSelector.value = false
  showShutterSelector.value = false
  showIsoSelector.value = false
  showEvSelector.value = false
}

// 处理光圈点击
function handleApertureClick() {
  if (typeFlag.value === 'aperture') {
    showApertureSelector.value = !showApertureSelector.value
    showShutterSelector.value = false
    showIsoSelector.value = false
    showEvSelector.value = false
  }
}

// 处理快门点击
function handleShutterClick() {
  if (typeFlag.value === 'shutter') {
    showShutterSelector.value = !showShutterSelector.value
    showApertureSelector.value = false
    showIsoSelector.value = false
    showEvSelector.value = false
  }
}

// 处理ISO点击
function handleIsoClick() {
  showIsoSelector.value = !showIsoSelector.value
  showApertureSelector.value = false
  showShutterSelector.value = false
  showEvSelector.value = false
}

// 处理曝光补偿点击
function handleEvClick() {
  showEvSelector.value = !showEvSelector.value
  showApertureSelector.value = false
  showShutterSelector.value = false
  showIsoSelector.value = false
}

// 设置光圈值
function setAperture(value: number) {
  aperture.value = value
  closeAllSelectors()
  analyzeBrightness()
}

// 设置快门速度
function setShutterSpeed(value: number) {
  shutterSpeed.value = value
  closeAllSelectors()
  analyzeBrightness()
}

// 设置ISO值
function setIso(value: string) {
  iso.value = value
  closeAllSelectors()
  analyzeBrightness()
}

// 设置曝光补偿
function setExposureCompensation(value: number) {
  exposureCompensation.value = value
  closeAllSelectors()
  analyzeBrightness()
}

onMounted(() => {
  // 添加设备方向变化监听
  window.addEventListener('orientationchange', handleOrientationChange)
})

onUnmounted(() => {
  window.removeEventListener('orientationchange', handleOrientationChange)
})

// 处理设备方向变化
function handleOrientationChange() {
  setTimeout(() => {
    if (shutterSpeed.value > 0) {
      analyzeBrightness()
    }
  }, 300)
}
</script>

<template>
  <div class="light-meter">
    <CameraPreview ref="cameraPreview" />

    <div class="controls">
      <button class="measure-button" @click="analyzeBrightness">测光</button>

      <div class="exposure-info">
        <div class="exposure-value">
          <span class="label">曝光值:</span>
          <span class="value">{{ currentEV.toFixed(1) }} EV</span>
        </div>

        <div class="mode-indicator" @click="toggleMeteringMode">
          <span>{{ typeFlag === 'aperture' ? '光圈优先' : '快门优先' }}</span>
        </div>

        <div class="exposure-params">
          <div
            class="param"
            :class="{ highlight: typeFlag === 'shutter' }"
            @click="handleApertureClick"
          >
            <span class="label">光圈:</span>
            <span class="value">{{ aperture === 0 ? '-' : `f/${aperture.toFixed(1)}` }}</span>
          </div>

          <div
            class="param"
            :class="{ highlight: typeFlag === 'aperture' }"
            @click="handleShutterClick"
          >
            <span class="label">快门:</span>
            <span class="value">{{
              shutterSpeed === 0
                ? '-'
                : shutterSpeed >= 1
                  ? `${Math.round(shutterSpeed)}s`
                  : `1/${Math.round(1 / shutterSpeed)}`
            }}</span>
          </div>

          <div class="param" @click="handleIsoClick">
            <span class="label">ISO:</span>
            <span class="value">{{ iso }}</span>
          </div>

          <div class="param" @click="handleEvClick">
            <span class="label">曝光补偿:</span>
            <span class="value">{{ exposureCompensation >= 0 ? '+' : '' }}{{ exposureCompensation }}</span>
          </div>
        </div>
      </div>

      <!-- 选择器弹出层 -->
      <div v-if="showApertureSelector" class="popup-selector">
        <div class="popup-header">
          <h3>选择光圈值</h3>
          <button class="close-btn" @click="closeAllSelectors">×</button>
        </div>
        <div class="selector-options">
          <button
            v-for="value in standardApertureValues"
            :key="value"
            @click="setAperture(value)"
            :class="{ active: value === aperture }"
          >
            f/{{ value.toFixed(1) }}
          </button>
        </div>
      </div>

      <div v-if="showShutterSelector" class="popup-selector">
        <div class="popup-header">
          <h3>选择快门速度</h3>
          <button class="close-btn" @click="closeAllSelectors">×</button>
        </div>
        <div class="selector-options">
          <button
            v-for="speed in standardShutterSpeeds"
            :key="speed"
            @click="setShutterSpeed(speed)"
            :class="{ active: speed === shutterSpeed }"
          >
            {{ speed >= 1 ? `${speed}s` : `1/${Math.round(1 / speed)}` }}
          </button>
        </div>
      </div>

      <div v-if="showIsoSelector" class="popup-selector">
        <div class="popup-header">
          <h3>选择ISO值</h3>
          <button class="close-btn" @click="closeAllSelectors">×</button>
        </div>
        <div class="selector-options">
          <button
            v-for="value in ['100', '200', '400', '800', '1600', '3200', '6400']"
            :key="value"
            @click="setIso(value)"
            :class="{ active: value === iso }"
          >
            {{ value }}
          </button>
        </div>
      </div>

      <div v-if="showEvSelector" class="popup-selector">
        <div class="popup-header">
          <h3>选择曝光补偿</h3>
          <button class="close-btn" @click="closeAllSelectors">×</button>
        </div>
        <div class="selector-options">
          <button
            v-for="value in [-3, -2, -1, 0, 1, 2, 3]"
            :key="value"
            @click="setExposureCompensation(value)"
            :class="{ active: value === exposureCompensation }"
          >
            {{ value >= 0 ? '+' : '' }}{{ value }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.light-meter {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #000;
  color: #fff;
}

.controls {
  padding: 1rem;
  background: rgba(0, 0, 0, 0.8);
}

.measure-button {
  width: 100%;
  padding: 1rem;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.2rem;
  margin-bottom: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.measure-button:active {
  transform: scale(0.98);
  background: #43a047;
}

.exposure-info {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
}

.exposure-value {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
}

.exposure-params {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.param {
  background: rgba(255, 255, 255, 0.05);
  padding: 0.8rem;
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.param:active {
  transform: scale(0.95);
}

.param.highlight {
  border: 2px solid #4caf50;
  background: rgba(76, 175, 80, 0.2);
}

.label {
  color: #aaa;
  font-size: 0.8rem;
  display: block;
  margin-bottom: 0.2rem;
}

.value {
  font-size: 1rem;
  font-weight: bold;
}

.mode-indicator {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.5rem;
  border-radius: 4px;
  text-align: center;
  margin-bottom: 0.5rem;
  cursor: pointer;
  font-weight: bold;
  color: #4caf50;
}

.popup-selector {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #222;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  padding: 1rem;
  z-index: 100;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.popup-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: normal;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 1.5rem;
  padding: 0.5rem;
  cursor: pointer;
}

.selector-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.5rem;
  max-height: 60vh;
  overflow-y: auto;
}

.selector-options button
