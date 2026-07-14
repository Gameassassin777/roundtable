<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as THREE from 'three';
    import { generateScene } from '$lib/engine/sceneGenerator';

    export let sceneTags: any = { biome: "crypt", weather: "none", mood: "oppressive" };

    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let animationId: number;

    onMount(() => {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 4, 8); camera.lookAt(0, 1, 0);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0xe9e0cf, 1); // match --bg so the scene reads light, not black

        generateScene(scene, sceneTags);

        // Soft, airy lighting — a light misty tabletop rather than a pitch-black crypt.
        const torch = new THREE.PointLight(0xffd9a0, 1.6, 22);
        torch.position.set(0, 6, 4);
        scene.add(torch);
        scene.add(new THREE.HemisphereLight(0xf4ecdb, 0x9a8f78, 1.1));
        scene.add(new THREE.AmbientLight(0xcfc3ad, 0.6));

        const animate = () => {
            animationId = requestAnimationFrame(animate);
            scene.children.forEach(c => {
                if (c.userData.isRain) {
                    const points = c as any;
                    const pos = points.geometry.attributes.position.array;
                    for (let i = 1; i < pos.length; i += 3) {
                        pos[i] -= 0.2; if (pos[i] < 0) pos[i] = 10;
                    }
                    points.geometry.attributes.position.needsUpdate = true;
                }
            });
            renderer.render(scene, camera);
        };
        animate();
    });

    $: if (renderer && sceneTags) { generateScene(scene, sceneTags); }

    onDestroy(() => {
        cancelAnimationFrame(animationId);
        renderer?.dispose();
    });
</script>

<canvas bind:this={canvas} style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1;"></canvas>