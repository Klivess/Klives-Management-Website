<template>
    <div style="padding: 20px;">
        <!-- Header Section -->
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #62ce47; font-size: 2.5rem; margin-bottom: 10px;">KliveTech Device Manager</h1>
            <p style="color: #969696; font-size: 1.1rem;">Manage and control KliveTech Gadgets</p>
        </div>

        <!-- Loading State -->
        <div v-if="loading" style="text-align: center; padding: 50px;">
            <div style="color: #62ce47; font-size: 1.2rem;">Loading devices...</div>
        </div>

        <!-- No Devices State -->
        <div v-else-if="gadgets.length === 0" style="text-align: center; padding: 50px;">
            <div style="color: #969696; font-size: 1.2rem;">No devices connected</div>
            <KMButton 
                message="Refresh" 
                style="margin-top: 20px; width: 200px; height: 50px;"
                @click="loadGadgets"
            />
        </div>

        <!-- Devices Grid -->
        <div v-else style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px;">
            <div 
                v-for="gadget in gadgets" 
                :key="gadget.gadgetID"
                class="gadget-card"
            >
                <!-- Device Header -->
                <div class="gadget-header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div 
                            class="status-indicator"
                            :class="{ 'online': gadget.isOnline, 'offline': !gadget.isOnline }"
                        ></div>
                        <div>
                            <h3 style="color: #ffffff; margin: 0; font-size: 1.3rem;">{{ gadget.name }}</h3>
                            <p style="color: #969696; margin: 5px 0 0 0; font-size: 0.9rem;">ID: {{ gadget.gadgetID }}</p>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: #62ce47; font-size: 0.85rem;">{{ gadget.isOnline ? 'Online' : 'Offline' }}</div>
                        <div style="color: #969696; font-size: 0.8rem;">Connected: {{ formatTime(gadget.timeConnected) }}</div>
                        <div style="color: #969696; font-size: 0.8rem;">Last seen: {{ formatTime(gadget.lastMessageReceived) }}</div>
                    </div>
                </div>

                <!-- Device Info -->
                <div class="gadget-info">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div class="info-item">
                            <span style="color: #969696; font-size: 0.85rem;">IP Address</span>
                            <div style="color: #ffffff; font-family: monospace;">{{ gadget.IPAddress }}</div>
                        </div>
                        <div class="info-item">
                            <span style="color: #969696; font-size: 0.85rem;">Actions Available</span>
                            <div style="color: #62ce47; font-weight: bold;">{{ gadget.actions.length }}</div>
                        </div>
                    </div>
                </div>

                <!-- Actions Section -->
                <div class="actions-section">
                    <h4 style="color: #ffffff; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 1px solid #333;">Device Actions</h4>
                    
                    <div v-if="gadget.actions.length === 0" style="color: #969696; text-align: center; padding: 20px;">
                        No actions available for this device
                    </div>
                    
                    <div v-else style="display: flex; flex-direction: column; gap: 15px;">
                        <div 
                            v-for="(action, index) in gadget.actions" 
                            :key="index"
                            class="action-box"
                        >
                            <div style="margin-bottom: 10px;">
                                <h5 style="color: #62ce47; margin: 0; font-size: 1rem;">{{ action.name }}</h5>
                                <p style="color: #969696; margin: 5px 0 0 0; font-size: 0.85rem;">{{ action.paramDescription }}</p>
                            </div>

                            <!-- Parameter Type: None (3) -->
                            <div v-if="action.parameters === 3" style="display: flex; justify-content: center;">
                                <KMButton 
                                    :message="getActionButtonText(gadget, action, 'Execute', index)"
                                    :style="getActionButtonStyle(gadget, action, index)"
                                    @click="executeAction(gadget, action, null, index)"
                                />
                            </div>

                            <!-- Parameter Type: Bool (2) -->
                            <div v-else-if="action.parameters === 2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <KMButton 
                                    :message="getActionButtonText(gadget, action, 'True', index, true)"
                                    :style="getActionButtonStyle(gadget, action, index, true)"
                                    @click="executeAction(gadget, action, true, index, true)"
                                />
                                <KMButton 
                                    :message="getActionButtonText(gadget, action, 'False', index, false)"
                                    :style="getActionButtonStyle(gadget, action, index, false)"
                                    @click="executeAction(gadget, action, false, index, false)"
                                />
                            </div>

                            <!-- Parameter Type: Integer (0) -->
                            <div v-else-if="action.parameters === 0" style="display: flex; gap: 10px;">
                                <KMInputBox 
                                    type="number"
                                    placeholder="Enter number..."
                                    :value="actionInputs[`${gadget.gadgetID}_${index}`] || ''"
                                    @update:value="updateActionInput(`${gadget.gadgetID}_${index}`, $event)"
                                    style="flex: 1; height: 45px;"
                                />
                                <KMButton 
                                    :message="getActionButtonText(gadget, action, 'Execute', index)"
                                    :style="getActionButtonStyle(gadget, action, index)"
                                    @click="executeAction(gadget, action, actionInputs[`${gadget.gadgetID}_${index}`], index)"
                                />
                            </div>

                            <!-- Parameter Type: String (1) -->
                            <div v-else-if="action.parameters === 1" style="display: flex; gap: 10px;">
                                <KMInputBox 
                                    type="text"
                                    placeholder="Enter text..."
                                    :value="actionInputs[`${gadget.gadgetID}_${index}`] || ''"
                                    @update:value="updateActionInput(`${gadget.gadgetID}_${index}`, $event)"
                                    style="flex: 1; height: 45px;"
                                />
                                <KMButton 
                                    :message="getActionButtonText(gadget, action, 'Execute', index)"
                                    :style="getActionButtonStyle(gadget, action, index)"
                                    @click="executeAction(gadget, action, actionInputs[`${gadget.gadgetID}_${index}`], index)"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Refresh Button -->
        <div style="text-align: center; margin-top: 40px;">
            <KMButton 
                message="Refresh All Devices" 
                style="width: 450px; height: 50px;"
                @click="loadGadgets"
            />
        </div>
    </div>
