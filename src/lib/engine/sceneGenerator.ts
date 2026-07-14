import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

const noise2D = createNoise2D();

export function generateScene(scene: THREE.Scene, tags: any) {
    // 1. Dispose of previous procedural elements to prevent memory leaks
    const toRemove = scene.children.filter(c => c.userData.procedural);
    toRemove.forEach(c => {
        scene.remove(c);
        const mesh = c as any;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            if (Array.isArray(mesh.material)) mesh.material.forEach((m: any) => m.dispose());
            else mesh.material.dispose();
        }
    });

    // 2. Terrain
    const floorGeo = new THREE.PlaneGeometry(50, 50, 50, 50);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xb3a988, roughness: 0.95 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.userData.procedural = true;
    floor.rotation.x = -Math.PI / 2;

    const positions = floorGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i); const y = positions.getY(i);
        let height = 0;
        if (tags.biome === 'swamp') height = noise2D(x * 0.1, y * 0.1) * 0.5;
        else if (tags.biome === 'crypt') height = noise2D(x * 0.5, y * 0.5) * 0.1;
        positions.setZ(i, height);
    }
    positions.needsUpdate = true;
    floorGeo.computeVertexNormals();
    scene.add(floor);

    // 3. Weather
    if (tags.weather === 'rain') {
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = new Float32Array(1000 * 3);
        for(let i=0; i<1000*3; i+=3) {
            rainPos[i] = (Math.random() - 0.5) * 30;
            rainPos[i+1] = Math.random() * 10;
            rainPos[i+2] = (Math.random() - 0.5) * 30;
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.1, transparent: true });
        const rain = new THREE.Points(rainGeo, rainMat);
        rain.userData.procedural = true; rain.userData.isRain = true;
        scene.add(rain);
    }

    // 4. Fog — light, warm haze that blends into the parchment background.
    const fogColor = tags.mood === 'eerie' ? 0xc7cbb2 : 0xd8cfb8;
    scene.fog = new THREE.FogExp2(fogColor, 0.055);
}