import { loadShadersFromURLS, setupWebGL, buildProgramFromSources } from './libs/utils.js';
import {
    vec2,
    vec3,
    vec4,
    flatten,
    lookAt,
    perspective,
    mult,
    rotate,
    translate,
    scalem,
    normalMatrix,
    normalize,
    add,
    subtract,
    cross,
    scale,
    length,
} from './libs/MV.js';

import * as GUI from 'dat.gui';

import * as CUBE from './libs/objects/cube.js';
import * as BUNNY from './libs/objects/bunny.js';
import * as TORUS from './libs/objects/torus.js';
import * as CYLINDER from './libs/objects/cylinder.js';


const MAX_LIGHTS = 8; // how many lights we support

let gl;
let program;        // current shader
let programPhong;   // Phong shading (per-fragment)
let programGouraud; // Gouraud shading (per-vertex)

// Matrices
let mView;
let mProjection;
let mModelView;
let mNormal;

// Scene objects (geometry + transform + material)
const sceneObjects = [];

// ------------------------------------------------------------
// Camera (world coordinates)
// y = vertical, z = depth, x = left-right
// ------------------------------------------------------------
const camera = {
    eye: vec3(0, 7, 13), // camera position
    at:  vec3(0, 1, 0),  // point we look at
    up:  vec3(0, 1, 0),  // up direction

    fovy: 45,   // field of view (degrees)
    near: 0.1,  // near clipping plane
    far: 40     // far clipping plane
};

// Save initial camera to allow reset
const initialCamera = {
    eye: vec3(camera.eye[0], camera.eye[1], camera.eye[2]),
    at:  vec3(camera.at[0],  camera.at[1],  camera.at[2]),
    up:  vec3(camera.up[0],  camera.up[1],  camera.up[2])
};

// Input state
const keyState = {};
let lastFrameTime = 0;
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

const moveSpeed = 2.0; // movement speed units per second

// ------------------------------------------------------------
// Materials (0–255 range because of dat.gui color picker)
// ------------------------------------------------------------
const baseMaterials = {
    platform: { Ka: [120,  80,  50], Kd: [139,  90,  43], Ks: [ 80,  80,  80], shininess: 30  },
    bunny:    { Ka: [200, 150, 200], Kd: [220, 180, 220], Ks: [255, 255, 255], shininess: 100 },
    cube:     { Ka: [255,  50,  50], Kd: [255,  50,  50], Ks: [255, 255, 255], shininess: 50  },
    torus:    { Ka: [ 50, 255,  50], Kd: [ 50, 255,  50], Ks: [255, 255, 255], shininess: 100 },
    cylinder: { Ka: [ 50, 150, 255], Kd: [ 50, 150, 255], Ks: [200, 200, 200], shininess: 80  }
};

// ------------------------------------------------------------
// Lights (3 lights)
// ------------------------------------------------------------
const lights = [];

// Default spotlight aperture used when a light is switched to Spotlight.
const defaultSpotAperture = 22.0;

// Common target roughly at the center of the objects on the table.
const sceneTarget = vec3(0, 1, 0);

// Light 0 – top light above table center (world coordinates)
lights[0] = {
    enabled: true,
    type: 0,                                // default: point light
    position: vec4(0, 10, 0, 1),            // higher and centered above table
    axis: normalize(subtract(sceneTarget, vec3(0, 10, 0))),
    aperture: defaultSpotAperture,
    cutoff:   15.0,
    ambient:  [80, 80, 80],
    diffuse:  [120, 120, 120],
    specular: [200, 200, 200]
};

// Light 1 – front-right spotlight, pointing to table center
lights[1] = {
    enabled: true,
    type: 2,
    position: vec4(4, 10, 4, 1),            // front-right, higher and nearer center
    axis: normalize(subtract(sceneTarget, vec3(4, 10, 4))),
    aperture: defaultSpotAperture,
    cutoff:   15.0,
    ambient:  [80, 80, 80],
    diffuse:  [120, 120, 120],
    specular: [200, 200, 200]
};

