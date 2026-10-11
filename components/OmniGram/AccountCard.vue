<template>
    <article class="ig-accountcard" :class="`state-${account.State}`">
        <header>
            <OmniTumblrAvatar :src="account.ProfilePictureUrl" :name="account.Username" :size="42" round />
            <div class="id">
                <NuxtLink :to="link" class="name">@{{ account.Username }}</NuxtLink>
                <span class="title">{{ account.Name || accountTypeLabel }}</span>
            </div>
            <span class="ot-chip" :class="accountStateTone(account.State)" :title="account.StateReason">{{ stateLabel }}</span>
        </header>

        <template v-if="account.State !== 'connect'">
            <div class="numbers">
                <div>
                    <span class="v">{{ fmtCount(account.Followers) }}</span>
                    <span class="k">followers</span>
                    <span v-if="account.FollowersDelta7d !== null" class="d" :class="account.FollowersDelta7d > 0 ? 'pos' : account.FollowersDelta7d < 0 ? 'neg' : 'muted'">
                        {{ fmtSignedCount(account.FollowersDelta7d) }} in 7 d
                    </span>
                </div>
                <div>
                    <span class="v">{{ account.Published7d }}</span>
                    <span class="k">posts, 7 d</span>
                    <span class="d muted">{{ account.SlotsPerWeek ? `${account.SlotsPerWeek}/week planned` : 'no schedule' }}</span>
                </div>
                <div>
                    <span class="v">{{ account.AvgViews30d != null ? fmtCount(Math.round(account.AvgViews30d)) : '—' }}</span>
                    <span class="k">views / post</span>
                    <span class="d muted">30 d average</span>
                </div>
            </div>
            <OmniTraderSparkline v-if="account.FollowersSpark.length > 1" :values="account.FollowersSpark" :height="26" label="Followers, last 14 days" />

            <div class="next">
                <OmniTumblrThumb size="xs" :kind="account.NextPost ? thumbKind(account.NextPost) : null"
                                 :path="account.NextPost?.HasThumbnail ? postThumbPath(account.NextPost.PostId) : null" />
                <div class="nexttext">
                    <span class="k">Next post</span>
                    <span v-if="account.NextPost">
                        {{ FORMAT_LABEL[account.NextPost.Format] }} · {{ fmtWhen(account.NextPost.ScheduledUtc) }} · {{ fmtRelative(account.NextPost.ScheduledUtc, now) }}
                    </span>
                    <span v-else class="muted">{{ account.Autopilot ? 'planning…' : 'nothing scheduled' }}</span>
                </div>
                <span v-if="account.NewComments" class="ot-badge quiet comments" :title="`${account.NewComments} new comment(s) without a reply in the last 7 days`">💬 {{ account.NewComments }}</span>
            </div>
        </template>
        <p v-else class="connecthint">
            {{ account.Imported
                ? 'Imported from OmniGram v1. Its settings are kept; connect it through Instagram\'s official login to start posting again.'
                : 'Not connected to Instagram yet.' }}
        </p>

        <p v-if="account.State !== 'ok' && account.State !== 'connect'" class="reason" :class="accountStateTone(account.State)">{{ account.StateReason }}</p>

        <footer>
            <template v-if="account.State === 'connect'">
                <button v-if="can('omnigram.settings.manage')" class="ot-btn sm primary" @click="$emit('connect', account.AccountId)">Connect</button>
                <NuxtLink class="ot-btn sm ghost" :to="link">Open</NuxtLink>
            </template>
            <template v-else>
                <label class="ot-check" :title="canManage ? '' : 'Needs “Manage accounts”'">
                    <input type="checkbox" :checked="account.Autopilot" :disabled="!canManage || busy" @change="toggleAutopilot" />
                    Autopilot
                </label>
                <button v-if="account.Connection === 'NeedsReauth' && can('omnigram.settings.manage')" class="ot-btn sm" @click="$emit('connect', account.AccountId)">Reconnect</button>
                <button v-else-if="canAct" class="ot-btn sm ghost" :disabled="busy" @click="togglePause">{{ account.Paused ? 'Resume' : 'Pause' }}</button>
                <NuxtLink class="ot-btn sm" :to="link">Open</NuxtLink>
            </template>
        </footer>
    </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
    FORMAT_LABEL, accountStateTone, confirmAction, fmtCount, fmtRelative, fmtSignedCount, fmtWhen, igPost, notify, postThumbPath, thumbKind, useNow,
    type AccountSummary,
} from '~/composables/useOmniGram';

