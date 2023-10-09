export function random(range = 1, from = 0) {
    return Math.floor(Math.random() * range) + from;
}

export function randomPick<T>(arr: T[]): T {
    return arr[random(arr.length)];
}

/**
 * 生成正态分布的随机数。Box-Muller
 * @param mean 均值
 * @param stdDev 标准差
 */
export function generateNormalDistribution(mean: number, stdDev: number): number {
    let u = 0,
        v = 0;
    while (u === 0) u = Math.random(); // 生成 (0,1) 之间的随机数
    while (v === 0) v = Math.random(); // 生成 (0,1) 之间的随机数

    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v); // 使用 Box-Muller 转换算法

    return Math.round(mean + z * stdDev);
}

export function generateIncreasingArray(initialValue: number, length: number, fn = (x) => x * x): number[] {
    const result = [];

    for (let i = 0; i < length; i++) {
        result.push(Math.floor(fn(i)) + initialValue);
    }

    return result;
}

export function sumArray(initialValue: number, arr: number[]) {
    return arr.reduce((l, c, i) => {
        l.push(c + (l[i - 1] ?? 0));
        return l;
    }, []);
}

export function rad(deg: number) {
    return (deg / 180) * Math.PI;
}
