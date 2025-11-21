import { loadShadersFromURLS, setupWebGL, buildProgramFromSources } from './libs/utils.js';
import { mat4, vec3, vec4, flatten, lookAt, perspective, mult, translate, scalem, normalMatrix, normalize } from './libs/MV.js';
import * as GUI from 'dat.gui';

import * as CUBE from './libs/objects/cube.js';
import * as BUNNY from './libs/objects/bunny.js';
import * as TORUS from './libs/objects/torus.js';
import * as CYLINDER from './libs/objects/cylinder.js';
import * as SPHERE from './libs/objects/sphere.js';

const MAX_LIGHTS = 8;

/** @type {WebGL2RenderingContext} */
let gl;
let program;

// Matrices
let mView;
let mProjection;
let mModelView;
let mNormal;

// Scene objects
const sceneObjects = [];

// Camera parameters
const camera = {
    eye: vec3(5, 5, 5),
    at: vec3(0, 0, 0),
    up: vec3(0, 1, 0),
    fovy: 45,
    near: 0.1,
    far: 40
};

// Material for Bunny (0-255 range) - Pink/Lavender color
const bunnyMaterial = {
    Ka: [200, 150, 200],
    Kd: [220, 180, 220],
    Ks: [255, 255, 255],
    shininess: 100
};

// Materials for other objects (different colors)
const materials = {
    cube: { Ka: [255, 50, 50], Kd: [255, 50, 50], Ks: [255, 255, 255], shininess: 50 },
    torus: { Ka: [50, 255, 50], Kd: [50, 255, 50], Ks: [255, 255, 255], shininess: 100 },
    cylinder: { Ka: [50, 150, 255], Kd: [50, 150, 255], Ks: [200, 200, 200], shininess: 80 },
    sphere: { Ka: [255, 200, 50], Kd: [255, 200, 50], Ks: [255, 255, 255], shininess: 120 }
};

// Lights array
const lights = [];
for (let i = 0; i < MAX_LIGHTS; i++) {
    lights.push({
        enabled: i === 0, // Only first light enabled by default
        type: 0, // 0=point, 1=directional, 2=spotlight
        position: vec4(0, 0, 10, 1),
        axis: normalize(vec3(0, 0, -1)), // Normalized axis for spotlight
        aperture: 10,
        cutoff: 10,
        ambient: [80, 80, 80],
        diffuse: [120, 120, 120],
        specular: [200, 200, 200]
    });
}

// Rendering options
const options = {
    backfaceCulling: true,
    depthTest: true
};

let gui;
let lightFolders = [];

function setup(shaders) {
    const canvas = document.getElementById('gl-canvas');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    gl = setupWebGL(canvas);
    if (!gl) {
        console.error('WebGL not supported');
        return;
    }
    
    program = buildProgramFromSources(gl, shaders['shader.vert'], shaders['shader.frag']);
    if (!program) {
        console.error('Failed to create shader program');
        // Try to get more detailed error info
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, shaders['shader.vert']);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('Vertex shader error:', gl.getShaderInfoLog(vertexShader));
        }
        
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, shaders['shader.frag']);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
        }
        return;
    }
    
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    
    // Initialize objects
    CUBE.init(gl);
    BUNNY.init(gl);
    TORUS.init(gl);
    CYLINDER.init(gl);
    SPHERE.init(gl, program);
    
    // Create platform (10 x 0.5 x 10, upper face at y=0)
    sceneObjects.push({
        object: CUBE,
        transform: mult(translate(0, -0.25, 0), scalem(10, 0.5, 10)),
        material: { Ka: [120, 80, 50], Kd: [139, 90, 43], Ks: [80, 80, 80], shininess: 30 }
    });
    
    // Create 4 objects in quadrants (2x2x2 cube as reference, so scale by 2)
    // Order as in the first image: Cube (upper-left), Torus (lower-left), Bunny (lower-right), Cylinder (upper-right)
    // Quadrant 1: Cube (upper-left)
    sceneObjects.push({
        object: CUBE,
        transform: mult(translate(-2.5, 1, 2.5), scalem(2, 2, 2)),
        material: materials.cube
    });
    
    // Quadrant 2: Torus (lower-left)
    sceneObjects.push({
        object: TORUS,
        transform: mult(translate(-2.5, 1, -2.5), scalem(2, 2, 2)),
        material: materials.torus
    });
    
    // Quadrant 3: Bunny (lower-right) - most prominent in front
    sceneObjects.push({
        object: BUNNY,
        transform: mult(translate(2.5, 1, -2.5), scalem(2, 2, 2)),
        material: bunnyMaterial
    });
    
    // Quadrant 4: Cylinder (upper-right)
    sceneObjects.push({
        object: CYLINDER,
        transform: mult(translate(2.5, 1, 2.5), scalem(2, 2, 2)),
        material: materials.cylinder
    });
    
    setupGUI();
    updateProjection();
    updateView();
    
    // Debug: Check if matrices are valid
    console.log('Camera eye:', camera.eye);
    console.log('Camera at:', camera.at);
    console.log('Scene objects:', sceneObjects.length);
    console.log('Program:', program);
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        updateProjection();
    });
    
    render();
}

