import { strict as assert } from "assert";
import { packSplat } from "../classes/SplatPacker.ts";
import { mat3Mul, mat3MulDiag, transpose3, quatToMat3 } from "../utils/splatMath.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

function halfToFloat(h: number): number {
  const hs = (h & 0x8000) >> 15;
  const he = (h & 0x7c00) >> 10;
  const hm = h & 0x03ff;
  if (he === 0x1f) return hs ? -Infinity : Infinity;
  if (he === 0) { const val = hm / 1024.0; return hs ? -val : val; }
  const fval = Math.pow(2, he - 15) * (1 + hm / 1024.0);
  return hs ? -fval : fval;
}

function unpackHalf2x16(u32: number): [number, number] {
  return [halfToFloat(u32 & 0xffff), halfToFloat((u32 >>> 16) & 0xffff)];
}

// Mirrors exactly what the shader does:
//   vec2 u1 = unpackHalf2x16(pixel1.x)  → v00, v10
//   vec2 u2 = unpackHalf2x16(pixel1.y)  → v20, v11
//   vec2 u3 = unpackHalf2x16(pixel1.z)  → v21, v22
// mat3 cov3d = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y)
// column-major so: col0=(v00,v10,v20), col1=(v10,v11,v21), col2=(v20,v21,v22)
function unpackCovFromPixel1(pixel1: Uint32Array): number[] {
  const [v00, v10] = unpackHalf2x16(pixel1[0]);
  const [v20, v11] = unpackHalf2x16(pixel1[1]);
  const [v21, v22] = unpackHalf2x16(pixel1[2]);
  // column-major 3x3
  return [
    v00, v10, v20,
    v10, v11, v21,
    v20, v21, v22,
  ];
}

function computeExpectedCov(
  scale: [number, number, number],
  rotation: [number, number, number, number]
): number[] {
  const R = quatToMat3(rotation);
  const S2 = mat3MulDiag([scale[0]*scale[0], scale[1]*scale[1], scale[2]*scale[2]]);
  return mat3Mul(mat3Mul(R, S2), transpose3(R));
}

function normalizeQuat(q: [number,number,number,number]): [number,number,number,number] {
  const len = Math.sqrt(q[0]*q[0] + q[1]*q[1] + q[2]*q[2] + q[3]*q[3]);
  return [q[0]/len, q[1]/len, q[2]/len, q[3]/len];
}

