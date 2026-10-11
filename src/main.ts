import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EngineAudio } from './audio/EngineAudio';
import { VehiclePhysics, type VehiclePhysicsConfig } from './physics/VehiclePhysics';
import './style.css';
import './circuit.css';
import './garage.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const engineAudio = new EngineAudio();
app.innerHTML = `
<div class="hud"><div class="brand">REAL<span>DRIVE</span><span class="sub">VEHICLE DYNAMICS LAB · BUILD 0.1</span></div>
<div class="help"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> conducir &nbsp; <kbd>ESPACIO</kbd> freno mano &nbsp; <kbd>C</kbd> cámara &nbsp; <kbd>R</kbd> recuperar</div>
<div class="panel telemetry"><div class="eyebrow">TELEMETRÍA EN TIEMPO REAL</div><div class="speedline"><div class="speed" id="speed">000</div><div class="unit">KM/H</div></div><div class="rpmbar"><span id="rpmbar"></span></div><div class="metricrow"><span>RÉGIMEN</span><strong id="rpm">850 RPM</strong></div><div class="metricrow"><span>TRANSMISIÓN</span><strong id="gear">N</strong></div><div class="metricrow"><span>ACELERACIÓN</span><strong id="accel">0.00 m/s²</strong></div><div class="metricrow"><span>SUPERFICIE</span><strong id="surface">ASFALTO</strong></div><div class="metricrow"><span>SIMULACIÓN</span><strong id="sim">ACTIVA</strong></div></div>
<div class="panel vehicle-tag"><div class="eyebrow">VEHÍCULO ACTUAL · <span id="vehicle-drive">RWD</span></div><div class="vehicle-name" id="vehicle-name">RD SPORT COUPE</div><div class="vehicle-desc" id="vehicle-desc">1.450 kg · 320 CV · TRACCIÓN TRASERA</div><div class="vehicle-switch" role="group" aria-label="Seleccionar vehículo"><button id="select-coupe" type="button" aria-pressed="true">1 · COUPÉ</button><button id="select-rally" type="button" aria-pressed="false">2 · RALLY 4X4</button></div></div>
<div class="panel circuit-panel"><div class="circuit-heading"><span>PROVING GROUNDS 01</span><strong id="lap-count">VUELTA 01</strong></div><svg id="circuit-map" viewBox="-100 -70 200 140" role="img" aria-label="Minimapa del circuito"><polyline id="track-map"/><g id="checkpoint-markers"></g><path id="player-marker" d="M 0 -4 L 2.5 2.5 L 0 1 L -2.5 2.5 Z"/></svg><div class="circuit-footer"><span id="checkpoint-status">CP 0 / 3</span><time id="lap-time">00:00.0</time></div></div>
<div class="status"><b>● SISTEMA ACTIVO</b><br>PROVING GROUNDS · TEST PAD 01<br><span id="fps">-- FPS</span> &nbsp; · &nbsp; <span id="camera">CHASE CAM</span></div><div class="vignette"></div><div class="toast" id="toast">VEHÍCULO RECUPERADO</div></div>`;

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9bb8c7); scene.fog = new THREE.Fog(0x9bb8c7, 100, 520);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 1200);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; app.prepend(renderer.domElement); renderer.domElement.tabIndex = 0; renderer.domElement.style.outline = 'none'; renderer.domElement.addEventListener('pointerdown', () => { renderer.domElement.focus(); engineAudio.unlock(); });
scene.add(new THREE.HemisphereLight(0xdcecff, 0x526148, 2.0));
const sun = new THREE.DirectionalLight(0xfff1d7, 3.0); sun.position.set(-70, 110, 35); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -110; sun.shadow.camera.right = 110; sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110; sun.shadow.bias = -0.0003; scene.add(sun);

