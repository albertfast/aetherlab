/* ============================================================
   AETHER LAB — 3D Aether Background
   A living particle nebula built with Three.js.
   Drifts, rotates, reacts to the cursor, and respects the
   user's motion preferences and battery.
   ============================================================ */
import * as THREE from 'three';

(function () {
  'use strict';

  const mount = document.getElementById('aether-canvas');
  if (!mount) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const isMobile = window.innerWidth < 720;

  // ----- Renderer -----
  const renderer = new THREE.WebGLRenderer({
    antialias: !isMobile,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  // ----- Scene & Camera -----
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070d, 0.04);

  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, 0, 16);

  // ----- Particle field ("aether") -----
  // Density scales with viewport — fewer particles on mobile for perf.
  const COUNT = isMobile ? 1800 : 5200;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const seeds = new Float32Array(COUNT);

  // Aether palette — cyan, violet, pink, with occasional white sparks.
  const palette = [
    new THREE.Color(0x7af0ff), // cyan
    new THREE.Color(0x8b7bff), // violet
    new THREE.Color(0xff7ad9), // pink
    new THREE.Color(0x9affb0), // mint
    new THREE.Color(0xffffff)  // white spark
  ];

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    // Distribute in a soft sphere/ellipsoid so it reads as a nebula.
    const r = Math.pow(Math.random(), 0.6) * 26 + 4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i3]     = r * Math.sin(phi) * Math.cos(theta) * 1.1;
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.9;
    positions[i3 + 2] = r * Math.cos(phi);

    const c = palette[Math.floor(Math.random() * (Math.random() > 0.92 ? 5 : 3))];
    colors[i3]     = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;

    sizes[i] = Math.random() * 1.6 + 0.3;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Use a custom attribute name to avoid clashing with three's built-in 'color'.
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  // Soft round sprite, generated procedurally so we have no external asset.
  const sprite = makeSoftSprite();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime:    { value: 0 },
      uSprite:  { value: sprite },
      uPixelR:  { value: renderer.getPixelRatio() }
    },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelR;
      varying vec3 vColor;
      varying float vTwinkle;

      void main() {
        vColor = aColor;
        // Gentle independent drift so the field breathes.
        vec3 p = position;
        float t = uTime * 0.18;
        p.x += sin(t + aSeed) * 0.45;
        p.y += cos(t * 0.9 + aSeed * 1.3) * 0.45;
        p.z += sin(t * 0.7 + aSeed * 0.7) * 0.3;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        // Twinkle factor.
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.6 + aSeed * 5.0);

        gl_PointSize = aSize * vTwinkle * (300.0 / -mv.z) * uPixelR * 0.5;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uSprite;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec4 tex = texture2D(uSprite, gl_PointCoord);
        if (tex.a < 0.02) discard;
        gl_FragColor = vec4(vColor * (1.1 * vTwinkle + 0.4), tex.a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // A second, sparser outer halo for depth.
  const haloGeo = new THREE.BufferGeometry();
  const HC = Math.floor(COUNT * 0.3);
  const hp = new Float32Array(HC * 3);
  for (let i = 0; i < HC; i++) {
    const i3 = i * 3;
    const r = 30 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    hp[i3]     = r * Math.sin(phi) * Math.cos(theta);
    hp[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    hp[i3 + 2] = r * Math.cos(phi);
  }
  haloGeo.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const haloMat = new THREE.PointsMaterial({
    size: 0.5, map: sprite, color: 0x6b7bd6,
    transparent: true, opacity: 0.18,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Points(haloGeo, haloMat);
  scene.add(halo);

  // ----- Cursor / pointer interaction -----
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!isCoarse) {
    window.addEventListener('pointermove', (e) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  // Scroll parallax — subtle camera offset based on page scroll.
  let scrollY = 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  // ----- Resize -----
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    material.uniforms.uPixelR.value = renderer.getPixelRatio();
  }
  window.addEventListener('resize', onResize);

  // ----- Visibility / battery: pause when tab hidden -----
  let running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.start();
  });

  // ----- Animation loop -----
  const clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    if (!running) return;
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;

    // Smooth pointer follow.
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;

    if (!prefersReduced) {
      points.rotation.y = t * 0.03 + pointer.x * 0.25;
      points.rotation.x = pointer.y * 0.18;
      halo.rotation.y = -t * 0.015;
      halo.rotation.x = pointer.y * 0.08;

      // Subtle camera dolly + scroll parallax.
      camera.position.x += (pointer.x * 1.5 - camera.position.x) * 0.03;
      camera.position.y += (-pointer.y * 1.0 - camera.position.y + scrollY * -0.0015) * 0.03;
      camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
  }

  // Procedurally build a soft circular sprite texture.
  function makeSoftSprite() {
    const size = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.Texture(cv);
    tex.needsUpdate = true;
    return tex;
  }

  // Respect reduced-motion: render a single static frame, no loop.
  if (prefersReduced) {
    renderer.render(scene, camera);
    return;
  }

  tick();
})();
