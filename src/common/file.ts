import { ref } from 'vue';

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

    const total = ref(0);
    const done = ref(0);
    const error = ref(0);
    const scanning = ref<Record<string, boolean>>({});

    function reset() {
        total.value = 0;
        done.value = 0;
    }

    /**
     * handle体系的api
     */
    async function handleEntry(entry: FileSystemHandle, dirName: string = '') {
        const fullPath = `${dirName}${entry.name}`;

        try {
            total.value = total.value + 1;

            if (entry.kind === 'file') {
                const file = await (entry as FileSystemFileHandle).getFile(); // 获取文件对象
                callback(file, {
                    path: fullPath,
                    name: entry.name,
                    dir: dirName,
                });
            } else if (entry.kind === 'directory') {
                // 如果需要递归处理子目录，可以在这里调用递归函数
                await readByHandle(entry as FileSystemDirectoryHandle, `${fullPath}/`);
            } else {
                debugger;
            }

            done.value = done.value + 1;
        } catch (e) {
            console.error(e);
            error.value = error.value + 1;
        }
    }

    async function readByHandle(dirHandle: FileSystemDirectoryHandle, dirName: string = '') {
        scanning.value[dirName] = false;
        const entries = await dirHandle.values(); // 获取目录中的所有条目
        for await (const entry of entries) {
            handleEntry(entry, dirName);
        }
        scanning.value[dirName] = true;
    }

    /**
     * entry体系的api
     */
    function parseFileEntry(entry: FileSystemEntry, dirName: string = ''): void {
        total.value = total.value + 1;

        if (entry.isDirectory) {
            scanning.value[entry.fullPath] = false;
            // 如果是目录，获取目录读取器
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            reader.readEntries(
                (entries: FileSystemEntry[]) => {
                    // 递归解析目录中的每个条目
                    entries.forEach((subEntry) => {
                        parseFileEntry(subEntry, `${dirName}${entry.name}/`);
                    });
                    scanning.value[entry.fullPath] = true;
                    done.value = done.value + 1;
                },
                (e: Error) => {
                    console.error('Error reading directory:', e);
                    scanning.value[entry.fullPath] = true;
                    error.value = error.value + 1;
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
                    done.value = done.value + 1;
                },
                (e: Error) => {
                    console.error('Error getting file:', e);
                    error.value = error.value + 1;
                },
            );
        }
    }

    return {
        total,
        done,
        error,
        scanning,
        reset,

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
