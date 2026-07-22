// Living knowledge graph renderer.
// Desktop  -> three.js WebGL points + faint edges, camera flythrough on scroll.
// Mobile   -> lightweight 2D canvas projection (fewer nodes, gentle spin).
// Reduced  -> single static frame, no animation.
//
// Data: /public/data/graph.json ({ nodes:[{id,type,x,y,z,val}], links:[{source,target}] })
// Positions are pre-baked; a real Neo4j export without x/y/z would need runtime layout.

type GNode = { id: string; type: 'opinion' | 'statute' | 'precedent'; label: string; cluster: string; val: number; x: number; y: number; z: number };
type GLink = { source: string; target: string; type: string };
type Graph = { meta: { featuredPath: string[] }; nodes: GNode[]; links: GLink[] };

const COLORS: Record<GNode['type'], number> = {
  opinion: 0x00e599,
  precedent: 0x5fffc4,
  statute: 0xb8ffe6,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// One fetch + one normalisation pass shared by every graph instance on the page
// (hero canvas and the featured-media canvas both want the same 94 kB payload).
let graphData: Promise<Graph> | null = null;
function loadGraph(): Promise<Graph> {
  graphData ??= fetch('/data/graph.json')
    .then((r) => r.json())
    .then((graph: Graph) => {
      // Center + scale baked coords into a tidy radius.
      const target = 120;
      let maxR = 0;
      for (const n of graph.nodes) maxR = Math.max(maxR, Math.hypot(n.x, n.y, n.z));
      const scale = target / (maxR || 1);
      for (const n of graph.nodes) {
        n.x *= scale;
        n.y *= scale;
        n.z *= scale;
      }
      return graph;
    });
  return graphData;
}

export async function mountGraph(canvas: HTMLCanvasElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 767px)').matches;

  // Desktop needs three.js; start that chunk downloading alongside the data
  // instead of after it (the import inside mount3D then resolves from cache).
  const three = mobile ? null : import('three');
  const graph = await loadGraph();

  if (mobile) return mount2D(canvas, graph, reduced);
  await three;
  return mount3D(canvas, graph, reduced);
}

