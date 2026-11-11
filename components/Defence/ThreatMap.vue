<template>
  <div class="odx-map__stage" :data-box="boxMode || undefined">
    <div ref="container" class="odx-map__canvas" role="application" aria-label="Map of every address that has visited"></div>
    <div v-if="!ready" class="odx-map__veil"><span><DefenceIcon name="globe" class="odx-spin" /> Drawing the map…</span></div>
    <div v-else-if="!points.length" class="odx-map__veil"><span>{{ emptyText }}</span></div>

    <div class="odx-map__hud">
      <span v-if="boxMode" class="odx-map__tag" data-tone="crit"><DefenceIcon name="box" /> Drag a box to block a region</span>
      <span v-if="approximate" class="odx-map__tag" :title="`${approximate} of these have only a country, and are drawn near its centre`">{{ approximate }} approximate</span>
    </div>

    <div class="odx-map__zoom">
      <button title="Zoom in" aria-label="Zoom in" @click="zoom(1)"><DefenceIcon name="plus" /></button>
      <button title="Zoom out" aria-label="Zoom out" @click="zoom(-1)"><DefenceIcon name="minus" /></button>
      <button title="Whole world" aria-label="Whole world" @click="home"><DefenceIcon name="expand" /></button>
    </div>

    <slot name="overlay" />

    <div v-if="pendingBox" class="odx-boxpop" :style="{ left: `${pendingBox.left}px`, top: `${pendingBox.top}px` }" data-testid="odx-boxpop">
      <div class="odx-boxpop__title">Block this region</div>
      <div class="odx-boxpop__sub">
        {{ pendingBox.blockable }} address{{ pendingBox.blockable === 1 ? '' : 'es' }} here now{{ pendingBox.protected ? `, ${pendingBox.protected} protected` : '' }}.
        Anyone new from inside the box is blocked too.
      </div>
      <input v-model="pendingBox.reason" class="odx-input" style="width: 100%" placeholder="Reason" @keydown.enter="confirmBox" @keydown.esc="cancelBox" />
      <div class="odx-boxpop__acts">
        <button class="odx-btn odx-btn--sm odx-btn--ghost" :disabled="busy" @click="cancelBox">Cancel</button>
        <button class="odx-btn odx-btn--sm odx-btn--solid-danger" :disabled="busy" data-testid="odx-boxpop-confirm" @click="confirmBox">
          <DefenceIcon :name="busy ? 'refresh' : 'block'" :class="{ 'odx-spin': busy }" />Block region
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import 'leaflet/dist/leaflet.css';
import {
  STATUS_COLORS, fmtAgo, fmtGeo, fmtNetwork, mapCoordinates, type ClassInfo, type DefenceIp, type DefenceRegion,
} from '~/scripts/omniDefence';

/**
 * Every address that has visited, where it is. Canvas-drawn on a self-hosted Natural Earth basemap
 * (no tile server, key or quota). Colour is the visitor's class or what has been done about it;
 * a cross is a block, a strike a tarpit, a dashed ring a trap. Drag a box in box mode to block a region.
 */
const props = defineProps<{
  points: DefenceIp[];
  classes: readonly ClassInfo[];
  colour: 'class' | 'status';
  selected: string | null;
  regions: DefenceRegion[];
  boxMode: boolean;
  busy?: boolean;
  now: number;
  emptyText?: string;
}>();
const emit = defineEmits<{
  select: [ip: string];
  traffic: [ip: string];
  'block-region': [box: { latMin: number; latMax: number; lonMin: number; lonMax: number }, reason: string];
  'remove-region': [region: DefenceRegion];
}>();

const container = ref<HTMLElement | null>(null);
const ready = ref(false);
const pendingBox = ref<{ latMin: number; latMax: number; lonMin: number; lonMax: number; blockable: number; protected: number; reason: string; left: number; top: number } | null>(null);

let L: any = null;
let map: any = null;
let pointLayer: any = null;
let regionLayer: any = null;
let selectionLayer: any = null;
let renderer: any = null;
let basemapRenderer: any = null;
const basemaps: Record<string, any> = {};
let basemapDetail: string | null = null;
let labels: any = null;
let StatusGlyph: any = null;
let homeZoom = 2;
let resizeObserver: ResizeObserver | null = null;
let boxStart: any = null;
let boxStartPoint: any = null;
let selectionRect: any = null;
let frame = 0;

const classById = computed(() => new Map(props.classes.map(c => [c.id, c])));
const approximate = computed(() => props.points.reduce((n, p) => n + ((p.latitude == null || p.longitude == null) && mapCoordinates(p) ? 1 : 0), 0));

