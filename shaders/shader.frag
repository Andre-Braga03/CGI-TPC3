#version 300 es

precision mediump float;
precision mediump int;

in vec3 v_position;
in vec3 v_normal;
in vec3 v_color;

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

out vec4 fragColor;

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
    vec3 color;
    
    if (u_shadingMode == 0) { // Gouraud shading - use interpolated color
        color = v_color;
    } else { // Phong shading - calculate per fragment
        color = phongLighting(v_position, normalize(v_normal), u_material);
    }
    
    // Color is already normalized (0-1 range) from lighting calculation
    // Clamp to ensure valid color range
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}

