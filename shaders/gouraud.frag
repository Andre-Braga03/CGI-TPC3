#version 300 es

precision mediump float;
precision mediump int;

in vec3 v_color;

out vec4 fragColor;

void main() {
    fragColor = vec4(clamp(v_color, 0.0, 1.0), 1.0);
}