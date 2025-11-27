import { loadShadersFromURLS, setupWebGL, buildProgramFromSources } from './libs/utils.js';
import {
    mat4,
    vec3,
    vec4,
    flatten,
    lookAt,
    perspective,
    mult,
    translate,
    scalem,
    normalMatrix,
    normalize,
    add,
    subtract,
    cross,
    scale
} from './libs/MV.js';

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

// Scene objects (geometry + transform + material)
const sceneObjects = [];

// Camera parameters (in world coordinates)
const camera = {
    // Camera position in world coordinates
    eye: vec3(0, 7, 13),

    // Point we are looking at (center of the scene)
    at: vec3(0, 1, 0),

    // Up direction
    up: vec3(0, 1, 0),

    // Perspective parameters
    fovy: 45,
    near: 0.1,
    far: 40
};

// Store initial camera values (for reset)
const initialCamera = {
    eye: vec3(camera.eye[0], camera.eye[1], camera.eye[2]),
    at: vec3(camera.at[0], camera.at[1], camera.at[2]),
    up: vec3(camera.up[0], camera.up[1], camera.up[2])
};

// Camera orientation (yaw/pitch in radians)
let yaw = 0;
let pitch = 0;

// Input state
const keyState = {};
let lastFrameTime = 0;
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

const mouseSensitivity = 0.001;   // mouse look speed
const moveSpeed       = 2.0;      // movement units per second

// Material for Bunny (0–255 range because of dat.gui color selector)
const bunnyMaterial = {
    Ka: [200, 150, 200],
    Kd: [220, 180, 220],
    Ks: [255, 255, 255],
    shininess: 100
};

// Simple materials for the other objects
const materials = {
    cube: { Ka: [255, 50, 50], Kd: [255, 50, 50], Ks: [255, 255, 255], shininess: 50 },
    torus: { Ka: [50, 255, 50], Kd: [50, 255, 50], Ks: [255, 255, 255], shininess: 100 },
    cylinder: { Ka: [50, 150, 255], Kd: [50, 150, 255], Ks: [200, 200, 200], shininess: 80 },
    sphere: { Ka: [255, 200, 50], Kd: [255, 200, 50], Ks: [255, 255, 255], shininess: 120 }
};

