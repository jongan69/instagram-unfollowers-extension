import { registerTools, ToolName } from './tools';
import { send } from './client';
const status = document.getElementById('status')!;
const output = document.getElementById('output')!;
const review = document.getElementById('review')!;
const native = document.getElementById('native')!;
const registration = new AbortController();
const show = (value: any) => { output.textContent = JSON.stringify(value, null, 2); };
async function refresh() {
    try {
        const s = await send('instagram_get_status');
        status.textContent = JSON.stringify(s, null, 2);
        review.replaceChildren();
        if (s.preparation) {
            const p = s.preparation;
            const heading = document.createElement('h2');
            heading.textContent = 'Review exact cleanup list';
            review.append(heading);
            const text = document.createElement('p');
            text.textContent = `Account ${p.accountId} · snapshot ${p.snapshotAt} · list ${p.id}. Preserve useful tech, business, fitness, personal and ambiguous connections. Reasons are supplied review evidence, not objective value judgments.`;
            review.append(text);
            const ul = document.createElement('ul');
            for (const u of p.users) {
                const li = document.createElement('li');
                li.textContent = `@${u.username} · ID ${u.id} — ${u.reason} (not following back in the complete snapshot)`;
                ul.append(li);
            }
            review.append(ul);
            const approve = document.createElement('button');
            approve.textContent = p.approvedAt ? 'Approved — single use' : 'Approve this exact list';
            approve.disabled = !!p.approvedAt || !!p.consumed;
            approve.onclick = async (e) => { if (!e.isTrusted)
                return; try {
                await send('APPROVE_PREPARATION', { preparationId: p.id });
                await refresh();
            }
            catch (err) {
                showError(err);
            } };
            review.append(approve);
            const execute = document.createElement('button');
            execute.textContent = 'Execute approved list';
            execute.disabled = !p.approvedAt || !!p.consumed;
            execute.onclick = async (e) => { if (!e.isTrusted)
                return; try {
                show(await send('instagram_execute_unfollow', { preparationId: p.id }));
                await refresh();
            }
            catch (err) {
                showError(err);
            } };
            review.append(execute);
        }
    }
    catch (e) {
        status.textContent = e instanceof Error ? e.message : String(e);
        review.replaceChildren();
    }
}
function showError(e: unknown) { show({ error: e instanceof Error ? e.message : String(e) }); }
async function invoke(name: ToolName, input: any, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const result = await send(name, input);
    try {
        signal?.throwIfAborted();
        await refresh();
        signal?.throwIfAborted();
        return result;
    }
    catch (e) {
        if (signal?.aborted && result.jobId) {
            if (name === 'instagram_start_scan')
                await send('instagram_cancel_scan', { jobId: result.jobId });
            else if (name === 'instagram_execute_unfollow')
                await send('STOP_UNFOLLOW');
        }
        throw e;
    }
}
(async () => {
    try {
        const available = await registerTools((document as any).modelContext, invoke, registration.signal);
        native.textContent = available ? 'Native WebMCP registered on this extension tab. Agent discovery/invocation depends on browser support; registration alone is not verification.' : 'Native WebMCP unavailable. Use a browser exposing document.modelContext.registerTool(); consult the official setup guide. All manual controls remain available.';
    }
    catch (e) {
        registration.abort();
        native.textContent = `WebMCP registration failed: ${e instanceof Error ? e.message : String(e)}. Manual controls remain available.`;
    }
    await refresh();
})();
window.addEventListener('pagehide', () => registration.abort(), { once: true });
for (const [id, name] of [['scan', 'instagram_start_scan'], ['nonfollowers', 'instagram_get_nonfollowers'], ['compare', 'instagram_compare_snapshots']] as const) {
    document.getElementById(id)!.onclick = async () => { try {
        show(await invoke(name, {}));
    }
    catch (e) {
        showError(e);
    } };
}
document.getElementById('refresh')!.onclick = refresh;
document.getElementById('cancel')!.onclick = async () => { try {
    const s = await send('instagram_get_status');
    show(await send('instagram_cancel_scan', { jobId: s.job?.id }));
    await refresh();
}
catch (e) {
    showError(e);
} };
document.getElementById('stop')!.onclick = async () => { try {
    show(await send('STOP_UNFOLLOW'));
    await refresh();
}
catch (e) {
    showError(e);
} };
document.getElementById('prepare')!.onclick = async () => { try {
    const candidates = JSON.parse((document.getElementById('candidates') as HTMLTextAreaElement).value);
    show(await invoke('instagram_prepare_unfollow', { candidates }));
}
catch (e) {
    showError(e);
} };
document.getElementById('export')!.onclick = async () => { try {
    const snapshot = await send('EXPORT_BASELINE');
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `instagram-baseline-${snapshot.accountId}-${snapshot.capturedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
catch (e) {
    showError(e);
} };
document.getElementById('import')!.onchange = async (e) => { const el = e.target as HTMLInputElement; try {
    const f = el.files?.[0];
    if (!f)
        return;
    if (f.size > 20000000)
        throw new Error('Baseline exceeds 20 MB');
    const snapshot = JSON.parse(await f.text());
    show(await send('IMPORT_BASELINE', { snapshot }));
    await refresh();
}
catch (e) {
    showError(e);
}
finally {
    el.value = '';
} };
const timer = setInterval(() => { if (!document.hidden)
    void refresh(); }, 3000);
window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