</template>

<script setup>
definePageMeta({layout: 'navbar'});
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    name: 'KliveTech',
    data() {
        return {
            gadgets: [],
            loading: true,
            actionInputs: {}, // Store input values for each action
            actionStates: {} // Store button states for feedback
        };
    },
    methods: {
        async loadGadgets() {
            this.loading = true;
            try {
                const response = await RequestGETFromKliveAPI('/klivetech/GetAllGadgets', false, true);
                if (response.ok) {
                    this.gadgets = await response.json();
                } else {
                    console.error('Failed to load gadgets:', response.status);
                    if (process.client) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Connection Error',
                            text: 'Failed to load devices. Please check your connection.',
                            confirmButtonColor: '#4d9e39',
                            background: '#161516',
                            color: '#ffffff',
                            customClass: {
                                popup: 'swal-dark-theme'
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error loading gadgets:', error);
                if (process.client) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Error loading devices: ' + error.message,
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: {
                            popup: 'swal-dark-theme'
                        }
                    });
                }
            } finally {
                this.loading = false;
            }
        },

        async executeAction(gadget, action, parameter, actionIndex = 0, boolValue = null) {
            const buttonKey = `${gadget.gadgetID}_${actionIndex}_${boolValue !== null ? boolValue : 'main'}`;
            
            // Set button to loading state
            this.actionStates[buttonKey] = 'executing';
            
            try {
                // Validate parameter based on type
                if (action.parameters === 0 && parameter !== null) {
                    // Integer validation
                    const num = parseInt(parameter);
                    if (isNaN(num)) {
                        this.actionStates[buttonKey] = 'error';
                        setTimeout(() => {
                            this.actionStates[buttonKey] = 'default';
                        }, 2000);
                        
                        Swal.fire({
                            icon: 'warning',
                            title: 'Invalid Input',
                            text: 'Please enter a valid number',
                            confirmButtonColor: '#4d9e39',
                            background: '#161516',
                            color: '#ffffff',
                            customClass: {
                                popup: 'swal-dark-theme'
                            }
                        });
                        return;
                    }
                    parameter = num;
                } else if (action.parameters === 1 && (!parameter || parameter.trim() === '')) {
                    // String validation
                    this.actionStates[buttonKey] = 'error';
                    setTimeout(() => {
                        this.actionStates[buttonKey] = 'default';
                    }, 2000);
                    
                    Swal.fire({
                        icon: 'warning',
                        title: 'Invalid Input',
                        text: 'Please enter a valid text value',
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: {
                            popup: 'swal-dark-theme'
                        }
                    });
                    return;
                }

                // Convert boolean to string for API
                if (typeof parameter === 'boolean') {
                    parameter = parameter.toString().toLowerCase();
                }

                const url = `/klivetech/executegadgetaction?gadgetID=${encodeURIComponent(gadget.gadgetID)}&gadgetName=${encodeURIComponent(gadget.name)}&actionName=${encodeURIComponent(action.name)}&actionParam=${encodeURIComponent(parameter || '')}`;
                
                const response = await RequestPOSTFromKliveAPI(url, '', false);
                
                if (response.ok) {
                    // Set button to success state
                    this.actionStates[buttonKey] = 'success';
                    
                    // Reset button after 2 seconds
                    setTimeout(() => {
                        this.actionStates[buttonKey] = 'default';
                    }, 2000);
                    
                    // Clear the input after successful execution
                    const inputKey = Object.keys(this.actionInputs).find(key => 
                        key.startsWith(gadget.gadgetID) && 
                        this.actionInputs[key] === (typeof parameter === 'string' ? parameter : parameter?.toString())
                    );
                    if (inputKey) {
                        this.actionInputs[inputKey] = '';
                    }
                } else {
                    console.error('Failed to execute action:', response.status);
                    this.actionStates[buttonKey] = 'error';
                    setTimeout(() => {
                        this.actionStates[buttonKey] = 'default';
                    }, 3000);
                    
                    if (process.client) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Action Failed',
                            text: `Failed to execute action "${action.name}". Please try again.`,
                            confirmButtonColor: '#4d9e39',
                            background: '#161516',
                            color: '#ffffff',
                            customClass: {
                                popup: 'swal-dark-theme'
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error executing action:', error);
                this.actionStates[buttonKey] = 'error';
                setTimeout(() => {
                    this.actionStates[buttonKey] = 'default';
                }, 3000);
                
                if (process.client) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Execution Error',
                        text: 'Error executing action: ' + error.message,
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: {
                            popup: 'swal-dark-theme'
                        }
                    });
                }
            }
        },

        getActionButtonText(gadget, action, defaultText, actionIndex = 0, boolValue = null) {
            const buttonKey = `${gadget.gadgetID}_${actionIndex}_${boolValue !== null ? boolValue : 'main'}`;
            const state = this.actionStates[buttonKey] || 'default';
            
            switch (state) {
                case 'executing':
                    return 'Executing...';
                case 'success':
                    return '✓ Executed!';
                case 'error':
                    return '✗ Failed';
                default:
                    if (action.parameters === 3) {
                        return `Execute ${action.name}`;
                    }
                    return defaultText;
            }
        },

        getActionButtonStyle(gadget, action, actionIndex = 0, boolValue = null) {
            const buttonKey = `${gadget.gadgetID}_${actionIndex}_${boolValue !== null ? boolValue : 'main'}`;
            const state = this.actionStates[buttonKey] || 'default';
            
            let baseStyle = action.parameters === 3 ? 'width: 100%; height: 45px;' : 
                           (action.parameters === 2 ? 'height: 45px;' : 'width: 100px; height: 45px;');
            
            switch (state) {
                case 'executing':
                    return baseStyle + ' opacity: 0.7; pointer-events: none;';
                case 'success':
                    return baseStyle + ' background-color: #62ce47 !important;';
                case 'error':
                    return baseStyle + ' background-color: #e74c3c !important;';
                default:
                    return baseStyle;
            }
        },

        updateActionInput(key, value) {
            this.actionInputs[key] = value;
        },

        formatTime(timeString) {
            if (!timeString) return 'N/A';
            try {
                const date = new Date(timeString);
                return date.toLocaleString();
            } catch (error) {
                return 'Invalid Date';
            }
        }
    },

    async mounted() {
        await this.loadGadgets();
    }
};
</script>

