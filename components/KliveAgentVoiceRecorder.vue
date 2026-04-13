<template>
  <div class="voice-recorder">
    <div class="voice-header">
      <h3>Voice Command</h3>
      <span class="voice-status" :class="{ active: isRecording, processing: isProcessing }"
        >{{ statusText }}</span
      >
    </div>

    <div class="voice-controls">
      <button
        class="record-button"
        :class="{ recording: isRecording, disabled: isProcessing }"
        @click="toggleRecording"
        :disabled="isProcessing"
        :title="isRecording ? 'Recording will stop automatically via backend VAD' : 'Start voice command'"
      >
        <span class="button-icon">{{ isRecording ? '🎙' : '🎤' }}</span>
        <span class="button-text">{{ isRecording ? 'Recording...' : 'Speak Now' }}</span>
      </button>

      <div class="voice-visualizer" v-if="isRecording">
        <div
          v-for="(bar, idx) in visualizerBars"
          :key="idx"
          class="visualizer-bar"
          :style="{ height: bar + '%' }"
        ></div>
      </div>
    </div>

    <div v-if="recordingTime > 0" class="recording-time">
      {{ formatTime(recordingTime) }} / 30s
    </div>

    <div v-if="transcript" class="voice-transcript">
      <div class="transcript-label">Transcript:</div>
      <div class="transcript-text">{{ transcript }}</div>
      <div v-if="transcriptConfidence > 0" class="transcript-confidence">
        Confidence: {{ Math.round(transcriptConfidence * 100) }}%
      </div>
    </div>

    <div v-if="voiceDiagnostics" class="voice-diagnostics">
      <div class="diagnostic-item">
        <span class="label">Audio Duration:</span>
        <span class="value">{{ voiceDiagnostics.inputAudioDurationMs }}ms</span>
      </div>
      <div class="diagnostic-item">
        <span class="label">VAD Processing:</span>
        <span class="value">{{ voiceDiagnostics.vadDurationMs }}ms</span>
      </div>
      <div class="diagnostic-item">
        <span class="label">STT Processing:</span>
        <span class="value">{{ voiceDiagnostics.sttDurationMs }}ms</span>
      </div>
      <div class="diagnostic-item">
        <span class="label">Total Processing:</span>
        <span class="value">{{ voiceDiagnostics.totalDurationMs }}ms</span>
      </div>
      <div v-if="voiceDiagnostics.validationError" class="diagnostic-error">
        ⚠ {{ voiceDiagnostics.validationError }}
      </div>
    </div>

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <div class="voice-footer">
      <small>Backend VAD auto-detects speech end • Max duration: 30 seconds • Requires HTTPS • English speech only</small>
    </div>
  </div>
</template>

