/* A small, self-contained Guilin landscape. All scenery is real WebGL geometry. */
(() => {
  'use strict';

  const canvas = document.querySelector('#guilin-3d');
  if (!canvas) return;
  const stage = canvas.closest('.scene-stage') || canvas.parentElement;
  const motionButton = document.querySelector('#motion-toggle');
  const resetButton = document.querySelector('#scene-reset');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrowScreen = window.matchMedia('(max-width: 700px)');
  const startYaw = 0.4;
  const startPitch = 0.47;
  const state = {
    available: false,
    paused: reducedMotion.matches,
    yaw: startYaw,
    pitch: startPitch,
    frameCount: 0
  };
  let targetYaw = startYaw;
  let targetPitch = startPitch;
  let visible = true;
  let frameRequest = 0;
  let lastTime = 0;
  let interactionUntil = 0;
  let pointer = null;
  let pointerHover = { x: 0, y: 0 };
  let program;
  let vertexBuffer;
  let vertexCount = 0;
  let projectionLocation;
  let viewLocation;
  let eyeLocation;
  let contextLost = false;
  let motionChosen = false;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });

  function markUnavailable() {
    state.available = false;
    stage.classList.remove('scene-ready');
    stage.classList.add('scene-unavailable');
    canvas.dataset.sceneState = 'unavailable';
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
  }

  function synchronizeMotion() {
    document.documentElement.classList.toggle('motion-paused', state.paused);
    if (motionButton) motionButton.setAttribute('aria-pressed', String(!state.paused));
    canvas.dataset.motion = state.paused ? 'paused' : 'active';
  }

  function reset() {
    targetYaw = startYaw;
    targetPitch = startPitch;
    pointerHover = { x: 0, y: 0 };
    interactionUntil = performance.now() + 4500;
    if (reducedMotion.matches) {
      state.yaw = targetYaw;
      state.pitch = targetPitch;
    }
    requestRender();
  }

  window.guilinScene = Object.freeze({
    getState: () => ({ ...state }),
    reset
  });
  synchronizeMotion();

  if (!gl) {
    markUnavailable();
    return;
  }
  canvas.dataset.renderer = 'webgl';
  canvas.dataset.sceneState = 'loading';

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    uniform mat4 uProjection;
    uniform mat4 uView;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec3 vPosition;
    void main() {
      vNormal = aNormal;
      vColor = aColor;
      vPosition = aPosition;
      gl_Position = uProjection * uView * vec4(aPosition, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform vec3 uEye;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec3 vPosition;
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 sunlight = normalize(vec3(-0.65, 1.15, 0.7));
      vec3 fill = normalize(vec3(0.6, 0.4, -0.8));
      float diffuse = max(dot(normal, sunlight), 0.0);
      float bounce = max(dot(normal, fill), 0.0);
      float ambient = 0.54 + clamp(vPosition.y * 0.06, 0.0, 0.12);
      vec3 light = vec3(ambient) + vec3(1.0, 0.94, 0.77) * diffuse * 0.57;
      light += vec3(0.53, 0.85, 0.88) * bounce * 0.18;
      vec3 color = vColor * light;
      vec3 viewDirection = normalize(uEye - vPosition);
      float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
      color += vec3(0.13, 0.24, 0.2) * rim * 0.19;
      color = pow(max(color, vec3(0.0)), vec3(0.95));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const reason = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(reason || 'WebGL shader could not compile');
    }
    return shader;
  }

  const vertices = [];
  const TAU = Math.PI * 2;
  const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
  const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);
  const shade = (color, factor) => color.map(value => clamp(value * factor, 0, 1));
  function noise(seed) {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  }
  function triangle(a, b, c, color) {
    const ab = b.map((value, i) => value - a[i]);
    const ac = c.map((value, i) => value - a[i]);
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const length = Math.hypot(...normal) || 1;
    normal.forEach((value, i) => { normal[i] = value / length; });
    [a, b, c].forEach(point => vertices.push(...point, ...normal, ...color));
  }
  function quad(a, b, c, d, color) {
    triangle(a, b, c, color);
    triangle(a, c, d, color);
  }
  function ellipsePoint(angle, rx, rz, y) {
    return [Math.cos(angle) * rx, y, Math.sin(angle) * rz];
  }

  // Thin, uneven limestone strata give the miniature a tangible cutaway edge.
  function stratum(yBottom, yTop, rx, rz, color, index) {
    const segments = 68;
    for (let i = 0; i < segments; i += 1) {
      const a = i / segments * TAU;
      const b = (i + 1) / segments * TAU;
      const irregularA = 1 + 0.013 * Math.sin(a * 9) + 0.01 * Math.cos(a * 17);
      const irregularB = 1 + 0.013 * Math.sin(b * 9) + 0.01 * Math.cos(b * 17);
      const lowerA = ellipsePoint(a, rx * irregularA * 0.99, rz * irregularA * 0.99, yBottom);
      const lowerB = ellipsePoint(b, rx * irregularB * 0.99, rz * irregularB * 0.99, yBottom);
      const upperA = ellipsePoint(a, rx * irregularA, rz * irregularA, yTop);
      const upperB = ellipsePoint(b, rx * irregularB, rz * irregularB, yTop);
      quad(lowerA, upperA, upperB, lowerB, shade(color, 0.89 + noise(i + index * 43) * 0.2));
      triangle([0, yTop, 0], upperB, upperA, color);
    }
  }

  stratum(-0.49, -0.43, 2.29, 1.58, [0.18, 0.28, 0.24], 0);
  stratum(-0.43, -0.405, 2.33, 1.60, [0.7, 0.59, 0.34], 1);
  stratum(-0.405, -0.29, 2.32, 1.595, [0.3, 0.4, 0.33], 2);
  stratum(-0.29, -0.26, 2.325, 1.599, [0.48, 0.51, 0.38], 3);
  stratum(-0.26, -0.13, 2.35, 1.61, [0.36, 0.45, 0.33], 4);
  stratum(-0.13, -0.095, 2.365, 1.62, [0.63, 0.65, 0.43], 5);
  stratum(-0.095, 0.003, 2.36, 1.615, [0.3, 0.51, 0.3], 6);

  // The grassy top is subtly faceted rather than a texture or a flat photo.
  for (let ring = 0; ring < 7; ring += 1) {
    const inner = ring / 7;
    const outer = (ring + 1) / 7;
    for (let slice = 0; slice < 68; slice += 1) {
      const a = slice / 68 * TAU;
      const b = (slice + 1) / 68 * TAU;
      const color = shade([0.36, 0.57, 0.33], 0.9 + noise(ring * 103 + slice) * 0.13);
      quad(
        ellipsePoint(a, 2.36 * inner, 1.615 * inner, 0.007),
        ellipsePoint(b, 2.36 * inner, 1.615 * inner, 0.007),
        ellipsePoint(b, 2.36 * outer, 1.615 * outer, 0.007),
        ellipsePoint(a, 2.36 * outer, 1.615 * outer, 0.007),
        color
      );
    }
  }

  const riverX = z => 0.24 * Math.sin(z * 2.15) + 0.03;
  const riverWidth = z => 0.25 + 0.15 * Math.pow(clamp((z + 1.6) / 3.2, 0, 1), 1.4);
  function riverPoint(z, side, width, y) {
    const x = riverX(z) + side * width;
    const edgeZ = 1.605 * Math.sqrt(Math.max(0, 1 - Math.pow(x / 2.36, 2)));
    return [x, y, clamp(z, -edgeZ, edgeZ)];
  }
  for (let segment = 0; segment < 80; segment += 1) {
    const z = -1.64 + segment / 80 * 3.28;
    const nextZ = -1.64 + (segment + 1) / 80 * 3.28;
    const width = riverWidth(z);
    const nextWidth = riverWidth(nextZ);
    // A narrow pale stone bank outlines the sinuous river.
    quad(riverPoint(z, -1, width + 0.048, 0.013), riverPoint(nextZ, -1, nextWidth + 0.048, 0.013),
      riverPoint(nextZ, 1, nextWidth + 0.048, 0.013), riverPoint(z, 1, width + 0.048, 0.013), [0.67, 0.74, 0.49]);
    const water = shade([0.33, 0.73, 0.67], 0.99 + Math.sin(segment * 0.1) * 0.04);
    quad(riverPoint(z, -1, width, 0.02), riverPoint(nextZ, -1, nextWidth, 0.02),
      riverPoint(nextZ, 1, nextWidth, 0.02), riverPoint(z, 1, width, 0.02), water);
    // Reflected ribbon along one riverbank, safely above the water surface.
    quad(riverPoint(z, -1, width - 0.027, 0.024), riverPoint(nextZ, -1, nextWidth - 0.027, 0.024),
      riverPoint(nextZ, -1, nextWidth - 0.048, 0.024), riverPoint(z, -1, width - 0.048, 0.024), [0.67, 0.85, 0.68]);
  }

  function mountain(x, z, width, depth, height, seed, pale = false) {
    const rings = 16;
    const sides = 22;
    const points = [];
    for (let ring = 0; ring <= rings; ring += 1) {
      const t = ring / rings;
      // A rounded karst crown and steep fluted walls, not a pointed cone.
      const profile = Math.pow(Math.max(0, Math.cos(t * Math.PI / 2)), 0.44);
      const foot = 1 + 0.23 * Math.pow(1 - t, 6);
      const row = [];
      for (let side = 0; side <= sides; side += 1) {
        const angle = side / sides * TAU;
        const flute = 1 + Math.sin(angle * 5 + seed) * 0.09 + Math.sin(angle * 9 - seed * 2) * 0.055;
        const rock = 1 + Math.sin(t * 16 + angle * 3 + seed) * 0.035;
        const bendX = Math.sin(t * 2 + seed) * 0.075 * t;
        const bendZ = Math.cos(t * 2 + seed) * 0.09 * t;
        row.push([
          x + Math.cos(angle) * width * profile * foot * flute * rock + bendX,
          0.012 + t * height + Math.sin(angle * 3 + seed) * 0.035 * Math.sin(t * Math.PI),
          z + Math.sin(angle) * depth * profile * foot * flute * rock + bendZ
        ]);
      }
      points.push(row);
    }
    for (let ring = 0; ring < rings; ring += 1) {
      const t = ring / rings;
      for (let side = 0; side < sides; side += 1) {
        const strata = 0.94 + noise(seed * 73 + side * 4 + ring) * 0.11;
        const facet = noise(seed * 61 + side * 7);
        const rocky = facet > 0.58 && t > 0.22 && t < 0.9;
        const base = pale ? [0.3, 0.53, 0.4] : [0.16, 0.42, 0.29];
        const top = pale ? [0.59, 0.69, 0.46] : [0.44, 0.62, 0.32];
        let color = mix(base, top, Math.pow(t, 0.9));
        if (rocky) color = mix(color, [0.6, 0.64, 0.48], 0.27 + facet * 0.19);
        color = shade(color, strata);
        quad(points[ring][side], points[ring + 1][side], points[ring + 1][side + 1], points[ring][side + 1], color);
      }
    }
  }

  // Carefully composed banks leave a continuous open view through the river.
  mountain(-0.66, -0.73, 0.42, 0.37, 2.58, 2.1, true);
  mountain(0.63, -0.79, 0.4, 0.38, 2.03, 3.7, true);
  mountain(-1.26, -0.37, 0.43, 0.42, 1.92, 5.1);
  mountain(1.16, -0.28, 0.44, 0.4, 2.31, 7.4);
  mountain(-1.61, 0.27, 0.37, 0.42, 1.18, 8.9);
  mountain(1.71, 0.22, 0.33, 0.4, 1.35, 9.5, true);
  mountain(-0.83, 0.21, 0.3, 0.29, 1.53, 10.2);
  mountain(0.87, 0.55, 0.27, 0.32, 1.05, 12.3);
  mountain(-1.3, 0.91, 0.24, 0.24, 0.68, 13.2, true);
  mountain(1.43, 0.9, 0.26, 0.2, 0.8, 14.7);

  function ellipsoid(x, y, z, rx, ry, rz, color, seed = 0, rows = 6, sides = 9) {
    const point = (row, side) => {
      const latitude = -Math.PI / 2 + row / rows * Math.PI;
      const longitude = side / sides * TAU;
      const irregular = 1 + Math.sin(longitude * 3 + seed) * 0.055;
      return [x + Math.cos(latitude) * Math.cos(longitude) * rx * irregular,
        y + Math.sin(latitude) * ry, z + Math.cos(latitude) * Math.sin(longitude) * rz * irregular];
    };
    for (let row = 0; row < rows; row += 1) {
      for (let side = 0; side < sides; side += 1) {
        quad(point(row, side), point(row + 1, side), point(row + 1, side + 1), point(row, side + 1),
          shade(color, 0.93 + noise(seed + side * 19 + row) * 0.12));
      }
    }
  }

  function cylinderBetween(start, end, radius, color, sides = 7) {
    const axis = end.map((value, i) => value - start[i]);
    const length = Math.hypot(...axis);
    if (!length) return;
    const dir = axis.map(value => value / length);
    let tangent = Math.abs(dir[1]) < 0.9 ? [-dir[2], 0, dir[0]] : [1, 0, 0];
    const tangentLength = Math.hypot(...tangent);
    tangent = tangent.map(value => value / tangentLength);
    const bitangent = [tangent[1] * dir[2] - tangent[2] * dir[1],
      tangent[2] * dir[0] - tangent[0] * dir[2], tangent[0] * dir[1] - tangent[1] * dir[0]];
    const point = (center, i) => center.map((value, n) => value + radius * (tangent[n] * Math.cos(i / sides * TAU) + bitangent[n] * Math.sin(i / sides * TAU)));
    for (let i = 0; i < sides; i += 1) {
      const a = point(start, i);
      const b = point(end, i);
      const c = point(end, i + 1);
      const d = point(start, i + 1);
      quad(a, b, c, d, color);
      triangle(end, c, b, color);
    }
  }

  function tree(x, z, size, seed) {
    cylinderBetween([x, 0.025, z], [x, size * 0.67, z], size * 0.045, [0.4, 0.32, 0.19]);
    const leaf = mix([0.2, 0.45, 0.26], [0.5, 0.62, 0.29], noise(seed));
    ellipsoid(x, size * 0.71, z, size * 0.34, size * 0.36, size * 0.31, leaf, seed);
    ellipsoid(x - size * 0.2, size * 0.53, z + size * 0.05, size * 0.23, size * 0.25, size * 0.25, shade(leaf, 0.91), seed + 1);
  }

  const treeSites = [
    [-1.87, -0.15], [-1.91, 0.12], [-1.92, 0.43], [-1.6, 0.86], [-1.39, 1.13],
    [-0.9, 1.29], [-0.73, 1.17], [-0.86, 0.95], [-0.49, 0.95], [-0.58, 0.65],
    [-0.41, 0.34], [-0.52, -0.09], [-0.62, -1.18], [-0.38, -1.27],
    [0.39, -1.28], [1.12, -1.03], [1.65, -0.6], [1.98, -0.12], [1.94, 0.5],
    [1.72, 0.76], [1.08, 1.18], [0.76, 1.29], [0.91, 0.95], [0.58, 0.25]
  ];
  treeSites.forEach(([x, z], index) => tree(x, z, 0.17 + noise(index * 23) * 0.17, index + 55));

  // Pebbles and low riverside bushes give a readable miniature sense of scale.
  for (let i = 0; i < 27; i += 1) {
    const z = -1.3 + noise(i * 17) * 2.65;
    const side = i % 2 ? 1 : -1;
    const x = riverX(z) + side * (riverWidth(z) + 0.07 + noise(i * 12) * 0.07);
    const scale = 0.04 + noise(i * 3) * 0.045;
    ellipsoid(x, 0.038, z, scale, scale * 0.6, scale * 0.8, [0.62, 0.67, 0.51], i, 4, 6);
  }
  for (let i = 0; i < 12; i += 1) {
    const z = 0.07 + i * 0.113;
    const x = riverX(z) - riverWidth(z) * 0.37;
    const length = 0.045 + noise(i * 13) * 0.09;
    quad([x - length, 0.027, z], [x - length, 0.027, z + 0.009],
      [x + length, 0.027, z + 0.009], [x + length, 0.027, z], [0.64, 0.85, 0.74]);
  }

  // A tiny bamboo raft with an oarsman makes the landscape feel inhabited.
  const boatZ = 0.84;
  const boatX = riverX(boatZ) + 0.005;
  for (let beam = 0; beam < 5; beam += 1) {
    const x = boatX + (beam - 2) * 0.041;
    cylinderBetween([x, 0.061, boatZ - 0.22], [x, 0.061, boatZ + 0.24], 0.02, [0.72, 0.59, 0.31]);
  }
  cylinderBetween([boatX - 0.108, 0.087, boatZ - 0.13], [boatX + 0.108, 0.087, boatZ - 0.13], 0.012, [0.36, 0.29, 0.17]);
  cylinderBetween([boatX - 0.108, 0.087, boatZ + 0.12], [boatX + 0.108, 0.087, boatZ + 0.12], 0.012, [0.36, 0.29, 0.17]);
  cylinderBetween([boatX, 0.09, boatZ + 0.09], [boatX, 0.25, boatZ + 0.09], 0.034, [0.83, 0.65, 0.4]);
  ellipsoid(boatX, 0.28, boatZ + 0.09, 0.035, 0.04, 0.035, [0.82, 0.67, 0.43], 0, 4, 7);
  for (let side = 0; side < 12; side += 1) {
    const a = side / 12 * TAU;
    const b = (side + 1) / 12 * TAU;
    triangle([boatX, 0.35, boatZ + 0.09],
      [boatX + Math.cos(b) * 0.079, 0.289, boatZ + 0.09 + Math.sin(b) * 0.079],
      [boatX + Math.cos(a) * 0.079, 0.289, boatZ + 0.09 + Math.sin(a) * 0.079], [0.91, 0.76, 0.41]);
  }
  cylinderBetween([boatX + 0.15, 0.025, boatZ - 0.17], [boatX + 0.041, 0.28, boatZ + 0.16], 0.009, [0.66, 0.51, 0.27]);

  const geometry = new Float32Array(vertices);
  vertices.length = 0;

  function initialize() {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('WebGL program could not link');
    gl.useProgram(program);
    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
    vertexCount = geometry.length / 9;
    ['aPosition', 'aNormal', 'aColor'].forEach((name, index) => {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 36, index * 12);
    });
    projectionLocation = gl.getUniformLocation(program, 'uProjection');
    viewLocation = gl.getUniformLocation(program, 'uView');
    eyeLocation = gl.getUniformLocation(program, 'uEye');
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    state.available = true;
    stage.classList.remove('scene-unavailable');
    requestRender();
  }

  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const range = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0,
      0, 0, (far + near) * range, -1, 0, 0, 2 * far * near * range, 0]);
  }
  function lookAt(eye, target) {
    let z = eye.map((value, i) => value - target[i]);
    const length = Math.hypot(...z);
    z = z.map(value => value / length);
    let x = [z[2], 0, -z[0]];
    const xLength = Math.hypot(...x);
    x = x.map(value => value / xLength);
    const y = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]];
    const dot = vector => -(vector[0] * eye[0] + vector[1] * eye[1] + vector[2] * eye[2]);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0, dot(x), dot(y), dot(z), 1]);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, narrowScreen.matches ? 1.3 : 1.6);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }

  function requestRender() {
    if (!frameRequest && state.available && !contextLost && visible && !document.hidden) {
      frameRequest = requestAnimationFrame(render);
    }
  }

  function render(time) {
    frameRequest = 0;
    if (!state.available || contextLost || !visible || document.hidden) return;
    const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0.016;
    lastTime = time;
    const idle = !state.paused && !pointer && time > interactionUntil;
    if (idle) targetYaw += elapsed * 0.043;
    const hoverYaw = pointer ? 0 : pointerHover.x * 0.16;
    const hoverPitch = pointer ? 0 : pointerHover.y * 0.045;
    const desiredYaw = targetYaw + hoverYaw;
    const desiredPitch = clamp(targetPitch + hoverPitch, 0.25, 0.78);
    const smoothing = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed * 8);
    state.yaw += (desiredYaw - state.yaw) * smoothing;
    state.pitch += (desiredPitch - state.pitch) * smoothing;
    resize();
    const aspect = canvas.width / canvas.height;
    const radius = aspect < 0.95 ? 8.7 / Math.max(aspect, 0.65) * 0.93 : 8.7;
    const aim = [0, 0.78, 0];
    const eye = [Math.sin(state.yaw) * Math.cos(state.pitch) * radius,
      Math.sin(state.pitch) * radius + aim[1], Math.cos(state.yaw) * Math.cos(state.pitch) * radius];
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(projectionLocation, false, perspective(39 * Math.PI / 180, aspect, 0.1, 50));
    gl.uniformMatrix4fv(viewLocation, false, lookAt(eye, aim));
    gl.uniform3fv(eyeLocation, eye);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    state.frameCount += 1;
    if (state.frameCount === 1 || !stage.classList.contains('scene-ready')) {
      if (gl.getError() !== gl.NO_ERROR) {
        markUnavailable();
        return;
      }
      stage.classList.add('scene-ready');
      canvas.dataset.sceneState = 'ready';
    }
    const settling = Math.abs(desiredYaw - state.yaw) > 0.0001 || Math.abs(desiredPitch - state.pitch) > 0.0001;
    if (!state.paused || settling) requestRender();
  }

  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: targetYaw, pitch: targetPitch, type: event.pointerType };
    pointerHover = { x: 0, y: 0 };
    interactionUntil = performance.now() + 4500;
    canvas.classList.add('is-dragging');
    if (event.pointerType !== 'touch') canvas.setPointerCapture(event.pointerId);
    requestRender();
  });
  canvas.addEventListener('pointermove', event => {
    if (pointer && pointer.id === event.pointerId) {
      targetYaw = pointer.yaw - (event.clientX - pointer.x) * 0.008;
      if (pointer.type !== 'touch') targetPitch = clamp(pointer.pitch + (event.clientY - pointer.y) * 0.0035, 0.25, 0.78);
      interactionUntil = performance.now() + 4500;
    } else if (event.pointerType === 'mouse') {
      const rect = canvas.getBoundingClientRect();
      pointerHover = { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: (event.clientY - rect.top) / rect.height * 2 - 1 };
      interactionUntil = performance.now() + 2000;
    }
    requestRender();
  });
  function finishPointer(event) {
    if (pointer && event.pointerId === pointer.id) {
      pointer = null;
      canvas.classList.remove('is-dragging');
      interactionUntil = performance.now() + 4500;
      requestRender();
    }
  }
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);
  canvas.addEventListener('lostpointercapture', finishPointer);
  canvas.addEventListener('pointerleave', event => {
    pointerHover = { x: 0, y: 0 };
    if (pointer && pointer.type === 'touch') finishPointer(event);
    requestRender();
  });
  canvas.addEventListener('keydown', event => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') return reset();
    pointerHover = { x: 0, y: 0 };
    if (event.key === 'ArrowLeft') targetYaw -= 0.18;
    if (event.key === 'ArrowRight') targetYaw += 0.18;
    if (event.key === 'ArrowUp') targetPitch = clamp(targetPitch + 0.08, 0.25, 0.78);
    if (event.key === 'ArrowDown') targetPitch = clamp(targetPitch - 0.08, 0.25, 0.78);
    interactionUntil = performance.now() + 4500;
    requestRender();
  });
  if (motionButton) motionButton.addEventListener('click', () => {
    motionChosen = true;
    state.paused = !state.paused;
    synchronizeMotion();
    requestRender();
  });
  if (resetButton) resetButton.addEventListener('click', reset);
  reducedMotion.addEventListener('change', event => {
    if (!motionChosen) {
      state.paused = event.matches;
      synchronizeMotion();
      requestRender();
    }
  });
  window.addEventListener('resize', requestRender, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(requestRender).observe(canvas);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      lastTime = 0;
      if (visible) requestRender();
      else if (frameRequest) {
        cancelAnimationFrame(frameRequest);
        frameRequest = 0;
      }
    }, { rootMargin: '80px' }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => {
    lastTime = 0;
    if (document.hidden && frameRequest) {
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    } else requestRender();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    markUnavailable();
    canvas.dataset.sceneState = 'context-lost';
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    lastTime = 0;
    try { initialize(); } catch (_) { markUnavailable(); }
  });

  try { initialize(); } catch (_) { markUnavailable(); }
})();
