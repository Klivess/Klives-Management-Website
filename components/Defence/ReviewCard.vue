<template>
  <section class="odx-card" aria-label="Needs review" data-testid="odx-review" :data-flash="flash || undefined">
    <header class="odx-card__head">
      <h2 class="odx-card__title"><DefenceIcon name="flag" />Needs review</h2>
      <span v-if="review" class="odx-card__meta">{{ total ? `${fmtInt(total)} to look at` : 'nothing waiting' }}</span>
      <div class="odx-card__tools">
        <button v-if="full === false && total" class="odx-btn odx-btn--xs odx-btn--ghost" @click="emit('more')">All<DefenceIcon name="chevron-right" /></button>
      </div>
    </header>

    <div class="odx-subtabs" role="tablist" aria-label="Review lists">
      <button class="odx-subtab" role="tab" :aria-selected="view === 'hostile'" data-testid="review-tab-hostile" @click="view = 'hostile'">
        Still answered <b :data-tone="hostileCount ? 'warn' : undefined">{{ fmtInt(hostileCount) }}</b>
      </button>
      <button class="odx-subtab" role="tab" :aria-selected="view === 'benign'" data-testid="review-tab-benign" @click="view = 'benign'">
        People turned away <b :data-tone="benignCount ? 'warn' : undefined">{{ fmtInt(benignCount) }}</b>
      </button>
    </div>

    <div class="odx-card__body odx-card__body--flush">
      <p v-if="full" class="odx-review-about">
        <template v-if="view === 'hostile'">Classified as a scanner, credential attacker or headless automation with at least 80% confidence, seen this week, and still getting real answers. Block the ones you agree with.</template>
        <template v-else>The classifier calls these people or verified crawlers, but they are on Watch, trapped or blocked. Release the ones it has right.</template>
      </p>
      <ul v-if="items.length" class="odx-list">
        <li v-for="item in items" :key="item.ip" class="odx-row" :data-testid="`review-${item.ip}`">
          <button class="odx-row__main" :title="item.reason || ''" @click="emit('open', item.ip)">
            <span class="odx-row__title">
              <DefenceClassPill :id="item.classification" :classes="classes" :confidence="item.confidence" dot-only />
              <span class="odx-ip">{{ item.ip }}</span>
              <DefenceStatusChip v-if="item.status && item.status !== 'Normal'" :status="item.status" />
            </span>
            <span class="odx-row__sub">
              {{ classLabel(item.classification) }} · {{ fmtInt(item.requests) }} req · score {{ Math.round(item.score) }}{{ item.country ? ` · ${item.country}` : '' }}{{ item.network ? ` · ${item.network}` : '' }}
            </span>
          </button>
          <div class="odx-row__acts">
            <template v-if="view === 'hostile'">
              <button v-if="canBlock" class="odx-btn odx-btn--xs odx-btn--danger" :disabled="!!pending[item.ip]" :data-testid="`review-block-${item.ip}`" @click="emit('block', item.ip)">
                <DefenceIcon name="block" />{{ pending[item.ip] === 'Block' ? 'Blocking' : 'Block' }}
              </button>
            </template>
            <template v-else>
              <button v-if="canBlock" class="odx-btn odx-btn--xs odx-btn--ok" :disabled="!!pending[item.ip]" :data-testid="`review-release-${item.ip}`" @click="emit('release', item.ip)">
                <DefenceIcon name="release" />{{ pending[item.ip] === 'Release' ? 'Releasing' : 'Release' }}
              </button>
            </template>
          </div>
        </li>
      </ul>
      <div v-else class="odx-empty">
        <DefenceIcon name="check-circle" />
        <span>{{ !review ? 'Reading the review lists…' : view === 'hostile' ? 'No attacker is being answered.' : 'Nobody the classifier trusts is being turned away.' }}</span>
      </div>
      <p v-if="shownCount < listCount" class="odx-review-about" style="padding-top: 8px">
        <template v-if="full">The server sends the {{ shownCount }} most urgent of {{ fmtInt(listCount) }}.</template>
        <template v-else>Showing {{ shownCount }} of {{ fmtInt(listCount) }}.</template>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DEFAULT_CLASSES, fmtInt, type ClassInfo, type ReviewItem } from '~/scripts/omniDefence';

/**
 * Where the classifier and the gate disagree: attackers still getting answers, and people being
 * turned away. Each row can be settled in one click.
 */
const props = withDefaults(defineProps<{
  review: { hostileAnsweredCount: number; hostileAnswered: ReviewItem[]; benignPenalisedCount: number; benignPenalised: ReviewItem[] } | null;
  classes: readonly ClassInfo[];
  pending: Record<string, string>;
  canBlock: boolean;
  limit?: number;
  full?: boolean;
  flash?: boolean;
}>(), { limit: 6, full: false, flash: false });
const emit = defineEmits<{ open: [ip: string]; block: [ip: string]; release: [ip: string]; more: [] }>();

const view = ref<'hostile' | 'benign'>('hostile');
const hostileCount = computed(() => props.review?.hostileAnsweredCount ?? 0);
const benignCount = computed(() => props.review?.benignPenalisedCount ?? 0);
const total = computed(() => hostileCount.value + benignCount.value);

// Open on whichever list has something in it.
watch(() => [hostileCount.value, benignCount.value], ([hostile, benign]) => {
  if (view.value === 'hostile' && !hostile && benign) view.value = 'benign';
}, { immediate: true });

const list = computed(() => (view.value === 'hostile' ? props.review?.hostileAnswered : props.review?.benignPenalised) ?? []);
const items = computed(() => list.value.slice(0, props.full ? 50 : props.limit));
const listCount = computed(() => (view.value === 'hostile' ? hostileCount.value : benignCount.value));
const shownCount = computed(() => items.value.length);

function classLabel(id: string | null): string {
  const list = props.classes.length ? props.classes : DEFAULT_CLASSES;
  return list.find(c => c.id === (id || 'Unknown'))?.label ?? id ?? 'Unknown';
}
</script>
