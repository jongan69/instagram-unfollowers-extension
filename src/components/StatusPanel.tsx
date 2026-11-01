import React, { useEffect, useState } from 'react';
import { send } from '../agent/client';
export function StatusPanel({ error }: {
    error?: string;
}) {
    const [status, setStatus] = useState('Checking Instagram…');
    useEffect(() => {
        let live = true; let inFlight=false;
        const refresh = async () => {
            if(inFlight)return;inFlight=true;
            try {
                const s = await send('instagram_get_status');
                if (live)
                    setStatus(`Account: ${s.accountId ?? 'logged out'} · Scan: ${s.job?.status ?? s.lastJob?.status ?? 'idle'} ${s.rateLimit ? ` · Local cooldown until ${new Date(s.rateLimit.until).toLocaleString()}` : ''} · Latest: ${s.latestAt ?? 'none'} · Baseline: ${s.baselineAt ?? 'first complete scan establishes history'}`);
            }
            catch (e) {
                if (live)
                    setStatus(e instanceof Error ? e.message : String(e));
            } finally {inFlight=false}
        };
        void refresh();
        const t = setInterval(refresh, 5000);
        return () => { live = false; clearInterval(t); };
    }, []);
    return <section style={{ padding: 12, fontSize: 12 }} aria-label="Extension status"><div>{status}</div>{error && <div role="alert" style={{ color: '#fca5a5' }}>{error}</div>}<p>Native WebMCP availability is checked in Agent / Review. A browser exposing document.modelContext is required.</p><button className="btn btn-secondary" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('agent.html') })}>Open Agent / Review</button></section>;
}
