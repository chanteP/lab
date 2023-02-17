import { DataFormatter, DataOrder, FieldRecord, FieldValue } from '../FileData';

export function toString(data: FieldValue) {
    if (data instanceof ArrayBuffer) {
        return new TextDecoder('utf-8').decode(data);
    }
    return data?.toString() ?? '';
}

export function toNumber(data: FieldValue, field: FieldRecord) {
    if (data instanceof ArrayBuffer) {
        switch (data.byteLength) {
            case 4:
                return new DataView(data).getInt32(0, field.order === DataOrder.LE);
            case 2:
                return new DataView(data).getInt16(0, field.order === DataOrder.LE);
            case 1:
                return new DataView(data).getInt8(0);
            default:
                console.error('unexpected data length', data);
                return 0;
        }
    }
    return Number(data) ?? 0;
}

export function toJSON(data: FieldValue) {
    if (typeof data !== 'string') {
        console.warn('expect string input');
        return data;
    }
    try {
        return JSON.stringify(JSON.parse(data), null, 4);
    } catch (e) {
        console.warn('toJSON error', e);
        return data;
    }
}
