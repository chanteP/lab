export interface FileFormat {
    name: string;
    format: string;
    check?: (blob: File) => boolean;
}
