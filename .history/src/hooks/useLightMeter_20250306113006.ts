import { ref, computed } from 'vue'

export interface LightMeterState {
  currentEV: number
  aperture: number
  shutterSpeed: number
  iso: string
  exposureCompensation: number
  typeFlag: 'aperture' | 'shutter'
}

export function useLightMeter() {
  // 基础状态
  const currentEV = ref(0)
  const aperture = ref(0)
  const shutterSpeed = ref(0)
  const iso = ref('100')
  const exposureCompensation = ref(0)
  const typeFlag = ref<'aperture' | 'shutter'>('aperture')

  // 设备亮度补偿因子
  const deviceBrightnessCompensation = 1.0
  const baseCalibrationFactor = 1.2

  // 标准光圈值列表
  const standardApertureValues = [
    1.0, 1.4, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0, 22.0
  ]

  // 标准快门速度列表
  const standardShutterSpeeds = [
    1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125,
    1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 15, 30
  ]

  // 获取最接近的标准快门速度
  function getStandardShutterSpeed(value: number): number {
    return standardShutterSpeeds.reduce((prev, curr) => {
      return Math.abs(Math.log2(curr) - Math.log2(value)) <
        Math.abs(Math.log2(prev) - Math.log2(value)) ? curr : prev
    })
  }

  // 获取最接近的标准光圈值
  function getStandardApertureValue(value: number): number {
    return standardApertureValues.reduce((prev, curr) => {
      return Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    })
  }

  // 计算曝光值
  function calculateEV(luminance: number, samples: number = 5): number {
    let totalEV = 0

    // 单次测光计算
    function singleMeasurement(): number {
      const calibrationFactor = baseCalibrationFactor * deviceBrightnessCompensation

      // 添加高光和阴影保护
      const minLuminance = 0.001 // 防止log2(0)
      const maxLuminance = 0.95 // 防止过曝

      const clampedLuminance = Math.max(minLuminance, Math.min(maxLuminance, luminance))
      return Math.log2(clampedLuminance * 100 * calibrationFactor)
    }

    // 进行多次采样
    for (let i = 0; i < samples; i++) {
      totalEV += singleMeasurement()
    }

    return totalEV / samples
  }

  // 更新曝光参数
  function updateExposureParams(ev: number) {
    currentEV.value = ev

    if (typeFlag.value === 'aperture') {
      // 光圈优先模式：计算快门速度
      const shutterValue =
        Math.pow(2, -(ev - exposureCompensation.value)) *
        (100 / Number(iso.value)) *
        Math.pow(aperture.value, 2)
      console.log('🚀 ~ updateExposureParams ~ shutterValue:', shutterValue);

      // 检查快门值是否在有效范围内
      if (shutterValue < 1 / 8000 || shutterValue > 30) {
        shutterSpeed.value = 0 // 使用0表示无效值
      } else {
        shutterSpeed.value = getStandardShutterSpeed(shutterValue)
      }
    } else if (typeFlag.value === 'shutter' && shutterSpeed.value > 0) {
      // 快门优先模式：计算光圈值
      const calculatedAperture = Math.sqrt(
        shutterSpeed.value *
        (100 / Number(iso.value)) *
        Math.pow(2, ev - exposureCompensation.value)
      )
      console.log('🚀 ~ updateExposureParams ~ calculatedAperture:', calculatedAperture);

      // 检查光圈值是否在有效范围内
      if (calculatedAperture < 1.0 || calculatedAperture > 22) {
        aperture.value = 0 // 使用0表示无效值
      } else {
        aperture.value = getStandardApertureValue(calculatedAperture)
      }
    }
  }

  // 切换测光模式
  function toggleMeteringMode() {
    typeFlag.value = typeFlag.value === 'aperture' ? 'shutter' : 'aperture'
  }

  return {
    // 状态
    currentEV,
    aperture,
    shutterSpeed,
    iso,
    exposureCompensation,
    typeFlag,

    // 常量
    standardApertureValues,
    standardShutterSpeeds,

    // 方法
    calculateEV,
    updateExposureParams,
    toggleMeteringMode
  }
}