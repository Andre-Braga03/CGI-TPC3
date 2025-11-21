/**
 * cow.js
 * 
 */
export {
    init, draw
}

import { vec3, flatten, add, subtract, normalize } from '../MV.js';

import { points, faces } from './cow-data.js';

let points_buffer;
let normals_buffer;
let faces_buffer;
let edges_buffer;

const edges = [];
const normals = [];

let vao;

function init(gl) {
    _build();
    _uploadData(gl);
}

function _build() {

    let xmin = points[0], ymin = points[1], zmin = points[2];
    let xmax = points[0], ymax = points[1], zmax = points[2];

    for (var i = 0; i < points.length; i += 3) {

        xmin = Math.min(xmin, points[i]);
        xmax = Math.max(xmax, points[i]);

        ymin = Math.min(ymin, points[i + 1]);
        ymax = Math.max(ymax, points[i + 1]);

        zmin = Math.min(zmin, points[i + 2]);
        zmax = Math.max(zmax, points[i + 2]);

        pointNormals[i / 3] = vec3(0, 0, 0);
    }

    const xmed = (xmin + xmax) / 2;
    const ymed = (ymin + ymax) / 2;
    const zmed = (zmin + zmax) / 2;

    for (let i = 0; i < points.length; i += 3) {
        points[i] = (points[i] - xmed) / (ymax - ymin);
        points[i + 1] = (points[i + 1] - ymed) / (ymax - ymin);
        points[i + 2] = (points[i + 2] - zmed) / (ymax - ymin);
    }

    for (let i = 0; i < faces.length; i += 3) {
        _calcFaceNormal(faces[i], faces[i + 1], faces[i + 2]);
        _addEdge(faces[i + 0], faces[i + 1]);
        _addEdge(faces[i + 1], faces[i + 2]);
        _addEdge(faces[i + 2], faces[i + 0]);
    }

    for (let i = 0; i < points.length / 3; i++) {
        normals.push(normalize(pointNormals[i]));
    }
}

var pointNormals = {};
function _calcFaceNormal(i1, i2, i3) {
    const p1 = vec3(points[i1 * 3], points[i1 * 3 + 1], points[i1 * 3 + 2]);
    const p2 = vec3(points[i2 * 3], points[i2 * 3 + 1], points[i2 * 3 + 2]);
    const p3 = vec3(points[i3 * 3], points[i3 * 3 + 1], points[i3 * 3 + 2]);
    const u = subtract(p2, p1);
    const v = subtract(p3, p1);

    const normal = vec3(
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
    )
    pointNormals[i1] = add(pointNormals[i1], normal);
    pointNormals[i2] = add(pointNormals[i2], normal);
    pointNormals[i3] = add(pointNormals[i3], normal);
}

const existingEdges = {};
function _addEdge(i1, i2) {
    if (i1 > i2) {
        const aux = i2;
        i2 = i1;
        i1 = aux;
    }
    if (!(existingEdges[i1] && existingEdges[i1][i2])) {
        edges.push(i1);
        edges.push(i2);
        if (!existingEdges[i1]) existingEdges[i1] = {};
        existingEdges[i1][i2] = true;
    }
}

function _uploadData(gl) {

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    points_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, points_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);

    const vPosition = 0;
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    normals_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);

    const vNormal = 1;
    if (vNormal != -1) {
        gl.enableVertexAttribArray(vNormal);
        gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    }

    gl.bindVertexArray(null);

    faces_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, faces_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(faces), gl.STATIC_DRAW);

    edges_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edges_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edges), gl.STATIC_DRAW);
}

function draw(gl, program, primitive) {
    gl.useProgram(program);

    gl.bindAttribLocation(program, 0, "a_position");
    gl.bindAttribLocation(program, 1, "a_normal");

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, primitive == gl.LINES ? edges_buffer : faces_buffer);
    gl.drawElements(primitive, primitive == gl.LINES ? edges.length : faces.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
}