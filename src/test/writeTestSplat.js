import fs from "fs";
import path from "path";

// Allocate 32 bytes for one splat record
const buffer = new ArrayBuffer(32);
const dv = new DataView(buffer);
let offset = 0;

// 1. Position (3 x float32)
dv.setFloat32(offset, 0.0, true); offset += 4; // X
dv.setFloat32(offset, 0.0, true); offset += 4; // Y
dv.setFloat32(offset, 0.0, true); offset += 4; // Z

// 2. Scale (3 x float32)
dv.setFloat32(offset, 1.0, true); offset += 4; // Scale X (Large)
dv.setFloat32(offset, 2.0, true); offset += 4; // Scale Y (Large)
dv.setFloat32(offset, 1.0, true); offset += 4; // Scale Z (Large)

// 3. Color (3 x uint8) & Opacity (1 x uint8)
// Note: setUint8 does not care about endianness
dv.setUint8(offset, 255); offset += 1; // R (Red)
dv.setUint8(offset, 0); offset += 1;   // G
dv.setUint8(offset, 0); offset += 1;   // B
dv.setUint8(offset, 255); offset += 1; // Alpha (Fully opaque)

// 4. Rotation (4 x uint8) - Quantized Quat
// Use 128 for the default, unrotated state (as per your loader's decode logic)
dv.setUint8(offset, 128); offset += 1; // Rot X
dv.setUint8(offset, 128); offset += 1; // Rot Y
dv.setUint8(offset, 128); offset += 1; // Rot Z
dv.setUint8(offset, 128); offset += 1; // Rot W

// Write the buffer to a file
fs.writeFileSync(path.join('./public/', 'test_red_sphere.splat'), Buffer.from(buffer));
console.log('Successfully created test_red_sphere.splat (32 bytes).');