// Light 2 – front-left spotlight, symmetric to Light1
lights[2] = {
    enabled: true,
    type: 2,
    position: vec4(-4, 10, 4, 1),           // front-left, higher and nearer center
    axis: normalize(subtract(sceneTarget, vec3(-4, 10, 4))),
    aperture: defaultSpotAperture,
    cutoff:   15.0,
    ambient:  [80, 80, 80],
    diffuse:  [120, 120, 120],
    specular: [200, 200, 200]
};

// Rendering options
const options = {
    backfaceCulling: true,
    depthTest: true,
    // "Camera": sliders represent eye-space coords (lights move with camera)
    // "World" : sliders represent world-space coords (lights fixed in scene)
    lightCoords: 'Camera'
};

let gui;
let lightFolders = [];

// Spotlight circle data (for visualizing spotlight footprint)
let spotlightCircle = null;
let spotlightCircleBuffer = null;
let spotlightCircleVAO = null;

/* ============================================================
   CAMERA HELPERS
   ============================================================ */

// Called whenever camera parameters (eye/at/up) change
function onCameraChanged() {
    updateView();

    // If lights are in camera space, update them as well
    if (options.lightCoords === 'Camera') {
        uploadLights();
    }
}

/* ============================================================
   SETUP
   ============================================================ */

