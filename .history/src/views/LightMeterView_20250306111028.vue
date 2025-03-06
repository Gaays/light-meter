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
const isLoading = ref(false)
const errorMessage = ref('')
const hasCameraPermission = ref(true)
const isMeasuring = ref(false)

// 测光模式：'aperture'表示光圈优先，'shutter'表示快门优先
const typeFlag = ref('aperture')

// 控制选择框显示状态
const showApertureSelector = ref(false)
const showShutterSelector = ref(false)
const showIsoSelector = ref(false)
const showEvSelector = ref(false)

// 标准光圈值
const apertureValues = [1.0, 1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22]

// 标准快门速度
const standardShutterSpeeds = [
  1 / 8000,
  1 / 4000,
  1 / 2000,
  1 / 1000,
  1 / 500,
  1 / 250,
  1 / 125,
  1 / 60,
  1 / 30,
  1 / 15,
  1 / 8,
  1 / 4,
  1 / 2,
  1,
  2,
  4,
  8,
  15,
  30,
]

// 计算当前EV值
const currentEV = computed(() => {
  if (shutterSpeed.value === 0) return 0
  const apertureEV = Math.log2(Math.pow(aperture.value, 2))
  const speedEV = Math.log2(1 / shutterSpeed.value)
  const isoEV = Math.log2(Number(iso.value) / 100)
  return apertureEV + speedEV - isoEV - exposureCompensation.value
})

// 获取标准快门速度
function getStandardShutterSpeed(shutterValue: number) {
  return standardShutterSpeeds.reduce((prev, curr) => {
    return Math.abs(Math.log2(curr) - Math.log2(shutterValue)) <
      Math.abs(Math.log2(prev) - Math.log2(shutterValue))
      ? curr
      : prev
  })
}

// 获取标准光圈值
function getStandardAperture(apertureValue: number) {
  return apertureValues.reduce((prev, curr) => {
    return Math.abs(Math.log2(curr) - Math.log2(apertureValue)) <
      Math.abs(Math.log2(prev) - Math.log2(apertureValue))
      ? curr
      : prev
  })
}

// 分析亮度并计算曝光参数
function analyzeBrightness() {
  if (!video.value || !isStreaming.value) return
  // 关闭所有选择框
  showEvSelector.value = false
  showIsoSelector.value = false
  showShutterSelector.value = false
  showApertureSelector.value = false

  isMeasuring.value = true

  const samples = 10 // 增加采样次数以提高准确性
  let totalEV = 0
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return

  const singleMeasurement = () => {
    canvas.width = video.value!.videoWidth
    canvas.height = video.value!.videoHeight
    context.drawImage(video.value!, 0, 0)

    // 计算中心重点测光区域
    const centerWeight = 0.6 // 中心区域权重60%
    const centerArea = {
      x: Math.floor(canvas.width * 0.3),
      y: Math.floor(canvas.height * 0.3),
      width: Math.floor(canvas.width * 0.4),
      height: Math.floor(canvas.height * 0.4),
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    let totalLuminance = 0
    let pixelCount = 0

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4

        // 检查像素是否在中心区域
        const isCenter =
          x >= centerArea.x &&
          x <= centerArea.x + centerArea.width &&
          y >= centerArea.y &&
          y <= centerArea.y + centerArea.height

        // 应用中心重点测光
        const weight = isCenter ? centerWeight : 1 - centerWeight

        const r = data[i] / 255
        const g = data[i + 1] / 255
        const b = data[i + 2] / 255

        // 转换为线性RGB（伽马校正）
        const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
        const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
        const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

        // 使用Rec. 709系数计算亮度
        const luminance = (0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear) * weight
        totalLuminance += luminance
        pixelCount++
      }
    }

    const averageLuminance = totalLuminance / pixelCount

    // 根据设备特性调整校准因子
    const baseCalibrationFactor = 12.5
    const deviceBrightnessCompensation = 1.2
    const calibrationFactor = baseCalibrationFactor * deviceBrightnessCompensation

    // 添加高光和阴影保护
    const minLuminance = 0.001 // 防止log2(0)
    const maxLuminance = 0.95 // 防止过曝

    const clampedLuminance = Math.max(minLuminance, Math.min(maxLuminance, averageLuminance))

    return Math.log2(clampedLuminance * 100 * calibrationFactor)
  }

  // 进行多次采样
  for (let i = 0; i < samples; i++) {
    totalEV += singleMeasurement()
  }

  const calculatedEV = totalEV / samples

  if (typeFlag.value === 'aperture') {
    // 光圈优先模式：计算快门速度，加入曝光补偿
    const shutterValue =
      Math.pow(2, -(calculatedEV - exposureCompensation.value)) *
      (100 / Number(iso.value)) *
      Math.pow(aperture.value, 2)

    // 检查快门值是否在有效范围内
    if (shutterValue < 1 / 8000 || shutterValue > 30) {
      shutterSpeed.value = 0 // 使用0表示无效值
    } else {
      shutterSpeed.value = getStandardShutterSpeed(shutterValue)
    }
  } else if (typeFlag.value === 'shutter' && shutterSpeed.value > 0) {
    // 快门优先模式：计算光圈值，加入曝光补偿
    const calculatedAperture = Math.sqrt(
      shutterSpeed.value *
        (100 / Number(iso.value)) *
        Math.pow(2, calculatedEV - exposureCompensation.value),
    )

    // 检查光圈值是否在有效范围内
    if (calculatedAperture < 1.0 || calculatedAperture > 22) {
      aperture.value = 0 // 使用0表示无效值
    } else {
      aperture.value = getStandardAperture(calculatedAperture)
    }
  }

  isMeasuring.value = false
}

