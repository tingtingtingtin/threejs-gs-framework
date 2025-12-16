precision highp float;

varying vec4 vColor;
varying vec2 vPosition;

void main() {
    // Flat color output for debugging
    gl_FragColor = vec4(vColor.rgb, 1.0);
}
