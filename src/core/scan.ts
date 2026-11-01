import { InstagramRequestError, endpointLabel, retryAfterSeconds } from './instagram-error';
/** Fail closed: a list is publishable only after every page and count agree. */
export interface Account {
    id: string;
    username: string;
    full_name: string;
    profile_pic_url: string;
    is_private?: boolean;
    is_verified?: boolean;
}
export interface Snapshot {
    schemaVersion: 1;
    accountId: string;
    capturedAt: string;
    complete: true;
    followers: Account[];
    following: Account[];
}
export const isId = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,29}$/.test(v);
export function account(value: any): Account {
    if (!value || !isId(value.id) || typeof value.username !== 'string' || !/^[\w.]{1,30}$/.test(value.username))
        throw new Error('Malformed account');
    return { ...(typeof value.is_private === 'boolean' ? { is_private: value.is_private } : {}), ...(typeof value.is_verified === 'boolean' ? { is_verified: value.is_verified } : {}), id: value.id, username: value.username, full_name: typeof value.full_name === 'string' ? value.full_name.slice(0, 200) : '', profile_pic_url: typeof value.profile_pic_url === 'string' && value.profile_pic_url.startsWith('https://') ? value.profile_pic_url : '' };
}
export function wait(ms: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(signal.reason); }; const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms); signal.addEventListener('abort', abort, { once: true }); });
}
export async function readJSON(url: string, signal: AbortSignal, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<any> {
    const ac = new AbortController();
    const abort = () => ac.abort(signal.reason);
    signal.throwIfAborted();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => ac.abort(new Error('Request stalled (30 seconds). Retry later.')), 30000);
    try {
        const response = await fetcher(url, { ...init, credentials: 'include', signal: ac.signal });
        if (!response.ok) {
            const endpoint = endpointLabel(url);
            const retry = retryAfterSeconds(response.headers?.get('Retry-After') ?? null);
            throw new InstagramRequestError(response.status === 429
                ? `Rate limited (HTTP 429) at ${endpoint}. No automatic retry. This response alone does not establish whether the restriction is endpoint-, account-, session-, or IP-specific.`
                : `Instagram HTTP ${response.status} at ${endpoint}; relationship is inconclusive.`, { code: response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR', endpoint, httpStatus: response.status, ...(retry !== undefined ? { retryAfterSeconds: retry } : {}) });
        }
        if (typeof response.url === 'string' && /\/(accounts\/login|challenge|checkpoint)(?:\/|\?)/.test(response.url))
            throw new InstagramRequestError('Instagram requires login or account verification. Stop and complete it in Instagram.', { code: 'AUTH_REQUIRED', endpoint: endpointLabel(url), httpStatus: response.status });
        let json: any;
        try {
            json = await response.json();
        }
        catch {
            throw new InstagramRequestError('Instagram returned a non-JSON API response. Check login and endpoint compatibility.', { code: 'NON_JSON_RESPONSE', endpoint: endpointLabel(url), httpStatus: response.status });
        }
        if (json && (['rate_limit_error', 'rate_limit', 'feedback_required'].includes(json.error_type) || /please wait a few minutes|try again later|rate limit/i.test(typeof json.message === 'string' ? json.message : '')))
            throw new InstagramRequestError('Instagram returned a rate-limit or feedback restriction. No automatic retry.', { code: 'RATE_LIMITED', endpoint: endpointLabel(url), httpStatus: response.status });
        if (!json || json.errors || (json.status && json.status !== 'ok') || json.message)
            throw new InstagramRequestError('Instagram rejected the request; log in or retry later.', { code: 'API_REJECTED', endpoint: endpointLabel(url) });
        return json;
    }
    finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
    }
}
export async function collectPages(getPage: (cursor?: string) => Promise<any>, signal: AbortSignal, progress: (n: number, total: number) => Promise<void> = async () => { }, delay = 1000, cooldown = 10000): Promise<Account[]> {
    const users = new Map<string, Account>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let expected: number | undefined;
    for (let page = 0; page < 10000; page++) {
        signal.throwIfAborted();
        const data = await getPage(cursor);
        signal.throwIfAborted();
        if (!data || !Number.isSafeInteger(data.count) || data.count < 0 || !Array.isArray(data.edges) || typeof data.page_info?.has_next_page !== 'boolean')
            throw new Error('Malformed pagination response');
        if (expected === undefined)
            expected = data.count as number;
        if (data.count !== expected)
            throw new Error('Count changed during scan; retry a complete scan.');
        const before = users.size;
        for (const edge of data.edges) {
            const user = account(edge?.node);
            const old = users.get(user.id);
            if (old && old.username !== user.username)
                throw new Error('Account changed during scan');
            users.set(user.id, user);
        }
        const next = data.page_info.has_next_page;
        if (users.size > expected || (expected > 0 && data.edges.length === 0) || (next && users.size === before))
            throw new Error('Incomplete or stalled scan: empty/repeated edges');
        await progress(users.size, expected);
        if (!next) {
            if (users.size !== expected)
                throw new Error('Incomplete scan: unique account count differs');
            return [...users.values()];
        }
        const end = data.page_info.end_cursor;
        if (typeof end !== 'string' || !end || end.length > 4096 || cursors.has(end) || users.size >= expected)
            throw new Error('Invalid or repeated pagination cursor');
        cursors.add(end);
        cursor = end;
        await wait(delay, signal);
        if ((page + 1) % 5 === 0)
            await wait(Math.max(delay, cooldown, 10000), signal);
    }
    throw new Error('Pagination safety limit exceeded');
}
export function validateSnapshot(raw: any, accountId: string): Snapshot {
    if (!raw || Object.keys(raw).sort().join(',') !== 'accountId,capturedAt,complete,followers,following,schemaVersion' || raw.schemaVersion !== 1 || raw.complete !== true || !isId(accountId) || raw.accountId !== accountId || typeof raw.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw.capturedAt) || !Number.isFinite(Date.parse(raw.capturedAt)) || Date.parse(raw.capturedAt) > Date.now() + 60000 || new Date(raw.capturedAt).toISOString().replace('.000Z', 'Z') !== raw.capturedAt.replace('.000Z', 'Z'))
        throw new Error('Invalid baseline schema, timestamp, or account. Import a complete snapshot for the logged-in stable account ID.');
    for (const key of ['followers', 'following']) {
        if (!Array.isArray(raw[key]) || raw[key].length > 1000000)
            throw new Error('Invalid baseline list');
        const ids = new Set();
        for (const item of raw[key]) {
            account(item);
            if (Object.keys(item).some(k => !['id', 'username', 'full_name', 'profile_pic_url', 'is_private', 'is_verified'].includes(k)) || ('is_private' in item && typeof item.is_private !== 'boolean') || ('is_verified' in item && typeof item.is_verified !== 'boolean') || typeof item.full_name !== 'string' || item.full_name.length > 200 || typeof item.profile_pic_url !== 'string' || (item.profile_pic_url !== '' && !item.profile_pic_url.startsWith('https://')))
                throw new Error('Invalid baseline account schema');
            if (ids.has(item.id))
                throw new Error('Duplicate baseline account ID');
            ids.add(item.id);
        }
    }
    return { ...raw, followers: raw.followers.map(account), following: raw.following.map(account) };
}
export function compareSnapshots(before: Snapshot, now: Snapshot) {
    validateSnapshot(before, now.accountId);
    validateSnapshot(now, now.accountId);
    if (Date.parse(before.capturedAt) >= Date.parse(now.capturedAt))
        throw new Error('Baseline must precede current complete scan');
    const ids = new Set(now.followers.map(u => u.id));
    return { baselineAt: before.capturedAt, currentAt: now.capturedAt, absentFollowers: before.followers.filter(u => !ids.has(u.id)), interpretation: 'Absent from a later complete follower snapshot. Cause is inconclusive: unfollow, deactivation, removal, or unavailability. A rename alone is not an unfollow.' };
}
export function nonfollowers(snapshot: Snapshot): Account[] { validateSnapshot(snapshot, snapshot.accountId); const ids = new Set(snapshot.followers.map(u => u.id)); return snapshot.following.filter(u => !ids.has(u.id)); }
