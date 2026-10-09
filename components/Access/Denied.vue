<template>
    <!-- Shown in place of a page the profile can't open. The navigation stays, nothing redirects,
         and the page appears by itself the moment access is granted. -->
    <section class="km-ax ax-denied" role="alert" aria-labelledby="ax-denied-title">
        <div class="ax-denied-card">
            <div class="ax-denied-badge"><AccessIcon name="lock" :size="26" /></div>
            <p class="ax-eyebrow">No access</p>
            <h1 id="ax-denied-title">You can't open {{ access.label }}</h1>
            <p class="ax-lede">{{ lede }}</p>

            <ul v-if="needs.length" class="ax-needs" aria-label="Permissions that open this page">
                <li v-for="item in needs" :key="item.key">
                    <span v-if="item.tier" class="km-tier" :class="tierMeta(item.tier).tone">{{ tierMeta(item.tier).short }} · {{ item.tier }}</span>
                    <span v-else class="km-tier glance">Any</span>
                    <div class="ax-need-text">
                        <strong>{{ item.title }}</strong>
                        <small v-if="item.description">{{ item.description }}</small>
                    </div>
                    <code class="km-key">{{ item.key.endsWith('.') ? `${item.key}*` : item.key }}</code>
                </li>
            </ul>

            <p class="ax-help">
                Permissions are given by Klives. When yours changes, this page opens by itself — no need to sign in again.
            </p>

            <div class="ax-actions">
                <button type="button" class="ot-btn" @click="goBack"><AccessIcon name="back" :size="15" /> Back</button>
                <NuxtLink class="ot-btn ghost" to="/dashboard">Home</NuxtLink>
                <NuxtLink class="ot-btn ghost" to="/account">Your permissions</NuxtLink>
            </div>

            <p v-if="profile" class="ax-who">
                Signed in as <b>{{ profile.name ?? profile.Name }}</b>
                <span class="km-rank" :class="`r${rankMeta(profile.rankValue ?? profile.KlivesManagementRank).value}`">{{ profile.rank ?? rankMeta(profile.KlivesManagementRank).name }}</span>
                <span class="ax-who-count">· {{ heldCount }} permission{{ heldCount === 1 ? '' : 's' }}</span>
            </p>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { usePermissionCatalog } from '~/composables/useAccess';
import { ruleKeys, type PageAccess } from '~/scripts/pageAccess';
import { rankMeta, tierMeta } from '~/scripts/profileFormat';

const props = defineProps<{ access: PageAccess }>();

const router = useRouter();
const current = useCurrentProfile();
const catalog = usePermissionCatalog();
const profile = computed(() => current.profile.value);
const heldCount = computed(() => current.permissions.value.size);

/** For "any key of a service", suggest that service's entry-level keys rather than all of them. */
const needs = computed(() => {
    const { any, all } = ruleKeys(props.access.rule);
    const items: { key: string; title: string; description: string; tier: string | null }[] = [];
    for (const key of [...all, ...any]) {
        if (key.endsWith('.')) {
            const service = catalog.services.value.find(s => `${s.key}.` === key);
            if (!service) {
                items.push({ key, ...catalog.describe(key) });
                continue;
            }
            const lowest = Math.min(...service.permissions.map(p => p.tierValue));
            for (const p of service.permissions.filter(p => p.tierValue === lowest).slice(0, 3)) {
                items.push({ key: p.key, title: p.title, description: p.description, tier: p.tier });
            }
        } else {
            const d = catalog.describe(key);
            items.push({ key, title: d.title, description: d.description, tier: d.tier });
        }
    }
    return items;
});

const lede = computed(() => {
    const { any, all } = ruleKeys(props.access.rule);
    const prefixes = any.filter(k => k.endsWith('.'));
    if (prefixes.length && prefixes.length === any.length && !all.length) {
        const names = prefixes.map(k => catalog.describe(k).service);
        return names.length === 1
            ? `Your profile has no ${names[0]} permissions yet. Any one of them opens this page — for example:`
            : `Your profile has none of the permissions this page uses. Any one of them opens it — for example:`;
    }
    return any.length > 1
        ? 'This page needs one of these permissions:'
        : 'This page needs a permission your profile doesn\'t have:';
});

function goBack() {
    if (window.history.length > 1) router.back();
    else void router.push('/dashboard');
}

onMounted(() => { void catalog.load(); });
</script>

<style scoped>
.ax-denied {
    display: flex;
    justify-content: center;
    padding: clamp(24px, 8vh, 96px) 16px 64px;
    min-height: 70vh;
}
.ax-denied-card {
    width: min(620px, 100%);
    padding: 32px clamp(18px, 4vw, 36px);
    border-radius: var(--ot-radius-lg);
    border: 1px solid var(--ot-line);
    background:
        radial-gradient(120% 80% at 50% -20%, rgba(240, 180, 41, 0.08), transparent 60%),
        var(--ot-surface);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    text-align: center;
}
.ax-denied-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 60px;
    border-radius: 18px;
    color: var(--ot-warning);
    background: var(--ot-warning-soft);
    border: 1px solid rgba(240, 180, 41, 0.35);
    margin-bottom: 14px;
}
.ax-eyebrow {
    font-size: 11px;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: var(--ot-warning);
    font-weight: 700;
    margin-bottom: 6px;
}
h1 { font-size: 22px; line-height: 30px; font-weight: 650; letter-spacing: -0.2px; color: var(--ot-text); }
.ax-lede { margin-top: 8px; color: var(--ot-text-2); font-size: 14px; }

.ax-needs {
    list-style: none;
    margin: 18px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
}
.ax-needs li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: rgba(255, 255, 255, 0.02);
}
.ax-need-text { display: flex; flex-direction: column; min-width: 0; }
.ax-need-text strong { color: var(--ot-text); font-weight: 600; font-size: 13.5px; }
.ax-need-text small { color: var(--ot-muted); font-size: 12px; line-height: 17px; }
@media (max-width: 560px) {
    .ax-needs li { grid-template-columns: auto minmax(0, 1fr); }
    .ax-needs li .km-key { grid-column: 1 / -1; }
}

.ax-help { margin-top: 18px; color: var(--ot-muted); font-size: 12.5px; }
.ax-actions { margin-top: 18px; display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
.ax-who {
    margin-top: 22px;
    padding-top: 14px;
    border-top: 1px solid var(--ot-line);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12.5px;
    color: var(--ot-muted);
}
.ax-who b { color: var(--ot-text-2); }
</style>
