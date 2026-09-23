<template>
    <div class="fp-panel">
        <div class="fp-head">
            <span class="fp-code">FP</span>
            <span class="fp-title">Fingerprint</span>
            <span v-if="loading" class="fp-spinner" aria-label="Loading"></span>
            <button class="fp-micro" :disabled="busy" title="Recompute now" @click="reclassify">Reclassify</button>
        </div>

        <div v-if="error" class="fp-empty">{{ error }}</div>
        <div v-else-if="!fp && !loading" class="fp-empty">No fingerprint yet: this IP hasn't been seen since fingerprinting started.</div>

        <template v-if="fp">
            <div class="fp-verdict" :style="{ '--cls': classColor(fp.Class) }">
                <span class="fp-class-dot"></span>
                <div class="fp-verdict-copy">
                    <strong>{{ classLabel(fp.Class) }}</strong>
                    <small>{{ classDescription(fp.Class) }}</small>
                </div>
                <span v-if="fp.ManualClass" class="fp-badge">manual</span>
            </div>
            <div class="fp-confidence" :title="`Confidence ${pct(fp.Confidence)}`">
                <div class="fp-confidence-fill" :style="{ width: pct(fp.Confidence), background: classColor(fp.Class) }"></div>
                <span>{{ pct(fp.Confidence) }} confidence</span>
            </div>
            <div v-if="fp.Tags?.length" class="fp-tags">
                <span v-for="tag in fp.Tags" :key="tag" class="fp-tag" :class="tagTone(tag)">{{ tag }}</span>
            </div>

            <section class="fp-section">
                <h4>Why</h4>
                <ol class="fp-evidence">
                    <li v-for="(e, i) in (fp.Evidence || []).slice(0, 7)" :key="i">
                        <span class="fp-weight" :style="{ color: classColor(e.Class) }">{{ weightLabel(e) }}</span>
                        <span class="fp-reason">{{ e.Reason }}</span>
                    </li>
                </ol>
                <div v-if="scoreRows.length > 1" class="fp-scores">
                    <span v-for="s in scoreRows" :key="s.id" :style="{ color: classColor(s.id) }">{{ classLabel(s.id) }} {{ s.score }}</span>
                </div>
            </section>

            <section class="fp-section">
                <h4>Network</h4>
                <dl class="fp-grid">
                    <div><dt>AS</dt><dd>{{ intel?.AsName || record?.AsName || record?.Asn || '-' }}</dd></div>
                    <div><dt>Org / ISP</dt><dd>{{ record?.Org || record?.Isp || '-' }}</dd></div>
                    <div class="wide"><dt>Reverse DNS</dt><dd>{{ rdnsLabel }}</dd></div>
                    <div><dt>Type</dt><dd>{{ networkType }}</dd></div>
                    <div><dt>Timezone</dt><dd>{{ intel?.Timezone || '-' }}</dd></div>
                    <div v-if="intel?.DatacenterProvider"><dt>Cloud</dt><dd>{{ intel.DatacenterProvider }}</dd></div>
                    <div v-if="intel?.VerifiedCrawler"><dt>Verified</dt><dd>{{ intel.VerifiedCrawler }}</dd></div>
                    <div v-if="intel?.ResearchScanner"><dt>Survey org</dt><dd>{{ intel.ResearchScanner }}</dd></div>
                    <div v-if="abuse"><dt>AbuseIPDB</dt><dd>{{ abuse.Score }}% / {{ abuse.Reports }} reports</dd></div>
                    <div v-if="greyNoise"><dt>GreyNoise</dt><dd>{{ greyNoiseLabel }}</dd></div>
                </dl>
            </section>

            <section class="fp-section">
                <h4>Behaviour</h4>
                <dl class="fp-grid">
                    <div><dt>Requests</dt><dd>{{ num(fp.Requests) }} / {{ num(fp.Sessions) }} sessions</dd></div>
                    <div><dt>Peak</dt><dd>{{ num(fp.PeakPerMinute) }}/min</dd></div>
                    <div><dt>Pacing</dt><dd>{{ pacingLabel }}</dd></div>
                    <div><dt>404s</dt><dd>{{ pct(fp.Requests ? fp.NotFound / fp.Requests : 0) }}</dd></div>
                    <div><dt>Routes</dt><dd>{{ (fp.Routes || []).length }}{{ fp.RoutesCapped ? '+' : '' }}</dd></div>
                    <div><dt>Origin</dt><dd>{{ pct(fp.Requests ? fp.WebsiteRequests / fp.Requests : 0) }} website</dd></div>
                    <div v-if="fp.AuthFailures"><dt>Auth fails</dt><dd>{{ num(fp.AuthFailures) }}</dd></div>
                    <div v-if="fp.LoginAttempts"><dt>Logins</dt><dd>{{ num(fp.LoginFailures) }} / {{ num(fp.LoginAttempts) }} failed</dd></div>
                    <div v-if="fp.HoneypotHits"><dt>Honeypot</dt><dd>{{ num(fp.HoneypotHits) }} hits</dd></div>
                    <div v-if="fp.RobotsFetches || fp.RobotsTrapHits"><dt>robots.txt</dt><dd>{{ fp.RobotsFetches }} fetch / {{ fp.RobotsTrapHits }} trap</dd></div>
                </dl>
                <div v-if="fp.SampleProbes?.length" class="fp-probes">
                    <span v-for="p in fp.SampleProbes" :key="p">{{ p }}</span>
                </div>
                <div class="fp-hours" :title="'Requests by UTC hour'">
                    <span v-for="(h, i) in hours" :key="i" :style="{ height: h.height }" :title="`${String(i).padStart(2, '0')}:00 UTC: ${h.count}`"></span>
                </div>
                <div class="fp-hours-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>UTC</span></div>
            </section>

            <section class="fp-section">
                <h4>HTTP client</h4>
                <div v-for="ua in topUserAgents" :key="ua.value" class="fp-row">
                    <span class="fp-mono clip" :title="ua.value">{{ ua.value }}</span><strong>{{ num(ua.count) }}</strong>
                </div>
                <dl class="fp-grid">
                    <div><dt>Claims</dt><dd>{{ topKey(fp.UaFamilies) || '-' }}</dd></div>
                    <div><dt>Kind</dt><dd>{{ topKey(fp.UaKinds) || '-' }}</dd></div>
                    <div class="wide"><dt>JA4H-lite</dt><dd class="fp-mono">{{ topKey(fp.Ja4h) || '-' }}</dd></div>
                    <div v-if="fp.Tls"><dt>JA4</dt><dd class="fp-mono">{{ topKey(fp.Tls.Ja4) || '-' }}</dd></div>
                    <div v-if="fp.BrowserClaims"><dt>Header check</dt><dd>{{ headerCheck }}</dd></div>
                </dl>
            </section>

            <section v-if="fp.Beacon" class="fp-section">
                <h4>Browser beacon</h4>
                <dl class="fp-grid">
                    <div><dt>Beacons</dt><dd>{{ num(fp.Beacon.Count) }}</dd></div>
                    <div><dt>Input</dt><dd>{{ inputLabel }}</dd></div>
                    <div><dt>Screen</dt><dd>{{ fp.Beacon.Screen || '-' }}</dd></div>
                    <div><dt>Platform</dt><dd>{{ fp.Beacon.Platform || '-' }}</dd></div>
                    <div><dt>Timezone</dt><dd>{{ fp.Beacon.Timezone || '-' }} <em v-if="fp.Beacon.TimezoneMatchesGeo === false" class="fp-bad">≠ IP</em></dd></div>
                    <div><dt>Hardware</dt><dd>{{ fp.Beacon.Cores ?? '?' }} cores / {{ fp.Beacon.MemoryGb ?? '?' }} GB</dd></div>
                    <div class="wide"><dt>WebGL</dt><dd>{{ fp.Beacon.WebglRenderer || '-' }}</dd></div>
                    <div class="wide"><dt>Languages</dt><dd>{{ fp.Beacon.Languages || '-' }}</dd></div>
                </dl>
                <div v-if="fp.Beacon.Anomalies?.length || fp.Beacon.Webdriver" class="fp-anomalies">
                    <span v-if="fp.Beacon.Webdriver" class="fp-tag bad">navigator.webdriver</span>
                    <span v-for="a in fp.Beacon.Anomalies" :key="a" class="fp-tag warn">{{ a }}</span>
                </div>
            </section>

            <section v-if="devices.length || linkedIps.length" class="fp-section">
                <h4>Devices</h4>
                <div v-for="d in devices" :key="d.device_id" class="fp-row">
                    <span class="fp-mono">{{ d.device_id }}</span><strong>{{ d.beacons }} beacons</strong>
                </div>
                <div v-if="linkedIps.length" class="fp-linked">
                    <span>Same device seen on</span>
                    <button v-for="l in linkedIps" :key="l.device_id + l.ip" class="fp-link" @click="$emit('select-ip', l.ip)">{{ l.ip }}</button>
                </div>
            </section>

            <section v-if="recent?.length" class="fp-section">
                <h4>Recent requests</h4>
                <div v-for="r in recent.slice(0, 10)" :key="r.id" class="fp-row">
                    <span class="fp-mono clip" :title="r.route">{{ r.method }} {{ r.route }}</span>
                    <strong :class="Number(r.status) >= 400 ? 'fp-bad' : ''">{{ r.status }}</strong>
                </div>
            </section>

            <section class="fp-section">
                <h4>Override</h4>
                <div class="fp-override">
                    <select v-model="overrideChoice" :disabled="busy" aria-label="Manual class">
                        <option value="auto">Automatic</option>
                        <option v-for="c in classInfo" :key="c.id" :value="c.id">{{ c.label }}</option>
                    </select>
                    <button class="fp-micro" :disabled="busy || overrideChoice === currentOverride" @click="applyOverride">Apply</button>
                </div>
            </section>
        </template>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps({
    ip: { type: String, default: '' },
    classInfo: { type: Array, default: () => [] },
    recent: { type: Array, default: () => [] },
    /** Bumped by the page's refresh loop; the panel reloads at most every RELOAD_MS. */
    tick: { type: Number, default: 0 },
});
const emit = defineEmits(['select-ip', 'changed']);

