/** Web request conventions adapted from davidarroyo1234/InstagramUnfollowers (MIT).
 * See THIRD_PARTY_NOTICES.md. No session secrets are persisted or returned by tools.
 */
import { account, Account, isId } from './scan';
export type ListKind = 'followers' | 'following';
export const WEB_APP_ID = '936619743392459';
export const ASBD_ID = '129477';
export const UNFOLLOW_DOC_ID = '27789106940691111';
export const UNFOLLOW_NAME = 'usePolarisUnfollowMutation';
export function webHeaders(csrf: string | null): Record<string, string> {
    return { 'X-IG-App-ID': WEB_APP_ID, 'X-ASBD-ID': ASBD_ID, 'X-Requested-With': 'XMLHttpRequest', 'Accept': '*/*', ...(csrf ? { 'X-CSRFToken': csrf } : {}) };
}
export function listURL(id: string, kind: ListKind, cursor?: string): string {
    if (!isId(id) || !['followers', 'following'].includes(kind))
        throw new Error('Invalid account or relationship list');
    const q = new URLSearchParams({ count: '50' });
    if (cursor !== undefined)
        q.set('max_id', cursor);
    return `https://www.instagram.com/api/v1/friendships/${id}/${kind}/?${q}`;
}
export function rawAccount(raw: any): Account {
    const id = raw?.pk_id ?? raw?.pk ?? raw?.id;
    if (typeof id === 'number' && !Number.isSafeInteger(id))
        throw new Error('Unsafe numeric account ID');
    return account({ ...raw, id: typeof id === 'number' ? String(id) : id });
}
export function restPage(raw: any, expected: number) {
    if (!raw || !Array.isArray(raw.users) || !Number.isSafeInteger(expected) || expected < 0)
        throw new Error('Incomplete REST response: missing users or expected count');
    if (raw.has_more !== undefined && typeof raw.has_more !== 'boolean')
        throw new Error('Malformed REST has_more');
    if (raw.next_max_id !== undefined && raw.next_max_id !== null && typeof raw.next_max_id !== 'string')
        throw new Error('Malformed REST cursor');
    const cursor = raw.next_max_id || undefined;
    if (cursor && raw.has_more === false)
        throw new Error('Contradictory REST pagination');
    // A missing terminal cursor is allowed only when collectPages reaches the exact independent count.
    return { count: expected, edges: raw.users.map((u: any) => ({ node: rawAccount(u) })), page_info: { has_next_page: !!cursor, end_cursor: cursor ?? null } };
}
export interface ProfileCounts {
    username: string;
    followers: number;
    following: number;
    url: string;
}
export function exactCount(text: string): number {
    const normalized = text.trim();
    if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(normalized))
        throw new Error('Profile counts must be exact integers; abbreviated counts cannot validate completeness');
    const n = Number(normalized.replace(/,/g, ''));
    if (!Number.isSafeInteger(n) || n < 0)
        throw new Error('Invalid profile count');
    return n;
}
export function ownProfile(doc: Document, path: string): ProfileCounts {
    const username = /^\/([A-Za-z0-9_.]{1,30})\/?$/.exec(path)?.[1];
    const main = doc.querySelector('main');
    if (!username || !main?.querySelector('a[href="/accounts/edit/"]') || main.querySelector('h2')?.textContent?.trim() !== username)
        throw new Error('Open your own Instagram profile, refresh it, and keep that profile open during the scan. Exact profile counts are required to reject partial lists.');
    const counts: Partial<Record<ListKind, number>> = {};
    for (const a of Array.from(main.querySelectorAll('a'))) {
        const text = a.textContent?.trim() ?? '';
        const match = /^(.+?)\s*(followers|following)$/i.exec(text);
        if (match) {
            const kind = match[2].toLowerCase() as ListKind;
            const value = exactCount(a.querySelector?.('[title]')?.getAttribute('title') ?? match[1]);
            if (counts[kind] !== undefined && counts[kind] !== value)
                throw new Error('Conflicting profile counts');
            counts[kind] = value;
        }
    }
    if (counts.followers === undefined || counts.following === undefined)
        throw new Error('Exact follower/following counts are unavailable. Refresh your own profile; abbreviated counts or unsupported page layouts cannot establish a complete scan.');
    return { username, followers: counts.followers, following: counts.following, url: `https://www.instagram.com/${username}/` };
}
export function sessionTokens(html: string) {
    const fbDtsg = /"DTSGInitialData",\[\],\{"token":"([^"\\]+)"/.exec(html)?.[1] ?? /"dtsg":\{"token":"([^"\\]+)"/.exec(html)?.[1];
    const lsd = /"LSD",\[\],\{"token":"([^"\\]+)"/.exec(html)?.[1];
    if (!fbDtsg || !lsd)
        throw new Error('Instagram write-session tokens are unavailable. Refresh your profile and prepare a new list; no unfollow was sent.');
    return { fbDtsg, lsd, revision: /"client_revision":(\d+)/.exec(html)?.[1] };
}
export function unfollowRequest(viewerId: string, targetId: string, html: string, csrf: string) {
    if (!isId(viewerId) || !isId(targetId) || !csrf)
        throw new Error('Invalid mutation identity or login');
    const t = sessionTokens(html);
    let sum = 0;
    for (let i = 0; i < t.fbDtsg.length; i++)
        sum += t.fbDtsg.charCodeAt(i);
    const body = new URLSearchParams({ av: viewerId, __d: 'www', __user: '0', __a: '1', __comet_req: '7', fb_dtsg: t.fbDtsg, jazoest: `2${sum}`, lsd: t.lsd, fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: UNFOLLOW_NAME, variables: JSON.stringify({ target_user_id: targetId, container_module: 'profile', nav_chain: 'PolarisProfilePostsTabRoot:profilePage:1:via_cold_start' }), server_timestamps: 'true', doc_id: UNFOLLOW_DOC_ID, ...(t.revision ? { __rev: t.revision, __spin_r: t.revision } : {}) });
    return { url: 'https://www.instagram.com/api/graphql', init: { method: 'POST', headers: { ...webHeaders(csrf), 'Content-Type': 'application/x-www-form-urlencoded', 'X-FB-Friendly-Name': UNFOLLOW_NAME, 'X-FB-LSD': t.lsd }, body: body.toString() } as RequestInit };
}
export function batchRelationship(json: any, id: string): {
    following: boolean;
    followed_by: boolean;
} {
    const r = json?.friendship_statuses?.[id];
    if (typeof r?.following !== 'boolean' || typeof r.followed_by !== 'boolean')
        throw new Error('Relationship unavailable or inconclusive; no mutation allowed');
    return { following: r.following, followed_by: r.followed_by };
}
