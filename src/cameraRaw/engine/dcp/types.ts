export interface DcpEntry {
    tag: number;
    type: number;
    count: number;
    value: number | number[] | string | Uint8Array;
}

export interface DcpTable {
    dimensions: [number, number, number];
    data: Float32Array;
    srgbEncoded: boolean;
}

export interface DcpProfile {
    id: string;
    name: string;
    cameraModel: string;
    fileName: string;
    bytes: Uint8Array;
    entries: DcpEntry[];
    colorMatrix1?: number[];
    colorMatrix2?: number[];
    forwardMatrix1?: number[];
    forwardMatrix2?: number[];
    illuminant1?: number;
    illuminant2?: number;
    toneCurve?: Float32Array;
    hueSatMap?: DcpTable;
    lookTable?: DcpTable;
    baselineExposure: number;
}

export interface DcpCatalogEntry {
    id: string;
    name: string;
    cameraModel: string;
    fileName: string;
    url: string;
    custom?: boolean;
}