const RELOAD_MS = 15000;
const data = ref(null);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const overrideChoice = ref('auto');
let loadedAt = 0;
let loadedIp = '';

const fp = computed(() => data.value?.fingerprint || null);
const record = computed(() => data.value?.record || null);
const intel = computed(() => data.value?.intel || null);
const abuse = computed(() => data.value?.abuse || null);
const greyNoise = computed(() => data.value?.greyNoise || null);
const devices = computed(() => data.value?.devices || []);
const linkedIps = computed(() => data.value?.linkedIps || []);
const currentOverride = computed(() => fp.value?.ManualClass || 'auto');

async function load(force = false) {
    const ip = props.ip;
    if (!ip) { data.value = null; return; }
    if (!force && ip === loadedIp && Date.now() - loadedAt < RELOAD_MS) return;
    loading.value = true;
    try {
        const r = await RequestGETFromKliveAPI('/omnidefence/ip/fingerprint?ip=' + encodeURIComponent(ip), false, false);
        if (!r.ok) { error.value = `Fingerprint unavailable (${r.status})`; return; }
        if (props.ip !== ip) return; // selection moved on while loading
        data.value = await r.json();
        error.value = '';
        loadedAt = Date.now();
        loadedIp = ip;
        overrideChoice.value = data.value?.fingerprint?.ManualClass || 'auto';
    } catch (e) {
        error.value = String(e);
    } finally {
        loading.value = false;
    }
}

