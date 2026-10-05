<template>
  <Teleport to="body">
    <div v-if="open" class="cs2-drawer-backdrop" @click.self="emit('close')">
      <aside class="cs2-drawer" role="dialog" aria-modal="true" aria-labelledby="cs2-settings-title">
        <header class="cs2-drawer__header">
          <div>
            <h2 id="cs2-settings-title">Bot settings</h2>
            <span class="cs2-drawer__hint">Applied by the bot within a minute — no restart needed.</span>
          </div>
          <button type="button" class="cs2-drawer__close" aria-label="Close settings" @click="emit('close')">×</button>
        </header>

        <div v-if="loading" class="cs2-drawer__state">Loading settings…</div>
        <div v-else-if="error" class="cs2-drawer__state cs2-drawer__state--error">{{ error }}</div>
        <div v-else-if="!groups.length" class="cs2-drawer__state">
          No CS2 settings exist yet — the bot creates them the first time it starts.
        </div>

        <div v-else class="cs2-drawer__body">
          <section v-for="group in groups" :key="group.title" class="cs2-drawer__group">
            <h3>{{ group.title }}</h3>
            <div v-for="row in group.rows" :key="row.setting.Name" class="cs2-setting" :class="{ 'is-dirty': isDirty(row.setting) }">
              <div class="cs2-setting__text">
                <label :for="inputId(row.setting)">{{ row.meta.label }}</label>
                <span>{{ row.meta.help }}</span>
              </div>
              <div class="cs2-setting__control">
                <label v-if="row.setting.Type === 1" class="cs2-switch">
                  <input :id="inputId(row.setting)" v-model="drafts[row.setting.Name]" type="checkbox">
                  <span class="cs2-switch__track" aria-hidden="true" />
                </label>
                <div v-else class="cs2-number">
                  <span v-if="row.meta.prefix" class="cs2-number__affix">{{ row.meta.prefix }}</span>
                  <input
                    :id="inputId(row.setting)"
                    v-model="drafts[row.setting.Name]"
                    :type="row.setting.Type === 2 ? 'number' : 'text'"
                    :min="row.meta.min"
                    :step="row.meta.step ?? 1"
                  >
                  <span v-if="row.meta.suffix" class="cs2-number__affix">{{ row.meta.suffix }}</span>
                </div>
                <button
                  type="button"
                  class="cs2-setting__save"
                  :disabled="!isDirty(row.setting) || saving[row.setting.Name]"
                  @click="save(row.setting)"
                >
                  {{ saving[row.setting.Name] ? 'Saving' : 'Save' }}
                </button>
              </div>
            </div>
          </section>
        </div>
        <footer v-if="message" class="cs2-drawer__footer" :class="{ 'is-error': messageIsError }">{{ message }}</footer>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

interface OmniSetting {
  Name: string;
  Type: number;
  Sensitive: boolean;
  Value: string;
  ParentServiceName: string;
  ParentServiceId: string;
}

