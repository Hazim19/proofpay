<script lang="ts">
  import { onMount } from "svelte";
  import * as THREE from "three";

  /**
   * The single Three.js moment: an abstract "vault" in the hero header —
   * a wireframe icosahedron (the held funds), a gold orbit ring with coin
   * nodes (money in motion), and a quiet particle field. Deliberately
   * restrained: capped DPR, no post-processing, pauses when hidden or
   * off-screen, renders one static frame under prefers-reduced-motion,
   * and removes itself entirely if WebGL is unavailable.
   */
  let canvas: HTMLCanvasElement | undefined = $state();

  onMount(() => {
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      canvas.style.display = "none";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const group = new THREE.Group();
    scene.add(group);

    // Vault core: wireframe icosahedron + faint solid heart.
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.18, 1),
      new THREE.MeshBasicMaterial({
        color: 0x9d94ff,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      }),
    );
    group.add(wire);
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.62, 0),
      new THREE.MeshBasicMaterial({
        color: 0x635bff,
        transparent: true,
        opacity: 0.28,
      }),
    );
    group.add(heart);

    // Gold orbit ring + coin nodes travelling it.
    const orbit = new THREE.Group();
    orbit.rotation.x = Math.PI / 2.6;
    orbit.rotation.y = 0.35;
    group.add(orbit);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.008, 8, 128),
      new THREE.MeshBasicMaterial({
        color: 0xc9a24b,
        transparent: true,
        opacity: 0.75,
      }),
    );
    orbit.add(ring);
    const coinGeo = new THREE.SphereGeometry(0.055, 12, 12);
    const coinMats = [
      new THREE.MeshBasicMaterial({ color: 0xffd140 }),
      new THREE.MeshBasicMaterial({ color: 0x9d94ff }),
    ];
    const coins: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const coin = new THREE.Mesh(coinGeo, coinMats[i % 2]);
      coin.userData.phase = (i / 10) * Math.PI * 2;
      orbit.add(coin);
      coins.push(coin);
    }

    // Particle field.
    const N = 240;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 2.1 + Math.random() * 1.9;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.62;
      pos[i * 3 + 2] = r * Math.cos(ph);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0xbdb4ff,
        size: 0.022,
        transparent: true,
        opacity: 0.75,
      }),
    );
    group.add(points);

    const parent = canvas.parentElement;
    function resize() {
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the vault right of the headline on wide heroes, centred behind
      // it (fainter) on narrow ones.
      group.position.x = w / h > 1.5 ? 1.75 : 0;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    if (parent) ro.observe(parent);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let running = true;
    let visible = true;
    const start = performance.now();

    function frame() {
      const t = (performance.now() - start) / 1000;
      wire.rotation.y = t * 0.12;
      wire.rotation.x = t * 0.05;
      heart.rotation.y = -t * 0.2;
      points.rotation.y = t * 0.02;
      for (const coin of coins) {
        const a = coin.userData.phase + t * 0.25;
        coin.position.set(Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0);
      }
      group.position.y = Math.sin(t * 0.6) * 0.05;
      renderer.render(scene, camera);
    }

    let raf = 0;
    function loop() {
      raf = requestAnimationFrame(loop);
      if (running && visible) frame();
    }

    const onVis = () => {
      running = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.02 },
    );
    if (parent) io.observe(parent);

    if (reduced) {
      frame(); // one static frame, no loop
    } else {
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      ro.disconnect();
      pGeo.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
    };
  });
</script>

<canvas bind:this={canvas} class="hero-canvas" aria-hidden="true"></canvas>

<style>
  .hero-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
