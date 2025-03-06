import { ref } from 'vue'

export interface CameraState {
  stream: MediaStream | null
  isStreaming: boolean
  isLoading: boolean
  hasCameraPermission: boolean
  errorMessage: string
}

export function useCamera() {
  const video = ref<HTMLVideoElement | null>(null)
  const stream = ref<MediaStream | null>(null)
  const isStreaming = ref(false)
  const isLoading = ref(false)
  const hasCameraPermission = ref(true)
  const errorMessage = ref('')

  // 启动摄像头
  async function startCamera() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      // 请求摄像头权限
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })

      if (video.value) {
        video.value.srcObject = stream.value
        isStreaming.value = true
        hasCameraPermission.value = true

        // 等待视频加载完成
        await new Promise((resolve) => {
          if (video.value) {
            video.value.onloadedmetadata = () => resolve(true)
          }
        })

        isLoading.value = false
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
          const newDevice = videoDevices.find((device) => device.deviceId !== currentDeviceId)

          if (newDevice) {
            stream.value = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: newDevice.deviceId } }
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

  return {
    video,
    stream,
    isStreaming,
    isLoading,
    hasCameraPermission,
    errorMessage,
    startCamera,
    stopCamera,
    switchCamera
  }
}