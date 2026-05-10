<template>
  <div class="vnav-root" :class="{ 'is-collapsed': collapsed, 'is-overlay': overlay }">
    <aside class="vnav" :style="{ width: railWidth }">
      <div class="vnav-header">
        <img src="~/public/klivebot.png" class="vnav-logo" alt="logo" />
        <span v-if="!collapsed" class="vnav-brand">KLIVES</span>
        <button class="vnav-toggle" @click="toggleCollapsed" :title="collapsed ? 'Expand' : 'Collapse'">
          <span>{{ collapsed ? '›' : '‹' }}</span>
        </button>
      </div>

      <nav class="vnav-body">
        <template v-for="(group, gi) in visibleGroups" :key="gi">
          <div class="vnav-group">
            <div v-if="!collapsed" class="vnav-group-label" @click="toggleGroup(group.id)">
              <span>{{ group.label }}</span>
              <span class="vnav-caret">{{ openGroups[group.id] === false ? '+' : '−' }}</span>
            </div>
            <div v-if="collapsed" class="vnav-group-divider"></div>
            <ul v-show="collapsed || openGroups[group.id] !== false" class="vnav-list">
              <li v-for="item in group.items" :key="item.to">
                <NuxtLink :to="item.to" class="vnav-item" active-class="vnav-item-active" :title="item.label">
                  <span class="vnav-icon">{{ item.icon }}</span>
                  <span v-if="!collapsed" class="vnav-label">{{ item.label }}</span>
                </NuxtLink>
              </li>
            </ul>
          </div>
        </template>
      </nav>

      <div class="vnav-footer">
        <div v-if="!collapsed" class="vnav-user">
          <div class="vnav-user-name">{{ username || 'unknown' }}</div>
          <div class="vnav-user-role">rank {{ rank ?? '?' }}</div>
        </div>
        <button class="vnav-logout" @click="logOut" :title="'Log Out'">
          <span class="vnav-icon">⏻</span>
          <span v-if="!collapsed" class="vnav-label">Log Out</span>
        </button>
      </div>
    </aside>

    <main class="vnav-main" :style="{ marginLeft: overlay ? '0' : railWidth }">
      <slot />
    </main>
  </div>
</template>

<script>
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

const NAV_GROUPS = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Home', icon: '⌂' },
    ],
  },
  {
    id: 'intel',
    label: 'Intel',
    items: [
      { to: '/omniscience', label: 'Omniscience', icon: '◎' },
      { to: '/schemes', label: 'Schemes', icon: '※' },
      { to: '/omnidefence', label: 'OmniDefence', icon: '⛨', klivesOnly: true },
    ],
  },
  {
    id: 'klive',
    label: 'Klive Suite',
    items: [
      { to: '/klivecloud', label: 'KliveCloud', icon: '☁' },
      { to: '/klivetech', label: 'KliveTech', icon: '⚙' },
      { to: '/klivechat', label: 'KliveChat', icon: '✉' },
      { to: '/kliveagent', label: 'KliveAgent', icon: '◈' },
      { to: '/klivetools', label: 'KliveTools', icon: '⚒' },
      { to: '/stratum', label: 'Stratum', icon: '▲' },
    ],
  },
  {
    id: 'ops',
    label: 'Ops',
    items: [
      { to: '/botSchedule', label: 'Schedule', icon: '◷' },
      { to: '/admin', label: 'Admin', icon: '★' },
    ],
  },
];

