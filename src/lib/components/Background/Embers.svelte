<script lang="ts">
    // Rising embers — fixed-position canvas overlay for the title screen.
    // GPU-light: ~40 particles desktop / ~20 mobile, additive blend, low alpha.
    // Honors prefers-reduced-motion (renders nothing).
    import { onMount } from 'svelte';

    let canvas: HTMLCanvasElement;
    let raf = 0;

    type Particle = {
        x: number; y: number;
        vx: number; vy: number;
        life: number; maxLife: number;
        size: number;
        hue: number;
        flickerSeed: number;
    };

    onMount(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const particles: Particle[] = [];
        let lastSpawn = 0;

        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const targetCount = window.innerWidth < 700 ? 20 : 40;

        const spawn = (w: number, h: number) => {
            particles.push({
                x: Math.random() * w,
                y: h + 8,
                vx: (Math.random() - 0.5) * 0.15,
                vy: -(0.18 + Math.random() * 0.45),
                life: 0,
                maxLife: 6000 + Math.random() * 4500,
                size: 0.7 + Math.random() * 1.3,
                hue: 35 + Math.random() * 14,
                flickerSeed: Math.random() * Math.PI * 2,
            });
        };

        let last = performance.now();
        const frame = (now: number) => {
            const dt = Math.min(now - last, 50);
            last = now;
            const w = window.innerWidth;
            const h = window.innerHeight;

            ctx.clearRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';

            if (particles.length < targetCount && now - lastSpawn > 180) {
                spawn(w, h);
                lastSpawn = now;
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life += dt;
                if (p.life > p.maxLife || p.y < -12) {
                    particles.splice(i, 1);
                    continue;
                }
                p.x += p.vx * dt * 0.1;
                p.y += p.vy * dt * 0.1;
                p.vx += Math.sin(p.life * 0.001 + p.flickerSeed) * 0.0006;

                const t = p.life / p.maxLife;
                let alpha: number;
                if (t < 0.2) alpha = (t / 0.2) * 0.65;
                else if (t < 0.75) alpha = 0.65;
                else alpha = (1 - (t - 0.75) / 0.25) * 0.65;

                alpha *= 0.7 + Math.sin(p.life * 0.012 + p.flickerSeed) * 0.3;

                const radius = p.size * (1 + Math.sin(p.life * 0.006) * 0.18);

                const grad = ctx.createRadialGradient(
                    p.x, p.y, 0,
                    p.x, p.y, radius * 4
                );
                grad.addColorStop(0, `hsla(${p.hue}, 75%, 68%, ${alpha})`);
                grad.addColorStop(0.4, `hsla(${p.hue}, 75%, 55%, ${alpha * 0.5})`);
                grad.addColorStop(1, `hsla(${p.hue}, 75%, 45%, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2);
                ctx.fill();
            }

            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
        };
    });
</script>

<canvas bind:this={canvas} class="embers-canvas" aria-hidden="true"></canvas>

<style>
    .embers-canvas {
        position: fixed;
        inset: 0;
        z-index: 2;
        pointer-events: none;
    }
    @media (prefers-reduced-motion: reduce) {
        .embers-canvas { display: none; }
    }
</style>
