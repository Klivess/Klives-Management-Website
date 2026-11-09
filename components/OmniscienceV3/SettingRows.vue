<template>
    <div class="omni-settings" :class="{ stacked }">
        <div v-for="s in settings" :key="s.key" class="row" :class="{ changed: s.valueJson != null }" :data-setting="s.key">
            <div class="what">
                <code>{{ s.key }}</code>
                <span v-if="s.scope === 'orphaned'" class="ot-chip warn">orphaned</span>
                <span v-else-if="s.valueJson != null" class="ot-chip info" :title="s.updatedAtMs ? `Changed ${at(s.updatedAtMs)}` : ''">changed</span>
                <p>{{ s.description }}</p>
                <p class="omni-muted">
                    Default <code>{{ s.defaultJson }}</code>
                    <template v-if="s.min != null || s.max != null"> · allowed {{ s.min ?? '−∞' }} to {{ s.max ?? '∞' }}</template>
                    <template v-if="s.updatedAtMs"> · changed <OmniscienceV3Time :ms="s.updatedAtMs" mode="age" /></template>
                </p>
            </div>
            <div class="edit">
                <template v-if="s.scope === 'orphaned'"><code>{{ s.valueJson }}</code></template>
                <label v-else-if="s.type === 'bool'" class="ot-check">
                    <input type="checkbox" :checked="draft(s) === true" :disabled="!editable || busy === s.key"
                           :aria-label="s.key" @change="save(s, ($event.target as HTMLInputElement).checked)" />
                    {{ draft(s) === true ? 'On' : 'Off' }}
                </label>
                <form v-else class="omni-row" novalidate @submit.prevent="submit(s)">
                    <input class="ot-input sm mono" :type="isNumber(s) ? 'number' : 'text'" :step="s.type === 'int' ? 1 : 'any'"
                           :min="s.min ?? undefined" :max="s.max ?? undefined" :disabled="!editable || busy === s.key" :aria-label="s.key"
                           :value="text[s.key] ?? shown(s)" @input="text[s.key] = ($event.target as HTMLInputElement).value" />
                    <button class="ot-btn sm" type="submit" :disabled="!editable || busy === s.key || text[s.key] === undefined || text[s.key] === shown(s)">Save</button>
                </form>
                <button v-if="s.scope !== 'orphaned' && s.valueJson != null && editable" class="ot-btn ghost sm" type="button"
                        :disabled="busy === s.key" @click="reset(s)">Reset to default</button>
                <p v-if="problems[s.key]" class="neg" role="alert">{{ problems[s.key] }}</p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { omniParse, omniPost, toOmniError } from '~/scripts/omniscience/api';
import type { SettingDto } from '~/scripts/omniscience/contracts';
import { useOmniAction, useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * Engine and module settings, edited in place. A value is validated by the server against the
 * setting's declared type and range; a refusal is shown beside the field it concerns.
 */
/** `stacked` puts the editor under the description, for narrow places such as a drawer. */
defineProps<{ settings: SettingDto[]; editable: boolean; stacked?: boolean }>();
const emit = defineEmits<{ saved: [setting: SettingDto] }>();

const { at } = useOmniTime();
const { busy, run } = useOmniAction();
const text = reactive<Record<string, string | undefined>>({});
const problems = reactive<Record<string, string | undefined>>({});

const isNumber = (s: SettingDto) => s.type === 'int' || s.type === 'number';
const draft = (s: SettingDto) => omniParse(s.valueJson ?? s.defaultJson);

/** The current value as the text a person would type: strings unquoted, everything else as JSON. */
function shown(s: SettingDto): string {
    const value = draft(s);
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
}

function parse(s: SettingDto, raw: string): { ok: true; value: unknown } | { ok: false; problem: string } {
    const trimmed = raw.trim();
    if (isNumber(s)) {
        const n = Number(trimmed);
        if (trimmed === '' || !Number.isFinite(n)) return { ok: false, problem: 'Enter a number.' };
        if (s.type === 'int' && !Number.isInteger(n)) return { ok: false, problem: 'Enter a whole number.' };
        return { ok: true, value: n };
    }
    if (s.type === 'json') {
        try { return { ok: true, value: JSON.parse(trimmed) }; } catch { return { ok: false, problem: 'This is not valid JSON.' }; }
    }
    return { ok: true, value: trimmed };
}

async function save(s: SettingDto, value: unknown) {
    problems[s.key] = undefined;
    try {
        const saved = await omniPost<SettingDto>('settings/set', { key: s.key, value });
        text[s.key] = undefined;
        emit('saved', saved);
    } catch (caught) {
        problems[s.key] = toOmniError(caught).message;
    }
}

async function submit(s: SettingDto) {
    const parsed = parse(s, text[s.key] ?? '');
    if (!parsed.ok) { problems[s.key] = parsed.problem; return; }
    await run(s.key, () => save(s, parsed.value));
}

/** Storing the default again is how a setting goes back: the server keeps no "unset" command. */
async function reset(s: SettingDto) {
    await run(s.key, () => save(s, omniParse(s.defaultJson)));
}
</script>

<style scoped>
.omni-settings { display: flex; flex-direction: column; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 340px); gap: 16px; padding: 12px 16px; border-bottom: 1px solid var(--ot-line); }
.row:last-child { border-bottom: 0; }
.row.changed { box-shadow: inset 2px 0 0 var(--ot-info); }
.what code { font-family: var(--ot-mono); font-size: 12.5px; margin-right: 8px; }
.what p { margin: 4px 0 0; font-size: 12.5px; color: var(--ot-text-2); }
.what p.omni-muted { color: var(--ot-muted); font-size: 11.5px; }
.edit { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.edit .ot-input { min-width: 0; flex: 1 1 140px; }
.edit p { margin: 0; font-size: 12px; }
.stacked .row { grid-template-columns: minmax(0, 1fr); padding-left: 12px; padding-right: 0; }
@media (max-width: 760px) { .row { grid-template-columns: minmax(0, 1fr); } }
</style>
