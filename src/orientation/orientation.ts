import type { Orientation, Quaternion } from './types';

let currentOrientation: Orientation = {
    alpha: 0,
    beta: 0,
    gamma: 0,
};
let currentQuaternion: Quaternion = {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
};

type OrientationCallback = (o: Orientation, q: Quaternion) => unknown;
const callbackCollection: Set<OrientationCallback> = new Set();

function triggerCallbacks() {
    callbackCollection.forEach((fn) => {
        try {
            fn(currentOrientation, currentQuaternion);
        } catch (e) {
            console.error(e);
        }
    });
}

export function useDeviceOrientation(fn: OrientationCallback): { unbind: () => void } {
    callbackCollection.add(fn);

    return {
        unbind: () => {
            callbackCollection.delete(fn);
        },
    };
}

export function triggerOrientation(o?: Partial<Orientation>) {
    currentOrientation = {
        alpha: o?.alpha ?? 0,
        beta: o?.beta ?? 0,
        gamma: o?.gamma ?? 0,
    };

    const alphaRad = (currentOrientation.alpha * Math.PI) / 180;
    const betaRad = (currentOrientation.beta * Math.PI) / 180;
    const gammaRad = (currentOrientation.gamma * Math.PI) / 180;

    currentQuaternion = {
        x: Math.sin(alphaRad / 2),
        y: Math.sin(betaRad / 2),
        z: Math.sin(gammaRad / 2),
        w: Math.cos(alphaRad / 2) * Math.cos(betaRad / 2) * Math.cos(gammaRad / 2),
    };

    triggerCallbacks();
}

function updateOrientationInWebContext(event: DeviceOrientationEvent): void {
    triggerOrientation({
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
    });
}

let hasBound = false;
let boundType: 'deviceorientation' | 'orientationchange' | 'ScreenOrientation' | undefined = undefined;
const context = typeof window !== 'undefined' ? window : globalThis;

async function getPermission() {
    // @ts-expect-error
    if (window.DeviceOrientationEvent?.requestPermission) {
        // @ts-expect-error
        const res = await window.DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') {
            throw new Error('Permission denied');
        }
    }
}
/**
 * bind deviceorientation in web context
 */
export function bindDeviceOrientation() {
    if (hasBound) {
        return;
    }
    if ('ondeviceorientation' in context) {
        getPermission().then(() => {
            hasBound = true;

            boundType = 'deviceorientation';
            context.addEventListener('deviceorientation', updateOrientationInWebContext);
        });
    }
}

export function unbindDeviceOrientation() {
    hasBound = false;
    context.removeEventListener('deviceorientation', updateOrientationInWebContext);
}
