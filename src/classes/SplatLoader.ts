export interface SplatDataBuffers {
  positions: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  colorsFloat?: Float32Array;
  colorsUint8?: Uint8Array;
  opacityFloat?: Float32Array;
  opacityUint8?: Uint8Array;
  stride: number;
  numSplats: number;
  headerOffset: number;
}

export class SplatLoader {
  /**
   * Load a .splat file from the given URL and return its raw ArrayBuffer and header info.
   * Header layout (example): first 4 bytes = uint32 number of splats (little-endian)
   * @param url - URL to the .splat file
   * @param signal - optional AbortSignal to cancel the request
   */
  async load(
    url: string,
    signal?: AbortSignal
  ): Promise<{ buffer: ArrayBuffer; numSplats: number }> {
    const res = await fetch(url, { method: "GET", signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }

    const buffer = await res.arrayBuffer();
    const dv = new DataView(buffer);

    if (dv.byteLength < 4) {
      throw new Error(`Invalid .splat file: header too small (${dv.byteLength} bytes)`);
    }

    // Read the number of splats from the first 4 bytes (change endianness if needed)
    const numSplats = dv.getUint32(0, true);

    return { buffer, numSplats };
  }

  /**
   * Parse splat binary data into optimized typed arrays.
   * @param buffer - ArrayBuffer containing splat data (including header if any)
   * @param numSplats - number of splats to read
   * @param options - parsing options
   *    - headerOffset: byte offset where splat records start (default 4)
   *    - colorUint8: store colors as `Uint8Array` (3 bytes per splat) when true, otherwise `Float32Array`
   *    - opacityUint8: store opacity as `Uint8Array` (1 byte per splat) when true, otherwise `Float32Array`
   *    - littleEndian: whether float values are little-endian (default true)
   */
  static parse(
    buffer: ArrayBuffer,
    numSplats: number,
    options?: {
      headerOffset?: number;
      colorUint8?: boolean;
      opacityUint8?: boolean;
      littleEndian?: boolean;
    }
  ): SplatDataBuffers {
    const opts = {
      headerOffset: 4,
      colorUint8: false,
      opacityUint8: false,
      littleEndian: true,
      ...(options || {}),
    } as Required<Exclude<typeof options, undefined>> & {
      headerOffset: number;
      colorUint8: boolean;
      opacityUint8: boolean;
      littleEndian: boolean;
    };

    const dv = new DataView(buffer);
    const le = opts.littleEndian;
    let offset = opts.headerOffset;

    // Per-splat fixed sizes (in bytes)
    const bytesPos = 3 * 4; // 3 floats
    const bytesScale = 3 * 4; // 3 floats
    const bytesRot = 4 * 4; // quaternion
    const bytesColor = opts.colorUint8 ? 3 : 3 * 4;
    const bytesOpacity = opts.opacityUint8 ? 1 : 4;

    const stride = bytesPos + bytesScale + bytesRot + bytesColor + bytesOpacity;

    if (buffer.byteLength < offset + numSplats * stride) {
      throw new Error(`Buffer too small for ${numSplats} splats (need ${offset + numSplats * stride} bytes, got ${buffer.byteLength}).`);
    }

    const positions = new Float32Array(numSplats * 3);
    const scales = new Float32Array(numSplats * 3);
    const rotations = new Float32Array(numSplats * 4);
    const colorsFloat = opts.colorUint8 ? undefined : new Float32Array(numSplats * 3);
    const colorsUint8 = opts.colorUint8 ? new Uint8Array(numSplats * 3) : undefined;
    const opacityFloat = opts.opacityUint8 ? undefined : new Float32Array(numSplats);
    const opacityUint8 = opts.opacityUint8 ? new Uint8Array(numSplats) : undefined;

    // Loop and populate arrays
    let readOffset = offset;
    for (let i = 0; i < numSplats; i++) {
      const pBase = i * 3;
      const sBase = i * 3;
      const rBase = i * 4;

      // positions
      positions[pBase + 0] = dv.getFloat32(readOffset, le); readOffset += 4;
      positions[pBase + 1] = dv.getFloat32(readOffset, le); readOffset += 4;
      positions[pBase + 2] = dv.getFloat32(readOffset, le); readOffset += 4;

      // scales
      scales[sBase + 0] = dv.getFloat32(readOffset, le); readOffset += 4;
      scales[sBase + 1] = dv.getFloat32(readOffset, le); readOffset += 4;
      scales[sBase + 2] = dv.getFloat32(readOffset, le); readOffset += 4;

      // rotations (quaternion)
      rotations[rBase + 0] = dv.getFloat32(readOffset, le); readOffset += 4;
      rotations[rBase + 1] = dv.getFloat32(readOffset, le); readOffset += 4;
      rotations[rBase + 2] = dv.getFloat32(readOffset, le); readOffset += 4;
      rotations[rBase + 3] = dv.getFloat32(readOffset, le); readOffset += 4;

      // colors
      if (opts.colorUint8 && colorsUint8) {
        colorsUint8[pBase + 0] = dv.getUint8(readOffset); readOffset += 1;
        colorsUint8[pBase + 1] = dv.getUint8(readOffset); readOffset += 1;
        colorsUint8[pBase + 2] = dv.getUint8(readOffset); readOffset += 1;
      } else if (colorsFloat) {
        colorsFloat[pBase + 0] = dv.getFloat32(readOffset, le); readOffset += 4;
        colorsFloat[pBase + 1] = dv.getFloat32(readOffset, le); readOffset += 4;
        colorsFloat[pBase + 2] = dv.getFloat32(readOffset, le); readOffset += 4;
      } else {
        // should not happen
        readOffset += bytesColor;
      }

      // opacity
      if (opts.opacityUint8 && opacityUint8) {
        opacityUint8[i] = dv.getUint8(readOffset); readOffset += 1;
      } else if (opacityFloat) {
        opacityFloat[i] = dv.getFloat32(readOffset, le); readOffset += 4;
      } else {
        readOffset += bytesOpacity;
      }
    }

    return {
      positions,
      scales,
      rotations,
      colorsFloat,
      colorsUint8,
      opacityFloat,
      opacityUint8,
      stride,
      numSplats,
      headerOffset: opts.headerOffset,
    };
  }
}