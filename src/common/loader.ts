export function loadScript(src: string) {
    return new Promise((res, rej) => {
        const script = document.createElement('script');
        script.onload = res;
        script.onerror = rej;

        script.src = src;
        document.head.appendChild(script);
    });
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.src = src;

        img.onload = () => res(img);
        img.onerror = rej;
    });
}