function setupGUI() {
    gui = new GUI.GUI({ autoPlace: true });
    
    // Options
    const optionsFolder = gui.addFolder('options');
    optionsFolder.open(); // Open by default
    optionsFolder.add(options, 'backfaceCulling').onChange((value) => {
        if (value) {
            gl.enable(gl.CULL_FACE);
        } else {
            gl.disable(gl.CULL_FACE);
        }
    });
    optionsFolder.add(options, 'depthTest').onChange((value) => {
        if (value) {
            gl.enable(gl.DEPTH_TEST);
        } else {
            gl.disable(gl.DEPTH_TEST);
        }
    });
    
    // Camera
    const cameraFolder = gui.addFolder('camera');
    cameraFolder.add(camera, 'fovy', 10, 120).onChange(() => updateProjection());
    cameraFolder.add(camera, 'near', 0.01, 5).onChange(() => updateProjection());
    cameraFolder.add(camera, 'far', 10, 100).onChange(() => updateProjection());
    
    // Eye
    const eyeFolder = gui.addFolder('Eye');
    eyeFolder.add(camera.eye, '0', -20, 20).name('x').onChange(() => updateView());
    eyeFolder.add(camera.eye, '1', -20, 20).name('y').onChange(() => updateView());
    eyeFolder.add(camera.eye, '2', -20, 20).name('z').onChange(() => updateView());
    
    // At
    const atFolder = gui.addFolder('At');
    atFolder.add(camera.at, '0', -20, 20).name('x').onChange(() => updateView());
    atFolder.add(camera.at, '1', -20, 20).name('y').onChange(() => updateView());
    atFolder.add(camera.at, '2', -20, 20).name('z').onChange(() => updateView());
    
    // Up
    const upFolder = gui.addFolder('Up');
    upFolder.add(camera.up, '0', -1, 1).name('x').onChange(() => updateView());
    upFolder.add(camera.up, '1', -1, 1).name('y').onChange(() => updateView());
    upFolder.add(camera.up, '2', -1, 1).name('z').onChange(() => updateView());
    
    // Lights
    const lightsFolder = gui.addFolder('lights');
    lightFolders = [];
    
    for (let i = 0; i < 3; i++) { // Support up to 3 lights in GUI
        const lightFolder = lightsFolder.addFolder(`Light${i + 1}`);
        const light = lights[i];
        
        lightFolder.add(light, 'enabled').onChange(() => uploadLights());
        
        const typeController = lightFolder.add(light, 'type', { 'Point': 0, 'Directional': 1, 'Spotlight': 2 }).onChange(() => {
            // Update w component based on type
            if (light.type === 1) { // Directional
                light.position[3] = 0;
            } else { // Point or Spotlight
                light.position[3] = 1;
            }
            uploadLights();
        });
        
        const positionFolder = lightFolder.addFolder('position');
        positionFolder.add(light.position, '0', -20, 20).name('x').onChange(() => uploadLights());
        positionFolder.add(light.position, '1', -20, 20).name('y').onChange(() => uploadLights());
        positionFolder.add(light.position, '2', -20, 20).name('z').onChange(() => uploadLights());
        positionFolder.add(light.position, '3', 0, 1).step(1).name('w').onChange(() => uploadLights());
        
        const intensitiesFolder = lightFolder.addFolder('intensities');
        intensitiesFolder.addColor(light, 'ambient').onChange(() => uploadLights());
        intensitiesFolder.addColor(light, 'diffuse').onChange(() => uploadLights());
        intensitiesFolder.addColor(light, 'specular').onChange(() => uploadLights());
        
        const axisFolder = lightFolder.addFolder('axis');
        axisFolder.add(light.axis, '0', -1, 1).name('x').onChange(() => {
            light.axis = normalize(light.axis);
            uploadLights();
        });
        axisFolder.add(light.axis, '1', -1, 1).name('y').onChange(() => {
            light.axis = normalize(light.axis);
            uploadLights();
        });
        axisFolder.add(light.axis, '2', -1, 1).name('z').onChange(() => {
            light.axis = normalize(light.axis);
            uploadLights();
        });
        
        lightFolder.add(light, 'aperture', 0, 180).onChange(() => uploadLights());
        lightFolder.add(light, 'cutoff', 0, 50).onChange(() => uploadLights());
        
        lightFolders.push(lightFolder);
    }
    
    // Material (for Bunny)
    const materialFolder = gui.addFolder('material');
    materialFolder.addColor(bunnyMaterial, 'Ka').onChange(() => uploadMaterial(1));
    materialFolder.addColor(bunnyMaterial, 'Kd').onChange(() => uploadMaterial(1));
    materialFolder.addColor(bunnyMaterial, 'Ks').onChange(() => uploadMaterial(1));
    materialFolder.add(bunnyMaterial, 'shininess', 1, 200).onChange(() => uploadMaterial(1));
    
    gui.add({ close: () => gui.close() }, 'close').name('Close Controls');
}