export default {
  name: 'navbarLayout',
  data() {
    return {
      collapsed: false,
      overlay: false,
      isKlives: false,
      username: '',
      rank: null,
      openGroups: {},
      _resizeHandler: null,
    };
  },
  computed: {
    railWidth() {
      return this.collapsed ? '56px' : '220px';
    },
    visibleGroups() {
      return NAV_GROUPS.map(g => ({
        ...g,
        items: g.items.filter(i => !i.klivesOnly || this.isKlives),
      })).filter(g => g.items.length > 0);
    },
  },
  async mounted() {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('vnavCollapsed');
      if (stored !== null) this.collapsed = stored === '1';
      this._resizeHandler = () => this.applyResponsive();
      window.addEventListener('resize', this._resizeHandler);
      this.applyResponsive();
    }
    try {
      const r = await RequestGETFromKliveAPI('/KMProfiles/GetCurrentProfile', false, false);
      if (r.ok) {
        const p = await r.json();
        this.rank = Number(p?.KlivesManagementRank);
        this.isKlives = this.rank === 5;
        this.username = p?.Username || p?.Name || p?.Nickname || '';
      }
    } catch { /* ignore */ }
  },
  beforeUnmount() {
    if (this._resizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._resizeHandler);
    }
  },
  methods: {
    applyResponsive() {
      if (typeof window === 'undefined') return;
      const narrow = window.innerWidth < 768;
      this.overlay = narrow;
      if (narrow) this.collapsed = true;
    },
    toggleCollapsed() {
      this.collapsed = !this.collapsed;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('vnavCollapsed', this.collapsed ? '1' : '0');
      }
    },
    toggleGroup(id) {
      const cur = this.openGroups[id];
      this.openGroups = { ...this.openGroups, [id]: cur === false ? true : false };
    },
    logOut() {
      const cook = useCookie('password');
      cook.value = '';
      this.$router.push('/');
    },
  },
};
</script>

<style scoped lang="scss">
@use '~/assets/scss/colors' as c;

.vnav-root {
  min-height: 100vh;
  background: c.$main;
  color: c.$gray;
}

.vnav {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: c.$mainDarker;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width 160ms ease;
  z-index: 1000;
  overflow: hidden;
}

.vnav-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.vnav-logo {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 4px;
}
.vnav-brand {
  font-weight: 600;
  letter-spacing: 1.5px;
  font-size: 13px;
  color: c.$white;
  flex: 1;
}
.vnav-toggle {
  background: transparent;
  color: c.$gray;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  width: 26px;
  height: 26px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  transition: background 120ms, color 120ms;
}
.vnav-toggle:hover {
  background: rgba(255, 255, 255, 0.04);
  color: c.$white;
}

.vnav-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}
.vnav-body::-webkit-scrollbar { width: 6px; }
.vnav-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
}

.vnav-group { margin-bottom: 6px; }
.vnav-group-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: rgba(150, 150, 150, 0.55);
  cursor: pointer;
  user-select: none;
}
.vnav-group-label:hover { color: c.$gray; }
.vnav-caret { font-size: 12px; }
.vnav-group-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.05);
  margin: 6px 12px;
}

.vnav-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.vnav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  margin: 1px 8px;
  border-radius: 4px;
  color: c.$gray;
  text-decoration: none;
  white-space: nowrap;
  font-size: 13px;
  transition: background 120ms, color 120ms;
}
.vnav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: c.$white;
}
.vnav-item-active {
  background: rgba(c.$secondary, 0.14);
  color: c.$teritary;
}
.vnav-icon {
  display: inline-flex;
  width: 18px;
  justify-content: center;
  font-size: 14px;
  opacity: 0.8;
}
.vnav-item-active .vnav-icon { opacity: 1; }
.vnav-label { flex: 1; }

.is-collapsed .vnav-item {
  justify-content: center;
  padding: 10px 0;
  margin: 1px 6px;
}
.is-collapsed .vnav-header { justify-content: center; padding: 12px 6px; }
.is-collapsed .vnav-toggle {
  position: absolute;
  top: 14px;
  right: -13px;
  background: c.$mainDarker;
}

.vnav-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vnav-user-name {
  font-size: 12px;
  color: c.$white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vnav-user-role {
  font-size: 10px;
  color: rgba(150, 150, 150, 0.6);
  text-transform: uppercase;
  letter-spacing: 1px;
}
.vnav-logout {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: c.$gray;
  padding: 7px 10px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  justify-content: center;
  transition: background 120ms, color 120ms, border-color 120ms;
}
.vnav-logout:hover {
  background: rgba(176, 72, 72, 0.12);
  border-color: rgba(176, 72, 72, 0.4);
  color: #ff9a9a;
}

.vnav-main {
  padding: 18px 22px;
  transition: margin-left 160ms ease;
  min-height: 100vh;
}

.is-overlay .vnav {
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.4);
}
</style>
