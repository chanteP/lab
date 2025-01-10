export function saveCall<T extends (...args: any[]) => any>(fn?: T, ...args: Parameters<T>): ReturnType<T> | undefined {
    try {
        return fn?.(...args);
    } catch (e) {
        console.error(e);
    }
}

export function saveParseJSON<T>(json?: string, defaultValue?: T): T | undefined {
    if (!json) {
        return defaultValue;
    }
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error(e);
    }
    if (defaultValue !== undefined) {
        return defaultValue;
    }
}

export function getValueWithDefault<T>(value: T | undefined, defaultValue: T): T {
    return value ?? defaultValue;
}

export function download(file: File): void {
    // 创建一个 Blob 对象
    const blob = new Blob([file], { type: file.type });

    // 创建一个 URL 对象，以便可以在浏览器中使用
    const url = URL.createObjectURL(blob);

    // 创建一个 <a> 标签用于下载
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = file.name; // 使用文件原名作为下载文件名
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // 释放内存
    URL.revokeObjectURL(url);
    downloadLink.remove();
}

export function sleep(ms: number = 0): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function copy(value: string) {
    try {
        navigator.clipboard?.writeText(value);
    } catch (e) {
        console.error(e);
    }
}

export async function convertToBase64(file: File) {
    return new Promise<string>((res, rej) => {
        if (!file) {
            res('');
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64String = e.target.result;
            res(base64String as string);
        };
        reader.onerror = rej;
        reader.readAsDataURL(file); // 读取文件并转换为Data URL
    });
}

export function getColorByString(str: string, s = 70, l = 80) {
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
        sum += str.charCodeAt(i) - 48;
    }

    return `hsl(${sum % 360}, ${s}%, ${l}%)`;
}

export function timeout<T>(promise: Promise<T>, delay: number) {
    return Promise.race<T>([
        promise,
        new Promise((res, rej) => {
            setTimeout(() => {
                rej('timeout');
            }, delay);
        }),
    ]);
}

export function throttle<T extends (...args: any) => any>(func: T, limit: number) {
    let inThrottle: boolean;
    let lastArgs: Parameters<T> | undefined = undefined;

    return function (...args: Parameters<T>) {
        const context = this;
        if (!inThrottle) {
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
                if (lastArgs) {
                    const last = lastArgs;
                    lastArgs = undefined;
                    func.apply(context, last);
                }
            }, limit);
            func.apply(context, args);
        } else {
            lastArgs = args;
        }
    };
}
