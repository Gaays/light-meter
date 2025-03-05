<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// 状态管理
const video = ref<HTMLVideoElement | null>(null)
const stream = ref<MediaStream | null>(null)
const isStreaming = ref(false)
const iso = ref(100)
const exposureCompensation = ref(0)
const aperture = ref(0)
const shutterSpeed = ref(0)

// 启动摄像头
async function startCamera() {
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    
    if (video.value) {
      video.value.srcObject = stream.value
      isStreaming.value = true
    }
  } catch (error) {
    console.error('Error accessing camera:', error)
  }
}

// 停止摄像头
function stopCamera() {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
    isStreaming.value = false
  }
}

// 分析画面亮度并计算曝光参数
function analyzeBrightness() {
  if (!video.value || !isStreaming.value) return
  
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return
  
  canvas.width = video.value.videoWidth
  canvas.height = video.value.videoHeight
  context.drawImage(video.value, 0, 0)
  
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  
  let totalBrightness = 0
  let pixelCount = 0
  
  for (let i = 0; i < data.length; i += 4) {
    // 使用相对亮度公式: 0.2126R + 0.7152G + 0.0722B
    const pixelBrightness = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722
    if (!isNaN(pixelBrightness)) {
      totalBrightness += pixelBrightness
      pixelCount++
    }
  }
  
  // 确保有有效的亮度值
  if (pixelCount === 0) return
  
  const avgBrightness = totalBrightness / pixelCount
  // 将亮度限制在有效范围内（1-255）
  const normalizedBrightness = Math.max(1, Math.min(255, avgBrightness))
  
  // 计算曝光值（EV）
  const ev = Math.log2(normalizedBrightness / 127.5) // 基准值127.5（中灰）
  const evWithComp = ev + Number(exposureCompensation.value)
  
  // 计算光圈值（限制在常用范围内：f/1.4 - f/22）
  const baseAperture = 5.6 // 基准光圈值
  const calculatedAperture = baseAperture * Math.pow(2, evWithComp / 2)
  aperture.value = Number(Math.max(1.4, Math.min(22, calculatedAperture)).toFixed(1))
  
  // 计算快门速度（限制在合理范围内：1/8000 - 30秒）
  const calculatedSpeed = 1 / (Number(iso.value) / 100) * Math.pow(2, -evWithComp)
  const limitedSpeed = Math.max(1/8000, Math.min(30, calculatedSpeed))
  // 当速度大于等于1秒时，直接显示秒数；否则显示分数形式
  shutterSpeed.value = limitedSpeed >= 1 ? limitedSpeed : Math.round(1/limitedSpeed)
}

// 定时分析画面
let analysisInterval: number

onMounted(() => {
  startCamera()
  analysisInterval = setInterval(analyzeBrightness, 500) // 每500ms分析一次
})

onUnmounted(() => {
  stopCamera()
  clearInterval(analysisInterval)
})
</script>

<template>
  <div class="light-meter">
    <div class="video-container">
      <video
        ref="video"
        autoplay
        playsinline
        :class="{ active: isStreaming }"
      ></video>
      <div v-if="!isStreaming" class="no-camera">
        等待摄像头权限...
      </div>
    </div>
    
    <div class="controls">
      <div class="control-group">
        <label>ISO</label>
        <select v-model="iso">
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="400">400</option>
          <option value="800">800</option>
          <option value="1600">1600</option>
          <option value="3200">3200</option>
        </select>
      </div>
      
      <div class="control-group">
        <label>曝光补偿</label>
        <input
          type="range"
          v-model="exposureCompensation"
          min="-3"
          max="3"
          step="0.3"
        >
        <span>{{ exposureCompensation }}EV</span>
      </div>
    </div>
    
    <div class="readings">
      <div class="reading">
        <span class="label">光圈</span>
        <span class="value">f/{{ aperture.toFixed(1) }}</span>
      </div>
      <div class="reading">
        <span class="label">快门速度</span>
        <span class="value">{{ shutterSpeed >= 1 ? `${shutterSpeed}s` : `1/${shutterSpeed}` }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.light-meter {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1a1a1a;
  color: #fff;
}

.video-container {
  position: relative;
  flex: 1;
  background: #000;
  overflow: hidden;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s;
}

video.active {
  opacity: 1;
}

.no-camera {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  text-align: center;
}

.controls {
  padding: 1rem;
  background: rgba(0, 0, 0, 0.8);
}

.control-group {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.control-group:last-child {
  margin-bottom: 0;
}

label {
  min-width: 80px;
}

select,
input[type="range"] {
  flex: 1;
  padding: 0.5rem;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
}

.readings {
  display: flex;
  padding: 1rem;
  background: #000;
  justify-content: space-around;
}

.reading {
  text-align: center;
}

.label {
  display: block;
  font-size: 0.9rem;
  color: #888;
  margin-bottom: 0.3rem;
}

.value {
  font-size: 1.5rem;
  font-weight: bold;
}
</style>