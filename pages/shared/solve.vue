<template>
  <div class="solve-page">
    <header class="solve-head">
      <div class="solve-brand">KliveAgent · Take Over</div>
      <div class="solve-sub" v-if="!resolved">Solve the captcha or login on the screen below. The agent resumes the moment you finish.</div>
      <div class="solve-sub" v-else>Handed back to the agent. You can close this tab.</div>
    </header>

    <main class="solve-body">
      <div v-if="!token" class="solve-msg">
        <h2>Link expired or invalid</h2>
        <p>This take-over link has no token. It may have already been used. The agent mints a fresh link each time it needs you.</p>
      </div>

      <div v-else-if="resolved" class="solve-msg solve-done">
        <div class="solve-done-glyph">✓</div>
        <h2>Done. Thanks!</h2>
        <p>The agent has taken back control and is continuing the task.</p>
      </div>

      <RemoteDesktop
        v-else
        auth-mode="token"
        :token="token"
        :fps="20"
        :quality="62"
        :allow-resolve="true"
        @resolved="onResolved"
      />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import RemoteDesktop from '~/components/RemoteDesktop/RemoteDesktop.vue';

// Bare, no-chrome layout; reachable without login (/shared/ bypasses the auth middleware) — the URL token
// is the scoped capability that authorizes this one solve session.
definePageMeta({ layout: 'empty' });

const route = useRoute();
const token = ref(typeof route.query.token === 'string' ? route.query.token : '');
const resolved = ref(false);

function onResolved() {
  resolved.value = true;
}
</script>

<style scoped lang="scss">
.solve-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #0a0a0a;
  color: #ededed;
  box-sizing: border-box;
}
.solve-head {
  flex: 0 0 auto;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: #121212;
}
.solve-brand { font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: #2ecf86; }
.solve-sub { font-size: 12px; color: #9a9a9a; margin-top: 2px; }

.solve-body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  padding: 10px;
  box-sizing: border-box;
}
.solve-body > * { flex: 1 1 0; min-height: 0; }

.solve-msg {
  margin: auto;
  text-align: center;
  max-width: 460px;
  padding: 24px;
  color: #b8b8b8;
}
.solve-msg h2 { color: #ededed; margin: 0 0 8px; }
.solve-done-glyph {
  font-size: 56px;
  color: #2ecf86;
  line-height: 1;
  margin-bottom: 10px;
}
</style>
