import React, { useEffect, useState } from 'react';
import { send } from '../agent/client';
export function StatusPanel({ error }: {
    error?: string;
}) {
    const [data, setData] = useState<any>(null);
    const [connectionError, setConnectionError] = useState('');
    useEffect(() => { let live = true, pending = false; const refresh = async () => { if (pending)
        return; pending = true; try {
        const s = await send('instagram_get_status');
        if (live) {
            setData(s);
            setConnectionError('');
        }
    }
    catch (e) {
        if (live)
            setConnectionError(e instanceof Error ? e.message : String(e));
    }
    finally {
        pending = false;
    } }; void refresh(); const timer = setInterval(refresh, 5000); return () => { live = false; clearInterval(timer); }; }, []);
    const job = data?.job ?? data?.lastJob;
    return <section className="connection-panel" aria-label="Extension status">
  <div className="connection-title"><strong>{data?.profile?.username ? `@${data.profile.username}` : data?.accountId ? 'Instagram connected' : 'Connect Instagram'}</strong><span>{job?.status ?? 'Ready'}</span></div>
  <div className="connection-meta">{data?.latestAt ? `Complete snapshot · ${new Date(data.latestAt).toLocaleString()}` : 'No complete snapshot yet · your first scan establishes history'}</div>
  {job && ['running', 'paused'].includes(job.status) && <div className="connection-meta">{job.phase} · {job.received} / {job.total || '…'} accounts</div>}
  {data?.rateLimit && <div className="connection-error">Local cooldown until {new Date(data.rateLimit.until).toLocaleString()}. Instagram may require more time.</div>}
  {(!data?.profile?.ready) && <div className="connection-meta">Open your own profile in Instagram and keep it open for exact-count validation.</div>}
  {(connectionError || error) && <div role="alert" className="connection-error">{connectionError || error}</div>}
  <button className="btn btn-secondary" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('agent.html') })}>Open Agent / Review</button>
 </section>;
}
