<template>
  <div>
    <div class="odx-filters" role="search" aria-label="Filter sign-in events">
      <label class="odx-field" style="max-width: 200px">
        <DefenceIcon name="globe" />
        <input v-model="draft.ip" placeholder="Address" spellcheck="false" @input="debounced" />
      </label>
      <label class="odx-field" style="max-width: 200px">
        <DefenceIcon name="user" />
        <input v-model="draft.profile" placeholder="Profile" spellcheck="false" @input="debounced" />
      </label>
      <div class="odx-seg" role="group" aria-label="Event type">
        <button class="odx-seg__opt" :aria-pressed="!draft.type" @click="draft.type = ''; apply()">All</button>
        <button v-for="type in AUTH_TYPES" :key="type" class="odx-seg__opt" :aria-pressed="draft.type === type" @click="draft.type = type; apply()">{{ typeLabel(type) }}</button>
      </div>
      <div class="odx-filters__end">
        <span class="odx-filters__count">{{ rows.length ? `${fmtInt(filter.offset + 1)}–${fmtInt(filter.offset + rows.length)}` : 'No rows' }}</span>
        <button v-if="canExport" class="odx-btn odx-btn--sm odx-btn--ghost" @click="emit('export')"><DefenceIcon name="download" />CSV</button>
      </div>
    </div>
    <div class="odx-table-wrap" :data-busy="busy || undefined">
      <table class="odx-table" data-testid="auth-table">
        <thead><tr><th style="width: 92px">Time</th><th>What</th><th>Address</th><th>Profile</th><th>Route</th><th>Detail</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" data-clickable="true" :data-tone="authTone(row.type) === 'crit' ? 'crit' : authTone(row.type) === 'warn' ? 'warn' : undefined" @click="row.ip && emit('open', row.ip)">
            <td class="odx-num" :title="fmtFull(row.ts)">{{ fmtStamp(row.ts, now) }}</td>
            <td><span class="odx-chip" :data-tone="authTone(row.type)">{{ typeLabel(row.type) }}</span></td>
            <td><span class="odx-ip">{{ row.ip || '—' }}</span></td>
            <td>{{ row.profile || '' }}</td>
            <td class="route" :title="row.route || ''">{{ row.route || '' }}</td>
            <td class="odx-dim" :title="row.detail || ''">{{ row.detail || '' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="odx-empty"><DefenceIcon :name="error ? 'alert' : 'inbox'" /><span>{{ error || (busy ? 'Reading sign-in events…' : 'No events match.') }}</span></div>
    </div>
    <div class="odx-pager">
      <button class="odx-btn odx-btn--sm odx-btn--ghost" :disabled="filter.offset === 0" @click="emit('page', -1)"><DefenceIcon name="chevron-left" />Newer</button>
      <span>Newest first · {{ AUTH_LIMIT }} a page</span>
      <button class="odx-btn odx-btn--sm odx-btn--ghost" :disabled="rows.length < AUTH_LIMIT" @click="emit('page', 1)">Older<DefenceIcon name="chevron-right" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, watch } from 'vue';
import { AUTH_LIMIT, type AuthFilter } from '~/composables/useOmniDefence';
import { AUTH_TYPES, authTone, fmtFull, fmtInt, fmtStamp, type DefenceAuthEvent } from '~/scripts/omniDefence';

/** Sign-ins, wrong passwords, expired sessions and routes refused for want of a permission. */
const props = defineProps<{ rows: DefenceAuthEvent[]; filter: AuthFilter; busy: boolean; error?: string; now: number; canExport: boolean }>();
const emit = defineEmits<{ apply: [filter: AuthFilter]; page: [direction: number]; open: [ip: string]; export: [] }>();

const LABELS: Record<string, string> = {
  Login: 'Sign-in',
  LoginFailed: 'Sign-in failed',
  InvalidPassword: 'Wrong password',
  InsufficientClearance: 'No permission',
  UnauthRoute: 'Not allowed',
  WebsiteNoProfile: 'Signed out',
  WebsiteInvalidProfile: 'Bad session',
  LoginDisabled: 'Sign-in disabled',
  Suspended: 'Suspended',
};
const typeLabel = (type: string) => LABELS[type] ?? type;

const draft = reactive<AuthFilter>({ ...props.filter });
watch(() => props.filter, value => Object.assign(draft, value), { deep: true });
let timer: number | null = null;
function debounced() { if (timer != null) window.clearTimeout(timer); timer = window.setTimeout(apply, 380); }
function apply() { if (timer != null) { window.clearTimeout(timer); timer = null; } emit('apply', { ...draft, offset: 0 }); }
onBeforeUnmount(() => { if (timer != null) window.clearTimeout(timer); });
</script>
