<script setup lang="ts">
import { useCamera } from '../hooks/useCamera'
import { onMounted, onUnmounted } from 'vue'

const {
  video,
  isStreaming,
  isLoading,
  hasCameraPermission,
  errorMessage,
  startCamera,
  stopCamera,
  switchCamera
} = useCamera()

// 在组件挂载时启动摄像头
onMounted(() => {
  startCamera()
})

// 在组件卸载时停止摄像头
onUnmounted(() => {
  stopCamera()
})

defineExpose({
  video,
  isStreaming,
  switchCamera
})
</script>

<template>
  <div class="camera-preview">
    <div class="preview-container">
      <video ref="video" autoplay playsinline :class="{ active: isStreaming }"></video>
      <div v-if="!isStreaming" class="camera-status">
        <template v-if="isLoading">正在启动摄像头...</template>
        <template v-else-if="!hasCameraPermission">{{ errorMessage }}</template>
        <template v-else>等待摄像头权限...</template>
      </div>
    </div>
    <button class="switch-camera-btn" @click="switchCamera" v-if="isStreaming">
      切换摄像头
    </button>
  </div>
</template>

<style scoped>
.camera-preview {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.preview-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}

video.active {
  opacity: 1;
}

.camera-status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  text-align: center;
  font-size: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
}

.switch-camera-btn {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.switch-camera-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.switch-camera-btn:active {
  transform: scale(0.95);
}
</style>