function setup(shaders) {
    const canvas = document.getElementById('gl-canvas');

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    gl = setupWebGL(canvas);
    if (!gl) {
        console.error('WebGL not supported');
        return;
    }

    // Build shader programs
    programPhong   = buildProgramFromSources(gl, shaders['phong.vert'],   shaders['phong.frag']);
    programGouraud = buildProgramFromSources(gl, shaders['gouraud.vert'], shaders['gouraud.frag']);

    if (!programPhong || !programGouraud) {
        console.error('Failed to create shader programs');
        return;
    }

    // Start with Phong shading
    program = programPhong;
    gl.useProgram(program);

    // Basic GL state
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Initialize geometry
    CUBE.init(gl);
    BUNNY.init(gl);
    TORUS.init(gl);
    CYLINDER.init(gl);

    // Spotlight circle geometry (unit circle on XZ plane)
    initSpotlightCircle(gl);

    // -----------------------------------------------------
    // Build scene objects (platform + 4 shapes)
    // -----------------------------------------------------

    // Platform: 10 x 0.5 x 10 (top surface at y = 0)
    sceneObjects.push({
        name: 'Platform',
        object: CUBE,
        transform: mult(translate(0, -0.25, 0), scalem(10, 0.5, 10)),
        material: { ...baseMaterials.platform }
    });

    // CUBE → back-left (x -, z -)
    sceneObjects.push({
        name: 'Cube',
        object: CUBE,
        transform: mult(translate(-2.5, 1, -2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.cube }
    });

    // TORUS → front-left (x -, z +)
    sceneObjects.push({
        name: 'Torus',
        object: TORUS,
        transform: mult(translate(-2.5, 0.4,  2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.torus }
    });

    // CYLINDER → back-right (x +, z -)
    sceneObjects.push({
        name: 'Cylinder',
        object: CYLINDER,
        transform: mult(translate(2.5, 1, -2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.cylinder }
    });

    // BUNNY → front-right (x +, z +)
    sceneObjects.push({
        name: 'Bunny',
        object: BUNNY,
        transform: mult(translate(2.5, 1,  2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.bunny }
    });

    // GUI, camera matrices, input handlers
    setupGUI();
    updateProjection();
    updateView();
    initInputHandlers(canvas);

    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        updateProjection();
    });

    render();
}

/* ============================================================
   GUI
   ============================================================ */

function setupGUI() {
    gui = new GUI.GUI({ autoPlace: true });

    // ----- Options -----
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
    optionsFolder.add(options, 'lightCoords', ['Camera', 'World'])
        .name('light space')
        .onChange(() => uploadLights());

    // ----- Camera -----
    const cameraFolder = gui.addFolder('camera');
    cameraFolder.add(camera, 'fovy', 10, 100).onChange(updateProjection);
    cameraFolder.add(camera, 'near', 0.01, 100).onChange(updateProjection);
    cameraFolder.add(camera, 'far',  5, 100).onChange(updateProjection);

    const eyeFolder = cameraFolder.addFolder('Eye');
    eyeFolder.add(camera.eye, '0', -20, 20).name('x').onChange(onCameraChanged);
    eyeFolder.add(camera.eye, '1', -20, 20).name('y').onChange(onCameraChanged);
    eyeFolder.add(camera.eye, '2', -20, 20).name('z').onChange(onCameraChanged);

    const atFolder = cameraFolder.addFolder('At');
    atFolder.add(camera.at, '0', -20, 20).name('x').onChange(onCameraChanged);
    atFolder.add(camera.at, '1', -20, 20).name('y').onChange(onCameraChanged);
    atFolder.add(camera.at, '2', -20, 20).name('z').onChange(onCameraChanged);

    const upFolder = cameraFolder.addFolder('Up');
    upFolder.add(camera.up, '0', -1, 1).name('x').onChange(onCameraChanged);
    upFolder.add(camera.up, '1', -1, 1).name('y').onChange(onCameraChanged);
    upFolder.add(camera.up, '2', -1, 1).name('z').onChange(onCameraChanged);

    // ----- Lights -----
    const lightsFolder = gui.addFolder('lights');
    lightFolders = [];

    for (let i = 0; i < MAX_LIGHTS; i++) {
        const light = lights[i];
        const lightFolder = lightsFolder.addFolder(`Light${i + 1}`);

        lightFolder.add(light, 'enabled').onChange(uploadLights);

        lightFolder
            .add(light, 'type', { Point: 0, Directional: 1, Spotlight: 2 })
            .name('type')
            .onChange(() => {
                // w = 0 → directional, w = 1 → point/spot
                if (light.type === 1) light.position[3] = 0;
                else light.position[3] = 1;
                uploadLights();
            });

        const positionFolder = lightFolder.addFolder('position');
        positionFolder.add(light.position, '0', -20, 20).name('x').onChange(uploadLights);
        positionFolder.add(light.position, '1', -20, 20).name('y').onChange(uploadLights);
        positionFolder.add(light.position, '2', -20, 20).name('z').onChange(uploadLights);

        const intensitiesFolder = lightFolder.addFolder('intensities');
        intensitiesFolder.addColor(light, 'ambient').onChange(uploadLights);
        intensitiesFolder.addColor(light, 'diffuse').onChange(uploadLights);
        intensitiesFolder.addColor(light, 'specular').onChange(uploadLights);

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

        lightFolder.add(light, 'aperture', 0, 180).onChange(uploadLights);
        lightFolder.add(light, 'cutoff', 0, 50).onChange(uploadLights);

        lightFolders.push(lightFolder);
    }

    // ----- Object materials -----
    const objectsFolder = gui.addFolder('materials');
    sceneObjects.forEach((obj, idx) => {
        const f = objectsFolder.addFolder(obj.name || `Object ${idx + 1}`);
        f.addColor(obj.material, 'Ka').name('Ka');
        f.addColor(obj.material, 'Kd').name('Kd');
        f.addColor(obj.material, 'Ks').name('Ks');
        f.add(obj.material, 'shininess', 1, 200).name('shininess');
    });

    // ----- Shading mode -----
    const shadingFolder = gui.addFolder('shading');
    const shadingParams = { mode: 'Phong' };

    shadingFolder.add(shadingParams, 'mode', ['Phong', 'Gouraud'])
        .name('mode')
        .onChange((val) => {
            program = (val === 'Phong') ? programPhong : programGouraud;
        });

    gui.add({ close: () => gui.close() }, 'close').name('Close Controls');
}

/* ============================================================
   MATRICES
   ============================================================ */

// Update projection matrix (uses fovy, near, far)
function updateProjection() {
    const canvas = document.getElementById('gl-canvas');
    const aspect = canvas.width / canvas.height;

    // Simple safety: keep near < far
    if (camera.near < 0.01) camera.near = 0.01;
    if (camera.near >= camera.far - 0.01) {
        camera.near = camera.far - 0.01;
    }

    mProjection = perspective(camera.fovy, aspect, camera.near, camera.far);

    const loc = gl.getUniformLocation(program, 'u_projectionMatrix');
    if (loc) gl.uniformMatrix4fv(loc, false, flatten(mProjection));
}

// Update view matrix (called when camera moves)
function updateView() {
    const up = normalize(camera.up);
    mView = lookAt(camera.eye, camera.at, up);
}

// Upload current projection (called every frame before drawing)
function uploadProjection() {
    const loc = gl.getUniformLocation(program, 'u_projectionMatrix');
    if (loc) gl.uniformMatrix4fv(loc, false, flatten(mProjection));
}

// Upload model-view and normal matrices for one object
function uploadModelView(modelMatrix) {
    const up = normalize(camera.up);
    mView = lookAt(camera.eye, camera.at, up);

    mModelView = mult(mView, modelMatrix);
    mNormal    = normalMatrix(mModelView, true);

    const locMV = gl.getUniformLocation(program, 'u_modelViewMatrix');
    const locN  = gl.getUniformLocation(program, 'u_normalMatrix');

    if (locMV) gl.uniformMatrix4fv(locMV, false, flatten(mModelView));
    if (locN)  gl.uniformMatrix3fv(locN, false, flatten(mNormal));
}

/* ============================================================
   CAMERA CONTROL
   ============================================================ */

/**
 * Rotate camera around "at" using mouse movement.
 * dx, dy are in pixels.
 */
function rotateCameraWithMouse(dx, dy) {
    if (dx === 0 && dy === 0) return;

    // Movement vector on the screen
    const d = vec2(dx, dy);
    const ang = 0.5 * length(d); // rotation angle (degrees)

    // Axis in camera space: X = right, Y = up, Z = forward
    const axisCam = vec3(-dy, -dx, 0);

    // Build camera basis in world space
    const upN     = normalize(camera.up);
    const forward = normalize(subtract(camera.at, camera.eye));
    const right   = normalize(cross(forward, upN));
    const trueUp  = cross(right, forward);

    // Convert axis from camera space → world space
    let axisWorld = add(
        add(scale(axisCam[0], right),
            scale(axisCam[1], trueUp)),
        scale(-axisCam[2], forward)
    );
    axisWorld = normalize(axisWorld);

    // Rotation matrix around that world-space axis
    const R = rotate(ang, axisWorld);

    // Vector from at to eye
    let eyeAt = subtract(camera.eye, camera.at);
    eyeAt = vec4(eyeAt[0], eyeAt[1], eyeAt[2], 0.0);

    // Up vector
    let up4 = vec4(camera.up[0], camera.up[1], camera.up[2], 0.0);

    // Apply rotation
    eyeAt = mult(R, eyeAt);
    up4   = mult(R, up4);

    // Update camera.eye components
    camera.eye[0] = camera.at[0] + eyeAt[0];
    camera.eye[1] = camera.at[1] + eyeAt[1];
    camera.eye[2] = camera.at[2] + eyeAt[2];

    // Update camera.up components
    camera.up[0] = up4[0];
    camera.up[1] = up4[1];
    camera.up[2] = up4[2];

    onCameraChanged();
    if (gui) gui.updateDisplay(); // refresh GUI sliders
}

/**
 * Compute camera basis vectors in world space.
 */
function computeCameraBasis() {
    const upN = normalize(camera.up);
    const f   = normalize(subtract(camera.at, camera.eye)); // forward
    const s   = normalize(cross(f, upN));                   // right
    const u   = cross(s, f);                                // true up
    return { right: s, up: u, forward: f };
}

/**
 * Reset camera to initial state.
 */
function resetCamera() {
    // Copy values back into camera vectors
    for (let i = 0; i < 3; i++) {
        camera.eye[i] = initialCamera.eye[i];
        camera.at[i]  = initialCamera.at[i];
        camera.up[i]  = initialCamera.up[i];
    }

    onCameraChanged();
    if (gui) gui.updateDisplay();
}

/**
 * Keyboard movement (WASD + Space + Shift).
 * Camera moves in the scene.
 */
function updateCameraFromInput(dt) {
    if (dt <= 0) return;

    const forward = normalize(subtract(camera.at, camera.eye));
    const worldUp = vec3(0, 1, 0);
    const right   = normalize(cross(forward, worldUp));

    let move = vec3(0, 0, 0);

    if (keyState['KeyW']) move = add(move, forward);
    if (keyState['KeyS']) move = subtract(move, forward);
    if (keyState['KeyA']) move = subtract(move, right);
    if (keyState['KeyD']) move = add(move, right);
    if (keyState['Space']) move = add(move, worldUp);
    if (keyState['ShiftLeft'] || keyState['ShiftRight'])
        move = subtract(move, worldUp);

    if (move[0] === 0 && move[1] === 0 && move[2] === 0) return;

    move = normalize(move);
    move = scale(moveSpeed * dt, move);

    // Update eye
    camera.eye[0] += move[0];
    camera.eye[1] += move[1];
    camera.eye[2] += move[2];

    // Update at (to keep direction)
    camera.at[0]  += move[0];
    camera.at[1]  += move[1];
    camera.at[2]  += move[2];

    // Prevent camera from going too low
    if (camera.eye[1] < 0.3) camera.eye[1] = 0.3;

    onCameraChanged();
    if (gui) gui.updateDisplay();
}

/**
 * Set up keyboard and mouse events.
 */
function initInputHandlers(canvas) {
    // Keyboard
    window.addEventListener('keydown', (e) => {
        keyState[e.code] = true;

        if (e.code === 'KeyR') {
            resetCamera();
        }
    });

    window.addEventListener('keyup', (e) => {
        keyState[e.code] = false;
    });

    // Mouse drag to rotate camera (orbit)
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

        rotateCameraWithMouse(dx, dy);
    });
}

