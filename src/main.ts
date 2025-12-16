import './style.css'
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SplatRenderer } from './classes/SplatRenderer';

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75, // FOV
  sizes.width / sizes.height, // aspect ratio
  0.1, // near clipping plane
  1000, // far clipping plane
);
camera.position.z = 3;
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  // optionally add settings like antialiasing, alpha channel, etc
});
renderer.setClearColor(0xAAAAAA);
renderer.setSize(sizes.width, sizes.height);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x0077ff });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(2, 2, 5);
scene.add(light);

const splatRenderer = new SplatRenderer("test_red_sphere.splat");

if (splatRenderer && (splatRenderer as any).mesh) {
  scene.add((splatRenderer as any).mesh);
  console.log('SplatRenderer mesh added to scene');
} else {
  console.warn('SplatRenderer created but mesh not available yet; add it once loaded.');
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
})