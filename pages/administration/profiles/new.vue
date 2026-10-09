<template>
    <ProfilesShell :hide-error="true">
        <template #crumb>
            <NuxtLink to="/administration/profiles" class="pn-back"><AccessIcon name="back" :size="14" /> All profiles</NuxtLink>
        </template>

        <!-- ── created ── -->
        <section v-if="created" class="pn-done">
            <div class="pn-done-card">
                <div class="pn-done-badge"><AccessIcon name="check" :size="28" /></div>
                <h1>{{ created.profile.name }} is ready</h1>
                <p class="pn-lede">
                    {{ created.profile.rank }} · {{ created.profile.grantCount }} permission{{ created.profile.grantCount === 1 ? '' : 's' }}.
                    <template v-if="created.password">Give them this password now — it won't be shown again.</template>
                    <template v-else>They sign in with the password you chose.</template>
                </p>
                <div v-if="created.password" class="pn-secret">
                    <code>{{ created.password }}</code>
                    <button type="button" class="ot-btn sm" @click="copy(created.password!)"><AccessIcon :name="copied ? 'check' : 'copy'" :size="14" /> {{ copied ? 'Copied' : 'Copy' }}</button>
                </div>
                <div class="pn-actions">
                    <NuxtLink class="ot-btn primary" :to="`/administration/profiles/${created.profile.userId}`">Open {{ created.profile.name }}</NuxtLink>
                    <button type="button" class="ot-btn ghost" @click="startOver">Create another</button>
                </div>
            </div>
        </section>

        <template v-else>
            <div class="ot-pagehead">
                <div>
                    <h1>New profile</h1>
                    <p class="subtitle">Who it's for, how they sign in, and exactly what they may do. Nothing is granted unless you pick it.</p>
                </div>
            </div>

            <ol class="pn-steps" aria-label="Steps">
                <li v-for="(s, i) in STEPS" :key="s.key" :class="{ active: step === i, done: i < step }">
                    <button type="button" :disabled="i > furthest" @click="step = i">
                        <span class="pn-step-n">{{ i < step ? '✓' : i + 1 }}</span>{{ s.label }}
                    </button>
                </li>
            </ol>

            <!-- 1 · identity -->
            <OmniTraderCard v-if="step === 0" title="Who is it for?">
                <div class="pn-form">
                    <div class="ot-field" :class="{ invalid: nameError }">
                        <label for="pn-name">Name</label>
                        <input id="pn-name" v-model.trim="form.name" class="ot-input" maxlength="48" autocomplete="off" placeholder="e.g. Sam" autofocus />
                        <span v-if="nameError" class="help">{{ nameError }}</span>
                    </div>
                    <fieldset class="pn-ranks">
                        <legend>Rank</legend>
                        <p class="pn-help">Rank only says who is above whom — people can manage profiles ranked below them. It grants nothing by itself.</p>
                        <div class="pn-rank-grid">
                            <label v-for="r in rankOptions" :key="r.name" class="pn-rank" :class="{ selected: form.rank === r.name }">
                                <input v-model="form.rank" type="radio" name="rank" :value="r.name" />
                                <span class="km-rank" :class="`r${r.value}`">{{ r.name }}</span>
                                <span class="pn-rank-blurb">{{ r.blurb }}</span>
                            </label>
                        </div>
                        <p v-if="!rankOptions.length" class="pn-error">You can't create profiles: there's no rank below yours.</p>
                    </fieldset>
                    <div class="ot-field">
                        <label for="pn-discord">Discord user ID <span class="pn-optional">(optional)</span></label>
                        <input id="pn-discord" v-model.trim="form.discordId" class="ot-input mono" inputmode="numeric" placeholder="For sign-in notifications" />
                    </div>
                </div>
            </OmniTraderCard>

            <!-- 2 · sign-in -->
            <OmniTraderCard v-else-if="step === 1" title="How will they sign in?">
                <div class="pn-form">
                    <div class="pn-choice-grid">
                        <label class="pn-choice" :class="{ selected: form.passwordMode === 'generate' }">
                            <input v-model="form.passwordMode" type="radio" value="generate" />
                            <strong>Generate a password</strong>
                            <span>20 random characters, shown to you once after creating. Recommended.</span>
                        </label>
                        <label class="pn-choice" :class="{ selected: form.passwordMode === 'custom' }">
                            <input v-model="form.passwordMode" type="radio" value="custom" />
                            <strong>Choose one</strong>
                            <span>At least 8 characters, different from every other profile's.</span>
                        </label>
                    </div>
                    <div v-if="form.passwordMode === 'custom'" class="ot-field" :class="{ invalid: passwordError }">
                        <label for="pn-password">Password</label>
                        <input id="pn-password" v-model="form.password" class="ot-input mono" type="text" autocomplete="new-password" spellcheck="false" />
                        <span class="help">{{ passwordError || strength }}</span>
                    </div>
                    <div class="pn-toggle">
                        <div>
                            <strong>Let the password work as an API key</strong>
                            <p>Only for scripts or devices that can't sign in. Off is safer; sessions are revocable, a password isn't.</p>
                        </div>
                        <button type="button" class="km-switch" role="switch" :aria-checked="form.allowPasswordApiAccess" @click="form.allowPasswordApiAccess = !form.allowPasswordApiAccess"></button>
                    </div>
                </div>
            </OmniTraderCard>

            <!-- 3 · access -->
            <section v-else-if="step === 2" class="ot-stack">
                <div v-if="!canGrant" class="ot-banner info" role="note">
                    <span class="glyph" aria-hidden="true">ℹ</span>
                    <div><strong>No permissions yet</strong> You can create profiles but not give them permissions ("Grant and revoke permissions"). They can sign in, and Klives can add permissions afterwards.</div>
                </div>
                <template v-else>
                    <div class="pn-access-head">
                        <p class="pn-help">Pick what they may do. Start from another profile with “Copy from”, or set a whole service to a tier.</p>
                        <label class="pn-expiry">
                            Permissions last
                            <select v-model="expiry" class="ot-select auto">
                                <option value="never">Permanently</option>
                                <option value="1d">1 day</option>
                                <option value="7d">1 week</option>
                                <option value="30d">30 days</option>
                            </select>
                        </label>
                    </div>
                    <div v-if="!catalog.catalog.value" class="ot-skel" style="height: 420px"></div>
                    <ProfilesPermissionEditor v-else v-model:grants="grants" :baseline="[]" :catalog="catalog.catalog.value" editable
                                              :show-diff-bar="false" :default-expiry="expiry" :actor-is-owner="isOwner" :actor-holds="actorHolds"
                                              :copy-sources="copySources" />
                </template>
            </section>

            <!-- 4 · review -->
            <OmniTraderCard v-else title="Check and create">
                <dl class="ot-kv pn-review">
                    <dt>Name</dt><dd>{{ form.name }}</dd>
                    <dt>Rank</dt><dd><span class="km-rank" :class="`r${rankMeta(form.rank).value}`">{{ form.rank }}</span></dd>
                    <dt>Discord</dt><dd>{{ form.discordId || '—' }}</dd>
                    <dt>Password</dt><dd>{{ form.passwordMode === 'generate' ? 'Generated, shown once after creating' : 'Chosen by you' }}</dd>
                    <dt>API key use</dt><dd>{{ form.allowPasswordApiAccess ? 'Password works as an API key' : 'Off' }}</dd>
                    <dt>Permissions</dt><dd>{{ grants.length || 'None' }}{{ expiry !== 'never' && grants.length ? ` · for ${expiryLabel}` : '' }}</dd>
                </dl>
                <div v-if="reviewByService.length" class="pn-review-perms">
                    <div v-for="s in reviewByService" :key="s.name" class="pn-review-svc">
                        <strong>{{ s.name }}</strong>
                        <span v-for="p in s.permissions" :key="p.key" class="pn-review-perm" :class="{ critical: p.tierValue >= 5 }">
                            <span class="km-tier" :class="tierMeta(p.tier).tone">{{ tierMeta(p.tier).short }}</span> {{ p.title }}
                        </span>
                    </div>
                </div>
                <div v-if="criticalCount" class="ot-banner pn-critical" role="note">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div><strong>{{ criticalCount }} critical permission{{ criticalCount === 1 ? '' : 's' }}</strong> These reach live money, the host, secrets or other profiles. Make sure that's intended.</div>
                </div>
                <p v-if="createError" class="pn-error" role="alert">{{ createError }}</p>
            </OmniTraderCard>

            <div class="pn-nav">
                <button v-if="step > 0" type="button" class="ot-btn ghost" @click="step--"><AccessIcon name="back" :size="14" /> Back</button>
                <span class="grow"></span>
                <button v-if="step < STEPS.length - 1" type="button" class="ot-btn primary" :disabled="!stepValid" @click="next">Continue</button>
                <button v-else type="button" class="ot-btn primary" :disabled="creating || !allValid" @click="create">{{ creating ? 'Creating…' : `Create ${form.name || 'profile'}` }}</button>
            </div>
        </template>
    </ProfilesShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';
