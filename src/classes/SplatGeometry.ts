import * as THREE from "three";
import type { SplatDataBuffers } from "./SplatLoader";
import { packSplat } from "./SplatPacker";

/**
 * SplatGeometry - Handles geometry setup and data packing for splat rendering
 */

/**
 * Create and configure instanced geometry from splat data
 */
export function createSplatGeometry(data: SplatDataBuffers): {
	geometry: THREE.InstancedBufferGeometry;
	texture: THREE.DataTexture;
	textureSize: THREE.Vector2;
} {
	const geometry = new THREE.InstancedBufferGeometry();
	const WORDS_PER_SPLAT = 6; // texels per splat (one uint32 in .x per texel)

	// Set up quad base geometry (4 vertices, 2 triangles)
	const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
	geometry.setAttribute("position", new THREE.BufferAttribute(quad, 3));

	const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
	geometry.setIndex(new THREE.BufferAttribute(indices, 1));

	// Pack splat data into texture
	console.log(`[SplatGeometry] Packing ${data.numSplats} splats into texture...`);
	const texData = new Uint32Array(data.numSplats * WORDS_PER_SPLAT * 4);

	for (let i = 0; i < data.numSplats; i++) {
		const center: [number, number, number] = [
			data.positions[i * 3],
			data.positions[i * 3 + 1],
			data.positions[i * 3 + 2],
		];
		const scale: [number, number, number] = [
			data.scales[i * 3],
			data.scales[i * 3 + 1],
			data.scales[i * 3 + 2],
		];
		const rotation: [number, number, number, number] = [
			data.rotations[i * 4],
			data.rotations[i * 4 + 1],
			data.rotations[i * 4 + 2],
			data.rotations[i * 4 + 3],
		];
		const color: [number, number, number] = [
			data.colorsFloat[i * 3],
			data.colorsFloat[i * 3 + 1],
			data.colorsFloat[i * 3 + 2],
		];
		const opacity = data.opacityFloat[i];

		const packed = packSplat(center, scale, rotation, color, opacity);
		texData.set(packed, i * WORDS_PER_SPLAT * 4);
	}

	// Create texture
	const texels = data.numSplats * WORDS_PER_SPLAT;
	const texWidth = Math.ceil(Math.sqrt(texels));
	const texHeight = Math.ceil(texels / texWidth);
	console.log(
		`[SplatGeometry] Texture size: ${texWidth} x ${texHeight} (${data.numSplats} splats)`
	);

	const texture = new THREE.DataTexture(
		texData,
		texWidth,
		texHeight,
		THREE.RGBAIntegerFormat,
		THREE.UnsignedIntType
	);
	texture.needsUpdate = true;

	// Set up instanced attribute: just the splat index
	const indexArray = new Uint32Array(data.numSplats);
	for (let i = 0; i < data.numSplats; i++) {
		indexArray[i] = i;
	}
	geometry.setAttribute(
		"splatIndex",
		new THREE.InstancedBufferAttribute(indexArray, 1, false, 1)
	);

	geometry.instanceCount = Math.min(data.numSplats, 1000); // Start with 1000

	console.log(`[SplatGeometry] Geometry created, instanceCount: ${geometry.instanceCount}`);

	return {
		geometry,
		texture,
		textureSize: new THREE.Vector2(texWidth, texHeight),
	};
}
