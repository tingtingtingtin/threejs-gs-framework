# Three.js Gaussian Splat Renderer (WIP - Learning Project)

A personal attempt to learn **Gaussian Splatting** by building a custom renderer with Three.js.

Heavily inspired by and modeled after [antimatter15/splat](https://github.com/antimatter15/splat/) by antimatter and [Spark](https://github.com/sparkjsdev/spark/) by World Labs Technologies.

## Tech Stack

- **Three.js**
- **TypeScript**
- **GLSL**
- **Vite**
- **Web Workers**

## Structure

**`/src/classes/`**
- **SplatLoader** - Loads and parses `.splat` binary files
- **SplatPacker** - Packs splat data into GPU textures (computes covariance matrices)
- **SplatGeometry** - Creates instanced quad geometry with DataTexture
- **SplatMaterial** - Shader material setup with viewport/focal uniforms
- **SplatRenderer** - Main class that orchestrates loading, rendering, and depth sorting
- **SplatWorker** - Web Worker for asynchronous depth sorting

**`/src/shaders/`**
- **splat.vert** - Vertex shader: unpacks data, projects 3D covariance to 2D, stretches quads
- **splat.frag** - Fragment shader: evaluates Gaussian falloff and applies color/opacity

## How It Works

1. Load binary splat file (position, scale, rotation, color per splat)
2. Pack data into texture with covariance matrices
3. Vertex shader projects each 3D Gaussian to screen-space ellipse
4. Fragment shader renders Gaussian falloff
5. Web Worker sorts splats by depth for correct alpha blending
