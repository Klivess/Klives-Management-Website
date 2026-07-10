// Shared event-type → colour map so the Timeline, conversation, and drill-in drawer all agree.
// Categorical, tuned for the dark theme; each is distinct at a glance and legible on #161519.
export const EVENT_TYPE_COLORS: Record<string, string> = {
  'commander-wake': '#4d9e39',
  'agent-wake': '#6fbf59',
  'wake-completed': '#3a6b2e',
  'wake-failed': '#d95b5b',
  'commander-message': '#7fd97f',
  'commander-thought': '#5a8a52',
  'agent-thought': '#6b9a63',
  'agent-message': '#8fb0d9',
  'klives-message': '#7fb0d9',
  'tool-call': '#5b9bd9',
  'tool-result': '#4a7fb0',
  'stimulus': '#d98c2b',
  'approval-requested': '#d9c47f',
  'approval-resolved': '#b0a35e',
  'agent-spawned': '#a679d9',
  'agent-retired': '#7a5aa0',
  'budget-warning': '#d98c2b',
  'budget-paused': '#d95b5b',
  'money-spent': '#3fae8f',
  'artifact-added': '#59bfb0',
  'digest-rebuilt': '#555',
  'hook-changed': '#8a8a8a',
  'observable-changed': '#d97fb8',
  'account-changed': '#c9a15e',
  'watchdog-escalation': '#d95b5b',
  'council-convened': '#c9a227',
  'council-statement': '#a68f5e',
  'council-verdict': '#e0b23f',
  'grand-plan-submitted': '#7fb0d9',
  'grand-plan-approved': '#4d9e39',
  'grand-plan-revision-requested': '#d9c47f',
  'grand-plan-amended': '#5b9bd9',
  'status': '#888',
};

export function eventColor(type: string): string {
  return EVENT_TYPE_COLORS[type] ?? '#888';
}