// Stylized but playable test environment for phase 1. Phase 2 replaces this pad with the spline-generated circuit.
const groundMat = new THREE.MeshStandardMaterial({ color: 0x617454, roughness: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; scene.add(ground);
const terrainSegments = 128;
const terrainSize = 420;
const terrainRows = terrainSegments + 1;
const terrainVertexCount = terrainRows * terrainRows;
const terrainVertices = new Float32Array(terrainVertexCount * 3);
const terrainColors = new Float32Array(terrainVertexCount * 3);
const terrainIndices = new Uint32Array(terrainSegments * terrainSegments * 6);

function terrainSurfaceHeight(x: number, z: number) {
    const edge = Math.max(Math.abs(x) / 130, Math.abs(z) / 95);
    const padBlend = THREE.MathUtils.smoothstep(edge, 1, 1.55);
    const worldEdge = Math.max(Math.abs(x) / (terrainSize / 2), Math.abs(z) / (terrainSize / 2));
    const worldFade = 1 - THREE.MathUtils.smoothstep(worldEdge, .84, 1);
    const hills = .72 * Math.sin(x * .035) * Math.cos(z * .028)
        + .38 * Math.sin((x + z) * .062)
        + .2 * Math.cos(z * .091) * Math.sin(x * .073);
    const berm = 1.1 * Math.exp(-((Math.hypot(x - 108, z + 18)) ** 2) / 1050);
    return -.12 + padBlend * worldFade * (hills + berm);
}

const terrainStep = terrainSize / terrainSegments;
const terrainColor = new THREE.Color();
for (let row = 0; row < terrainRows; row++) {
    const z = -terrainSize / 2 + row * terrainStep;
    for (let column = 0; column < terrainRows; column++) {
        const x = -terrainSize / 2 + column * terrainStep;
        const index = row * terrainRows + column;
        const height = terrainSurfaceHeight(x, z) + .015;
        terrainVertices[index * 3] = x;
        terrainVertices[index * 3 + 1] = height;
        terrainVertices[index * 3 + 2] = z;
        const variation = Math.sin(x * .41 + z * .17) * .018;
        terrainColor.setHSL(.27 + variation, .22 + (Math.sin(z * .12) + 1) * .035, .29 + (Math.sin(x * .12 + z * .1) + 1) * .035);
        terrainColors[index * 3] = terrainColor.r;
        terrainColors[index * 3 + 1] = terrainColor.g;
        terrainColors[index * 3 + 2] = terrainColor.b;
    }
}

let terrainIndex = 0;
for (let row = 0; row < terrainSegments; row++) {
    for (let column = 0; column < terrainSegments; column++) {
        const a = row * terrainRows + column;
        const b = a + 1;
        const c = a + terrainRows;
        const d = c + 1;
        terrainIndices[terrainIndex++] = a;
        terrainIndices[terrainIndex++] = c;
        terrainIndices[terrainIndex++] = b;
        terrainIndices[terrainIndex++] = b;
        terrainIndices[terrainIndex++] = c;
        terrainIndices[terrainIndex++] = d;
    }
}

const terrainGeometry = new THREE.BufferGeometry();
terrainGeometry.setAttribute('position', new THREE.BufferAttribute(terrainVertices, 3));
terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
terrainGeometry.setIndex(new THREE.BufferAttribute(terrainIndices, 1));
terrainGeometry.computeVertexNormals();
const terrainMesh = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);
const padMat = new THREE.MeshStandardMaterial({ color: 0x343a3e, roughness: .86 });
const pad = new THREE.Mesh(new THREE.PlaneGeometry(260, 190), padMat); pad.rotation.x = -Math.PI / 2; pad.position.y = -0.04; pad.receiveShadow = true; scene.add(pad);
const lineMat = new THREE.MeshStandardMaterial({ color: 0xd9ded8, roughness: .8 });
function stripe(x: number, z: number, w: number, d: number, rot = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, .025, d), lineMat); m.position.set(x, .0, z); m.rotation.y = rot; m.receiveShadow = true; scene.add(m) }
for (let x = -118; x <= 118; x += 12) { stripe(x, -87, 5, .22) }
for (let x = -118; x <= 118; x += 12) { stripe(x, 87, 5, .22) }
for (let z = -80; z <= 80; z += 12) { stripe(-127, z, .22, 5); stripe(127, z, .22, 5) }
// Phase 2: spline-like oval proving circuit made from short aligned road segments.
const roadMat = new THREE.MeshStandardMaterial({ color: 0x292f33, roughness: .88 });
const roadLineMat = new THREE.MeshStandardMaterial({ color: 0xe4e4d9, roughness: .8 });
const trackSegments: { x: number; z: number; yaw: number; length: number }[] = [];
const trackCount = 120, rx = 82, rz = 52, roadWidth = 13;
for (let i = 0; i < trackCount; i++) {
    const a = i / trackCount * Math.PI * 2, b = (i + 1) / trackCount * Math.PI * 2;
    const x = (Math.cos(a) + Math.cos(b)) * rx / 2, z = (Math.sin(a) + Math.sin(b)) * rz / 2;
    const dx = -Math.sin((a + b) / 2) * rx, dz = Math.cos((a + b) / 2) * rz;
    const yaw = Math.atan2(-dx, -dz); const length = Math.hypot((Math.cos(b) - Math.cos(a)) * rx, (Math.sin(b) - Math.sin(a)) * rz) + .8;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, .045, length), roadMat); seg.position.set(x, .015, z); seg.rotation.y = yaw; seg.receiveShadow = true; seg.castShadow = false; scene.add(seg);
    trackSegments.push({ x, z, yaw, length });
    if (i % 3 === 0) { const stripe = new THREE.Mesh(new THREE.BoxGeometry(.16, .012, 2.2), roadLineMat); stripe.position.set(x, .043, z); stripe.rotation.y = yaw; scene.add(stripe) }
}
const checkpoints = [0, 30, 60, 90].map((segmentIndex, index) => {
    const segment = trackSegments[segmentIndex];
    const marker = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, .018, .24), new THREE.MeshStandardMaterial({ color: index === 3 ? 0xf0f2e8 : 0x68e0c1, emissive: index === 3 ? 0x343a30 : 0x123d32, roughness: .75 }));
    marker.position.set(segment.x, .05, segment.z);
    marker.rotation.y = segment.yaw;
    scene.add(marker);
    return {
        segmentIndex,
        position: new THREE.Vector2(segment.x, segment.z),
        normal: new THREE.Vector2(-Math.sin(segment.yaw), -Math.cos(segment.yaw)),
        side: new THREE.Vector2(Math.cos(segment.yaw), -Math.sin(segment.yaw))
    };
});
const routeCheckpoints = checkpoints.slice(0, 3);
const startGate = checkpoints[3];
const trackMap = document.querySelector<SVGPolylineElement>('#track-map')!;
trackMap.setAttribute('points', trackSegments.map(segment => `${segment.x.toFixed(2)},${segment.z.toFixed(2)}`).join(' '));
const checkpointDots = checkpoints.map((checkpoint, index) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', checkpoint.position.x.toFixed(2));
    dot.setAttribute('cy', checkpoint.position.y.toFixed(2));
    dot.setAttribute('r', index === 3 ? '2.4' : '1.8');
    dot.classList.add(index === 3 ? 'start-dot' : 'checkpoint-dot');
    document.querySelector('#checkpoint-markers')!.append(dot);
    return dot;
});
// Low-profile safety blocks and cones.
const barrierMat = new THREE.MeshStandardMaterial({ color: 0xc4c8c7, roughness: .72 });
type SoftBale = { group: THREE.Group; deformed: boolean; collider: RAPIER.Collider | null };
type StaticObstacle = { kind: 'box' | 'bale'; x: number; y: number; z: number; halfX: number; halfY: number; halfZ: number; yaw: number; bale?: SoftBale } | { kind: 'cylinder'; x: number; y: number; z: number; halfHeight: number; radius: number };
const staticObstacles: StaticObstacle[] = [];
function barrier(x: number, z: number, len: number, rot = 0) { const b = new THREE.Mesh(new THREE.BoxGeometry(len, .72, .48), barrierMat); b.position.set(x, .36, z); b.rotation.y = rot; b.castShadow = true; b.receiveShadow = true; scene.add(b); staticObstacles.push({ kind: 'box', x, y: .36, z, halfX: len / 2, halfY: .36, halfZ: .24, yaw: rot }) }
for (let x = -92; x <= 92; x += 8) { barrier(x, -72, 7); barrier(x, 72, 7) }
for (let z = -64; z <= 64; z += 8) { barrier(-103, z, 7, Math.PI / 2); barrier(103, z, 7, Math.PI / 2) }
const softBales: SoftBale[] = [];
const baleMat = new THREE.MeshStandardMaterial({ color: 0xb79a5d, roughness: 1 });
const baleBandMat = new THREE.MeshStandardMaterial({ color: 0x66724a, roughness: .92 });
for (let i = 0; i < trackSegments.length; i += 4) {
    const segment = trackSegments[i];
    const lateralX = Math.cos(segment.yaw), lateralZ = -Math.sin(segment.yaw);
    for (const side of [-1, 1]) {
        const x = segment.x + lateralX * side * (roadWidth / 2 + .55);
        const z = segment.z + lateralZ * side * (roadWidth / 2 + .55);
        const group = new THREE.Group();
        group.position.set(x, .55, z);
        group.rotation.y = segment.yaw;
        const bale = new THREE.Mesh(new THREE.CylinderGeometry(.53, .53, 2.0, 12), baleMat);
        bale.rotation.x = Math.PI / 2;
        bale.castShadow = true;
        bale.receiveShadow = true;
        group.add(bale);
        for (const bandZ of [-.55, .55]) {
            const band = new THREE.Mesh(new THREE.TorusGeometry(.535, .035, 6, 12), baleBandMat);
            band.rotation.x = Math.PI / 2;
            band.position.z = bandZ;
            group.add(band);
        }
        scene.add(group);
        const softBale = { group, deformed: false, collider: null };
        softBales.push(softBale);
        staticObstacles.push({ kind: 'bale', x, y: .55, z, halfX: .54, halfY: .54, halfZ: 1.02, yaw: segment.yaw, bale: softBale });
    }
}

