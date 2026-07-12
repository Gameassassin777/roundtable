<script lang="ts">
    // Small horizontal stat bar for HP / Resolve / Corruption / etc.
    // Max is the denominator; value is the numerator. Color comes from `kind`.

    type Props = {
        label: string;
        value: number;
        max: number;
        kind: 'hp' | 'resolve' | 'corruption' | 'good' | string;
    };

    let { label, value, max, kind }: Props = $props();

    let pct = $derived(Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0)));
</script>

<div class="bar" data-kind={kind}>
    <span class="label">{label}</span>
    <span class="track">
        <span class="fill" style="width: {pct}%"></span>
    </span>
    <span class="value">{value}{#if max !== value}/{max}{/if}</span>
</div>

<style>
    .bar {
        display: grid;
        grid-template-columns: 3.5rem 1fr 3rem;
        gap: 0.45rem;
        align-items: center;
        font-size: var(--t-xs);
    }
    .label {
        color: var(--muted);
        font-weight: 500;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        font-size: 10px;
    }
    .track {
        display: block;
        height: 6px;
        background: var(--inset);
        border-radius: var(--radius-pill);
        overflow: hidden;
    }
    .fill {
        display: block;
        height: 100%;
        background: var(--ink-soft);
        transition: width 0.3s ease;
    }
    .value {
        text-align: right;
        color: var(--ink-soft);
        font-variant-numeric: tabular-nums;
    }
    .bar[data-kind='hp'] .fill { background: var(--hp); }
    .bar[data-kind='resolve'] .fill { background: var(--resolve); }
    .bar[data-kind='corruption'] .fill { background: var(--corruption); }
    .bar[data-kind='good'] .fill { background: var(--good); }
</style>
