let positions: Float32Array;
let vertexCount = 0;

self.onmessage = (e: MessageEvent) => {
  const { method, data } = e.data;

  if (method === "setData") {
    // We use the raw buffer from the .splat file
    vertexCount = data.numSplats;
    positions = new Float32Array(data.buffer);
  }

  if (method === "sort") {
    if (!positions) return;
    const { viewMatrix } = data;

    const depths = new Int32Array(vertexCount);
    let minDepth = 1000000;
    let maxDepth = -1000000;

    // 1. Calculate Depths in Camera Space
    for (let i = 0; i < vertexCount; i++) {
      // 32 bytes per splat = 8 floats per splat
      const fOffset = i * 8; 
      const x = positions[fOffset + 0];
      const y = positions[fOffset + 1];
      const z = positions[fOffset + 2];

      // Depth = Z-component of position in camera space
      const d = (viewMatrix[2] * x + viewMatrix[6] * y + viewMatrix[10] * z + viewMatrix[14]) * 4096;
      const depth = d | 0;
      depths[i] = depth;

      if (depth < minDepth) minDepth = depth;
      if (depth > maxDepth) maxDepth = depth;
    }

    // 2. Linear Time Counting Sort
    const depthIndex = new Uint32Array(vertexCount);
    const range = 256 * 256;
    const counts = new Uint32Array(range);
    const depthInv = (range - 1) / (maxDepth - minDepth);

    for (let i = 0; i < vertexCount; i++) {
      depths[i] = ((depths[i] - minDepth) * depthInv) | 0;
      counts[depths[i]]++;
    }

    for (let i = 1; i < range; i++) counts[i] += counts[i - 1];
    for (let i = vertexCount - 1; i >= 0; i--) {
      depthIndex[--counts[depths[i]]] = i;
    }

    self.postMessage({ method: "sortDone", depthIndex, transfer: depthIndex.buffer});
  }
};