import { profilesApi, type GrantDraft, type ProfileListPayload, type ProfileRow } from '~/scripts/profilesApi';
import { RANKS, rankMeta, tierMeta } from '~/scripts/profileFormat';

definePageMeta({ layout: 'navbar' });

const STEPS = [
    { key: 'identity', label: 'Identity' },
    { key: 'signin', label: 'Sign-in' },
    { key: 'access', label: 'Access' },
    { key: 'review', label: 'Review' },
];

const { can, isOwner, grantedPermissions, profile: me } = useAccess();
const catalog = usePermissionCatalog();
const canGrant = computed(() => can('profiles.permissions.grant'));
const actorHolds = (key: string) => grantedPermissions.value.has(key);

const step = ref(0);
const furthest = ref(0);
const list = ref<ProfileListPayload | null>(null);
const grants = ref<GrantDraft[]>([]);
const expiry = ref<'never' | '1d' | '7d' | '30d'>('never');
const creating = ref(false);
const createError = ref<string | null>(null);
const created = ref<{ profile: ProfileRow; password: string | null } | null>(null);
const copied = ref(false);

const form = reactive({
    name: '',
    rank: 'Guest',
    discordId: '',
    passwordMode: 'generate' as 'generate' | 'custom',
    password: '',
    allowPasswordApiAccess: false,
});

