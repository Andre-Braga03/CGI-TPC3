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

const MAX_LIGHTS = 8;

/** @type {WebGL2RenderingContext} */
let gl;
let program;        // current shader program (Phong or Gouraud)
let programPhong;   // Phong shading (per fragment)
let programGouraud; // Gouraud shading (per vertex)

// Matrices
let mView;
let mProjection;
let mModelView;
let mNormal;

// Scene objects (geometry + transform + material)
const sceneObjects = [];

// Camera parameters (world coordinates)
const camera = {
    eye: vec3(0, 7, 13),   
    at:  vec3(0, 1, 0),   
    up:  vec3(0, 1, 0),

    fovy: 45,
    near: 0.1,
    far: 40
};

// Store initial camera values (for reset with R key)
const initialCamera = {
    eye: vec3(camera.eye[0], camera.eye[1], camera.eye[2]),
    at:  vec3(camera.at[0],  camera.at[1],  camera.at[2]),
    up:  vec3(camera.up[0],  camera.up[1],  camera.up[2])
};

// Camera orientation (yaw/pitch in radians) for mouse look
let yaw = 0;
let pitch = 0;

// Input state
const keyState = {};
let lastFrameTime = 0;
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

const moveSpeed = 2.0;      // movement units per second

// Base materials (0–255 range)
const baseMaterials = {
    platform: { Ka: [120, 80, 50],  Kd: [139,  90, 43], Ks: [ 80,  80,  80], shininess: 30  },
    bunny:    { Ka: [200,150,200],  Kd: [220,180,220], Ks: [255, 255, 255], shininess: 100 },
    cube:     { Ka: [255, 50, 50],  Kd: [255, 50, 50], Ks: [255, 255, 255], shininess: 50  },
    torus:    { Ka: [ 50,255, 50],  Kd: [ 50,255, 50], Ks: [255, 255, 255], shininess: 100 },
    cylinder: { Ka: [ 50,150,255],  Kd: [ 50,150,255], Ks: [200, 200, 200], shininess: 80  }
};

// Lights array (size MAX_LIGHTS)
const lights = [];
for (let i = 0; i < MAX_LIGHTS; i++) {
    lights.push({
        enabled: i === 0,                  // Only first light enabled by default
        type: 0,                           // 0 = point, 1 = directional, 2 = spotlight
        position: vec4(0, 0, 10, 1),       // Interpreted in camera or world space
        axis: normalize(vec3(0, 0, -1)),   // Spotlight axis
        aperture: 10,                      // Aperture angle in degrees
        cutoff: 10,                        // Exponent (η) used in cos(α)^η
        ambient:  [80, 80, 80],
        diffuse:  [120, 120, 120],
        specular: [200, 200, 200]
    });
}

// Rendering options
const options = {
    backfaceCulling: true,
    depthTest: true,
    lightCoords: 'Camera'
};

let gui;
let lightFolders = [];

// Data used to draw the spotlight projection circle on the ground
let spotlightCircle = null;
let spotlightCircleBuffer = null;
let spotlightCircleVAO = null;

