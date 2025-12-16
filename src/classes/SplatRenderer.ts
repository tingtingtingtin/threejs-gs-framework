import * as THREE from "three";
import { SplatLoader } from "./SplatLoader";
import type { SplatDataBuffers } from "./SplatLoader";
import vertexShader from "../shaders/splat.vert?raw";
import fragmentShader from "../shaders/splat.frag?raw";

// Pack splat data into uvec4 texture format (matching Spark)
function packSplat(
	center: [number, number, number],
	scale: [number, number, number],
	rotation: [number, number, number, number],
	color: [number, number, number],
	opacity: number
): Uint32Array {
	const packed = new Uint32Array(4);

	// word0: RGBA colors
	const r = Math.round(color[0] * 255);
	const g = Math.round(color[1] * 255);
	const b = Math.round(color[2] * 255);
	const a = Math.round(opacity * 255);
	packed[0] = r | (g << 8) | (b << 16) | (a << 24);

	// word1: center.xy as float16
	const centerXYHalf = floatToHalf(center[0]) | (floatToHalf(center[1]) << 16);
	packed[1] = centerXYHalf;

	// word2: center.z as float16 + quat start
	const centerZHalf = floatToHalf(center[2]);
	const quatEncoded = encodeQuatSimple(rotation);
	const quatByte0 = quatEncoded & 0xff;
	const quatByte1 = (quatEncoded >> 8) & 0xff;
	packed[2] = centerZHalf | (quatByte0 << 16) | (quatByte1 << 24);

	// word3: scales + quat byte 2
	const scaleX = encodeLogScale(scale[0]);
	const scaleY = encodeLogScale(scale[1]);
	const scaleZ = encodeLogScale(scale[2]);
	const quatByte2 = (quatEncoded >> 16) & 0xff;
	packed[3] = scaleX | (scaleY << 8) | (scaleZ << 16) | (quatByte2 << 24);

	return packed;
}

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

function encodeLogScale(s: number): number {
	if (s === 0) return 0;
	const lnScale = Math.log(s);
	const lnScaleMin = -12.0;
	const lnScaleMax = 9.0;
	const lnScaleScale = 254.0 / (lnScaleMax - lnScaleMin);
	const encoded = Math.round(Math.max(0, Math.min(254, (lnScale - lnScaleMin) * lnScaleScale)));
	return encoded + 1;
}

function encodeQuatSimple(q: [number, number, number, number]): number {
	// Simple 24-bit encoding: pack x,y,z to 8 bits each, ignore w
	const x = Math.round((q[0] * 0.5 + 0.5) * 255);
	const y = Math.round((q[1] * 0.5 + 0.5) * 255);
	const z = Math.round((q[2] * 0.5 + 0.5) * 255);
	return x | (y << 8) | (z << 16);
}

export class SplatRenderer {
	public mesh: THREE.Mesh;

	private geometry: THREE.InstancedBufferGeometry;
	private material: THREE.ShaderMaterial;
	private loader: SplatLoader;
	private splatData?: SplatDataBuffers;
	private texture?: THREE.DataTexture;

	constructor(url: string) {
		this.geometry = new THREE.InstancedBufferGeometry();
		this.material = this.createMaterial();
		this.mesh = new THREE.Mesh(this.geometry, this.material);
		this.mesh.frustumCulled = false;
		this.loader = new SplatLoader();

		// Kick off loading without blocking construction.
		this.loadAndPrepare(url).catch((error) => {
			console.error("Failed to load splat data", error);
		});
	}

	private async loadAndPrepare(url: string): Promise<void> {
		console.log(`[SplatRenderer] Loading splat data from: ${url}`);
		try {
			const { parsed } = await this.loader.load(url);
			console.log(`[SplatRenderer] ✓ Loaded ${parsed.numSplats} splats`);
			this.splatData = parsed;
			this.setGeometryAttributes(parsed);
			console.log(`[SplatRenderer] ✓ Geometry attributes set up`);
		} catch (error) {
			console.error(`[SplatRenderer] ✗ Failed to load splat data:`, error);
			throw error;
		}
	}

	private setGeometryAttributes(data: SplatDataBuffers): void {
		const geometry = new THREE.InstancedBufferGeometry();

		// Set up quad base geometry (4 vertices, 2 triangles)
		const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
		geometry.setAttribute("position", new THREE.BufferAttribute(quad, 3));

		const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
		geometry.setIndex(new THREE.BufferAttribute(indices, 1));

		// Pack splat data into texture
		console.log(`[SplatRenderer] Packing ${data.numSplats} splats into texture...`);
		const texData = new Uint32Array(data.numSplats * 4);

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
			texData.set(packed, i * 4);
		}

		// Create texture
		const texWidth = Math.ceil(Math.sqrt(data.numSplats));
		const texHeight = Math.ceil(data.numSplats / texWidth);
		console.log(
			`[SplatRenderer] Texture size: ${texWidth} x ${texHeight} (${data.numSplats} splats)`
		);

		this.texture = new THREE.DataTexture(
			texData,
			texWidth,
			texHeight,
			THREE.RGBAIntegerFormat,
			THREE.UnsignedIntType
		);
		this.texture.needsUpdate = true;

		// Set texture and texture size in material
		this.material.uniforms.u_texture.value = this.texture;
		this.material.uniforms.u_textureSize.value = new THREE.Vector2(texWidth, texHeight);

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

		this.geometry = geometry;
		this.mesh.geometry = geometry;

		console.log(`[SplatRenderer] Texture created and bound, instanceCount: ${geometry.instanceCount}`);
	}

	private createMaterial(): THREE.ShaderMaterial {
		const fov = 75 * Math.PI / 180;
		const focal = window.innerHeight / (2.0 * Math.tan(fov / 2.0));

		console.log(`[SplatRenderer] Material created with focal length: ${focal.toFixed(2)}`);

		return new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms: {
				viewport: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
				focal: { value: focal },
				u_texture: { value: null },
				u_textureSize: { value: new THREE.Vector2(0, 0) },
			},
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending: THREE.CustomBlending,
			blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
			blendDstAlpha: THREE.OneFactor,
			blendEquation: THREE.AddEquation,
		});
	}
}
