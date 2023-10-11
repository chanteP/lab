export async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.src = src;

        img.onload = () => res(img);
        img.onerror = rej;
    });
}
