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
  if (!isStreaming.value) {
    const standardSpeeds = [1/8000, 1/4000, 1/2000, 1/1000, 1/500, 1/250, 1/125, 1/60, 1/30, 1/15, 1/8, 1/4, 1/2, 1, 2, 4, 8, 15, 30]
    return standardSpeeds
  }
  
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
      <div class="left-panel">
        <div class="scales">
          <div class="scale aperture-scale">
            <div class="scale-label">光圈值</div>
            <div class="scale-track">
              <div
                v-for="value in apertureValues"
                :key="value"
                class="scale-item"
                :class="{ active: Math.abs(aperture - value) < 0.1 }"
                @click="aperture = value"
              >
                f/{{ value.toFixed(1) }}
              </div>
            </div>
          </div>
          
          <div class="scale shutter-scale">
            <div class="scale-label">快门速度</div>
            <div class="scale-track">
              <div
                v-for="speed in calculateShutterSpeeds()"
                :key="speed"
                class="scale-item"
                :class="{ active: Math.abs(shutterSpeed - speed) < 0.01 }"
                @click="shutterSpeed = speed"
              >
                {{ speed >= 1 ? `${Math.round(speed)}s` : `1/${Math.round(1/speed)}` }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="right-panel">
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

.header {
  background: #000;
  padding: 1rem;
  text-align: center;
  border-bottom: 1px solid #333;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: normal;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.left-panel {
  width: 300px;
  background: #000;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
}

.scales {
  display: flex;
  height: 100%;
  padding: 1rem;
  gap: 1rem;
}

.scale {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  overflow: hidden;
}

.scale-label {
  padding: 0.5rem;
  text-align: center;
  font-size: 0.9rem;
  color: #888;
  background: rgba(0, 0, 0, 0.3);
}

.scale-track {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
}

.scale-track::-webkit-scrollbar {
  width: 4px;
}

.scale-track::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.scale-item {
  padding: 0.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  color: #666;
}

.scale-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.scale-item.active {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-weight: bold;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 1rem;
}

.preview {
  flex: 1;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
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

.measure-button {
  padding: 1rem 2rem;
  font-size: 1.2rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.3s;
  align-self: center;
}

.measure-button:hover {
  background: #45a049;