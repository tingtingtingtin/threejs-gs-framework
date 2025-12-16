import * as THREE from 'three';
import { SplatRenderer } from '../classes/SplatRenderer';

// Mock Three.js Scene Setup (minimal)
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(200, 200);

// Mock .splat URL (use a lightweight test file if possible)
const TEST_URL = '/test.splat';

async function runSplatRendererTest() {
    console.log('--- Starting SplatRenderer Integration Test ---');

    // 1. Test Non-Blocking Initialization
    const splatRenderer = new SplatRenderer(TEST_URL);
    scene.add(splatRenderer.mesh);
    
    console.log('✅ Initialization: Renderer class instantiated successfully.');
    console.log('✅ Mesh Check: Mesh added to scene, loading in background.');
    
    // Wait for the asynchronous loading to complete
    // NOTE: You'll need to expose a promise or a ready state in SplatRenderer
    // For this test, we'll use a simple delay or check a property set after load.
    
    // Since the promise in SplatRenderer isn't public, we check for a key indicator:
    // We'll poll until the geometry's attributes are set.
    
    await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
            const geometry = splatRenderer.mesh.geometry as THREE.BufferGeometry;
            if (geometry.getAttribute('splatPosition')) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 50); // Check every 50ms
    });

    // 2. Test Instanced Geometry Setup
    const geometry = splatRenderer.mesh.geometry as THREE.BufferGeometry;

    // Check 2.1: Base Quad Attribute (The shared geometry)
    const positionAttr = geometry.getAttribute('position');
    if (positionAttr && positionAttr.count === 4) {
        console.log('✅ Geometry Check: Base 4-vertex quad attribute is set.');
    } else {
        console.error('❌ Geometry Check: Base quad attribute is missing or incorrect.');
    }

    // Check 2.2: Instanced Attributes (The data from the loader)
    const splatPosAttr = geometry.getAttribute('splatPosition') as THREE.InstancedBufferAttribute;
    const splatScaleAttr = geometry.getAttribute('splatScale') as THREE.InstancedBufferAttribute;
    const splatRotAttr = geometry.getAttribute('splatRotation') as THREE.InstancedBufferAttribute;

    if (splatPosAttr && splatPosAttr.isInstancedBufferAttribute) {
        console.log('✅ Instancing Check: splatPosition is correctly set as an InstancedBufferAttribute.');
        
        // Final crucial check: Data size verification (must be a multiple of the stride)
        const numSplats = splatPosAttr.count;
        const expectedPositionsLength = numSplats * 3;
        
        if (splatPosAttr.array.length === expectedPositionsLength) {
            console.log(`✅ Data Integrity: ${numSplats} splats loaded and attributes match expected size.`);
        } else {
            console.error(`❌ Data Integrity FAILED. Expected array length ${expectedPositionsLength}, got ${splatPosAttr.array.length}`);
        }
    } else {
        console.error('❌ Instancing Check: splatPosition attribute is missing or not instanced.');
    }

    // You would typically call renderer.render(scene, camera) here to visually test the output.

    console.log('\n--- SplatRenderer Test Complete ---');
}

runSplatRendererTest();