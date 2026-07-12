<script lang="ts">
    type AuditItem = {
        id: number | string;
        actions: Array<{ author: string; text: string }>;
        ruling: any;
        audit: { lint_retried?: boolean; critic_passed?: boolean | null; critic_retried?: boolean } | null;
    };

    type Props = {
        items: AuditItem[];
    };

    let { items }: Props = $props();
</script>

{#if items.length === 0}
    <p class="empty muted">No turns logged yet. Play a few rounds — every beat's lint/critic status and Director verdict lands here.</p>
{:else}
    <table class="audit-table">
        <thead>
            <tr>
                <th>Turn</th>
                <th>Actions</th>
                <th>Director verdict</th>
                <th>Flags</th>
            </tr>
        </thead>
        <tbody>
            {#each items as item (item.id)}
                <tr>
                    <td class="turn">#{item.id}</td>
                    <td class="actions">
                        {#each item.actions as a}
                            <div class="action-row" title={a.text}>
                                <span class="action-author">{a.author}:</span>
                                <span class="action-text">{a.text.length > 60 ? a.text.slice(0, 57) + '…' : a.text}</span>
                            </div>
                        {/each}
                    </td>
                    <td class="verdict">
                        {#if item.ruling?.verdict}{item.ruling.verdict}{:else if item.ruling?.verdicts}{item.ruling.verdicts}{:else}<span class="muted">—</span>{/if}
                    </td>
                    <td class="flags">
                        {#if !item.audit}
                            <span class="muted">—</span>
                        {:else}
                            {#if item.audit.lint_retried}<span class="flag lint" title="Lint retried">L↻</span>{/if}
                            {#if item.audit.critic_retried}<span class="flag retry" title="Critic retried">C↻</span>{/if}
                            {#if item.audit.critic_passed === false}<span class="flag fail" title="Critic failed">C✗</span>{/if}
                            {#if item.audit.critic_passed === true && !item.audit.lint_retried && !item.audit.critic_retried}
                                <span class="flag ok" title="Clean pass">✓</span>
                            {/if}
                        {/if}
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
{/if}

<style>
    .empty {
        text-align: center;
        padding: 2rem 1rem;
        font-size: var(--t-sm);
    }
    .audit-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--t-xs);
    }
    .audit-table th {
        text-align: left;
        font-family: var(--font-display);
        font-size: var(--t-xs);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--gold);
        padding: 0.4rem 0.5rem;
        border-bottom: 1px solid var(--line);
        font-weight: 600;
    }
    .audit-table td {
        padding: 0.45rem 0.5rem;
        border-bottom: 1px solid var(--line-soft);
        vertical-align: top;
    }
    .turn {
        font-family: var(--font-display);
        color: var(--gold);
        font-weight: 600;
    }
    .actions { max-width: 240px; }
    .action-row {
        display: flex;
        gap: 0.35rem;
        margin: 0.15rem 0;
        line-height: 1.4;
    }
    .action-author {
        font-family: var(--font-display);
        color: var(--accent);
        font-size: var(--t-xs);
        font-weight: 600;
        flex-shrink: 0;
    }
    .action-text { color: var(--ink-soft); }
    .verdict { color: var(--ink-soft); }
    .flags {
        display: flex;
        gap: 0.3rem;
        align-items: center;
    }
    .flag {
        font-family: var(--font-display);
        font-size: var(--t-xs);
        font-weight: 600;
        padding: 0.1rem 0.3rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--line);
    }
    .flag.lint { color: var(--resolve); border-color: var(--resolve); }
    .flag.retry { color: var(--resolve); border-color: var(--resolve); }
    .flag.fail { color: var(--hp); border-color: var(--hp); }
    .flag.ok { color: var(--good); border-color: var(--good); }
</style>