// Lights array (size MAX_LIGHTS)
const lights = [];
for (let i = 0; i < MAX_LIGHTS; i++) {
    lights.push({
        enabled: i === 0,                  // Only first light enabled by default
        type: 0,                           // 0 = point, 1 = directional, 2 = spotlight
        position: vec4(0, 0, 10, 1),       // In camera space
        axis: normalize(vec3(0, 0, -1)),   // Spotlight axis (direction where it points)
        aperture: 10,                      // Aperture angle in degrees
        cutoff: 10,                        // Exponent (η) used in cos(α)^η
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

// Shading mode: 0 = Gouraud (vertex), 1 = Phong (fragment)
let shadingMode = 1;

let gui;
let lightFolders = [];

// Data used to draw the spotlight projection circle on the ground
let spotlightCircle = null;
let spotlightCircleBuffer = null;
let spotlightCircleVAO = null;

/**
 * Main setup function (called after shaders are loaded)
 */
function setup(shaders) {
    const canvas = document.getElementById('gl-canvas');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    gl = setupWebGL(canvas);
    if (!gl) {
        console.error('WebGL not supported');
        return;
    }

    // Build and link the shader program
    program = buildProgramFromSources(gl, shaders['shader.vert'], shaders['shader.frag']);
    if (!program) {
        console.error('Failed to create shader program');
        return;
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Init geometry buffers
    CUBE.init(gl);
    BUNNY.init(gl);
    TORUS.init(gl);
    CYLINDER.init(gl);
    SPHERE.init(gl, program); // not used in the scene, but ready

    // Create VAO for spotlight circle visualization
    initSpotlightCircle(gl);

    // ----- Build scene objects -----

    // Platform: 10 x 0.5 x 10 (top face at y = 0)
    sceneObjects.push({
        object: CUBE,
        transform: mult(translate(0, -0.25, 0), scalem(10, 0.5, 10)),
        material: { Ka: [120, 80, 50], Kd: [139, 90, 43], Ks: [80, 80, 80], shininess: 30 }
    });

    // Cube (upper-left quadrant)
    sceneObjects.push({
        object: CUBE,
        transform: mult(translate(-2.5, 1, 2.5), scalem(2, 2, 2)),
        material: materials.cube
    });

    // Torus (upper-right quadrant in world XZ-plane)
    sceneObjects.push({
        object: TORUS,
        transform: mult(translate(2.5, 1, 2.5), scalem(2, 2, 2)),
        material: materials.torus
    });

    // Bunny (lower-right quadrant, more visible)
    sceneObjects.push({
        object: BUNNY,
        transform: mult(translate(2.5, 1, -2.5), scalem(2, 2, 2)),
        material: bunnyMaterial
    });

    // Cylinder (lower-left quadrant)
    sceneObjects.push({
        object: CYLINDER,
        transform: mult(translate(-2.5, 1, -2.5), scalem(2, 2, 2)),
        material: materials.cylinder
    });

    // UI, camera matrices, events
    setupGUI();
    updateProjection();
    updateView();
    computeInitialAngles();
    initInputHandlers(canvas);

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        updateProjection();
    });

    render();
}

/**
 * Build dat.gui interface
 */
function setupGUI() {
    gui = new GUI.GUI({ autoPlace: true });

    // ----- Global options -----
    const optionsFolder = gui.addFolder('options');
    optionsFolder.open();
    optionsFolder.add(options, 'backfaceCulling').onChange((value) => {
        if (value) gl.enable(gl.CULL_FACE);
        else gl.disable(gl.CULL_FACE);
    });
    optionsFolder.add(options, 'depthTest').onChange((value) => {
        if (value) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
    });

    // ----- Camera -----
    const cameraFolder = gui.addFolder('camera');
    cameraFolder.add(camera, 'fovy', 10, 120).onChange(updateProjection);
    cameraFolder.add(camera, 'near', 0.01, 5).onChange(updateProjection);
    cameraFolder.add(camera, 'far', 10, 100).onChange(updateProjection);

    // Eye
    const eyeFolder = gui.addFolder('Eye');
    eyeFolder.add(camera.eye, '0', -20, 20).name('x').onChange(updateView);
    eyeFolder.add(camera.eye, '1', -20, 20).name('y').onChange(updateView);
    eyeFolder.add(camera.eye, '2', -20, 20).name('z').onChange(updateView);

    // At
    const atFolder = gui.addFolder('At');
    atFolder.add(camera.at, '0', -20, 20).name('x').onChange(updateView);
    atFolder.add(camera.at, '1', -20, 20).name('y').onChange(updateView);
    atFolder.add(camera.at, '2', -20, 20).name('z').onChange(updateView);

    // Up
    const upFolder = gui.addFolder('Up');
    upFolder.add(camera.up, '0', -1, 1).name('x').onChange(updateView);
    upFolder.add(camera.up, '1', -1, 1).name('y').onChange(updateView);
    upFolder.add(camera.up, '2', -1, 1).name('z').onChange(updateView);

    // ----- Lights -----
    const lightsFolder = gui.addFolder('lights');
    lightFolders = [];

    // Only expose first 3 lights in the GUI (can be extended)
    for (let i = 0; i < 3; i++) {
        const light = lights[i];
        const lightFolder = lightsFolder.addFolder(`Light${i + 1}`);

        // Enable / disable
        lightFolder.add(light, 'enabled').onChange(uploadLights);

        // Type: 0 = point, 1 = directional, 2 = spotlight
        lightFolder
            .add(light, 'type', { Point: 0, Directional: 1, Spotlight: 2 })
            .name('type')
            .onChange(() => {
                // Ensure w component is correct (1 for point/spot, 0 for directional)
                if (light.type === 1) light.position[3] = 0;
                else light.position[3] = 1;
                uploadLights();
            });

        // Position
        const positionFolder = lightFolder.addFolder('position');
        positionFolder.add(light.position, '0', -20, 20).name('x').onChange(uploadLights);
        positionFolder.add(light.position, '1', -20, 20).name('y').onChange(uploadLights);
        positionFolder.add(light.position, '2', -20, 20).name('z').onChange(uploadLights);
        positionFolder
            .add(light.position, '3', 0, 1)
            .step(1)
            .name('w')
            .onChange(uploadLights);

        // Intensities (ambient, diffuse, specular)
        const intensitiesFolder = lightFolder.addFolder('intensities');
        intensitiesFolder.addColor(light, 'ambient').onChange(uploadLights);
        intensitiesFolder.addColor(light, 'diffuse').onChange(uploadLights);
        intensitiesFolder.addColor(light, 'specular').onChange(uploadLights);

        // Axis (for spotlight)
        const axisFolder = lightFolder.addFolder('axis');
        axisFolder
            .add(light.axis, '0', -1, 1)
            .name('x')
            .onChange(() => {
                light.axis = normalize(light.axis);
                uploadLights();
            });
        axisFolder
            .add(light.axis, '1', -1, 1)
            .name('y')
            .onChange(() => {
                light.axis = normalize(light.axis);
                uploadLights();
            });
        axisFolder
            .add(light.axis, '2', -1, 1)
            .name('z')
            .onChange(() => {
                light.axis = normalize(light.axis);
                uploadLights();
            });

        // Spotlight parameters
        lightFolder.add(light, 'aperture', 0, 180).onChange(uploadLights);
        lightFolder.add(light, 'cutoff', 0, 50).onChange(uploadLights);

        lightFolders.push(lightFolder);
    }

    // ----- Bunny material -----
    const materialFolder = gui.addFolder('material');
    materialFolder.addColor(bunnyMaterial, 'Ka').onChange(() => uploadMaterialUniforms(bunnyMaterial));
    materialFolder.addColor(bunnyMaterial, 'Kd').onChange(() => uploadMaterialUniforms(bunnyMaterial));
    materialFolder.addColor(bunnyMaterial, 'Ks').onChange(() => uploadMaterialUniforms(bunnyMaterial));
    materialFolder
        .add(bunnyMaterial, 'shininess', 1, 200)
        .onChange(() => uploadMaterialUniforms(bunnyMaterial));

    // ----- Shading mode -----
    const shadingFolder = gui.addFolder('shading');
    const shadingParams = { mode: 'Phong' }; // default

    shadingFolder
        .add(shadingParams, 'mode', ['Phong', 'Gouraud'])
        .name('mode')
        .onChange((val) => {
            shadingMode = val === 'Phong' ? 1 : 0;
        });

    // Button to close controls
    gui.add({ close: () => gui.close() }, 'close').name('Close Controls');
}

/**
 * Recompute projection matrix (called on resize / camera change)
 */
function updateProjection() {
    const canvas = document.getElementById('gl-canvas');
    const aspect = canvas.width / canvas.height;
    mProjection = perspective(camera.fovy, aspect, camera.near, camera.far);
    uploadProjection();
}

/**
 * Recompute view matrix (camera)
 */
function updateView() {
    const up = normalize(camera.up); // ensure up vector is normalized
    mView = lookAt(camera.eye, camera.at, up);
}

/**
 * Upload projection matrix to shader
 */
function uploadProjection() {
    const loc = gl.getUniformLocation(program, 'u_projectionMatrix');
    if (loc) {
        gl.uniformMatrix4fv(loc, false, flatten(mProjection));
    }
}

/**
 * Upload model-view and normal matrices for one object
 */
function uploadModelView(modelMatrix) {
    // Always rebuild view here to reflect latest camera parameters
    const up = normalize(camera.up);
    mView = lookAt(camera.eye, camera.at, up);

    mModelView = mult(mView, modelMatrix);
    mNormal = normalMatrix(mModelView, true);

    const locMV = gl.getUniformLocation(program, 'u_modelViewMatrix');
    const locN = gl.getUniformLocation(program, 'u_normalMatrix');

    if (locMV) gl.uniformMatrix4fv(locMV, false, flatten(mModelView));
    if (locN) gl.uniformMatrix3fv(locN, false, flatten(mNormal));
}

/**
 * Upload all light parameters to the shader
 */
function uploadLights() {
    // Find effective number of lights (highest enabled index + 1)
    let nLights = 0;
    for (let i = 0; i < MAX_LIGHTS; i++) {
        if (lights[i].enabled) nLights = i + 1;
    }

    const locNLights = gl.getUniformLocation(program, 'u_n_lights');
    if (locNLights) gl.uniform1i(locNLights, nLights);

    // Helper to convert dat.gui color objects to arrays
    const toColorArray = (color) => {
        if (Array.isArray(color)) return color;
        if (typeof color === 'object' && color.r !== undefined) {
            return [color.r, color.g, color.b];
        }
        return [0, 0, 0];
    };

    // Upload each light separately
    for (let i = 0; i < MAX_LIGHTS; i++) {
        const light = lights[i];

        const ambient = toColorArray(light.ambient);
        const diffuse = toColorArray(light.diffuse);
        const specular = toColorArray(light.specular);

        // Ensure w corresponds to type
        const pos = [...light.position];
        if (light.type === 1) pos[3] = 0; // directional
        else pos[3] = 1; // point or spotlight

        const locAmbient = gl.getUniformLocation(program, `u_light_ambient[${i}]`);
        const locDiffuse = gl.getUniformLocation(program, `u_light_diffuse[${i}]`);
        const locSpecular = gl.getUniformLocation(program, `u_light_specular[${i}]`);
        const locPosition = gl.getUniformLocation(program, `u_light_position[${i}]`);
        const locAxis = gl.getUniformLocation(program, `u_light_axis[${i}]`);
        const locAperture = gl.getUniformLocation(program, `u_light_aperture[${i}]`);
        const locCutoff = gl.getUniformLocation(program, `u_light_cutoff[${i}]`);
        const locType = gl.getUniformLocation(program, `u_light_type[${i}]`);
        const locEnabled = gl.getUniformLocation(program, `u_light_enabled[${i}]`);

        if (locAmbient) gl.uniform3fv(locAmbient, ambient);
        if (locDiffuse) gl.uniform3fv(locDiffuse, diffuse);
        if (locSpecular) gl.uniform3fv(locSpecular, specular);
        if (locPosition) gl.uniform4fv(locPosition, pos);
        if (locAxis) gl.uniform3fv(locAxis, light.axis);
        if (locAperture) gl.uniform1f(locAperture, light.aperture);
        if (locCutoff) gl.uniform1f(locCutoff, light.cutoff);
        if (locType) gl.uniform1i(locType, light.type);
        if (locEnabled) gl.uniform1i(locEnabled, light.enabled ? 1 : 0);
    }
}

/**
 * Upload material (for current object) to shader
 */
function uploadMaterialUniforms(material) {
    const prefix = 'u_material';

    const toColorArray = (color) => {
        if (Array.isArray(color)) return color;
        if (typeof color === 'object' && color.r !== undefined) {
            return [color.r, color.g, color.b];
        }
        return [0, 0, 0];
    };

    const uploadVec3 = (name, value) => {
        const loc = gl.getUniformLocation(program, `${prefix}.${name}`);
        if (loc) gl.uniform3fv(loc, toColorArray(value));
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

/**
 * Upload shading mode (0 = Gouraud, 1 = Phong)
 */
function uploadShadingMode() {
    const loc = gl.getUniformLocation(program, 'u_shadingMode');
    if (loc) gl.uniform1i(loc, shadingMode);
}

/**
 * Create VAO + buffers for a unit circle on the XZ plane (y = 0)
 * Used to visualize the spotlight footprint on the ground.
 */
function initSpotlightCircle(gl) {
    const segments = 32;
    const points = [];
    const indices = [];

    // Center point
    points.push(0, 0, 0);

    // Circle points
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(Math.cos(angle), 0, Math.sin(angle));
    }

    // Triangle fan indices
    for (let i = 1; i <= segments; i++) {
        indices.push(0, i, i + 1);
    }
    indices.push(0, segments, 1);

    spotlightCircleVAO = gl.createVertexArray();
    gl.bindVertexArray(spotlightCircleVAO);

    // Vertex buffer
    const pointsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    const a_position = 0; // assume attribute location 0
    gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_position);

    // Index buffer
    spotlightCircleBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spotlightCircleBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    spotlightCircle = {
        indices: indices.length,
        points: points.length / 3
    };
}

/**
 * Draw one spotlight circle on the ground (for a given light)
 */
function drawSpotlightCircle(gl, light) {
    if (light.type !== 2 || !light.enabled) return; // Only for spotlights

    // Light position and direction in camera space
    const lightPos = vec3(light.position[0], light.position[1], light.position[2]);
    const lightDir = normalize(vec3(-light.axis[0], -light.axis[1], -light.axis[2]));

    // Only if light is above ground and pointing down
    if (lightPos[1] > 0 && lightDir[1] < 0) {
        // Intersection of ray with plane y = 0
        const t = -lightPos[1] / lightDir[1];
        const groundPos = vec3(
            lightPos[0] + lightDir[0] * t,
            0.01, // slightly above to avoid z-fighting
            lightPos[2] + lightDir[2] * t
        );

        // Radius from distance and aperture angle
        const distance = Math.abs(lightPos[1] / lightDir[1]);
        const radius = distance * Math.tan((light.aperture / 2) * Math.PI / 180);

        // Transform circle to the correct position and size
        const circleTransform = mult(
            translate(groundPos[0], groundPos[1], groundPos[2]),
            scalem(radius, 1, radius)
        );

        // Use same model-view upload as other objects
        uploadModelView(circleTransform);

        // Simple bright material for circle
        const circleMaterial = {
            Ka: [255, 255, 200],
            Kd: [255, 255, 200],
            Ks: [255, 255, 255],
            shininess: 1
        };
        uploadMaterialUniforms(circleMaterial);

        gl.bindVertexArray(spotlightCircleVAO);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spotlightCircleBuffer);
        gl.drawElements(gl.TRIANGLES, spotlightCircle.indices, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }
}

// Compute yaw and pitch from current camera eye/at
function computeInitialAngles() {
    const f = normalize(subtract(camera.at, camera.eye)); // forward
    yaw   = Math.atan2(f[2], f[0]);
    pitch = Math.asin(f[1]);
}

// Update camera.at from eye + yaw/pitch
function updateCameraFromAngles() {
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosYaw   = Math.cos(yaw);
    const sinYaw   = Math.sin(yaw);

    const forward = vec3(
        cosPitch * cosYaw,
        sinPitch,
        cosPitch * sinYaw
    );

    camera.at = add(camera.eye, forward);
}

// Reset camera to initial state (key: R)
function resetCamera() {
    camera.eye = vec3(initialCamera.eye[0], initialCamera.eye[1], initialCamera.eye[2]);
    camera.at  = vec3(initialCamera.at[0], initialCamera.at[1], initialCamera.at[2]);
    camera.up  = vec3(initialCamera.up[0], initialCamera.up[1], initialCamera.up[2]);
    computeInitialAngles();
}

function initInputHandlers(canvas) {
    // Keyboard
    window.addEventListener('keydown', (e) => {
        keyState[e.code] = true;

        // Reset camera with "R"
        if (e.code === 'KeyR') {
            resetCamera();
        }
    });

    window.addEventListener('keyup', (e) => {
        keyState[e.code] = false;
    });

    // Mouse drag to look around
    canvas.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
        isMouseDown = false;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;

        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        yaw   += dx * mouseSensitivity;
        pitch -= dy * mouseSensitivity;

        // Clamp pitch to avoid flipping
        const maxPitch = Math.PI / 2 - 0.01;
        if (pitch >  maxPitch) pitch =  maxPitch;
        if (pitch < -maxPitch) pitch = -maxPitch;

        updateCameraFromAngles();
    });
}