watch(() => props.ip, () => { data.value = null; load(true); }, { immediate: true });
watch(() => props.tick, () => load(false));

async function post(url, body) {
    busy.value = true;
    try {
        const r = await RequestPOSTFromKliveAPI(url, JSON.stringify(body), false, true);
        if (!r.ok) { error.value = await r.text(); return false; }
        return true;
    } finally {
        busy.value = false;
    }
}

async function reclassify() {
    if (await post('/omnidefence/ip/reclassify', { ip: props.ip })) {
        setTimeout(() => load(true), 600);
        emit('changed');
    }
}

async function applyOverride() {
    if (await post('/omnidefence/ip/class', { ip: props.ip, class: overrideChoice.value })) {
        setTimeout(() => load(true), 600);
        emit('changed');
    }
}

// ── formatting ──
const infoFor = id => props.classInfo.find(c => c.id === id);
const classColor = id => infoFor(id)?.color || '#56636b';
const classLabel = id => infoFor(id)?.label || id || 'Unknown';
const classDescription = id => infoFor(id)?.description || '';
const pct = v => `${Math.round((Number(v) || 0) * 100)}%`;
const num = v => Number(v || 0).toLocaleString();
const topKey = map => {
    if (!map) return null;
    let best = null, bestN = -1;
    for (const [k, n] of Object.entries(map)) if (n > bestN) { best = k; bestN = n; }
    return best;
};
const weightLabel = e => (Number(e.Weight) >= 99 ? 'RULE' : (Number(e.Weight) > 0 ? '+' : '') + Number(e.Weight).toFixed(1));
const tagTone = tag => {
    const t = tag.split(':')[0];
    if (['SpoofedUA', 'FakeCrawler', 'HoneypotHit', 'RobotsViolator', 'Tor', 'Abuse'].includes(t)) return 'bad';
    if (['Datacenter', 'VPN/Proxy', 'HostIsIP', 'NoSNI', 'TzMismatch', 'IpRotation', 'MultiDevice', 'PlainHTTP'].includes(t)) return 'warn';
    if (['RealInput', 'Verified', 'Authenticated', 'Residential', 'Mobile', 'Website'].includes(t)) return 'good';
    return '';
};