const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6b28, roughness: .7 });
for (let i = 0; i < 10; i++) { const x = -25 + i * 5, z = -18; const cone = new THREE.Mesh(new THREE.ConeGeometry(.42, 1.1, 12), coneMat); cone.position.set(x, .55, z); cone.castShadow = true; scene.add(cone); staticObstacles.push({ kind: 'cylinder', x, y: .55, z, halfHeight: .55, radius: .42 }) }
// Distant hills give the scene depth without heavy geometry.
const hillMat = new THREE.MeshStandardMaterial({ color: 0x71877b, roughness: 1 });
for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; const r = 330 + (i % 4) * 22; const h = 35 + (i * 17 % 52); const hill = new THREE.Mesh(new THREE.ConeGeometry(35 + (i % 3) * 13, h, 7), hillMat); hill.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r); hill.rotation.y = a; hill.receiveShadow = true; scene.add(hill) }

// Procedural RD Sport Coupe: separate body panels, windows, wheels and lamps; replaceable with a GLB later.
const car = new THREE.Group(); scene.add(car);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x176e72, metalness: .72, roughness: .27 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x101a20, metalness: .35, roughness: .24 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x182d37, metalness: .25, roughness: .12, transparent: true, opacity: .82, clearcoat: 1 });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: .93 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xaab8bd, metalness: .85, roughness: .23 });
const lampMat = new THREE.MeshStandardMaterial({ color: 0xf2f0dc, emissive: 0xd7e6ff, emissiveIntensity: 1.3 });
function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m }
part(car, new THREE.BoxGeometry(2.02, .48, 4.45), bodyMat, 0, .88, 0);
part(car, new THREE.BoxGeometry(1.86, .28, 1.3), bodyMat, 0, 1.16, -1.28);
part(car, new THREE.BoxGeometry(1.82, .22, 1.1), bodyMat, 0, 1.14, 1.52);
const cabin = part(car, new THREE.BoxGeometry(1.58, .62, 1.95), glassMat, 0, 1.48, -.12); cabin.scale.set(1, .92, 1);
part(car, new THREE.BoxGeometry(1.72, .1, 1.12), bodyMat, 0, 1.82, -.2);
part(car, new THREE.BoxGeometry(1.92, .15, .22), darkMat, 0, .69, -2.19);
part(car, new THREE.BoxGeometry(1.9, .15, .22), darkMat, 0, .69, 2.19);
part(car, new THREE.BoxGeometry(.78, .12, .08), darkMat, 0, .95, -2.25);
for (const x of [-.72, .72]) { part(car, new THREE.BoxGeometry(.42, .14, .06), lampMat, x, .98, -2.24); const tail = new THREE.MeshStandardMaterial({ color: 0xff332a, emissive: 0x7d0804, emissiveIntensity: .7 }); part(car, new THREE.BoxGeometry(.42, .13, .06), tail, x, .98, 2.24) }
// Hood contours and mirrors.
for (const x of [-.65, .65]) { part(car, new THREE.BoxGeometry(.035, .012, 1.15), darkMat, x, 1.13, -1.36); part(car, new THREE.BoxGeometry(.22, .12, .3), bodyMat, x * 1.45, 1.36, -.55) }
type VehicleWheel = { pivot: THREE.Group; mesh: THREE.Group; x: number; z: number; steer: boolean; spin: number };
const coupeWheels: VehicleWheel[] = [];
for (const x of [-.99, .99]) for (const z of [-1.43, 1.48]) { const pivot = new THREE.Group(); pivot.position.set(x, .38, z); car.add(pivot); const wheel = new THREE.Group(); pivot.add(wheel); const tire = part(wheel, new THREE.CylinderGeometry(.37, .37, .24, 24, 1), rubberMat, 0, 0, 0); tire.rotation.z = Math.PI / 2; const rim = part(wheel, new THREE.CylinderGeometry(.23, .23, .255, 16, 1), rimMat, 0, 0, 0); rim.rotation.z = Math.PI / 2; for (let j = 0; j < 8; j++) { const spoke = part(wheel, new THREE.BoxGeometry(.025, .035, .38), darkMat, 0, 0, 0); spoke.rotation.x = j * Math.PI / 4; spoke.rotation.z = Math.PI / 2; } coupeWheels.push({ pivot, mesh: wheel, x, z, steer: z < 0, spin: 0 }) }
car.position.set(0, 0, 0);

