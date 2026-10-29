import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

/**
 * A procedurally modelled, real-time clinic interior used as the hero "film".
 * Everything is built from primitives and canvas textures: no external assets.
 * Illustrative only — replace with real clinic footage when available.
 */

const C = {
  forest: "#1f3329",
  sage: "#bec5a3",
  cream: "#efe9dc",
  white: "#f4f2ec",
  brass: "#c4a96b",
  oak: "#b9946a",
};

export type ClinicScene = {
  /** Start the slow reveal (exposure ramp + camera push). */
  reveal: (durationMs?: number) => void;
  dispose: () => void;
};

type Opts = { lowPower: boolean; still: boolean };

function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function plankTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d")!;
  const rnd = seeded(7);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 400;
    while (x < 1024) {
      const w = 380 + rnd() * 260;
      const shade = 0.88 + rnd() * 0.18;
      g.fillStyle = `rgb(${Math.round(196 * shade)},${Math.round(160 * shade)},${Math.round(118 * shade)})`;
      g.fillRect(x, (r * 1024) / rows, w, 1024 / rows);
      for (let i = 0; i < 14; i++) {
        g.strokeStyle = `rgba(90,60,30,${0.04 + rnd() * 0.05})`;
        g.lineWidth = 1 + rnd() * 2;
        const y = (r * 1024) / rows + rnd() * (1024 / rows);
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + w * 0.3, y + rnd() * 6 - 3, x + w * 0.6, y + rnd() * 6 - 3, x + w, y + rnd() * 4 - 2);
        g.stroke();
      }
      g.fillStyle = "rgba(60,40,20,0.35)";
      g.fillRect(x, (r * 1024) / rows, 2, 1024 / rows);
      x += w;
    }
    g.fillStyle = "rgba(60,40,20,0.3)";
    g.fillRect(0, (r * 1024) / rows, 1024, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.anisotropy = 4;
  return t;
}

function signTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = C.brass;
  g.textAlign = "center";
  g.textBaseline = "middle";
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "28px";
  g.font = `200 118px ${getComputedStyle(document.documentElement).getPropertyValue("--font-franklin") || "sans-serif"}, "Helvetica Neue", Arial, sans-serif`;
  g.fillText("DENT FLEX", 512, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createClinicScene(canvas: HTMLCanvasElement, opts: Opts): ClinicScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, powerPreference: "high-performance", alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.lowPower ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.still ? 1 : 0;
  renderer.shadowMap.enabled = !opts.lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b120e");
  scene.fog = new THREE.Fog("#2a2f28", 16, 34);

  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 80);
  const camFrom = new THREE.Vector3(4.6, 1.9, 7.6);
  const camTo = new THREE.Vector3(2.4, 1.45, 3.1);
  const lookFrom = new THREE.Vector3(-0.6, 1.2, -2.6);
  const lookTo = new THREE.Vector3(-0.2, 1.05, -2.0);
  camera.position.copy(opts.still ? camTo : camFrom);

  const disposables: { dispose: () => void }[] = [];
  const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
    disposables.push(m);
    return m;
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], shadow = true) => {
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, r = 0) => (r ? new RoundedBoxGeometry(w, h, d, 4, r) : new THREE.BoxGeometry(w, h, d));

  // ── Room shell (x: -7..7, z: -6..6, y: 0..3.4)
  const floorTex = plankTexture();
  disposables.push(floorTex);
  add(new THREE.PlaneGeometry(14, 12), mat("#ffffff", { map: floorTex, roughness: 0.55 }), [0, 0, 0], [-Math.PI / 2, 0, 0], false);
  const wall = mat(C.cream, { roughness: 0.92 });
  add(box(14, 3.4, 0.2), wall, [0, 1.7, -6.1], [0, 0, 0], false); // back
  add(box(0.2, 3.4, 12), wall, [7.1, 1.7, 0], [0, 0, 0], false); // right
  add(new THREE.PlaneGeometry(14, 12), mat(C.white, { roughness: 1 }), [0, 3.4, 0], [Math.PI / 2, 0, 0], false); // ceiling
  // Left wall with a tall window opening (z -4.5..1.5, y 0.5..3.0)
  add(box(0.2, 0.5, 12), wall, [-7.1, 0.25, 0], [0, 0, 0], false);
  add(box(0.2, 0.4, 12), wall, [-7.1, 3.2, 0], [0, 0, 0], false);
  add(box(0.2, 2.5, 1.5), wall, [-7.1, 1.75, -5.25], [0, 0, 0], false);
  add(box(0.2, 2.5, 4.5), wall, [-7.1, 1.75, 3.75], [0, 0, 0], false);
  // Window glow + mullions
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff4dc").multiplyScalar(4), fog: false });
  disposables.push(glow);
  add(new THREE.PlaneGeometry(6, 2.5), glow, [-7.25, 1.75, -1.5], [0, Math.PI / 2, 0], false);
  const mullion = mat("#2b2f2a", { roughness: 0.5, metalness: 0.4 });
  for (const z of [-4.5, -3, -1.5, 0, 1.5]) add(box(0.08, 2.5, 0.05), mullion, [-7.0, 1.75, z], [0, 0, 0], false);
  add(box(0.08, 0.05, 6), mullion, [-7.0, 2.2, -1.5], [0, 0, 0], false);
  // Skirting — stops at the feature wall so it never overlaps the slat backing (z-fighting).
  const skirting = mat(C.white);
  for (const x of [-4.75, 4.75]) add(box(4.5, 0.08, 0.04), skirting, [x, 0.04, -5.98], [0, 0, 0], false);

  // ── Feature wall: forest-green vertical slats with a brass sign
  const slatMat = mat(C.forest, { roughness: 0.6 });
  // Slats and backing are lifted 1 cm off the floor and kept at distinct depths to avoid coplanar faces.
  for (let i = 0; i < 26; i++) add(box(0.09, 3.37, 0.08), slatMat, [-2.4 + i * 0.19, 1.695, -5.9], [0, 0, 0], false);
  add(box(5.0, 3.37, 0.03), mat("#16251d", { roughness: 0.9 }), [0, 1.695, -5.965], [0, 0, 0], false);
  // Plinth in front of the slat ends: a clean line where the feature wall meets the floor.
  add(box(5.0, 0.1, 0.14), mat("#132019", { roughness: 0.7 }), [0, 0.05, -5.88], [0, 0, 0], false);
  const signMap = signTexture();
  disposables.push(signMap);
  const signMat = new THREE.MeshStandardMaterial({ map: signMap, transparent: true, emissive: new THREE.Color(C.brass), emissiveMap: signMap, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.35 });
  disposables.push(signMat);
  add(new THREE.PlaneGeometry(2.6, 0.65), signMat, [0, 2.45, -5.84], [0, 0, 0], false);

  // ── Cabinetry along the back wall (left and right of the feature wall)
  const cabinetFront = mat(C.forest, { roughness: 0.45 });
  const quartz = mat("#f3f1ea", { roughness: 0.25, metalness: 0.05 });
  const brass = mat(C.brass, { roughness: 0.3, metalness: 0.9 });
  for (const cx of [-4.7, 4.7]) {
    add(box(4.4, 0.88, 0.62, 0.02), cabinetFront, [cx, 0.46, -5.65]);
    add(box(4.5, 0.05, 0.68), quartz, [cx, 0.925, -5.63]);
    for (let d = 0; d < 4; d++) add(box(0.5, 0.015, 0.02), brass, [cx - 1.6 + d * 1.07, 0.78, -5.33], [0, 0, 0], false);
    add(box(4.4, 0.04, 0.32), mat("#e6dfcf"), [cx, 1.95, -5.82]); // open shelf
  }
  // Shelf objects
  const rnd = seeded(42);
  for (let i = 0; i < 10; i++) {
    const cx = (i < 5 ? -4.7 : 4.7) - 1.6 + (i % 5) * 0.8;
    const h = 0.12 + rnd() * 0.18;
    add(new THREE.CylinderGeometry(0.06 + rnd() * 0.05, 0.07, h, 24), mat(rnd() > 0.5 ? C.white : C.sage, { roughness: 0.4 }), [cx, 1.97 + h / 2, -5.82]);
  }

  // ── Dental chair
  const chair = new THREE.Group();
  const shell = mat(C.white, { roughness: 0.3, metalness: 0.1 });
  const upholstery = mat(C.sage, { roughness: 0.85 });
  const parts: [THREE.BufferGeometry, THREE.Material, [number, number, number], [number, number, number]][] = [
    [new THREE.CylinderGeometry(0.42, 0.48, 0.1, 48), shell, [0, 0.05, 0], [0, 0, 0]],
    [new THREE.CylinderGeometry(0.13, 0.16, 0.45, 32), shell, [0, 0.32, 0], [0, 0, 0]],
    [box(0.72, 0.16, 0.95, 0.06), shell, [0, 0.58, 0], [0, 0, 0]],
    [box(0.66, 0.13, 0.9, 0.06), upholstery, [0, 0.71, 0.02], [0, 0, 0]],
    [box(0.6, 0.12, 0.8, 0.05), upholstery, [0, 0.55, 0.78], [-0.42, 0, 0]],
    [box(0.64, 0.13, 1.0, 0.06), upholstery, [0, 1.02, -0.78], [1.05, 0, 0]],
    [box(0.34, 0.1, 0.3, 0.05), upholstery, [0, 1.42, -1.17], [1.25, 0, 0]],
    [box(0.1, 0.06, 0.55, 0.03), shell, [0.4, 0.86, -0.05], [0, 0, 0]],
  ];
  for (const [g, m, p, r] of parts) {
    disposables.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...p);
    mesh.rotation.set(...r);
    mesh.castShadow = mesh.receiveShadow = true;
    chair.add(mesh);
  }
  chair.position.set(-0.3, 0, -2.4);
  chair.rotation.y = -0.55;
  scene.add(chair);

  // Instrument tray on a pole
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 16), brass, [0.75, 0.48, -1.55]);
  add(box(0.55, 0.05, 0.36, 0.02), shell, [0.75, 0.98, -1.55]);
  add(new THREE.CylinderGeometry(0.22, 0.25, 0.04, 32), shell, [0.75, 0.02, -1.55]);

  // Operating light: ceiling arm + head + spotlight
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 24), shell, [-0.2, 3.37, -2.0]);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 12), shell, [-0.2, 2.95, -2.0]);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 12), shell, [-0.38, 2.5, -2.15], [0, 0, 0.9]);
  const head = add(new THREE.SphereGeometry(0.3, 32, 16), shell, [-0.6, 2.22, -2.3]);
  head.scale.set(1, 0.32, 0.6);
  const lampFace = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fffaf0").multiplyScalar(1.6) });
  disposables.push(lampFace);
  const face = add(new THREE.CircleGeometry(0.2, 32), lampFace, [-0.6, 2.15, -2.3], [Math.PI / 2, 0, 0], false);
  face.scale.set(1, 0.6, 1);
  const spot = new THREE.SpotLight("#fff6e8", 14, 6, 0.5, 0.6, 1.4);
  spot.position.set(-0.6, 2.15, -2.3);
  spot.target.position.set(-0.3, 0.9, -2.6);
  spot.castShadow = !opts.lowPower;
  spot.shadow.bias = -0.0005;
  spot.shadow.normalBias = 0.03;
  scene.add(spot, spot.target);

  // Ceiling light strips
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fffaf2").multiplyScalar(1.4) });
  disposables.push(stripMat);
  for (const x of [-3.5, 3.5]) add(box(0.08, 0.02, 7), stripMat, [x, 3.39, -1.5], [0, 0, 0], false);

  // Monitor on an arm
  add(box(0.62, 0.38, 0.03, 0.01), mat("#121614", { roughness: 0.2, metalness: 0.3 }), [-1.35, 1.75, -2.85], [0, 0.6, 0]);
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 12), shell, [-1.42, 0.85, -2.95]);

  // Plants
  const leafMat = mat("#2f4a33", { roughness: 0.7, side: THREE.DoubleSide });
  const potMat = mat("#ded6c4", { roughness: 0.6 });
  const leafGeo = new THREE.SphereGeometry(1, 12, 8);
  disposables.push(leafGeo);
  for (const [px, pz, s] of [[-6.0, -4.9, 1.2], [6.1, 1.2, 1], [-5.8, 3.5, 0.85]] as const) {
    add(new THREE.CylinderGeometry(0.28 * s, 0.22 * s, 0.6 * s, 32), potMat, [px, 0.3 * s, pz]);
    for (let i = 0; i < 22; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = rnd() * Math.PI * 2;
      const tilt = 0.25 + rnd() * 0.9;
      leaf.scale.set(0.07 * s, (0.38 + rnd() * 0.3) * s, 0.015 * s);
      leaf.position.set(px + Math.cos(a) * 0.12 * s, (0.75 + rnd() * 0.5) * s, pz + Math.sin(a) * 0.12 * s);
      leaf.rotation.set(Math.sin(a) * tilt, a, Math.cos(a) * tilt);
      leaf.castShadow = true;
      scene.add(leaf);
    }
  }

  // Waiting bench by the window
  add(box(2.2, 0.42, 0.55, 0.08), mat(C.sage, { roughness: 0.9 }), [-6.3, 0.35, 2.6], [0, Math.PI / 2, 0]);
  add(box(2.3, 0.12, 0.6, 0.03), mat(C.oak, { roughness: 0.6 }), [-6.3, 0.08, 2.6], [0, Math.PI / 2, 0]);

  // ── Lighting
  scene.add(new THREE.HemisphereLight("#f5f1e8", "#4a3e30", 0.8));
  // Low enough to pass through the window (top at y=3.0) and paint the floor.
  const sun = new THREE.DirectionalLight("#ffe2b8", 3.4);
  sun.position.set(-14, 5.2, -2.5);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = !opts.lowPower;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03; // removes striped shadow acne on thin geometry
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const windowFill = new THREE.RectAreaLight("#fff1d6", 3.2, 6, 2.5);
  windowFill.position.set(-6.9, 1.75, -1.5);
  windowFill.lookAt(0, 1.4, -1.5);
  scene.add(windowFill);
  const warm = new THREE.PointLight("#ffd9a6", 1.4, 9, 2);
  warm.position.set(0, 2.8, -4.8);
  scene.add(warm);

  // ── Dust motes drifting in the window light
  const moteCount = opts.lowPower ? 120 : 320;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = -6.5 + rnd() * 6;
    motePos[i * 3 + 1] = 0.3 + rnd() * 2.9;
    motePos[i * 3 + 2] = -4.5 + rnd() * 6;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ color: "#fff3d6", size: 0.018, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  disposables.push(moteGeo, moteMat);
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  // ── Sizing
  const resize = () => {
    const parent = canvas.parentElement!;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: widen the lens so the chair stays in frame.
    camera.fov = camera.aspect < 1 ? 58 : 36;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement!);
  resize();

  // ── Animation
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  let revealStart = opts.still ? -Infinity : Infinity;
  let revealMs = 6000;
  const moveMs = 22000;
  let raf = 0;
  let visible = true;
  const look = new THREE.Vector3();
  const t0 = performance.now();

  const frame = (now: number) => {
    const t = now - revealStart;
    const e = Math.min(1, Math.max(0, t / revealMs));
    renderer.toneMappingExposure = opts.still ? 1.15 : 1.15 * ease(e);
    const m = opts.still ? 1 : ease(Math.min(1, Math.max(0, t / moveMs)));
    camera.position.lerpVectors(camFrom, camTo, m);
    look.lerpVectors(lookFrom, lookTo, m);
    if (!opts.still) {
      const s = (now - t0) / 1000;
      camera.position.x += Math.sin(s * 0.12) * 0.12;
      camera.position.y += Math.sin(s * 0.17) * 0.04;
      const p = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < moteCount; i++) {
        let y = p.getY(i) + 0.0009 + Math.sin(s + i) * 0.0004;
        if (y > 3.2) y = 0.3;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(s * 0.5 + i * 1.7) * 0.0006);
      }
      p.needsUpdate = true;
    }
    camera.lookAt(look);
    renderer.render(scene, camera);
  };

  const loop = (now: number) => {
    frame(now);
    if (visible && !opts.still) raf = requestAnimationFrame(loop);
  };

  const io = new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting && document.visibilityState === "visible";
    if (visible && !was && !opts.still) raf = requestAnimationFrame(loop);
  });
  io.observe(canvas);
  const onVis = () => {
    const was = visible;
    visible = document.visibilityState === "visible";
    if (visible && !was && !opts.still) raf = requestAnimationFrame(loop);
  };
  document.addEventListener("visibilitychange", onVis);

  if (opts.still) frame(performance.now());
  else raf = requestAnimationFrame(loop);

  return {
    reveal(durationMs = 6000) {
      revealMs = durationMs;
      revealStart = performance.now();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