const scoreRows = computed(() => Object.entries(fp.value?.Scores || {})
    .filter(([, s]) => s > 0 && s < 99)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, score]) => ({ id, score: score.toFixed(1) })));

const topUserAgents = computed(() => Object.entries(fp.value?.UserAgents || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([value, count]) => ({ value, count })));

const hours = computed(() => {
    const h = fp.value?.HourHistogram || [];
    const max = Math.max(1, ...h);
    return Array.from({ length: 24 }, (_, i) => ({ count: h[i] || 0, height: `${Math.max(2, Math.round(((h[i] || 0) / max) * 100))}%` }));
});

const pacingLabel = computed(() => {
    const f = fp.value;
    if (!f || f.GapCount < 2) return '-';
    const sd = f.GapCount > 1 ? Math.sqrt(f.GapM2 / (f.GapCount - 1)) : 0;
    const cv = f.GapMean > 0 ? sd / f.GapMean : 0;
    return `${f.GapMean.toFixed(1)}s ± ${sd.toFixed(1)} (CV ${cv.toFixed(2)})`;
});

const rdnsLabel = computed(() => {
    const host = data.value?.rdns?.Host || intel.value?.ReverseDns || record.value?.ReverseDns;
    if (!host) return data.value?.rdns ? 'No PTR record' : 'Not looked up yet';
    return `${host}${(data.value?.rdns?.ForwardConfirmed ?? intel.value?.ReverseDnsForwardConfirmed) ? ' ✓ forward-confirmed' : ''}`;
});

const networkType = computed(() => {
    const i = intel.value || {};
    const parts = [];
    if (i.IsHosting || i.DatacenterProvider) parts.push('Datacenter');
    if (i.IsProxy) parts.push('VPN/Proxy');
    if (i.IsTor) parts.push('Tor');
    if (i.IsMobile) parts.push('Mobile');
    if (!parts.length && i.IsHosting === false) parts.push('Residential/ISP');
    return parts.join(' + ') || 'Unknown';
});

const greyNoiseLabel = computed(() => {
    const g = greyNoise.value;
    if (!g) return '-';
    if (g.Riot) return `RIOT ${g.Name || ''}`.trim();
    if (!g.Noise) return 'Not seen scanning';
    return `${g.Classification || 'unknown'} ${g.Name || ''}`.trim();
});

const headerCheck = computed(() => {
    const f = fp.value;
    if (!f?.BrowserClaims) return '-';
    const issues = [];
    if (f.MissingClientHints) issues.push(`${f.MissingClientHints} no client hints`);
    if (f.MissingSecFetch) issues.push(`${f.MissingSecFetch} no Sec-Fetch`);
    if (f.MissingAcceptLanguage) issues.push(`${f.MissingAcceptLanguage} no Accept-Language`);
    if (f.SecChUaMismatch) issues.push(`${f.SecChUaMismatch} hint mismatch`);
    return issues.length ? issues.join(', ') : 'Consistent';
});

const inputLabel = computed(() => {
    const b = fp.value?.Beacon;
    if (!b) return '-';
    const trusted = `${num(b.TrustedPointer)} ptr / ${num(b.TrustedKeys)} key / ${num(b.TrustedTouch)} touch`;
    return b.UntrustedEvents ? `${trusted} (${num(b.UntrustedEvents)} synthetic)` : trusted;
});
</script>

