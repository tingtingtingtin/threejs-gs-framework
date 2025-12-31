import * as THREE from "three";
import vertexShader from "../shaders/splat.vert?raw";
import fragmentShader from "../shaders/splat.frag?raw";

export function createSplatMaterial(): THREE.ShaderMaterial {
    // Basic pinhole camera model focal length
    const fov = 75 * Math.PI / 180;
    const focal = window.innerHeight / (2.0 * Math.tan(fov / 2.0));

    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
						viewport: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
						focal: { value: focal },
						u_texture: { value: null },
						u_textureSize: { value: new THREE.Vector2(1, 1) },
				},
        transparent: true,
        depthTest: true, // Enable if you want z-buffering (usually false for splats, but helpful for debugging)
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
        blendDstAlpha: THREE.OneFactor,
        blendEquation: THREE.AddEquation,
    });

    // Handle Resize
    window.addEventListener("resize", () => {
        material.uniforms.viewport.value.set(window.innerWidth, window.innerHeight);
        const newFocal = window.innerHeight / (2.0 * Math.tan(fov / 2.0));
        material.uniforms.focal.value = newFocal;
    });

    return material;
}