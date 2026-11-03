// Portfolio home: nav, scroll reveals, and the WebGL object in the hero.
// No scroll listeners: everything scroll-related uses IntersectionObserver.

window.__homeReady = true;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ==========================================================================
   Navigation
   ========================================================================== */

function menu() {
  const bar = document.querySelector(".topbar");
  const btn = document.querySelector(".menu-btn");
  const nav = document.getElementById("site-nav");
  const set = (open) => {
    bar.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Close" : "Menu";
  };
  btn.addEventListener("click", () => set(!bar.classList.contains("is-open")));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) set(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bar.classList.contains("is-open")) {
      set(false);
      btn.focus();
    }
  });
}

function topbarState() {
  const bar = document.querySelector(".topbar");
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "position:absolute;top:40px;left:0;width:1px;height:1px;pointer-events:none";
  document.body.prepend(sentinel);
  new IntersectionObserver(([entry]) => bar.classList.toggle("is-scrolled", !entry.isIntersecting)).observe(sentinel);
}

function activeNav() {
  const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const link = byId.get(entry.target.id);
        if (link) link.classList.toggle("is-active", entry.isIntersecting);
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) io.observe(section);
  });
}

function reveals() {
  const els = document.querySelectorAll("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  els.forEach((el) => io.observe(el));
}

/* ==========================================================================
   Hero object: noise-displaced core with a point shell
   ========================================================================== */

// Ashima simplex noise (MIT), shared by the core and the point shell.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float displace(vec3 p, float t, float amp, vec2 m){
  float n = snoise(p * 1.15 + vec3(t * 0.18, t * 0.12, m.x * 0.35));
  float n2 = snoise(p * 2.6 - vec3(m.y * 0.4, t * 0.25, 0.0)) * 0.35;
  return (n + n2) * amp;
}
`;

async function heroScene() {
  const stage = document.querySelector(".hero-stage");
  const canvas = document.getElementById("scene");
  if (!stage || !canvas) return;

  let THREE;
  let renderer;
  try {
    THREE = await import("./vendor/three.module.min.js");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (err) {
    stage.remove();
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.28 },
    uMouse: { value: new THREE.Vector2() },
    uColorA: { value: new THREE.Color("#c9ec5c") },
    uColorB: { value: new THREE.Color("#55656b") },
    uOpacity: { value: 1 },
  };

  const group = new THREE.Group();
  scene.add(group);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.35, 64),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uAmp; uniform vec2 uMouse;
        varying vec3 vNormal; varying vec3 vView; varying float vDisp;
        ${NOISE}
        void main(){
          float d = displace(normal, uTime, uAmp, uMouse);
          vec3 pos = position + normal * d;
          vec3 tangent = normalize(cross(normal, vec3(0.0, 1.0, 0.001)));
          vec3 bitangent = normalize(cross(normal, tangent));
          float e = 0.02;
          vec3 nA = normalize(normal + tangent * e);
          vec3 nB = normalize(normal + bitangent * e);
          vec3 pA = nA * (length(position) + displace(nA, uTime, uAmp, uMouse));
          vec3 pB = nB * (length(position) + displace(nB, uTime, uAmp, uMouse));
          vec3 dn = normalize(cross(pA - pos, pB - pos));
          if (dot(dn, normal) < 0.0) dn = -dn;
          vNormal = normalize(normalMatrix * dn);
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          vView = normalize(-mv.xyz);
          vDisp = d;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA; uniform vec3 uColorB; uniform float uOpacity;
        varying vec3 vNormal; varying vec3 vView; varying float vDisp;
        void main(){
          vec3 n = normalize(vNormal);
          float fres = pow(1.0 - max(dot(n, vView), 0.0), 2.6);
          vec3 light = normalize(vec3(-0.6, 0.8, 0.6));
          float diff = max(dot(n, light), 0.0);
          float spec = pow(max(dot(reflect(-light, n), vView), 0.0), 48.0);
          vec3 tint = mix(uColorB, uColorA, smoothstep(-0.2, 0.4, vDisp));
          vec3 col = vec3(0.045, 0.05, 0.055) + diff * 0.06 * tint;
          col += fres * tint * 1.2;
          col += spec * 0.35 * uColorA;
          gl_FragColor = vec4(col, uOpacity);
        }`,
    })
  );
  group.add(core);

  const shellGeo = new THREE.IcosahedronGeometry(1.35, 28);
  shellGeo.computeVertexNormals();
  const shell = new THREE.Points(
    shellGeo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uAmp; uniform vec2 uMouse;
        varying float vDisp;
        ${NOISE}
        void main(){
          float d = displace(normal, uTime, uAmp * 1.3, uMouse);
          vec3 pos = position + normal * (d + 0.18);
          vDisp = d;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (1.4 + d * 3.2) * (9.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA; uniform vec3 uColorB; uniform float uOpacity;
        varying float vDisp;
        void main(){
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          vec3 col = mix(uColorB, uColorA, smoothstep(-0.2, 0.3, vDisp));
          gl_FragColor = vec4(col, (0.5 - r) * 1.1 * uOpacity);
        }`,
    })
  );
  group.add(shell);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.004, 8, 220),
    new THREE.MeshBasicMaterial({ color: 0xecebe6, transparent: true, opacity: 0.12 })
  );
  ring.rotation.set(1.2, 0.2, 0);
  group.add(ring);

  // Placement depends on the stage shape: beside the copy on desktop, centred in its own strip on mobile.
  const place = { x: 0, y: 0, scale: 1 };
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
    if (window.innerWidth < 860) {
      Object.assign(place, { x: 0, y: 0, scale: 1.2 });
    } else if (camera.aspect < 1.45) {
      // Narrow desktops: smaller and pushed right so it never sits under the headline.
      Object.assign(place, { x: halfW * 0.7, y: 0.1, scale: 0.7 });
    } else {
      Object.assign(place, { x: halfW * 0.56, y: 0.1, scale: Math.min(1, halfW / 4.4) });
    }
    if (!running) draw(0);
  }

  const pointer = { x: 0, y: 0 };
  const smooth = { x: 0, y: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true }
  );

  let intro = reduceMotion ? 1 : 0;
  function draw(dt) {
    intro = Math.min(intro + dt / 1.8, 1);
    const ease = 1 - Math.pow(1 - intro, 4);
    uniforms.uTime.value += dt;
    smooth.x += (pointer.x - smooth.x) * 0.04;
    smooth.y += (pointer.y - smooth.y) * 0.04;
    uniforms.uMouse.value.set(smooth.x, smooth.y);
    group.position.set(place.x + smooth.x * 0.15, place.y + smooth.y * 0.1, 0);
    group.scale.setScalar(place.scale * (0.86 + 0.14 * ease));
    group.rotation.set(-smooth.y * 0.2, smooth.x * 0.3 + (1 - ease) * -0.8, 0);
    core.rotation.y += dt * 0.07;
    shell.rotation.y = core.rotation.y;
    ring.rotation.z += dt * 0.1;
    renderer.render(scene, camera);
  }

  // Only animate while the hero is on screen and the tab is visible.
  const clock = new THREE.Clock();
  let running = false;
  let heroVisible = true;
  function loop() {
    if (!running) return;
    draw(Math.min(clock.getDelta(), 0.05));
    requestAnimationFrame(loop);
  }
  function update() {
    const should = !reduceMotion && heroVisible && !document.hidden;
    if (should && !running) {
      running = true;
      clock.getDelta();
      requestAnimationFrame(loop);
    } else if (!should) {
      running = false;
    }
  }

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    update();
  }).observe(stage);
  document.addEventListener("visibilitychange", update);

  resize();
  draw(0);
  update();
}

/* ==========================================================================
   Boot
   ========================================================================== */

menu();
topbarState();
activeNav();
reveals();
heroScene();
