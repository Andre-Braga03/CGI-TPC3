#version 300 es

precision mediump int;

const int MAX_LIGHTS = 8;

in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

// Lighting uniforms
uniform int u_n_lights;
uniform int u_shadingMode; // 0 = Gouraud, 1 = Phong

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

out vec3 v_position; // position in eye coordinates
out vec3 v_normal;   // normal in eye coordinates
out vec3 v_color;    // used for Gouraud shading

// Phong lighting computation (same logic as in fragment shader)
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

        // Compute light direction L
        vec3 L;
        if (lightType == 1) {
            // Directional light: position stores direction
            L = normalize(-lightPos);
        } else {
            // Point or spotlight: from point to light
            L = normalize(lightPos - position);
        }

        // Spotlight attenuation
        float spotAttenuation = 1.0;
        if (lightType == 2) { // Spotlight
            // Angle between L and -axis
            vec3 lightDir  = normalize(-u_light_axis[i]);
            float cosAlpha = dot(L, lightDir);
            float cosAperture = cos(radians(u_light_aperture[i] / 2.0));

            if (cosAlpha >= cosAperture) {
                spotAttenuation = pow(max(0.0, cosAlpha), u_light_cutoff[i]);
            } else {
                spotAttenuation = 0.0; // outside the cone
            }
        }

        if (spotAttenuation > 0.0) {
            // Ambient term (normalize 0–255 to 0–1)
            vec3 ambient = (material.Ka / 255.0) * (lightAmbient / 255.0);

            // Diffuse term
            float NdotL = max(0.0, dot(normal, L));
            vec3 diffuse = (material.Kd / 255.0) * (lightDiffuse / 255.0) * NdotL;

            // Specular term
            vec3 specular = vec3(0.0);
            if (NdotL > 0.0) {
                vec3 V = normalize(-position); // view vector (camera at origin)
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
    // Transform to eye coordinates
    vec4 positionEye = u_modelViewMatrix * vec4(a_position, 1.0);
    vec3 normalEye   = normalize(u_normalMatrix * a_normal);

    v_position = positionEye.xyz;
    v_normal   = normalEye;

    // Gouraud or Phong
    if (u_shadingMode == 0) {
        // Gouraud shading: compute lighting here
        v_color = phongLighting(positionEye.xyz, normalEye, u_material);
    } else {
        // Phong shading: color computed in fragment shader
        v_color = vec3(0.0);
    }

    gl_Position = u_projectionMatrix * positionEye;
}
