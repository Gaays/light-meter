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
  if (!isStreaming.value) return [1/8000, 1/4000, 1/2000, 1/1000, 1/500, 1/250, 1/125, 1/60, 1/30, 1/15, 1/8, 1/4, 1/2, 1, 2, 4, 8, 15, 30]
  
  const baseEv = Math.log2(aperture.value * aperture.value / (Number(iso.value) / 100))
  const evRange = 10 // 上下5档曝光值范围
  const speeds = []
  
  for (let i = -evRange; i <= evRange; i++) {
    const speed = 1 / (Math.pow(2, baseEv + i))
    if (speed >= 1/8000 && speed <= 30) {
      speeds.push(speed)
    }
  }
  
  return speeds.sort((a, b) => a - b)
}

// 修改analyzeBrightness函数的光圈和快门速度计算部分
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
  shutterSpeed.value = limitedSpeed
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
      <div class="reading-scroll">
        <div class="reading-label">光圈</div>
        <div class="scroll-container">
          <div class="scroll-track">
            <div
              v-for="value in apertureValues"
              :key="value"
              class="scroll-item"
              :class="{ active: Math.abs(aperture - value) < 0.1 }"
              @mouseover="aperture = value"
            >
              f/{{ value.toFixed(1) }}
            </div>
          </div>
        </div>
      </div>
      <div class="reading-scroll">
        <div class="reading-label">快门速度</div>
        <div class="scroll-container">
          <div class="scroll-track">
            <div
              v-for="speed in calculateShutterSpeeds()"
              :key="speed"
              class="scroll-item"
              :class="{ active: Math.abs(shutterSpeed - speed) < 0.01 }"
              @mouseover="shutterSpeed = speed"
            >
              {{ speed >= 1 ? `${Math.round(speed)}s` : `1/${Math.ceil(1/speed)}` }}
            </div>
          </div>
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
  height: 200px;
}

.reading-scroll {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.reading-label {
  font-size: 0.9rem;
  color: #888;
  margin-bottom: 0.5rem;
}

.scroll-container {
  height: 150px;
  overflow-y: auto;
  position: relative;
  width: 120px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scroll-container::-webkit-scrollbar {
  display: none;
}

.scroll-track {
  padding: 60px 0;
}

.scroll-item {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 1rem;
}

.scroll-item.active {
  color: #fff;
  font-size: 1.2rem;
  font-weight: bold;
  background: rgba(255, 255, 255, 0.1);
}

.scroll-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}
</style>