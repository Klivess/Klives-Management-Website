<template>
    <div class="log-entry" :class="getLogTypeClass(log.type)">
        <div class="log-header">
            <div class="log-meta">
                <span class="log-id">#{{ log.logID }}</span>
                <span class="log-service">{{ log.serviceName }}</span>
                <span class="log-time">{{ formatTime(log.TimeOfLog) }}</span>
            </div>
            <div class="log-type-badge" :class="getLogTypeClass(log.type)">
                {{ getLogTypeText(log.type) }}
            </div>
        </div>
        <div class="log-message">
            {{ log.message }}
        </div>
        <div v-if="log.errorInfo" class="error-details">
            <details>
                <summary>Error Details</summary>
                <div class="error-content">
                    <div class="error-section">
                        <strong>Exception Type:</strong> {{ log.errorInfo.ExceptionType }}
                    </div>
                    <div class="error-section">
                        <strong>Message:</strong> {{ log.errorInfo.Message }}
                    </div>
                    <div v-if="log.errorInfo.StackTrace" class="error-section">
                        <strong>Stack Trace:</strong>
                        <pre class="stack-trace">{{ log.errorInfo.StackTrace }}</pre>
                    </div>
                </div>
            </details>
        </div>
    </div>
</template>

<script>
export default {
    name: 'KMLogEntry',
    props: {
        log: {
            type: Object,
            required: true
        }
    },
    methods: {
        getLogTypeClass(type) {
            switch(type) {
                case 0: return 'log-info';
                case 1: return 'log-error';
                case 2: return 'log-warning';
                default: return 'log-info';
            }
        },
        getLogTypeText(type) {
            switch(type) {
                case 0: return 'INFO';
                case 1: return 'ERROR';
                case 2: return 'WARNING';
                default: return 'INFO';
            }
        },
        formatTime(timeString) {
            const date = new Date(timeString);
            return date.toLocaleString();
        }
    }
}
</script>

<style scoped>
.log-entry {
    border-left: 4px solid;
    margin-bottom: 15px;
    padding: 15px;
    background-color: #161616;
    border-radius: 8px;
    transition: all 0.3s ease;
}

.log-entry:hover {
    transform: translateX(5px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.log-entry.log-info {
    border-left-color: #4d9e39;
}

.log-entry.log-error {
    border-left-color: #e74c3c;
}

.log-entry.log-warning {
    border-left-color: #f39c12;
}

.log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.log-meta {
    display: flex;
    gap: 15px;
    align-items: center;
}

.log-id {
    font-family: 'Courier New', monospace;
    color: #969696;
    font-size: 12px;
}

.log-service {
    font-weight: bold;
    color: #4d9e39;
}

.log-time {
    color: #969696;
    font-size: 12px;
}

.log-type-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
}

.log-type-badge.log-info {
    background-color: rgba(77, 158, 57, 0.2);
    color: #4d9e39;
}

.log-type-badge.log-error {
    background-color: rgba(231, 76, 60, 0.2);
    color: #e74c3c;
}

.log-type-badge.log-warning {
    background-color: rgba(243, 156, 18, 0.2);
    color: #f39c12;
}

.log-message {
    color: #ffffff;
    line-height: 1.4;
    margin-bottom: 10px;
}

.error-details {
    margin-top: 15px;
}

.error-details summary {
    color: #e74c3c;
    cursor: pointer;
    font-weight: bold;
    padding: 5px 0;
}

.error-details summary:hover {
    color: #c0392b;
}

.error-content {
    margin-top: 10px;
    padding: 10px;
    background-color: rgba(231, 76, 60, 0.1);
    border-radius: 4px;
}

.error-section {
    margin-bottom: 10px;
}

.error-section strong {
    color: #e74c3c;
}

.stack-trace {
    background-color: #000;
    color: #ffffff;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.3;
    margin-top: 5px;
}
</style>
