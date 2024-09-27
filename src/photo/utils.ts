// import { createFFmpeg, fetchFile, FFmpeg } from '@ffmpeg/ffmpeg';
import { type FFmpeg } from '@ffmpeg/ffmpeg';
import { LogEvent } from '@ffmpeg/ffmpeg/dist/esm/types';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import mime from 'mime';

declare global {
    interface Window {
        FFmpegWASM: {
            FFmpeg: typeof FFmpeg;
        };
        ffmpeg: FFmpeg;
    }
}

let ffmpeg: FFmpeg | undefined = undefined;
let isReady = false;

const videoURL = 'https://raw.githubusercontent.com/ffmpegwasm/testdata/master/video-15s.avi';

export async function loadFFmpeg() {
    const FFmpegCore = window.FFmpegWASM.FFmpeg;

    ffmpeg = new FFmpegCore();

    window.ffmpeg = ffmpeg;

    const baseURL = '/public/lib/ffmpeg';
    // const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';

    ffmpeg.on('log', ({ message: msg }: LogEvent) => {
        console.log(msg);
    });
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });

    isReady = true;
}

export async function simpleConvertTo(src: string, nameWithExt: string, target: string) {
    if (!isReady) {
        throw new Error('ffmpeg is not ready');
    }

    const name = nameWithExt?.split('.').shift();
    const targetName = `${name}.${target}`;

    console.info(`convert ${nameWithExt} to ${targetName}...`);

    await ffmpeg.writeFile(`upload_${nameWithExt}`, await fetchFile(src));
    await ffmpeg.exec(['-i', `upload_${nameWithExt}`, `dist_${targetName}`]);
    const data = await ffmpeg.readFile(`dist_${targetName}`);

    const blob = new Blob([(data as Uint8Array).buffer], { type: mime.getType(target) });
    const file = new File([blob], targetName);
    console.info(`convert ${nameWithExt} success`);

    return file;
}