interface SettingMeta {
  label: string;
  help: string;
  group: 'Engine' | 'Buying thresholds' | 'Exit model' | 'Risk limits' | 'Pacing & model';
  order: number;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();

/** Plain-English labels for the bot's OmniSettings (names are the server's contract). */
const KNOWN: Record<string, SettingMeta> = {
  PerformCS2Scans: { group: 'Engine', order: 1, label: 'Scan the market', help: 'Run the live feed, sweeps and the hourly whole-market scan.' },
  PurchaseCSFloatArbitrageOpportunities: { group: 'Engine', order: 2, label: 'Buy automatically', help: 'Off = find and alert only. On = buy qualifying listings immediately.' },
  CS2ArbitrageAllowCSFloatRelistExit: { group: 'Engine', order: 3, label: 'Allow CSFloat relist exit', help: 'Consider reselling on CSFloat after trade protection (no Steam fee, no wallet conversion).' },
  CS2ArbitrageAlertOnUnboughtOpportunities: { group: 'Engine', order: 4, label: 'Alert on unbought deals', help: 'Discord message when a qualifying listing is skipped (caps, balance, rejected purchase).' },
  CS2ArbitrageMinimumRelistROIPercent: { group: 'Buying thresholds', order: 1, label: 'Relist exit: minimum return', suffix: '%', min: 0, help: "Risk-adjusted: after CSFloat's fee, how long it takes to sell, the 7-day trade lock before and the buyer's protection after." },
  CS2ArbitrageMinimumSteamROIPercent: { group: 'Buying thresholds', order: 2, label: 'Steam exit: minimum return', suffix: '%', min: 0, help: "Risk-adjusted: after Steam fees, the conversion and the converters' 7-day hold before the cash is back on CSFloat." },
  CS2ArbitrageMinimumProfitPence: { group: 'Buying thresholds', order: 3, label: 'Minimum profit per trade', suffix: 'p', min: 0, help: 'Each trade needs a manual Steam accept — skip ones not worth it.' },
  CS2ArbitrageMinimumListingPriceCents: { group: 'Buying thresholds', order: 4, label: 'Ignore listings under', suffix: '¢ (USD)', min: 3, help: 'Feed price floor. Lower = more listings but the feed may not keep up.' },
  CS2ArbitrageMaximumListingPriceDollars: { group: 'Buying thresholds', order: 5, label: 'Ignore listings over', prefix: '$', min: 0, help: '0 = no absolute cap (the per-item balance share still applies).' },
  CS2ArbitrageMaxSpendPerItemPercent: { group: 'Risk limits', order: 1, label: 'Max spend per item', suffix: '% of balance', min: 1, help: 'Largest share of the CSFloat balance one listing may cost.' },
  CS2ArbitrageMaxUnitsPerItem: { group: 'Risk limits', order: 2, label: 'Max units of one item', min: 1, help: 'Held at once (bought, in trade, in protection or relisted).' },
  CS2ArbitrageDailySpendLimitPounds: { group: 'Risk limits', order: 3, label: 'Daily spend limit', prefix: '£', min: 0, help: '0 = unlimited.' },
  CS2ArbitrageSteamPriceHaircutPercent: { group: 'Risk limits', order: 4, label: 'Steam price safety haircut', suffix: '%', min: 0, help: "Used by the quick screen only; the exit model forecasts the 7-day lock's drift and risk itself." },
  CS2ArbitrageAutoManageRelists: { group: 'Exit model', order: 1, label: 'Manage relists automatically', help: "Re-price an unsold CSFloat relist, or switch it to Steam, when the evidence says so. Off = Discord advice only." },
  CS2ArbitrageCapitalCostBasisPointsPerDay: { group: 'Exit model', order: 2, label: 'Cost of tied-up money', suffix: 'bp/day', min: 0, help: '20 = 0.2% a day. What waiting costs: every trade lock, hold and slow sale is charged at this rate.' },
  CS2ArbitrageRiskAversionTenths: { group: 'Exit model', order: 3, label: 'Risk aversion', suffix: '÷10', min: 0, help: '20 = 2.0. Higher prefers certain exits over uncertain ones (e.g. Steam now over a slow relist). 0 = risk-neutral.' },
  CS2ArbitrageRelistHorizonDays: { group: 'Exit model', order: 4, label: 'Relist patience', suffix: 'days', min: 3, help: "How long a relist is given before the model assumes its fallback (Steam, or a clearing price)." },
  CS2ArbitrageSteamConfirmHours: { group: 'Exit model', order: 5, label: 'Steam confirmation delay', suffix: 'h', min: 0, help: "How long confirming a Steam Market listing in the app usually takes; part of the Steam exit's time to cash." },
  CS2ArbitrageSteamWalletCapDollars: { group: 'Exit model', order: 6, label: 'Steam wallet cap', prefix: '$', min: 0, help: 'Steam refuses a Market listing that would take the wallet past this (about $2,000-equivalent).' },
  CS2ArbitrageMinimumSteamBuyOrders: { group: 'Risk limits', order: 5, label: 'Minimum Steam buy orders', min: 0, help: 'An item needs at least this many buy orders to count as sellable on Steam.' },
  CS2ArbitrageDefaultConversionPercent: { group: 'Pacing & model', order: 1, label: 'Fallback conversion rate', suffix: '%', min: 40, help: 'Used until the conversion model has verified converters (cases convert at ~68%).' },
  CS2ArbitrageFeedMinIntervalSeconds: { group: 'Pacing & model', order: 2, label: 'Fastest feed poll', suffix: 's', min: 5, help: 'The 200/hour CSFloat key usually sets ~19 s anyway.' },
  CS2ArbitrageSteamRequestSpacingMs: { group: 'Pacing & model', order: 3, label: 'Steam request spacing', suffix: 'ms', min: 250, help: 'Backs off automatically on rate limits.' },
};

/** Credentials are managed on the admin settings page, never here. */
const HIDDEN = new Set(['CSFloatAPIKey', 'CS2ArbitrageBotSteamLoginUsername', 'CS2ArbitrageBotSteamLoginPassword']);
const GROUP_ORDER: SettingMeta['group'][] = ['Engine', 'Buying thresholds', 'Exit model', 'Risk limits', 'Pacing & model'];

const settings = ref<OmniSetting[]>([]);
const drafts = reactive<Record<string, any>>({});
const saving = reactive<Record<string, boolean>>({});
const loading = ref(false);
const error = ref('');
const message = ref('');
const messageIsError = ref(false);

const inputId = (s: OmniSetting) => `cs2-setting-${s.Name}`;
const asDraft = (s: OmniSetting) => (s.Type === 1 ? String(s.Value).toLowerCase() === 'true' : s.Value);
const isDirty = (s: OmniSetting) => String(drafts[s.Name]) !== String(asDraft(s));

const groups = computed(() => {
  const rows = settings.value.map((setting) => ({
    setting,
    meta: KNOWN[setting.Name] ?? { group: 'Pacing & model' as const, order: 99, label: setting.Name, help: 'Setting added by a newer bot build.' },
  }));
  return GROUP_ORDER
    .map((title) => ({ title, rows: rows.filter((r) => r.meta.group === title).sort((a, b) => a.meta.order - b.meta.order) }))
    .filter((g) => g.rows.length);
});

const load = async () => {
  loading.value = true;
  error.value = '';
  message.value = '';
  try {
    const response = await RequestGETFromKliveAPI('/OmniGlobalSettings/List', false, false);
    if (!response.ok) {
      error.value = response.status === 403 ? 'Only Klives can change bot settings.' : `Couldn't load settings (HTTP ${response.status}).`;
      return;
    }
    const all: OmniSetting[] = await response.json();
    settings.value = all.filter((s) => s.ParentServiceName === 'CS2ArbitrageBot' && !s.Sensitive && !HIDDEN.has(s.Name));
    for (const s of settings.value) drafts[s.Name] = asDraft(s);
  } catch {
    error.value = "Couldn't load settings.";
  } finally {
    loading.value = false;
  }
};

const save = async (setting: OmniSetting) => {
  const raw = drafts[setting.Name];
  let value: string;
  if (setting.Type === 1) {
    value = raw ? 'true' : 'false';
  } else if (setting.Type === 2) {
    const n = Number(raw);
    if (!Number.isInteger(n)) {
      message.value = `${KNOWN[setting.Name]?.label ?? setting.Name} must be a whole number.`;
      messageIsError.value = true;
      return;
    }
    value = String(n);
  } else {
    value = String(raw ?? '');
  }
  saving[setting.Name] = true;
  try {
    const response = await RequestPOSTFromKliveAPI('/OmniGlobalSettings/Set', JSON.stringify({
      name: setting.Name,
      value,
      parentServiceId: setting.ParentServiceId,
      parentServiceName: setting.ParentServiceName,
    }), false, true);
    if (response.ok) {
      setting.Value = value;
      drafts[setting.Name] = asDraft(setting);
      message.value = `Saved: ${KNOWN[setting.Name]?.label ?? setting.Name}.`;
      messageIsError.value = false;
      emit('saved');
    } else {
      message.value = `Save failed (HTTP ${response.status}).`;
      messageIsError.value = true;
    }
  } catch {
    message.value = 'Save failed.';
    messageIsError.value = true;
  } finally {
    saving[setting.Name] = false;
  }
};

watch(() => props.open, (open) => { if (open) load(); }, { immediate: true });
</script>

<style scoped>
.cs2-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.55);
}