/**
 * Setup function
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

    // Build both shader programs
    programPhong   = buildProgramFromSources(gl, shaders['phong.vert'],   shaders['phong.frag']);
    programGouraud = buildProgramFromSources(gl, shaders['gouraud.vert'], shaders['gouraud.frag']);

    if (!programPhong || !programGouraud) {
        console.error('Failed to create shader programs');
        return;
    }

    // Default = Phong
    program = programPhong;
    gl.useProgram(program);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    // Init geometry buffers
    CUBE.init(gl);
    BUNNY.init(gl);
    TORUS.init(gl);
    CYLINDER.init(gl);

    // VAO for spotlight circle
    initSpotlightCircle(gl);

    // ----- Build scene objects -----

    // Platform: 10 x 0.5 x 10 (top face at y = 0)
    sceneObjects.push({
        name: 'Platform',
        object: CUBE,
        transform: mult(translate(0, -0.25, 0), scalem(10, 0.5, 10)),
        material: { ...baseMaterials.platform }
    });

    // Cube → Upper-Left (atrás à esquerda)
    sceneObjects.push({
        name: 'Cube',
        object: CUBE,
        transform: mult(translate(-2.5, 1, -2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.cube }
    });

    // Torus → Lower-Left (frente à esquerda)
    sceneObjects.push({
        name: 'Torus',
        object: TORUS,
        transform: mult(translate(-2.5, 0.4,  2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.torus }
    });

    // Cylinder → Upper-Right (atrás à direita)
    sceneObjects.push({
        name: 'Cylinder',
        object: CYLINDER,
        transform: mult(translate(2.5, 1, -2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.cylinder }
    });

    // Bunny → Lower-Right (frente à direita)
    sceneObjects.push({
        name: 'Bunny',
        object: BUNNY,
        transform: mult(translate(2.5, 1,  2.5), scalem(2, 2, 2)),
        material: { ...baseMaterials.bunny }
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
 * Setup GUI controls
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
    optionsFolder.add(options, 'lightCoords', ['Camera', 'World'])
        .name('light space')
        .onChange(() => uploadLights());

    // ----- Camera -----
    const cameraFolder = gui.addFolder('camera');
    cameraFolder.add(camera, 'fovy', 10, 120).onChange(updateProjection);
    cameraFolder.add(camera, 'near', 0.01, 5).onChange(updateProjection);
    cameraFolder.add(camera, 'far', 10, 100).onChange(updateProjection);

    const eyeFolder = gui.addFolder('Eye');
    eyeFolder.add(camera.eye, '0', -20, 20).name('x').onChange(updateView);
    eyeFolder.add(camera.eye, '1', -20, 20).name('y').onChange(updateView);
    eyeFolder.add(camera.eye, '2', -20, 20).name('z').onChange(updateView);

    const atFolder = gui.addFolder('At');
    atFolder.add(camera.at, '0', -20, 20).name('x').onChange(updateView);
    atFolder.add(camera.at, '1', -20, 20).name('y').onChange(updateView);
    atFolder.add(camera.at, '2', -20, 20).name('z').onChange(updateView);

    const upFolder = gui.addFolder('Up');
    upFolder.add(camera.up, '0', -1, 1).name('x').onChange(updateView);
    upFolder.add(camera.up, '1', -1, 1).name('y').onChange(updateView);
    upFolder.add(camera.up, '2', -1, 1).name('z').onChange(updateView);

    // ----- Lights -----
    const lightsFolder = gui.addFolder('lights');
    lightFolders = [];

    for (let i = 0; i < 3; i++) {   // first 3 lights in GUI
        const light = lights[i];
        const lightFolder = lightsFolder.addFolder(`Light${i + 1}`);

        lightFolder.add(light, 'enabled').onChange(uploadLights);

        lightFolder
            .add(light, 'type', { Point: 0, Directional: 1, Spotlight: 2 })
            .name('type')
            .onChange(() => {
                if (light.type === 1) light.position[3] = 0; // directional
                else light.position[3] = 1;                   // point/spot
                uploadLights();
            });

        const positionFolder = lightFolder.addFolder('position');
        positionFolder.add(light.position, '0', -20, 20).name('x').onChange(uploadLights);
        positionFolder.add(light.position, '1', -20, 20).name('y').onChange(uploadLights);
        positionFolder.add(light.position, '2', -20, 20).name('z').onChange(uploadLights);
        positionFolder.add(light.position, '3', 0, 1).step(1).name('w').onChange(uploadLights);

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

    // ----- Object materials (per object) -----
    const objectsFolder = gui.addFolder('materials');
    sceneObjects.forEach((obj, idx) => {
        const f = objectsFolder.addFolder(obj.name || `Object ${idx + 1}`);

        // Ka (ambient)
        f.addColor(obj.material, 'Ka')
            .name('Ka')
            .onChange(() => {});

        // Kd (diffuse)
        f.addColor(obj.material, 'Kd')
            .name('Kd')
            .onChange(() => {});

        // Ks (specular)
        f.addColor(obj.material, 'Ks')
            .name('Ks')
            .onChange(() => {});

        // shininess
        f.add(obj.material, 'shininess', 1, 200)
            .name('shininess')
            .onChange(() => {});
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

function updateProjection() {
    const canvas = document.getElementById('gl-canvas');
    const aspect = canvas.width / canvas.height;
    mProjection = perspective(camera.fovy, aspect, camera.near, camera.far);
    uploadProjection();
}

function updateView() {
    const up = normalize(camera.up);
    mView = lookAt(camera.eye, camera.at, up);
}

function uploadProjection() {
    const loc = gl.getUniformLocation(program, 'u_projectionMatrix');
    if (loc) gl.uniformMatrix4fv(loc, false, flatten(mProjection));
}

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

/**
 * Rotate the camera around "at" using mouse movement (like ex27).
 * dx, dy are in screen space (pixels).
 */
