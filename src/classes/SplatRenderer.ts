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

  // Sorting State
  private worker: Worker;
  private isSorting = false;
  private needsSort = false;

  constructor(url: string) {
    this.geometry = new THREE.InstancedBufferGeometry();
    this.material = createSplatMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.loader = new SplatLoader();

    this.material.transparent = true;
    this.material.depthWrite = false;
    // this.material.depthTest = true;
    this.material.blending = THREE.NormalBlending;

    // Initialize Worker
    this.worker = new Worker(new URL("./SplatWorker.ts", import.meta.url));
    this.worker.onmessage = (e) => this.handleWorkerMessage(e);

    this.loadAndPrepare(url).catch((error) => {
      console.error("Failed to load splat data", error);
    });
  }

  private handleWorkerMessage(e: MessageEvent): void {
    if (e.data.method === "sortDone") {
      const { depthIndex } = e.data;
      
      // Update the splatIndex attribute with the new sorted order
      const indexAttr = new THREE.InstancedBufferAttribute(depthIndex, 1, false, 1);
      this.geometry.setAttribute("splatIndex", indexAttr);
      indexAttr.needsUpdate = true;
      
      this.isSorting = false;

      if (this.needsSort) {
        this.needsSort = false;
        this.update();
      }
    }
  }

  /**
   * Triggers the depth sort. Should be called when the camera move.
   */
  public update(): void {
    if (!this.splatData || this.isSorting) {
      this.needsSort = true;
      return;
    }

    this.isSorting = true;
    this.worker.postMessage({
      method: "sort",
      data: {
        viewMatrix: this.mesh.modelViewMatrix.elements,
        vertexCount: this.splatData.numSplats,
      },
    });
  }

	private async loadAndPrepare(url: string): Promise<void> {
		console.log(`[SplatRenderer] Loading splat data from: ${url}`);
		try {
			const { buffer, numSplats, parsed } = await this.loader.load(url);
			console.log(`[SplatRenderer] ✓ Loaded ${numSplats} splats`);
			this.splatData = parsed;

			// Create geometry with chunked packing (non-blocking)
			const { geometry, texture, textureSize } = await createSplatGeometry(parsed);

			this.material.uniforms.u_texture.value = texture;
			this.material.uniforms.u_textureSize.value = textureSize;

			this.texture = texture;
			this.geometry = geometry;
			this.mesh.geometry = geometry;

			// Initial sort
			this.update();

			console.log(`[SplatRenderer] ✓ Texture created and bound, instanceCount: ${geometry.instanceCount}`);
		} catch (error) {
			console.error(`[SplatRenderer] ✗ Failed to load splat data:`, error);
			throw error;
		}
	}
}