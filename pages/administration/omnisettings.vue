<template>
    <div class="omnisettings-container">
        <!-- Header with back button -->
        <div class="page-header">
            <div class="header-left">
                <NuxtLink to="/admin" class="back-button">
                    <div class="back-button-wrapper">
                        <KMButton message="← BACK TO ADMIN" style="width: 250px;" textColor="#4d9e39"/>
                    </div>
                </NuxtLink>
            </div>
            <div class="header-center">
                <h1>Omni Settings Command Panel</h1>
                <p class="subtitle">Manage global configuration for Omni services</p>
            </div>
            <div class="header-right">
                <div class="refresh-controls">
                    <KMButton 
                        :message="loading ? 'Refreshing...' : 'Refresh'" 
                        :onclick="loadSettings" 
                        style="width: 150px;" 
                    />
                </div>
            </div>
        </div>

        <!-- Content -->
        <div class="content-wrapper">
            <!-- Filters -->
            <div class="controls-panel">
                <KMInputBox
                    v-model:value="searchQuery"
                    placeholder="Search settings by name..."
                    type="text"
                    class="search-input"
                />
                
                <div class="filter-group">
                    <KMSelectBox
                        v-model:selected="filterType"
                        :options="['All Types', 'String', 'Bool', 'Int', 'Dropdown']"
                    />
                </div>
                
                <div class="checkbox-group">
                    <KMCheckBox
                        v-model:boxChecked="showSensitiveValues"
                        message="Show Sensitive Values"
                    />
                </div>
            </div>

            <!-- Settings List -->
            <div class="settings-panel">
                <div v-if="loading && settings.length === 0" class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>Loading settings...</p>
                </div>
                
                <div v-else-if="error" class="error-state">
                    <p class="error-message">{{ error }}</p>
                    <KMButton message="Retry" :onclick="loadSettings" style="width: 150px; margin-top: 15px;" />
                </div>
                
                <div v-else-if="filteredSettings.length === 0" class="empty-state">
                    <p>No settings matching your filters were found.</p>
                </div>
                
                <div v-else class="settings-groups">
                    <div v-for="group in activeGroupedSettings" :key="group.name" class="settings-group">
                        <button class="group-toggle" type="button" @click="toggleGroup(group.name)">
                            <span class="group-toggle-copy">
                                <span class="group-toggle-icon" :class="{ collapsed: isGroupCollapsed(group.name) }">▾</span>
                                <span class="group-title">{{ group.name }}</span>
                            </span>
                            <span class="group-count">{{ group.settings.length }}</span>
                        </button>
                        <div v-if="!isGroupCollapsed(group.name)" class="settings-grid">
                            <div v-for="setting in group.settings" :key="`${setting.ParentServiceId}-${setting.Name}`" class="setting-card">
                                <div class="setting-header">
                                    <div class="setting-info">
                                        <h3 class="setting-name">{{ setting.Name }}</h3>
                                    </div>
                                    <div class="setting-badges">
                                        <span v-if="setting.Sensitive" class="badge sensitive-badge">Sensitive</span>
                                        <span class="badge type-badge" :class="'type-' + getTypeLabel(setting.Type).toLowerCase()">
                                            {{ getTypeLabel(setting.Type) }}
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="setting-editor">
                                    <div class="editor-input-wrapper">
                                        <div v-if="setting.Type === 0" class="editor-input">
                                            <KMInputBox
                                                v-model:value="editingValues[`${setting.ParentServiceId}-${setting.Name}`]"
                                                :placeholder="`Enter ${setting.Name}...`"
                                                type="text"
                                            />
                                        </div>
                                        <div v-else-if="setting.Type === 1" class="editor-checkbox">
                                            <KMCheckBox
                                                v-model:boxChecked="boolValues[`${setting.ParentServiceId}-${setting.Name}`]"
                                                :message="`${boolValues[`${setting.ParentServiceId}-${setting.Name}`] ? 'True' : 'False'}`"
                                            />
                                        </div>
                                        <div v-else-if="setting.Type === 2" class="editor-input">
                                            <KMInputBox
                                                v-model:value="editingValues[`${setting.ParentServiceId}-${setting.Name}`]"
                                                :placeholder="`Enter ${setting.Name}...`"
                                                type="number"
                                            />
                                        </div>
                                        <div v-else-if="setting.Type === 3" class="editor-input">
                                            <KMSelectBox
                                                v-model:selected="editingValues[`${setting.ParentServiceId}-${setting.Name}`]"
                                                :options="getDropdownOptions(setting)"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div class="editor-actions">
                                        <KMButton
                                            v-if="isSettingModified(setting)"
                                            :message="savingSettings.has(`${setting.ParentServiceId}-${setting.Name}`) ? 'Saving...' : 'Save'"
                                            :onclick="() => saveSetting(setting)"
                                            style="width: 100px; height: 100%;"
                                        />
                                        <div v-else class="placeholder-action"></div>
                                        <button
                                            class="danger-action"
                                            type="button"
                                            :disabled="deletingSettings.has(getSettingKey(setting)) || savingSettings.has(getSettingKey(setting))"
                                            @click="deleteSetting(setting)"
                                        >
                                            {{ deletingSettings.has(getSettingKey(setting)) ? 'Deleting...' : 'Delete' }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="inactiveSettings.length > 0" class="settings-group inactive-section">
                        <button class="group-toggle inactive-group-toggle" type="button" @click="inactiveCollapsed = !inactiveCollapsed">
                            <span class="group-toggle-copy">
                                <span class="group-toggle-icon" :class="{ collapsed: inactiveCollapsed }">▾</span>
                                <span class="group-title inactive-title">Unused This Session</span>
                            </span>
                            <span class="group-count inactive-group-count">{{ inactiveSettings.length }}</span>
                        </button>
                        <p v-if="!inactiveCollapsed" class="inactive-subtitle">Settings loaded from persistence but not touched by any service during the current Omnipotent session.</p>
                        <div v-if="!inactiveCollapsed" class="settings-grid">
                            <div v-for="setting in inactiveSettings" :key="`inactive-${setting.ParentServiceId}-${setting.Name}`" class="setting-card inactive-setting-card">
                                <div class="setting-header">
                                    <div class="setting-info">
                                        <h3 class="setting-name">{{ setting.Name }}</h3>
                                        <p class="setting-service">{{ setting.ParentServiceName || 'Unknown Service' }}</p>
                                    </div>
                                    <div class="setting-badges">
                                        <span v-if="setting.Sensitive" class="badge sensitive-badge">Sensitive</span>
                                        <span class="badge type-badge inactive-type-badge" :class="'type-' + getTypeLabel(setting.Type).toLowerCase()">
                                            {{ getTypeLabel(setting.Type) }}
                                        </span>
                                    </div>
                                </div>

                                <div class="setting-editor">
                                    <div class="editor-input-wrapper">
                                        <div v-if="setting.Type === 0" class="editor-input">
                                            <KMInputBox
                                                v-model:value="editingValues[getSettingKey(setting)]"
                                                :placeholder="`Enter ${setting.Name}...`"
                                                type="text"
                                            />
                                        </div>
                                        <div v-else-if="setting.Type === 1" class="editor-checkbox">
                                            <KMCheckBox
                                                v-model:boxChecked="boolValues[getSettingKey(setting)]"
                                                :message="`${boolValues[getSettingKey(setting)] ? 'True' : 'False'}`"
                                            />
                                        </div>
                                        <div v-else-if="setting.Type === 2" class="editor-input">
                                            <KMInputBox
                                                v-model:value="editingValues[getSettingKey(setting)]"
                                                :placeholder="`Enter ${setting.Name}...`"
                                                type="number"
                                            />
                                        </div>
                                        <div v-else-if="setting.Type === 3" class="editor-input">
                                            <KMSelectBox
                                                v-model:selected="editingValues[getSettingKey(setting)]"
                                                :options="getDropdownOptions(setting)"
                                            />
                                        </div>
                                    </div>

                                    <div class="editor-actions">
                                        <KMButton
                                            v-if="isSettingModified(setting)"
                                            :message="savingSettings.has(getSettingKey(setting)) ? 'Saving...' : 'Save'"
                                            :onclick="() => saveSetting(setting)"
                                            style="width: 100px; height: 100%;"
                                        />
                                        <div v-else class="placeholder-action"></div>
                                        <button
                                            class="danger-action"
                                            type="button"
                                            :disabled="deletingSettings.has(getSettingKey(setting)) || savingSettings.has(getSettingKey(setting))"
                                            @click="deleteSetting(setting)"
                                        >
                                            {{ deletingSettings.has(getSettingKey(setting)) ? 'Deleting...' : 'Delete' }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import KMButton from '~/components/KMButton.vue';
import KMInputBox from '~/components/KMInputBox.vue';
import KMSelectBox from '~/components/KMSelectBox.vue';
import KMCheckBox from '~/components/KMCheckBox.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

definePageMeta({ layout: 'navbar' });

// Types
interface OmniSetting {
    Name: string;
    Type: number; // 0 = String, 1 = Bool, 2 = Int, 3 = Dropdown
    Sensitive: boolean;
    ParentServiceId: string;
    ParentServiceName: string;
    Value: string;
    WasUsedThisSession: boolean;
    DropdownOptions?: string[];
}

// State
const settings = ref<OmniSetting[]>([]);
const loading = ref(true);
const error = ref('');
const searchQuery = ref('');
const filterType = ref('All Types');
const showSensitiveValues = ref(false);
const editingValues = ref<Record<string, string>>({});
const boolValues = ref<Record<string, boolean>>({});
const savingSettings = ref(new Set<string>());
const deletingSettings = ref(new Set<string>());
const collapsedGroups = ref<Record<string, boolean>>({});
const inactiveCollapsed = ref(true);

// Watchers
watch(showSensitiveValues, () => {
    loadSettings();
});

// Computed
const filteredSettings = computed(() => {
    return settings.value.filter((setting) => {
        // Search filter
        if (searchQuery.value && !setting.Name.toLowerCase().includes(searchQuery.value.toLowerCase())) {
            return false;
        }

        // Type filter
        if (filterType.value !== 'All Types') {
            const typeLabel = getTypeLabel(setting.Type);
            if (typeLabel !== filterType.value) {
                return false;
            }
        }

        return true;
    });
});

const activeGroupedSettings = computed(() => {
    const groups: Record<string, OmniSetting[]> = {};
    
    // Sort by name first for alphabetical order within groups
    const sorted = [...filteredSettings.value]
        .filter((setting) => setting.WasUsedThisSession)
        .sort((a, b) => a.Name.localeCompare(b.Name));
    
    for (const setting of sorted) {
        const serviceName = setting.ParentServiceName || 'Unknown Service';
        if (!groups[serviceName]) {
            groups[serviceName] = [];
        }
        groups[serviceName].push(setting);
    }
    
    // Convert to array and sort groups alphabetically
    return Object.keys(groups).sort().map(name => ({
        name,
        settings: groups[name]
    }));
});

const inactiveSettings = computed(() => {
    return [...filteredSettings.value]
        .filter((setting) => !setting.WasUsedThisSession)
        .sort((left, right) => {
            const serviceComparison = (left.ParentServiceName || 'Unknown Service').localeCompare(right.ParentServiceName || 'Unknown Service');
            if (serviceComparison !== 0) {
                return serviceComparison;
            }

            return left.Name.localeCompare(right.Name);
        });
});

// Methods
const getTypeLabel = (type: number): string => {
    switch (type) {
        case 0: return 'String';
        case 1: return 'Bool';
        case 2: return 'Int';
        case 3: return 'Dropdown';
        default: return 'Unknown';
    }
};

const getSettingKey = (setting: OmniSetting): string => `${setting.ParentServiceId}-${setting.Name}`;

const isGroupCollapsed = (groupName: string): boolean => collapsedGroups.value[groupName] ?? true;

const toggleGroup = (groupName: string) => {
    collapsedGroups.value = {
        ...collapsedGroups.value,
        [groupName]: !isGroupCollapsed(groupName)
    };
};

const syncGroupCollapseState = (loadedSettings: OmniSetting[]) => {
    const nextState = { ...collapsedGroups.value };
    const groupNames = [...new Set(
        loadedSettings
            .filter((setting) => setting.WasUsedThisSession)
            .map((setting) => setting.ParentServiceName || 'Unknown Service')
    )];

    for (const groupName of groupNames) {
        if (!(groupName in nextState)) {
            nextState[groupName] = true;
        }
    }

    collapsedGroups.value = nextState;
};

const getDropdownOptions = (setting: OmniSetting): string[] => {
    if (setting.DropdownOptions && setting.DropdownOptions.length > 0) {
        return setting.DropdownOptions;
    }

    return setting.Value ? [setting.Value] : [];
};

const normalizeDropdownValue = (setting: OmniSetting, value: string): string => {
    const options = getDropdownOptions(setting);

    if (options.length === 0) {
        return value || '';
    }

    const trimmedValue = value?.trim() || '';
    const matchedOption = options.find((option) => option.toLowerCase() === trimmedValue.toLowerCase());
    return matchedOption || options[0];
};

const loadSettings = async () => {
    loading.value = true;
    error.value = '';
    
    try {
        const revealSensitive = showSensitiveValues.value ? 'true' : 'false';
        const response = await RequestGETFromKliveAPI(
            `/OmniGlobalSettings/List?revealSensitive=${revealSensitive}`,
            false,
            true
        );

        if (response.ok) {
            const data = await response.json();
            settings.value = data;
            syncGroupCollapseState(data);

            // Initialize editing values
            settings.value.forEach((setting) => {
                const key = getSettingKey(setting);
                if (setting.Type === 1) {
                    // Bool
                    boolValues.value[key] = setting.Value === 'true' || setting.Value === 'True';
                } else {
                    editingValues.value[key] = setting.Type === 3
                        ? normalizeDropdownValue(setting, setting.Value)
                        : setting.Value;
                }
            });
        } else {
            error.value = `Failed to load settings (HTTP ${response.status})`;
        }
    } catch (e: any) {
        error.value = `Error loading settings. Check console for details.`;
        console.error('Error loading OmniSettings:', e);
    } finally {
        loading.value = false;
    }
};

const isSettingModified = (setting: OmniSetting): boolean => {
    const key = getSettingKey(setting);
    if (setting.Type === 1) {
        return boolValues.value[key] !== (setting.Value === 'true' || setting.Value === 'True');
    } else {
        const currentValue = setting.Type === 3
            ? normalizeDropdownValue(setting, setting.Value)
            : setting.Value;
        return editingValues.value[key] !== currentValue;
    }
};

const saveSetting = async (setting: OmniSetting) => {
    const key = getSettingKey(setting);
    savingSettings.value.add(key);

    try {
        let newValue: string;
        if (setting.Type === 1) {
            newValue = boolValues.value[key] ? 'true' : 'false';
        } else {
            newValue = setting.Type === 3
                ? normalizeDropdownValue(setting, editingValues.value[key])
                : editingValues.value[key];
        }

        const payload = {
            name: setting.Name,
            value: newValue,
            parentServiceId: setting.ParentServiceId,
            parentServiceName: setting.ParentServiceName,
        };

        const response = await RequestPOSTFromKliveAPI(
            '/OmniGlobalSettings/Set',
            JSON.stringify(payload),
            false,
            true
        );

        if (response.ok) {
            setting.Value = newValue;
            
            // Show toast
            Swal.fire({
                icon: 'success',
                title: 'Setting saved',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                background: '#161516',
                color: '#ffffff'
            });
        } else {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
    } catch (e: any) {
        console.error('Error saving OmniSetting:', e);
        Swal.fire({
            icon: 'error',
            title: 'Failed to save',
            text: e.message || 'An unknown error occurred.',
            background: '#161516',
            color: '#ffffff',
            confirmButtonColor: '#4d9e39'
        });
    } finally {
        savingSettings.value.delete(key);
    }
};

const removeSettingFromState = (setting: OmniSetting) => {
    const key = getSettingKey(setting);
    settings.value = settings.value.filter((candidate) => getSettingKey(candidate) !== key);

    const nextEditingValues = { ...editingValues.value };
    delete nextEditingValues[key];
    editingValues.value = nextEditingValues;

    const nextBoolValues = { ...boolValues.value };
    delete nextBoolValues[key];
    boolValues.value = nextBoolValues;

    syncGroupCollapseState(settings.value);
};

const deleteSetting = async (setting: OmniSetting) => {
    const key = getSettingKey(setting);
    if (deletingSettings.value.has(key)) {
        return;
    }

    const result = await Swal.fire({
        icon: 'warning',
        title: `Delete ${setting.Name}?`,
        text: 'This OmniSetting will be removed from persistence until a service recreates it.',
        showCancelButton: true,
        confirmButtonText: 'Delete Setting',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#4d9e39',
        background: '#161516',
        color: '#ffffff'
    });

    if (!result.isConfirmed) {
        return;
    }

    deletingSettings.value.add(key);

    try {
        const response = await RequestPOSTFromKliveAPI(
            '/OmniGlobalSettings/Delete',
            JSON.stringify({
                name: setting.Name,
                parentServiceId: setting.ParentServiceId
            }),
            false,
            true
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        removeSettingFromState(setting);
        Swal.fire({
            icon: 'success',
            title: 'Setting deleted',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            background: '#161516',
            color: '#ffffff'
        });
    } catch (e: any) {
        console.error('Error deleting OmniSetting:', e);
        Swal.fire({
            icon: 'error',
            title: 'Failed to delete',
            text: e.message || 'An unknown error occurred.',
            background: '#161516',
            color: '#ffffff',
            confirmButtonColor: '#4d9e39'
        });
    } finally {
        deletingSettings.value.delete(key);
    }
};

onMounted(() => {
    loadSettings();
});
</script>

<style scoped>
.omnisettings-container {
    padding: 20px;
    background-color: #201f20;
    min-height: 100vh;
    color: #ffffff;
}

/* Header */
.page-header {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(77, 158, 57, 0.2);
}

.header-left {
    display: flex;
    align-items: center;
}

.back-button {
    text-decoration: none;
}

.back-button-wrapper {
    height: 45px;
}

.header-center {
    text-align: center;
}

.header-center h1 {
    font-size: 2.5rem;
    font-weight: bold;
    margin: 0 0 5px 0;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.subtitle {
    color: #969696;
    font-size: 1.1rem;
    margin: 0;
}

.header-right {
    display: flex;
    justify-content: flex-end;
    align-items: center;
}

.refresh-controls {
    height: 45px;
}

/* Content */
.content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 25px;
    width: 100%;
}

/* Controls Panel */
.controls-panel {
    display: flex;
    align-items: center;
    gap: 20px;
    background: #161616;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid rgba(77, 158, 57, 0.3);
    flex-wrap: wrap;
}

.search-input {
    flex: 2;
    min-width: 250px;
    height: 40px;
}

.filter-group {
    flex: 1;
    min-width: 200px;
}

.checkbox-group {
    display: flex;
    align-items: center;
    padding-left: 10px;
}

/* Settings Grid */
.settings-panel {
    min-height: 400px;
}

.loading-state,
.error-state,
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    background: #161616;
    border-radius: 12px;
    border: 1px solid rgba(77, 158, 57, 0.2);
}

.loading-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(77, 158, 57, 0.3);
    border-top: 4px solid #4d9e39;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.error-message {
    color: #ef4444;
    font-size: 1.1rem;
    margin-bottom: 10px;
}

.empty-state p {
    color: #969696;
    font-size: 1.1rem;
    font-style: italic;
}

.settings-groups {
    display: flex;
    flex-direction: column;
    gap: 40px;
}

.settings-group {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.group-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 0 0 10px 0;
    border: none;
    border-bottom: 1px solid rgba(77, 158, 57, 0.4);
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
}

.group-toggle-copy {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.group-toggle-icon {
    color: #4d9e39;
    font-size: 0.95rem;
    transition: transform 0.2s ease;
}

.group-toggle-icon.collapsed {
    transform: rotate(-90deg);
}

.group-title {
    font-size: 1.4rem;
    font-weight: 600;
    color: #4d9e39;
    margin: 0;
}

.group-count {
    min-width: 36px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(77, 158, 57, 0.14);
    color: #8dd776;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
}

.inactive-section {
    padding-top: 10px;
    border-top: 1px solid rgba(214, 143, 38, 0.35);
}

.inactive-group-toggle {
    border-bottom-color: rgba(214, 143, 38, 0.45);
}

.inactive-title {
    color: #d68f26;
}

.inactive-group-toggle .group-toggle-icon {
    color: #d68f26;
}

.inactive-group-count {
    background: rgba(214, 143, 38, 0.16);
    color: #e0a54b;
}

.inactive-subtitle {
    margin: 0;
    color: #d1b17b;
    font-size: 0.95rem;
}

.settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
    gap: 15px;
}

.setting-card {
    background: #161616;
    border: 1px solid rgba(77, 158, 57, 0.3);
    border-radius: 12px;
    padding: 20px;
    transition: all 0.3s ease;
}

.inactive-setting-card {
    background: linear-gradient(180deg, rgba(54, 39, 18, 0.95), rgba(28, 22, 16, 0.98));
    border-color: rgba(214, 143, 38, 0.4);
}

.setting-card:hover {
    border-color: rgba(77, 158, 57, 0.6);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.inactive-setting-card:hover {
    border-color: rgba(214, 143, 38, 0.7);
}

.setting-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
}

.setting-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.setting-name {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: #ffffff;
}

.setting-service {
    margin: 0;
    font-size: 0.9rem;
    color: #cba36a;
}

.setting-badges {
    display: flex;
    gap: 10px;
}

.badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.sensitive-badge {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.type-string {
    background: rgba(100, 150, 200, 0.2);
    color: #6496c8;
    border: 1px solid rgba(100, 150, 200, 0.3);
}

.type-bool {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.3);
}

.type-int {
    background: rgba(249, 115, 22, 0.2);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.3);
}

.type-dropdown {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
}

.inactive-type-badge {
    background: rgba(214, 143, 38, 0.15);
    color: #e0a54b;
    border-color: rgba(214, 143, 38, 0.35);
}

.setting-editor {
    display: flex;
    gap: 15px;
    align-items: center;
    height: 45px;
}

.editor-input-wrapper {
    flex: 1;
    height: 100%;
}

.editor-input,
.editor-checkbox {
    height: 100%;
    display: flex;
    align-items: center;
}

.editor-input :deep(.kinput) {
    width: 100%;
    height: 100%;
}

.editor-actions {
    display: flex;
    align-items: stretch;
    gap: 10px;
    height: 100%;
    min-width: 220px;
}

.placeholder-action {
    width: 100px;
    height: 100%;
}

.danger-action {
    min-width: 100px;
    height: 100%;
    padding: 0 16px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
}

.danger-action:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.55);
}

.danger-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

@media (max-width: 1024px) {
    .page-header {
        grid-template-columns: 1fr;
        gap: 20px;
        text-align: center;
    }
    
    .header-left, .header-right {
        justify-content: center;
    }

    .settings-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 600px) {
    .controls-panel {
        flex-direction: column;
        align-items: flex-start;
    }
    
    .search-input, .filter-group {
        width: 100%;
    }
    
    .setting-editor {
        flex-direction: column;
        height: auto;
        gap: 15px;
    }
    
    .editor-input-wrapper,
    .editor-actions {
        width: 100%;
    }
    
    .editor-actions :deep(button) {
        width: 100% !important;
        height: 45px !important;
    }

    .danger-action {
        width: 100%;
        height: 45px;
    }
}
</style>