function rotateCameraWithMouse(dx, dy) {
    if (dx === 0 && dy === 0) return;

    // Movement vector on the screen
    const d = vec2(dx, dy);
    const ang = 0.5 * length(d);  // rotation angle (you can tweak 0.5)

    // Axis in *camera space*: X = right, Y = up, Z = forward
    const axisCam = vec3(-dy, -dx, 0);

    // Build camera basis in world space
    const upN     = normalize(camera.up);
    const forward = normalize(subtract(camera.at, camera.eye));
    const right   = normalize(cross(forward, upN));
    const trueUp  = cross(right, forward);

    // Convert axis from camera space -> world space
    let axisWorld = add(
        add(
            scale(axisCam[0], right),
            scale(axisCam[1], trueUp)
        ),
        scale(-axisCam[2], forward)  // normally 0 here, but deixamos geral
    );
    axisWorld = normalize(axisWorld);

    // Rotation matrix around that world-space axis
    const R = rotate(ang, axisWorld);

    // Vector from at to eye (where the camera is)
    let eyeAt = subtract(camera.eye, camera.at);
    eyeAt = vec4(eyeAt[0], eyeAt[1], eyeAt[2], 0.0);

    // Up vector as vec4
    let up4 = vec4(camera.up[0], camera.up[1], camera.up[2], 0.0);

    // Apply rotation in world space
    eyeAt = mult(R, eyeAt);
    up4   = mult(R, up4);

    // Update camera.eye and camera.up
    camera.eye = add(camera.at, vec3(eyeAt[0], eyeAt[1], eyeAt[2]));
    camera.up  = vec3(up4[0], up4[1], up4[2]);
}

/**
 * Compute camera basis vectors in WORLD space:
 * right, up, forward.
 */
function computeCameraBasis() {
    const upN = normalize(camera.up);
    const f   = normalize(subtract(camera.at, camera.eye)); // forward
    const s   = normalize(cross(f, upN));                   // right
    const u   = cross(s, f);                                // true up
    return { right: s, up: u, forward: f };
}

/**
 * Light position & axis in CAMERA coordinates
 */
function getLightCameraSpace(light) {
    const up   = normalize(camera.up);
    const view = lookAt(camera.eye, camera.at, up);

    if (options.lightCoords === 'Camera') {
        // Sliders already in camera space
        return {
            posEye: vec4(light.position[0], light.position[1], light.position[2], light.position[3]),
            axisEye: vec3(light.axis[0], light.axis[1], light.axis[2])
        };
    } else {
        // Sliders in WORLD space -> multiply by view matrix
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
 * Light position & axis in WORLD coordinates
 * (used only to draw the spotlight circle on the table).
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
        // Sliders are in CAMERA space -> convert to WORLD using camera basis
        const pEye = vec3(light.position[0], light.position[1], light.position[2]);

        // Pw = eye + x * right + y * up - z * forward
        let posWorld = add(camera.eye, scale(pEye[0], basis.right));
        posWorld = add(posWorld,       scale(pEye[1], basis.up));
        posWorld = add(posWorld,       scale(-pEye[2], basis.forward));

        const aEye = vec3(light.axis[0], light.axis[1], light.axis[2]);

        // Direction in world space (no translation)
        let axisWorld = add(scale(aEye[0], basis.right),
                            scale(aEye[1], basis.up));
        axisWorld = add(axisWorld, scale(-aEye[2], basis.forward));
        axisWorld = normalize(axisWorld);

        return { posWorld, axisWorld };
    }
}

