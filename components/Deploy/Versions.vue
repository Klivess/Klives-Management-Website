<template>
  <section class="dpl-card" aria-label="Versions and authority" data-testid="dpl-versions">
    <header class="dpl-card__head">
      <h2 class="dpl-card__title"><DeployIcon name="shield" />Versions &amp; authority</h2>
      <span class="dpl-card__meta">{{ versions.length ? `${versions.length} registered` : 'none registered' }}</span>
      <div class="dpl-card__tools">
        <button class="dpl-iconbtn" :aria-label="open ? 'Hide' : 'Show'" :title="open ? 'Hide' : 'Show'" @click="open = !open"><DeployIcon :name="open ? 'chevron-up' : 'chevron-down'" /></button>
      </div>
    </header>
    <template v-if="open">
      <p class="dpl-dim dpl-small" style="margin: 0 14px 10px">
        An immutable version of a strategy's inputs, and how much the firm lets it do: observe, paper, broker demo, live with approval, or fully automated. Promotion checks its record first.
      </p>
      <div v-if="!versions.length" class="dpl-empty dpl-empty--short">No versions registered yet.</div>
      <div v-else class="dpl-minitable" style="margin: 0 14px 14px">
        <div class="dpl-mt-row dpl-mt-row--head dpl-mt-row--versions"><span>Strategy</span><span class="dpl-num">Version</span><span>Status</span><span>Authority</span><span>Approved</span><span></span></div>
        <div v-for="v in versions" :key="v.Id" class="dpl-mt-row dpl-mt-row--versions">
          <span class="dpl-truncate" :title="v.Notes ?? ''">{{ nameOf(v.StrategyClass) }}</span>
          <span class="dpl-num">v{{ v.Version }}</span>
          <span><span class="dpl-chip" :data-tone="v.Status === 'promoted' ? 'ok' : undefined">{{ v.Status }}</span></span>
          <span><span class="dpl-chip" :data-tone="v.Authority === 'Automated' ? 'crit' : v.Authority === 'ApprovalRequired' ? 'warn' : undefined">{{ v.Authority }}</span></span>
          <span class="dpl-dim">{{ v.ApprovedBy ?? '—' }}</span>
          <span><button v-if="canPromote" class="dpl-btn dpl-btn--xs" @click="startPromotion(v)">Promote…</button></span>
        </div>
      </div>
    </template>

    <DeployDialog :open="!!promotion" :title="promotion ? `Promote ${nameOf(promotion.version.StrategyClass)} v${promotion.version.Version}` : ''" icon="shield" tone="warn" wide @close="promotion = null">
      <template v-if="promotion">
        <label class="dpl-fieldset" style="max-width: 320px">
          <span class="dpl-label">Requested authority</span>
          <select v-model="promotion.requested" class="dpl-input" @change="assessNow">
            <option value="Paper">Paper</option>
            <option value="Demo">Demo (broker simulation)</option>
            <option value="ApprovalRequired">Live, approval required</option>
            <option value="Automated">Live, fully automated</option>
          </select>
          <span class="dpl-hint">Currently {{ promotion.version.Authority }}.</span>
        </label>
        <div v-if="promotion.assessment" class="dpl-checks" style="margin-top: 12px">
          <div class="dpl-check" :data-level="promotion.assessment.Eligible ? 'pass' : 'warn'"><DeployIcon :name="promotion.assessment.Eligible ? 'check' : 'alert'" /><span class="dpl-check__text"><b>{{ promotion.assessment.Eligible ? 'Requirements met' : 'Not eligible yet' }}</b><span>{{ promotion.assessment.Summary }}</span></span></div>
          <div v-for="(r, i) in promotion.assessment.Requirements ?? []" :key="i" class="dpl-check" :data-level="r.Met ? 'pass' : 'block'"><DeployIcon :name="r.Met ? 'check' : 'x'" /><span class="dpl-check__text"><b>{{ r.Name }}</b><span>{{ r.Detail }}</span></span></div>
        </div>
        <div v-else class="dpl-dim dpl-small" style="margin-top: 12px">Checking its record…</div>
      </template>
      <template #actions>
        <button class="dpl-btn dpl-btn--ghost" @click="promotion = null">Cancel</button>
        <button class="dpl-btn dpl-btn--primary" :disabled="busy || !promotion?.assessment?.Eligible" @click="doPromote">Promote to {{ promotion?.requested }}</button>
      </template>
    </DeployDialog>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';

/** The firm's version ladder (from the old page), folded away: zero rows on the live server today. */
const props = defineProps<{
  versions: any[]; nameOf: (cls: string) => string; canPromote: boolean;
  assess: (strategy: string, version: number, authority: string) => Promise<any>;
  promote: (strategy: string, version: number, authority: string) => Promise<any>;
}>();
const emit = defineEmits<{ changed: []; notify: [text: string, tone: 'ok' | 'warn' | 'crit'] }>();

const open = ref(false);
const busy = ref(false);
const promotion = ref<{ version: any; requested: string; assessment: any } | null>(null);
const LADDER = ['Observe', 'Paper', 'Demo', 'ApprovalRequired', 'Automated'];

function startPromotion(version: any) {
  const i = LADDER.indexOf(version.Authority);
  promotion.value = { version, requested: LADDER[Math.min(LADDER.length - 1, i + 1)], assessment: null };
  void assessNow();
}

async function assessNow() {
  const p = promotion.value;
  if (!p) return;
  p.assessment = null;
  try { p.assessment = await props.assess(p.version.StrategyClass, p.version.Version, p.requested); }
  catch (e: any) { p.assessment = { Eligible: false, Summary: e?.message ?? 'Could not assess', Requirements: [] }; }
}

async function doPromote() {
  const p = promotion.value;
  if (!p) return;
  busy.value = true;
  try {
    const outcome = await props.promote(p.version.StrategyClass, p.version.Version, p.requested);
    if (!outcome?.Promoted) { p.assessment = outcome; emit('notify', `Promotion refused: ${outcome?.Summary ?? ''}`, 'warn'); return; }
    promotion.value = null;
    emit('notify', 'Promoted.', 'ok');
    emit('changed');
  } catch (e: any) {
    emit('notify', `Promotion failed: ${e?.message ?? ''}`, 'crit');
  } finally { busy.value = false; }
}
</script>