const clampLat = (lat: number) => Math.max(-85.0511287, Math.min(85.0511287, Number(lat)));
const clampLon = (lon: number) => Math.max(-180, Math.min(180, Number(lon)));

function fitZoom(): number {
  const width = Math.max(1, container.value?.clientWidth ?? 1024);
  const zoom = Math.ceil(Math.log2(width / 256) * 4) / 4;
  return Math.min(3.5, Math.max(1.75, zoom));
}

function zoom(delta: number) {
  if (!map) return;
  map.setZoom(Math.max(map.getMinZoom(), Math.min(13, map.getZoom() + delta)));
}

function home() {
  if (!map) return;
  map.setView([22, 8], homeZoom);
  cancelBox();
}

/** Moves the map to an address without changing the zoom more than it needs to. */
function focus(ip: DefenceIp | null | undefined) {
  if (!map || !ip) return;
  const at = mapCoordinates(ip);
  if (!at) return;
  map.flyTo([clampLat(at.lat), clampLon(at.lon)], Math.max(map.getZoom(), 4), { duration: 0.6 });
}
defineExpose({ focus, home });

function visual(point: DefenceIp) {
  if (props.colour === 'status') {
    const color = STATUS_COLORS[point.status] ?? STATUS_COLORS.Normal;
    const muted = point.status === 'Normal';
    return { fill: muted ? '#3c6f8a' : color, stroke: muted ? '#5fd3ff' : color, opacity: muted ? 0.55 : 0.9 };
  }
  const color = classById.value.get(point.classification || 'Unknown')?.color ?? '#56636b';
  const confidence = Number(point.classConfidence) || 0;
  // A tentative verdict reads as a fainter dot.
  return { fill: color, stroke: color, opacity: 0.38 + 0.55 * Math.min(1, confidence) };
}

function tooltip(point: DefenceIp, approx: boolean): string {
  const cls = classById.value.get(point.classification || 'Unknown');
  const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
  const conf = point.classConfidence != null ? ` ${Math.round(point.classConfidence * 100)}%` : '';
  const who = point.profileName ? `<br>Profile: ${esc(point.profileName)}` : '';
  const status = point.status !== 'Normal' ? ` · <b>${esc(point.status)}</b>` : '';
  return `<b>${esc(point.ip)}</b> · ${esc(cls?.label ?? point.classification)}${conf}${status}<br>`
    + `${esc(fmtGeo(point))}${approx ? ' <i>(country only)</i>' : ''}<br><i>${esc(fmtNetwork(point))}</i>${who}<br>`
    + `<i>${point.total.toLocaleString('en-GB')} requests · last ${esc(fmtAgo(point.lastSeen, props.now))}</i>`;
}

function drawPoints() {
  frame = 0;
  if (!L || !pointLayer) return;
  pointLayer.clearLayers();
  const dayAgo = props.now / 1000 - 86_400;
  for (const point of props.points) {
    const at = mapCoordinates(point);
    if (!at) continue;
    const latLng = [clampLat(at.lat), clampLon(at.lon)];
    const look = visual(point);
    const selected = props.selected === point.ip;
    const size = Math.min(7, Math.max(3.2, 3.2 + Math.log10(point.total + 1) * 0.85));
    const radius = selected ? size + 2 : size;
    if (point.lastSeen >= dayAgo || selected) {
      L.circleMarker(latLng, { renderer, radius: radius + (selected ? 4.5 : 3), color: selected ? '#ffffff' : look.fill, weight: selected ? 1.6 : 1, opacity: selected ? 0.9 : 0.3, fill: false, interactive: false }).addTo(pointLayer);
    }
    const marker = L.circleMarker(latLng, {
      renderer,
      radius,
      color: look.stroke,
      weight: selected ? 2 : 1,
      opacity: 0.9,
      fillColor: look.fill,
      fillOpacity: at.approximate ? Math.min(0.5, look.opacity) : look.opacity,
      interactive: !props.boxMode,
      bubblingMouseEvents: false,
    }).addTo(pointLayer);
    if (point.status === 'Honeypot') {
      L.circleMarker(latLng, { renderer, radius: radius + 3, color: '#c79cff', weight: 1.4, opacity: 0.95, dashArray: '2 2', fill: false, interactive: false }).addTo(pointLayer);
    } else if ((point.status === 'Blocked' || point.status === 'Tarpit') && StatusGlyph) {
      new StatusGlyph(latLng, { renderer, radius: Math.max(3, radius - 0.5), color: point.status === 'Blocked' ? '#ffffff' : '#ffe066', weight: 1.5, opacity: 0.95, fill: false, interactive: false, glyph: point.status === 'Blocked' ? 'cross' : 'strike' }).addTo(pointLayer);
    }
    marker.bindTooltip(tooltip(point, at.approximate), { sticky: true, direction: 'top', className: 'odx-map-tooltip', offset: [0, -6] });
    marker.on('click', () => emit('select', point.ip));
    marker.on('dblclick', (event: any) => { L.DomEvent.stop(event); emit('traffic', point.ip); });
  }
}

