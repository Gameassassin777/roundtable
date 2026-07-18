<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    import { generateScene } from '$lib/engine/sceneGenerator';
    import { resolveScene, type SceneTags, type ScenePalette } from '$lib/engine/scenePalette';
import { PainterlyBaker, createBackdrop } from '$lib/engine/painterly';

    // The stage. See CLAUDE.md — the diorama carries ALL scene atmosphere, and
    // its clear colour must NEVER be matched to the page background.

    let { sceneTags = { biome: 'crossroads', weather: 'clear', mood: 'calm', time_of_day: 'day' } }:
        { sceneTags?: SceneTags } = $props();

    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let animationId: number;
    let ready = $state(false);
    let aimY = 2.2;   // camera target height — lowered on portrait by resize()
    let baseY = 3.4;  // camera height — the drift loop oscillates around this
    let failed = $state(false);

    // Lights are rebuilt per scene — kept out of userData.procedural so the
    // generator's disposal pass doesn't fight us for them.
    let key: THREE.DirectionalLight;
    let hemi: THREE.HemisphereLight;
    let amb: THREE.AmbientLight;
    let rim: THREE.DirectionalLight;
    let pal: ScenePalette | null = null;   // last resolved — the bake reads its grade knobs

    // Anime-background pipeline: the static world is rendered ONCE per scene
    // change, paint-processed (Kuwahara), and shown as a 2D backdrop; only the
    // living layer (fog banks, mist, motes, precip) stays real-time 3D.
    const baker = new PainterlyBaker();
    let backdrop: THREE.Mesh | null = null;
    let rebakeT: ReturnType<typeof setTimeout> | null = null;

    const isLive = (ud: any) => ud.isFogBank || ud.isGroundMist || ud.isMote || ud.isPrecip || ud.isFlock || ud.isButterflies || ud.isLeaves;

    function bakeBackdrop() {
        if (!renderer || !scene || !camera || !backdrop) return;
        const { w, h } = viewport();
        if (w <= 0 || h <= 0) return;
        // The bake is once per scene — it can afford dpr 2 (the live renderer
        // stays at 1.5). The baker's own pixel cap steps down from there.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // Show the static world, hide the live layer + backdrop for the bake.
        for (const c of scene.children) {
            const ud = c.userData;
            if (ud.isBackdrop) { c.visible = false; continue; }
            if (ud.procedural) c.visible = !isLive(ud);
        }
        // Bake slightly wide so the Ken Burns drift never reveals an edge.
        const fov0 = camera.fov;
        camera.fov = fov0 * 1.06;
        camera.updateProjectionMatrix();
        const tex = baker.bake(renderer, scene, camera, Math.round(w * dpr), Math.round(h * dpr),
            pal ? { saturation: pal.gradeSat, contrast: pal.gradeCon, lift: pal.gradeLift, bloom: pal.bloom } : undefined);
        camera.fov = fov0;
        camera.updateProjectionMatrix();

        // Swap: static world OFF, painting + live layer ON.
        for (const c of scene.children) {
            const ud = c.userData;
            if (ud.isBackdrop) { c.visible = true; continue; }
            if (ud.procedural) c.visible = isLive(ud);
        }
        (backdrop.material as THREE.ShaderMaterial).uniforms.tPaint.value = tex;
        backdrop.visible = true;
    }

    /** Debounced — resize storms and scene changes both land here. */
    function scheduleBake() {
        if (rebakeT) clearTimeout(rebakeT);
        rebakeT = setTimeout(bakeBackdrop, 180);
    }

    /**
     * Viewport is never sampled once. window.innerWidth can be 0 at mount (iOS
     * PWA cold start, backgrounded tabs, embedded panes); the old code sampled
     * it once with no guard and no resize handler, which left a permanently 0x0
     * canvas with no recovery path.
     */
    function viewport() {
        const w = window.innerWidth || document.documentElement.clientWidth || canvas?.clientWidth || 0;
        const h = window.innerHeight || document.documentElement.clientHeight || canvas?.clientHeight || 0;
        return { w, h };
    }

    function resize() {
        if (!renderer || !camera) return;
        const { w, h } = viewport();
        if (w <= 0 || h <= 0) return;               // zero-guard: never setSize(0,0)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(w, h, true);

        const aspect = w / h;
        camera.aspect = aspect;
        // THREE's fov is VERTICAL. On a phone (aspect ~0.46) a landscape-tuned
        // fov gives a narrow horizontal slice under a vast empty sky. Widen
        // vertically and aim lower so the world fills the tall frame.
        camera.fov = aspect < 1 ? 64 : 52;
        baseY = aspect < 1 ? 3.0 : 3.4;
        camera.position.set(0, baseY, aspect < 1 ? 9.5 : 11);
        aimY = aspect < 1 ? 1.9 : 2.2;
        camera.lookAt(0, aimY, 0);
        camera.updateProjectionMatrix();
        ready = true;
        scheduleBake();
    }

    function applyScene(tags: SceneTags) {
        if (!renderer || !scene) return;
        pal = resolveScene(tags);

        renderer.setClearColor(pal.sky, 1);
        generateScene(scene, tags, pal);

        // The key light IS the sun in the sky — same direction, same colour, or
        // the shadows point somewhere the sky says they shouldn't.
        key.position.set(pal.sunDir[0] * 60, pal.sunDir[1] * 60, pal.sunDir[2] * 60);
        key.target.position.set(0, 0, 0);
        key.target.updateMatrixWorld();
        key.color.setHex(pal.sunColor);
        key.intensity = pal.keyIntensity;
        renderer.toneMappingExposure = pal.exposure;
        hemi.color.setHex(pal.hemiSky);
        hemi.groundColor.setHex(pal.hemiGround);
        hemi.intensity = pal.hemiIntensity;
        amb.color.setHex(pal.ambient);
        amb.intensity = pal.ambientIntensity;
        // Rim from roughly opposite the sun: edges of masses pick up the sky
        // colour behind them, separating silhouette from backdrop.
        rim.position.set(-pal.sunDir[0] * 55, 26, -pal.sunDir[2] * 55);
        rim.target.position.set(0, 0, 0);
        rim.target.updateMatrixWorld();
        rim.color.setHex(pal.rimColor);
        rim.intensity = pal.rimIntensity;
        scheduleBake();
    }

    onMount(() => {
        try {
            scene = new THREE.Scene();
            const { w, h } = viewport();
            camera = new THREE.PerspectiveCamera(52, (w || 1) / (h || 1), 0.1, 220);
            camera.position.set(0, 3.4, 11);
            camera.lookAt(0, 2.2, 0);

            renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            // Rendering in raw linear light with no tone curve is most of why
            // this read as flat fill rather than photography. ACES + sRGB out.
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.0;
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            key = new THREE.DirectionalLight(0xffffff, 1.5);
            key.position.set(6, 14, 7);
            key.castShadow = true;
            // Tight frustum around the visible clearing — a loose one wastes the
            // whole shadow map on empty terrain and gives soft mush.
            key.shadow.mapSize.set(1024, 1024);
            key.shadow.camera.near = 0.5;
            key.shadow.camera.far = 120;
            key.shadow.camera.left = -46; key.shadow.camera.right = 46;
            key.shadow.camera.top = 46;  key.shadow.camera.bottom = -46;
            key.shadow.bias = -0.0016;
            key.shadow.normalBias = 0.035;
            hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
            amb = new THREE.AmbientLight(0xffffff, 0.55);
            // Rim: a sky-coloured back light. It exists for the BAKE — after
            // the swap the static meshes are hidden and the live layer is
            // unlit sprites, so it costs nothing per frame.
            rim = new THREE.DirectionalLight(0xffffff, 0.6);
            rim.castShadow = false;
            scene.add(key, key.target, hemi, amb, rim, rim.target);

            backdrop = createBackdrop();
            backdrop.visible = false;          // until the first bake lands
            scene.add(backdrop);

            applyScene(sceneTags);
            resize();

            // Recover whenever the viewport becomes valid or changes.
            window.addEventListener('resize', resize);
            window.addEventListener('orientationchange', resize);
            const ro = new ResizeObserver(resize);
            ro.observe(document.documentElement);
            cleanupObservers = () => {
                window.removeEventListener('resize', resize);
                window.removeEventListener('orientationchange', resize);
                ro.disconnect();
            };

            const clock = new THREE.Clock();
            const animate = () => {
                animationId = requestAnimationFrame(animate);
                if (!renderer || !ready) { if (!ready) resize(); return; }
                const t = clock.getElapsedTime();

                for (const c of scene.children) {
                    if (!c.visible) continue;
                    const ud = c.userData;
                    if (ud.isSky && ud.skyMat) {
                        ud.skyMat.uniforms.time.value = t;
                    } else if (ud.isPrecip) {
                        const pts = c as THREE.Points;
                        const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
                        for (let i = 1; i < arr.length; i += 3) {
                            arr[i] -= ud.fallSpeed;
                            if (ud.drift) arr[i - 1] += Math.sin(t + arr[i]) * 0.004;
                            if (arr[i] < 0) arr[i] = 22;
                        }
                        pts.geometry.attributes.position.needsUpdate = true;
                    } else if (ud.isFogBank) {
                        // drift sideways + breathe so the fog reads as moving air
                        c.position.x += ud.drift;
                        if (c.position.x > 42) c.position.x = -42;
                        if (c.position.x < -42) c.position.x = 42;
                        c.position.y = ud.baseY + Math.sin(t * 0.15 + ud.phase) * 0.4;
                    } else if (ud.isGroundMist) {
                        const pts = c as THREE.Points;
                        const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
                        for (let i = 0; i < arr.length; i += 3) {
                            arr[i] += Math.sin(t * 0.12 + arr[i + 2]) * 0.008;
                        }
                        pts.geometry.attributes.position.needsUpdate = true;
                    } else if (ud.isFlock) {
                        // circling flock: each bird along the orbit, wings flapping
                        const o = ud.orbit;
                        c.children.forEach((bird, i) => {
                            const a = o.off + t * o.speed + i * 0.4;
                            bird.position.set(Math.cos(a) * o.r, o.h + Math.sin(t * 0.5 + i) * 0.6, Math.sin(a) * o.r);
                            bird.rotation.y = -a - Math.PI / 2;
                            const flap = Math.sin(t * 7 + bird.userData.ph) * 0.65;
                            if (bird.children[0]) bird.children[0].rotation.z = flap;
                            if (bird.children[1]) bird.children[1].rotation.z = -flap;
                        });
                    } else if (ud.isButterflies) {
                        c.children.forEach((b) => {
                            const hm = b.userData.home;
                            b.position.set(
                                hm.x + Math.sin(t * 0.5 + hm.ph) * 1.3,
                                0.55 + Math.sin(t * 1.1 + hm.ph * 2) * 0.35,
                                hm.z + Math.cos(t * 0.4 + hm.ph) * 1.3
                            );
                            const flap = Math.sin(t * 13 + hm.ph) * 1.0;
                            if (b.children[0]) b.children[0].rotation.y = flap;
                            if (b.children[1]) b.children[1].rotation.y = -flap;
                        });
                    } else if (ud.isLeaves) {
                        const pts = c as THREE.Points;
                        const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
                        for (let i = 0; i < arr.length; i += 3) {
                            arr[i] += Math.sin(t * 1.4 + arr[i + 2]) * 0.012;   // flutter
                            arr[i + 1] -= 0.014;                               // slow fall
                            if (arr[i + 1] < 0) arr[i + 1] = 10;
                        }
                        pts.geometry.attributes.position.needsUpdate = true;
                    } else if (ud.isMote) {
                        const pts = c as THREE.Points;
                        const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
                        const ph = ud.phase as Float32Array;
                        for (let i = 0; i < ph.length; i++) {
                            const j = i * 3;
                            arr[j] += Math.sin(t * 0.3 + ph[i]) * 0.006;      // lateral wander
                            arr[j + 1] += ud.rise;                            // rise/settle
                            arr[j + 2] += Math.cos(t * 0.24 + ph[i]) * 0.006;
                            if (arr[j + 1] > 13) arr[j + 1] = 0.4;            // recycle to the floor
                            if (arr[j + 1] < 0.2) arr[j + 1] = 12.5;          // marine snow recycles to the surface
                        }
                        pts.geometry.attributes.position.needsUpdate = true;
                        if (ud.glowy) {
                            (pts.material as THREE.PointsMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 2.1);
                        }
                    } else if (ud.isWater) {
                        const g = (c as THREE.Mesh).geometry as THREE.PlaneGeometry;
                        const p = g.attributes.position as THREE.BufferAttribute;
                        for (let i = 0; i < p.count; i++) {
                            const x = p.getX(i), y = p.getY(i);
                            p.setZ(i, Math.sin(x * 0.35 + t * 1.1) * 0.16 + Math.cos(y * 0.28 + t * 0.8) * 0.12);
                        }
                        p.needsUpdate = true;
                        g.computeVertexNormals();
                    }
                }

                // The stage breathes via a slow pan of the painting itself —
                // the camera stays fixed (the backdrop is a 2D bake); the live
                // fog drifting at its own rate supplies the parallax.
                if (backdrop && backdrop.visible) {
                    const u = (backdrop.material as THREE.ShaderMaterial).uniforms;
                    u.uOffset.value.set(Math.sin(t * 0.05) * 0.012, Math.sin(t * 0.075) * 0.008);
                }

                renderer.render(scene, camera);
            };
            animate();
        } catch (err: any) {
            console.warn('WebGL unavailable — stage disabled:', err?.message);
            failed = true;
        }
    });

    let cleanupObservers: (() => void) | null = null;

    // Rebuild the stage whenever the world changes scene.
    $effect(() => {
        const tags = sceneTags;
        if (renderer && scene && !failed) applyScene(tags);
    });

    onDestroy(() => {
        cancelAnimationFrame(animationId);
        cleanupObservers?.();
        if (rebakeT) clearTimeout(rebakeT);
        baker.dispose();
        renderer?.dispose();
        renderer = null;
    });
</script>

<canvas bind:this={canvas} class="stage" class:failed aria-hidden="true"></canvas>
<!-- Vignette in CSS rather than an EffectComposer pass: identical read, zero
     GPU cost. UnrealBloomPass on an iPhone PWA at dpr 1.5 would cost more than
     it returns; the sun halo is baked into the sky shader instead. -->
<div class="vignette" aria-hidden="true"></div>

<style>
    .stage {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        display: block;
        z-index: 1;
    }
    .vignette {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2;
        background:
            radial-gradient(120% 88% at 50% 44%,
                rgba(0, 0, 0, 0) 42%,
                rgba(0, 0, 0, 0.16) 76%,
                rgba(0, 0, 0, 0.42) 100%);
        mix-blend-mode: multiply;
    }
    /* If WebGL is gone, fall back to a real gradient — never a flat page-coloured void. */
    .stage.failed {
        background: linear-gradient(180deg, #2c3e50 0%, #4a5f6d 45%, #6b6250 100%);
    }
</style>