const rallyCar = new THREE.Group();
rallyCar.visible = false;
scene.add(rallyCar);
const rallyBodyMat = new THREE.MeshStandardMaterial({ color: 0xa7472d, metalness: .48, roughness: .38 });
const rallyTrimMat = new THREE.MeshStandardMaterial({ color: 0x202a2a, metalness: .35, roughness: .48 });
part(rallyCar, new THREE.BoxGeometry(2.18, .64, 4.55), rallyBodyMat, 0, 1.0, 0);
part(rallyCar, new THREE.BoxGeometry(2.06, .34, 1.38), rallyBodyMat, 0, 1.38, -1.38);
part(rallyCar, new THREE.BoxGeometry(2.02, .72, 1.42), rallyBodyMat, 0, 1.43, 1.38);
part(rallyCar, new THREE.BoxGeometry(1.78, .74, 2.25), glassMat, 0, 1.78, -.05);
part(rallyCar, new THREE.BoxGeometry(1.9, .12, 2.18), rallyBodyMat, 0, 2.2, -.05);
part(rallyCar, new THREE.BoxGeometry(2.28, .2, .32), rallyTrimMat, 0, .68, -2.22);
part(rallyCar, new THREE.BoxGeometry(2.22, .2, .32), rallyTrimMat, 0, .68, 2.22);
part(rallyCar, new THREE.BoxGeometry(1.7, .13, 2.4), rallyTrimMat, 0, .55, 0);
for (const x of [-.76, .76]) {
    part(rallyCar, new THREE.BoxGeometry(.4, .15, .08), lampMat, x, 1.22, -2.12);
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xf33a2f, emissive: 0x6d0905, emissiveIntensity: .65 });
    part(rallyCar, new THREE.BoxGeometry(.34, .2, .08), tailMat, x, 1.3, 2.13);
}
for (const x of [-1.12, 1.12]) for (const z of [-1.48, 1.48]) {
    part(rallyCar, new THREE.BoxGeometry(.16, .62, .78), rallyTrimMat, x, 1.0, z);
}
for (const x of [-.72, .72]) part(rallyCar, new THREE.BoxGeometry(.08, .1, 2.05), rallyTrimMat, x, 2.32, -.05);
for (const z of [-.92, .82]) part(rallyCar, new THREE.BoxGeometry(1.55, .1, .1), rallyTrimMat, 0, 2.32, z);
const rallyWheels: VehicleWheel[] = [];
for (const x of [-1.08, 1.08]) for (const z of [-1.48, 1.48]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, .46, z);
    rallyCar.add(pivot);
    const wheel = new THREE.Group();
    pivot.add(wheel);
    const tire = part(wheel, new THREE.CylinderGeometry(.46, .46, .3, 24, 1), rubberMat, 0, 0, 0);
    tire.rotation.z = Math.PI / 2;
    const rim = part(wheel, new THREE.CylinderGeometry(.27, .27, .315, 16, 1), rimMat, 0, 0, 0);
    rim.rotation.z = Math.PI / 2;
    for (let spokeIndex = 0; spokeIndex < 8; spokeIndex++) {
        const spoke = part(wheel, new THREE.BoxGeometry(.035, .04, .43), rallyTrimMat, 0, 0, 0);
        spoke.rotation.x = spokeIndex * Math.PI / 4;
        spoke.rotation.z = Math.PI / 2;
    }
    rallyWheels.push({ pivot, mesh: wheel, x, z, steer: z < 0, spin: 0 });
}
rallyCar.position.set(0, 0, 0);

