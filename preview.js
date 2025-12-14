import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import * as JSCAD from "https://esm.sh/@jscad/modeling@2.12.5?bundle&target=es2022";
import * as STL from "https://esm.sh/@jscad/stl-serializer@2.1.21?bundle&target=es2022";

const { primitives, booleans, transforms } = JSCAD;

const fallbackCode = `// 20 mm cube with 2 mm fillets on all edges
// OpenJSCAD v2 (@jscad/modeling)
//
// NOTE: imports are ignored in this preview; primitives are provided by the sandbox.
// import { roundedCuboid } from '@jscad/modeling'.primitives

const size = 20
const filletRadius = 2
const segments = 32

export const main = () => {
  return roundedCuboid({
    size: [size, size, size],
    roundRadius: filletRadius,
    segments
  })
}`;

// Mount
const $app = document.getElementById("app");
if (!$app) throw new Error("Missing #app element in HTML.");

$app.innerHTML = `
  <div class="wrap">
    <div class="panel">
      <h1>OpenJSCAD v2 code</h1>
      <div id="codeHost"></div>
      <div class="row">
        <button id="togglePanel">Hide panel</button>
        <button id="render">Render</button>
        <button id="reset">Reset view</button>
        <button id="copyStl">Copy STL (ASCII)</button>
        <div class="status" id="status">Ready.</div>
      </div>
      <div class="tiny">
        Notes: this preview supports <code>main()</code> returning a <code>geom3</code> or an array of <code>geom3</code>.
        Imports in the textarea are ignored; primitives are provided by the sandbox.
      </div>
    </div>

    <div class="view" id="view">
      <button class="panel-handle" id="showPanel">Show panel</button>
      <div class="hint">Drag: orbit · Wheel: zoom · Right-drag: pan</div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <div class="modal-title" id="modalTitle">STL output (ASCII)</div>
        <div class="modal-actions">
          <button id="modalSelect" title="Select all">Select all</button>
          <button id="modalClose" title="Close">Close</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="tiny">Clipboard write was blocked. Select and copy manually (<span class="kbd">Ctrl/Cmd+C</span>).</div>
        <textarea id="stlOut" spellcheck="false"></textarea>
      </div>
    </div>
  </div>
`;

// Reuse textarea from HTML (source-of-truth for GPT edits)
function ensureCodeTextarea() {
  let $code = document.getElementById("code");
  if (!$code) {
    // Fallback: create it if HTML didn’t provide one
    $code = document.createElement("textarea");
    $code.id = "code";
  }

  // Ensure it is visible and styled via existing CSS selector textarea#code
  $code.style.display = "";
  $code.removeAttribute("hidden");

  // Move into the panel host so user can edit
  const $host = document.getElementById("codeHost");
  $host.appendChild($code);

  // Seed fallback only if empty
  if (!$code.value || !$code.value.trim()) $code.value = fallbackCode;

  return $code;
}

const $wrap = document.querySelector(".wrap");
const $status = document.getElementById("status");
const $view = document.getElementById("view");
const $modal = document.getElementById("modal");
const $stlOut = document.getElementById("stlOut");
const $code = ensureCodeTextarea();

function setStatus(msg) {
  $status.textContent = msg;
}

function openModalWithText(text) {
  $stlOut.value = text;
  $modal.style.display = "flex";
  setTimeout(() => {
    $stlOut.focus();
    $stlOut.select();
  }, 0);
}

function closeModal() {
  $modal.style.display = "none";
}

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalSelect").addEventListener("click", () => {
  $stlOut.focus();
  $stlOut.select();
});
$modal.addEventListener("click", (e) => {
  if (e.target === $modal) closeModal();
});

function hidePanel() {
  $wrap.classList.add("panel-hidden");
  requestAnimationFrame(resize);
}
function showPanel() {
  $wrap.classList.remove("panel-hidden");
  requestAnimationFrame(resize);
}

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if ($modal.style.display === "flex") {
    closeModal();
    return;
  }
  if ($wrap.classList.contains("panel-hidden")) showPanel();
});