const props = defineProps<{ account: AccountSummary }>();
const emit = defineEmits<{ changed: []; connect: [accountId: string] }>();
const { can } = useAccess();
const canManage = computed(() => can('omnigram.accounts.manage'));
const canAct = computed(() => can('omnigram.accounts.act'));
const now = useNow();
const busy = ref(false);

const link = computed(() => `/schemery/omnigram/account/${props.account.AccountId}`);
const accountTypeLabel = computed(() => {
    const t = props.account.AccountType;
    return t === 'MEDIA_CREATOR' ? 'Creator account' : t === 'BUSINESS' ? 'Business account' : t ? t.toLowerCase() : 'Instagram account';
});
const stateLabel = computed(() => ({
    ok: props.account.Autopilot ? 'Autopilot' : 'Manual',
    attention: 'Attention',
    error: 'Problem',
    paused: 'Paused',
    idle: 'Idle',
    connect: 'Not connected',
}[props.account.State]));

async function update(body: Record<string, unknown>, done: string) {
    busy.value = true;
    try {
        const result = await igPost<{ updated: boolean; Notes: string[] }>('/omnigram/accounts/update', { accountId: props.account.AccountId, ...body });
        if (!result.ok) notify('Could not update the account', result.error ?? '', 'error');
        else {
            notify(done, result.data?.Notes?.join(' ') || undefined);
            emit('changed');
        }
    } finally {
        busy.value = false;
    }
}

async function toggleAutopilot(event: Event) {
    const target = event.target as HTMLInputElement;
    const turningOn = target.checked;
    target.checked = props.account.Autopilot; // reflect the server's answer, not the click
    if (!turningOn && props.account.Pending > 0
        && !(await confirmAction('Switch autopilot off?', 'Posts autopilot has already planned for this account will be cancelled. Posts you composed by hand stay scheduled.', 'Switch off', true)))
        return;
    await update({ autopilot: turningOn }, turningOn ? 'Autopilot on' : 'Autopilot off');
}

async function togglePause() {
    await update({ paused: !props.account.Paused }, props.account.Paused ? 'Resumed' : 'Paused');
}
</script>

<style scoped>
.ig-accountcard {
    display: flex;
    flex-direction: column;
    gap: var(--ot-space-3);
    padding: var(--ot-card-pad);
    background: var(--ot-surface);
    border: 1px solid var(--ot-line);
    border-radius: var(--ot-radius);
    min-width: 0;
}
.ig-accountcard.state-error { border-color: rgba(255, 123, 123, 0.45); }
.ig-accountcard.state-attention, .ig-accountcard.state-connect { border-color: rgba(240, 180, 41, 0.4); }
header { display: flex; align-items: center; gap: var(--ot-space-3); min-width: 0; }
.id { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.name { font-weight: 650; font-size: 15px; color: var(--ot-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name:hover { color: var(--ot-accent); }
.title { font-size: 12px; color: var(--ot-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.numbers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ot-space-2); }
.numbers > div { display: flex; flex-direction: column; min-width: 0; }
.v { font-size: 20px; line-height: 26px; font-weight: 650; font-family: var(--ot-mono); }
.k { font-size: 11.5px; color: var(--ot-text-2); }
.d { font-size: 11px; }
.next { display: flex; align-items: center; gap: var(--ot-space-2); font-size: 12.5px; min-width: 0; }
.nexttext { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.nexttext .k { font-size: 11px; color: var(--ot-muted); }
.comments { flex: 0 0 auto; }
.connecthint { margin: 0; font-size: 12.5px; line-height: 18px; color: var(--ot-text-2); }
.reason { margin: 0; font-size: 12px; line-height: 16px; overflow-wrap: anywhere; color: var(--ot-text-2); }
.reason.bad { color: var(--ot-negative); }
.reason.warn { color: var(--ot-warning); }
footer { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ot-space-2); margin-top: auto; }
footer .ot-check { margin-right: auto; }
</style>
