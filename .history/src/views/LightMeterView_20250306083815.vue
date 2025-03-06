<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'

// 状态管理
const video = ref<HTMLVideoElement | null>(null)
const stream = ref<MediaStream | null>(null)
const isStreaming = ref(false)
const iso = ref(100)
const exposureCompensation = ref(0)
const aperture = ref(1.4)
const shutterSpeed = ref(0)

// 常用光圈值
const apertureValues = [1.4, 1.8, 2.0, 2.8, 4, 8, 16, 22]

// 计算当前EV值
const currentEV = computed(() => {
  const apertureEV = Math.log2(Math.pow(aperture.value, 2))
  const speedEV = Math.log2(1 / shutterSpeed.value)
  const isoEV = Math.log2(Number(iso.value) / 100)
  return apertureEV + speedEV - isoEV - exposureCompensation.value
})

// 监听光圈值变化，更新快门速度
watch(aperture, (newAperture) => {
  const ev = currentEV.value
  const isoFactor = Number(iso.value) / 100
  const newSpeed = 1 / (Math.pow(2, ev + Math.log2(Math.pow(newAperture, 2)) + exposureCompensation.value) * isoFactor)
  shutterSpeed.value = Math.max(1/8000, Math.min(30, newSpeed))
})

// 监听快门速度变化，更新光圈值
watch(shutterSpeed, (newSpeed) => {
  const ev = currentEV.value
  const isoFactor = Number(iso.value) / 100
  const newAperture = Math.sqrt(Math.pow(2, ev + Math.log2(1/newSpeed) + exposureCompensation.value) * isoFactor)
  const closestAperture = apertureValues.reduce((prev, curr) => 
    Math.abs(curr - newAperture) < Math.abs(prev - newAperture) ? curr : prev
  )
  if (aperture.value !== closestAperture) {
    aperture.value = closestAperture
  }
})

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

// 计算可用的快门速度列表
function calculateShutterSpeeds() {
  const baseEv = Math.log2(aperture.value * aperture.value / (Number(iso.value) / 100))
  const evRange = 10 // 上下5档曝光值范围
  const speeds = []
  
  for (let i = -evRange; i <= evRange; i++) {
    const speed = 1 / (Math.pow(2, baseEv + i))
    if (speed >= 1/8000 && speed <= 30) {
      if (speed < 1) {
        // 对于小于1秒的速度，将分母向上取整到最接近的标准快门速度
        const denominator = Math.ceil(1/speed)
        const standardDenominators = [8000, 4000, 2000, 1000, 500, 250, 125, 60, 30, 15, 8, 4, 2]
        const closestDenominator = standardDenominators.reduce((prev, curr) => 
          Math.abs(curr - denominator) < Math.abs(prev - denominator) ? curr : prev
        )
        speeds.push(1/closestDenominator)
      } else {
        speeds.push(Math.round(speed))
      }
    }
  }
  
  return speeds.sort((a, b) => a - b)
}

// 分析亮度并计算曝光参数
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
  const normalizedBrightness = Math.max(1, Math.min(255, avgBrightness))
  
  const ev = Math.log2(normalizedBrightness / 127.5)
  const evWithComp = ev + Number(exposureCompensation.value)
  
  // 根据当前光圈值计算对应的快门速度
  const calculatedSpeed = 1 / (Number(iso.value) / 100) * Math.pow(2, -evWithComp)
  const limitedSpeed = Math.max(1/8000, Math.min(30, calculatedSpeed))
  
  // 对于小于1秒的速度，将分母向上取整到最接近的标准快门速度
  if (limitedSpeed < 1) {
    const denominator = Math.ceil(1/limitedSpeed)
    const standardDenominators = [8000, 4000, 2000, 1000, 500, 250, 125, 60, 30, 15, 8, 4, 2]
    const closestDenominator = standardDenominators.reduce((prev, curr) => 
      Math.abs(curr - denominator) < Math.abs(prev - denominator) ? curr : prev
    )
    shutterSpeed.value = 1/closestDenominator
  } else {
    shutterSpeed.value = Math.round(limitedSpeed)
  }
}

