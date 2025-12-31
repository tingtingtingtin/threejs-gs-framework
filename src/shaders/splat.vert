precision highp float;
precision highp int;

// Three.js Built-ins
// uniform mat4 projectionMatrix;
// uniform mat4 modelViewMatrix;
// in vec3 position; // The quad vertices: [-2, 2]

// Custom Uniforms
uniform vec2 viewport;
uniform vec2 focal;
uniform highp usampler2D u_texture;
uniform vec2 u_textureSize;

// Instanced Attribute
in uint splatIndex;

// Outputs to Fragment Shader
out vec4 vColor;
out vec3 vPosition;

void main() {
    uint globalTexelIndex = splatIndex * 2u;
    uint width = uint(u_textureSize.x);
    
    ivec2 texPos0 = ivec2(globalTexelIndex % width, globalTexelIndex / width);
    ivec2 texPos1 = ivec2((globalTexelIndex + 1u) % width, (globalTexelIndex + 1u) / width);

    uvec4 pixel0 = texelFetch(u_texture, texPos0, 0); // Position
    uvec4 pixel1 = texelFetch(u_texture, texPos1, 0); // Covariance + Color

    vec3 splatPos = vec3(uintBitsToFloat(pixel0.x), uintBitsToFloat(pixel0.y), uintBitsToFloat(pixel0.z));
    
    // Transform to Camera Space
    vec4 camPos = viewMatrix * vec4(splatPos, 1.0);
    vec4 clipPos = projectionMatrix * camPos;

    float clip = 1.2 * clipPos.w;
    if (clipPos.z < -clip || abs(clipPos.x) > clip || abs(clipPos.y) > clip) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // reconstruct 3d covariance from pixel 1
    vec2 u1 = unpackHalf2x16(pixel1.x); 
    vec2 u2 = unpackHalf2x16(pixel1.y); 
    vec2 u3 = unpackHalf2x16(pixel1.z);
    
    mat3 cov3d = mat3(
        u1.x, u1.y, u2.x, 
        u1.y, u2.y, u3.x, 
        u2.x, u3.x, u3.y
    );

    // complex jacobian
    mat3 V = mat3(viewMatrix);
    mat3 cov3D_view = V * cov3d * transpose(V);

    // 
    // float invZ = 1.0 / camPos.z; // Use raw Z here
    // vec2 J1 = focal * invZ;
    // vec2 J2 = -(J1 * camPos.xy) * invZ;

    // mat3 J = mat3(
    //     J1.x, 0.0, -J2.x,
    //     0.0, J1.y, J2.y,
    //     0.0, 0.0, 0.0
    // );

    // mat3 cov2d = transpose(J) * cov3D_view * J;

//     float invZ = 1.0 / camPos.z;
// float invZ2 = invZ * invZ;

// mat3 J = mat3(
//     focal.x * invZ, 0.0, 0.0,                                // Column 0
//     0.0, focal.y * invZ, 0.0,                                // Column 1
//     -(focal.x * camPos.x) * invZ2, -(focal.y * camPos.y) * invZ2, 0.0 // Column 2
// );

    // simple jacobian
    mat3 J = mat3(
        focal.x / camPos.z, 0., -(focal.x * camPos.x) / (camPos.z * camPos.z),
        0., -focal.y / camPos.z, (focal.y * camPos.y) / (camPos.z * camPos.z),
        0., 0., 0.
    );

    // project view space cov to 2d
    mat3 W = mat3(viewMatrix);
    mat3 T = W * J;
    mat3 cov2d = transpose(T) * cov3d * T;
    
    // apply blur to prevent antialiasing
    cov2d[0][0] += 0.3;
    cov2d[1][1] += 0.3;

    // eigenvalue decomp
    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    float lambda1 = mid + radius;
    float lambda2 = mid - radius;

    if (lambda2 < 0.0) return;

    // Calculate axis vectors for the quad stretching
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]) + vec2(0.0, 1e-6));
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

    uint c = pixel1.w;
    vColor = vec4(float(c & 0xffu), float((c >> 8) & 0xffu), float((c >> 16) & 0xffu), float(c >> 24)) / 255.0;

    vPosition = position;

    // center in clip space
    vec2 vCenter = clipPos.xy / clipPos.w;
    vec2 ndcOffset = (position.x * majorAxis + position.y * minorAxis) / viewport;

gl_Position = vec4((vCenter + ndcOffset) * clipPos.w, clipPos.z, clipPos.w);

// Test
    // majorAxis = vec2(50.0, 0.0);
    // minorAxis = vec2(0.0, 50.0);
    // gl_Position = vec4(vCenter + position.x * majorAxis / viewport + position.y * minorAxis / viewport, clipPos.z / clipPos.w, 1.0);
}