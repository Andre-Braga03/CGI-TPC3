#version 300 es

precision mediump int;

in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

// Lighting uniforms
uniform int u_n_lights;
uniform int u_shadingMode; // 0 = Gouraud, 1 = Phong

// Light arrays (more compatible than struct arrays)
uniform mediump vec3 u_light_ambient[8];
uniform mediump vec3 u_light_diffuse[8];
uniform mediump vec3 u_light_specular[8];
uniform mediump vec4 u_light_position[8];
uniform mediump vec3 u_light_axis[8];
uniform mediump float u_light_aperture[8];
uniform mediump float u_light_cutoff[8];
uniform mediump int u_light_type[8];
uniform mediump int u_light_enabled[8];

struct MaterialInfo {
    mediump vec3 Ka;
    mediump vec3 Kd;
    mediump vec3 Ks;
    mediump float shininess;
};

uniform MaterialInfo u_material;

out vec3 v_position;
out vec3 v_normal;
out vec3 v_color; // For Gouraud shading

vec3 phongLighting(vec3 position, vec3 normal, MaterialInfo material) {
    vec3 color = vec3(0.0);
    
    for (int i = 0; i < 8; i++) {
        if (i >= u_n_lights) break;
        if (u_light_enabled[i] == 0) continue;
        
        int lightType = u_light_type[i];
        vec4 lightPos = u_light_position[i];
        vec3 lightAmbient = u_light_ambient[i];
        vec3 lightDiffuse = u_light_diffuse[i];
        vec3 lightSpecular = u_light_specular[i];
        
        // Calculate light direction
        vec3 L;
        if (lightType == 1) { // Directional
            L = normalize(-lightPos.xyz);
        } else { // Point or Spotlight
            vec3 lightPos3 = lightPos.xyz;
            L = normalize(lightPos3 - position);
        }
        
        // Spotlight attenuation
        float spotAttenuation = 1.0;
        if (lightType == 2) { // Spotlight
            vec3 toLight = normalize(lightPos.xyz - position);
            vec3 lightDir = normalize(-u_light_axis[i]);
            float cosAlpha = dot(toLight, lightDir);
            float cosAperture = cos(radians(u_light_aperture[i] / 2.0));
            
            if (cosAlpha >= cosAperture) {
                spotAttenuation = pow(max(0.0, cosAlpha), u_light_cutoff[i]);
            } else {
                spotAttenuation = 0.0; // Outside spotlight cone
            }
        }
        
            // Only add contribution if inside spotlight cone (or not a spotlight)
            if (spotAttenuation > 0.0) {
                // Ambient term (divide by 255 to normalize)
                vec3 ambient = (material.Ka / 255.0) * (lightAmbient / 255.0);
                
                // Diffuse term
                float NdotL = max(0.0, dot(normal, L));
                vec3 diffuse = (material.Kd / 255.0) * (lightDiffuse / 255.0) * NdotL;
                
                // Specular term
                vec3 specular = vec3(0.0);
                if (NdotL > 0.0) {
                    vec3 V = normalize(-position); // View direction (camera at origin)
                    vec3 R = reflect(-L, normal);
                    float RdotV = max(0.0, dot(R, V));
                    specular = (material.Ks / 255.0) * (lightSpecular / 255.0) * pow(RdotV, material.shininess);
                }
                
                color += (ambient + diffuse + specular) * spotAttenuation;
            }
    }
    
    return color;
}

void main() {
    vec4 positionEye = u_modelViewMatrix * vec4(a_position, 1.0);
    vec3 normalEye = normalize(u_normalMatrix * a_normal);
    
    v_position = positionEye.xyz;
    v_normal = normalEye;
    
    // Calculate lighting
    if (u_shadingMode == 0) { // Gouraud shading
        v_color = phongLighting(positionEye.xyz, normalEye, u_material);
    } else { // Phong shading - pass through
        v_color = vec3(0.0); // Will be calculated in fragment shader
    }
    
    gl_Position = u_projectionMatrix * positionEye;
}

