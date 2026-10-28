/** Generate an ID in secure and non-secure browser contexts (including LAN HTTP). */
export function uid() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    if (cryptoApi?.getRandomValues) {
        const values = new Uint32Array(4);
        cryptoApi.getRandomValues(values);
        return Array.from(values, (value) => value.toString(36)).join('-');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
