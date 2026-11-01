import { Account, Snapshot, nonfollowers } from './scan';
export interface Preparation {
    id: string;
    accountId: string;
    snapshotAt: string;
    createdAt: string;
    users: (Account & {
        reason: string;
    })[];
    approvedAt?: string;
    consumed?: boolean;
}
export function prepare(snapshot: Snapshot, candidates: {
    id: string;
    reason: string;
}[], protectedIds: string[], now = Date.now()): Preparation {
    const available = new Map(nonfollowers(snapshot).map(u => [u.id, u]));
    if (now - Date.parse(snapshot.capturedAt) > 24 * 60 * 60 * 1000)
        throw new Error('Scan is older than 24 hours. Run a fresh complete scan first.');
    const users = candidates.map(c => { const u = available.get(c.id); if (!u || protectedIds.includes(c.id))
        throw new Error('Candidate is not a confirmed nonfollower or is whitelisted'); return { ...u, reason: c.reason }; });
    return { id: crypto.randomUUID(), accountId: snapshot.accountId, snapshotAt: snapshot.capturedAt, createdAt: new Date(now).toISOString(), users };
}
export function authorize(p: Preparation | undefined, id: string, accountId: string, snapshotAt: string, now = Date.now()): Preparation {
    if (!p || p.id !== id || p.accountId !== accountId || p.snapshotAt !== snapshotAt || !p.approvedAt || p.consumed || now - Date.parse(p.createdAt) > 10 * 60 * 1000 || now - Date.parse(p.approvedAt) > 5 * 60 * 1000)
        throw new Error('Approval absent, expired, already used, or list/account changed. Review and approve this exact list in the extension.');
    return { ...p, consumed: true };
}
export async function mutateOne(id: string, relationship: (id: string) => Promise<{
    following: boolean;
    followed_by: boolean;
}>, post: (id: string) => Promise<void>): Promise<void> {
    const before = await relationship(id);
    if (before.following !== true || before.followed_by !== false)
        throw new Error('Relationship changed or is inconclusive; stopped without unfollowing this account.');
    await post(id);
    const after = await relationship(id);
    if (after.following !== false)
        throw new Error('Unfollow result is unverified; stopped. Inspect Instagram before retrying.');
}
