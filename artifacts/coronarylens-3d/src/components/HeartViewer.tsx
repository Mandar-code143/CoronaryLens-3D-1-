import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { NODES, NODE_BY_ID, MODEL_URL, TARGET_NODE_IDS, scoreColor, type LayerId, type ModelTargetCode } from '@/anatomy';

export interface ViewerHandle { reset: () => void; zoom: (factor: number) => void; focusTarget: (t: ModelTargetCode | null) => void }
interface Props {
  selected?: ModelTargetCode | null;
  scores?: Partial<Record<ModelTargetCode, number>>;
  layers?: Record<LayerId, boolean>;
  ghost?: boolean;
  interactive?: boolean;
  showLabels?: boolean;
  onSelect?: (t: ModelTargetCode | null, nodeId: string | null) => void;
  onStatus?: (s: 'loading' | 'ready' | 'error') => void;
}
type Phase = { s: 'loading'; p: number } | { s: 'ready' } | { s: 'error'; msg: string; webgl?: boolean };

const BASE: Record<string, string> = {
  chamber: '#9a4b48', aorta: '#b9786d', pulmonary: '#8089b3', vein: '#7a84ad', coronary: '#c5463b', cardiac_vein: '#5f6ca3',
};
const CHAMBER_TINT: Record<string, string> = { heart_left_ventricle: '#a04c47', heart_right_ventricle: '#99494f', heart_left_atrium: '#8c4348', heart_right_atrium: '#86414a' };
const FOCUS_DIR: Record<ModelTargetCode, [number, number, number]> = { LAD: [0.35, 0.22, 1], LCX: [1, 0.3, 0.45], RCA: [-0.55, 0.2, 1] };
const HOME_DIR = new THREE.Vector3(0.5, 0.28, 1).normalize();
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const HeartViewer = forwardRef<ViewerHandle, Props>(function HeartViewer(
  { selected = null, scores, layers, ghost = false, interactive = true, showLabels = true, onSelect, onStatus }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [phase, setPhase] = useState<Phase>({ s: 'loading', p: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const api = useRef<{ apply: () => void; focus: (t: ModelTargetCode | null) => void; home: () => void; zoom: (f: number) => void } | null>(null);
  const live = useRef({ selected, scores, layers, ghost, onSelect, interactive, showLabels });
  live.current = { selected, scores, layers, ghost, onSelect, interactive, showLabels };
  const targets = useMemo(() => (['LAD', 'LCX', 'RCA'] as ModelTargetCode[]), []);

  useImperativeHandle(ref, () => ({
    reset: () => api.current?.home(), zoom: (f) => api.current?.zoom(f), focusTarget: (t) => api.current?.focus(t),
  }), []);
  useEffect(() => { onStatus?.(phase.s); }, [phase.s, onStatus]);

  // Re-apply materials/visibility/selection whenever inputs change (no scene rebuild).
  useEffect(() => { api.current?.apply(); }, [selected, scores, layers, ghost, hover, phase.s]);
  useEffect(() => { if (phase.s === 'ready' && selected) api.current?.focus(selected); }, [selected, phase.s]);

  useEffect(() => {
    const el = host.current; if (!el) return;
    setPhase({ s: 'loading', p: 0 });
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch { setPhase({ s: 'error', msg: 'WebGL is not available in this browser, so the 3D anatomy cannot be displayed. Prediction scores and explanations remain usable in the panels.', webgl: true }); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = renderer.domElement; canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Interactive 3D anatomical heart with coronary arteries. Use the toolbar and target list for keyboard access.');
    el.prepend(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 0.9; controls.maxDistance = 9; controls.screenSpacePanning = true;
    controls.listenToKeyEvents(canvas);
    controls.enabled = interactive;

    const key = new THREE.DirectionalLight(0xfff1e6, 2.3); key.position.set(3.2, 4.2, 4.5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 14 });
    const fill = new THREE.DirectionalLight(0xbcd6ff, 0.7); fill.position.set(-4, 1.2, 2.5);
    const rim = new THREE.DirectionalLight(0x9fe9ff, 1.1); rim.position.set(-1.5, 2.5, -4.5);
    scene.add(key, fill, rim, new THREE.HemisphereLight(0xdfe9ff, 0x2a1a1a, 0.28));

    const root = new THREE.Group(); scene.add(root);
    const meshes = new Map<string, THREE.Mesh>();
    const mats = new Map<string, THREE.MeshPhysicalMaterial>();
    const pickPts: { id: string; pts: THREE.Vector3[] }[] = [];
    const anchors: Record<string, THREE.Vector3> = {};
    const center = new THREE.Vector3(); let heartRadius = 1.2;
    let dirty = true; let dead = false;
    const tween = { active: false, t0: 0, dur: 0, fp: new THREE.Vector3(), tp: new THREE.Vector3(), ft: new THREE.Vector3(), tt: new THREE.Vector3() };
    controls.addEventListener('change', () => { dirty = true; });

    const fitDistance = (radius: number) => radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12;
    const goTo = (pos: THREE.Vector3, tgt: THREE.Vector3) => {
      if (reduced()) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); dirty = true; return; }
      Object.assign(tween, { active: true, t0: performance.now(), dur: 650 }); tween.fp.copy(camera.position); tween.tp.copy(pos); tween.ft.copy(controls.target); tween.tt.copy(tgt); dirty = true;
    };
    const home = () => { const d = fitDistance(heartRadius) * (camera.aspect < 1 ? 1.5 : 1.0); goTo(center.clone().addScaledVector(HOME_DIR, d), center.clone()); };
    const focus = (t: ModelTargetCode | null) => {
      if (!t) return home();
      const box = new THREE.Box3(); TARGET_NODE_IDS[t].forEach((id) => { const m = meshes.get(id); if (m) box.expandByObject(m); });
      const c = box.getCenter(new THREE.Vector3()); const r = Math.max(0.35, box.getSize(new THREE.Vector3()).length() / 2);
      const dir = new THREE.Vector3(...FOCUS_DIR[t]).normalize();
      goTo(c.clone().addScaledVector(dir, Math.max(2.5, fitDistance(r) * 1.15)), c);
    };
    const zoom = (f: number) => { const off = camera.position.clone().sub(controls.target); off.multiplyScalar(f); const len = THREE.MathUtils.clamp(off.length(), controls.minDistance, controls.maxDistance); off.setLength(len); goTo(controls.target.clone().add(off), controls.target.clone()); };

    const apply = () => {
      const L = live.current; const sc = L.scores ?? {};
      for (const n of NODES) {
        const m = meshes.get(n.id), mat = mats.get(n.id); if (!m || !mat) continue;
        m.visible = L.layers ? L.layers[n.layer] : true;
        const isSel = !!n.target && n.target === L.selected; const isHover = hoverRef.current === n.id || (!!n.target && hoverRef.current != null && NODE_BY_ID.get(hoverRef.current)?.target === n.target);
        let col = n.kind === 'chamber' ? CHAMBER_TINT[n.id] : BASE[n.kind];
        let emissive = '#000000', ei = 0;
        if (n.target && sc[n.target] != null) { col = scoreColor(sc[n.target]!); emissive = col; ei = 0.05; }
        if (isHover) { emissive = '#9ff5ea'; ei = 0.2; }
        if (isSel) { emissive = '#6ae8da'; ei = 0.26; }
        mat.color.set(col); mat.emissive.set(emissive); mat.emissiveIntensity = ei;
        const g = n.kind === 'chamber' && L.ghost;
        mat.transparent = g; mat.opacity = g ? 0.3 : 1; mat.depthWrite = !g; mat.needsUpdate = true;
        m.renderOrder = g ? 0 : n.kind === 'coronary' ? 3 : 1;
      }
      dirty = true;
    };
    const hoverRef = { current: null as string | null };

    // ----- load asset -----
    const loader = new GLTFLoader();
    loader.load(MODEL_URL, (gltf) => {
      if (dead) return;
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.set(o.name, o as THREE.Mesh); });
      const missing = NODES.filter((n) => !meshes.has(n.id)).map((n) => n.id);
      if (missing.length) { setPhase({ s: 'error', msg: `The anatomy file does not match the expected structure catalog (missing: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}). Selection was disabled rather than guessing mesh identities.` }); return; }
      for (const n of NODES) {
        const m = meshes.get(n.id)!; const isCh = n.kind === 'chamber';
        const mat = new THREE.MeshPhysicalMaterial({ color: BASE[n.kind], roughness: isCh ? 0.52 : 0.46, metalness: 0, clearcoat: isCh ? 0.28 : 0.4, clearcoatRoughness: 0.5, sheen: isCh ? 0.5 : 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color('#d98a80'), envMapIntensity: 0.9 });
        m.material = mat; mats.set(n.id, mat); m.castShadow = true; m.receiveShadow = true;
        (m.geometry as THREE.BufferGeometry).computeBoundingSphere();
      }
      root.add(gltf.scene); root.updateMatrixWorld(true);
      // Framing set: chambers + ascending aorta, arch and pulmonary trunk (excludes long descending/carotid stubs).
      const FRAME = ['aorta_ascending', 'aorta_arch', 'pulmonary_trunk'];
      const heartBox = new THREE.Box3(); NODES.filter((n) => n.kind === 'chamber' || FRAME.includes(n.id)).forEach((n) => heartBox.expandByObject(meshes.get(n.id)!));
      heartBox.getCenter(center); heartRadius = heartBox.getSize(new THREE.Vector3()).length() / 2 * 1.08;
      // pick samples + label anchors for coronary tubes
      for (const n of NODES.filter((x) => x.kind === 'coronary')) {
        const m = meshes.get(n.id)!; const pos = m.geometry.getAttribute('position'); const pts: THREE.Vector3[] = [];
        for (let i = 0; i < pos.count; i += 9) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
        pickPts.push({ id: n.id, pts });
        if (n.id === 'coronary_lad' || n.id === 'coronary_lcx' || n.id === 'coronary_rca') anchors[n.target!] = pts[Math.floor(pts.length * 0.45)].clone();
      }
      resize(); camera.position.copy(center).addScaledVector(HOME_DIR, fitDistance(heartRadius) * (camera.aspect < 1 ? 1.5 : 1)); controls.target.copy(center); controls.update();
      apply(); setPhase({ s: 'ready' }); if (live.current.selected) focus(live.current.selected);
    }, (e) => { if (e.total) setPhase({ s: 'loading', p: e.loaded / e.total }); },
    () => { if (!dead) setPhase({ s: 'error', msg: 'The anatomy file (models/coronary-heart.glb) could not be loaded from this server. The rest of the workspace is unaffected.' }); });

    api.current = { apply, focus, home, zoom };

    // ----- picking -----
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); const tmp = new THREE.Vector3();
    const pick = (cx: number, cy: number): string | null => {
      const r = canvas.getBoundingClientRect(); const px = cx - r.left, py = cy - r.top;
      ndc.set((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      const vis = [...meshes.values()].filter((m) => m.visible && (!live.current.ghost || NODE_BY_ID.get(m.name)?.kind !== 'chamber' || true));
      let hit = ray.intersectObjects(vis, false).find((h) => !(live.current.ghost && NODE_BY_ID.get(h.object.name)?.kind === 'chamber'));
      const hitDist = hit ? hit.distance : Infinity; let best: { id: string; d: number } | null = null;
      for (const { id, pts } of pickPts) { if (!meshes.get(id)!.visible) continue;
        for (const p of pts) { tmp.copy(p).project(camera); if (tmp.z > 1) continue; const dx = (tmp.x - ndc.x) * r.width / 2, dy = (tmp.y - ndc.y) * r.height / 2; const d = Math.hypot(dx, dy);
          if (d < 11 && p.distanceTo(camera.position) < hitDist + 0.08 && (!best || d < best.d)) best = { id, d }; } }
      return best ? best.id : hit ? hit.object.name : null;
    };
    let down: { x: number; y: number } | null = null; let moveRaf = 0;
    const onMove = (e: PointerEvent) => { if (!live.current.interactive || e.buttons) return; cancelAnimationFrame(moveRaf); moveRaf = requestAnimationFrame(() => { const id = pick(e.clientX, e.clientY); hoverRef.current = id; canvas.style.cursor = id ? 'pointer' : 'grab'; setHover((h) => (h === id ? h : id)); }); };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => { if (!down || !live.current.interactive) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5; down = null; if (moved) return;
      const id = pick(e.clientX, e.clientY); const n = id ? NODE_BY_ID.get(id) : undefined; live.current.onSelect?.(n?.target ?? null, id); };
    const onLeave = () => { hoverRef.current = null; setHover(null); };
    canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointerleave', onLeave);

    // ----- resize + loop -----
    function resize() { const w = el!.clientWidth || 1, h = el!.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
    const ro = new ResizeObserver(resize); ro.observe(el);
    const ndcV = new THREE.Vector3(); const rayL = new THREE.Raycaster(); const chambers = () => NODES.filter((n) => n.kind === 'chamber' && meshes.get(n.id)?.visible && !live.current.ghost).map((n) => meshes.get(n.id)!);
    const updateLabels = () => { const rect = el.getBoundingClientRect(); const ch = chambers();
      for (const t of targets) { const div = labelRefs.current[t]; const a = anchors[t]; if (!div) continue;
        if (!a || !live.current.showLabels || !meshes.get(TARGET_NODE_IDS[t][0])?.visible) { div.style.display = 'none'; continue; }
        ndcV.copy(a).project(camera); const dist = a.distanceTo(camera.position); rayL.set(camera.position, a.clone().sub(camera.position).normalize()); rayL.far = dist - 0.03;
        const occluded = ch.length > 0 && rayL.intersectObjects(ch, false).length > 0;
        div.style.display = occluded || ndcV.z > 1 ? 'none' : 'block'; div.style.left = `${(ndcV.x * 0.5 + 0.5) * rect.width}px`; div.style.top = `${(-ndcV.y * 0.5 + 0.5) * rect.height}px`; } };
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick);
      if (tween.active) { const k = Math.min(1, (performance.now() - tween.t0) / tween.dur); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(tween.fp, tween.tp, e); controls.target.lerpVectors(tween.ft, tween.tt, e); if (k >= 1) tween.active = false; dirty = true; }
      if (controls.update()) dirty = true;
      if (dirty && !document.hidden) { dirty = false; renderer.render(scene, camera); updateLabels(); } };
    tick();
    const onLost = (e: Event) => { e.preventDefault(); setPhase({ s: 'error', msg: 'The graphics context was lost. Reload the viewer to continue.' }); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => { dead = true; cancelAnimationFrame(raf); cancelAnimationFrame(moveRaf); ro.disconnect(); controls.dispose();
      canvas.removeEventListener('webglcontextlost', onLost); canvas.remove(); pmrem.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry?.dispose(); (m.material as THREE.Material)?.dispose?.(); } }); renderer.dispose(); api.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const hovered = hover ? NODE_BY_ID.get(hover) : undefined;
  return (
    <div ref={host} className="viewer" data-phase={phase.s}>
      <div className="viewer-ui">
        {targets.map((t) => (
          <div key={t} ref={(n) => { labelRefs.current[t] = n; }} className={`vlabel${selected === t ? ' sel' : ''}`} style={{ display: 'none' }}>{t}</div>
        ))}
        {interactive && hovered && phase.s === 'ready' && <div className="hover-tip" role="status">{hovered.label}{hovered.target ? ` · ${hovered.target} target` : ''}</div>}
      </div>
      {phase.s === 'loading' && (
        <div className="viewer-state" role="status"><div className="box"><span className="spinner" /><div>Loading anatomical model…</div><div className="bar"><i style={{ width: `${Math.round(phase.p * 100)}%` }} /></div><div className="faint">3.9 MB · high-fidelity 3D asset</div></div></div>
      )}
      {phase.s === 'error' && (
        <div className="viewer-state" role="alert"><div className="box"><strong>{phase.webgl ? '3D view unavailable' : 'Anatomy could not be displayed'}</strong><p className="muted">{phase.msg}</p>{!phase.webgl && <button className="btn sm" onClick={() => setAttempt((a) => a + 1)}>Retry loading</button>}</div></div>
      )}
    </div>
  );
});
export default HeartViewer;
