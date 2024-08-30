import { parse } from 'path';

const matcher = {
    gradientFunction: /(?:\-(?:webkit|o|ms|moz)\-)?([\w-]+-gradient)\(([\s\S]+)\)/i,
    angleValue: /([\d\.]+)(deg|grad|rad|turn)/i,
    // 30deg | to top | to top left
    sideOrCornerValue: /to\s+(top|left|right|bottom)(?:\s+(top|left|right|bottom))?/i,
    // color | color 20% | color 20% 80%
    colorStopValue: /\s*([\w\-]+\([^\)]+\)|\#[0-9a-f]+|[\w\-]+)?(?:\s+([\d\.]+[%\w]*))?(?:\s+([\d\.]+[%\w]*))?/i,
    // 0.1% | 222px
    value: /([\d\.]+)([%\w]*)/i,
};

function parseAngle(string: string): number {
    const [match, value, unit] = matcher.angleValue.exec(string) ?? [];
    if (!match) {
        return;
    }
    switch (unit.toLowerCase()) {
        case 'deg':
            return parseFloat(value) % 360;
        case 'grad':
            return ((parseFloat(value) * 400) / 360) % 360;
        case 'rad':
            return ((parseFloat(value) * 180) / Math.PI) % 360;
        case 'turn':
            return (parseFloat(value) * 360) % 360;
        default:
            return;
    }
}
// vertical horizon
const dirMap = {
    top: 0,
    right: 90,
    bottom: 180,
    left: 270,
    'top right': 45,
    'right top': 45, // 'right top' 和 'top right' 可以视为相同
    'bottom right': 135,
    'right bottom': 135, // 'right bottom' 和 'bottom right' 可以视为相同
    'bottom left': 225,
    'left bottom': 225, // 'left bottom' 和 'bottom left' 可以视为相同
    'top left': 315,
    'left top': 315, // 'left top' 和 'top left' 可以视为相同
};
function parseDir(string: string): number {
    const [match, dir1, dir2] = matcher.sideOrCornerValue.exec(string) ?? [];
    if (!match) {
        return;
    }
    return dirMap[`${dir1.toLowerCase()}${dir2 ? ` ${dir2.toLowerCase()}` : ''}`];
}

// percent only
function easyParse(value: string) {
    const [match, num, unit] = matcher.value.exec(value) ?? [];
    if (!match) {
        return;
    }
    if (unit && unit !== '%') {
        return undefined;
    }
    return +num;
}
/**
 * 粗糙的解析，网上找到多多少少有些不支持
 * On是不可能On的了，麻烦
 * 
 * TODO conic的角度和位置兼容
 * TODO radial的位置
 */
export function parseGradient(gradient: string) {
    const [match, type, content] = matcher.gradientFunction.exec(gradient) ?? [];

    if (!type || !content) {
        return;
    }

    let index = 0;
    let lastPartIndex = 0;
    const len = content.length;
    let callStack = 0;

    const part: string[] = [];

    let direction: number = 0;
    let lastColor: string | undefined = undefined;
    const colorStops: { color: string; value: number }[] = [];

    function findNext<T>(arr: T[], start: number, fn: (v: T) => boolean) {
        let i = start;
        while (i < arr.length) {
            if (fn(arr[i])) {
                return arr[i];
            }
            i++;
        }
    }
    function checkColorStop() {
        if (!colorStops.length) {
            return;
        }
        if (!colorStops[0].value) {
            colorStops[0].value = 0;
        }
        if (!colorStops[colorStops.length - 1].value) {
            colorStops[colorStops.length - 1].value = 100;
        }
        let lastStop = 0;
        let count = 0;
        colorStops.forEach((stop, i) => {
            if (stop.value === undefined) {
                let next = findNext(colorStops, i, (s) => {
                    count++;
                    return s.value !== undefined;
                });
                if (next) {
                    stop.value = (next.value - lastStop) / count + lastStop;
                }
            } else {
                count = 0;
                lastStop = stop.value;
            }
        });
    }
    function parseDirection(partValue: string | undefined, i: number, arr: unknown[]): void {
        if (!partValue) {
            return;
        }
        const dir = parseDir(partValue) ?? parseAngle(partValue);
        if (dir === undefined) {
            parseColorStop(partValue, i, arr);
            return;
        }
        direction = dir;
    }

    function checkStop(color: string, stopValue: string) {
        lastColor = color;
        let stop = easyParse(stopValue);

        colorStops.push({
            color,
            value: stop,
        });
    }
    function parseColorStop(partValue: string | undefined, i: number, arr: unknown[]): void {
        if (!partValue) {
            return;
        }
        const [match, color, stop1, stop2] = matcher.colorStopValue.exec(partValue) ?? [];
        if (!match || (!color && !stop1)) {
            return;
        }
        if (!color && !lastColor) {
            console.warn('no color found');
            return;
        }
        let useColor = color || lastColor;
        // TODO no stop
        checkStop(useColor, stop1);

        if (stop2) {
            checkStop(useColor, stop2);
        }
    }

    while (index < len) {
        const char = content[index];
        if (char === '(') {
            callStack++;
        } else if (char === ')') {
            callStack--;
        }
        if (callStack === 0 && char === ',') {
            // part
            part.push(content.slice(lastPartIndex, index));
            lastPartIndex = index + 1;
        }
        if (index === len - 1) {
            // end
            if (lastPartIndex !== index) {
                part.push(content.slice(lastPartIndex));
            }
        }

        index++;
    }

    if (callStack) {
        throw new Error(`syntax error`);
    }

    parseDirection(part[0], 0, part);
    part.slice(1).forEach(parseColorStop);

    checkColorStop();

    return { type, direction, content, colorStops, part };
}
