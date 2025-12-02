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

out vec3 v_color; // interpolated color

// Same Phong lighting function used here in the vertex
vec3 phongLighting(vec3 position, vec3 normal, MaterialInfo material) {
    vec3 color = vec3(0.0);

    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= u_n_lights) break;
        if (u_light_enabled[i] == 0) continue;

        int  lightType    = u_light_type[i];
        vec4 lightPos4    = u_light_position[i];
        vec3 lightPos     = lightPos4.xyz;
        vec3 lightAmbient = u_light_ambient[i];
        vec3 lightDiffuse = u_light_diffuse[i];
        vec3 lightSpecular= u_light_specular[i];

        vec3 L;
        if (lightType == 1) {
            L = normalize(-lightPos);
        } else {
            L = normalize(lightPos - position);
        }

        float spotAttenuation = 1.0;
        if (lightType == 2) {
            vec3 lightDir  = normalize(-u_light_axis[i]);
            float cosAlpha = dot(L, lightDir);
            float cosAperture = cos(radians(u_light_aperture[i] / 2.0));

            if (cosAlpha >= cosAperture) {
                spotAttenuation = pow(max(0.0, cosAlpha), u_light_cutoff[i]);
            } else {
                spotAttenuation = 0.0;
            }
        }

        if (spotAttenuation > 0.0) {
            vec3 ambient = (material.Ka / 255.0) * (lightAmbient / 255.0);

            float NdotL = max(0.0, dot(normal, L));
            vec3 diffuse = (material.Kd / 255.0) * (lightDiffuse / 255.0) * NdotL;

            vec3 specular = vec3(0.0);
            if (NdotL > 0.0) {
                vec3 V = normalize(-position);
                vec3 R = reflect(-L, normal);
                float RdotV = max(0.0, dot(R, V));
                specular = (material.Ks / 255.0) * (lightSpecular / 255.0)
                           * pow(RdotV, material.shininess);
            }

            color += (ambient + diffuse + specular) * spotAttenuation;
        }
    }

    return color;
}

void main() {
    vec4 positionEye = u_modelViewMatrix * vec4(a_position, 1.0);
    vec3 normalEye   = normalize(u_normalMatrix * a_normal);

    // Compute Phong lighting per vertex
    v_color = phongLighting(positionEye.xyz, normalEye, u_material);

    gl_Position = u_projectionMatrix * positionEye;
}