.cs2-drawer,
.cs2-drawer * { color: inherit; font-family: inherit; }

.cs2-drawer {
  display: flex;
  width: min(520px, 100vw);
  height: 100%;
  flex-direction: column;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: #161616;
  color: #ededed;
  font-family: 'Roboto', sans-serif;
}

.cs2-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.cs2-drawer__header h2 { font-size: 15px; font-weight: 700; color: #f4f4f4; }
.cs2-drawer__hint { display: block; margin-top: 3px; color: #858585; font-size: 11px; }

.cs2-drawer__close {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: #bdbdbd;
  font-size: 18px;
  letter-spacing: 0;
}

.cs2-drawer__state { padding: 18px 16px; color: #969696; font-size: 12px; }
.cs2-drawer__state--error { color: #ff9a9a; }

.cs2-drawer__body { flex: 1; overflow-y: auto; padding: 6px 16px 16px; }

.cs2-drawer__group h3 {
  margin: 14px 0 6px;
  color: #8de279;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cs2-setting {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
}

.cs2-setting.is-dirty .cs2-setting__text label { color: #f0c35b; }
.cs2-setting__text { min-width: 0; }
.cs2-setting__text label { display: block; color: #ededed; font-size: 12px; font-weight: 600; }
.cs2-setting__text span { display: block; margin-top: 2px; color: #858585; font-size: 11px; line-height: 1.3; }
.cs2-setting__control { display: flex; align-items: center; gap: 6px; }

.cs2-number {
  display: flex;
  height: 28px;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  background: #1d1d1d;
}

.cs2-number input {
  width: 64px;
  height: 100%;
  border: 0;
  background: transparent;
  color: #f4f4f4;
  font-size: 12px;
  text-align: right;
  outline: none;
  padding: 0 6px;
}

.cs2-number__affix { padding: 0 6px; color: #858585; font-size: 11px; white-space: nowrap; }

.cs2-switch { position: relative; display: inline-flex; cursor: pointer; }
.cs2-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.cs2-switch__track {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 999px;
  background: #3a3a3a;
  transition: background 0.15s;
}
.cs2-switch__track::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #d9d9d9;
  content: '';
  transition: transform 0.15s;
}
.cs2-switch input:checked + .cs2-switch__track { background: #4d9e39; }
.cs2-switch input:checked + .cs2-switch__track::after { transform: translateX(16px); }
.cs2-switch input:focus-visible + .cs2-switch__track { outline: 2px solid #8de279; outline-offset: 2px; }

.cs2-setting__save {
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(98, 206, 71, 0.35);
  border-radius: 5px;
  background: rgba(77, 158, 57, 0.12);
  color: #8de279;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.cs2-setting__save:disabled { border-color: rgba(255, 255, 255, 0.07); background: transparent; color: #5c5c5c; cursor: default; }

.cs2-drawer__footer {
  padding: 9px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: #8de279;
  font-size: 12px;
}
.cs2-drawer__footer.is-error { color: #ff9a9a; }
</style>
