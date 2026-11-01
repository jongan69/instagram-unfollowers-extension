import { trustedSender, descriptions, validateInput, ToolName } from '../agent/tools';
import { STORAGE_KEY } from '../messages';
/** The worker pins one Instagram tab. Jobs live in its isolated content host, surviving popup/worker closure. */
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!trustedSender(sender, chrome.runtime.id))
        return false;
    queue = queue.then(async () => {
        try {
            if (!message || Object.keys(message).some(k => !['type', 'input'].includes(k)) || typeof message.type !== 'string')
                throw new Error('Malformed command envelope');
            const allowed = [...Object.keys(descriptions), 'GET_STATUS', 'START_SCAN', 'PAUSE_SCAN', 'RESUME_SCAN', 'STOP_UNFOLLOW', 'EXPORT_BASELINE', 'IMPORT_BASELINE', 'APPROVE_PREPARATION'];
            if (!allowed.includes(message.type))
                throw new Error('Unsupported command');
            if (Object.hasOwn(descriptions, message.type))
                validateInput(message.type as ToolName, message.input);
            let tabId = (await chrome.storage.local.get('iu_host_tab')).iu_host_tab as number | undefined;
            let alive: any;
            if (tabId !== undefined) {
                try {
                    alive = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
                }
                catch { /* closed or navigated */ }
            }
            const saved = (await chrome.storage.local.get('iu_job')).iu_job;
            if ((saved?.status === 'running' || saved?.status === 'paused') && (!alive?.job || alive.job.id !== saved.id)) {
                const error = 'Job interrupted by tab reload, closure, or extension restart. Start a new complete scan; history is preserved. Mutation results may be unknown; inspect Instagram before retrying.';
                const old = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? {};
                await chrome.storage.local.set({ iu_job: { ...saved, status: 'interrupted', complete: false, error, finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, [STORAGE_KEY]: { ...old, status: 'idle', error } });
            }
            if (!alive?.alive) {
                const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
                const tab = tabs.find(t => t.active) ?? tabs[0];
                if (!tab?.id)
                    throw new Error('Open https://www.instagram.com, log in, and refresh it.');
                tabId = tab.id;
                try {
                    alive = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
                }
                catch {
                    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'], world: 'ISOLATED' });
                    alive = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
                }
                if (!alive?.alive)
                    throw new Error('Refresh Instagram to reconnect the extension');
                await chrome.storage.local.set({ iu_host_tab: tabId });
            }
            const result = await chrome.tabs.sendMessage(tabId!, message);
            if (message.type === 'GET_STATUS' || message.type === 'instagram_get_status') {
                result.lastJob = (await chrome.storage.local.get('iu_job')).iu_job ?? null;
            }
            respond(result);
        }
        catch (e) {
            respond({ error: e instanceof Error ? e.message : String(e), recovery: 'Open Instagram, log in, refresh the page, and retry. Complete local history is preserved.' });
        }
    });
    return true;
});
