export { init, draw };

import { vec3, normalize, flatten } from '../MV.js';

let points = [];
let normals = [];
const faces = [];
const edges = [];

let points_buffer;
let normals_buffer;
let faces_buffer;
let edges_buffer;

let vao;

const CYLINDER_N = 30;

function _addEdge(diskPoints, a, b, c, d) {
	edges.push(a);
	edges.push(0);

	edges.push(b);
	edges.push(diskPoints + 1);

	edges.push(a);
	edges.push(b);

	edges.push(a);
	edges.push(c);

	edges.push(b);
	edges.push(d);
}

function _addFace(a, b, c, d) {
	faces.push(a);
	faces.push(c);
	faces.push(b);

	faces.push(b);
	faces.push(c);
	faces.push(d);
}

function _addTriangle(a, b, c) {
	faces.push(a);
	faces.push(b);
	faces.push(c);
}

function _build(diskPoints) {
	_buildVertices(diskPoints);
	_buildFaces(diskPoints);
	_buildEdges(diskPoints);
}

function _buildCircle(diskPoints, offset, dir) {
	let o = 0;

	for (let i = 1; i < diskPoints; i++) {
		o = offset + i;

		_addTriangle(offset, dir ? o : o + 1, dir ? o + 1 : o);
	}

	_addTriangle(offset, dir ? o + 1 : offset + 1, dir ? offset + 1 : o + 1);
}

function _buildEdges(diskPoints) {
	let offset = 2 * (diskPoints + 1);
	let o = 0;

	for (let i = 0; i < diskPoints - 1; i++) {
		o = offset + i * 2;

		_addEdge(diskPoints, o, o + 1, o + 2, o + 3);
	}

	_addEdge(diskPoints, o + 2, o + 3, offset, offset + 1);
}

function _buildFaces(diskPoints) {
	_buildCircle(diskPoints, 0, false);
	_buildCircle(diskPoints, diskPoints + 1, true);
	_buildSurface(diskPoints, 2 * (diskPoints + 1));
}

function _buildSurface(diskPoints, offset) {
	let o = 0;

	for (let i = 0; i < diskPoints - 1; i++) {
		o = offset + i * 2;

		_addFace(o, o + 1, o + 2, o + 3);
	}

	_addFace(o + 2, o + 3, offset, offset + 1);
}

function _buildVertices(diskPoints) {
	let top = [];
	let bottom = [];
	let middle = [];

	let top_normals = [];
	let bottom_normals = [];
	let middle_normals = [];

	const up = vec3(0, 1, 0);
	const down = vec3(0, -1, 0);

	top.push(vec3(0, 0.5, 0));
	bottom.push(vec3(0, -0.5, 0));

	top_normals.push(up);
	bottom_normals.push(down);

	const segment = Math.PI * 2 / diskPoints;

	for (let i = 1; i <= diskPoints; i++) {
		const x = Math.cos(i * segment) * 0.5;
		const z = Math.sin(i * segment) * 0.5;

		top.push(vec3(x, 0.5, z));
		bottom.push(vec3(x, -0.5, z));
		middle.push(vec3(x, 0.5, z));
		middle.push(vec3(x, -0.5, z));

		const normal = normalize(vec3(x, 0, z));

		top_normals.push(up);
		bottom_normals.push(down);
		middle_normals.push(normal);
		middle_normals.push(normal);
	}

	points = top.concat(bottom).concat(middle)
	normals = top_normals.concat(bottom_normals).concat(middle_normals)
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

function init(gl, diskPoints = CYLINDER_N) {
	_build(diskPoints);
	_uploadData(gl);
}

function _uploadData(gl) {

	vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	points_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, points_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);

	let a_position = 0;
	gl.vertexAttribPointer(a_position, 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(a_position);

	normals_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, normals_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);

	let a_normal = 1;
	gl.vertexAttribPointer(a_normal, 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(a_normal);

	faces_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, faces_buffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(faces), gl.STATIC_DRAW);

	edges_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edges_buffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edges), gl.STATIC_DRAW);

	gl.bindVertexArray(null);
}
