<template>
  <button class="msx-reel" type="button" :title="reel.Description ?? undefined" :data-testid="`reel-${reel.PostID}`" @click="$emit('open', reel.PostID)">
    <span class="msx-reel__media">
      <MemeThumb :post-id="reel.PostID" />
      <span v-if="rank" class="msx-reel__rank" :data-top="rank <= 3 || undefined">{{ rank }}</span>
      <span v-if="reel.VideoExists === false" class="msx-reel__badge msx-chip" data-tone="crit">no video</span>
      <span v-else-if="age" class="msx-reel__age" :title="`Posted ${age} ago`">{{ age }}</span>
      <span class="msx-reel__over">
        <span><MemeIcon name="eye" />{{ msCompact(reel.Views) }}</span>
        <span v-if="reel.Likes"><MemeIcon name="heart" />{{ msCompact(reel.Likes) }}</span>
      </span>
    </span>
    <span class="msx-reel__meta">
      <span class="msx-reel__owner">@{{ reel.Owner }}</span>
      <span v-if="!compact" class="msx-reel__caption">{{ reel.Description || 'No caption' }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMemeConsole } from '~/composables/useMemeConsole';
import { msAgo, msCompact, type MsReel } from '~/scripts/memeConsole';

const props = defineProps<{ reel: MsReel; rank?: number; compact?: boolean }>();
defineEmits<{ open: [postId: string] }>();
const c = useMemeConsole();
const age = computed(() => msAgo(props.reel.PostedUtc ?? props.reel.DownloadedUtc, c.now.value, '').replace(' ago', '').replace(' ', '').replace('justnow', 'now'));
</script>