<script>
export default {
  name: 'KliveAgentVoiceRecorder',
  props: {
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['voice-command'],
  data() {
    return {
      isRecording: false,
      isProcessing: false,
      recordingTime: 0,
      recordingInterval: null,
      mediaStream: null,
      mediaRecorder: null,
      audioChunks: [],
      transcript: '',
      transcriptConfidence: 0,
      voiceDiagnostics: null,
      errorMessage: '',
      visualizerBars: Array(20).fill(0),
      analyser: null,
      animationId: null,
      maxRecordingDuration: 30000, // 30 seconds
      websocket: null,
      sessionId: null
    };
  },
  computed: {
    statusText() {
      if (this.isProcessing) return 'Processing with VAD...';
      if (this.isRecording) return 'Streaming to VAD...';
      if (this.transcript) return 'Command ready';
      return 'Ready';
    }
  },
  methods: {
    async toggleRecording() {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        await this.startRecording();
      }
    },

    async startRecording() {
      this.errorMessage = '';
      this.transcript = '';
      this.voiceDiagnostics = null;
      this.transcriptConfidence = 0;
      this.sessionId = this.generateSessionId();

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('microphone access not supported on this browser');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000
          }
        });

        this.mediaStream = stream;
        this.audioChunks = [];

        // Initialize WebSocket connection to backend VAD stream
        this.initializeWebSocket();

        // Setup MediaRecorder with timeslice to stream chunks
        const mimeType = this.getSupportedMimeType();
        this.mediaRecorder = new MediaRecorder(stream, { mimeType });

        this.mediaRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            // Send chunk to backend for VAD processing
            this.websocket.send(e.data);
          }
        };

        this.mediaRecorder.onstart = () => {
          this.recordingTime = 0;
          this.recordingInterval = setInterval(() => {
            this.recordingTime += 100;
            if (this.recordingTime >= this.maxRecordingDuration) {
              this.stopRecording();
            }
          }, 100);
          this.startVisualization();
        };

        this.mediaRecorder.onstop = async () => {
          clearInterval(this.recordingInterval);
          if (this.animationId) {
            cancelAnimationFrame(this.animationId);
          }
          // Signal end of stream to backend
          if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({ type: 'END_STREAM' }));
          }
        };

        this.isRecording = true;
        // Start recording with 100ms timeslice for streaming
        this.mediaRecorder.start(100);
      } catch (error) {
        this.errorMessage = `Microphone error: ${error.message}`;
        this.isRecording = false;
      }
    },

    initializeWebSocket() {
      const password = this.getPassword();
      const conversationId =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('kliveagent-conversation-id') || ''
          : '';

      // Use wss for secure WebSocket (or ws if on localhost)
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.host;
      const wsUrl = `${protocol}://${host}/kliveagent/brain/voice-stream?sessionId=${this.sessionId}&conversationId=${conversationId}&token=${encodeURIComponent(password)}`;

      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        // Connection established
      };

      this.websocket.onmessage = (event) => {
        try {
          const result = JSON.parse(event.data);

          if (result.type === 'RESULT') {
            // Backend detected speech end and processed
            this.transcript = result.transcript || '';
            this.transcriptConfidence = result.diagnostics?.transcriptConfidence || 0;
            this.voiceDiagnostics = result.diagnostics || null;
            this.isProcessing = false;

            // Stop recording
            if (this.mediaRecorder && this.isRecording) {
              this.mediaRecorder.stop();
              this.isRecording = false;
            }

            // Stop all tracks
            if (this.mediaStream) {
              this.mediaStream.getTracks().forEach((track) => track.stop());
              this.mediaStream = null;
            }

            // Close WebSocket
            if (this.websocket) {
              this.websocket.close();
              this.websocket = null;
            }

            // Emit the voice command event
            if (this.transcript) {
              this.$emit('voice-command', {
                transcript: this.transcript,
                confidence: this.transcriptConfidence,
                diagnostics: this.voiceDiagnostics,
                brainResult: result
              });
            }
          } else if (result.type === 'ERROR') {
            this.errorMessage = result.message || 'Backend error processing voice';
            this.stopRecording();
          } else if (result.type === 'STATUS') {
            // Backend sending status updates (optional)
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      this.websocket.onerror = (error) => {
        this.errorMessage = 'WebSocket connection error. Make sure the backend supports voice streaming.';
        console.error('WebSocket error:', error);
        this.stopRecording();
      };

      this.websocket.onclose = () => {
        // Connection closed
      };
    },

    generateSessionId() {
      return 'voice_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    },

    stopRecording() {
      if (this.mediaRecorder && this.isRecording) {
        this.mediaRecorder.stop();
        this.isRecording = false;

        // Stop all tracks
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }

        // Close WebSocket
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.close();
          this.websocket = null;
        }

        this.recordingTime = 0;
      }
    },

    getSupportedMimeType() {
      const types = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];

      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      }

      return 'audio/webm';
    },

    formatTime(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const seconds = totalSeconds % 60;
      const minutes = Math.floor(totalSeconds / 60);

      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    getPassword() {
      if (typeof localStorage === 'undefined') return '';
      return localStorage.getItem('auth_token') || '';
    }
  },
  beforeUnmount() {
    if (this.isRecording) {
      this.stopRecording();
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
      this.websocket = null;
    }
  }
};
</script>