// Half-float has ~3 decimal digits of precision; allow 0.3% relative error
// plus a small absolute floor for near-zero values
function assertNearHalf(actual: number, expected: number, label: string) {
  const tol = Math.max(Math.abs(expected) * 0.003, 1e-4);
  assert(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual}, diff ${Math.abs(actual-expected)}`
  );
}

function isSymmetricPSD(M: number[]): { psd: boolean; minEig: number } {
  // Check all three 2x2 leading principal minors
  const a = M[0], b = M[1], c = M[2];
  const d = M[4], e = M[5];
  const f = M[8];
  const minor1 = a;
  const minor2 = a * d - b * b;
  const minor3 = a*(d*f - e*e) - b*(b*f - e*c) + c*(b*e - d*c);
  const minEig = Math.min(minor1, minor2, minor3);
  return { psd: minEig >= -1e-6, minEig };
}

// ─── SUITE 1: pack → texData → unpack round-trip (mirrors createSplatGeometry) ──
{
  const WORDS_PER_SPLAT = 2;
  const texWidth = 2048;

  const cases: Array<{
    label: string;
    center: [number,number,number];
    scale: [number,number,number];
    rotation: [number,number,number,number];
    color: [number,number,number];
    opacity: number;
  }> = [
    {
      label: "identity rotation, uniform scale",
      center: [1, 2, 3],
      scale: [0.5, 0.5, 0.5],
      rotation: normalizeQuat([1, 0, 0, 0]),
      color: [1.0, 0.5, 0.25],
      opacity: 0.8,
    },
    {
      label: "45-degree rotation around Y, anisotropic scale",
      center: [0, 0, -5],
      scale: [1.0, 0.1, 0.3],
      rotation: normalizeQuat([0.9239, 0, 0.3827, 0]),
      color: [0.0, 1.0, 0.0],
      opacity: 1.0,
    },
    {
      label: "small splat",
      center: [0, 0, 0],
      scale: [0.01, 0.01, 0.01],
      rotation: normalizeQuat([1, 0, 0, 0]),
      color: [0.5, 0.5, 0.5],
      opacity: 0.5,
    },
    {
      label: "loader-style quantized rotation (byte - 128) / 128",
      center: [0, 0, 0],
      scale: [0.3, 0.1, 0.2],
      // Simulate what SplatLoader produces: bytes [200, 100, 180, 150] → quat
      rotation: normalizeQuat([
        (200 - 128) / 128,
        (100 - 128) / 128,
        (180 - 128) / 128,
        (150 - 128) / 128,
      ]),
      color: [1.0, 0.0, 0.0],
      opacity: 0.9,
    },
  ];

  for (const { label, center, scale, rotation, color, opacity } of cases) {
    // --- pack ---
    const packed = packSplat(center, scale, rotation, color, opacity);

    // --- write into texData exactly as createSplatGeometry does ---
    const splatIndex = 0;
    const texHeight = 1;
    const texData = new Uint32Array(texWidth * texHeight * 4);
    texData.set(packed, splatIndex * WORDS_PER_SPLAT * 4);

    // --- read back pixel0 and pixel1 exactly as the shader does ---
    // globalTexelIndex = splatIndex * 2
    // texPos0 = (globalTexelIndex % width, globalTexelIndex / width)
    // texPos1 = ((globalTexelIndex+1) % width, (globalTexelIndex+1) / width)
    const globalTexelIndex = splatIndex * 2;
    const tx0 = globalTexelIndex % texWidth;
    const ty0 = Math.floor(globalTexelIndex / texWidth);
    const tx1 = (globalTexelIndex + 1) % texWidth;
    const ty1 = Math.floor((globalTexelIndex + 1) / texWidth);

    // Each texel is 4 uint32s (RGBA)
    const pixel0Offset = (ty0 * texWidth + tx0) * 4;
    const pixel1Offset = (ty1 * texWidth + tx1) * 4;
    const pixel0 = texData.slice(pixel0Offset, pixel0Offset + 4);
    const pixel1 = texData.slice(pixel1Offset, pixel1Offset + 4);

    // --- unpack position ---
    const posView = new Float32Array(pixel0.buffer);
    const unpackedCenter = [posView[0], posView[1], posView[2]];
    assert(unpackedCenter[0] === center[0], `${label}: center.x mismatch`);
    assert(unpackedCenter[1] === center[1], `${label}: center.y mismatch`);
    assert(unpackedCenter[2] === center[2], `${label}: center.z mismatch`);

    // --- unpack covariance (mirrors shader mat3 construction) ---
    const unpackedCov = unpackCovFromPixel1(pixel1);

    // --- check symmetry ---
    assert(unpackedCov[1] === unpackedCov[3], `${label}: cov not symmetric [1]!=[3]`);
    assert(unpackedCov[2] === unpackedCov[6], `${label}: cov not symmetric [2]!=[6]`);
    assert(unpackedCov[5] === unpackedCov[7], `${label}: cov not symmetric [5]!=[7]`);

    // --- check PSD ---
    const { psd, minEig } = isSymmetricPSD(unpackedCov);
    assert(psd, `${label}: unpacked covariance is not PSD, minEig=${minEig}`);

    // --- compare against expected R*S²*Rᵀ ---
    const expectedCov = computeExpectedCov(scale, rotation);
    const labels6 = ["v00","v10","v20","v11","v21","v22"];
    const indices6 = [0, 1, 2, 4, 5, 8]; // unique entries in column-major
    for (let k = 0; k < 6; k++) {
      assertNearHalf(unpackedCov[indices6[k]], expectedCov[indices6[k]], `${label} ${labels6[k]}`);
    }

    // --- unpack color and opacity ---
    const c = pixel1[3];
    const unpackedR = (c & 0xff) / 255;
    const unpackedG = ((c >>> 8) & 0xff) / 255;
    const unpackedB = ((c >>> 16) & 0xff) / 255;
    const unpackedA = ((c >>> 24) & 0xff) / 255;
    const colorTol = 1 / 255;
    assert(Math.abs(unpackedR - color[0]) <= colorTol, `${label}: R mismatch`);
    assert(Math.abs(unpackedG - color[1]) <= colorTol, `${label}: G mismatch`);
    assert(Math.abs(unpackedB - color[2]) <= colorTol, `${label}: B mismatch`);
    assert(Math.abs(unpackedA - opacity) <= colorTol, `${label}: opacity mismatch`);

    console.log(`PASS: round-trip [${label}]`);
  }
}

// ─── SUITE 2: view angle stress — lambda2 stays non-negative ─────────────────
// Packs a splat, unpacks the covariance, then projects it through several
// view rotations and asserts eigenvalues remain non-negative.
{
  function projectCov2D(
    cov3d: number[],
    viewRot: number[], // column-major 3x3
    camPos: [number, number, number],
    focal: [number, number]
  ): { lambda1: number; lambda2: number } {
    // cov3D_view = V * cov3d * Vᵀ
    const Vt = transpose3(viewRot);
    const cov3dView = mat3Mul(mat3Mul(viewRot, cov3d), Vt);

    const [cx, cy, cz] = camPos;
    const invZ = 1.0 / cz;
    const invZ2 = invZ * invZ;

    // Correct Jacobian (row 0 sign fixed)
    const J = [
      -(focal[0] * invZ),            0.0,                           0.0,
       0.0,                          -focal[1] * invZ,              0.0,
       (focal[0] * cx) * invZ2,     -(focal[1] * cy) * invZ2,      0.0,
    ];

    const cov2d = mat3Mul(mat3Mul(J, cov3dView), transpose3(J));

    const a = cov2d[0], b = cov2d[1], d = cov2d[4];
    const mid = (a + d) / 2.0;
    const radius = Math.sqrt(((a - d) / 2.0) ** 2 + b * b);
    return { lambda1: mid + radius, lambda2: mid - radius };
  }

  // Named view rotations (column-major 3x3 rotation matrices)
  const viewRotations: Array<{ label: string; R: number[] }> = [
    { label: "identity",         R: [1,0,0, 0,1,0, 0,0,1] },
    { label: "90deg around X",   R: [1,0,0, 0,0,1, 0,-1,0] },
    { label: "90deg around Y",   R: [0,0,-1, 0,1,0, 1,0,0] },
    { label: "look down (-Y)",   R: [1,0,0, 0,0,1, 0,-1,0] },
    { label: "look up (+Y)",     R: [1,0,0, 0,0,-1, 0,1,0] },
    { label: "180deg around Y",  R: [-1,0,0, 0,1,0, 0,0,-1] },
  ];

  const splats: Array<{
    label: string;
    scale: [number,number,number];
    rotation: [number,number,number,number];
  }> = [
    { label: "flat disk XZ",    scale: [1.0, 0.01, 1.0], rotation: normalizeQuat([1,0,0,0]) },
    { label: "vertical slab",   scale: [0.1, 1.0, 0.1],  rotation: normalizeQuat([1,0,0,0]) },
    { label: "anisotropic",     scale: [2.0, 0.1, 0.5],  rotation: normalizeQuat([0.7071,0.7071,0,0]) },
  ];

  const focal: [number,number] = [800, 800];
  const camPos: [number,number,number] = [0.5, 0.3, -3.0];

  for (const splat of splats) {
    const cov3d = computeExpectedCov(splat.scale, splat.rotation);
    for (const view of viewRotations) {
      const { lambda1, lambda2 } = projectCov2D(cov3d, view.R, camPos, focal);
      assert(
        lambda2 >= -1e-4,
        `lambda2 negative: splat="${splat.label}" view="${view.label}" lambda2=${lambda2}`
      );
      assert(
        isFinite(lambda1) && isFinite(lambda2),
        `non-finite eigenvalue: splat="${splat.label}" view="${view.label}" l1=${lambda1} l2=${lambda2}`
      );
    }
    console.log(`PASS: view angle stress [${splat.label}]`);
  }
}

// ─── SUITE 3: loader quantization — rotation normalization ────────────────────
// SplatLoader packs rotation as (byte - 128) / 128, which is not normalized.
// packSplat's quatToMat3 assumes a unit quaternion. Test that normalizing
// before packing produces a PSD covariance, and skipping normalization may not.
{
  function simulateLoaderQuat(bytes: [number,number,number,number]): [number,number,number,number] {
    return [
      (bytes[0] - 128) / 128,
      (bytes[1] - 128) / 128,
      (bytes[2] - 128) / 128,
      (bytes[3] - 128) / 128,
    ];
  }

  const byteQuats: Array<[number,number,number,number]> = [
    [200, 100, 180, 150],
    [255, 128, 128, 128],
    [128, 255, 128, 128],
    [100, 100, 100, 200],
  ];

  for (const bytes of byteQuats) {
    const raw = simulateLoaderQuat(bytes);
    const len = Math.sqrt(raw.reduce((s,v) => s + v*v, 0));
    const normalized = raw.map(v => v / len) as [number,number,number,number];

    const covRaw  = computeExpectedCov([0.5, 0.2, 0.3], raw);
    const covNorm = computeExpectedCov([0.5, 0.2, 0.3], normalized);

    const { psd: psdNorm } = isSymmetricPSD(covNorm);
    assert(psdNorm, `Normalized quat should produce PSD cov for bytes ${bytes}`);

    const { psd: psdRaw, minEig } = isSymmetricPSD(covRaw);
    if (!psdRaw) {
      console.log(`  NOTE: unnormalized quat ${bytes} produced non-PSD cov (minEig=${minEig.toFixed(6)}) — normalize before packing`);
    }
  }
  console.log("PASS: loader quantization suite");
}

// ─── SUITE 4: viewMatrix upper-left 3x3 orthogonality ────────────────────────
// mat3(viewMatrix) is only a valid rotation if the camera has no scale.
// If it's not orthogonal, V * cov * Vᵀ is not a similarity transform and
// can produce a non-PSD result even from a valid input covariance.
{
  function mat3IsOrthogonal(M: number[]): { ok: boolean; maxErr: number } {
    // R * Rᵀ should equal identity
    const RRt = mat3Mul(M, transpose3(M));
    const identity = [1,0,0, 0,1,0, 0,0,1];
    const maxErr = RRt.reduce((m, v, i) => Math.max(m, Math.abs(v - identity[i])), 0);
    return { ok: maxErr < 1e-5, maxErr };
  }

  // Simulate Three.js camera at several positions using lookAt
  // viewMatrix = inverse of camera world matrix
  // For a camera at position P looking at origin with up=(0,1,0):
  function makeLookAtView(
    eye: [number,number,number],
    target: [number,number,number],
    up: [number,number,number]
  ): number[] {
    // forward = normalize(eye - target)
    let fx = eye[0]-target[0], fy = eye[1]-target[1], fz = eye[2]-target[2];
    const fl = Math.sqrt(fx*fx+fy*fy+fz*fz);
    fx/=fl; fy/=fl; fz/=fl;
    // right = normalize(forward x up)  -- note: Three.js uses right-hand
    let rx = fy*up[2]-fz*up[1], ry = fz*up[0]-fx*up[2], rz = fx*up[1]-fy*up[0];
    const rl = Math.sqrt(rx*rx+ry*ry+rz*rz);
    rx/=rl; ry/=rl; rz/=rl;
    // up = forward x right  (reorthogonalize)
    const ux = fy*rz-fz*ry, uy = fz*rx-fx*rz, uz = fx*ry-fy*rx;
    // column-major 3x3: columns are right, up, -forward... 
    // Three.js viewMatrix upper-left 3x3 rows are [right, up, -forward]
    // stored column-major: col0=(right.x, up.x, -fwd.x), etc.
    return [
      rx, ux, -fx,
      ry, uy, -fy,
      rz, uz, -fz,
    ];
  }

  const cameraPositions: Array<{ label: string; eye: [number,number,number] }> = [
    { label: "front",       eye: [0, 0, 5] },
    { label: "above",       eye: [0, 5, 0] },
    { label: "below",       eye: [0, -5, 0] },
    { label: "above-angle", eye: [2, 5, 2] },
    { label: "below-angle", eye: [2, -5, 2] },
  ];

  for (const { label, eye } of cameraPositions) {
    const V = makeLookAtView(eye, [0,0,0], [0,1,0]);
    const { ok, maxErr } = mat3IsOrthogonal(V);
    assert(ok, `viewMatrix upper-left 3x3 not orthogonal for camera "${label}": maxErr=${maxErr}`);
    console.log(`  view "${label}": orthogonal ✓ (maxErr=${maxErr.toExponential(2)})`);
  }

  // Also verify: V * cov * Vᵀ stays PSD for each view angle
  const cov3d = computeExpectedCov([1.0, 0.01, 1.0], normalizeQuat([1,0,0,0]));
  for (const { label, eye } of cameraPositions) {
    const V = makeLookAtView(eye, [0,0,0], [0,1,0]);
    const covView = mat3Mul(mat3Mul(V, cov3d), transpose3(V));
    const { psd, minEig } = isSymmetricPSD(covView);
    assert(psd, `V * cov * Vᵀ not PSD for camera "${label}": minEig=${minEig}`);
    console.log(`  cov view "${label}": PSD ✓`);
  }

  console.log("PASS: viewMatrix orthogonality suite");
}