/* ============================================================
   LIGHTS
   ============================================================ */

/**
 * Get light position & axis in CAMERA coordinates.
 * This is what the shaders expect.
 */
function getLightCameraSpace(light) {
    const up   = normalize(camera.up);
    const view = lookAt(camera.eye, camera.at, up);

    if (options.lightCoords === 'Camera') {
        // In CAMERA space:
        //  - for Point / Directional lights, we use the sliders as eye-space
        //    coordinates, so they move with the camera but keep the chosen
        //    offset.
        //  - for Spotlights, the assignment requires the light to be
        //    emitted from the center of the camera. In that case the
        //    light position is fixed at the camera origin (0,0,0) and
        //    the axis points straight forward (0,0,-1) in eye space,
        //    independent of the sliders.
        if (light.type === 2) {
            // Spotlight in camera space: always from camera center forward
            return {
                posEye: vec4(0, 0, 0, 1),
                axisEye: vec3(0, 0, -1)
            };
        } else {
            // Point or directional: use slider-defined coordinates in eye space
            return {
                posEye: vec4(light.position[0], light.position[1], light.position[2], light.position[3]),
                axisEye: vec3(light.axis[0], light.axis[1], light.axis[2])
            };
        }
    } else {
        // Sliders are in world space → transform with view matrix
        const lpWorld  = vec4(light.position[0], light.position[1], light.position[2], light.position[3]);
        const lpEye4   = mult(view, lpWorld);

        const axisWorld4 = vec4(light.axis[0], light.axis[1], light.axis[2], 0.0);
        const axisEye4   = mult(view, axisWorld4);

        return {
            posEye: vec4(lpEye4[0], lpEye4[1], lpEye4[2], light.position[3]),
            axisEye: vec3(axisEye4[0], axisEye4[1], axisEye4[2])
        };
    }
}

