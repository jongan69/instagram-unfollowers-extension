/** Diagnostics deliberately omit cookies, tokens, query arguments and response bodies. */
export interface RequestDiagnostic {
    code: string;
    endpoint: string;
    httpStatus?: number;
    retryAfterSeconds?: number;
}
export class InstagramRequestError extends Error {
    constructor(message: string, readonly diagnostic: RequestDiagnostic) {
        super(message);
        this.name = 'InstagramRequestError';
    }
}
export function endpointLabel(url: string): string {
    try {
        const path = new URL(url).pathname;
        return path.replace(/\/\d+(?=\/|$)/g, '/:id');
    }
    catch {
        return 'unknown';
    }
}
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
    if (!value)
        return undefined;
    const seconds = /^\d+$/.test(value.trim()) ? Number(value) : (Date.parse(value) - now) / 1000;
    return Number.isFinite(seconds) && seconds >= 0 && seconds <= (8640000000000000-now)/1000 ? Math.ceil(seconds) : undefined;
}
export const LOCAL_COOLDOWN_MS = 15 * 60 * 1000;
export function cooldownUntil(diagnostic: RequestDiagnostic, now = Date.now()): number {
    return now + Math.max(LOCAL_COOLDOWN_MS, (diagnostic.retryAfterSeconds ?? 0) * 1000);
}
