<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">ALRT</span>Market alerts</h1>
            <div class="ot-actions"><button class="ot-btn sm" @click="load">Refresh</button></div>
        </div>
        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OtPanel title="Alerts" flush :loading="loading && !alerts.length" :error="error" :empty="!alerts.length" empty-text="No alerts">
                    <OtGrid :rows="alerts" :columns="cols" grid-key="alerts" selectable :selected-key="form.Id" :row-key="(r: any) => r.Id" @select="edit">
                        <template #cell-Enabled="{ row }">
                            <button class="ot-chip" type="button" :class="row.Enabled ? 'ok' : ''" @click.stop="toggle(row)">{{ row.Enabled ? 'on' : 'off' }}</button>
                        </template>
                        <template #cell-LastValue="{ row }">
                            <span class="ot-chip" :class="row.LastValue === true ? 'accent' : ''">{{ row.LastValue === null || row.LastValue === undefined ? '—' : row.LastValue ? 'true' : 'false' }}</span>
                        </template>
                    </OtGrid>
                </OtPanel>
                <OtPanel title="Triggers" flush :empty="!events.length" empty-text="Nothing has fired" persist="alerts.events">
                    <OtGrid :rows="events" :columns="eventCols" grid-key="alert-events" :row-key="(r: any) => r.Id" selectable @select="(r: any) => openSymbol(r.Symbol)" />
                </OtPanel>
            </div>
            <OtPanel :title="form.Id ? 'Edit alert' : 'New alert'" code="ALRT">
                <div class="form">
                    <div class="ot-formgrid">
                        <label class="ot-field"><span class="lbl">Symbol</span><input v-model="form.Symbol" class="ot-input sm mono up" /></label>
                        <label class="ot-field">
                            <span class="lbl">Interval</span>
                            <select v-model="form.Interval" class="ot-select sm"><option v-for="i in INTERVALS" :key="i.value" :value="i.value">{{ i.short }}</option></select>
                        </label>
                        <label class="ot-field">
                            <span class="lbl">Mode</span>
                            <select v-model="form.Mode" class="ot-select sm"><option value="OnChange">turns true</option><option value="Once">once</option><option value="EveryBar">every true bar</option></select>
                        </label>
                    </div>
                    <label class="ot-field"><span class="lbl">Condition</span>
                        <OtFormulaInput v-model="form.Condition" require-boolean :symbol="form.Symbol" :interval="form.Interval" placeholder="crossover(close, sma(close, 200))" />
                    </label>
                    <div class="presets">
                        <button v-for="p in PRESETS" :key="p" class="ot-chip" type="button" @click="form.Condition = p">{{ p }}</button>
                    </div>
                    <label class="ot-field"><span class="lbl">Name</span><input v-model="form.Name" class="ot-input sm" :placeholder="`${form.Symbol} ${form.Condition}`" /></label>
                    <label class="ot-field"><span class="lbl">Message</span><input v-model="form.Message" class="ot-input sm" /></label>
                    <div class="ot-formgrid">
                        <label class="ot-check"><input v-model="form.Notify" type="checkbox" /> Discord</label>
                        <label class="ot-check"><input v-model="form.Enabled" type="checkbox" /> Enabled</label>
                        <label class="ot-field"><span class="lbl">Expires</span><input v-model="expires" class="ot-input sm mono" type="date" /></label>
                    </div>
                    <div v-if="test" class="test mono" :class="test.Ok ? '' : 'neg'">
                        <template v-if="test.Ok">now <b :class="test.Value ? 'accent' : ''">{{ test.Value }}</b> · true on {{ test.TrueBars }} / {{ test.Bars }} bars · close {{ fmtPrice(test.Close) }} @ {{ fmtDateTime(test.BarUtc) }}</template>
                        <template v-else>{{ test.Error }}</template>
                    </div>
                    <div class="acts">
                        <button class="ot-btn primary" type="button" :disabled="busy || !form.Symbol || !form.Condition" @click="save">Save</button>
                        <button class="ot-btn" type="button" :disabled="busy" @click="runTest">Test</button>
                        <button v-if="form.Id" class="ot-btn ghost" type="button" @click="remove">Delete</button>
                        <button class="ot-btn ghost" type="button" @click="reset()">New</button>
                        <NuxtLink v-if="form.Symbol" class="ot-btn ghost" :to="`/omnitrader/instrument?symbol=${encodeURIComponent(form.Symbol)}`">Chart</NuxtLink>
                    </div>
                </div>
            </OtPanel>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { INTERVALS, SWAL_TERMINAL, fmtDateTime, fmtPrice, tGet, tPost, useTicker } from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';

definePageMeta({ layout: 'navbar' });
const route = useRoute();
const router = useRouter();

