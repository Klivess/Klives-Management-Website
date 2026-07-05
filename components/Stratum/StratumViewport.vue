<template>
  <div class="stratum-viewport-root" ref="rootEl">
    <div class="viewport-canvas-host" ref="canvasHost"></div>
    <div v-if="status" class="viewport-status">{{ status }}</div>
    <div v-if="!status && !hasModel" class="viewport-empty">No mesh artifact yet — generate one with the agents.</div>
    <div class="viewport-toolbar">
      <button
        v-if="hasModel && hasElectronicsOverlay"
        class="tool-btn"
        :class="{ active: electronicsVisible }"
        @click="toggleElectronics"
        type="button"
      >{{ electronicsVisible ? 'Hide electronics' : 'Show electronics' }}</button>
      <button class="tool-btn" :class="{ active: gridVisible }" @click="toggleGrid" type="button">{{ gridVisible ? 'Hide grid' : 'Show grid' }}</button>
      <button v-if="hasModel" class="tool-btn" @click="resetCamera" type="button">Frame</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Stratum viewport. Renders GLB/STL meshes with three.js.
 *
 * Modes:
 *   - "scene": the model URL points at the latest assembly snapshot. The viewport
 *     persists this scene; clicking a part in the artifact tree highlights it in
 *     the assembly (the parent passes `highlightSubtask`). Children whose names
 *     start with `_electronics_` are rendered translucent and toggleable via the
 *     "Show / hide electronics" toolbar button.
 *   - "single": fallback to single-mesh load (e.g., when the user clicks a
 *     historical iteration that isn't part of the current assembly).
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const props = defineProps<{
  /** Public URL or blob URL for the mesh to load. */
  modelUrl?: string | null;
  /** 'glb' | 'stl'. If omitted, inferred from the URL extension. */
  modelType?: 'glb' | 'stl' | null;
  /**
   * When the loaded mesh is an assembly (composed by the mechanical agent), the
   * parent passes the SubtaskTitle of a part to highlight inside it. Object3D
   * names emitted by the composer follow the pattern `{SafeSubtaskTitle}_{idx}`.
   */
  highlightSubtask?: string | null;
}>();

const rootEl = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const status = ref('');
const hasModel = ref(false);
const electronicsVisible = ref(true);
const hasElectronicsOverlay = ref(false);
const gridVisible = ref(true);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let modelGroup: THREE.Group | null = null;
let gridHelper: THREE.GridHelper | null = null;
let axesHelper: THREE.AxesHelper | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationHandle: number | null = null;

// Tracks the original (per-material) emissive colour so highlight toggles can restore it.
const originalMaterialState = new Map<string, { emissive: THREE.Color; opacity: number; transparent: boolean; depthWrite: boolean }>();

function initThree() {
  if (!canvasHost.value) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1d);

  const w = canvasHost.value.clientWidth || 800;
  const h = canvasHost.value.clientHeight || 600;
  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 5000);
  camera.position.set(150, 120, 200);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(w, h);
  canvasHost.value.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x2a2a2a);
  gridHelper.visible = gridVisible.value;
  scene.add(gridHelper);
  axesHelper = new THREE.AxesHelper(50);
  axesHelper.visible = gridVisible.value;
  scene.add(axesHelper);

  scene.add(new THREE.HemisphereLight(0xdfe7ef, 0x202428, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const keyAngles: Array<[number, number, number, number]> = [
    [ 200,  250,  200, 0.55],
    [-200,  220,  150, 0.40],
    [ 150,  180, -220, 0.35],
    [-160,  100, -200, 0.30],
    [   0, -180,    0, 0.20],
  ];
  for (const [x, y, z, intensity] of keyAngles) {
    const d = new THREE.DirectionalLight(0xffffff, intensity);
    d.position.set(x, y, z);
    scene!.add(d);
  }

  modelGroup = new THREE.Group();
  scene.add(modelGroup);

  const loop = () => {
    if (!renderer || !scene || !camera) return;
    controls?.update();
    renderer.render(scene, camera);
    animationHandle = requestAnimationFrame(loop);
  };
  loop();

  resizeObserver = new ResizeObserver(() => {
    if (!canvasHost.value || !renderer || !camera) return;
    const cw = canvasHost.value.clientWidth;
    const ch = canvasHost.value.clientHeight;
    if (cw === 0 || ch === 0) return;
    renderer.setSize(cw, ch);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(canvasHost.value);
}

function clearModel() {
  if (!modelGroup) return;
  modelGroup.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if ((mesh as any).isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else mat?.dispose();
    }
  });
  while (modelGroup.children.length) modelGroup.remove(modelGroup.children[0]);
  hasModel.value = false;
  hasElectronicsOverlay.value = false;
  originalMaterialState.clear();
}

function isElectronicsNode(name: string): boolean {
  return /^_?electronics_/i.test(name);
}

function findAssemblyChildren(group: THREE.Object3D): THREE.Object3D[] {
  // Composer emits top-level children named like `Chassis_1`, `_electronics_u1`, etc.
  // We treat any direct child of the loaded scene root as one "assembly child".
  const out: THREE.Object3D[] = [];
  group.traverse(obj => {
    if (obj.name && obj.parent && (obj.parent === group || obj.parent.parent === group)) {
      out.push(obj);
    }
  });
  return out;
}

function applyElectronicsStyling() {
  if (!modelGroup) return;
  hasElectronicsOverlay.value = false;
  modelGroup.traverse(obj => {
    // Bubble the electronics-marker check up through ancestors so child meshes
    // inside an electronics subtree are styled too.
    let isElectronics = false;
    let cursor: THREE.Object3D | null = obj;
    while (cursor && cursor !== modelGroup) {
      if (cursor.name && isElectronicsNode(cursor.name)) { isElectronics = true; break; }
      cursor = cursor.parent;
    }
    if (!isElectronics) return;
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    hasElectronicsOverlay.value = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      const id = (std as any).uuid as string;
      if (!originalMaterialState.has(id)) {
        originalMaterialState.set(id, {
          emissive: std.emissive ? std.emissive.clone() : new THREE.Color(0, 0, 0),
          opacity: std.opacity,
          transparent: std.transparent,
          depthWrite: std.depthWrite,
        });
      }
      std.transparent = true;
      std.opacity = 0.35;
      std.depthWrite = false;
      if (std.emissive) std.emissive.setHex(0x4d9e39);
      std.needsUpdate = true;
    }
  });
  applyElectronicsVisibility();
}

