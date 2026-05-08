import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SplatRenderer } from "./classes/SplatRenderer";
import type { SplatRendererProgress } from "./classes/SplatRenderer";

/** Configuration options for {@link SplatViewer}. */
export interface SplatViewerOptions {
  /** URL of the `.splat` file to load. */
  url: string;
  /** Optional background color for the scene. Accepts any THREE.js color representation. */
  background?: THREE.ColorRepresentation;
  /**
   * WASD fly-through speed in world-units per second.
   * @defaultValue 3
   */
  moveSpeed?: number;
  /**
   * Enable WASD keyboard navigation.
   * @defaultValue true
   */
  enableWASD?: boolean;
  /**
   * Enable right-mouse-button drag to pan the camera.
   * @defaultValue true
   */
  enableRightDragPan?: boolean;
  /** Called periodically while the splat file is being downloaded and parsed. */
  onProgress?: (progress: SplatRendererProgress) => void;
}

/**
 * High-level viewer for 3D Gaussian Splat scenes.
 *
 * `SplatViewer` creates and owns a Three.js `WebGLRenderer`, `Scene`,
 * `PerspectiveCamera`, and `OrbitControls`, then streams and renders a `.splat`
 * file into the given container element.
 *
 * @example
 * ```ts
 * const viewer = new SplatViewer(document.getElementById("canvas-container")!, {
 *   url: "/scene.splat",
 *   background: 0x111111,
 *   enableWASD: true,
 * });
 * await viewer.waitUntilReady();
 * ```
 *
 * Call {@link dispose} when the viewer is no longer needed to release all GPU
 * resources and remove event listeners.
 */
export class SplatViewer {
  /** The underlying Three.js WebGL renderer. The canvas element is appended to `container`. */
  public readonly renderer: THREE.WebGLRenderer;
  /** The Three.js scene that contains the splat mesh and camera. */
  public readonly scene: THREE.Scene;
  /** Perspective camera used for rendering. FOV is 75°; near/far are 0.1/1000. */
  public readonly camera: THREE.PerspectiveCamera;
  /** OrbitControls instance. Damping is enabled; panning via OrbitControls is disabled in favour of right-drag pan. */
  public readonly controls: OrbitControls;
  /** Low-level splat renderer responsible for loading, sorting, and drawing Gaussian splats. */
  public readonly splatRenderer: SplatRenderer;

  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly initialCameraPosition: THREE.Vector3;
  private readonly initialTarget: THREE.Vector3;
  private readonly moveSpeed: number;
  private readonly enableWASD: boolean;
  private readonly enableRightDragPan: boolean;

  private animationId?: number;
  private consistencyCheckTimeoutId?: number;
  private lastMoveTime = performance.now();

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;

  private isRightDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;

  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  private readonly onControlsChange = () => {
    this.splatRenderer.update();
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.enableWASD) {
      return;
    }

    if ((e.target as HTMLElement | null)?.tagName === "INPUT") {
      return;
    }

    const key = e.key.toLowerCase();
    if (key === "w") this.moveForward = true;
    if (key === "s") this.moveBackward = true;
    if (key === "a") this.moveLeft = true;
    if (key === "d") this.moveRight = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (!this.enableWASD) {
      return;
    }