// Load model from ?model=... if present
async function loadModelFromQuery() {
  const modelUrl = new URLSearchParams(location.search).get("model");
  if (!modelUrl) return false;
  try {
    const res = await fetch(modelUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    $code.value = await res.text();
    setStatus("Loaded model from URL.");
    return true;
  } catch (err) {
    console.warn("Failed to load model:", err);
    setStatus("Failed to load model URL — using existing code.");
    return false;
  }
}

const roundedCuboid = primitives?.roundedCuboid;
if (typeof roundedCuboid !== "function") {
  setStatus(
    "Error: primitives.roundedCuboid missing in @jscad/modeling bundle.",
  );
}
await loadModelFromQuery();

// --- Three.js scene setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize($view.clientWidth, $view.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
$view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f19);

const camera = new THREE.PerspectiveCamera(
  45,
  $view.clientWidth / $view.clientHeight,
  0.01,
  5000,
);
camera.position.set(60, 45, 60);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.0));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(80, 120, 60);
scene.add(dirLight);

const grid = new THREE.GridHelper(200, 20, 0x2a3550, 0x1a2236);
grid.position.y = -12;
scene.add(grid);

let currentMesh = null;

function resize() {
  const w = $view.clientWidth;
  const h = $view.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", resize);

// --- Helpers ---
const td = new TextDecoder();
function toText(parts) {
  const arr = Array.isArray(parts) ? parts : [parts];
  return arr
    .map((p) => {
      if (typeof p === "string") return p;
      if (p instanceof ArrayBuffer) return td.decode(p);
      if (ArrayBuffer.isView(p))
        return td.decode(
          p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength),
        );
      return String(p);
    })
    .join("");
}

function isGeom3Like(g) {
  return !!(
    g &&
    (Array.isArray(g.polygons) || Array.isArray(g.geometry?.polygons))
  );
}
function getPolygons(g) {
  return g?.polygons ?? g?.geometry?.polygons ?? [];
}
function validateGeom3Polygons(g) {
  const polys = getPolygons(g);
  if (!Array.isArray(polys) || polys.length === 0)
    throw new Error("geom3 has no polygons (empty or invalid solid).");

  let vertexCount = 0;
  for (const p of polys) {
    const verts = p?.vertices;
    if (!Array.isArray(verts) || verts.length < 3) continue;
    for (const v of verts) {
      if (!Array.isArray(v) || v.length !== 3) continue;
      if (
        !Number.isFinite(v[0]) ||
        !Number.isFinite(v[1]) ||
        !Number.isFinite(v[2])
      ) {
        throw new Error("geom3 has non-finite vertex coordinates.");
      }
      vertexCount++;
    }
  }
  if (vertexCount === 0)
    throw new Error("geom3 polygons contain no valid vertices.");
}

function geom3ToThreeBufferGeometry(g) {
  validateGeom3Polygons(g);
  const polys = getPolygons(g);

  const positions = [];
  const normals = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  for (const p of polys) {
    const verts = p?.vertices;
    if (!verts || verts.length < 3) continue;

    for (let i = 1; i < verts.length - 1; i++) {
      const a = verts[0],
        b = verts[i],
        c = verts[i + 1];
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);

      vA.set(a[0], a[1], a[2]);
      vB.set(b[0], b[1], b[2]);
      vC.set(c[0], c[1], c[2]);
      cb.subVectors(vC, vB);
      ab.subVectors(vA, vB);
      cb.cross(ab).normalize();
      normals.push(cb.x, cb.y, cb.z, cb.x, cb.y, cb.z, cb.x, cb.y, cb.z);
    }
  }

  if (positions.length === 0)
    throw new Error(
      "Triangulation produced no triangles (unsupported polygons).",
    );

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function fitCameraToObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  controls.target.copy(center);

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitDist = maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360));
  const padding = 1.25;
  const dir = new THREE.Vector3(1, 0.8, 1).normalize();

  camera.position.copy(center).addScaledVector(dir, fitDist * padding);
  camera.near = Math.max(0.01, fitDist / 100);
  camera.far = fitDist * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

