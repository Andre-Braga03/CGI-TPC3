/**
 * cube.js
 * 
 */
export {
    init, draw
}

import { vec3, flatten } from '../MV.js';

const vertices = [
    vec3(-0.5, -0.5, +0.5),     // 0
    vec3(+0.5, -0.5, +0.5),     // 1
    vec3(+0.5, +0.5, +0.5),     // 2
    vec3(-0.5, +0.5, +0.5),     // 3
    vec3(-0.5, -0.5, -0.5),     // 4
    vec3(+0.5, -0.5, -0.5),     // 5
    vec3(+0.5, +0.5, -0.5),     // 6
    vec3(-0.5, +0.5, -0.5)      // 7
];

const points = [];
const normals = [];
const faces = [];
const edges = [];

let points_buffer;
let normals_buffer;
let faces_buffer;
let edges_buffer;

let vao;

function init(gl) {
    _build();
    _uploadData(gl);
}

function _build() {
    _addFace(0, 1, 2, 3, vec3(0, 0, 1));
    _addFace(1, 5, 6, 2, vec3(1, 0, 0));
    _addFace(4, 7, 6, 5, vec3(0, 0, -1));
    _addFace(0, 3, 7, 4, vec3(-1, 0, 0));
    _addFace(3, 2, 6, 7, vec3(0, 1, 0));
    _addFace(0, 4, 5, 1, vec3(0, -1, 0));
}

function _uploadData(gl) {

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    points_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, points_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);

    const a_position = 0;
    gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_position);

    normals_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);

    const a_normal = 1;
    if (a_normal != -1) {
        gl.enableVertexAttribArray(a_normal);
        gl.vertexAttribPointer(a_normal, 3, gl.FLOAT, false, 0, 0);
    }

    gl.bindVertexArray(null);

    faces_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, faces_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(faces), gl.STATIC_DRAW);

    edges_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edges_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(edges), gl.STATIC_DRAW);
}

function draw(gl, program, primitive) {
    gl.useProgram(program);

    gl.bindAttribLocation(program, 0, "a_position");
    gl.bindAttribLocation(program, 1, "a_normal");

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, primitive == gl.LINES ? edges_buffer : faces_buffer);
    gl.drawElements(primitive, primitive == gl.LINES ? edges.length : faces.length, gl.UNSIGNED_BYTE, 0);
    gl.bindVertexArray(null);
}


function _addFace(a, b, c, d, n) {
    let offset = points.length;

    points.push(vertices[a]);
    points.push(vertices[b]);
    points.push(vertices[c]);
    points.push(vertices[d]);
    for (let i = 0; i < 4; i++)
        normals.push(n);

    // Add 2 triangular faces (a,b,c) and (a,c,d)
    faces.push(offset);
    faces.push(offset + 1);
    faces.push(offset + 2);

    faces.push(offset);
    faces.push(offset + 2);
    faces.push(offset + 3);

    // Add first edge (a,b)
    edges.push(offset);
    edges.push(offset + 1);

    // Add second edge (b,c)
    edges.push(offset + 1);
    edges.push(offset + 2);
}