function scheduleDraw() {
  if (frame || !ready.value) return;
  frame = window.requestAnimationFrame(drawPoints);
}

function drawRegions() {
  if (!L || !regionLayer) return;
  regionLayer.clearLayers();
  for (const region of props.regions) {
    const bounds = L.latLngBounds(
      [clampLat(Math.min(region.latMin, region.latMax)), clampLon(Math.min(region.lonMin, region.lonMax))],
      [clampLat(Math.max(region.latMin, region.latMax)), clampLon(Math.max(region.lonMin, region.lonMax))],
    );
    const rect = L.rectangle(bounds, { renderer, color: '#ff8a96', weight: 1, opacity: 0.75, fillColor: '#ff5d6c', fillOpacity: 0.12, dashArray: '5 4', interactive: !props.boxMode, bubblingMouseEvents: false }).addTo(regionLayer);
    rect.bindTooltip(`Region block #${region.id}: ${region.reason.replace(/</g, '&lt;')}<br><i>Click to remove</i>`, { sticky: true, className: 'odx-map-tooltip' });
    rect.on('click', () => emit('remove-region', region));
  }
}

// ── box selection ──

function cancelBox() {
  pendingBox.value = null;
  boxStart = null;
  boxStartPoint = null;
  selectionRect = null;
  selectionLayer?.clearLayers();
}

function onDown(event: any) {
  if (!props.boxMode || props.busy || event.originalEvent?.button !== 0) return;
  cancelBox();
  boxStart = event.latlng;
  boxStartPoint = map.latLngToContainerPoint(event.latlng);
  selectionRect = L.rectangle(L.latLngBounds(event.latlng, event.latlng), { color: '#ff8a96', weight: 1, opacity: 0.95, fillColor: '#ff5d6c', fillOpacity: 0.12, dashArray: '4 3', interactive: false }).addTo(selectionLayer);
  L.DomEvent.preventDefault(event.originalEvent);
}

function onMove(event: any) {
  if (!props.boxMode || !boxStart || !selectionRect) return;
  selectionRect.setBounds(L.latLngBounds(boxStart, event.latlng));
}

function onUp(event: any) {
  if (!props.boxMode || !boxStart) return;
  const endPoint = map.latLngToContainerPoint(event.latlng);
  const startPoint = boxStartPoint;
  const bounds = L.latLngBounds(boxStart, event.latlng);
  boxStart = null;
  if (!startPoint || Math.abs(endPoint.x - startPoint.x) < 8 || Math.abs(endPoint.y - startPoint.y) < 8) { cancelBox(); return; }
  const latMin = clampLat(bounds.getSouth()), latMax = clampLat(bounds.getNorth());
  const lonMin = clampLon(bounds.getWest()), lonMax = clampLon(bounds.getEast());
  let blockable = 0, guarded = 0;
  for (const point of props.points) {
    const at = mapCoordinates(point);
    if (!at || at.lat < latMin || at.lat > latMax || at.lon < lonMin || at.lon > lonMax) continue;
    if (point.isKlives) guarded++;
    else if (point.status !== 'Blocked') blockable++;
  }
  const width = container.value?.clientWidth ?? 1000;
  const height = container.value?.clientHeight ?? 480;
  const right = Math.max(startPoint.x, endPoint.x);
  const left = right + 280 > width ? Math.max(10, Math.min(startPoint.x, endPoint.x) - 274) : right + 14;
  const top = Math.max(10, Math.min(height - 170, (startPoint.y + endPoint.y) / 2 - 80));
  pendingBox.value = { latMin, latMax, lonMin, lonMax, blockable, protected: guarded, reason: 'Region block from the map', left, top };
  selectionRect?.setStyle({ color: '#ffd166', fillColor: '#ffd166', fillOpacity: 0.08, dashArray: '6 4' });
}

function confirmBox() {
  const box = pendingBox.value;
  if (!box || props.busy) return;
  emit('block-region', { latMin: box.latMin, latMax: box.latMax, lonMin: box.lonMin, lonMax: box.lonMax }, box.reason);
}

watch(() => props.busy, (busy, was) => { if (was && !busy) cancelBox(); });