function applyElectronicsVisibility() {
  if (!modelGroup) return;
  modelGroup.traverse(obj => {
    if (obj.name && isElectronicsNode(obj.name)) obj.visible = electronicsVisible.value;
  });
}

function clearHighlights() {
  if (!modelGroup) return;
  modelGroup.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      const id = (std as any).uuid as string;
      const orig = originalMaterialState.get(id);
      // Only restore emissive if the material isn't an electronics overlay (those keep their colour).
      if (orig && (!obj.name || !isElectronicsNode(closestNamedAncestor(obj)))) {
        if (std.emissive) std.emissive.copy(orig.emissive);
        std.needsUpdate = true;
      }
    }
  });
}

function closestNamedAncestor(obj: THREE.Object3D): string {
  let cursor: THREE.Object3D | null = obj;
  while (cursor) {
    if (cursor.name) return cursor.name;
    cursor = cursor.parent;
  }
  return '';
}

function highlightBySubtask(subtask: string | null | undefined) {
  if (!modelGroup) return;
  clearHighlights();
  if (!subtask) return;
  const safe = subtask.replace(/[^A-Za-z0-9]/g, '_').toLowerCase();
  // Composer names children `{SafeSubtaskTitle}_{idx}` — match the safe prefix.
  modelGroup.traverse(obj => {
    if (!obj.name) return;
    if (isElectronicsNode(obj.name)) return;
    const n = obj.name.toLowerCase();
    if (!n.startsWith(safe)) return;
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      const id = (std as any).uuid as string;
      if (!originalMaterialState.has(id)) {
        originalMaterialState.set(id, {
          emissive: std.emissive ? std.emissive.clone() : new THREE.Color(0, 0, 0),
          opacity: std.opacity,
          transparent: std.transparent,
          depthWrite: std.depthWrite,
        });
      }
      if (std.emissive) std.emissive.setHex(0xff8c00);
      std.needsUpdate = true;
    }
  });
}