const vehicleProfiles = {
    coupe: {
        name: 'RD SPORT COUPE', description: '1.450 kg · 320 CV · TRACCIÓN TRASERA', drive: 'RWD', maxForward: 52,
        cameraEye: new THREE.Vector3(0, 1.88, -1.45), cameraLook: new THREE.Vector3(0, 1.35, -24),
        physics: {
            mass: 1450, wheelRadius: .37, wheelInertia: 1.65, suspensionRest: .48, suspensionTravel: .22,
            springRate: 42_000, damperRate: 3_600, peakTorque: 400, finalDrive: 3.12,
            gearRatios: [2.96, 2.04, 1.48, 1.14, .91, .74], maxRpm: 7_400,
            maxSteeringAngle: .56, brakeTorque: 2_150, handbrakeTorque: 2_850,
            dragCoefficient: .68, rollingResistance: .014,
            surfaceGrip: (x: number, z: number) => isOnAsphalt(x, z) ? 1.08 : .76,
            wheelMounts: [
                { x: -.99, y: .78, z: -1.43, front: true, driven: false },
                { x: .99, y: .78, z: -1.43, front: true, driven: false },
                { x: -.99, y: .78, z: 1.48, front: false, driven: true },
                { x: .99, y: .78, z: 1.48, front: false, driven: true },
            ],
        } satisfies VehiclePhysicsConfig,
    },
    rally: {
        name: 'RD RALLY 4X4', description: '1.850 kg · 280 CV · TRACCIÓN INTEGRAL', drive: 'AWD', maxForward: 43,
        cameraEye: new THREE.Vector3(0, 2.0, -1.45), cameraLook: new THREE.Vector3(0, 1.48, -24),
        physics: {
            mass: 1850, wheelRadius: .46, wheelInertia: 2.25, suspensionRest: .61, suspensionTravel: .34,
            springRate: 38_000, damperRate: 4_600, peakTorque: 400, finalDrive: 4.05,
            gearRatios: [3.8, 2.65, 1.92, 1.45, 1.16, .94, .77, .64], maxRpm: 7_100,
            maxSteeringAngle: .5, brakeTorque: 2_700, handbrakeTorque: 3_100,
            dragCoefficient: .82, rollingResistance: .018,
            surfaceGrip: (x: number, z: number) => isOnAsphalt(x, z) ? 1.05 : .94,
            wheelMounts: [
                { x: -1.08, y: .96, z: -1.48, front: true, driven: true },
                { x: 1.08, y: .96, z: -1.48, front: true, driven: true },
                { x: -1.08, y: .96, z: 1.48, front: false, driven: true },
                { x: 1.08, y: .96, z: 1.48, front: false, driven: true },
            ],
        } satisfies VehiclePhysicsConfig,
    }
} as const;
type VehicleId = keyof typeof vehicleProfiles;
let activeVehicleId: VehicleId = 'coupe';
let activeProfile: typeof vehicleProfiles[VehicleId] = vehicleProfiles.coupe;
let activeCar = car;
let wheels = coupeWheels;
let physicsWorld: RAPIER.World | null = null;
let vehiclePhysics: VehiclePhysics | null = null;
const previousCollisionHandles = new Set<number>();