const assignable = computed<string[]>(() => list.value?.assignableRanks ?? (me.value?.assignableRanks as string[] | undefined) ?? []);
const rankOptions = computed(() => RANKS.filter(r => assignable.value.includes(r.name)));
const copySources = computed(() => (list.value?.profiles ?? []).map(p => ({ userId: p.userId, name: `${p.name} (${p.isOwner ? 'Owner' : p.rank})` })));

const nameError = computed(() => {
    const n = form.name.trim();
    if (!n) return '';
    if (list.value?.profiles.some(p => p.name.toLowerCase() === n.toLowerCase())) return `A profile called “${n}” already exists.`;
    return '';
});
const passwordError = computed(() => {
    if (form.passwordMode !== 'custom' || !form.password) return '';
    if (form.password.length < 8) return 'At least 8 characters.';
    if (form.password.startsWith('kms_')) return "Passwords can't start with “kms_”.";
    return '';
});
const strength = computed(() => {
    const p = form.password;
    if (!p) return 'At least 8 characters.';
    const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
    return p.length >= 16 || (p.length >= 12 && kinds >= 3) ? 'Strong.' : p.length >= 10 && kinds >= 2 ? 'Fair — longer is better.' : 'Weak — use more characters.';
});

const identityValid = computed(() => !!form.name.trim() && !nameError.value && rankOptions.value.some(r => r.name === form.rank));
const signInValid = computed(() => form.passwordMode === 'generate' || (form.password.length >= 8 && !passwordError.value));
const stepValid = computed(() => [identityValid.value, signInValid.value, true, true][step.value]);
const allValid = computed(() => identityValid.value && signInValid.value);

function next() {
    if (!stepValid.value) return;
    step.value++;
    furthest.value = Math.max(furthest.value, step.value);
    if (step.value === 2 && canGrant.value) void catalog.load();
}

const expiryLabel = computed(() => ({ never: 'ever', '1d': '1 day', '7d': '1 week', '30d': '30 days' }[expiry.value]));
const reviewByService = computed(() => {
    const groups = new Map<string, { name: string; permissions: { key: string; title: string; tier: string; tierValue: number }[] }>();
    for (const g of grants.value) {
        const d = catalog.byKey.value.get(g.key);
        if (!d) continue;
        const entry = groups.get(d.service) ?? { name: d.service, permissions: [] };
        entry.permissions.push({ key: d.key, title: d.title, tier: d.tier, tierValue: d.tierValue });
        groups.set(d.service, entry);
    }
    return [...groups.values()].map(g => ({ ...g, permissions: g.permissions.sort((a, b) => a.tierValue - b.tierValue) }));
});
const criticalCount = computed(() => grants.value.filter(g => (catalog.byKey.value.get(g.key)?.tierValue ?? 0) >= 5).length);

async function create() {
    if (!allValid.value) return;
    creating.value = true;
    createError.value = null;
    try {
        created.value = await profilesApi.create({
            name: form.name.trim(),
            rank: form.rank,
            discordId: form.discordId || null,
            generatePassword: form.passwordMode === 'generate',
            password: form.passwordMode === 'custom' ? form.password : null,
            allowPasswordApiAccess: form.allowPasswordApiAccess,
            grants: canGrant.value ? grants.value : undefined,
        });
        form.password = '';
    } catch (e) {
        createError.value = e instanceof Error ? e.message : 'Could not create the profile.';
    } finally {
        creating.value = false;
    }
}

function startOver() {
    created.value = null;
    copied.value = false;
    Object.assign(form, { name: '', rank: rankOptions.value[rankOptions.value.length - 1]?.name ?? 'Guest', discordId: '', passwordMode: 'generate', password: '', allowPasswordApiAccess: false });
    grants.value = [];
    step.value = 0;
    furthest.value = 0;
    void profilesApi.list().then(v => { list.value = v; }).catch(() => {});
}

async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false; }, 2_000); } catch { /* select by hand */ }
}