<style scoped>
/* main.scss colours every element; reset inside the panel so these rules own the look. */
.fp-panel, .fp-panel * { color: inherit; font-family: inherit; box-sizing: border-box; }
.fp-panel { color: #cfeee5; font-size: 12px; }
.fp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.fp-code { color: #57f0b3; font: 800 10px ui-monospace, Consolas, monospace; letter-spacing: 1px; }
.fp-title { flex: 1; color: #eafff9; font-size: 14px; font-weight: 800; }
.fp-spinner { width: 12px; height: 12px; border: 2px solid rgba(82,255,185,.2); border-top-color: #52ffb9; border-radius: 50%; animation: fp-spin .8s linear infinite; }
@keyframes fp-spin { to { transform: rotate(360deg); } }
.fp-micro { padding: 4px 7px; border: 1px solid rgba(82,255,185,.28); border-radius: 4px; background: rgba(255,255,255,.04); color: #eafff9; font-size: 11px; font-weight: 700; cursor: pointer; }
.fp-micro:disabled { opacity: .5; cursor: wait; }
.fp-empty { color: #78928b; font-size: 11px; padding: 6px 0; }

.fp-verdict { display: flex; align-items: center; gap: 10px; padding: 9px; border: 1px solid color-mix(in srgb, var(--cls) 40%, transparent); border-radius: 5px; background: color-mix(in srgb, var(--cls) 12%, transparent); }
.fp-class-dot { flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--cls); box-shadow: 0 0 12px var(--cls); }
.fp-verdict-copy { flex: 1; min-width: 0; }
.fp-verdict-copy strong { display: block; color: #f3fffb; font-size: 15px; }
.fp-verdict-copy small { display: block; margin-top: 2px; color: #93b0a8; font-size: 11px; line-height: 1.3; }
.fp-badge { padding: 2px 6px; border-radius: 3px; background: rgba(255,255,255,.08); color: #ffe39a; font-size: 10px; font-weight: 800; text-transform: uppercase; }

.fp-confidence { position: relative; height: 18px; margin-top: 6px; border-radius: 3px; background: rgba(255,255,255,.05); overflow: hidden; }
.fp-confidence-fill { position: absolute; inset: 0 auto 0 0; opacity: .45; }
.fp-confidence span { position: relative; display: block; padding: 2px 7px; color: #eafff9; font-size: 11px; font-weight: 700; }

.fp-tags, .fp-anomalies, .fp-probes { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
.fp-tag { padding: 2px 6px; border: 1px solid rgba(255,255,255,.12); border-radius: 3px; background: rgba(255,255,255,.04); color: #bcd3cc; font-size: 10px; font-weight: 700; }
.fp-tag.good { color: #baffdc; border-color: rgba(82,255,185,.3); }
.fp-tag.warn { color: #ffd98a; border-color: rgba(255,194,71,.35); }
.fp-tag.bad { color: #ffb9c1; border-color: rgba(255,83,104,.4); }
.fp-probes span { padding: 2px 5px; border-radius: 3px; background: rgba(255,96,113,.1); color: #ffc4cc; font: 10px ui-monospace, Consolas, monospace; }

.fp-section { margin-top: 12px; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.07); }
.fp-section h4 { margin: 0 0 6px; color: #7d948e; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; }

.fp-evidence { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; }
.fp-evidence li { display: grid; grid-template-columns: 40px 1fr; gap: 6px; align-items: baseline; }
.fp-weight { font: 800 10px ui-monospace, Consolas, monospace; text-align: right; }
.fp-reason { color: #d6f2ea; line-height: 1.35; }
.fp-scores { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 7px; font: 700 10px ui-monospace, Consolas, monospace; }

.fp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0; }
.fp-grid div { min-width: 0; padding: 6px; border: 1px solid rgba(255,255,255,.06); border-radius: 4px; background: rgba(255,255,255,.025); }
.fp-grid div.wide { grid-column: 1 / -1; }
.fp-grid dt { color: #7d948e; font-size: 10px; text-transform: uppercase; }
.fp-grid dd { margin: 2px 0 0; color: #f3fffb; overflow-wrap: anywhere; }

.fp-row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
.fp-row strong { flex: none; color: #eafff9; }
.fp-mono { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
.clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.fp-bad, .fp-row strong.fp-bad { color: #ff8d9a; font-style: normal; }

.fp-hours { display: grid; grid-template-columns: repeat(24, 1fr); align-items: end; gap: 2px; height: 36px; margin-top: 8px; }
.fp-hours span { background: linear-gradient(180deg, #52ffb9, rgba(82,255,185,.25)); border-radius: 1px; }
.fp-hours-axis { display: flex; justify-content: space-between; margin-top: 2px; color: #62786f; font: 9px ui-monospace, Consolas, monospace; }

.fp-linked { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 6px; color: #93b0a8; font-size: 11px; }
.fp-link { padding: 2px 6px; border: 1px solid rgba(95,211,255,.35); border-radius: 3px; background: transparent; color: #bcecff; font: 11px ui-monospace, Consolas, monospace; cursor: pointer; }

.fp-override { display: flex; gap: 6px; }
.fp-override select { flex: 1; min-width: 0; padding: 5px; border: 1px solid rgba(82,255,185,.2); border-radius: 4px; background: #081013; color: #eafff9; font-size: 12px; }
</style>
