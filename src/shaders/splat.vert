precision highp float;

// DO NOT UNCOMMENT
// uniform mat4 projectionMatrix;
// uniform mat4 modelViewMatrix;
uniform vec2 viewport;
uniform float focal;
uniform highp usampler2D u_texture;
uniform vec2 u_textureSize;

attribute uint splatIndex;

varying vec4 vColor;
varying vec2 vPosition;

// Unpack half float
float unpackHalf(uint u) {
    uint exponent = (u >> 10u) & 31u;
    uint mantissa = u & 1023u;
    float sign = (u & 32768u) != 0u ? -1.0 : 1.0;
    if (exponent == 0u) return sign * float(mantissa) / 8388608.0;
    if (exponent == 31u) return sign / 0.0;
    return sign * pow(2.0, float(exponent) - 15.0) * (1.0 + float(mantissa) / 1024.0);
}

void main() {
    // Fetch splat data from texture
    uint splatIdx = splatIndex;
    uint texW = 512u; // Adjust as needed
    uint x = splatIdx % texW;
    uint y = splatIdx / texW;
    
    uvec4 word0 = texelFetch(u_texture, ivec2(x, y), 0);
    uint x1 = (splatIdx * 4u + 1u) % texW; // Splat index * 4 words + 1 (for word1)
    uint y1 = (splatIdx * 4u + 1u) / texW;
    uvec4 word1 = texelFetch(u_texture, ivec2(x1, y1), 0);

    uint x2 = (splatIdx * 4u + 2u) % texW; // Splat index * 4 words + 2 (for word2)
    uint y2 = (splatIdx * 4u + 2u) / texW;
    uvec4 word2 = texelFetch(u_texture, ivec2(x2, y2), 0);
    
    // Extract color
    uint r = word0.x & 255u;
    uint g = (word0.x >> 8u) & 255u;
    uint b = (word0.x >> 16u) & 255u;
    uint a = (word0.x >> 24u) & 255u;
    
    vColor = vec4(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0, float(a) / 255.0);
    
    // Extract center position (simplified - just use center)
    // Word1: X is lower 16 bits, Y is upper 16 bits (JS: floatToHalf(Y) << 16 | floatToHalf(X))
    uint val1 = word1.x; // Access the X component of the uvec4 pixel
    uint posXPacked = val1 & 0xFFFFu;       // Lower 16 bits is X
    uint posYPacked = val1 >> 16u;          // Upper 16 bits is Y
    
    // Word2: Z is in the lower 16 bits (JS: centerZHalf)
    uint val2 = word2.x; // Access the X component of the uvec4 pixel
    uint posZPacked = val2 & 0xFFFFu;       // Lower 16 bits is Z
    
    float posX = unpackHalf(posXPacked);
    float posY = unpackHalf(posYPacked);
    float posZ = unpackHalf(posZPacked);
    
    vec3 splatPos = vec3(posX, posY, posZ);

    if (abs(posX) > 1000.0 || abs(posY) > 1000.0 || abs(posZ) > 1000.0) {
        splatPos = vec3(0.0, 0.0, 0.0);
    }
    
    vec4 camPos = modelViewMatrix * vec4(splatPos, 1.0);
    vec4 clipPos = projectionMatrix * camPos;
    
    vec2 center = clipPos.xy / clipPos.w;
    vec2 scale = vec2(1); // Placeholder scale
    
    gl_Position = vec4(center + position.xy * scale, clipPos.z, clipPos.w);
    vPosition = position.xy;
}