// 监听ISO和曝光补偿变化，根据当前模式更新参数
watch([iso, exposureCompensation], () => {
  if (shutterSpeed.value > 0) {
    analyzeBrightness()
  }
})

// 检测设备类型
const isMobileDevice = computed(() => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
})

// 启动摄像头
async function startCamera() {
  if (!hasCameraPermission.value) {
    try {
      const permission = await navigator.permissions.query({ name: 'camera' });
      if (permission.state === 'denied') {
        errorMessage.value = '请在浏览器设置中启用摄像头权限';
        return;
      }
    } catch (e) {
      console.error('Permission query error:', e);
    }
  }
  try {
    isLoading.value = true
    errorMessage.value = ''

    // 检查是否支持mediaDevices API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('您的浏览器不支持访问摄像头')
    }

    // 移动设备优先使用后置摄像头，并优化配置参数
    const constraints = {
      video: {
        facingMode: isMobileDevice.value ? { exact: 'environment' } : 'user',
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 30, min: 15 },
      },
    }

    stream.value = await navigator.mediaDevices.getUserMedia(constraints)

    if (video.value) {
      video.value.srcObject = stream.value
      video.value.onloadedmetadata = () => {
        video.value
          .play()
          .then(() => {
            isStreaming.value = true
            isLoading.value = false
            // 自动进行一次测光
            setTimeout(() => analyzeBrightness(), 1000)
          })
          .catch((err) => {
            console.error('Error playing video:', err)
            isLoading.value = false
            errorMessage.value = '视频播放失败，请刷新页面重试'
          })
      }
    }
  } catch (error) {
    console.error('Error accessing camera:', error)
    isLoading.value = false
    hasCameraPermission.value = false
    errorMessage.value = error instanceof Error ? error.message : '无法访问摄像头，请检查权限设置'
  }
}

// 停止摄像头
function stopCamera() {
  if (stream.value) {
    stream.value.getTracks().forEach((track) => track.stop())
    stream.value = null
    isStreaming.value = false
  }
}

// 切换摄像头（如果设备有多个摄像头）
async function switchCamera() {
  if (stream.value) {
    // 停止当前摄像头
    stopCamera()

    try {
      // 获取所有视频输入设备
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')

      if (videoDevices.length > 1) {
        // 如果有多个摄像头，尝试切换
        const currentTrack = stream.value?.getVideoTracks()[0]
        const currentDeviceId = currentTrack?.getSettings().deviceId

        // 找到不同于当前使用的摄像头
        const newDevice = videoDevices.find((device) => device.deviceId !== currentDeviceId)

        if (newDevice) {
          stream.value = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: newDevice.deviceId } },
          })

          if (video.value) {
            video.value.srcObject = stream.value
            isStreaming.value = true
          }
        }
      }
    } catch (error) {
      console.error('Error switching camera:', error)
      // 如果切换失败，尝试重新启动默认摄像头
      startCamera()
    }
  }
}

// 切换测光模式
function toggleMeteringMode() {
  typeFlag.value = typeFlag.value === 'aperture' ? 'shutter' : 'aperture'

  // 切换模式后，根据当前模式重新计算参数
  if (shutterSpeed.value > 0) {
    analyzeBrightness()
  }
}

// 关闭所有选择器
function closeAllSelectors() {
  showApertureSelector.value = false
  showShutterSelector.value = false
  showIsoSelector.value = false
  showEvSelector.value = false
}

onMounted(() => {
  // 移除自动启动摄像头
  // startCamera()

  // 添加设备方向变化监听，以便在旋转设备时调整UI
  window.addEventListener('orientationchange', () => {
    // 给UI一些时间来调整
    setTimeout(() => {
      if (shutterSpeed.value > 0) {
        analyzeBrightness()
      }
    }, 300)
  })
})