// --- Minimal compiler for common OpenJSCAD v2 patterns ---
function transpileJscadToRunnable(source) {
  let s = source.replace(/^\s*import\s+.*?;?\s*$/gm, "");
  s = s.replace(
    /export\s+const\s+main\s*=\s*\(\s*\)\s*=>\s*\{/m,
    "function main(){",
  );
  s = s.replace(
    /export\s+const\s+main\s*=\s*\([^)]*\)\s*=>\s*\{/m,
    "function main(){",
  );
  s = s.replace(/^\s*export\s+/gm, "");
  return s;
}

function runJscad(source) {
  const runnable = transpileJscadToRunnable(source);

  const sandbox = {
    // Expose a small set; extend as you add primitives
    roundedCuboid,
    primitives,
    booleans,
    transforms,
    union: booleans?.union,
    translate: transforms?.translate,
    console,
  };

  const fn = new Function(
    ...Object.keys(sandbox),
    `${runnable}\n\nif (typeof main !== 'function') throw new Error('No main() export found.');\nreturn main();`,
  );

  return fn(...Object.values(sandbox));
}

function normalizeResult(result) {
  if (isGeom3Like(result)) return result;

  if (Array.isArray(result)) {
    const geoms = result.filter(isGeom3Like);
    if (geoms.length === 0)
      throw new Error(
        "main() returned an array, but it did not contain any geom3 solids.",
      );
    if (typeof booleans?.union === "function") return booleans.union(geoms);
    return geoms[0];
  }

  if (result && Array.isArray(result.solids))
    return normalizeResult(result.solids);

  throw new Error("Expected main() to return a geom3 (or an array of geom3).");
}

function renderCode() {
  setStatus("Rendering…");
  try {
    const raw = runJscad($code.value);
    const solid = normalizeResult(raw);
    validateGeom3Polygons(solid);

    const geometry = geom3ToThreeBufferGeometry(solid);

    if (currentMesh) {
      currentMesh.geometry.dispose();
      currentMesh.material.dispose();
      scene.remove(currentMesh);
      currentMesh = null;
    }

    const material = new THREE.MeshStandardMaterial({
      metalness: 0.05,
      roughness: 0.55,
    });
    currentMesh = new THREE.Mesh(geometry, material);
    scene.add(currentMesh);
    fitCameraToObject(currentMesh);
    setStatus("Done.");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message ?? String(err)}`);
  }
}

function serializeAsciiStlFromCode(source) {
  const raw = runJscad(source);
  const solid = normalizeResult(raw);
  if (!isGeom3Like(solid))
    throw new Error("STL export requires a geom3 solid.");
  validateGeom3Polygons(solid);

  const serialize = STL?.serialize;
  if (typeof serialize !== "function")
    throw new Error("STL serializer unavailable (STL.serialize not found).");

  const out = serialize({ binary: false }, [solid]);
  const text = toText(out);

  if (
    !/\bsolid\b/i.test(text) ||
    !/\bendsolid\b/i.test(text) ||
    text.length < 100
  ) {
    throw new Error("STL serialization produced empty/invalid output.");
  }
  return text;
}

async function copyStl() {
  setStatus("Serializing STL (ASCII)…");
  try {
    const text = serializeAsciiStlFromCode($code.value);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard API not available.");
      await navigator.clipboard.writeText(text);
      setStatus("STL copied to clipboard (ASCII).");
    } catch {
      openModalWithText(text);
      setStatus("Clipboard blocked — opened STL text for manual copy.");
    }
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err?.message ?? String(err)}`);
  }
}

// Buttons
document.getElementById("togglePanel").addEventListener("click", hidePanel);
document.getElementById("showPanel").addEventListener("click", showPanel);
document.getElementById("render").addEventListener("click", renderCode);
document.getElementById("reset").addEventListener("click", () => {
  if (currentMesh) fitCameraToObject(currentMesh);
});
document.getElementById("copyStl").addEventListener("click", copyStl);

// Initial render
renderCode();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