// ---------------------------------------------------------------- 3D (desktop)
async function mount3D(canvas: HTMLCanvasElement, graph: Graph, reduced: boolean) {
  const THREE = await import('three');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const size = () => renderer.setSize(innerWidth, innerHeight, false);
  size();

  const scene = new THREE.Scene();
  const Z0 = 250; // start distance
  const ZIN = 78; // pushed-in distance
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 1, 2400);
  camera.position.set(0, 0, Z0);

  const group = new THREE.Group();
  scene.add(group);

  // --- glow sprite ---
  const sprite = makeGlowTexture(THREE);

  // --- node points (per-node size + color via ShaderMaterial) ---
  const N = graph.nodes.length;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  const index = new Map<string, number>();
  const c = new THREE.Color();
  graph.nodes.forEach((n, i) => {
    index.set(n.id, i);
    pos[i * 3] = n.x;
    pos[i * 3 + 1] = n.y;
    pos[i * 3 + 2] = n.z;
    c.setHex(COLORS[n.type]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    siz[i] = n.val;
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));

  const uniforms = {
    uTex: { value: sprite },
    uSize: { value: 2.1 },
    uOpacity: { value: 0 }, // fades in on load
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      uniform float uSize;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uSize * (200.0 / -mv.z), 1.0, 90.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vColor, 1.0) * t * uOpacity;
      }`,
  });
  group.add(new THREE.Points(geo, mat));

  // --- edges ---
  const lp: number[] = [];
  for (const l of graph.links) {
    const a = index.get(l.source);
    const b = index.get(l.target);
    if (a === undefined || b === undefined) continue;
    lp.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
  }
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
  const lmat = new THREE.LineBasicMaterial({ color: 0x00e599, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(new THREE.LineSegments(lgeo, lmat));

  // --- interaction state ---
  const pointer = { x: 0, y: 0 };
  const rot = { x: 0, y: 0 };
  if (!reduced) {
    addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / innerHeight - 0.5) * 2;
    });
  }

  let heroEl = document.getElementById('hero');
  const heroH = () => (heroEl?.offsetHeight || innerHeight);

  addEventListener('resize', () => {
    size();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // Fade-in on load
  let last = performance.now();
  let intro = 0;

  let running = true;
  const io = new IntersectionObserver(
    ([e]) => { running = e.isIntersecting; if (running && !reduced) requestAnimationFrame(frame); },
    { threshold: 0 }
  );
  if (heroEl) io.observe(heroEl);

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    intro = Math.min(1, intro + dt * 0.6);
    const introE = 1 - Math.pow(1 - intro, 3);

    // scroll progress across the hero
    const p = clamp01(scrollY / heroH());

    // camera pushes in, then everything recedes/fades as content takes over
    const pushT = clamp01(p / 0.85);
    camera.position.z = lerp(Z0, ZIN, easeInOut(pushT));
    const fade = 1 - clamp01((p - 0.55) / 0.4); // fade out over back half
    uniforms.uOpacity.value = introE * (0.55 + 0.45 * (1 - pushT)) * fade;
    lmat.opacity = introE * 0.05 * fade;

    // drift + mouse parallax: steady y-spin baseline, eased pointer offset
    rot.y += 0.0007;
    const tx = -pointer.y * 0.15;
    const ty = pointer.x * 0.15;
    group.rotation.y = rot.y + ty;
    group.rotation.x = lerp(group.rotation.x, tx - p * 0.2, 0.06);

    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    if (running && !reduced) requestAnimationFrame(frame);
  }

  if (reduced) {
    // single settled frame
    intro = 1;
    uniforms.uOpacity.value = 0.7;
    lmat.opacity = 0.05;
    group.rotation.set(0.2, 0.5, 0);
    renderer.render(scene, camera);
  } else {
    requestAnimationFrame(frame);
  }

  function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
}

// ---------------------------------------------------------------- graph media
// A contained (non-fixed) instance for the Legal RAG featured section:
// zoomed into the cluster around the featured multi-hop path, which lights up
// emerald as the section scrolls through the viewport.
export async function mountGraphMedia(canvas: HTMLCanvasElement, container: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [THREE, graph] = await Promise.all([import('three'), loadGraph()]);

  const idIndex = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const path = (graph.meta.featuredPath || []).filter((id) => idIndex.has(id));
  const pathSet = new Set(path);

  // centre the cluster: bake a focus offset so rotation spins around the path
  const focus = new THREE.Vector3();
  path.forEach((id) => { const n = graph.nodes[idIndex.get(id)!]; focus.add(new THREE.Vector3(n.x, n.y, n.z)); });
  if (path.length) focus.multiplyScalar(1 / path.length);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 1, 2000);
  camera.position.set(0, 0, 120);
  const group = new THREE.Group();
  scene.add(group);

  const fit = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };

  // nodes (positions baked with focus offset so cluster sits at origin)
  const N = graph.nodes.length;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
  const c = new THREE.Color();
  graph.nodes.forEach((n, i) => {
    pos[i * 3] = n.x - focus.x; pos[i * 3 + 1] = n.y - focus.y; pos[i * 3 + 2] = n.z - focus.z;
    const hi = pathSet.has(n.id);
    c.setHex(hi ? 0xffffff : COLORS[n.type]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    siz[i] = hi ? n.val * 2.4 : n.val;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  const uniforms = { uTex: { value: makeGlowTexture(THREE) }, uSize: { value: 2.0 }, uOpacity: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uSize; varying vec3 vColor;
      void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=clamp(aSize*uSize*(200.0/-mv.z),1.0,120.0); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uOpacity; varying vec3 vColor;
      void main(){ gl_FragColor=vec4(vColor,1.0)*texture2D(uTex,gl_PointCoord)*uOpacity; }`,
  });
  group.add(new THREE.Points(geo, mat));

  // base edges (faint)
  const base: number[] = [];
  for (const l of graph.links) {
    const a = idIndex.get(l.source), b = idIndex.get(l.target);
    if (a === undefined || b === undefined) continue;
    base.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3));
  group.add(new THREE.LineSegments(bgeo, new THREE.LineBasicMaterial({ color: 0x00e599, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })));

  // path edges (bright, drawn in on scroll)
  const pp: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = idIndex.get(path[i])!, b = idIndex.get(path[i + 1])!;
    pp.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pp), 3));
  const pmat = new THREE.LineBasicMaterial({ color: 0x5fffc4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  group.add(new THREE.LineSegments(pgeo, pmat));

  fit();
  new ResizeObserver(fit).observe(canvas);

  const scrollProgress = () => {
    const r = container.getBoundingClientRect();
    return clamp01((innerHeight - r.top) / (innerHeight + r.height));
  };

  let running = true;
  const io = new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running && !reduced) requestAnimationFrame(frame); }, { threshold: 0 });
  io.observe(canvas);

  let t = 0;
  function frame() {
    t += 0.0016;
    group.rotation.y = 0.5 + t;
    group.rotation.x = Math.sin(t * 0.5) * 0.12 - 0.1;
    const p = scrollProgress();
    // path pulses in as the section centres in view
    const lit = clamp01((p - 0.2) / 0.5);
    pmat.opacity = lit * (0.55 + 0.45 * Math.sin(t * 6));
    renderer.render(scene, camera);
    if (running && !reduced) requestAnimationFrame(frame);
  }

  if (reduced) { pmat.opacity = 0.7; renderer.render(scene, camera); }
  else requestAnimationFrame(frame);
}