function updateCameraFromInput(dt) {
    if (dt <= 0) return;

    // Current forward and right vectors
    const forward = normalize(subtract(camera.at, camera.eye));
    const worldUp = vec3(0, 1, 0);
    const right   = normalize(cross(forward, worldUp));

    let move = vec3(0, 0, 0);

    // W/S = forward/backward
    if (keyState['KeyW']) move = add(move, forward);
    if (keyState['KeyS']) move = subtract(move, forward);

    // A/D = left/right
    if (keyState['KeyA']) move = subtract(move, right);
    if (keyState['KeyD']) move = add(move, right);

    // Space / Shift = up/down (optional)
    if (keyState['Space'])        move = add(move, worldUp);
    if (keyState['ShiftLeft'] ||
        keyState['ShiftRight'])   move = subtract(move, worldUp);

    // No movement
    if (move[0] === 0 && move[1] === 0 && move[2] === 0) return;

    move = normalize(move);
    move = scale(moveSpeed * dt, move);

    camera.eye = add(camera.eye, move);
    camera.at  = add(camera.at, move);
}


/**
 * Main render loop
 */
function render(timestamp) {
    requestAnimationFrame(render);

    // Compute delta time in seconds
    const dt = lastFrameTime ? (timestamp - lastFrameTime) / 1000.0 : 0;
    lastFrameTime = timestamp;

    // Update camera from keyboard each frame
    updateCameraFromInput(dt);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    // Upload global uniforms
    uploadProjection();
    uploadLights();
    uploadShadingMode();

    // Sort and draw objects (igual ao que já tinhas)
    const sortedObjects = sceneObjects.map((obj) => {
        const pos = vec3(obj.transform[0][3], obj.transform[1][3], obj.transform[2][3]);
        const dx = pos[0] - camera.eye[0];
        const dy = pos[1] - camera.eye[1];
        const dz = pos[2] - camera.eye[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return { obj, dist };
    });
    sortedObjects.sort((a, b) => b.dist - a.dist);

    for (let i = 0; i < sortedObjects.length; i++) {
        const { obj } = sortedObjects[i];
        uploadModelView(obj.transform);
        uploadMaterialUniforms(obj.material);
        obj.object.draw(gl, program, gl.TRIANGLES);
    }

    if (spotlightCircle) {
        for (let i = 0; i < MAX_LIGHTS; i++) {
            if (lights[i]) {
                drawSpotlightCircle(gl, lights[i]);
            }
        }
    }
}

// ----- Load shaders and start the app -----
const shaderUrls = ['shader.vert', 'shader.frag'];
loadShadersFromURLS(shaderUrls)
    .then((shaders) => {
        setup(shaders);
    })
    .catch((err) => {
        console.error('Failed to load shaders:', err);
    });