function updateProjection() {
    const canvas = document.getElementById('gl-canvas');
    const aspect = canvas.width / canvas.height;
    mProjection = perspective(camera.fovy, aspect, camera.near, camera.far);
    uploadProjection();
}

function updateView() {
    // Normalize up vector
    const up = normalize(camera.up);
    mView = lookAt(camera.eye, camera.at, up);
    uploadView();
}

function uploadProjection() {
    const loc = gl.getUniformLocation(program, 'u_projectionMatrix');
    if (loc) {
        gl.uniformMatrix4fv(loc, false, flatten(mProjection));
    }
}

function uploadView() {
    // View matrix is combined with model matrix in modelView
    // We'll update it when rendering
}

function uploadModelView(modelMatrix) {
    // Ensure mView is up to date
    const up = normalize(camera.up);
    mView = lookAt(camera.eye, camera.at, up);
    
    mModelView = mult(mView, modelMatrix);
    mNormal = normalMatrix(mModelView, true);
    
    const locMV = gl.getUniformLocation(program, 'u_modelViewMatrix');
    const locN = gl.getUniformLocation(program, 'u_normalMatrix');
    
    if (locMV) {
        gl.uniformMatrix4fv(locMV, false, flatten(mModelView));
    } else {
        console.warn('u_modelViewMatrix uniform not found');
    }
    if (locN) {
        gl.uniformMatrix3fv(locN, false, flatten(mNormal));
    } else {
        console.warn('u_normalMatrix uniform not found');
    }
}

