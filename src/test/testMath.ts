import { strict as assert } from "assert";
import {
  mat3Mul, mat3MulDiag, transpose3, quatToMat3
} from "../utils/splatMath.ts";

// ─── SUITE 1: Jacobian sign convention ───────────────────────────────────────
{
  const focal_x = 800.0;
  const focal_y = 800.0;
  const camZ = -3.0;
  const invZ = 1.0 / camZ;

  const shaderJ00 = focal_x * invZ;
  const shaderJ11 = -focal_y * invZ;
  const correctJ00 = focal_x / (-camZ);
  const correctJ11 = focal_y / (-camZ);

  assert(shaderJ00 < 0, `Shader J[0][0] should be negative (sign bug), got ${shaderJ00}`);
  assert(shaderJ11 > 0, `Shader J[1][1] should be positive, got ${shaderJ11}`);
  assert(Math.sign(shaderJ00) !== Math.sign(correctJ00), `Row 0 diagonal sign should differ`);
  assert(Math.sign(shaderJ11) === Math.sign(correctJ11), `Row 1 diagonal sign should agree`);

  console.log(`Shader  J[0][0]=${shaderJ00.toFixed(4)}, J[1][1]=${shaderJ11.toFixed(4)}`);
  console.log(`Correct J[0][0]=${correctJ00.toFixed(4)}, J[1][1]=${correctJ11.toFixed(4)}`);
  console.log("PASS: Jacobian sign suite");
}

// ─── SUITE 2: NaN survival through eigenvalue guard ──────────────────────────
{
  function eigenvalues(a: number, b: number, d: number): [number, number] {
    const mid = (a + d) / 2.0;
    const radius = Math.sqrt(((a - d) / 2.0) ** 2 + b * b);
    return [mid + radius, mid - radius];
  }

  {
    const [l1, l2] = eigenvalues(4.0, 1.0, 2.0);
    assert(isFinite(l1) && isFinite(l2), "Normal splat eigenvalues should be finite");
    assert(l2 >= 0, "Normal splat lambda2 should be non-negative");
  }

  {
    const [l1, l2] = eigenvalues(1.0, 10.0, 1.0);
    assert(l2 < 0, `Non-PSD cov should produce negative lambda2, got ${l2}`);
    console.log(`Non-PSD: l1=${l1.toFixed(4)}, l2=${l2.toFixed(4)}, guard fires: ${l2 < 0}`);
  }

  {
    const [l1, l2] = eigenvalues(NaN, 0.0, 1.0);
    assert(!(l2 < 0), "NaN lambda2 < 0 is false — guard does NOT fire");
    console.log(`NaN cov: l1=${l1}, l2=${l2}, guard fires: ${l2 < 0}`);
  }

  console.log("PASS: NaN/non-PSD survival suite");
}

// ─── SUITE 3: quaternion normalization effect on covariance PSD ───────────────
{
  function covFromQuat(q: [number, number, number, number], s: [number, number, number]): number[] {
    const R = quatToMat3(q);
    const S2 = mat3MulDiag([s[0]*s[0], s[1]*s[1], s[2]*s[2]]);
    return mat3Mul(mat3Mul(R, S2), transpose3(R));
  }

  function isSymmetricPSD(M: number[]): boolean {
    const m00 = M[0];
    const det2 = M[0]*M[4] - M[1]*M[3];
    const det3 = 
      M[0]*(M[4]*M[8] - M[5]*M[7]) -
      M[1]*(M[3]*M[8] - M[5]*M[6]) +
      M[2]*(M[3]*M[7] - M[4]*M[6]);
    return m00 >= -1e-9 && det2 >= -1e-9 && det3 >= -1e-9;
  }

  const norm = Math.sqrt(0.5*0.5 + 0.5*0.5 + 0.5*0.5 + 0.5*0.5);
  const nq: [number,number,number,number] = [0.5/norm, 0.5/norm, 0.5/norm, 0.5/norm];
  const covNorm = covFromQuat(nq, [1.0, 0.5, 0.1]);
  assert(isSymmetricPSD(covNorm), "Normalized quaternion should produce PSD covariance");
  console.log("Normalized quat covariance is PSD: true");

  const covUnnorm = covFromQuat([2.0, 1.0, 0.5, 0.3], [1.0, 0.5, 0.1]);
  const psd = isSymmetricPSD(covUnnorm);
  console.log(`Unnormalized quat covariance is PSD: ${psd} (expect false or marginal)`);

  console.log("PASS: quaternion normalization suite");
}

// ─── SUITE 4: bare return leaves gl_Position undefined ───────────────────────
{
  function computeLambda2(a: number, b: number, d: number): number {
    const mid = (a + d) / 2.0;
    const radius = Math.sqrt(((a - d) / 2.0) ** 2 + b * b);
    return mid - radius;
  }

  const l2 = computeLambda2(1e-7, 1e-7, 1e-7);
  console.log(`Near-degenerate lambda2=${l2}`);
  console.log("NOTE: bare `return` without setting gl_Position is UB — always set gl_Position = vec4(0,0,2,1) first");
  console.log("PASS: bare return suite");
}