// ── basemap ──

function unwrapAntimeridian(geojson: any): any {
  const unwrap = (line: number[][]) => {
    const out: number[][] = [];
    for (const [lon, lat] of line) {
      let x = lon;
      if (out.length) {
        const prev = out[out.length - 1][0];
        while (x - prev > 180) x -= 360;
        while (x - prev < -180) x += 360;
      }
      out.push([x, lat]);
    }
    return out;
  };
  // A ring around the pole (Antarctica) cannot close once unwrapped: keep it as it is.
  const unwrapRing = (ring: number[][]) => { const out = unwrap(ring); return Math.abs(out[out.length - 1][0] - out[0][0]) > 1 ? ring : out; };
  const shift = (lines: number[][][], by: number) => lines.map(line => line.map(([lon, lat]) => [lon + by, lat]));
  const copies = (lines: number[][][]) => {
    const lons = lines.flat().map(p => p[0]);
    const out = [lines];
    if (Math.max(...lons) > 180) out.push(shift(lines, -360));
    if (Math.min(...lons) < -180) out.push(shift(lines, 360));
    return out;
  };
  const fix = (geometry: any) => {
    if (!geometry) return geometry;
    switch (geometry.type) {
      case 'LineString': return { type: 'MultiLineString', coordinates: copies([unwrap(geometry.coordinates)]).flat() };
      case 'MultiLineString': return { type: 'MultiLineString', coordinates: geometry.coordinates.flatMap((line: number[][]) => copies([unwrap(line)]).flat()) };
      case 'Polygon': return { type: 'MultiPolygon', coordinates: copies(geometry.coordinates.map(unwrapRing)) };
      case 'MultiPolygon': return { type: 'MultiPolygon', coordinates: geometry.coordinates.flatMap((polygon: number[][][]) => copies(polygon.map(unwrapRing))) };
      default: return geometry;
    }
  };
  if (geojson.type === 'FeatureCollection') return { ...geojson, features: geojson.features.map((f: any) => ({ ...f, geometry: fix(f.geometry) })) };
  if (geojson.type === 'Feature') return { ...geojson, geometry: fix(geojson.geometry) };
  return fix(geojson);
}

function buildLabels(collection: any) {
  const group = L.layerGroup();
  const ringArea = (ring: number[][]) => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; return a / 2; };
  for (const country of unwrapAntimeridian(collection).features) {
    const name = country.properties?.name;
    const geometry = country.geometry;
    if (!name || !geometry || name === 'Antarctica') continue;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    let best: number[][] | null = null;
    let bestArea = 0;
    for (const polygon of polygons) {
      const area = Math.abs(ringArea(polygon[0]));
      if (area > bestArea) { bestArea = area; best = polygon[0]; }
    }
    if (!best || bestArea < 0.4) continue;
    let cx = 0, cy = 0, signed = 0;
    for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
      const cross = best[j][0] * best[i][1] - best[i][0] * best[j][1];
      signed += cross; cx += (best[j][0] + best[i][0]) * cross; cy += (best[j][1] + best[i][1]) * cross;
    }
    if (!signed) continue;
    const tier = bestArea >= 250 ? 0 : bestArea >= 40 ? 1 : bestArea >= 6 ? 2 : 3;
    const span = document.createElement('span');
    span.textContent = name;
    const lon = ((cx / (3 * signed) + 540) % 360) - 180;
    L.marker([cy / (3 * signed), lon], { pane: 'odxLabels', interactive: false, keyboard: false, icon: L.divIcon({ className: `odx-map-label tier-${tier}`, html: span.outerHTML, iconSize: null }) }).addTo(group);
  }
  return group;
}

async function buildBasemap(detail: '10m' | '50m') {
  const [{ feature, mesh }, topologyModule] = await Promise.all([
    // @ts-ignore topojson-client ships no type declarations
    import('topojson-client'),
    detail === '10m' ? import('world-atlas/countries-10m.json') : import('world-atlas/countries-50m.json'),
  ]);
  const topology: any = (topologyModule as any).default || topologyModule;
  const countries = topology.objects.countries;
  const land = (feature as any)(topology, countries);
  const shared = { renderer: basemapRenderer, pane: 'odxBasemap', interactive: false };
  const group = L.featureGroup();
  L.geoJSON(unwrapAntimeridian(land), { ...shared, attribution: 'Basemap: Natural Earth', style: { stroke: false, fill: true, fillColor: '#0f1c27', fillOpacity: 1 } }).addTo(group);
  L.geoJSON(unwrapAntimeridian((mesh as any)(topology, countries, (a: any, b: any) => a !== b)), { ...shared, style: { color: '#243747', weight: 0.7, opacity: 0.9, fill: false, lineJoin: 'round' } }).addTo(group);
  L.geoJSON(unwrapAntimeridian((mesh as any)(topology, countries, (a: any, b: any) => a === b)), { ...shared, style: { color: '#33506a', weight: 0.9, opacity: 0.9, fill: false, lineJoin: 'round' } }).addTo(group);
  if (map && !labels) labels = markRaw(buildLabels(land).addTo(map));
  return markRaw(group);
}

