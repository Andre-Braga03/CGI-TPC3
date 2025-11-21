/**
 * sphere.js
 * 
 */

export { init, draw };

import { vec3, normalize, flatten } from '../MV.js';

const points = [];
const normals = [];
const faces = [];
const edges = [];

let points_buffer;
let normals_buffer;
let faces_buffer;
let edges_buffer;

let vao;

const SPHERE_LATS = 50;
const SPHERE_LONS = 50;

function init(gl, program) {
    _build(SPHERE_LATS, SPHERE_LONS);
    _uploadData(gl, program);
}

// Generate points using polar coordinates
function _build(nlat, nlon) {
    // phi will be latitude
    // theta will be longitude

    const d_phi = Math.PI / (nlat + 1);
    const d_theta = 2 * Math.PI / nlon;
    const r = 0.5;

    // Genreate the points

    // Generate north polar cap points and normals
    const north = vec3(0, r, 0);
    points.push(north);
    normals.push(vec3(0, 1, 0));

    // Generate middle points and normals
    for (let i = 0, phi = Math.PI / 2 - d_phi; i < nlat; i++, phi -= d_phi) {
        for (let j = 0, theta = 0; j < nlon; j++, theta += d_theta) {
            const pt = vec3(r * Math.cos(phi) * Math.cos(theta), r * Math.sin(phi), r * Math.cos(phi) * Math.sin(theta));
            const n = vec3(pt);
            points.push(pt);
            normals.push(normalize(n));
        }
    }

    // Generate south polar cap points and normals
    const south = vec3(0, -r, 0);
    points.push(south);
    normals.push(vec3(0, -1, 0));

    // Generate the faces

    // north pole faces
    for (let i = 0; i < nlon - 1; i++) {
        faces.push(0);
        faces.push(i + 2);
        faces.push(i + 1);
    }
    faces.push(0);
    faces.push(1);
    faces.push(nlon);

    // general middle faces
    let offset = 1;
    let p;

    for (let i = 0; i < nlat - 1; i++) {
        for (let j = 0; j < nlon - 1; j++) {
            p = offset + i * nlon + j;
            faces.push(p);
            faces.push(p + nlon + 1);
            faces.push(p + nlon);

            faces.push(p);
            faces.push(p + 1);
            faces.push(p + nlon + 1);
        }
        p = offset + i * nlon + nlon - 1;
        faces.push(p);
        faces.push(p + 1);
        faces.push(p + nlon);

        faces.push(p);
        faces.push(p - nlon + 1);
        faces.push(p + 1);
    }

    // south pole faces
    offset = 1 + (nlat - 1) * nlon;
    for (let j = 0; j < nlon - 1; j++) {
        faces.push(offset + nlon);
        faces.push(offset + j);
        faces.push(offset + j + 1);
    }
    faces.push(offset + nlon);
    faces.push(offset + nlon - 1);
    faces.push(offset);

    // Build the edges
    for (let i = 0; i < nlon; i++) {
        edges.push(0);   // North pole 
        edges.push(i + 1);
    }

    for (let i = 0; i < nlat; i++, p++) {
        for (let j = 0; j < nlon; j++, p++) {
            p = 1 + i * nlon + j;
            edges.push(p);   // horizontal line (same latitude)
            if (j != nlon - 1)
                edges.push(p + 1);
            else edges.push(p + 1 - nlon);

            if (i != nlat - 1) {
                edges.push(p);   // vertical line (same longitude)
                edges.push(p + nlon);
            }
            else {
                edges.push(p);
                edges.push(points.length - 1);
            }
        }
    }

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