/**
 * Get light position & axis in WORLD coordinates.
 * Used only when drawing the spotlight circle.
 */
function getLightWorldSpace(light) {
    const basis = computeCameraBasis();

    if (options.lightCoords === 'World') {
        // Sliders already in world space
        return {
            posWorld: vec3(light.position[0], light.position[1], light.position[2]),
            axisWorld: normalize(vec3(light.axis[0], light.axis[1], light.axis[2]))
        };
    } else {
        // Sliders are in camera space → convert to world space.
        // For Spotlights in CAMERA space, we want the light to come from
        // the camera center and follow its viewing direction, regardless
        // of the slider values.
        if (light.type === 2) {
            const posWorld = vec3(camera.eye[0], camera.eye[1], camera.eye[2]);
            const axisWorld = basis.forward; // from eye towards "at"
            return { posWorld, axisWorld };
        } else {
            // Point/Directional: use slider-defined eye-space position,
            // then convert to world with the camera basis.
            const pEye = vec3(light.position[0], light.position[1], light.position[2]);

            // Pw = eye + x * right + y * up - z * forward
            let posWorld = add(camera.eye, scale(pEye[0], basis.right));
            posWorld = add(posWorld,       scale(pEye[1], basis.up));
            posWorld = add(posWorld,       scale(-pEye[2], basis.forward));

            const aEye = vec3(light.axis[0], light.axis[1], light.axis[2]);

            let axisWorld = add(scale(aEye[0], basis.right),
                                scale(aEye[1], basis.up));
            axisWorld = add(axisWorld, scale(-aEye[2], basis.forward));
            axisWorld = normalize(axisWorld);

            return { posWorld, axisWorld };
        }
    }
}

