/* ============================================================
   星星五子棋 · 3D 场景
   纯程序化建模，不依赖任何外部贴图 / 模型
   ============================================================ */
var SCENE3D = (function () {
  'use strict';

  var N = 15;
  var CELL = 0.64;
  var HALF = (N - 1) / 2;          // 4
  var BOARD_W = 10.4;
  var FACE_W = BOARD_W - 0.22;
  var BOARD_T = 0.7;               // 棋盘厚度
  var PLINTH_W = 11.2;             // 底座宽度
  var PLINTH_T = 1.5;
  var STONE_R = 0.275;
  var SQUASH = 0.56;
  var STONE_Y = STONE_R * SQUASH;

  var renderer, scene, camera, sun, skyDome;
  var boardGroup, stoneGroup, fxGroup;
  var stoneGeo, matBlack, matWhite, matGhost;
  var ghost, ghostRing, lastRing, winBeam, winRings = [];
  var raycaster = new THREE.Raycaster();
  var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var tweens = [];
  var stoneMeshes = {};
  var clouds = [];
  var spark = null;
  var clock = null;
  var time = 0;

  var cam = { yaw: -0.24, pitch: 0.90, dist: 18, tYaw: -0.24, tPitch: 0.90, tDist: 18 };
  var target = new THREE.Vector3(0, -0.15, 0);
  var introDone = false;
  var tmpCam = null;
  var _pv = new THREE.Vector3();

  /* ---------------- 小工具 ---------------- */
  function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
  function easeOutBack(k) { var c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
  function easeOutBounce(k) {
    var n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) { k -= 1.5 / d; return n * k * k + 0.75; }
    if (k < 2.5 / d) { k -= 2.25 / d; return n * k * k + 0.9375; }
    k -= 2.625 / d; return n * k * k + 0.984375;
  }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function cellX(x) { return (x - HALF) * CELL; }
  function cellZ(y) { return (y - HALF) * CELL; }
  function keyOf(x, y) { return x + ',' + y; }
  function tween(dur, onUpdate, onDone, ease) {
    tweens.push({ t: 0, dur: dur, u: onUpdate, d: onDone, e: ease || easeOutCubic });
  }

  function roundedShape(size, r) {
    var s = new THREE.Shape(), h = size / 2;
    s.moveTo(-h + r, -h);
    s.lineTo(h - r, -h);
    s.quadraticCurveTo(h, -h, h, -h + r);
    s.lineTo(h, h - r);
    s.quadraticCurveTo(h, h, h - r, h);
    s.lineTo(-h + r, h);
    s.quadraticCurveTo(-h, h, -h, h - r);
    s.lineTo(-h, -h + r);
    s.quadraticCurveTo(-h, -h, -h + r, -h);
    return s;
  }

  function roundedSlab(size, radius, depth, bevel) {
    var geo = new THREE.ExtrudeGeometry(roundedShape(size, radius), {
      depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel,
      bevelSize: bevel, bevelSegments: 3, curveSegments: 6
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.max.y, 0);   // 台面对齐 y = 0
    return geo;
  }

  /* ---------------- 贴图（运行时用 canvas 画） ---------------- */
  function skyTexture() {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 512;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0.00, '#5aa8dc');
    grd.addColorStop(0.18, '#7fbde6');
    grd.addColorStop(0.34, '#a9d4f0');
    grd.addColorStop(0.46, '#d5ecfb');
    grd.addColorStop(0.52, '#f0faff');
    grd.addColorStop(0.60, '#dcedfb');
    grd.addColorStop(0.74, '#c2e1f5');
    grd.addColorStop(1.00, '#a4cde9');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function boardTexture() {
    var S = 1024;
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    var W = FACE_W;
    var px = function (v) { return (0.5 + v / W) * S; };

    var grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, '#f2cf9b');
    grd.addColorStop(0.45, '#e9bd80');
    grd.addColorStop(1, '#dcaa6c');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);

    for (var i = 0; i < 110; i++) {
      var y = Math.random() * S;
      g.beginPath();
      g.moveTo(0, y);
      for (var x = 0; x <= S; x += 64) {
        g.quadraticCurveTo(x + 32, y + (Math.random() - 0.5) * 16, x + 64, y + (Math.random() - 0.5) * 10);
      }
      g.strokeStyle = Math.random() > 0.5 ? 'rgba(168,112,55,0.13)' : 'rgba(255,236,204,0.16)';
      g.lineWidth = 1 + Math.random() * 3.4;
      g.stroke();
    }

    var inset = 24;
    g.strokeStyle = 'rgba(140,90,45,0.3)';
    g.lineWidth = 5;
    g.strokeRect(inset, inset, S - inset * 2, S - inset * 2);

    g.strokeStyle = 'rgba(104,66,33,0.92)';
    g.lineWidth = 3.8;
    g.lineCap = 'round';
    for (var k = 0; k < N; k++) {
      var v = (k - HALF) * CELL;
      g.beginPath();
      g.moveTo(px(v), px(-HALF * CELL));
      g.lineTo(px(v), px(HALF * CELL));
      g.stroke();
      g.beginPath();
      g.moveTo(px(-HALF * CELL), px(v));
      g.lineTo(px(HALF * CELL), px(v));
      g.stroke();
    }

    var stars = [], sp3 = [3, 7, 11];
    for (var si = 0; si < 3; si++) { for (var sj = 0; sj < 3; sj++) stars.push([sp3[si], sp3[sj]]); }
    g.fillStyle = 'rgba(96,60,28,0.95)';
    for (var s = 0; s < stars.length; s++) {
      g.beginPath();
      g.arc(px((stars[s][0] - HALF) * CELL), px((stars[s][1] - HALF) * CELL), 4.8, 0, Math.PI * 2);
      g.fill();
    }

    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function dotTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.32, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---------------- 环境反射 ----------------
     暗环境 + 三块柔光板：只提供高光，不额外冲淡材质颜色 */
  function buildEnv() {
    var pmrem = new THREE.PMREMGenerator(renderer);
    var s = new THREE.Scene();
    s.background = new THREE.Color(0x1b2735);

    var top = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    top.position.set(0, 26, 0); top.rotation.x = Math.PI / 2; s.add(top);

    var warm = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ color: 0xfff0d2 }));
    warm.position.set(-13, 8, 10); warm.lookAt(0, 0, 0); s.add(warm);

    var cool = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ color: 0xcfe6ff }));
    cool.position.set(12, 5, -11); cool.lookAt(0, 0, 0); s.add(cool);

    var tex = pmrem.fromScene(s, 0.02).texture;
    pmrem.dispose();
    return tex;
  }

  /* ---------------- 建景 ---------------- */
  function buildSky() {
    skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(170, 32, 20),
      new THREE.MeshBasicMaterial({
        map: skyTexture(), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false
      })
    );
    scene.add(skyDome);
  }

  function buildBoard() {
    boardGroup = new THREE.Group();
    scene.add(boardGroup);

    /* 底座 */
    var plinthGeo = roundedSlab(PLINTH_W, 1.9, PLINTH_T, 0.16);
    var plinth = new THREE.Mesh(plinthGeo, new THREE.MeshStandardMaterial({
      color: 0xb07d4c, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.25
    }));
    plinth.position.y = -BOARD_T + 0.02;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    boardGroup.add(plinth);

    /* 棋盘主体 */
    var slab = new THREE.Mesh(roundedSlab(BOARD_W, 0.8, BOARD_T, 0.09), new THREE.MeshStandardMaterial({
      color: 0xdca96c, roughness: 0.7, metalness: 0.0, envMapIntensity: 0.3
    }));
    slab.castShadow = true;
    slab.receiveShadow = true;
    boardGroup.add(slab);

    /* 台面棋盘格 */
    var faceGeo = new THREE.ShapeGeometry(roundedShape(FACE_W, 0.72), 6);
    faceGeo.rotateX(-Math.PI / 2);
    var pos = faceGeo.attributes.position;
    var uv = [];
    for (var i = 0; i < pos.count; i++) {
      uv.push(pos.getX(i) / FACE_W + 0.5, 0.5 - pos.getZ(i) / FACE_W);
    }
    faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    var face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({
      map: boardTexture(), roughness: 0.58, metalness: 0.0, envMapIntensity: 0.24
    }));
    face.position.y = 0.012;
    face.receiveShadow = true;
    boardGroup.add(face);

    stoneGroup = new THREE.Group();
    scene.add(stoneGroup);

    fxGroup = new THREE.Group();
    scene.add(fxGroup);
  }

  function buildClouds() {
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1.0, metalness: 0.0,
      emissive: 0xcfe4f6, emissiveIntensity: 0.5, envMapIntensity: 0.25, flatShading: false
    });
    var specs = [
      { ang: 0.5, rad: 31, y: 17, sc: 2.0 },
      { ang: 1.9, rad: 37, y: 20, sc: 2.4 },
      { ang: 3.3, rad: 30, y: 16, sc: 1.6 },
      { ang: 5.1, rad: 36, y: 19, sc: 2.1 },
      { ang: 1.0, rad: 17, y: -15, sc: 1.8 },
      { ang: 2.6, rad: 24, y: -20, sc: 2.4 },
      { ang: 4.4, rad: 15, y: -13, sc: 1.4 },
      { ang: 5.6, rad: 21, y: -18, sc: 2.1 }
    ];
    for (var i = 0; i < specs.length; i++) {
      var sp = specs[i];
      var g = new THREE.Group();
      var puffs = 3 + ((Math.random() * 3) | 0);
      for (var p = 0; p < puffs; p++) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
        m.position.set((p - puffs / 2) * 1.2 + Math.random() * 0.4,
          Math.random() * 0.6, Math.random() * 0.9 - 0.45);
        var s = 0.9 + Math.random() * 0.8;
        m.scale.set(s, s * 0.78, s);
        g.add(m);
      }
      g.position.set(Math.cos(sp.ang) * sp.rad, sp.y, Math.sin(sp.ang) * sp.rad);
      g.scale.setScalar(sp.sc);
      g.userData = { ang: sp.ang, rad: sp.rad, y: sp.y, spd: (0.008 + Math.random() * 0.014) * (Math.random() < 0.5 ? 1 : -1) };
      scene.add(g);
      clouds.push(g);
    }
  }

  /* ---------------- 棋子 ---------------- */
  function buildStones() {
    stoneGeo = new THREE.SphereGeometry(STONE_R, 30, 18);
    stoneGeo.scale(1, SQUASH, 1);

    matBlack = new THREE.MeshPhysicalMaterial({
      color: 0x1f1b2b, roughness: 0.14, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.3
    });
    matWhite = new THREE.MeshPhysicalMaterial({
      color: 0xfaf5e9, roughness: 0.19, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.07, envMapIntensity: 1.0
    });
    matGhost = new THREE.MeshBasicMaterial({
      color: 0x1f1b2b, transparent: true, opacity: 0.22, depthWrite: false
    });

    ghost = new THREE.Mesh(stoneGeo, matGhost);
    ghost.visible = false;
    scene.add(ghost);

    ghostRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.022, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
    );
    ghostRing.rotation.x = -Math.PI / 2;
    ghostRing.visible = false;
    scene.add(ghostRing);

    lastRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.028, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.95, depthWrite: false })
    );
    lastRing.rotation.x = -Math.PI / 2;
    lastRing.visible = false;
    fxGroup.add(lastRing);
  }

  /* ---------------- 星星粒子 ---------------- */
  function buildSpark() {
    var COUNT = 240;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(COUNT * 3);
    var col = new Float32Array(COUNT * 3);
    var vel = new Float32Array(COUNT * 3);
    var life = new Float32Array(COUNT);
    for (var i = 0; i < COUNT; i++) { pos[i * 3 + 1] = -999; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: 0.2, map: dotTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    spark = { pts: pts, count: COUNT, pos: pos, col: col, vel: vel, life: life, on: false };
  }

  function burst(cx, cy, cz, strength) {
    if (!spark) return;
    var palette = [[1.0, 0.8, 0.3], [1.0, 0.5, 0.42], [0.4, 0.86, 0.85], [1, 1, 1], [1.0, 0.62, 0.85]];
    for (var i = 0; i < spark.count; i++) {
      var a = Math.random() * Math.PI * 2;
      var up = 0.6 + Math.random() * 1.6;
      var sp = (0.9 + Math.random() * 2.8) * (strength || 1);
      spark.pos[i * 3] = cx + (Math.random() - 0.5) * 0.25;
      spark.pos[i * 3 + 1] = cy + 0.1;
      spark.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 0.25;
      spark.vel[i * 3] = Math.cos(a) * sp;
      spark.vel[i * 3 + 1] = up * sp * 0.85;
      spark.vel[i * 3 + 2] = Math.sin(a) * sp;
      spark.life[i] = 0.7 + Math.random() * 0.9;
      var c = palette[(Math.random() * palette.length) | 0];
      spark.col[i * 3] = c[0]; spark.col[i * 3 + 1] = c[1]; spark.col[i * 3 + 2] = c[2];
    }
    spark.on = true;
    spark.pts.geometry.attributes.color.needsUpdate = true;
    spark.pts.geometry.attributes.position.needsUpdate = true;
  }

  function updateSpark(dt) {
    if (!spark || !spark.on) return;
    var alive = 0;
    for (var i = 0; i < spark.count; i++) {
      if (spark.life[i] <= 0) continue;
      alive++;
      spark.life[i] -= dt;
      var i3 = i * 3;
      spark.vel[i3 + 1] -= 5.6 * dt;
      spark.pos[i3] += spark.vel[i3] * dt;
      spark.pos[i3 + 1] += spark.vel[i3 + 1] * dt;
      spark.pos[i3 + 2] += spark.vel[i3 + 2] * dt;
      if (spark.pos[i3 + 1] < -12) { spark.life[i] = 0; }
      if (spark.life[i] <= 0) { spark.pos[i3 + 1] = -999; }
    }
    spark.pts.geometry.attributes.position.needsUpdate = true;
    if (!alive) spark.on = false;
  }

  /* ---------------- 初始化 ---------------- */
  function init(canvas) {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd6ecff, 55, 150);

    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    camera.position.set(0, 18, 18);

    scene.environment = buildEnv();
    buildSky();

    var hemi = new THREE.HemisphereLight(0xcfe8ff, 0xf0dcbe, 0.55);
    scene.add(hemi);

    sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
    sun.position.set(-9.5, 19, 11);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    var sc = sun.shadow.camera;
    sc.left = -7.6; sc.right = 7.6; sc.top = 7.6; sc.bottom = -7.6; sc.near = 2; sc.far = 50;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);

    var fill = new THREE.DirectionalLight(0xbcdcff, 0.3);
    fill.position.set(11, 7, -9);
    scene.add(fill);

    var rim = new THREE.DirectionalLight(0xffffff, 0.15);
    rim.position.set(0, 5, -16);
    scene.add(rim);

    buildClouds();
    buildBoard();
    buildStones();
    buildSpark();

    clock = new THREE.Clock();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    if (window.ResizeObserver) {
      // 兜底：某些环境（模拟器 / 移动端软键盘）不一定派发 window.resize
      var ro = new ResizeObserver(function () { resize(); });
      ro.observe(document.documentElement);
    }
    applySize();
    loop();
  }

  var resizeTimer = null;
  function resize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applySize, 140);
  }

  function viewSize() {
    var c = renderer.domElement;
    var w = c.clientWidth || window.innerWidth || 1;
    var h = c.clientHeight || window.innerHeight || 1;
    return { w: w, h: h };
  }

  function applySize() {
    var v = viewSize();
    var w = v.w, h = v.h;
    var portrait = h > w * 1.05;
    camera.aspect = w / h;
    cam.tPitch = portrait ? 1.22 : 0.90;
    if (!introDone && !hasInteracted) { cam.pitch = cam.tPitch; }
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    fitView(false);
    sizeApplyCount++;
  }

  var hasInteracted = false;
  var sizeApplyCount = 0;
  function sizeInfo() {
    var c = renderer.domElement;
    return {
      applies: sizeApplyCount,
      cw: c.width, ch: c.height,
      clientW: c.clientWidth, clientH: c.clientHeight,
      iw: window.innerWidth, ih: window.innerHeight,
      aspect: +camera.aspect.toFixed(3),
      dpr: window.devicePixelRatio
    };
  }

  /* 依据棋盘四角的投影自动求距离：保证整块棋盘不被裁切、也不被界面遮住。
     底座近角允许压到画面下边缘（那里本来就被按钮占着）。 */
  function fitView(animate) {
    var v = viewSize();
    var w = v.w, h = v.h;
    var aspect = w / h;
    if (!tmpCam) tmpCam = new THREE.PerspectiveCamera(camera.fov, aspect, 0.1, 400);
    tmpCam.fov = camera.fov;
    tmpCam.aspect = aspect;
    tmpCam.updateProjectionMatrix();

    var pitch = cam.tPitch, yaw = cam.tYaw;
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var hf = BOARD_W / 2 - 0.1;
    var corners = [];
    for (var b = 0; b < 2; b++) {
      for (var c2 = 0; c2 < 2; c2++) {
        corners.push([b ? hf : -hf, 0, c2 ? hf : -hf]);
      }
    }

    var maxX = h > w * 1.05 ? 0.92 : 0.90;
    var maxY = h > w * 1.05 ? 0.80 : 0.78;
    var d = 9;
    for (var it = 0; it < 80; it++) {
      tmpCam.position.set(
        target.x + d * cp * Math.sin(yaw),
        target.y + d * sp,
        target.z + d * cp * Math.cos(yaw)
      );
      tmpCam.lookAt(target);
      tmpCam.updateMatrixWorld(true);
      var mx = 0, my = 0;
      for (var i = 0; i < corners.length; i++) {
        _pv.set(corners[i][0], corners[i][1], corners[i][2]).project(tmpCam);
        if (Math.abs(_pv.x) > mx) mx = Math.abs(_pv.x);
        if (Math.abs(_pv.y) > my) my = Math.abs(_pv.y);
      }
      if (mx <= maxX && my <= maxY) break;
      d *= 1.03;
    }
    cam.tDist = d;
    if (!animate) cam.dist = d;
  }

  function look(yaw, pitch, dist) {
    hasInteracted = true;
    if (typeof yaw === 'number') { cam.tYaw = cam.yaw = yaw; }
    if (typeof pitch === 'number') { cam.tPitch = cam.pitch = Math.max(0.4, Math.min(1.45, pitch)); }
    if (typeof dist === 'number') { cam.tDist = cam.dist = dist; }
    introDone = true;
  }

  /* ---------------- 交互 / 相机 ---------------- */
  function rotate(dx, dy) {
    hasInteracted = true;
    introDone = true;
    cam.tYaw -= dx * 0.0055;
    cam.tPitch = Math.max(0.5, Math.min(1.32, cam.tPitch + dy * 0.0042));
  }
  function zoomBy(f) {
    hasInteracted = true;
    introDone = true;
    cam.tDist = Math.max(9, Math.min(38, cam.tDist * f));
  }
  function cameraState() { return { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist }; }

  function screenOf(px, py) {
    var v = new THREE.Vector3(cellX(px), 0.1, cellZ(py)).project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  var _v2 = new THREE.Vector2();
  function pickCell(clientX, clientY) {
    _v2.x = (clientX / window.innerWidth) * 2 - 1;
    _v2.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(_v2, camera);
    var hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    var gx = Math.round(hit.x / CELL + HALF);
    var gy = Math.round(hit.z / CELL + HALF);
    if (gx < 0 || gx >= N || gy < 0 || gy >= N) return null;
    var dx = hit.x - cellX(gx), dz = hit.z - cellZ(gy);
    if (dx * dx + dz * dz > 0.72) return null;
    return { x: gx, y: gy };
  }

  /* ---------------- 棋子操作 ---------------- */
  function placeStone(x, y, player, animate) {
    if (stoneMeshes[keyOf(x, y)]) return null;
    var m = new THREE.Mesh(stoneGeo, player === 1 ? matBlack : matWhite);
    m.position.set(cellX(x), STONE_Y, cellZ(y));
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData = { px: x, py: y, player: player, lift: 0 };
    stoneGroup.add(m);
    stoneMeshes[keyOf(x, y)] = m;

    if (animate) {
      var fromY = STONE_Y + 3.2;
      m.position.y = fromY;
      m.scale.setScalar(0.86);
      tween(0.36, function (k) {
        m.position.y = lerp(fromY, STONE_Y, easeOutBounce(k));
        var sq = 1;
        if (k > 0.7) {
          var f = (k - 0.7) / 0.3;
          sq = 1 + Math.sin(f * Math.PI) * 0.1;
        }
        m.scale.set(1 + (sq - 1) * 0.6, sq, 1 + (sq - 1) * 0.6);
      }, function () {
        m.position.y = STONE_Y;
        m.scale.setScalar(1);
      }, function (k) { return k; });
    }
    return m;
  }

  function removeStone(x, y) {
    var k = keyOf(x, y);
    var m = stoneMeshes[k];
    if (!m) return;
    delete stoneMeshes[k];
    var startY = m.position.y;
    m.userData.lift = 0;
    tween(0.26, function (k2) {
      m.position.y = startY + k2 * 1.6;
      m.scale.setScalar(Math.max(0.01, 1 - k2));
    }, function () {
      stoneGroup.remove(m);
    });
  }

  function clearStones() {
    for (var k in stoneMeshes) {
      if (Object.prototype.hasOwnProperty.call(stoneMeshes, k)) {
        stoneGroup.remove(stoneMeshes[k]);
      }
    }
    stoneMeshes = {};
  }

  /* ---------------- 高亮 / 提示 ---------------- */
  function hover(cell, player) {
    if (!cell) { unhover(); return; }
    ghost.visible = true;
    ghostRing.visible = true;
    ghost.position.set(cellX(cell.x), STONE_Y, cellZ(cell.y));
    ghostRing.position.set(cellX(cell.x), 0.02, cellZ(cell.y));
    matGhost.color.setHex(player === 1 ? 0x1f1b2b : 0xfaf5e9);
    matGhost.opacity = player === 1 ? 0.26 : 0.55;
    ghostRing.material.color.setHex(player === 1 ? 0xffc94d : 0x57b6ff);
  }
  function unhover() {
    ghost.visible = false;
    ghostRing.visible = false;
  }

  function setLast(cell) {
    if (!cell) { lastRing.visible = false; return; }
    lastRing.visible = true;
    lastRing.position.set(cellX(cell.x), 0.03, cellZ(cell.y));
    lastRing.scale.setScalar(0.1);
    tween(0.35, function (k) {
      lastRing.scale.setScalar(lerp(0.1, 1, easeOutBack(k)));
    });
  }

  /* ---------------- 获胜特效 ---------------- */
  function clearWin() {
    if (winBeam) {
      fxGroup.remove(winBeam.group);
      winBeam = null;
    }
    for (var i = 0; i < winRings.length; i++) fxGroup.remove(winRings[i]);
    winRings = [];
    for (var k in stoneMeshes) {
      if (Object.prototype.hasOwnProperty.call(stoneMeshes, k)) {
        stoneMeshes[k].userData.lift = 0;
      }
    }
  }

  function playWin(cells) {
    if (!cells || cells.length < 2) return;
    clearWin();

    var a = cells[0], b = cells[cells.length - 1];
    var ax = cellX(a[0]), az = cellZ(a[1]), bx = cellX(b[0]), bz = cellZ(b[1]);
    var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) + 1.0;

    var g = new THREE.Group();
    var glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, len, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc247, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    var core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, len, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff0b8, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    g.add(glow); g.add(core);
    g.position.set((ax + bx) / 2, STONE_Y + 0.09, (az + bz) / 2);
    var dir = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.scale.set(1, 0.01, 1);
    fxGroup.add(g);
    winBeam = { group: g, t: 0, dur: 0.5 };

    for (var i = 0; i < cells.length; i++) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.03, 6, 30),
        new THREE.MeshBasicMaterial({
          color: 0xffc94d, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cellX(cells[i][0]), 0.04, cellZ(cells[i][1]));
      ring.scale.setScalar(0.01);
      ring.userData.delay = i * 0.07;
      ring.userData.t = 0;
      fxGroup.add(ring);
      winRings.push(ring);

      var mesh = stoneMeshes[keyOf(cells[i][0], cells[i][1])];
      if (mesh) mesh.userData.lift = 1;
    }

    var mid = cells[Math.floor(cells.length / 2)];
    burst(cellX(mid[0]), STONE_Y + 0.3, cellZ(mid[1]), 1.1);
  }

  /* ---------------- 主循环 ---------------- */
  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      tw.t += dt;
      var k = Math.min(1, tw.t / tw.dur);
      tw.u(tw.e(k), k);
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.d) tw.d();
      }
    }

    var kk = 1 - Math.exp(-9 * dt);
    cam.yaw = lerp(cam.yaw, cam.tYaw, kk);
    cam.pitch = lerp(cam.pitch, cam.tPitch, kk);
    cam.dist = lerp(cam.dist, cam.tDist, kk);
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(
      target.x + cam.dist * cp * Math.sin(cam.yaw),
      target.y + cam.dist * sp,
      target.z + cam.dist * cp * Math.cos(cam.yaw)
    );
    camera.lookAt(target);

    for (var c = 0; c < clouds.length; c++) {
      var cl = clouds[c];
      cl.userData.ang += cl.userData.spd * dt;
      cl.position.x = Math.cos(cl.userData.ang) * cl.userData.rad;
      cl.position.z = Math.sin(cl.userData.ang) * cl.userData.rad;
      cl.position.y = cl.userData.y + Math.sin(time * 0.45 + c) * 0.3;
    }

    if (ghost.visible) {
      ghost.position.y = STONE_Y + 0.04 + Math.sin(time * 3.4) * 0.035;
      ghostRing.scale.setScalar(1 + Math.sin(time * 3.4) * 0.05);
    }

    if (lastRing.visible) {
      lastRing.material.opacity = 0.55 + Math.sin(time * 2.6) * 0.28;
      lastRing.rotation.z = time * 0.8;
    }

    if (winBeam) {
      winBeam.t += dt;
      var wk = Math.min(1, winBeam.t / winBeam.dur);
      winBeam.group.scale.set(1, Math.max(0.01, easeOutBack(wk)), 1);
      winBeam.group.children[0].material.opacity = 0.16 + Math.sin(time * 4) * 0.07;
    }
    for (var r = 0; r < winRings.length; r++) {
      var ring = winRings[r];
      ring.userData.t += dt;
      var rk = Math.max(0, Math.min(1, (ring.userData.t - ring.userData.delay) / 0.4));
      ring.scale.setScalar(0.01 + easeOutBack(rk) * 0.95 + Math.sin(time * 3 + r) * 0.04);
      ring.material.opacity = 0.5 + Math.sin(time * 3 + r) * 0.28;
    }

    for (var sk in stoneMeshes) {
      if (!Object.prototype.hasOwnProperty.call(stoneMeshes, sk)) continue;
      var sm = stoneMeshes[sk];
      if (sm.userData.lift) {
        sm.position.y = STONE_Y + 0.08 + Math.sin(time * 2.4 + sm.position.x) * 0.04;
      }
    }

    updateSpark(dt);

    if (skyDome) skyDome.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  function stats() {
    return {
      tris: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      stones: Object.keys(stoneMeshes).length
    };
  }

  return {
    init: init,
    resize: resize,
    placeStone: placeStone,
    removeStone: removeStone,
    clearStones: clearStones,
    hover: hover,
    unhover: unhover,
    setLast: setLast,
    playWin: playWin,
    clearWin: clearWin,
    burst: burst,
    rotate: rotate,
    zoomBy: zoomBy,
    cameraState: cameraState,
    screenOf: screenOf,
    pickCell: pickCell,
    stats: stats,
    sizeInfo: sizeInfo,
    fitView: fitView,
    look: look,
    introStart: function () { cam.dist = Math.min(42, cam.tDist * 1.4); },
    setIntroDone: function () { introDone = true; },
    scene: function () { return scene; },
    renderer: function () { return renderer; }
  };
})();
