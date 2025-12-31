precision highp float;

in vec4 vColor;
in vec3 vPosition;
layout(location = 0) out vec4 fragColor;

void main() {
    float A = -dot(vPosition, vPosition);
    if (A < -4.0) discard;
    float B = exp(A) * vColor.a;
    fragColor = vec4(B * vColor.rgb, B);
}