/**
 * Upload all light data to the current shader program.
 */
function uploadLights() {
    // Number of active lights
    let nLights = 0;
    for (let i = 0; i < MAX_LIGHTS; i++) {
        if (lights[i].enabled) nLights = i + 1;
    }

    const locNLights = gl.getUniformLocation(program, 'u_n_lights');
    if (locNLights) gl.uniform1i(locNLights, nLights);

    const toColorArray = (color) => {
        if (Array.isArray(color)) return color;
        if (typeof color === 'object' && color.r !== undefined) {
            return [color.r, color.g, color.b];
        }
        return [0, 0, 0];
    };

    for (let i = 0; i < MAX_LIGHTS; i++) {
        const light = lights[i];

        const ambient  = toColorArray(light.ambient);
        const diffuse  = toColorArray(light.diffuse);
        const specular = toColorArray(light.specular);

        const camLight = getLightCameraSpace(light);
        const posEye   = camLight.posEye;
        const axisEye  = camLight.axisEye;

        const pos = [
            posEye[0],
            posEye[1],
            posEye[2],
            (light.type === 1 ? 0 : 1) // 0 = directional, 1 = point/spot
        ];

        const locAmbient  = gl.getUniformLocation(program, `u_light_ambient[${i}]`);
        const locDiffuse  = gl.getUniformLocation(program, `u_light_diffuse[${i}]`);
        const locSpecular = gl.getUniformLocation(program, `u_light_specular[${i}]`);
        const locPosition = gl.getUniformLocation(program, `u_light_position[${i}]`);
        const locAxis     = gl.getUniformLocation(program, `u_light_axis[${i}]`);
        const locAperture = gl.getUniformLocation(program, `u_light_aperture[${i}]`);
        const locCutoff   = gl.getUniformLocation(program, `u_light_cutoff[${i}]`);
        const locType     = gl.getUniformLocation(program, `u_light_type[${i}]`);
        const locEnabled  = gl.getUniformLocation(program, `u_light_enabled[${i}]`);

        if (locAmbient)  gl.uniform3fv(locAmbient, ambient);
        if (locDiffuse)  gl.uniform3fv(locDiffuse, diffuse);
        if (locSpecular) gl.uniform3fv(locSpecular, specular);
        if (locPosition) gl.uniform4fv(locPosition, pos);
        if (locAxis)     gl.uniform3fv(locAxis, axisEye);
        if (locAperture) gl.uniform1f(locAperture, light.aperture);
        if (locCutoff)   gl.uniform1f(locCutoff, light.cutoff);
        if (locType)     gl.uniform1i(locType, light.type);
        if (locEnabled)  gl.uniform1i(locEnabled, light.enabled ? 1 : 0);
    }
}

/**
 * Upload material data to the current shader program.
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

/* ============================================================
   SPOTLIGHT CIRCLE
   ============================================================ */

/**
 * Create a unit circle mesh on XZ plane (y = 0).
 * Used to visualize spotlight footprint on the table.
 */
