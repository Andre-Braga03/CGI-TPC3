#version 300 es

precision mediump int;
precision mediump float;

const int MAX_LIGHTS = 3;

in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

uniform int u_n_lights;

// Light arrays
uniform mediump vec3  u_light_ambient[MAX_LIGHTS];
uniform mediump vec3  u_light_diffuse[MAX_LIGHTS];
uniform mediump vec3  u_light_specular[MAX_LIGHTS];
uniform mediump vec4  u_light_position[MAX_LIGHTS];
uniform mediump vec3  u_light_axis[MAX_LIGHTS];
uniform mediump float u_light_aperture[MAX_LIGHTS];
uniform mediump float u_light_cutoff[MAX_LIGHTS];
uniform mediump int   u_light_type[MAX_LIGHTS];
uniform mediump int   u_light_enabled[MAX_LIGHTS];

struct MaterialInfo {
    mediump vec3 Ka;
    mediump vec3 Kd;
    mediump vec3 Ks;
    mediump float shininess;
};

uniform MaterialInfo u_material;

out vec3 v_position; // position in eye space
out vec3 v_normal;   // normal in eye space

void main() {
    vec4 positionEye = u_modelViewMatrix * vec4(a_position, 1.0);
    vec3 normalEye   = normalize(u_normalMatrix * a_normal);

    v_position = positionEye.xyz;
    v_normal   = normalEye;

    gl_Position = u_projectionMatrix * positionEye;
}