const PRESETS = [
    'crossover(close, sma(close, 200))', 'crossunder(close, sma(close, 50))', 'rsi(14) < 30', 'rsi(14) > 70',
    'close > highest(high, 20)[1]', 'close < lowest(low, 20)[1]', 'volume > 3 * sma(volume, 20)', 'abs(roc(close, 1)) > 5',
];

const blank = () => ({
    Id: '', Name: '', Symbol: (route.query.symbol as string)?.toUpperCase() || 'BTCUSDT', Interval: 'OneHour', Condition: '',
    Message: '', Mode: 'OnChange', Enabled: true, Notify: true, ExpiresUtc: null as string | null,
});
const form = ref(blank());
const alerts = ref<any[]>([]);
const events = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);
const test = ref<any>(null);

const expires = computed({
    get: () => (form.value.ExpiresUtc ? String(form.value.ExpiresUtc).slice(0, 10) : ''),
    set: (v: string) => { form.value.ExpiresUtc = v ? `${v}T23:59:59Z` : null; },
});

async function load() {
    loading.value = true;
    try {
        const [a, e] = await Promise.all([tGet<any[]>('/terminal/alerts'), tGet<any[]>('/terminal/alert/events', { limit: 300 })]);
        alerts.value = a ?? [];
        events.value = e ?? [];
        error.value = null;
    } catch (err: any) { error.value = err?.message ?? 'failed'; }
    finally { loading.value = false; }
}
useTicker(load, 30_000);

function edit(row: any) { form.value = { ...blank(), ...row }; test.value = null; }
function reset() { form.value = blank(); test.value = null; }

async function save() {
    busy.value = true;
    try {
        const body = { ...form.value };
        if (!body.Id) delete (body as any).Id;
        const saved = await tPost<any>('/terminal/alert/save', body);
        form.value = { ...blank(), ...saved };
        await load();
    } catch (e: any) { void Swal.fire({ title: 'Not saved', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
    finally { busy.value = false; }
}

async function runTest() {
    busy.value = true;
    try { test.value = await tPost<any>('/terminal/alert/test', form.value); }
    catch (e: any) { test.value = { Ok: false, Error: e?.message }; }
    finally { busy.value = false; }
}

async function toggle(row: any) {
    try { await tPost('/terminal/alert/save', { ...row, Enabled: !row.Enabled }); await load(); }
    catch (e: any) { void Swal.fire({ title: 'Failed', text: e?.message, icon: 'error', ...SWAL_TERMINAL }); }
}

async function remove() {
    const ok = await Swal.fire({ title: 'Delete alert?', showCancelButton: true, icon: 'warning', ...SWAL_TERMINAL });
    if (!ok.isConfirmed) return;
    await tPost('/terminal/alert/delete', undefined, { id: form.value.Id });
    reset();
    await load();
}

function openSymbol(s: string) { void router.push(`/omnitrader/instrument?symbol=${encodeURIComponent(s)}`); }

const cols: GridColumn[] = [
    { key: 'Enabled', label: '', format: 'text', width: '44px' }, { key: 'Symbol', label: 'Symbol', format: 'sym' },
    { key: 'Interval', label: 'TF', format: 'text', value: r => INTERVALS.find(i => i.value === r.Interval)?.short ?? r.Interval },
    { key: 'Condition', label: 'Condition', format: 'text', class: () => 'mono', clip: 340 }, { key: 'Mode', label: 'Mode', format: 'text', hidden: true },
    { key: 'LastValue', label: 'Now', format: 'text' }, { key: 'LastTriggeredUtc', label: 'Last fired', format: 'datetime' },
    { key: 'TriggerCount', label: 'Fired', format: 'int' }, { key: 'LastCheckedUtc', label: 'Checked', format: 'age', hidden: true },
    { key: 'LastError', label: 'Error', format: 'text', class: r => (r.LastError ? 'neg' : undefined), clip: 260 },
];
const eventCols: GridColumn[] = [
    { key: 'TriggeredUtc', label: 'Fired', format: 'datetime' }, { key: 'Symbol', label: 'Symbol', format: 'sym' },
    { key: 'AlertName', label: 'Alert', format: 'text' }, { key: 'BarUtc', label: 'Bar', format: 'datetime' }, { key: 'Close', label: 'Close', format: 'price' },
];
</script>

<style scoped>
.form { display: flex; flex-direction: column; gap: 8px; }
.up { text-transform: uppercase; }
.presets { display: flex; flex-wrap: wrap; gap: 3px; }
.presets .ot-chip { cursor: pointer; }
.test { font-size: 11.5px; padding: 6px 8px; border: 1px solid var(--ot-line); border-radius: 3px; background: #08090b; }
.acts { display: flex; gap: 4px; flex-wrap: wrap; }
</style>
