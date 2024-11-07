import { download } from '../common/common';
import { loadImage } from '../common/loader';
function isWebPSupported() {
    // 创建一个canvas元素
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    // 尝试将WebP格式的图片数据绘制到canvas上
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    // 尝试将canvas的内容转换为WebP格式的DataURL
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

export const isSupportedWEBP = isWebPSupported();

export async function exportImage(src: string, format: string): Promise<string> {
    const img = await loadImage(src);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 设置canvas的大小与图片大小相同
    canvas.width = img.width;
    canvas.height = img.height;

    // 将图片绘制到canvas上
    ctx.drawImage(img, 0, 0);

    return canvas.toDataURL(format);
}
