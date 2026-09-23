<!-- A compact chart card: title, one-line context, optional help, and the chart. -->
<template>
  <section class="tel-card" :class="{ wide, tall }" :aria-label="title">
    <header>
      <h3>{{ title }}<abbr v-if="help" :title="help" aria-label="definition">ⓘ</abbr></h3>
      <span v-if="sub" class="sub">{{ sub }}</span>
      <span class="grow"></span>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{ title: string; sub?: string; help?: string; wide?: boolean; tall?: boolean }>();
</script>

<style scoped>
.tel-card {
  background: var(--tel-surface); border: 1px solid var(--tel-line); border-radius: 8px;
  padding: 8px 10px 8px; min-width: 0; display: flex; flex-direction: column; gap: 4px;
}
.tel-card.wide { grid-column: span 2; }
@media (max-width: 760px) { .tel-card.wide { grid-column: span 1; } }
header { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
h3 { font-size: 12px; font-weight: 600; color: var(--tel-text); white-space: nowrap; }
h3 abbr { margin-left: 4px; color: var(--tel-muted); text-decoration: none; cursor: help; font-weight: 400; }
.sub { font-size: 11px; color: var(--tel-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.grow { flex: 1; }
</style>