<style scoped>
.gadget-card {
    background: linear-gradient(145deg, #161516, #1a1a1a);
    border: 1px solid #333;
    border-radius: 15px;
    padding: 25px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
}

.gadget-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(77, 158, 57, 0.1);
    border-color: #4d9e39;
}

.gadget-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid #333;
}

.status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 5px;
}

.status-indicator.online {
    background-color: #62ce47;
    box-shadow: 0 0 10px rgba(98, 206, 71, 0.5);
}

.status-indicator.offline {
    background-color: #e74c3c;
    box-shadow: 0 0 10px rgba(231, 76, 60, 0.5);
}

.gadget-info {
    margin-bottom: 20px;
}

.info-item {
    background: rgba(77, 158, 57, 0.1);
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(77, 158, 57, 0.2);
}

.actions-section {
    background: rgba(255, 255, 255, 0.02);
    padding: 20px;
    border-radius: 10px;
    border: 1px solid #333;
}

.action-box {
    background: rgba(77, 158, 57, 0.05);
    padding: 15px;
    border-radius: 8px;
    border: 1px solid rgba(77, 158, 57, 0.2);
    transition: all 0.2s ease;
}

.action-box:hover {
    background: rgba(77, 158, 57, 0.1);
    border-color: rgba(77, 158, 57, 0.4);
}