// Stable toy-physics driving model: the previous suspension loop was inconsistent and caused the vehicle to float / stall.
const vehicle = { x: 0, y: 0.1, z: -52, yaw: -Math.PI / 2, speed: 0, rpm: 850, gear: 1, accel: 0 };
const race = { completedLaps: 0, nextCheckpoint: 0, checkpointsPassed: 0, started: false, startedAt: 0, lastLapSeconds: 0 };
let previousPosition = new THREE.Vector2(vehicle.x, vehicle.z);
const state = { throttle: 0, brake: 0, steer: 0, handbrake: false, reverse: false, cam: 0, paused: false, speed: 0, rpm: 850, gear: 1, accel: 0, lastSpeed: 0, damage: 0 };
const keys = new Set<string>();
window.addEventListener('keydown', e => {
    engineAudio.unlock();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    if (e.repeat) return;
    if (e.key.toLowerCase() === 'c') {
        state.cam = (state.cam + 1) % 3;
        document.querySelector('#camera')!.textContent = ['CHASE CAM', 'DRIVER CAM', 'ORBIT CAM'][state.cam];
    }
    if (e.key === '1') selectVehicle('coupe');
    if (e.key === '2') selectVehicle('rally');
    if (e.key.toLowerCase() === 'r') recover();
    if (e.key === 'Escape') state.paused = !state.paused;
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
renderer.domElement?.setAttribute('tabindex', '0');

function recover() {
    vehicle.x = 0; vehicle.y = 0.1; vehicle.z = -52; vehicle.yaw = -Math.PI / 2; vehicle.speed = 0; vehicle.rpm = 850; vehicle.gear = 1; vehicle.accel = 0;
    vehiclePhysics?.reset(new THREE.Vector3(vehicle.x, vehicle.y, vehicle.z), vehicle.yaw);
    state.reverse = false;
    previousCollisionHandles.clear();
    previousPosition.set(vehicle.x, vehicle.z);
    race.nextCheckpoint = 0; race.checkpointsPassed = 0; race.started = false; race.startedAt = 0;
    state.speed = 0; state.rpm = 850; state.gear = 1; state.accel = 0; state.lastSpeed = 0; state.damage = 0; toast('VEHÍCULO RECUPERADO');
}

function selectVehicle(id: VehicleId) {
    activeVehicleId = id;
    activeProfile = vehicleProfiles[id];
    activeCar = id === 'coupe' ? car : rallyCar;
    wheels = id === 'coupe' ? coupeWheels : rallyWheels;
    car.visible = id === 'coupe';
    rallyCar.visible = id === 'rally';
    document.querySelector('#vehicle-drive')!.textContent = activeProfile.drive;
    document.querySelector('#vehicle-name')!.textContent = activeProfile.name;
    document.querySelector('#vehicle-desc')!.textContent = activeProfile.description;
    document.querySelector<HTMLButtonElement>('#select-coupe')!.setAttribute('aria-pressed', String(id === 'coupe'));
    document.querySelector<HTMLButtonElement>('#select-rally')!.setAttribute('aria-pressed', String(id === 'rally'));
    recreateVehiclePhysics();
    recover();
}

function recreateVehiclePhysics() {
    if (!physicsWorld) return;
    vehiclePhysics?.dispose();
    vehiclePhysics = new VehiclePhysics(physicsWorld, activeProfile.physics, new THREE.Vector3(0, .1, -52), -Math.PI / 2);
    previousCollisionHandles.clear();
}

document.querySelector('#select-coupe')!.addEventListener('click', () => selectVehicle('coupe'));
document.querySelector('#select-rally')!.addEventListener('click', () => selectVehicle('rally'));

function terrainHeightAt(x: number, z: number) {
    const radial = Math.hypot(x / rx, z / rz);
    const onTrack = Math.abs(radial - 1) < (roadWidth / 2 / Math.min(rx, rz) + 0.025);
    if (onTrack) return 0.02;
    if (Math.abs(x) <= 130 && Math.abs(z) <= 95) return 0.02;
    return terrainSurfaceHeight(x, z) + .015;
}

function isOnAsphalt(x: number, z: number) {
    const radial = Math.hypot(x / rx, z / rz);
    return Math.abs(radial - 1) < (roadWidth / 2 / Math.min(rx, rz) + 0.025)
        || (Math.abs(x) <= 130 && Math.abs(z) <= 95);
}

function crossedGate(from: THREE.Vector2, to: THREE.Vector2, gate: typeof startGate) {
    const fromOffset = from.clone().sub(gate.position);
    const toOffset = to.clone().sub(gate.position);
    const fromDistance = fromOffset.dot(gate.normal);
    const toDistance = toOffset.dot(gate.normal);
    if (fromDistance > 0 || toDistance <= 0) return false;

    const fraction = -fromDistance / (toDistance - fromDistance);
    const crossingPoint = from.clone().lerp(to, fraction).sub(gate.position);
    return Math.abs(crossingPoint.dot(gate.side)) <= roadWidth / 2;
}

function updateRaceProgress() {
    const currentPosition = new THREE.Vector2(vehicle.x, vehicle.z);
    if (crossedGate(previousPosition, currentPosition, startGate)) {
        if (!race.started) {
            race.started = true;
            race.startedAt = performance.now();
        } else if (race.checkpointsPassed === routeCheckpoints.length) {
            race.lastLapSeconds = (performance.now() - race.startedAt) / 1000;
            race.completedLaps++;
            race.startedAt = performance.now();
            race.checkpointsPassed = 0;
            race.nextCheckpoint = 0;
            toast(`VUELTA ${race.completedLaps} COMPLETADA`);
        }
    }

    const nextCheckpoint = routeCheckpoints[race.nextCheckpoint];
    if (nextCheckpoint && crossedGate(previousPosition, currentPosition, nextCheckpoint)) {
        race.nextCheckpoint++;
        race.checkpointsPassed++;
        toast(`CHECKPOINT ${race.checkpointsPassed} / ${routeCheckpoints.length}`);
    }
    previousPosition.copy(currentPosition);
}

let toastTimer = 0;
function toast(s: string) {
    const el = document.querySelector('#toast')!;
    el.textContent = s;
    el.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('show'), 1500);
}

(window as any).__REALDRIVE__ = { vehicle, get wheels() { return wheels; }, get activeVehicleId() { return activeVehicleId; }, get activeCar() { return activeCar; }, get physics() { return vehiclePhysics; }, terrainHeightAt };

async function init() {
    await RAPIER.init();
    const vehicleStart = new THREE.Vector3(0, 0.1, -52);
    car.position.copy(vehicleStart);
    physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    physicsWorld.timestep = 1 / 120;
    physicsWorld.createCollider(RAPIER.ColliderDesc.trimesh(terrainVertices, terrainIndices).setFriction(.82).setRestitution(.02));
    physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(130, .08, 95).setTranslation(0, -.06, 0).setFriction(1.15));
    for (const segment of trackSegments) {
        physicsWorld.createCollider(
            RAPIER.ColliderDesc.cuboid(roadWidth / 2, .023, segment.length / 2)
                .setTranslation(segment.x, .015, segment.z)
                .setRotation({ x: 0, y: Math.sin(segment.yaw / 2), z: 0, w: Math.cos(segment.yaw / 2) })
                .setFriction(1.15)
                .setRestitution(.02),
        );
    }
    const softBalesByHandle = new Map<number, SoftBale>();
    for (const obstacle of staticObstacles) {
        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(obstacle.x, obstacle.y, obstacle.z);
        let colliderDesc: RAPIER.ColliderDesc;
        if (obstacle.kind !== 'cylinder') {
            bodyDesc.setRotation({ x: 0, y: Math.sin(obstacle.yaw / 2), z: 0, w: Math.cos(obstacle.yaw / 2) });
            colliderDesc = RAPIER.ColliderDesc.cuboid(obstacle.halfX, obstacle.halfY, obstacle.halfZ);
        } else {
            colliderDesc = RAPIER.ColliderDesc.cylinder(obstacle.halfHeight, obstacle.radius);
        }
        colliderDesc.setFriction(.8).setRestitution(.05);
        const collider = physicsWorld.createCollider(colliderDesc, physicsWorld.createRigidBody(bodyDesc));
        if (obstacle.kind === 'bale' && obstacle.bale) {
            obstacle.bale.collider = collider;
            softBalesByHandle.set(collider.handle, obstacle.bale);
        }
    }
    physicsWorld.updateSceneQueries();
    recreateVehiclePhysics();

    let last = performance.now();
    let frames = 0, fpsTime = 0, fps = 0;
    let accumulator = 0;
    const fixedStep = 1 / 120;

    function frame(now: number) {
        requestAnimationFrame(frame);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        if (!state.paused) {
            accumulator += dt;
            let steps = 0;
            while (accumulator >= fixedStep && steps < 8) {
                simulate(fixedStep);
                accumulator -= fixedStep;
                steps++;
            }
        } else {
            accumulator = 0;
        }

        syncVisuals();
        renderer.render(scene, camera);

        frames++; fpsTime += dt;
        if (fpsTime >= 0.5) {
            fps = Math.round(frames / fpsTime);
            frames = 0; fpsTime = 0;
            document.querySelector('#fps')!.textContent = `${fps} FPS`;
        }
    }

    function simulate(dt: number) {
        if (!vehiclePhysics || !physicsWorld) return;
        const reverseKey = keys.has('s') || keys.has('arrowdown');
        state.reverse = reverseKey && vehicle.speed < .8;
        state.throttle = (keys.has('w') || keys.has('arrowup') || state.reverse) ? 1 : 0;
        state.brake = reverseKey && !state.reverse ? 1 : 0;
        const steerInput = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + (keys.has('d') || keys.has('arrowright') ? -1 : 0);
        state.steer = THREE.MathUtils.damp(state.steer, steerInput, 4.2, dt);
        state.handbrake = keys.has(' ');
        vehiclePhysics.step({ steering: state.steer, throttle: state.throttle, brake: state.brake, handbrake: state.handbrake, reverse: state.reverse }, dt);
        const snapshot = vehiclePhysics.getSnapshot();
        vehicle.x = snapshot.position.x;
        vehicle.y = snapshot.position.y;
        vehicle.z = snapshot.position.z;
        vehicle.yaw = new THREE.Euler().setFromQuaternion(snapshot.rotation, 'YXZ').y;
        const velocity = vehiclePhysics.body.linvel();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(snapshot.rotation);
        vehicle.speed = velocity.x * forward.x + velocity.z * forward.z;
        vehicle.rpm = snapshot.rpm;
        vehicle.gear = snapshot.gear === 'R' ? 0 : snapshot.gear;
        vehicle.accel = snapshot.longitudinalG * 9.81;
        state.speed = snapshot.speedKmh;
        state.rpm = snapshot.rpm;
        const previousGear = state.gear;
        state.gear = typeof snapshot.gear === 'number' ? snapshot.gear : 1;
        if (state.gear !== previousGear && state.throttle) engineAudio.playGearShift();
        state.accel = vehicle.accel;

        const newContacts: RAPIER.Collider[] = [];
        const contactHandles = new Set<number>();
        physicsWorld.contactPairsWith(vehiclePhysics.collider, collider => {
            contactHandles.add(collider.handle);
            if (!previousCollisionHandles.has(collider.handle)) newContacts.push(collider);
        });
        previousCollisionHandles.clear();
        for (const handle of contactHandles) previousCollisionHandles.add(handle);
        for (const collider of newContacts) {
            const bale = softBalesByHandle.get(collider.handle);
            const impactSpeed = Math.abs(vehicle.speed);
            if (bale && !bale.deformed && impactSpeed > 2) {
                bale.deformed = true;
                bale.group.scale.set(1, .55, .72);
                bale.group.position.y = .31;
                collider.setEnabled(false);
                const bodyVelocity = vehiclePhysics.body.linvel();
                vehiclePhysics.body.setLinvel({ x: bodyVelocity.x * .58, y: bodyVelocity.y, z: bodyVelocity.z * .58 }, true);
                toast('FARDO APLASTADO · PASO LIBRE');
                engineAudio.playImpact(Math.min(1, impactSpeed / 18 + .2), true);
            } else if (!bale && impactSpeed > 2) {
                engineAudio.playImpact(Math.min(1, impactSpeed / 22));
            }
        }

        updateRaceProgress();
        if (Math.abs(vehicle.x) > 190 || Math.abs(vehicle.z) > 190 || vehicle.y < -8 || vehicle.y > 12) recover();
    }

    function syncVisuals() {
        const snapshot = vehiclePhysics?.getSnapshot();
        if (snapshot) {
            activeCar.position.copy(snapshot.position);
            activeCar.quaternion.copy(snapshot.rotation);
            snapshot.wheels.forEach((wheel, index) => {
                const visualWheel = wheels[index];
                visualWheel.pivot.position.set(visualWheel.x, activeProfile.physics.wheelMounts[index].y - wheel.suspensionLength, visualWheel.z);
                visualWheel.pivot.rotation.y = wheel.steeringAngle;
                visualWheel.pivot.rotation.x = 0;
                visualWheel.mesh.rotation.x = wheel.rotation;
            });
        }

        document.querySelector('#speed')!.textContent = String(Math.round(state.speed)).padStart(3, '0');
        document.querySelector('#rpm')!.textContent = `${Math.round(state.rpm).toLocaleString('es-AR')} RPM`;
        const slipAmount = snapshot ? Math.min(1, snapshot.wheels.reduce((maximum, wheel) => Math.max(maximum, Math.abs(wheel.slipAngle) / 1.15), 0)) : 0;
        engineAudio.update(state.rpm, state.throttle, vehicle.speed, activeVehicleId, slipAmount);
        document.querySelector('#rpmbar')!.setAttribute('style', `width:${Math.min(100, (state.rpm / activeProfile.physics.maxRpm) * 100)}%`);
        document.querySelector('#gear')!.textContent = vehicle.speed < -.4 || state.reverse ? 'R' : state.brake ? 'B' + state.gear : state.throttle || state.speed > .5 ? 'D' + state.gear : 'N';
        document.querySelector('#accel')!.textContent = `${state.accel.toFixed(2)} m/s²`;
        document.querySelector('#surface')!.textContent = isOnAsphalt(vehicle.x, vehicle.z) ? 'ASFALTO' : 'TIERRA';
        document.querySelector('#lap-count')!.textContent = `VUELTA ${String(race.completedLaps + 1).padStart(2, '0')}`;
        document.querySelector('#checkpoint-status')!.textContent = `CP ${race.checkpointsPassed} / ${routeCheckpoints.length}`;
        const lapSeconds = race.started ? (performance.now() - race.startedAt) / 1000 : race.lastLapSeconds;
        const lapMinutes = Math.floor(lapSeconds / 60).toString().padStart(2, '0');
        document.querySelector('#lap-time')!.textContent = `${lapMinutes}:${(lapSeconds % 60).toFixed(1).padStart(4, '0')}`;
        for (const [index, dot] of checkpointDots.entries()) dot.classList.toggle('is-next', index === race.nextCheckpoint && index < routeCheckpoints.length);
        document.querySelector('#player-marker')!.setAttribute('transform', `translate(${vehicle.x.toFixed(2)} ${vehicle.z.toFixed(2)}) rotate(${THREE.MathUtils.radToDeg(-vehicle.yaw).toFixed(1)})`);

        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.yaw);
        let target: THREE.Vector3; let look: THREE.Vector3;
        if (state.cam === 0) {
            target = activeCar.position.clone().addScaledVector(forward, -8.5).add(new THREE.Vector3(0, 3.4, 0));
            look = activeCar.position.clone().add(new THREE.Vector3(0, 1, 0));
        } else if (state.cam === 1) {
            target = activeCar.localToWorld(activeProfile.cameraEye.clone());
            look = activeCar.localToWorld(activeProfile.cameraLook.clone());
        } else {
            const t = performance.now() * 0.00015;
            target = activeCar.position.clone().add(new THREE.Vector3(Math.sin(t) * 11, 5, Math.cos(t) * 11));
            look = activeCar.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        }

        if (state.cam === 1) camera.position.copy(target);
        else camera.position.lerp(target, 0.09);
        camera.lookAt(look);
    }

    requestAnimationFrame(frame);
}

init().catch(e => {
    console.error(e);
    toast('ERROR INICIANDO FÍSICA · REVISAR CONSOLA');
});
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
});
