import * as THREE from "three";
import { SplatLoader } from "./SplatLoader";
import type { SplatDataBuffers } from "./SplatLoader";
import { createSplatGeometry } from "./SplatGeometry";
import { createSplatMaterial } from "./SplatMaterial";

export class SplatRenderer {
	public mesh: THREE.Mesh;

	private geometry: THREE.InstancedBufferGeometry;
	private material: THREE.ShaderMaterial;
	private loader: SplatLoader;
	private splatData?: SplatDataBuffers;
	private texture?: THREE.DataTexture;

	constructor(url: string) {
		this.geometry = new THREE.InstancedBufferGeometry();
		this.material = createSplatMaterial();
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
		const { geometry, texture, textureSize } = createSplatGeometry(data);

		// Update material uniforms with texture data
		this.material.uniforms.u_texture.value = texture;
		this.material.uniforms.u_textureSize.value = textureSize;

		// Update renderer state
		this.texture = texture;
		this.geometry = geometry;
		this.mesh.geometry = geometry;

		console.log(`[SplatRenderer] ✓ Texture created and bound, instanceCount: ${geometry.instanceCount}`);
	}
}