function initSpotlightCircle(gl) {
    const segments = 32;
    const points = [];
    const indices = [];

    // Center vertex
    points.push(0, 0, 0);

    // Circle vertices
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(Math.cos(angle), 0, Math.sin(angle));
    }

    // Triangle fan indices
    for (let i = 1; i <= segments; i++) {
        indices.push(0, i, i + 1);
    }
    indices.push(0, segments, 1);

    // VAO
    spotlightCircleVAO = gl.createVertexArray();
    gl.bindVertexArray(spotlightCircleVAO);

    // Vertex buffer
    const pointsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    const a_position = 0; // attribute location 0
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
 * Draw spotlight circle for one light, intersecting with plane y = 0.
 */
function drawSpotlightCircle(gl, light) {
    if (light.type !== 2 || !light.enabled) return; // only for spotlights

    const lw = getLightWorldSpace(light);
    const lightPosWorld = lw.posWorld;
    const axisWorld     = lw.axisWorld;

    // Spotlight central direction: use the same convention as u_light_axis,
    // i.e. axis points from the light towards the scene (downwards to table).
    const lightDirWorld = normalize(axisWorld);

    // Intersect ray with plane y = 0 (the table top). We only draw a circle
    // when the light is above the table and the cone is actually pointing
    // towards it (dir.y < 0).
    if (lightPosWorld[1] > 0.0 && lightDirWorld[1] < 0.0) {
        const t = -lightPosWorld[1] / lightDirWorld[1];

        const groundPos = vec3(
            lightPosWorld[0] + lightDirWorld[0] * t,
            0.01,   // small offset above table to avoid z-fighting
            lightPosWorld[2] + lightDirWorld[2] * t
        );

        const distance = Math.abs(t);
        const radius = distance * Math.tan((light.aperture / 2) * Math.PI / 180.0);

        const circleTransform = mult(
            translate(groundPos[0], groundPos[1], groundPos[2]),
            scalem(radius, 1, radius)
        );

        uploadModelView(circleTransform);

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

/* ============================================================
   RENDER LOOP
   ============================================================ */

function render(timestamp) {
    // Schedule next frame
    requestAnimationFrame(render);

    // Time step (seconds)
    const dt = lastFrameTime ? (timestamp - lastFrameTime) / 1000.0 : 0;
    lastFrameTime = timestamp;

    // Update camera from keyboard
    updateCameraFromInput(dt);

    // Clear screen
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Use current shader program
    gl.useProgram(program);

    // Upload projection and lights (current program)
    uploadProjection();
    uploadLights();

    // Sort objects back-to-front (optional, helps with some effects)
    const sortedObjects = sceneObjects.map((obj) => {
        const pos = vec3(obj.transform[0][3], obj.transform[1][3], obj.transform[2][3]);
        const dx = pos[0] - camera.eye[0];
        const dy = pos[1] - camera.eye[1];
        const dz = pos[2] - camera.eye[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return { obj, dist };
    });
    sortedObjects.sort((a, b) => b.dist - a.dist);

    // Draw all scene objects
    for (let i = 0; i < sortedObjects.length; i++) {
        const { obj } = sortedObjects[i];
        uploadModelView(obj.transform);
        uploadMaterialUniforms(obj.material);
        obj.object.draw(gl, program, gl.TRIANGLES);
    }

    // Draw spotlight circles (for visualization)
    // In CAMERA mode, spotlights are aligned with the camera forward axis,
    // so the footprint appears centered in the view.
    //
    // In WORLD mode we only draw the footprint when the camera is above
    // the table (eye.y > 0). This avoids seeing the circle from "below
    // the floor" when the user flies under the platform.
    if (spotlightCircle) {
        const cameraAboveTable = camera.eye[1] > 0.0;
        if (options.lightCoords === 'World' && !cameraAboveTable) {
            // Skip drawing spotlight circles when looking from below.
        } else {
            for (let i = 0; i < MAX_LIGHTS; i++) {
                if (lights[i]) {
                    drawSpotlightCircle(gl, lights[i]);
                }
            }
        }
    }
}

/* ============================================================
   SHADER LOADING
   ============================================================ */

const shaderUrls = ['phong.vert', 'phong.frag', 'gouraud.vert', 'gouraud.frag'];

loadShadersFromURLS(shaderUrls)
    .then((shaders) => {
        setup(shaders);
    })
    .catch((err) => {
        console.error('Failed to load shaders:', err);
    });
