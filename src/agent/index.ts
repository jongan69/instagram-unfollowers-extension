import { registerTools, ToolName } from './tools';
import { send } from './client';
import { loadWhitelist, saveWhitelist } from '../utils/storage';
import type { UserNode } from '../model/user';
import type { Account } from '../core/scan';
const el = (id: string) => document.getElementById(id)!;
const button = (id: string) => el(id) as HTMLButtonElement;
const registration = new AbortController();
let current: any = null, refreshing = false, rows: Account[] = [], mode: 'nonfollowers' | 'history' = 'nonfollowers', page = 0, protectedUsers: UserNode[] = [];
const selected = new Map<string, string>();
let reviewKey = '';
const date = (value?: string) => value ? new Date(value).toLocaleString() : 'None';
function feedback(message: string, error = false) { el('feedback').textContent = message; el('feedback').className = `notice ${error ? 'error' : 'success'}`; }
function showError(e: unknown) { const message = e instanceof Error ? e.message : String(e); el('output').textContent = JSON.stringify({ error: message }, null, 2); feedback(message, true); }
function show(value: any) { el('output').textContent = JSON.stringify(value, null, 2); if (value.accounts) {
    selected.clear();
    rows = value.accounts;
    mode = 'nonfollowers';
    page = 0;
    el('nonfollowers-count').textContent = String(rows.length);
    el('list-description').textContent = `Not following back in the complete snapshot from ${date(value.capturedAt)}. This does not establish a historical unfollow.`;
    renderAccounts();
    feedback(`${rows.length} current nonfollowers loaded.`);
}
else if (value.absentFollowers) {
    selected.clear();
    rows = value.absentFollowers;
    mode = 'history';
    page = 0;
    el('list-description').textContent = `Present on ${date(value.baselineAt)}, absent on ${date(value.currentAt)}. Causes are inconclusive; renames alone are not unfollows.`;
    renderAccounts();
    feedback(`${rows.length} earlier followers are absent from the later complete snapshot.`);
}
else if (value.jobId) {
    feedback(`Job accepted. Live status and progress appear above.`);
}
else if (value.approved) {
    feedback('Exact list approved. Execution remains a separate action.');
}
else if (value.success) {
    feedback('Saved successfully.');
} }
function renderAccounts() {
    const target = el('accounts');
    target.replaceChildren();
    const q = (el('search') as HTMLInputElement).value.toLowerCase();
    const filtered = rows.filter(u => `${u.username} ${u.full_name}`.toLowerCase().includes(q));
    const max = Math.max(1, Math.ceil(filtered.length / 25));
    page = Math.min(page, max - 1);
    const ids = new Set(protectedUsers.map(u => u.id));
    for (const u of filtered.slice(page * 25, (page + 1) * 25)) {
        const card = document.createElement('div');
        card.className = 'account-row';
        const top = document.createElement('div');
        top.className = 'account-top';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.setAttribute('aria-label', `Review @${u.username}`);
        check.disabled = mode === 'history' || ids.has(u.id) || selected.size >= 50 && !selected.has(u.id);
        check.checked = selected.has(u.id);
        check.onchange = () => { if (check.checked)
            selected.set(u.id, '');
        else
            selected.delete(u.id); renderAccounts(); };
        top.append(check);
        const info = document.createElement('div');
        info.className = 'account-name';
        const link = document.createElement('a');
        link.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = `@${u.username}`;
        info.append(link);
        const detail = document.createElement('div');
        detail.className = 'small';
        detail.textContent = `${u.full_name || 'Instagram account'} · ID ${u.id}`;
        info.append(detail);
        top.append(info);
        const keep = document.createElement('button');
        keep.textContent = ids.has(u.id) ? 'Protected' : 'Keep';
        keep.setAttribute('aria-label', `${ids.has(u.id) ? 'Unprotect' : 'Protect'} @${u.username}`);
        keep.onclick = async () => { try {
            const updated = ids.has(u.id) ? protectedUsers.filter(w => w.id !== u.id) : [...protectedUsers, u as UserNode];
            await saveWhitelist(updated);
            protectedUsers = updated;
            selected.delete(u.id);
            el('protected-count').textContent = String(updated.length);
            renderAccounts();
            await refresh();
        }
        catch (e) {
            showError(e);
        } };
        top.append(keep);
        card.append(top);
        if (selected.has(u.id)) {
            const reason = document.createElement('input');
            reason.className = 'reason';
            reason.maxLength = 500;
            reason.value = selected.get(u.id)!;
            reason.placeholder = 'Specific evidence for this cleanup candidate';
            reason.setAttribute('aria-label', `Cleanup reason for @${u.username}`);
            reason.oninput = () => selected.set(u.id, reason.value);
            card.append(reason);
        }
        target.append(card);
    }
    if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = rows.length ? 'No accounts match your search.' : 'No accounts in this view.';
        target.append(empty);
    }
    el('page-label').textContent = `${filtered.length} accounts · Page ${page + 1} of ${max}`;
    button('previous').disabled = page === 0;
    button('next').disabled = page >= max - 1;
    el('selection').textContent = `${selected.size} of 50 maximum selected · Protected accounts are excluded`;
    button('prepare').disabled = selected.size === 0 || mode === 'history' || !!current?.rateLimit || ['running', 'paused'].includes(current?.job?.status);
}
function renderReview(preparation: any) {
    const key = JSON.stringify([preparation?.id, preparation?.approvedAt, preparation?.consumed]);
    if (key === reviewKey)
        return;
    reviewKey = key;
    const target = el('review');
    target.replaceChildren();
    if (!preparation)
        return;
    const heading = document.createElement('h2');
    heading.textContent = 'Review this exact list';
    target.append(heading);
    const note = document.createElement('p');
    note.textContent = `Account ${preparation.accountId} · ${preparation.users.length} accounts · Snapshot ${date(preparation.snapshotAt)}. Read every ID and reason. Approval expires after five minutes and can be used once.`;
    target.append(note);
    const list = document.createElement('ul');
    for (const u of preparation.users) {
        const li = document.createElement('li');
        li.textContent = `@${u.username} · ID ${u.id} — ${u.reason}`;
        list.append(li);
    }
    target.append(list);
    const approve = document.createElement('button');
    approve.textContent = preparation.approvedAt ? 'Approved — single use' : 'Approve this exact list';
    approve.disabled = !!preparation.approvedAt || !!preparation.consumed;
    approve.onclick = async (e) => { if (!e.isTrusted)
        return; try {
        show(await send('APPROVE_PREPARATION', { preparationId: preparation.id }));
        await refresh();
    }
    catch (err) {
        showError(err);
    } };
    target.append(approve);
    const execute = document.createElement('button');
    execute.className = 'danger';
    execute.textContent = 'Execute approved list';
    execute.disabled = !preparation.approvedAt || !!preparation.consumed;
    execute.onclick = async (e) => { if (!e.isTrusted)
        return; try {
        show(await send('instagram_execute_unfollow', { preparationId: preparation.id }));
        await refresh();
    }
    catch (err) {
        showError(err);
    } };
    target.append(execute);
}
async function refresh() {
    if (refreshing)
        return;
    refreshing = true;
    try {
        const s = await send('instagram_get_status');
        const previous = current;
        const oldProtected = protectedUsers.map(u => u.id).join(',');
        current = s;
        protectedUsers = await loadWhitelist();
        for (const u of protectedUsers)
            selected.delete(u.id);
        if (previous?.accountId !== s.accountId) {
            selected.clear();
            rows = [];
            page = 0;
            renderAccounts();
        }
        if (s.latestAt && s.latestAt !== previous?.latestAt) {
            selected.clear();
            show(await send('instagram_get_nonfollowers'));
        }
        el('status').textContent = JSON.stringify(s, null, 2);
        el('account-badge').textContent = s.profile?.username ? `@${s.profile.username}` : s.accountId ? `Account ${s.accountId}` : 'Instagram not connected';
        el('followers-count').textContent = s.profile?.ready ? String(s.profile.followers) : '—';
        el('following-count').textContent = s.profile?.ready ? String(s.profile.following) : '—';
        el('protected-count').textContent = String(protectedUsers.length);
        const j = s.job ?? s.lastJob;
        const busy = ['running', 'paused'].includes(j?.status);
        el('job-status').textContent = j?.status ?? 'Ready';
        el('progress-detail').textContent = j ? j.complete ? 'Complete lists validated and saved' : `${j.phase.replace(/_/g, ' ')} · ${j.received} of ${j.total || 'unknown'} accounts in this phase` : 'No active scan';
        (el('progress') as HTMLProgressElement).value = j?.complete ? 100 : j?.phase === 'following' ? 50 + Math.round(j.received / Math.max(j.total, 1) * 49) : Math.round((j?.received ?? 0) / Math.max(j?.total ?? 1, 1) * 49);
        el('snapshot-time').textContent = s.latestAt ? `Last complete: ${date(s.latestAt)}` : 'No complete snapshot yet';
        el('history-description').textContent = s.baselineAt ? `Earlier baseline: ${date(s.baselineAt)}. Compare with ${date(s.latestAt)}.` : 'The first complete scan establishes history. Import an earlier complete baseline or scan again later for comparison.';
        const notice = el('setup-notice');
        notice.className = `notice ${s.rateLimit || j?.status === 'failed' ? 'error' : ''}`;
        notice.textContent = s.rateLimit ? `Instagram restriction. Local cooldown until ${date(new Date(s.rateLimit.until).toISOString())}. This is a minimum wait, not server clearance.` : !s.profile?.ready ? s.profile?.message ?? 'Open Instagram, sign in and open your own profile.' : j?.error ?? 'Profile ready. Keep Instagram open; only complete lists become a snapshot.';
        button('scan').disabled = busy || !!s.rateLimit || !s.profile?.ready || !s.accountId;
        button('cancel').disabled = !busy || j?.phase === 'unfollow';
        button('pause').disabled = !busy || j?.phase === 'unfollow';
        button('pause').textContent = j?.status === 'paused' ? 'Resume scan' : 'Pause scan';
        button('stop').disabled = !busy || j?.phase !== 'unfollow';
        button('export').disabled = !s.latestAt && !s.baselineAt;
        button('compare').disabled = !s.latestAt || !s.baselineAt;
        button('nonfollowers').disabled = !s.latestAt;
        try {
            const prior = JSON.parse(el('output').textContent ?? 'null');
            if (prior?.jobId === j?.id) {
                el('output').textContent = JSON.stringify(j, null, 2);
                if (!busy)
                    feedback(j.status === 'complete' ? 'Job complete. Your validated snapshot is ready to review.' : j.error ?? `Job ${j.status}.`, j.status === 'failed');
            }
        }
        catch { }
        renderReview(s.preparation);
        if (oldProtected !== protectedUsers.map(u => u.id).join(','))
            renderAccounts();
        button('prepare').disabled = selected.size === 0 || mode === 'history' || !!s.rateLimit || busy;
    }
    catch (e) {
        el('account-badge').textContent = 'Connection needed';
        el('setup-notice').textContent = e instanceof Error ? e.message : String(e);
        button('scan').disabled = true;
        showError(e);
    }
    finally {
        refreshing = false;
    }
}
async function invoke(name: ToolName, input: any, signal?: AbortSignal) { signal?.throwIfAborted(); const result = await send(name, input); try {
    signal?.throwIfAborted();
    show(result);
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
} }
(async () => { try {
    const available = await registerTools((document as any).modelContext, invoke, registration.signal);
    el('native').textContent = available ? 'Native WebMCP registered on this extension tab. Agent discovery/invocation depends on browser support.' : 'Native WebMCP unavailable. Manual controls remain available; use a browser exposing document.modelContext.registerTool().';
}
catch (e) {
    registration.abort();
    el('native').textContent = `WebMCP registration failed: ${e instanceof Error ? e.message : String(e)}. Manual controls remain available.`;
} await refresh(); })();
for (const [id, name] of [['scan', 'instagram_start_scan'], ['nonfollowers', 'instagram_get_nonfollowers'], ['compare', 'instagram_compare_snapshots']] as const)
    button(id).onclick = async () => { try {
        await invoke(name, {});
        await refresh();
    }
    catch (e) {
        showError(e);
    } };
