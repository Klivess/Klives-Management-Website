<template>
  <section class="performance-panel">
    <div class="performance-heading">
      <div>
        <h3>Response timing</h3>
        <p>Instrumented runs since this telemetry was added. Stage totals can overlap when work runs in parallel.</p>
      </div>
      <span class="performance-count">{{ performance?.measuredRuns || 0 }} runs</span>
    </div>
    <p v-if="!performance?.measuredRuns" class="performance-empty">Timing breakdowns will appear after the next KliveAgent run.</p>
    <template v-else>
      <div class="performance-kpis">
        <div><strong>{{ duration(performance.avgDurationMs) }}</strong><span>Average run</span></div>
        <div><strong>{{ duration(performance.recentP50DurationMs) }}</strong><span>Recent median</span></div>
        <div><strong>{{ duration(performance.recentP95DurationMs) }}</strong><span>Recent p95</span></div>
        <div><strong>{{ duration(performance.maxDurationMs) }}</strong><span>Longest run</span></div>
        <div><strong>{{ performance.completedRuns }}</strong><span>Completed</span></div>
        <div><strong>{{ performance.stoppedRuns + performance.failedRuns }}</strong><span>Stopped / failed</span></div>
      </div>
      <div class="performance-grid">
        <div>
          <h4>Where time goes</h4>
          <div class="performance-table-wrap">
            <table class="performance-table">
              <thead><tr><th>Stage</th><th>Calls</th><th>Avg / call</th><th>Total</th><th>Longest</th></tr></thead>
              <tbody>
                <tr v-for="stage in performance.stages" :key="stage.name">
                  <td>{{ stageLabel(stage.name) }}</td><td>{{ stage.calls }}</td><td>{{ duration(stage.avgMs) }}</td>
                  <td>{{ duration(stage.totalMs) }}</td><td>{{ duration(stage.maxMs) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h4>Recent runs</h4>
          <div class="performance-table-wrap">
            <table class="performance-table">
              <thead><tr><th>Started</th><th>Result</th><th>Time</th><th>Steps</th><th>Model</th><th>Tools</th></tr></thead>
              <tbody>
                <tr v-for="(run, i) in performance.recent.slice(0, 12)" :key="`${run.startedAtUtc}-${i}`">
                  <td>{{ new Date(run.startedAtUtc).toLocaleString() }}</td><td>{{ run.outcome }}</td>
                  <td>{{ duration(run.durationMs) }}</td><td>{{ run.iterations }}</td>
                  <td>{{ duration(run.stages?.model?.totalMs) }} / {{ run.stages?.model?.count || 0 }}</td>
                  <td>{{ duration(toolMs(run)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p class="performance-note">Preparation includes prompt building and attachments. First token is part of model time. Tool time may overlap model time when read-only calls start early.</p>
    </template>
  </section>
</template>

<script setup>
defineProps({ performance: { type: Object, default: null } });

const labels = {
  preparation: 'Preparation', systemPrompt: 'System prompt', conversationPrompt: 'Conversation history',
  toolDefinitions: 'Tool definitions', attachments: 'Attachments', model: 'Model requests',
  firstToken: 'First token', modelError: 'Model errors', modelRetry: 'Model retries', retryBackoff: 'Retry wait',
  script: 'C# scripts', nativeTool: 'Native tools', computerTool: 'Computer control', waitTool: 'Explicit waits',
};
const stageLabel = (name) => labels[name] || name;
function duration(ms) {
  const n = Number(ms) || 0;
  if (n >= 60000) return `${(n / 60000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}
function toolMs(run) {
  return ['script', 'nativeTool', 'computerTool', 'waitTool']
    .reduce((total, key) => total + (Number(run.stages?.[key]?.totalMs) || 0), 0);
}
</script>

<style scoped>
.performance-panel { margin: 22px 0; padding: 20px; border: 1px solid #343a34; border-radius: 12px; background: #181c18; color: #eee; }
.performance-heading { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
h3, h4 { margin: 0 0 8px; }
.performance-heading p, .performance-note, .performance-empty { color: #aeb7ae; margin: 0 0 16px; font-size: 13px; }
.performance-count { white-space: nowrap; color: #9dca8e; }
.performance-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
.performance-kpis div { padding: 12px; background: #222922; border-radius: 8px; display: flex; flex-direction: column; gap: 4px; }
.performance-kpis strong { font-size: 20px; }.performance-kpis span { color: #aeb7ae; font-size: 12px; }
.performance-grid { display: grid; grid-template-columns: 1fr 1.25fr; gap: 24px; }
.performance-table-wrap { overflow-x: auto; }
.performance-table { width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
.performance-table th, .performance-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #333b33; }
.performance-table th { color: #aeb7ae; font-weight: 500; }
.performance-note { margin: 14px 0 0; }
@media (max-width: 1000px) { .performance-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .performance-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .performance-heading { flex-direction: column; } }
</style>
