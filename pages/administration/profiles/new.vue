<template>
  <div class="pfx" data-testid="pfx-new">
    <header class="pfx-bar">
      <NuxtLink to="/administration/profiles" class="pfx-bar__crumb"><PeopleIcon name="arrow-left" />Profiles</NuxtLink>
      <div class="pfx-bar__id">
        <span class="pfx-bar__mark"><PeopleIcon name="user-plus" /></span>
        <h1 class="pfx-bar__title">New profile</h1>
        <span class="pfx-bar__sub">who it's for, how they sign in, exactly what they may do</span>
      </div>
    </header>

    <div class="pfx-main" style="max-width: 1180px">
      <!-- ── created ── -->
      <section v-if="created" class="pfx-card" style="max-width: 560px; margin: 24px auto; width: 100%">
        <div class="pfx-card__body" style="padding-top: 22px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start">
          <span class="pfx-dialog__glyph" data-tone="ok"><PeopleIcon name="check" /></span>
          <h2 class="pfx-hero__name">{{ created.profile.name }} is ready</h2>
          <p class="pfx-dim">
            {{ created.profile.rank }} · {{ created.profile.grantCount }} permission{{ created.profile.grantCount === 1 ? '' : 's' }}.
            <template v-if="created.password">Give them this password now — it won't be shown again.</template>
            <template v-else>They sign in with the password you chose.</template>
          </p>
          <div v-if="created.password" class="pfx-secret" style="width: 100%">
            <code>{{ created.password }}</code>
            <button type="button" class="pfx-btn pfx-btn--sm" @click="copy(created.password!)"><PeopleIcon :name="copied ? 'check' : 'copy'" />{{ copied ? 'Copied' : 'Copy' }}</button>
          </div>
          <div class="pfx-toolbar">
            <NuxtLink class="pfx-btn pfx-btn--primary" :to="`/administration/profiles/${created.profile.userId}`">Open {{ created.profile.name }}</NuxtLink>
            <button type="button" class="pfx-btn pfx-btn--ghost" @click="startOver">Create another</button>
          </div>
        </div>
      </section>

      <template v-else>
        <nav class="pfx-steps" aria-label="Steps">
          <button v-for="(st, i) in STEPS" :key="st.key" type="button" class="pfx-step" :aria-current="step === i ? 'step' : undefined" :data-done="i < step || undefined" :disabled="i > furthest" @click="step = i">
            <span class="pfx-step__n">{{ i < step ? '✓' : i + 1 }}</span>{{ st.label }}
          </button>
        </nav>

        <!-- 1 · identity -->
        <section v-if="step === 0" class="pfx-card" aria-label="Who is it for?">
          <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="user" />Who is it for?</h2></header>
          <div class="pfx-card__body pfx-form">
            <div>
              <label class="pfx-label" for="pn-name">Name</label>
              <input id="pn-name" v-model.trim="form.name" class="pfx-input" style="width: 100%; max-width: 360px" maxlength="48" autocomplete="off" placeholder="e.g. Sam" autofocus />
              <p v-if="nameError" class="pfx-error">{{ nameError }}</p>
            </div>
            <div>
              <div class="pfx-label">Rank</div>
              <p class="pfx-help" style="margin: 0 0 8px">Rank only says who is above whom — people can manage profiles ranked below them. It grants nothing by itself.</p>
              <div class="pfx-choices" role="radiogroup" aria-label="Rank">
                <button v-for="r in rankOptions" :key="r.name" type="button" class="pfx-choice pn-rank" role="radio" :aria-checked="form.rank === r.name" @click="form.rank = r.name">
                  <strong><span class="pfx-rank" :data-rank="r.value">{{ r.name }}</span></strong>
                  <span>{{ r.blurb }}</span>
                </button>
              </div>
              <p v-if="!rankOptions.length" class="pfx-error">You can't create profiles: there's no rank below yours.</p>
            </div>
            <div>
              <label class="pfx-label" for="pn-discord">Discord user ID <span class="pfx-dim" style="font-weight: 400">(optional)</span></label>
              <input id="pn-discord" v-model.trim="form.discordId" class="pfx-input pfx-input--mono" style="width: 100%; max-width: 360px" inputmode="numeric" placeholder="For sign-in notifications" />
            </div>
          </div>
        </section>

        <!-- 2 · sign-in -->
        <section v-else-if="step === 1" class="pfx-card" aria-label="How will they sign in?">
          <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="key" />How will they sign in?</h2></header>
          <div class="pfx-card__body pfx-form">
            <div class="pfx-choices" role="radiogroup" aria-label="Password">
              <button type="button" class="pfx-choice" role="radio" :aria-checked="form.passwordMode === 'generate'" @click="form.passwordMode = 'generate'">
                <strong>Generate a password</strong><span>20 random characters, shown to you once after creating. Recommended.</span>
              </button>
              <button type="button" class="pfx-choice" role="radio" :aria-checked="form.passwordMode === 'custom'" @click="form.passwordMode = 'custom'">
                <strong>Choose one</strong><span>At least 8 characters, different from every other profile's.</span>
              </button>
            </div>
            <div v-if="form.passwordMode === 'custom'">
              <label class="pfx-label" for="pn-password">Password</label>
              <input id="pn-password" v-model="form.password" class="pfx-input pfx-input--mono" style="width: 100%; max-width: 360px" type="text" autocomplete="new-password" spellcheck="false" />
              <p class="pfx-help" :style="passwordError ? 'color: #ffb3bf' : ''">{{ passwordError || strength }}</p>
            </div>
            <div class="pfx-form__row">
              <div><strong>Let the password work as an API key</strong><p>Only for scripts or devices that can't sign in. Off is safer: a session can be signed out, a password can't.</p></div>
              <button type="button" class="pfx-switch" role="switch" aria-label="Let the password work as an API key" :aria-checked="form.allowPasswordApiAccess" @click="form.allowPasswordApiAccess = !form.allowPasswordApiAccess"></button>
            </div>
          </div>
        </section>

        <!-- 3 · access -->
        <section v-else-if="step === 2" class="pfx-stack" aria-label="Access">
          <div v-if="!canGrant" class="pfx-banner" role="note">
            <PeopleIcon name="info" />
            <div><strong>No permissions yet</strong>You can create profiles but not give them permissions (“Grant and revoke permissions”). They can sign in, and Klives can add permissions afterwards.</div>
          </div>
          <template v-else>
            <div class="pfx-toolbar">
              <p class="pfx-dim" style="flex: 1">Pick what they may do. Start from another profile with “Copy from”, or set a whole service to a tier.</p>
              <label class="pfx-dim" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px">
                Permissions last
                <select v-model="expiry" class="pfx-select pfx-select--sm" aria-label="How long the permissions last">
                  <option value="never">Permanently</option>
                  <option value="1d">1 day</option>
                  <option value="7d">1 week</option>
                  <option value="30d">30 days</option>
                </select>
              </label>
            </div>
            <div v-if="!catalog.catalog.value" class="pfx-skel" style="height: 420px"></div>
            <PeopleAccessEditor v-else v-model:grants="grants" :baseline="[]" :catalog="catalog.catalog.value" editable
                                :show-diff-bar="false" :default-expiry="expiry" :actor-is-owner="isOwner" :actor-holds="actorHolds" :copy-sources="copySources" />
          </template>
        </section>

        <!-- 4 · review -->
        <section v-else class="pfx-card" aria-label="Check and create">
          <header class="pfx-card__head"><h2 class="pfx-card__title"><PeopleIcon name="check-circle" />Check and create</h2></header>
          <div class="pfx-card__body pfx-form">
            <dl class="pfx-review">
              <dt>Name</dt><dd>{{ form.name }}</dd>
              <dt>Rank</dt><dd><span class="pfx-rank" :data-rank="rankMeta(form.rank).value">{{ form.rank }}</span></dd>
              <dt>Discord</dt><dd>{{ form.discordId || '—' }}</dd>
              <dt>Password</dt><dd>{{ form.passwordMode === 'generate' ? 'Generated, shown once after creating' : 'Chosen by you' }}</dd>
              <dt>API key use</dt><dd>{{ form.allowPasswordApiAccess ? 'Password works as an API key' : 'Off' }}</dd>
              <dt>Permissions</dt><dd>{{ grants.length || 'None' }}{{ expiry !== 'never' && grants.length ? ` · for ${expiryLabel}` : '' }}</dd>
            </dl>
            <div v-for="sv in reviewByService" :key="sv.name" class="pfx-svc" style="grid-template-columns: 140px minmax(0, 1fr)">
              <strong class="pfx-svc__name">{{ sv.name }}</strong>
              <span style="display: flex; flex-wrap: wrap; gap: 4px">
                <span v-for="pm in sv.permissions" :key="pm.key" class="pfx-chip" :data-tone="pm.tierValue >= 5 ? 'crit' : undefined"><span class="pfx-tier" :data-tier="pm.tierValue" style="height: 14px; padding: 0 4px">{{ pm.tier }}</span>{{ pm.title }}</span>
              </span>
            </div>
            <div v-if="criticalCount" class="pfx-banner" data-tone="crit" role="note">
              <PeopleIcon name="alert" />
              <div><strong>{{ criticalCount }} critical permission{{ criticalCount === 1 ? '' : 's' }}</strong>These reach live money, the host, secrets or other profiles. Make sure that's intended.</div>
            </div>
            <p v-if="createError" class="pfx-error" role="alert">{{ createError }}</p>
          </div>
        </section>

        <div class="pfx-toolbar">
          <button v-if="step > 0" type="button" class="pfx-btn pfx-btn--ghost" @click="step--"><PeopleIcon name="arrow-left" />Back</button>
          <span class="pfx-toolbar__grow"></span>
          <button v-if="step < STEPS.length - 1" type="button" class="pfx-btn pfx-btn--primary" :disabled="!stepValid" @click="next">Continue</button>
          <button v-else type="button" class="pfx-btn pfx-btn--primary" :disabled="creating || !allValid" @click="create">{{ creating ? 'Creating…' : `Create ${form.name || 'profile'}` }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';
import { profilesApi, type GrantDraft, type ProfileListPayload, type ProfileRow } from '~/scripts/profilesApi';
import { RANKS, rankMeta } from '~/scripts/profileFormat';

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

<style lang="scss" src="~/assets/scss/profiles-console.scss"></style>
