export async function send(type: string, input: unknown = {}): Promise<any> {
    const result = await chrome.runtime.sendMessage({ type, input });
    if (!result)
        throw new Error('Extension host unavailable. Reload the extension and Instagram.');
    if (result.error)
        throw new Error(result.error);
    return result;
}
