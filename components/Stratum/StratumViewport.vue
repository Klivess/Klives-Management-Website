<template>
  <div class="stratum-viewport-root" ref="rootEl">
    <div class="viewport-canvas-host" ref="canvasHost"></div>
    <div v-if="status" class="viewport-status">{{ status }}</div>
    <div v-if="!status && !hasModel" class="viewport-empty">No mesh artifact yet — generate one with the agents (coming in later phases).</div>
  </div>
</template>

<script setup lang="ts">
/**
 * Stratum viewport. Renders GLB/STL meshes with three.js.
 *
 * Phase 1 supports GLB and STL only. STEP support (via occt-import-js) is deferred
 * to Phase 3 once the Mechanical Agent actually emits STEP files.
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const props = defineProps<{
  /** Public URL or blob URL for the mesh to load. */
  modelUrl?: string | null;
  /** 'glb' | 'stl'. If omitted, inferred from the URL extension. */
  modelType?: 'glb' | 'stl' | null;
}>();

const rootEl = ref<HTMLElement | null>(null);
const canvasHost = ref<HTMLElement | null>(null);
const status = ref('');
const hasModel = ref(false);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let modelGroup: THREE.Group | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationHandle: number | null = null;

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

  const grid = new THREE.GridHelper(500, 50, 0x444444, 0x2a2a2a);
  scene.add(grid);
  const axes = new THREE.AxesHelper(50);
  scene.add(axes);

  // CAD-style lighting rig: cool sky / warm ground hemisphere fill plus four
  // directional lights from opposing octants so every face of the model is lit
  // roughly evenly. A faint backlight prevents the silhouette from going black.
  scene.add(new THREE.HemisphereLight(0xdfe7ef, 0x202428, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const keyAngles: Array<[number, number, number, number]> = [
    [ 200,  250,  200, 0.55], // key (upper front-right)
    [-200,  220,  150, 0.40], // fill (upper front-left)
    [ 150,  180, -220, 0.35], // rim (upper back-right)
    [-160,  100, -200, 0.30], // back fill
    [   0, -180,    0, 0.20], // soft underlight to lift shadows
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
  // Properly dispose of geometries/materials to avoid GPU leaks across reloads.
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
    frameModel(modelGroup);
    hasModel.value = true;
    status.value = '';
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
});

watch(() => [props.modelUrl, props.modelType], () => loadModel());
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
</style>
