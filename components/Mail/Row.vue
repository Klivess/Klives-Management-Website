<template>
  <div
    class="kml-row"
    role="option"
    :aria-selected="selected"
    :data-unread="!row.isRead || undefined"
    :data-checked="checked || undefined"
    :data-fresh="fresh || undefined"
    :data-pending="pending || undefined"
    :data-testid="`row-${row.id}`"
    @click="onClick"
  >
    <button
      class="kml-row__check"
      role="checkbox"
      :aria-checked="checked"
      :aria-label="checked ? 'Unselect' : 'Select'"
      :title="checked ? 'Unselect (x)' : 'Select (x) · Shift-click for a range'"
      :data-testid="`check-${row.id}`"
      @click.stop="$emit('check', $event.shiftKey)"
    >
      <span class="kml-row__dot" aria-hidden="true"></span>
      <span class="kml-row__box" aria-hidden="true"><MailIcon v-if="checked" name="check" /></span>
    </button>

    <span class="kml-avatar" :style="{ '--hue': String(hue) }" aria-hidden="true">{{ initial }}</span>

    <div class="kml-row__main">
      <div class="kml-row__top">
        <span class="kml-row__from">{{ name }}</span>
        <span v-if="showMailbox" class="kml-row__to" :title="`To ${row.to}`">{{ localPart(row.to) }}</span>
        <span class="kml-row__time kml-num" :title="fullTime(row.receivedAt)">{{ listTime(row.receivedAt, now) }}</span>
      </div>
      <div class="kml-row__bottom">
        <span class="kml-row__subject">{{ row.subject || '(no subject)' }}</span>
        <span v-if="row.snippet" class="kml-row__snippet">{{ row.snippet }}</span>
      </div>
    </div>

    <div class="kml-row__side">
      <div class="kml-row__actions" @click.stop>
        <button v-if="canAct" class="kml-iconbtn kml-iconbtn--sm" :title="row.isRead ? 'Mark unread (u)' : 'Mark read (u)'" :aria-label="row.isRead ? 'Mark unread' : 'Mark read'" @click="$emit('read', !row.isRead)">
          <MailIcon :name="row.isRead ? 'mail' : 'mail-open'" />
        </button>
        <button v-if="canDelete && !inTrash" class="kml-iconbtn kml-iconbtn--sm" title="Move to Trash (e)" aria-label="Move to Trash" @click="$emit('trash')">
          <MailIcon name="trash" />
        </button>
        <button v-if="canDelete && inTrash" class="kml-iconbtn kml-iconbtn--sm" title="Restore" aria-label="Restore" @click="$emit('restore')">
          <MailIcon name="restore" />
        </button>
      </div>
      <button
        v-if="row.code"
        class="kml-code"
        :title="`Copy ${codeForClipboard(row.code)} (c)`"
        :aria-label="`Copy code ${codeForClipboard(row.code)}`"
        :data-testid="`code-${row.id}`"
        @click.stop="$emit('copy', row.code)"
      >
        <MailIcon name="key" /><span class="kml-mono">{{ spacedCode(row.code) }}</span><MailIcon name="copy" class="kml-code__copy" />
      </button>
      <MailIcon v-else-if="row.hasAttachments" name="clip" class="kml-row__clip" title="Has attachments" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MailIcon from '~/components/Mail/Icon.vue';
import { avatarHue, codeForClipboard, fullTime, initialOf, listTime, localPart, senderName, spacedCode, type MailRow } from '~/scripts/kliveMail';

const props = defineProps<{
  row: MailRow;
  selected: boolean;
  checked: boolean;
  fresh: boolean;
  pending: boolean;
  showMailbox: boolean;
  inTrash: boolean;
  canAct: boolean;
  canDelete: boolean;
  now: number;
}>();
const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'check', range: boolean): void;
  (e: 'copy', code: string): void;
  (e: 'read', read: boolean): void;
  (e: 'trash'): void;
  (e: 'restore'): void;
}>();

const name = computed(() => senderName(props.row));
const initial = computed(() => initialOf(name.value));
const hue = computed(() => avatarHue(props.row.from || name.value));

function onClick(event: MouseEvent) {
  // Ctrl/Cmd-click selects, the way a file list does; a plain click reads.
  if (event.ctrlKey || event.metaKey) emit('check', false);
  else if (event.shiftKey) emit('check', true);
  else emit('open');
}
</script>