onUnmounted(() => {
  stopCamera()
  window.removeEventListener('orientationchange', () => {})
})

// 处理选择器显示/隐藏的方法
function handleApertureClick() {
  showApertureSelector.value = !showApertureSelector.value
  showShutterSelector.value = false
  showIsoSelector.value = false
  showEvSelector.value = false
}

function handleShutterClick() {
  showShutterSelector.value = !showShutterSelector.value
  showApertureSelector.value = false
  showIsoSelector.value = false
  showEvSelector.value = false
}

function handleIsoClick() {
  showIsoSelector.value = !showIsoSelector.value
  showApertureSelector.value = false
  showShutterSelector.value = false
  showEvSelector.value = false
}

function handleEvClick() {
  showEvSelector.value = !showEvSelector.value
  showApertureSelector.value = false
  showShutterSelector.value = false
  showIsoSelector.value = false
}

function handleApertureSelect(value: number) {
  aperture.value = value
  showApertureSelector.value = false
  // 切换到光圈优先模式
  typeFlag.value = 'aperture'
  // 根据新的光圈值重新计算快门速度
  analyzeBrightness()
}

function handleShutterSelect(speed: number) {
  shutterSpeed.value = speed
  showShutterSelector.value = false
  // 切换到快门优先模式
  typeFlag.value = 'shutter'
  // 根据新的快门速度更新光圈值
  analyzeBrightness()
}

function handleIsoSelect(value: number) {
  iso.value = value
  showIsoSelector.value = false
}
</script>

<template>
  <div class="light-meter">
    <div class="header">
      <h1>测光表</h1>
    </div>

    <div class="main-content">
      <div class="preview">
        <video ref="video" autoplay playsinline :class="{ active: isStreaming }"></video>
        <div v-if="!isStreaming" class="no-camera">等待摄像头权限...</div>
      </div>

      <button v-if="!isStreaming" class="start-camera-button" @click="startCamera">启动摄像头</button>
<button v-else class="measure-button" @click="analyzeBrightness">测光</button>

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
            <span class="value">{{ exposureCompensation }}EV</span>
          </div>
        </div>
      </div>

      <!-- 弹出式选择器 -->
      <div v-if="showApertureSelector" class="popup-selector">
        <div class="popup-header">
          <h3>选择光圈值</h3>
          <button class="close-btn" @click="showApertureSelector = false">×</button>
        </div>
        <div class="aperture-selector">
          <div
            v-for="value in apertureValues"
            :key="value"
            class="selector-item"
            :class="{ active: aperture === value }"
            @click="handleApertureSelect(value)"
          >
            f/{{ value.toFixed(1) }}
          </div>
        </div>
      </div>

      <div v-if="showShutterSelector" class="popup-selector">
        <div class="popup-header">
          <h3>选择快门速度</h3>
          <button class="close-btn" @click="showShutterSelector = false">×</button>
        </div>
        <div class="shutter-selector">
          <div
            v-for="speed in standardShutterSpeeds"
            :key="speed"
            class="selector-item"
            :class="{ active: shutterSpeed === speed }"
            @click="handleShutterSelect(speed)"
          >
            {{ speed >= 1 ? `${Math.round(speed)}s` : `1/${Math.round(1 / speed)}` }}
          </div>
        </div>
      </div>

      <div v-if="showIsoSelector" class="popup-selector">
        <div class="popup-header">
          <h3>选择ISO值</h3>
          <button class="close-btn" @click="showIsoSelector = false">×</button>
        </div>
        <div class="iso-selector">
          <div
            v-for="value in [100, 200, 400, 800, 1600, 3200]"
            :key="value"
            class="selector-item"
            :class="{ active: Number(iso) === value }"
            @click="handleIsoSelect(value)"
          >
            {{ value }}
          </div>
        </div>
      </div>

      <div v-if="showEvSelector" class="popup-selector">
        <div class="popup-header">
          <h3>调整曝光补偿</h3>
          <button class="close-btn" @click="showEvSelector = false">×</button>
        </div>
        <div class="ev-selector">
          <div class="ev-value">{{ exposureCompensation }}EV</div>
          <input
            type="range"
            v-model="exposureCompensation"
            min="-3"
            max="3"
            step="0.3"
            class="exposure-slider"
          />
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
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 8px;
  position: relative;
  margin-bottom: 0.5rem;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.8; /* 修改初始透明度，确保视频可见 */
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
  background: #4caf50;
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

.controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
  cursor: pointer;
  padding: 0.2rem 0.5rem;
}

.ev-selector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.ev-value {
  font-size: 1.2rem;
  font-weight: bold;
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
  background: #4caf50;
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
  background: #4caf50;
  cursor: pointer;
}

.exposure-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #4caf50;
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