function toggleElectronics() {
  electronicsVisible.value = !electronicsVisible.value;
  applyElectronicsVisibility();
}

function toggleGrid() {
  gridVisible.value = !gridVisible.value;
  if (gridHelper) gridHelper.visible = gridVisible.value;
  if (axesHelper) axesHelper.visible = gridVisible.value;
}

function resetCamera() {
  if (modelGroup) frameModel(modelGroup);
}

function frameModel(object: THREE.Object3D) {
  if (!camera || !controls) return;
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  if (!isFinite(size) || size === 0) return;
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size, size * 0.7, size));
  camera.near = size / 100;
  camera.far = size * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

function inferType(url: string): 'glb' | 'stl' | null {
  const lower = url.toLowerCase();
  if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return 'glb';
  if (lower.endsWith('.stl')) return 'stl';
  return null;
}

async function loadModel() {
  if (!modelGroup) return;
  clearModel();
  if (!props.modelUrl) return;

  const type = props.modelType ?? inferType(props.modelUrl);
  if (!type) {
    status.value = 'Unsupported mesh format.';
    return;
  }

  status.value = 'Loading…';
  try {
    if (type === 'glb') {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(props.modelUrl);
      modelGroup.add(gltf.scene);
    } else if (type === 'stl') {
      const loader = new STLLoader();
      const geom = await loader.loadAsync(props.modelUrl);
      const mat = new THREE.MeshStandardMaterial({ color: 0x88aaff, metalness: 0.1, roughness: 0.6 });
      const mesh = new THREE.Mesh(geom, mat);
      modelGroup.add(mesh);
    }
    applyElectronicsStyling();
    frameModel(modelGroup);
    hasModel.value = true;
    status.value = '';
    highlightBySubtask(props.highlightSubtask ?? null);
  } catch (err: any) {
    console.error('Stratum viewport load failed', err);
    status.value = `Failed to load: ${err?.message ?? err}`;
  }
}

onMounted(() => {
  initThree();
  loadModel();
});

onBeforeUnmount(() => {
  if (animationHandle != null) cancelAnimationFrame(animationHandle);
  resizeObserver?.disconnect();
  controls?.dispose();
  clearModel();
  renderer?.dispose();
  if (renderer?.domElement && renderer.domElement.parentElement) {
    renderer.domElement.parentElement.removeChild(renderer.domElement);
  }
  renderer = null;
  scene = null;
  camera = null;
  gridHelper = null;
  axesHelper = null;
});

watch(() => [props.modelUrl, props.modelType], () => loadModel());
watch(() => props.highlightSubtask, v => highlightBySubtask(v ?? null));
</script>

<style scoped>
.stratum-viewport-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  background: #1a1a1d;
  border-radius: 8px;
  overflow: hidden;
}
.viewport-canvas-host { width: 100%; height: 100%; }
.viewport-status,
.viewport-empty {
  position: absolute;
  top: 12px; left: 12px;
  padding: 6px 10px;
  background: rgba(0,0,0,0.55);
  color: #ddd;
  font-size: 12px;
  border-radius: 4px;
  pointer-events: none;
}
.viewport-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
}
.tool-btn {
  background: rgba(20, 20, 22, 0.85);
  color: #d8d8d8;
  border: 1px solid #2a2a2e;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
}
.tool-btn:hover { background: rgba(40, 40, 44, 0.9); }
.tool-btn.active { background: #2d4030; border-color: #4d9e39; color: #b9e8b4; }
</style>