function uploadLights() {
    // Count enabled lights (up to MAX_LIGHTS)
    let nLights = 0;
    for (let i = 0; i < MAX_LIGHTS; i++) {
        if (lights[i].enabled) {
            nLights = i + 1; // Count up to the highest enabled light index
        }
    }
    const locNLights = gl.getUniformLocation(program, 'u_n_lights');
    if (locNLights) {
        gl.uniform1i(locNLights, nLights);
    } else {
        console.warn('u_n_lights uniform not found');
    }
    
    // Helper to convert color to array (dat.gui might return object)
    const toColorArray = (color) => {
        if (Array.isArray(color)) return color;
        if (typeof color === 'object' && color.r !== undefined) {
            return [color.r, color.g, color.b];
        }
        return [0, 0, 0];
    };
    
    // Build arrays for each light property
    const ambientArray = [];
    const diffuseArray = [];
    const specularArray = [];
    const positionArray = [];
    const axisArray = [];
    const apertureArray = [];
    const cutoffArray = [];
    const typeArray = [];
    const enabledArray = [];
    
    for (let i = 0; i < MAX_LIGHTS; i++) {
        const light = lights[i];
        
        // Convert colors to arrays
        ambientArray.push(...toColorArray(light.ambient));
        diffuseArray.push(...toColorArray(light.diffuse));
        specularArray.push(...toColorArray(light.specular));
        
        // Position (set w based on type)
        const pos = [...light.position];
        if (light.type === 1) { // Directional
            pos[3] = 0;
        } else { // Point or Spotlight
            pos[3] = 1;
        }
        positionArray.push(...pos);
        
        // Axis
        axisArray.push(...light.axis);
        
        // Scalars
        apertureArray.push(light.aperture);
        cutoffArray.push(light.cutoff);
        typeArray.push(light.type);
        enabledArray.push(light.enabled ? 1 : 0);
    }
    
    // Upload arrays element by element
    for (let i = 0; i < MAX_LIGHTS; i++) {
        const locAmbient = gl.getUniformLocation(program, `u_light_ambient[${i}]`);
        const locDiffuse = gl.getUniformLocation(program, `u_light_diffuse[${i}]`);
        const locSpecular = gl.getUniformLocation(program, `u_light_specular[${i}]`);
        const locPosition = gl.getUniformLocation(program, `u_light_position[${i}]`);
        const locAxis = gl.getUniformLocation(program, `u_light_axis[${i}]`);
        const locAperture = gl.getUniformLocation(program, `u_light_aperture[${i}]`);
        const locCutoff = gl.getUniformLocation(program, `u_light_cutoff[${i}]`);
        const locType = gl.getUniformLocation(program, `u_light_type[${i}]`);
        const locEnabled = gl.getUniformLocation(program, `u_light_enabled[${i}]`);
        
        if (locAmbient) gl.uniform3fv(locAmbient, ambientArray.slice(i * 3, i * 3 + 3));
        if (locDiffuse) gl.uniform3fv(locDiffuse, diffuseArray.slice(i * 3, i * 3 + 3));
        if (locSpecular) gl.uniform3fv(locSpecular, specularArray.slice(i * 3, i * 3 + 3));
        if (locPosition) gl.uniform4fv(locPosition, positionArray.slice(i * 4, i * 4 + 4));
        if (locAxis) gl.uniform3fv(locAxis, axisArray.slice(i * 3, i * 3 + 3));
        if (locAperture) gl.uniform1f(locAperture, apertureArray[i]);
        if (locCutoff) gl.uniform1f(locCutoff, cutoffArray[i]);
        if (locType) gl.uniform1i(locType, typeArray[i]);
        if (locEnabled) gl.uniform1i(locEnabled, enabledArray[i]);
    }
}

function uploadMaterial(objectIndex) {
    // Only upload material for Bunny (index 1)
    if (objectIndex === 1) {
        const material = bunnyMaterial;
        uploadMaterialUniforms(material);
    }
}

function uploadMaterialUniforms(material) {
    const prefix = 'u_material';
    
    // Helper to convert color to array
    const toColorArray = (color) => {
        if (Array.isArray(color)) return color;
        if (typeof color === 'object' && color.r !== undefined) {
            return [color.r, color.g, color.b];
        }
        return [0, 0, 0];
    };
    
    const uploadVec3 = (name, value) => {
        const loc = gl.getUniformLocation(program, `${prefix}.${name}`);
        if (loc) {
            const arr = toColorArray(value);
            gl.uniform3fv(loc, arr);
        }
    };
    const uploadFloat = (name, value) => {
        const loc = gl.getUniformLocation(program, `${prefix}.${name}`);
        if (loc) gl.uniform1f(loc, value);
    };
    
    uploadVec3('Ka', material.Ka);
    uploadVec3('Kd', material.Kd);
    uploadVec3('Ks', material.Ks);
    uploadFloat('shininess', material.shininess);
}

function uploadShadingMode() {
    const loc = gl.getUniformLocation(program, 'u_shadingMode');
    if (loc) {
        // Always use Phong shading (mode 1) - calculated in fragment shader
        gl.uniform1i(loc, 1);
    }
}

function render() {
    requestAnimationFrame(render);
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.useProgram(program);
    
    // Upload projection matrix (needs to be done each frame in case it changed)
    uploadProjection();
    
    // Upload lights and shading mode (once per frame)
    uploadLights();
    uploadShadingMode(); // 0 = Gouraud (vertex shader), 1 = Phong (fragment shader)
    
    // Render each object
    for (let i = 0; i < sceneObjects.length; i++) {
        const obj = sceneObjects[i];
        
        // Upload model-view and normal matrices
        uploadModelView(obj.transform);
        
        // Upload material
        uploadMaterialUniforms(obj.material);
        
        // Draw object
        obj.object.draw(gl, program, gl.TRIANGLES);
    }
}

// Load shaders and start
const shaderUrls = ['shader.vert', 'shader.frag'];
loadShadersFromURLS(shaderUrls).then(shaders => {
    setup(shaders);
}).catch(err => {
    console.error('Failed to load shaders:', err);
});

