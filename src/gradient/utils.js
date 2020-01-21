const cacheKey = 'lab.gradient.colorList';
export function clearCache() {
    localStorage.removeItem(cacheKey);
}
export function setCache(value) {
    localStorage.setItem(cacheKey, JSON.stringify(value));
}
export function getCache(defaultValue) {
    try {
        const list = JSON.parse(localStorage.getItem(cacheKey));
        return Array.isArray(list) ? list : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}
