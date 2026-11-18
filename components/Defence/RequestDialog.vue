<template>
  <DefenceDialog :open="open" wide :title="request ? `${request.method || ''} ${request.route || ''}` : 'Request'" :sub="sub" icon="route" testid="odx-request" @close="emit('close')">
    <div v-if="loading && !request" class="odx-empty"><DefenceIcon name="refresh" class="odx-spin" />Reading the request…</div>
    <div v-else-if="!request" class="odx-empty"><DefenceIcon name="alert" />The server has no record of this request.</div>
    <template v-else>
      <dl class="odx-kv" style="grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 12px">
        <div><dt>Status</dt><dd><span class="odx-http odx-mono" :data-tone="httpTone(Number(request.status_code))" style="color: var(--tone); font-weight: 600">{{ request.status_code }}</span></dd></div>
        <div><dt>Took</dt><dd>{{ fmtMs(Number(request.duration_ms)) }}</dd></div>
        <div><dt>Origin</dt><dd>{{ originLabel(request.request_origin).label }}</dd></div>
        <div><dt>Route known</dt><dd>{{ Number(request.matched_route) ? 'Yes' : 'No (404)' }}</dd></div>
        <div><dt>Address</dt><dd><button v-if="request.ip" class="odx-ip-link" @click="emit('open', request.ip)">{{ request.ip }}</button><span v-else>—</span></dd></div>
        <div><dt>Profile</dt><dd>{{ request.profile_name || request.profile_id || '—' }}<span v-if="request.profile_rank != null" class="odx-dim"> · rank {{ request.profile_rank }}</span></dd></div>
        <div><dt>Permission</dt><dd class="mono">{{ request.perm_key || request.perm_required || '—' }}</dd></div>
        <div><dt>Denied because</dt><dd>{{ request.deny_reason || '—' }}</dd></div>
        <div class="wide"><dt>From page</dt><dd class="mono" :title="request.client_page || ''">{{ request.client_page || '—' }}</dd></div>
        <div class="wide"><dt>User agent</dt><dd class="mono" :title="request.user_agent || ''">{{ request.user_agent || '—' }}</dd></div>
      </dl>

      <div v-if="query.length" style="margin-bottom: 12px">
        <div class="odx-section-head" style="padding: 0 0 6px"><h3 style="font-size: 12px">Query</h3><div class="odx-card__tools"><button class="odx-btn odx-btn--xs odx-btn--ghost" @click="emit('copy', request.query || '')"><DefenceIcon name="copy" />Copy</button></div></div>
        <table class="odx-table"><tbody><tr v-for="(pair, i) in query" :key="i"><td class="odx-mono odx-dim" style="width: 30%">{{ pair.key }}</td><td class="odx-mono" :title="pair.value">{{ pair.value }}</td></tr></tbody></table>
      </div>

      <div style="margin-bottom: 12px">
        <div class="odx-section-head" style="padding: 0 0 6px"><h3 style="font-size: 12px">Headers</h3><div class="odx-card__tools"><button v-if="headers.length" class="odx-btn odx-btn--xs odx-btn--ghost" @click="emit('copy', JSON.stringify(request.headers, null, 2))"><DefenceIcon name="copy" />Copy</button></div></div>
        <table v-if="headers.length" class="odx-table"><tbody><tr v-for="(pair, i) in headers" :key="i"><td class="odx-mono odx-dim" style="width: 30%">{{ pair.key }}</td><td class="odx-mono" :title="pair.value">{{ pair.value }}</td></tr></tbody></table>
        <p v-else class="odx-note">No headers were kept for this request.</p>
      </div>

      <div>
        <div class="odx-section-head" style="padding: 0 0 6px">
          <h3 style="font-size: 12px">Body</h3>
          <span class="odx-card__meta">{{ bodyInfo }}</span>
          <div class="odx-card__tools"><button v-if="request.body_text" class="odx-btn odx-btn--xs odx-btn--ghost" @click="emit('copy', request.body_text)"><DefenceIcon name="copy" />Copy</button></div>
        </div>
        <pre v-if="request.body_text" class="odx-code">{{ prettyBody(request.body_text) }}</pre>
        <p v-else class="odx-note">{{ Number(request.body_length) ? `The request had ${fmtInt(Number(request.body_length))} bytes; they were not kept.` : 'No body.' }}</p>
        <p v-if="request.body_hash" class="odx-note odx-mono" style="margin-top: 6px">SHA-256 {{ request.body_hash }}</p>
      </div>
    </template>
  </DefenceDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtFull, fmtInt, fmtMs, httpTone, originLabel, prettyBody } from '~/scripts/omniDefence';

/** One recorded request in full: who sent it, what it asked for, and what it was told. */
const props = defineProps<{ open: boolean; loading: boolean; request: any | null }>();
const emit = defineEmits<{ close: []; open: [ip: string]; copy: [text: string] }>();

const sub = computed(() => (props.request ? `#${props.request.id} · ${fmtFull(Number(props.request.utc_ts))}` : ''));
const headers = computed(() => {
  const h = props.request?.headers;
  if (!h || typeof h !== 'object') return [];
  return Object.keys(h).sort((a, b) => a.localeCompare(b)).map(key => ({ key, value: String(h[key] ?? '') }));
});
const query = computed(() => {
  const raw = props.request?.query;
  if (!raw || typeof raw !== 'string') return [];
  const text = raw.startsWith('?') ? raw.slice(1) : raw;
  const pairs: { key: string; value: string }[] = [];
  try { new URLSearchParams(text).forEach((value, key) => pairs.push({ key, value })); } catch { /* not a query string */ }
  return pairs;
});
const bodyInfo = computed(() => {
  const total = Number(props.request?.body_length ?? 0);
  if (!total) return '';
  return `${fmtInt(total)} bytes${Number(props.request?.body_truncated) === 1 ? ', kept truncated to 64 KB' : ''}`;
});
</script>