button('refresh').onclick = refresh;
button('cancel').onclick = async () => { try {
    show(await send('instagram_cancel_scan', { jobId: current?.job?.id }));
    await refresh();
}
catch (e) {
    showError(e);
} };
button('pause').onclick = async () => { try {
    show(await send(current?.job?.status === 'paused' ? 'RESUME_SCAN' : 'PAUSE_SCAN'));
    await refresh();
}
catch (e) {
    showError(e);
} };
button('stop').onclick = async () => { try {
    show(await send('STOP_UNFOLLOW'));
    await refresh();
}
catch (e) {
    showError(e);
} };
button('prepare').onclick = async () => { try {
    const candidates = [...selected].map(([id, reason]) => ({ id, reason: reason.trim() }));
    if (candidates.some(c => c.reason.length < 10))
        throw new Error('Add a specific review reason of at least 10 characters for every selected account. Preserve ambiguous connections.');
    await invoke('instagram_prepare_unfollow', { candidates });
    el('review').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
catch (e) {
    showError(e);
} };
(el('search') as HTMLInputElement).oninput = () => { page = 0; renderAccounts(); };
button('previous').onclick = () => { page--; renderAccounts(); };
button('next').onclick = () => { page++; renderAccounts(); };
button('export').onclick = async () => { try {
    const s = await send('EXPORT_BASELINE');
    const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `instagram-baseline-${s.accountId}-${s.capturedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback('Baseline exported. Keep this personal file out of Git.');
}
catch (e) {
    showError(e);
} };
el('import').onchange = async (e) => { const input = e.target as HTMLInputElement; try {
    const file = input.files?.[0];
    if (!file)
        return;
    if (file.size > 20000000)
        throw new Error('Baseline exceeds 20 MB');
    show(await send('IMPORT_BASELINE', { snapshot: JSON.parse(await file.text()) }));
    await refresh();
}
catch (e) {
    showError(e);
}
finally {
    input.value = '';
} };
const timer = setInterval(() => { if (!document.hidden)
    void refresh(); }, 3000);
window.addEventListener('pagehide', () => { registration.abort(); clearInterval(timer); }, { once: true });