/**
 * Upload light uniforms for the current program.
 */
function uploadLights() {
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
 * Upload material uniforms for the current program.
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
 * Initialize spotlight circle geometry (in XY plane, centered at origin, radius 1).
 */
function initSpotlightCircle(gl) {
    const segments = 32;
    const points = [];
    const indices = [];

    points.push(0, 0, 0); // center

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(Math.cos(angle), 0, Math.sin(angle));
    }

    for (let i = 1; i <= segments; i++) {
        indices.push(0, i, i + 1);
    }
    indices.push(0, segments, 1);

    spotlightCircleVAO = gl.createVertexArray();
    gl.bindVertexArray(spotlightCircleVAO);

    const pointsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    const a_position = 0;
    gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_position);

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
 * Draw spotlight circle for one light (plane y = 0 in WORLD space).
 */
function drawSpotlightCircle(gl, light) {
    if (light.type !== 2 || !light.enabled) return; // Only spotlights

    const lw = getLightWorldSpace(light);
    const lightPosWorld = lw.posWorld;
    const axisWorld     = lw.axisWorld;

    // Spotlight direction (points along -axis)
    const lightDirWorld = normalize(vec3(
        -axisWorld[0],
        -axisWorld[1],
        -axisWorld[2]
    ));

    // Intersect ray with plane y = 0 (table)
    if (lightPosWorld[1] > 0 && lightDirWorld[1] < 0.0) {
        const t = -lightPosWorld[1] / lightDirWorld[1];

        const groundPos = vec3(
            lightPosWorld[0] + lightDirWorld[0] * t,
            0.01, // small offset to avoid z-fighting
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

/**
 * Compute initial yaw/pitch angles from camera eye/at.
 */
function computeInitialAngles() {
    const f = normalize(subtract(camera.at, camera.eye));
    yaw   = Math.atan2(f[2], f[0]);
    pitch = Math.asin(f[1]);
}

/**
 * Update camera.at based on current yaw/pitch angles.
 */
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

/**
 * Reset camera to initial position and orientation.
 */
function resetCamera() {
    camera.eye = vec3(initialCamera.eye[0], initialCamera.eye[1], initialCamera.eye[2]);
    camera.at  = vec3(initialCamera.at[0],  initialCamera.at[1],  initialCamera.at[2]);
    camera.up  = vec3(initialCamera.up[0],  initialCamera.up[1],  initialCamera.up[2]);
    computeInitialAngles();
}

/**
 * Initialize input event handlers for keyboard and mouse.
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

        rotateCameraWithMouse(dx, dy);
    });
}

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

    camera.eye = add(camera.eye, move);
    camera.at  = add(camera.at, move);
}

/**
 * Main render loop
 */
function render(timestamp) {
    requestAnimationFrame(render);

    const dt = lastFrameTime ? (timestamp - lastFrameTime) / 1000.0 : 0;
    lastFrameTime = timestamp;

    updateCameraFromInput(dt);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    uploadProjection();
    uploadLights();

    // Draw opaque objects (back to front)
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

    // Draw spotlight circles
    if (spotlightCircle) {
        for (let i = 0; i < MAX_LIGHTS; i++) {
            if (lights[i]) {
                drawSpotlightCircle(gl, lights[i]);
            }
        }
    }
}

/**
 * Load shaders from URLs and start the application.
 */
const shaderUrls = ['phong.vert', 'phong.frag', 'gouraud.vert', 'gouraud.frag'];
loadShadersFromURLS(shaderUrls)
    .then((shaders) => {
        setup(shaders);
    })
    .catch((err) => {
        console.error('Failed to load shaders:', err);
    });