import { Quaternion } from './types';

// 将角度转换为弧度
export function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

// 从陀螺仪数据计算四元数
export function calculateQuaternion(alpha: number, beta: number, gamma: number): Quaternion {
    const alphaRad = toRadians(alpha);
    const betaRad = toRadians(beta);
    const gammaRad = toRadians(gamma);

    const qW =
        Math.cos(alphaRad / 2) * Math.cos(betaRad / 2) * Math.cos(gammaRad / 2) -
        Math.sin(alphaRad / 2) * Math.sin(betaRad / 2) * Math.sin(gammaRad / 2);
    const qX =
        Math.sin(alphaRad / 2) * Math.cos(betaRad / 2) * Math.cos(gammaRad / 2) +
        Math.cos(alphaRad / 2) * Math.sin(betaRad / 2) * Math.sin(gammaRad / 2);
    const qY =
        Math.cos(alphaRad / 2) * Math.sin(betaRad / 2) * Math.cos(gammaRad / 2) -
        Math.sin(alphaRad / 2) * Math.cos(betaRad / 2) * Math.sin(gammaRad / 2);
    const qZ =
        Math.cos(alphaRad / 2) * Math.cos(betaRad / 2) * Math.sin(gammaRad / 2) +
        Math.sin(alphaRad / 2) * Math.sin(betaRad / 2) * Math.cos(gammaRad / 2);

    return { w: qW, x: qX, y: qY, z: qZ };
}

export function quaternionToCSSMatrix3D(q: Quaternion): number[] {
    const { w, x, y, z } = q;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    return [
        1 - (yy + zz),     xy - wz,         xz + wy,         0,
        xy + wz,         1 - (xx + zz),    yz - wx,         0,
        xz - wy,         yz + wx,         1 - (xx + yy),    0,
        0,                0,                0,                1
    ];
}