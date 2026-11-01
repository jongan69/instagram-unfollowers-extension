/** Privileged isolated-world host. No window messages are accepted. */
import { collectPages, readJSON, wait, isId, Snapshot, nonfollowers, compareSnapshots, validateSnapshot } from '../core/scan';
import { prepare, authorize, mutateOne, Preparation } from '../core/cleanup';
import { trustedSender, validateInput, ToolName } from '../agent/tools';
import { getCookie } from '../utils/utils';
import { loadTimings, loadWhitelist } from '../utils/storage';
import { STORAGE_KEY } from '../messages';
interface Job {
    id: string;
    accountId: string;
    status: string;
    complete: boolean;
    startedAt: string;
    updatedAt: string;
    finishedAt?: string;
    phase: string;
    received: number;
    total: number;
    error?: string;
    recovery: string;
}
interface History {
    latest?: Snapshot;
    previous?: Snapshot;
}
const recovery = 'Keep the same Instagram account/tab open. After login, reload, interruption, or rate limit, retry a full scan later. The last complete baseline is preserved.';
const host = globalThis as typeof globalThis & {
    __iuHost?: boolean;
};
if (!host.__iuHost) {
    host.__iuHost = true;
    startHost();
}
function startHost() {
    let active: AbortController | undefined;
    let job: Job | undefined;
    let preparation: Preparation | undefined;
    let paused = false;
    let busy = false;
    const key = (id: string) => `iu_history_${id}`;
    const userId = () => { const id = getCookie('ds_user_id'); if (!isId(id))
        throw new Error('Not logged into Instagram. Log in and refresh the tab.'); return id; };
    const assertAccount = (id: string) => { if (userId() !== id)
        throw new Error('Instagram account changed. Discard this job and scan the new account.'); };
    const history = async (id: string): Promise<History> => { const h = (await chrome.storage.local.get(key(id)))[key(id)] ?? {}; if (h.latest)
        validateSnapshot(h.latest, id); if (h.previous)
        validateSnapshot(h.previous, id); return h; };
    async function progress(partial: Partial<Job>) { if (!job)
        return; job = { ...job, ...partial, updatedAt: new Date().toISOString() }; await chrome.storage.local.set({ iu_job: job }); }
    async function app(partial: any) { const s = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? {}; await chrome.storage.local.set({ [STORAGE_KEY]: { results: [], unfollowLog: [], selectedIds: [], filter: { showNonFollowers: true, showFollowers: false, showVerified: true, showPrivate: true, showWithOutProfilePicture: true }, currentTab: 'non_whitelisted', searchTerm: '', page: 1, ...s, ...partial } }); }
    async function profile(id: string, signal: AbortSignal) { assertAccount(id); const j = await readJSON(`https://www.instagram.com/api/v1/users/${id}/info/`, signal, { headers: { 'x-ig-app-id': '936619743392459' } }); const u = j.user; if (String(u?.pk) !== id || !Number.isSafeInteger(u.follower_count) || u.follower_count < 0 || !Number.isSafeInteger(u.following_count) || u.following_count < 0)
        throw new Error('Account/count validation unavailable; scan is inconclusive.'); return u; }
    async function scan(id: string, ac: AbortController) {
        try {
            const h = await history(id);
            const before = await profile(id, ac.signal);
            const timings = await loadTimings();
            const delay = Math.min(3600000, Math.max(1000, Number.isFinite(timings?.timeBetweenSearchCycles) ? timings!.timeBetweenSearchCycles : 1000));
            const lists: Record<string, any> = {};
            for (const phase of ['followers', 'following']) {
                await progress({ phase, received: 0, total: phase === 'followers' ? before.follower_count : before.following_count });
                const hash = phase === 'following' ? '3dec7e2c57367ef3da3d987d89f9dbc8' : 'c76146de99bb02f6415203be841dd25a';
                const field = phase === 'following' ? 'edge_follow' : 'edge_followed_by';
                lists[phase] = await collectPages(async (cursor) => {
                    assertAccount(id);
                    while (paused)
                        await wait(250, ac.signal);
                    const variables = { id, include_reel: true, fetch_mutual: false, first: 24, ...(cursor ? { after: cursor } : {}) };
                    const json = await readJSON(`https://www.instagram.com/graphql/query/?query_hash=${hash}&variables=${encodeURIComponent(JSON.stringify(variables))}`, ac.signal);
                    return json.data?.user?.[field];
                }, ac.signal, async (received, total) => { assertAccount(id); await progress({ received, total }); await app({ percentage: Math.min(99, Math.round(received / Math.max(total, 1) * 50) + (phase === 'following' ? 50 : 0)) }); }, delay, Math.min(3600000, Number.isFinite(timings?.timeToWaitAfterFiveSearchCycles) ? timings!.timeToWaitAfterFiveSearchCycles : 10000));
            }
            const after = await profile(id, ac.signal);
            ac.signal.throwIfAborted();
            assertAccount(id);
            if (before.follower_count !== after.follower_count || before.following_count !== after.following_count || lists.followers.length !== after.follower_count || lists.following.length !== after.following_count)
                throw new Error('Account counts changed or disagree with scan. Retry a complete scan.');
            const latest: Snapshot = { schemaVersion: 1, accountId: id, capturedAt: new Date().toISOString(), complete: true, followers: lists.followers, following: lists.following };
            // One storage write publishes both validated lists atomically. Never publish partials.
            await chrome.storage.local.set({ [key(id)]: { latest, previous: h.latest ?? h.previous } });
            await progress({ status: 'complete', complete: true, finishedAt: new Date().toISOString() });
            const followerIds = new Set(latest.followers.map(u => u.id));
            await app({ status: 'scanning_done', percentage: 100, error: undefined, accountId: id, results: latest.following.map(u => ({ ...u, follows_viewer: followerIds.has(u.id), followed_by_viewer: true, is_private: u.is_private ?? false, is_verified: u.is_verified ?? false })) });
        }
        catch (e) {
            await progress({ status: ac.signal.aborted ? 'cancelled' : 'failed', complete: false, error: e instanceof Error ? e.message : String(e), finishedAt: new Date().toISOString() });
            await app({ status: 'idle', error: job?.error });
        }
        finally {
            active = undefined;
            busy = false;
        }
    }
    async function execute(p: Preparation, ac: AbortController) {
        const log: any[] = [];
        try {
            const timings = await loadTimings();
            const delay = Math.min(3600000, Math.max(4000, Number.isFinite(timings?.timeBetweenUnfollows) ? timings!.timeBetweenUnfollows : 4000));
            for (const [i, u] of p.users.entries()) {
                assertAccount(p.accountId);
                ac.signal.throwIfAborted();
                if ((await loadWhitelist()).some(w => w.id === u.id))
                    throw new Error('Account was whitelisted; stopped.');
                const relationship = async (id: string) => { assertAccount(p.accountId); const j = await readJSON(`https://www.instagram.com/api/v1/friendships/show/${id}/`, ac.signal, { headers: { 'x-ig-app-id': '936619743392459' } }); const r = j.friendship_status ?? j; if (typeof r.following !== 'boolean' || typeof r.followed_by !== 'boolean')
                    throw new Error('Relationship unavailable or inconclusive'); return r; };
                await mutateOne(u.id, relationship, async (id) => { assertAccount(p.accountId); const csrf = getCookie('csrftoken'); if (!csrf)
                    throw new Error('Missing login/CSRF token'); await readJSON(`https://www.instagram.com/web/friendships/${id}/unfollow/`, ac.signal, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrftoken': csrf } }); });
                log.push({ user: u, unfollowedSuccessfully: true });
                await progress({ received: i + 1, total: p.users.length });
                await app({ status: 'unfollowing', unfollowLog: log, percentage: Math.round((i + 1) / p.users.length * 100) });
                if (i < p.users.length - 1) {
                    await wait(delay, ac.signal);
                    if ((i + 1) % 5 === 0)
                        await wait(Math.min(3600000, Math.max(300000, Number.isFinite(timings?.timeToWaitAfterFiveUnfollows) ? timings!.timeToWaitAfterFiveUnfollows : 300000)), ac.signal);
                }
            }
            await progress({ status: 'complete', complete: true, finishedAt: new Date().toISOString() });
            await app({ status: 'done' });
        }
        catch (e) {
            await progress({ status: ac.signal.aborted ? 'cancelled' : 'failed', complete: false, error: e instanceof Error ? e.message : String(e), finishedAt: new Date().toISOString() });
            await app({ status: 'idle', error: job?.error, unfollowLog: log });
        }
        finally {
            active = undefined;
            busy = false;
        }
    }
    async function command(message: any) {
        if (!message || typeof message !== 'object' || Array.isArray(message))
            throw new Error('Malformed message');
        if (Object.keys(message).some(k => !['type', 'input'].includes(k)) || typeof message.type !== 'string')
            throw new Error('Malformed command envelope');
        const { type, input = {} } = message;
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('Malformed command input');
        if (!type.startsWith('instagram_')) {
            const keys = type === 'IMPORT_BASELINE' ? ['snapshot'] : type === 'APPROVE_PREPARATION' ? ['preparationId'] : [];
            if (Object.keys(input).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(input, k)))
                throw new Error('Invalid command input');
        }
        if (type === 'GET_STATUS' || type === 'instagram_get_status') {
            if (type.startsWith('instagram_'))
                validateInput(type, input);
            const id = getCookie('ds_user_id');
            const h = isId(id) ? await history(id) : {};
            const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
            if (stored?.accountId !== id) {
                if (stored?.results?.length && !stored.accountId && !(await chrome.storage.local.get('iu_legacy_app_state')).iu_legacy_app_state)
                    await chrome.storage.local.set({ iu_legacy_app_state: stored });
                const ids = new Set(h.latest?.followers.map(u => u.id) ?? []);
                await app({ accountId: id, status: active ? 'scanning' : h.latest ? 'scanning_done' : 'idle', percentage: h.latest ? 100 : 0, results: h.latest?.following.map(u => ({ ...u, follows_viewer: ids.has(u.id), followed_by_viewer: true, is_private: u.is_private ?? false, is_verified: u.is_verified ?? false })) ?? [], selectedIds: [], unfollowLog: [] });
            }
            return { accountId: isId(id) ? id : null, login: isId(id) ? 'cookie present; validated during scan' : 'logged out', job: job ?? null, latestAt: h.latest?.capturedAt ?? null, baselineAt: h.previous?.capturedAt ?? null, firstScanEstablishesHistory: !h.previous, preparation: preparation ?? null, recovery };
        }
        if (type === 'PING')
            return { alive: true, job: job ?? null };
        if (type === 'STOP_UNFOLLOW' || type === 'instagram_cancel_scan') {
            if (type.startsWith('instagram_')) {
                validateInput(type, input);
                if (!job || job.id !== input.jobId || job.phase === 'unfollow')
                    throw new Error('Scan job not found');
            }
            active?.abort(new Error('Cancelled by user'));
            paused = false;
            return { jobId: job?.id, status: active ? 'cancelling' : 'not running', recovery };
        }
        if (type === 'PAUSE_SCAN' || type === 'RESUME_SCAN') {
            if (!active || !job || job.phase === 'unfollow') throw new Error('No active scan to pause/resume');
            paused = type === 'PAUSE_SCAN';
            await progress({status:paused?'paused':'running'});
            await app({status:paused?'paused':'scanning'});
            return { success: true };
        }
        if (type.startsWith('instagram_'))
            validateInput(type as ToolName, input);
        const id = userId();
        if (type === 'START_SCAN' || type === 'instagram_start_scan') {
            if (busy)
                throw new Error('A job is already active');
            busy = true;
            paused = false;
            preparation = undefined;
            const ac = new AbortController();
            active = ac;
            job = { id: crypto.randomUUID(), accountId: id, status: 'running', complete: false, phase: 'starting', received: 0, total: 0, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recovery };
            try {
                await progress({});
                await app({ status: 'scanning', percentage: 0, error: undefined });
            }
            catch (e) {
                active = undefined;
                busy = false;
                throw e;
            }
            void scan(id, ac);
            return { jobId: job.id, status: 'running', recovery };
        }
        if (type === 'instagram_get_scan_status') {
            if (!job || input.jobId !== job.id)
                throw new Error('Job not found or interrupted by reload. Start a new complete scan.');
            return job;
        }
        const h = await history(id);
        if (type === 'EXPORT_BASELINE') {
            if (!h.latest && !h.previous)
                throw new Error('No complete snapshot to export');
            return h.latest ?? h.previous;
        }
        if (type === 'IMPORT_BASELINE') {
            if (busy)
                throw new Error('Cancel/wait for the active job before importing');
            const snapshot = validateSnapshot(input.snapshot, id);
            if (h.latest && Date.parse(snapshot.capturedAt) >= Date.parse(h.latest.capturedAt))
                throw new Error('Imported baseline must precede the latest scan');
            await chrome.storage.local.set({ [key(id)]: h.latest ? { ...h, previous: snapshot } : { previous: snapshot } });
            preparation = undefined;
            return { success: true };
        }
        if (type === 'APPROVE_PREPARATION') {
            if (busy || !preparation || input.preparationId !== preparation.id || preparation.consumed || Date.now() - Date.parse(preparation.createdAt) > 600000 || preparation.accountId !== id || preparation.snapshotAt !== h.latest?.capturedAt)
                throw new Error('Preparation changed or expired; prepare again');
            preparation = { ...preparation, approvedAt: new Date().toISOString() };
            return { approved: true, preparationId: preparation.id };
        }
        if (!h.latest)
            throw new Error('No complete scan. Run the first complete scan to establish history.');
        if (type === 'instagram_get_nonfollowers')
            return { capturedAt: h.latest.capturedAt, complete: true, accounts: nonfollowers(h.latest), interpretation: 'Currently not following back in this snapshot; not evidence of a historical unfollow.' };
        if (type === 'instagram_compare_snapshots') {
            if (!h.previous)
                throw new Error('First complete scan establishes history. Import an earlier complete baseline or scan again later.');
            return compareSnapshots(h.previous, h.latest);
        }
        if (type === 'instagram_prepare_unfollow') {
            if (busy)
                throw new Error('Wait for the active job');
            preparation = prepare(h.latest, input.candidates, (await loadWhitelist()).map(u => u.id));
            return { ...preparation, recovery: 'Review exact IDs, usernames and evidence in the extension Agent / Review tab. Approval expires after five minutes and is single-use.' };
        }
        if (type === 'instagram_execute_unfollow') {
            if (busy)
                throw new Error('A job is already active');
            preparation = authorize(preparation, input.preparationId, id, h.latest.capturedAt);
            busy = true;
            const ac = new AbortController();
            active = ac;
            job = { id: crypto.randomUUID(), accountId: id, status: 'running', complete: false, phase: 'unfollow', received: 0, total: preparation.users.length, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), recovery: 'On interruption, inspect Instagram results and prepare a new list; never automatically replay mutations.' };
            try {
                await progress({});
            }
            catch (e) {
                busy = false;
                active = undefined;
                throw e;
            }
            void execute(preparation, ac);
            return { jobId: job.id, status: 'running' };
        }
        if (type === 'START_UNFOLLOW')
            throw new Error('Direct unfollow disabled. Prepare and approve an exact list in Agent / Review.');
        throw new Error('Unknown command');
    }
    let queue = Promise.resolve();
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (!trustedSender(sender, chrome.runtime.id) && !(sender.id === chrome.runtime.id && (sender.url === chrome.runtime.getURL('service-worker.js') || (!sender.url && !sender.tab))))
            return false;
        // Serialize command acceptance, not job execution: prevent duplicate starts and approvals.
        queue = queue.then(async () => { try {
            respond(await command(message));
        }
        catch (e) {
            respond({ error: e instanceof Error ? e.message : String(e), recovery });
        } });
        return true;
    });
}
