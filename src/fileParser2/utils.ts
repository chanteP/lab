export function genColorFromString(text: string) {
    return text.split('').reduce((d, s) => (d += s.charCodeAt(0)), 0);
}

const colorCache: Map<string, number> = new Map();
export function getHSLColor(text?: string, random = false) {
    let color: string | undefined = undefined;

    if (text) {
        let hue = genColorFromString(text);
        if (random) {
            hue = (colorCache.get(text) ?? hue) + 20;
        }
        color = `hsla(${hue}, 70%, 95%, .7)`;
        colorCache.set(text, hue);
    }

    return color;
}
