/**
 * SplatPacker - Utilities for packing splat data into GPU-friendly formats
 */

/**
 * Pack splat parameters into a compact Uint32Array representation
 */
export function packSplat(
	center: [number, number, number],
	scale: [number, number, number],
	rotation: [number, number, number, number],
	color: [number, number, number],
	opacity: number
): Uint32Array {
	// 6 texels per splat, each texel is 4 uint32 components; we populate .x and leave others 0
	const packed = new Uint32Array(6 * 4);

	// word0 (texel 0, .x): RGBA colors packed into a single uint32
	const r = Math.round(color[0] * 255);
	const g = Math.round(color[1] * 255);
	const b = Math.round(color[2] * 255);
	const a = Math.round(opacity * 255);
	packed[0] = r | (g << 8) | (b << 16) | (a << 24);

	// word1 (texel 1, .x): center.xy as float16 packed into one uint32
	const centerXYHalf = floatToHalf(center[0]) | (floatToHalf(center[1]) << 16);
	packed[4] = centerXYHalf;

	// word2 (texel 2, .x): center.z as float16 (upper/lower 16 bits) — store in lower 16
	const centerZHalf = floatToHalf(center[2]);
	packed[8] = centerZHalf;

	// Compute world-space covariance from rotation and scale: V = R * diag(s^2) * R^T
	const R = quatToMat3(rotation);
	const s2 = [scale[0] * scale[0], scale[1] * scale[1], scale[2] * scale[2]];
	const V = mat3Mul(mat3Mul(R, mat3MulDiag(s2)), transpose3(R));

	// word3/4/5 (.x channels): pack the symmetric 3x3 covariance entries as half floats
	// Order: word3 -> (v00, v01), word4 -> (v11, v02), word5 -> (v12, v22)
	packed[12] = (floatToHalf(V[0]) & 0xffff) | (floatToHalf(V[1]) << 16); // v00 | v01
	packed[16] = (floatToHalf(V[4]) & 0xffff) | (floatToHalf(V[2]) << 16); // v11 | v02
	packed[20] = (floatToHalf(V[5]) & 0xffff) | (floatToHalf(V[8]) << 16); // v12 | v22

	return packed;
}

// Multiply A * B where both are 3x3 (array of 9, column-major)
function mat3Mul(A: number[], B: number[]): number[] {
	return [
		A[0] * B[0] + A[3] * B[1] + A[6] * B[2],
		A[1] * B[0] + A[4] * B[1] + A[7] * B[2],
		A[2] * B[0] + A[5] * B[1] + A[8] * B[2],

		A[0] * B[3] + A[3] * B[4] + A[6] * B[5],
		A[1] * B[3] + A[4] * B[4] + A[7] * B[5],
		A[2] * B[3] + A[5] * B[4] + A[8] * B[5],

		A[0] * B[6] + A[3] * B[7] + A[6] * B[8],
		A[1] * B[6] + A[4] * B[7] + A[7] * B[8],
		A[2] * B[6] + A[5] * B[7] + A[8] * B[8],
	];
}

function mat3MulDiag(d: number[]): number[] {
	return [
		d[0], 0, 0,
		0, d[1], 0,
		0, 0, d[2],
	];
}

function transpose3(M: number[]): number[] {
	return [
		M[0], M[3], M[6],
		M[1], M[4], M[7],
		M[2], M[5], M[8],
	];
}

function quatToMat3(q: [number, number, number, number]): number[] {
	const [x, y, z, w] = q;
	const x2 = x + x, y2 = y + y, z2 = z + z;
	const xx = x * x2, xy = x * y2, xz = x * z2;
	const yy = y * y2, yz = y * z2, zz = z * z2;
	const wx = w * x2, wy = w * y2, wz = w * z2;
	return [
		1 - (yy + zz), xy + wz, xz - wy,
		xy - wz, 1 - (xx + zz), yz + wx,
		xz + wy, yz - wx, 1 - (xx + yy),
	];
}

/**
 * Convert 32-bit float to 16-bit half-float representation
 */
function floatToHalf(f: number): number {
	const da = new DataView(new ArrayBuffer(4));
	da.setFloat32(0, f);
	const x = da.getInt32(0);

	let hs = (x >> 16) & 0x8000;
	let hm = ((x >> 12) & 0x07ff) | ((x >> 23) & 0x0001);
	let he = (x >> 23) & 0xff;

	if (he < 103) return hs;
	if (he > 142) return hs | 0x7c00;

	return hs | ((he - 112) << 10) | (hm >> 1);
}

/**
 * Encode scale value using logarithmic compression
 */
function encodeLogScale(s: number): number {
	if (s === 0) return 0;
	const lnScale = Math.log(s);
	const lnScaleMin = -12.0;
	const lnScaleMax = 9.0;
	const lnScaleScale = 254.0 / (lnScaleMax - lnScaleMin);
	const encoded = Math.round(Math.max(0, Math.min(254, (lnScale - lnScaleMin) * lnScaleScale)));
	return encoded + 1;
}

/**
 * Encode quaternion rotation into 24-bit representation
 * Packs x,y,z components to 8 bits each, ignoring w
 */
function encodeQuatSimple(q: [number, number, number, number]): number {
	const x = Math.round((q[0] * 0.5 + 0.5) * 255);
	const y = Math.round((q[1] * 0.5 + 0.5) * 255);
	const z = Math.round((q[2] * 0.5 + 0.5) * 255);
	return x | (y << 8) | (z << 16);
}
