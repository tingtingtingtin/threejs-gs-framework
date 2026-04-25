import { mat3Mul, mat3MulDiag, transpose3, quatToMat3, floatToHalf } from "../utils/splatMath";

export function packSplat(
  center: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number, number],
  color: [number, number, number],
  opacity: number
): Uint32Array {
  // 2 texels per splat. Each texel has 4 components (RGBA / XYZW)
  const packed = new Uint32Array(2 * 4);

  // PIXEL 0: raw float center position (x, y, z)
  const floatView = new Float32Array(packed.buffer);
  floatView[0] = center[0];
  floatView[1] = center[1];
  floatView[2] = center[2];

  // PIXEL 1: covariance V = R * S * S^T * R^T as half-floats, color+opacity in .w
  const R = quatToMat3(rotation);
  const s2 = [scale[0] * scale[0], scale[1] * scale[1], scale[2] * scale[2]];
  const V = mat3Mul(mat3Mul(transpose3(R), mat3MulDiag(s2)), R);

  packed[4] = ((floatToHalf(V[0]*4) & 0xffff) | ((floatToHalf(V[1]*4) & 0xffff) << 16)) >>> 0;
  packed[5] = ((floatToHalf(V[2]*4) & 0xffff) | ((floatToHalf(V[4]*4) & 0xffff) << 16)) >>> 0;
  packed[6] = ((floatToHalf(V[5]*4) & 0xffff) | ((floatToHalf(V[8]*4) & 0xffff) << 16)) >>> 0;

  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  const a = Math.round(opacity * 255);
  packed[7] = r | (g << 8) | (b << 16) | (a << 24);

  return packed;
}
