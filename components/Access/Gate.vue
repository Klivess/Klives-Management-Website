<template>
    <slot v-if="allowed" :allowed="true" />
    <!-- disable: keep the control in place, visibly inert, and say why on hover. -->
    <span v-else-if="mode === 'disable'" class="km-gated-wrap" :title="explanation">
        <span class="km-gated denied" inert><slot :allowed="false" /></span>
    </span>
    <slot v-else-if="mode === 'lock'" name="denied">
        <AccessLocked :perm="perm" :any="any" :title="lockTitle" :compact="compact" />
    </slot>
    <slot v-else name="denied" />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';

/**
 * Shows its content only to profiles holding `perm`.
 *   mode="hide"    (default) nothing at all — for actions that would only confuse
 *   mode="lock"    an explained locked block — for sections of a page
 *   mode="disable" the control stays, greyed out, with the missing permission on hover
 * `perm` takes a key, a service prefix ('omnitrader.') or a list (all of them; `any` for one).
 * The default slot gets `{ allowed }`.
 */
const props = withDefaults(defineProps<{
    perm: string | string[];
    any?: boolean;
    mode?: 'hide' | 'lock' | 'disable';
    lockTitle?: string;
    compact?: boolean;
}>(), { any: false, mode: 'hide', compact: false });

const { can, readOnly } = useAccess();
const catalog = usePermissionCatalog();

const keys = computed(() => (Array.isArray(props.perm) ? props.perm : [props.perm]));
const allowed = computed(() => can(keys.value, props.any ? 'any' : 'all'));

const explanation = computed(() => {
    if (readOnly.value) return 'Your profile is read-only right now.';
    const titles = keys.value.map(k => `“${catalog.describe(k).title}”`);
    return `Needs ${titles.join(props.any ? ' or ' : ' and ')}`;
});

onMounted(() => { if (!allowed.value && props.mode !== 'hide') void catalog.load(); });
</script>