// 50m geometry for the world view; the ~3.6 MB 10m set only once someone zooms in.
async function syncBasemap() {
  if (!map) return;
  const z = map.getZoom();
  const detail = z >= 5 ? '10m' : '50m';
  if (container.value) container.value.dataset.labelTier = String(z >= 5.5 ? 3 : z >= 4.5 ? 2 : z >= 3.5 ? 1 : 0);
  if (basemapDetail === detail) return;
  basemapDetail = detail;
  try {
    if (!basemaps[detail]) basemaps[detail] = await buildBasemap(detail);
  } catch (error) {
    console.error(`OmniDefence basemap (${detail}) failed to load`, error);
    if (basemapDetail === detail) basemapDetail = null;
    return;
  }
  if (basemapDetail !== detail || !map) return;
  for (const [key, layer] of Object.entries(basemaps)) {
    if (key === detail) layer.addTo(map); else layer.remove();
  }
}

onMounted(async () => {
  await nextTick();
  if (!container.value) return;
  // @ts-ignore leaflet's type declarations are not installed
  const module: any = await import('leaflet');
  L = markRaw(module.default || module);
  const bounds = L.latLngBounds([[-85.0511287, -180], [85.0511287, 180]]);
  map = markRaw(L.map(container.value, {
    preferCanvas: true,
    zoomControl: false,
    attributionControl: false,
    doubleClickZoom: false,
    minZoom: 1.75,
    maxZoom: 13,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 140,
    maxBounds: bounds,
    maxBoundsViscosity: 0.85,
  }));
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
  map.createPane('odxBasemap').style.zIndex = '250';
  const labelPane = map.createPane('odxLabels');
  labelPane.style.zIndex = '350';
  labelPane.style.pointerEvents = 'none';

  StatusGlyph = markRaw(L.CircleMarker.extend({
    _updatePath() {
      const r = this._renderer;
      if (!r?._drawing || this._empty()) return;
      const ctx = r._ctx, p = this._point, s = this._radius;
      ctx.save();
      ctx.strokeStyle = this.options.color;
      ctx.lineWidth = this.options.weight;
      ctx.globalAlpha = this.options.opacity;
      ctx.beginPath();
      if (this.options.glyph === 'cross') {
        ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
        ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s);
      } else {
        ctx.moveTo(p.x - s - 3, p.y); ctx.lineTo(p.x + s + 3, p.y);
      }
      ctx.stroke();
      ctx.restore();
    },
  }));

  basemapRenderer = markRaw(L.canvas({ pane: 'odxBasemap', padding: 0.5 }));
  renderer = markRaw(L.canvas({ padding: 0.3 }));
  regionLayer = markRaw(L.layerGroup().addTo(map));
  pointLayer = markRaw(L.layerGroup().addTo(map));
  selectionLayer = markRaw(L.layerGroup().addTo(map));

  homeZoom = fitZoom();
  map.setMinZoom(homeZoom);
  map.setView([22, 8], homeZoom);
  map.on('mousedown', onDown);
  map.on('mousemove', onMove);
  map.on('mouseup', onUp);
  map.on('zoomend', () => void syncBasemap());
  if (props.boxMode) map.dragging.disable();
  void syncBasemap();
  ready.value = true;
  drawPoints();
  drawRegions();

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!map) return;
      map.invalidateSize({ animate: false });
      homeZoom = fitZoom();
      map.setMinZoom(homeZoom);
      if (map.getZoom() < homeZoom) map.setZoom(homeZoom, { animate: false });
    });
    resizeObserver.observe(container.value);
  }
});

onBeforeUnmount(() => {
  if (frame) window.cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  map?.remove();
  map = null;
  L = null;
});

watch(() => [props.points, props.colour, props.selected, props.classes], scheduleDraw);
watch(() => props.regions, drawRegions);
watch(() => props.boxMode, enabled => {
  if (!map) return;
  if (enabled) map.dragging.disable();
  else { map.dragging.enable(); cancelBox(); }
  drawPoints();
  drawRegions();
});
</script>
