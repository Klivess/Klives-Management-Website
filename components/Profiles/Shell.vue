<template>
    <div class="ot-os pc-os">
        <a class="ot-skiplink" href="#pc-main">Skip to content</a>
        <div class="pc-band" aria-hidden="true"></div>

        <header class="ot-top">
            <NuxtLink class="ot-brand" :to="brandTo">
                <b>{{ brand }}</b>
                <small class="pc-wide">{{ tagline }}</small>
            </NuxtLink>
            <span v-if="scope" class="ot-scope pc-scope">
                <span v-if="scopeDot" class="km-dot" :class="scopeDot" aria-hidden="true"></span>
                <span class="pc-trunc">{{ scope }}</span>
            </span>
            <div class="ot-top-spacer"></div>
            <slot name="top" />
            <span v-if="freshLabel" class="ot-fresh" :class="{ stale: !!error }" aria-live="polite">
                <span class="ot-dot" :class="error ? 'warn' : 'ok'" aria-hidden="true"></span>
                <span class="pc-wide">{{ freshLabel }}</span>
            </span>
            <button v-if="refreshable" type="button" class="ot-btn ghost sm" :disabled="loading" @click="$emit('refresh')">Refresh</button>
        </header>

        <nav class="ot-nav" aria-label="Profiles sections">
            <div class="ot-nav-group">
                <NuxtLink v-if="can('profiles.directory.view')" to="/administration/profiles" :class="{ active: route.path === '/administration/profiles' || /^\/administration\/profiles\/(?!new$|catalog$)/.test(route.path) }">
                    <AccessIcon name="users" :size="15" /> Directory
                </NuxtLink>
                <NuxtLink v-if="can('profiles.lifecycle.create')" to="/administration/profiles/new" :class="{ active: route.path === '/administration/profiles/new' }">
                    <AccessIcon name="plus" :size="15" /> New profile
                </NuxtLink>
                <NuxtLink v-if="can('profiles.permissions.view')" to="/administration/profiles/catalog" :class="{ active: route.path === '/administration/profiles/catalog' }">
                    <AccessIcon name="key" :size="15" /> Permissions
                </NuxtLink>
                <NuxtLink to="/account" :class="{ active: route.path === '/account' }">
                    <AccessIcon name="user" :size="15" /> Your account
                </NuxtLink>
            </div>
            <div v-if="$slots.crumb" class="ot-nav-group"><slot name="crumb" /></div>
        </nav>

        <main id="pc-main" class="ot-page">
            <div v-if="error && !hideError" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⚠</span>
                <div><strong>Couldn't load everything</strong> {{ error }}</div>
                <div v-if="refreshable" class="actions"><button class="ot-btn sm" :disabled="loading" @click="$emit('refresh')">Retry</button></div>
            </div>
            <slot />
        </main>
    </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useAccess } from '~/composables/useAccess';

withDefaults(defineProps<{
    brand?: string;
    tagline?: string;
    brandTo?: string;
    scope?: string;
    scopeDot?: '' | 'online' | 'idle' | 'offline';
    freshLabel?: string;
    error?: string | null;
    hideError?: boolean;
    loading?: boolean;
    refreshable?: boolean;
}>(), {
    brand: 'Profiles',
    tagline: 'Access control',
    brandTo: '/administration/profiles',
    scope: '',
    scopeDot: '',
    freshLabel: '',
    error: null,
    hideError: false,
    loading: false,
    refreshable: false,
});

defineEmits<{ refresh: [] }>();

const route = useRoute();
const { can } = useAccess();
</script>

<style scoped>
.pc-band { height: 3px; width: 100%; background: linear-gradient(90deg, #6ddc4f, #63c8ea 55%, #a89bf0); }
.ot-nav a { display: inline-flex; align-items: center; gap: 6px; }
.pc-scope { min-width: 0; }
.pc-trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 720px) {
    .pc-wide { display: none; }
    .ot-top { padding: 0 var(--ot-space-3); gap: var(--ot-space-2); }
}
</style>
