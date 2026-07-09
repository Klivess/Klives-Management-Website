<template>
  <div class="spend-overlay">
    <div class="meter">
      <div class="meter-label">
        <span>Token cost</span>
        <span>${{ fmt(tokenSpent) }} / ${{ fmt(tokenBudget) }}</span>
      </div>
      <div class="bar"><div class="fill tokens" :style="{ width: pct(tokenSpent, tokenBudget) }" :class="{ danger: frac(tokenSpent, tokenBudget) >= 0.8 }"></div></div>
    </div>
    <div class="meter">
      <div class="meter-label">
        <span>Money</span>
        <span>${{ fmt(moneySpent) }} / ${{ fmt(moneyBudget) }}</span>
      </div>
      <div class="bar"><div class="fill money" :style="{ width: pct(moneySpent, moneyBudget) }"></div></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  tokenSpent: number; tokenBudget: number;
  moneySpent: number; moneyBudget: number;
}>();

function frac(a: number, b: number) { return b > 0 ? Math.min(1, a / b) : 0; }
function pct(a: number, b: number) { return (frac(a, b) * 100).toFixed(1) + '%'; }
function fmt(n: number) { return (Number(n) || 0).toFixed(2); }
</script>

<style scoped>
.spend-overlay { display: flex; flex-direction: column; gap: 10px; }
.meter-label { display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-bottom: 4px; }
.bar { height: 8px; background: #26262b; border-radius: 4px; overflow: hidden; }
.fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.fill.tokens { background: #4d9e39; }
.fill.tokens.danger { background: #d98c2b; }
.fill.money { background: #7fb0d9; }
</style>