<style scoped lang="scss">
.voice-recorder {
  background: rgba(20, 20, 20, 0.8);
  border: 1px solid #333;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;

  .voice-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;

    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: #fff;
      margin: 0;
    }

    .voice-status {
      font-size: 0.9rem;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      background: #333;
      color: #aaa;
      font-weight: 500;

      &.active {
        background: rgba(221, 51, 51, 0.3);
        color: #dd3333;
        animation: pulse 1.5s infinite;
      }

      &.processing {
        background: rgba(255, 192, 61, 0.3);
        color: #ffc03d;
        animation: pulse 1s infinite;
      }
    }
  }

  .voice-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;

    .record-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 0.75rem 1.5rem;
      background-color: transparent;
      color: #4d9e39;
      border: 2px solid #2e2e2e;
      border-radius: 0;
      font-size: 0.95rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.15rem;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.19, 1, 0.22, 1);
      position: relative;
      overflow: hidden;

      &:hover:not(.disabled):not(.recording) {
        background-color: rgba(255, 255, 255, 0.05);
        border-color: #fff;
        color: #fff;
        box-shadow: 0 0 5px rgba(77, 158, 57, 0.8);
      }

      &.recording {
        background-color: rgba(221, 51, 51, 0.1);
        border-color: #dd3333;
        color: #dd3333;
        animation: pulse-glow 1.5s infinite;
      }

      &.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .button-icon {
        font-size: 1.2rem;
      }

      .button-text {
        font-weight: 600;
      }
    }

    .voice-visualizer {
      display: flex;
      gap: 2px;
      height: 40px;
      align-items: flex-end;
      flex: 1;
      max-width: 300px;

      .visualizer-bar {
        flex: 1;
        background: linear-gradient(180deg, #4d9e39, #2d5e19);
        border-radius: 2px;
        min-height: 2px;
        transition: height 0.05s ease;
      }
    }
  }

  .recording-time {
    text-align: center;
    font-size: 0.95rem;
    color: #dd3333;
    font-weight: 600;
    margin-bottom: 1rem;
    font-family: 'Courier New', monospace;
  }

  .voice-transcript {
    background: rgba(57, 57, 57, 0.5);
    border-left: 3px solid #4d9e39;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;

    .transcript-label {
      font-size: 0.85rem;
      color: #aaa;
      font-weight: 600;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .transcript-text {
      font-size: 1rem;
      color: #fff;
      line-height: 1.5;
      margin-bottom: 0.5rem;
      word-break: break-word;
    }

    .transcript-confidence {
      font-size: 0.85rem;
      color: #4d9e39;
      font-weight: 500;
    }
  }

  .voice-diagnostics {
    background: rgba(30, 30, 30, 0.8);
    border: 1px solid #222;
    border-radius: 4px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;

    .diagnostic-item {
      display: flex;
      justify-content: space-between;
      padding: 0.4rem 0;
      color: #aaa;

      .label {
        font-weight: 600;
        color: #999;
      }

      .value {
        color: #4d9e39;
        font-family: 'Courier New', monospace;
        font-weight: 500;
      }
    }

    .diagnostic-error {
      color: #dd3333;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid #333;
    }
  }

  .error-message {
    background: rgba(221, 51, 51, 0.15);
    border-left: 3px solid #dd3333;
    padding: 0.75rem;
    border-radius: 4px;
    color: #ff5555;
    font-size: 0.95rem;
    margin-bottom: 1rem;
  }

  .voice-footer {
    text-align: center;
    font-size: 0.8rem;
    color: #666;
    margin-top: 1rem;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

@keyframes pulse-glow {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(221, 51, 51, 0.7);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(221, 51, 51, 0);
  }
}
</style>
