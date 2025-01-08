declare global {
    interface Window {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
        showOpenFilePicker?: (options: any) => Promise<FileSystemFileHandle[]>;
    }
    interface DataTransferItem {
        getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
    }
    interface FileSystemDirectoryHandle {
        values(): AsyncIterable<FileSystemHandle>;
    }
}

interface FileHelperOptions {
    accepts?: string;
    multiple?: boolean;
}

export interface FileInfo {
    name: string;
    dir: string;
    path: string;
}

export function useFileHelper(callback: (file: File, info?: FileInfo) => unknown, options?: FileHelperOptions) {
    const {
        // accepts:
        multiple,
    } = options ?? {
        multiple: true,
    };

    /**
     * handle体系的api
     */
    async function handleEntry(entry: FileSystemHandle, dirName: string = '') {
        if (entry.kind === 'file') {
            const file = await (entry as FileSystemFileHandle).getFile(); // 获取文件对象
            callback(file, {
                path: `${dirName}${entry.name}`,
                name: entry.name,
                dir: dirName,
            });
        } else if (entry.kind === 'directory') {
            // 如果需要递归处理子目录，可以在这里调用递归函数
            readByHandle(entry as FileSystemDirectoryHandle, `${dirName}${entry.name}/`);
        }
    }

    async function readByHandle(dirHandle: FileSystemDirectoryHandle, dirName: string = '') {
        const entries = await dirHandle.values(); // 获取目录中的所有条目
        for await (const entry of entries) {
            handleEntry(entry, dirName);
        }
    }

    /**
     * entry体系的api
     */
    function parseFileEntry(entry: FileSystemEntry, dirName: string = ''): void {
        if (entry.isDirectory) {
            // 如果是目录，获取目录读取器
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            reader.readEntries(
                (entries: FileSystemEntry[]) => {
                    // 递归解析目录中的每个条目
                    entries.forEach((subEntry) => {
                        parseFileEntry(subEntry, `${dirName}${entry.name}/`);
                    });
                },
                (error: Error) => {
                    console.error('Error reading directory:', error);
                },
            );
        } else if (entry.isFile) {
            // 如果是文件，获取文件对象并触发回调
            (entry as FileSystemFileEntry).file(
                (file: File) => {
                    callback(file, {
                        path: entry.fullPath,
                        dir: dirName,
                        name: entry.name,
                    });
                },
                (error: Error) => {
                    console.error('Error getting file:', error);
                },
            );
        }
    }

    return {
        getFileBySelect: (e: InputEvent) => {
            Array.from((e.target as HTMLInputElement)?.files).forEach((file) => callback(file));
        },
        getFileByDrop: async (e: DragEvent) => {
            // Array.from(e.dataTransfer?.files).forEach((file) => callback(file));
            // sb handleAPI 有bug，同时拖目录和文件遍历不出来目录
            // for (const item of e.dataTransfer.items) {
            //     const handle = await item.getAsFileSystemHandle();
            //     await handleEntry(handle);
            // }
            for (const item of e.dataTransfer.items) {
                const handle = await item.webkitGetAsEntry();
                parseFileEntry(handle);
            }
        },
        getFileByDirPicker: async () => {
            const dirHandle = await window.showDirectoryPicker?.();
            if (!dirHandle) {
                return;
            }

            await readByHandle(dirHandle);
        },
        getFileByFilePicker: async () => {
            const fileHandleList = await window.showOpenFilePicker?.({
                multiple,
                // types: [
                //     {
                //         description: 'Text files',
                //         accept: {
                //             'text/plain': ['.txt'],
                //         },
                //     },
                //     // 你可以添加更多文件类型选项
                // ],
            });
            if (!fileHandleList.length) {
                return;
            }

            for (const fileHandle of fileHandleList) {
                await handleEntry(fileHandle);
            }
        },
    };
}