function makeGlowTexture(THREE: typeof import('three')) {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- 2D (mobile)
function mount2D(canvas: HTMLCanvasElement, graph: Graph, reduced: boolean) {
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(devicePixelRatio, 2);
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  addEventListener('resize', resize);

  // subsample for performance
  const keep = new Set(graph.nodes.filter((_, i) => i % 2 === 0).map((n) => n.id));
  const nodes = graph.nodes.filter((n) => keep.has(n.id));
  const links = graph.links.filter((l) => keep.has(l.source) && keep.has(l.target));
  const idx = new Map(nodes.map((n, i) => [n.id, i]));

  // scroll progress runs across the full (180vh) hero, matching the 3D camera
  const heroEl = document.getElementById('hero');
  const heroH = () => heroEl?.offsetHeight || innerHeight;

  let ry = 0.4;
  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // scroll → push-in (zoom) then fade, mirroring the desktop flythrough
    const p = clamp01(scrollY / heroH());
    const pushT = clamp01(p / 0.85);
    const ease = pushT < 0.5 ? 2 * pushT * pushT : 1 - Math.pow(-2 * pushT + 2, 2) / 2;
    const zoom = 1 + ease * 2.4; // graph scales up as the camera pushes in
    const fade = 1 - clamp01((p - 0.55) / 0.4); // recede over the back half

    const cx = w / 2, cy = h * 0.42;
    const R = (Math.min(w, h) * 0.34 / 120) * zoom;
    const cos = Math.cos(ry), sin = Math.sin(ry);

    const proj = nodes.map((n) => {
      const x = n.x * cos - n.z * sin;
      return { sx: cx + x * R, sy: cy + n.y * R, z: n.x * sin + n.z * cos };
    });

    ctx.strokeStyle = `rgba(0,229,153,${0.05 * fade})`;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (const l of links) {
      const a = proj[idx.get(l.source)!], b = proj[idx.get(l.target)!];
      if (!a || !b) continue;
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
    }
    ctx.stroke();

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], pr = proj[i];
      const col = COLORS[n.type].toString(16).padStart(6, '0');
      const r = n.val * 0.9 * dpr * (0.8 + zoom * 0.3); // nodes swell as we push in
      ctx.fillStyle = `#${col}`;
      ctx.globalAlpha = fade * (0.4 + 0.6 * clamp01((pr.z + 120) / 240));
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!reduced) {
      ry += 0.0015;
      requestAnimationFrame(draw);
    }
  }
  draw();
}