    const key = e.key.toLowerCase();
    if (key === "w") this.moveForward = false;
    if (key === "s") this.moveBackward = false;
    if (key === "a") this.moveLeft = false;
    if (key === "d") this.moveRight = false;
  };

  private readonly onContextMenu = (e: MouseEvent) => {
    if (!this.enableRightDragPan) {
      return;
    }

    if (e.target === this.renderer.domElement) {
      e.preventDefault();
    }
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.enableRightDragPan || e.button !== 2) {
      return;
    }

    if (e.target !== this.renderer.domElement) {
      return;
    }

    this.isRightDragging = true;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    e.preventDefault();
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.enableRightDragPan || !this.isRightDragging) {
      return;
    }

    const deltaX = e.clientX - this.lastDragX;
    const deltaY = e.clientY - this.lastDragY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;

    this.panByScreenDelta(deltaX, deltaY);
    this.splatRenderer.update();
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (!this.enableRightDragPan) {
      return;
    }

    if (e.button === 2) {
      this.isRightDragging = false;
    }
  };

  /**
   * Creates a new `SplatViewer`, appends its canvas to `container`, and begins
   * loading the splat file specified by `options.url`.
   *
   * @param container - DOM element that will host the renderer canvas. The
   *   canvas is sized to match the container and updates automatically via
   *   `ResizeObserver`.
   * @param options - Viewer configuration. See {@link SplatViewerOptions}.
   */
  constructor(container: HTMLElement, options: SplatViewerOptions) {
    const {
      url,
      background,
      moveSpeed = 3,
      enableWASD = true,
      enableRightDragPan = true,
      onProgress,
    } = options;

    this.container = container;
    this.moveSpeed = moveSpeed;
    this.enableWASD = enableWASD;
    this.enableRightDragPan = enableRightDragPan;

    this.scene = new THREE.Scene();
    if (background !== undefined) {
      this.scene.background = new THREE.Color(background);
    }

    const { width, height } = this.getContainerSize();

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.z = 3;
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ alpha: true });
    this.renderer.setClearColor(0xaaaaaa, 0);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.addEventListener("change", this.onControlsChange);

    this.splatRenderer = new SplatRenderer(url, this.camera, { onProgress });
    this.scene.add(this.splatRenderer.mesh);

    this.initialCameraPosition = this.camera.position.clone();
    this.initialTarget = new THREE.Vector3(0, 0, 0);

    this.resizeObserver = new ResizeObserver(() => {
      this.onResize();
      this.scheduleConsistencyCheck("resize", false);
    });
    this.resizeObserver.observe(this.container);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("contextmenu", this.onContextMenu);
    this.renderer.domElement.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);

    this.animate();
  }

  /**
   * Returns a promise that resolves once the splat file has been fully loaded
   * and the first frame has been rendered.
   */
  public waitUntilReady(): Promise<void> {
    return this.splatRenderer.waitUntilReady();
  }

  /**
   * Limits rendering to a percentage of the total splat count, which can
   * improve performance on lower-end hardware.
   *
   * @param percent - Desired percentage of splats to render (1–100). Values
   *   outside this range are clamped.
   * @returns The actual instance count that was set, or `0` if the splat data
   *   is not yet loaded.
   */
  public setInstancePercent(percent: number): number {
    const totalSplats = this.splatRenderer.getTotalSplats();
    const safePercent = Math.min(100, Math.max(1, Math.round(percent)));
    if (totalSplats <= 0) {
      return 0;
    }

    const instanceCount = Math.max(1, Math.floor((totalSplats * safePercent) / 100));
    this.splatRenderer.setInstanceCount(instanceCount);
    this.scheduleConsistencyCheck("instance-percent-change", false);
    return instanceCount;
  }

  /**
   * Resets the camera to its initial position and re-initialises the splat
   * renderer state.
   *
   * @param reason - Descriptive label logged internally when a consistency
   *   reset is triggered (useful for debugging).
   */
  public reset(reason = "manual"): void {
    this.resetCameraPose();
    this.splatRenderer.reset(reason);
  }

  /**
   * Returns a snapshot of current viewer statistics.
   *
   * @returns An object containing:
   * - `totalSplats` — total number of Gaussians in the loaded scene.
   * - `instanceCount` — number of Gaussians currently being rendered.
   * - `cameraPosition` — a clone of the current camera world position.
   */
  public getStats() {
    return {
      totalSplats: this.splatRenderer.getTotalSplats(),
      instanceCount: this.splatRenderer.getInstanceCount(),
      cameraPosition: this.camera.position.clone(),
    };
  }

  /**
   * Pauses the render loop. No frames are rendered until {@link resume} is
   * called. Safe to call when the viewer is already paused.
   */
  public pause(): void {
    if (this.animationId !== undefined) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
  }

  /**
   * Resumes the render loop after a {@link pause}. Safe to call when the
   * viewer is already running.
   */
  public resume(): void {
    if (this.animationId === undefined) {
      this.lastMoveTime = performance.now();
      this.animate();
    }
  }

  /**
   * Tears down the viewer completely: cancels the render loop, disconnects
   * observers, removes all event listeners, and releases WebGL resources.
   *
   * The canvas element is also removed from the DOM. After calling `dispose`,
   * the `SplatViewer` instance must not be used.
   */
  public dispose(): void {
    if (this.animationId !== undefined) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }

    if (this.consistencyCheckTimeoutId !== undefined) {
      window.clearTimeout(this.consistencyCheckTimeoutId);
      this.consistencyCheckTimeoutId = undefined;
    }

    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.onControlsChange);
    this.controls.dispose();

    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    this.renderer.domElement.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Falls back to `window.innerWidth/Height` when the container has no layout size yet. */
  private getContainerSize(): { width: number; height: number } {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    return { width, height };
  }

  private onResize(): void {
    const { width, height } = this.getContainerSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /**
   * Debounces a GPU-state consistency check so that rapid triggers (e.g. many
   * resize events in quick succession) collapse into a single check 180 ms
   * after the last event.
   */
  private scheduleConsistencyCheck(reason: string, includeCameraReset: boolean): void {
    if (this.consistencyCheckTimeoutId !== undefined) {
      window.clearTimeout(this.consistencyCheckTimeoutId);
    }

    this.consistencyCheckTimeoutId = window.setTimeout(() => {
      const didReset = this.splatRenderer.verifyStateAndResetIfNeeded();
      if (didReset && includeCameraReset) {
        this.resetCameraPose();
      }
      if (didReset) {
        console.warn(`[SplatViewer] Renderer consistency reset after ${reason}`);
      }
    }, 180);
  }

  private resetCameraPose(): void {
    this.camera.position.copy(this.initialCameraPosition);
    this.controls.target.copy(this.initialTarget);
    this.controls.update();
  }

  /**
   * Translates the camera and orbit target together by a screen-space pixel
   * delta, preserving the focal distance so panning feels scale-appropriate.
   */
  private panByScreenDelta(deltaX: number, deltaY: number): void {
    const { height } = this.getContainerSize();
    const toTarget = this.camera.position.distanceTo(this.controls.target);
    const fovRadians = THREE.MathUtils.degToRad(this.camera.fov);
    const worldUnitsPerPixelY = (2 * toTarget * Math.tan(fovRadians / 2)) / height;
    const worldUnitsPerPixelX = worldUnitsPerPixelY * this.camera.aspect;

    const rightAxis = new THREE.Vector3()
      .setFromMatrixColumn(this.camera.matrixWorld, 0)
      .normalize();
    const upAxis = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();

    const offset = new THREE.Vector3()
      .addScaledVector(rightAxis, -deltaX * worldUnitsPerPixelX)
      .addScaledVector(upAxis, deltaY * worldUnitsPerPixelY);

    this.camera.position.add(offset);
    this.controls.target.add(offset);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const deltaSeconds = (now - this.lastMoveTime) / 1000;
    this.lastMoveTime = now;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) {
      forward.normalize();
    }

    const right = new THREE.Vector3().crossVectors(forward, this.worldUp).normalize();
    const velocity = this.moveSpeed * deltaSeconds;
    let moved = false;

    if (this.enableWASD && this.moveForward) {
      this.camera.position.addScaledVector(forward, velocity);
      this.controls.target.addScaledVector(forward, velocity);
      moved = true;
    }
    if (this.enableWASD && this.moveBackward) {
      this.camera.position.addScaledVector(forward, -velocity);
      this.controls.target.addScaledVector(forward, -velocity);
      moved = true;
    }
    if (this.enableWASD && this.moveLeft) {
      this.camera.position.addScaledVector(right, -velocity);
      this.controls.target.addScaledVector(right, -velocity);
      moved = true;
    }
    if (this.enableWASD && this.moveRight) {
      this.camera.position.addScaledVector(right, velocity);
      this.controls.target.addScaledVector(right, velocity);
      moved = true;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (moved) {
      this.splatRenderer.update();
    }
  }
}
