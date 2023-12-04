export function loadScript(src: string) {
    return new Promise((res, rej) => {
        const script = document.createElement('script');
        script.onload = res;
        script.onerror = rej;

        script.src = src;
        document.head.appendChild(script);
    });
}