onMounted(async () => {
    try { list.value = await profilesApi.list(); } catch { /* ranks fall back to /me */ }
    // Default to the lowest rank: the least someone can be.
    if (!rankOptions.value.some(r => r.name === form.rank)) form.rank = rankOptions.value[rankOptions.value.length - 1]?.name ?? 'Guest';
});
</script>

<style scoped>
.pn-back { display: inline-flex; align-items: center; gap: 6px; }
.pn-steps { list-style: none; margin: 0 0 var(--ot-space-4); padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
.pn-steps button {
    display: inline-flex !important;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 14px 0 6px !important;
    border-radius: 999px;
    border: 1px solid var(--ot-line) !important;
    background: var(--ot-surface) !important;
    color: var(--ot-muted);
    font-size: 13px;
    cursor: pointer;
}
.pn-steps button:disabled { cursor: not-allowed; opacity: 0.6; }
.pn-steps li.active button { border-color: var(--ot-accent) !important; color: var(--ot-text); background: var(--ot-accent-soft) !important; }
.pn-steps li.done button { color: var(--ot-text-2); }
.pn-step-n {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.06);
}
.pn-steps li.active .pn-step-n { background: var(--ot-accent); color: var(--ot-on-accent); }
.pn-steps li.done .pn-step-n { background: var(--ot-positive-soft); color: var(--ot-positive); }

.pn-form { display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
.pn-form .ot-field label, .pn-ranks legend { font-size: 12px; font-weight: 600; color: var(--ot-text-2); }
.pn-optional { font-weight: 400; color: var(--ot-muted); }
.pn-help { font-size: 12.5px; color: var(--ot-muted); }
.pn-ranks { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.pn-rank-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
.pn-rank, .pn-choice {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: rgba(255, 255, 255, 0.02);
    cursor: pointer;
    position: relative;
}
.pn-rank input, .pn-choice input { position: absolute; opacity: 0; pointer-events: none; }
.pn-rank.selected, .pn-choice.selected { border-color: var(--ot-accent); background: var(--ot-accent-soft); }
.pn-rank:focus-within, .pn-choice:focus-within { outline: 2px solid var(--ot-accent); outline-offset: 2px; }
.pn-rank .km-rank { width: fit-content; }
.pn-rank-blurb, .pn-choice span { font-size: 12px; color: var(--ot-text-2); }
.pn-choice strong { color: var(--ot-text); font-size: 13.5px; }
.pn-choice-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.pn-toggle { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0 0; border-top: 1px solid var(--ot-line); }
.pn-toggle strong { color: var(--ot-text); font-size: 13.5px; }
.pn-toggle p { color: var(--ot-muted); font-size: 12px; margin-top: 2px; }

.pn-access-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.pn-expiry { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ot-muted); }

.pn-review { max-width: 640px; }
.pn-review dd { font-family: inherit; }
.pn-review-perms { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }
.pn-review-svc { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pn-review-svc strong { width: 100%; font-size: 12px; color: var(--ot-text-2); text-transform: uppercase; letter-spacing: 1px; }
.pn-review-perm { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 4px; border-radius: 999px; border: 1px solid var(--ot-line); font-size: 12.5px; color: var(--ot-text-2); }
.pn-review-perm.critical { border-color: rgba(255, 123, 123, 0.45); color: #ffd0d0; }
.pn-critical { margin-top: 16px; }
.pn-error { margin-top: 10px; color: var(--ot-negative); font-size: 12.5px; }

.pn-nav { display: flex; align-items: center; gap: 8px; margin-top: var(--ot-space-4); }
.pn-nav .grow { flex: 1 1 auto; }

.pn-done { display: flex; justify-content: center; padding: 40px 0; }
.pn-done-card {
    width: min(560px, 100%);
    padding: 32px 28px;
    border-radius: var(--ot-radius-lg);
    border: 1px solid var(--ot-line-strong);
    background: radial-gradient(120% 80% at 50% -20%, rgba(109, 220, 79, 0.12), transparent 60%), var(--ot-surface);
    text-align: center;
}
.pn-done-badge { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 50%; color: var(--ot-positive); background: var(--ot-positive-soft); margin-bottom: 12px; }
.pn-done h1 { font-size: 22px; font-weight: 650; color: var(--ot-text); }
.pn-lede { margin-top: 8px; color: var(--ot-text-2); }
.pn-secret { margin-top: 18px; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: var(--ot-radius); border: 1px solid var(--ot-line-strong); background: rgba(5, 7, 4, 0.5); text-align: left; }
.pn-secret code { flex: 1 1 auto; font-family: var(--ot-mono); font-size: 16px; color: var(--ot-accent); letter-spacing: 0.5px; overflow-wrap: anywhere; user-select: all; }
.pn-actions { margin-top: 20px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
</style>