/* Loading animation */
@keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
}

.loading {
    animation: pulse 1.5s ease-in-out infinite;
}

/* Responsive design */
@media (max-width: 768px) {
    .gadget-header {
        flex-direction: column;
        gap: 15px;
        text-align: center;
    }
    
    .gadget-info > div {
        grid-template-columns: 1fr !important;
    }
    
    div[style*="grid-template-columns: repeat(auto-fit, minmax(400px, 1fr))"] {
        grid-template-columns: 1fr !important;
    }
}

@media (max-width: 480px) {
    .gadget-card {
        padding: 15px;
    }
    
    .actions-section {
        padding: 15px;
    }
    
    .action-box {
        padding: 10px;
    }
}

/* SweetAlert2 Dark Theme Customization */
:deep(.swal-dark-theme) {
    border: 1px solid #333 !important;
    border-radius: 15px !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
}

:deep(.swal-dark-theme .swal2-title) {
    color: #62ce47 !important;
    font-weight: bold !important;
}

:deep(.swal-dark-theme .swal2-content) {
    color: #ffffff !important;
}

:deep(.swal-dark-theme .swal2-confirm) {
    background-color: #4d9e39 !important;
    border: none !important;
    border-radius: 8px !important;
    font-weight: bold !important;
    transition: all 0.2s ease !important;
}

:deep(.swal-dark-theme .swal2-confirm:hover) {
    background-color: #62ce47 !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 12px rgba(77, 158, 57, 0.3) !important;
}

:deep(.swal-dark-theme .swal2-icon.swal2-success .swal2-success-ring) {
    border-color: #4d9e39 !important;
}

:deep(.swal-dark-theme .swal2-icon.swal2-success [class^='swal2-success-line']) {
    background-color: #4d9e39 !important;
}

:deep(.swal-dark-theme .swal2-icon.swal2-warning) {
    border-color: #f39c12 !important;
    color: #f39c12 !important;
}

:deep(.swal-dark-theme .swal2-icon.swal2-error [class^='swal2-x-mark-line']) {
    background-color: #e74c3c !important;
}

:deep(.swal-progress-bar .swal2-timer-progress-bar) {
    background-color: #4d9e39 !important;
}
</style>