onMounted(() => {
  startCamera()
})

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <div class="light-meter">
    <div class="header">
      <h1>测光表</h1>
    </div>
    
    <div class="main-content">
      <div class="preview">
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
      
      <button class="measure-button" @click="analyzeBrightness">测光</button>
      
      <div class="exposure-info">
        <div class="exposure-value">
          <span class="label">曝光值:</span>
          <span class="value">{{ currentEV.toFixed(1) }} EV</span>
        </div>
        <div class="exposure-params">
          <div class="param">
            <span class="label">光圈:</span>
            <span class="value">f/{{ aperture.toFixed(1) }}</span>
          </div>
          <div class="param">
            <span class="label">快门:</span>
            <span class="value">{{ shutterSpeed >= 1 ? `${Math.round(shutterSpeed)}s` : `1/${Math.round(1/shutterSpeed)}` }}</span>
          </div>
          <div class="param">
            <span class="label">ISO:</span>
            <span class="value">{{ iso }}</span>
          </div>
        </div>
      </div>
      
      <div class="controls">
        <div class="control-section">
          <h2>光圈值</h2>
          <div class="aperture-selector">
            <div 
              v-for="value in apertureValues" 
              :key="value"
              class="selector-item"
              :class="{ active: aperture === value }"
              @click="aperture = value"
            >
              f/{{ value.toFixed(1) }}
            </div>
          </div>
        </div>
        
        <div class="control-section">
          <h2>快门速度</h2>
          <div class="shutter-selector">
            <div 
              v-for="speed in calculateShutterSpeeds().slice(0, 10)" 
              :key="speed"
              class="selector-item"
              :class="{ active: Math.abs(shutterSpeed - speed) < 0.001 }"
              @click="shutterSpeed = speed"
            >
              {{ speed >= 1 ? `${Math.round(speed)}s` : `1/${Math.round(1/speed)}` }}
            </div>
          </div>
        </div>
        
        <div class="control-section">
          <h2>ISO</h2>
          <div class="iso-selector">
            <div 
              v-for="value in [100, 200, 400, 800, 1600, 3200]" 
              :key="value"
              class="selector-item"
              :class="{ active: Number(iso) === value }"
              @click="iso = value"
            >
              {{ value }}
            </div>
          </div>
        </div>
        
        <div class="control-section">
          <h2>曝光补偿 ({{ exposureCompensation }}EV)</h2>
          <input
            type="range"
            v-model="exposureCompensation"
            min="-3"
            max="3"
            step="0.3"
            class="exposure-slider"
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.light-meter {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background: #1a1a1a;
  color: #fff;
  overflow-x: hidden;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.header {
  background: #000;
  padding: 0.8rem;
  text-align: center;
  border-bottom: 1px solid #333;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header h1 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: normal;
}

.main-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  gap: 1rem;
}

.preview {
  width: 100%;
  aspect-ratio: 4/3;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  margin-bottom: 0.5rem;
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
  width: 80%;
}

.measure-button {
  padding: 0.8rem 1.5rem;
  font-size: 1.1rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.3s;
  width: 80%;
  max-width: 300px;
  margin: 0 auto;
  display: block;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.measure-button:active {
  background: #45a049;
  transform: scale(0.98);
}

.exposure-info {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 0.8rem;
  margin: 0.5rem 0;
}

.exposure-value {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
}

.exposure-params {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.param {
  flex: 1;
  min-width: 80px;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.5rem;
  border-radius: 4px;
  text-align: center;
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

.controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control-section {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 0.8rem;
}

.control-section h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  font-weight: normal;
  color: #aaa;
}

.aperture-selector,
.shutter-selector,
.iso-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.selector-item {
  padding: 0.6rem 0.8rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 50px;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.selector-item.active {
  background: #4CAF50;
  color: white;
}

.selector-item:active {
  transform: scale(0.95);
}

.exposure-slider {
  width: 100%;
  margin: 0.5rem 0;
  -webkit-appearance: none;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  outline: none;
}

.exposure-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
}

.exposure-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
  border: none;
}

/* 媒体查询，针对不同尺寸的设备进行优化 */
@media (max-width: 480px) {
  .header h1 {
    font-size: 1.2rem;
  }
  
  .measure-button {
    padding: 0.7rem 1.2rem;
    font-size: 1rem;
  }
  
  .selector-item {
    padding: 0.5rem 0.6rem;
    min-width: 40px;
    font-size: 0.9rem;
  }
  
  .param {
    min-width: 70px;
  }
}

@media (min-width: 768px) {
  .main-content {
    padding: 1rem;
  }
  
  .controls {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>