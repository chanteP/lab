import type { Adjustments, MixerColor } from '../types';
import { MIXER_COLORS } from '../types';
import type { DcpProfile } from './dcp/types';
import { dcpTableBytes, dcpToneLut } from './dcp/render';
import { calibrationMatrix, gradeFor } from './color';
import { createCurveLut } from './curve';
import { combineMaskAdjustments } from './masks/mask';
import { rasterizeMask } from './masks/rasterize';
import type { ImageMask } from './masks/types';
import { fragmentShader, maskBlendFragmentShader, vertexShader } from './shader';

export interface RenderOptions {
    width?: number;
    height?: number;
    compare?: number;
    split?: number;
    profile?: DcpProfile;
    masks?: ImageMask[];
    activeMaskId?: string;
    showMaskOverlay?: boolean;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const value = gl.createShader(type)!; gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) || 'Shader compile failed');
    return value;
}

function createProgram(gl: WebGL2RenderingContext, fragment: string) {
    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexShader));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
    return program;
}

export class RawRenderer {
    readonly canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private blendProgram: WebGLProgram;
    private texture: WebGLTexture;
    private curveTexture: WebGLTexture;
    private toneTexture: WebGLTexture;
    private lookTexture: WebGLTexture;
    private deltaTexture: WebGLTexture;
    private baseTexture: WebGLTexture;
    private adjustedTexture: WebGLTexture;
    private maskTexture: WebGLTexture;
    private uniforms = new Map<string, WebGLUniformLocation | null>();
    private blendUniforms = new Map<string, WebGLUniformLocation | null>();
    private source?: ImageBitmap;
    private profile?: DcpProfile;

    constructor(canvas = document.createElement('canvas')) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
        if (!gl) throw new Error('此浏览器不支持 WebGL2');
        this.gl = gl;
        this.program = createProgram(gl, fragmentShader); this.blendProgram = createProgram(gl, maskBlendFragmentShader);
        const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(this.program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.texture = this.makeTexture(0); this.curveTexture = this.makeTexture(1); this.toneTexture = this.makeTexture(2);
        this.lookTexture = gl.createTexture()!; this.deltaTexture = gl.createTexture()!;
        this.baseTexture = this.makeTexture(5); this.adjustedTexture = this.makeTexture(6); this.maskTexture = this.makeTexture(7);
        gl.useProgram(this.program);
        gl.uniform1i(this.u('uImage'), 0); gl.uniform1i(this.u('uCurves'), 1); gl.uniform1i(this.u('uDcpTone'), 2);
        gl.uniform1i(this.u('uDcpLook'), 3); gl.uniform1i(this.u('uDcpDelta'), 4);
        gl.useProgram(this.blendProgram);
        gl.uniform1i(this.bu('uMaskBase'), 5); gl.uniform1i(this.bu('uMaskAdjusted'), 6); gl.uniform1i(this.bu('uMask'), 7);
    }

    private u(name: string) {
        if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
        return this.uniforms.get(name)!;
    }

    private bu(name: string) {
        if (!this.blendUniforms.has(name)) this.blendUniforms.set(name, this.gl.getUniformLocation(this.blendProgram, name));
        return this.blendUniforms.get(name)!;
    }

    private makeTexture(unit: number) {
        const gl = this.gl, texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    private uploadTable(unit: number, texture: WebGLTexture, profile: DcpProfile | undefined, kind: 'look' | 'delta') {
        const gl = this.gl, table = kind === 'look' ? profile?.lookTable : profile?.hueSatMap, { bytes, dimensions } = dcpTableBytes(table);
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_3D, texture);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, dimensions[0], dimensions[1], dimensions[2], 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        return { table, dimensions };
    }

    private setProfile(profile?: DcpProfile) {
        if (this.profile === profile) return;
        this.profile = profile;
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.toneTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, dcpToneLut(profile));
        const look = this.uploadTable(3, this.lookTexture, profile, 'look'), delta = this.uploadTable(4, this.deltaTexture, profile, 'delta');
        gl.useProgram(this.program);
        gl.uniform1f(this.u('uDcpBaseline'), profile?.baselineExposure ?? 0);
        gl.uniform3fv(this.u('uDcpLookDims'), look.dimensions); gl.uniform3fv(this.u('uDcpDeltaDims'), delta.dimensions);
        gl.uniform1i(this.u('uDcpHasLook'), Number(Boolean(look.table))); gl.uniform1i(this.u('uDcpHasDelta'), Number(Boolean(delta.table)));
        gl.uniform1i(this.u('uDcpLookSrgb'), Number(Boolean(look.table?.srgbEncoded))); gl.uniform1i(this.u('uDcpDeltaSrgb'), Number(Boolean(delta.table?.srgbEncoded)));
    }

    setSource(source: ImageBitmap) {
        const gl = this.gl; this.source = source;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    private draw(a: Adjustments, options: RenderOptions) {
        const gl = this.gl; gl.useProgram(this.program); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
        const curveData = new Uint8Array(256 * 4 * 4);
        (['rgb', 'r', 'g', 'b'] as const).forEach((channel, row) => {
            const lut = createCurveLut(a.curves[channel]);
            for (let x = 0; x < 256; x++) curveData.fill(lut[x], (row * 256 + x) * 4, (row * 256 + x) * 4 + 3);
        });
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, curveData);
        gl.uniform2f(this.u('uTexel'), 1 / this.source!.width, 1 / this.source!.height);
        gl.uniform4f(this.u('uBasic'), a.exposure, a.contrast, a.highlights, a.shadows);
        gl.uniform4f(this.u('uBasic2'), a.whites, a.blacks, 0, 0);
        gl.uniform3f(this.u('uDetail'), a.effects.texture, a.effects.clarity, a.effects.dehaze);
        gl.uniform3f(this.u('uWhiteBalance'), a.temperature, a.tint, 0);
        gl.uniform4f(this.u('uOptics'), a.optics.distortion, a.optics.chromaticAberration, a.effects.vignette, a.effects.vignetteMidpoint);
        gl.uniform3f(this.u('uGrain'), a.effects.grain, a.effects.grainSize, a.effects.grainRoughness);
        gl.uniform3fv(this.u('uMixer[0]'), MIXER_COLORS.flatMap((color: MixerColor) => [a.mixer[color].hue, a.mixer[color].saturation, a.mixer[color].luminance]));
        gl.uniform3fv(this.u('uGrade[0]'), [...gradeFor(a.grading.shadows), ...gradeFor(a.grading.midtones), ...gradeFor(a.grading.highlights)]);
        gl.uniform3f(this.u('uGradeLum'), a.grading.shadows.luminance, a.grading.midtones.luminance, a.grading.highlights.luminance);
        gl.uniform2f(this.u('uGradeControl'), a.grading.blending, a.grading.balance);
        gl.uniformMatrix3fv(this.u('uCalibration'), false, calibrationMatrix(a.calibration));
        gl.uniform1f(this.u('uShadowTint'), a.calibration.shadowTint);
        gl.uniform1f(this.u('uVibrance'), a.vibrance); gl.uniform1f(this.u('uSaturation'), a.saturation);
        gl.uniform1i(this.u('uCompare'), options.compare ?? 0); gl.uniform1f(this.u('uSplit'), options.split ?? .5);
        gl.uniform1i(this.u('uDcpEnabled'), Number(Boolean(options.profile)));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    private copyCanvas(unit: number, texture: WebGLTexture) {
        const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    }

    private blend(mask: ImageMask, amount: number, overlay: boolean, options: RenderOptions) {
        const gl = this.gl;
        const pixels = rasterizeMask(mask, this.canvas.width, this.canvas.height);
        gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, this.canvas.width, this.canvas.height, 0, gl.RED, gl.FLOAT, pixels);
        gl.useProgram(this.blendProgram); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.bu('uMaskAmount'), amount); gl.uniform1i(this.bu('uMaskOverlay'), Number(overlay));
        gl.uniform1i(this.bu('uMaskCompare'), options.compare ?? 0); gl.uniform1f(this.bu('uMaskSplit'), options.split ?? .5);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    render(a: Adjustments, options: RenderOptions = {}) {
        if (!this.source) return;
        const ratio = this.source.width / this.source.height;
        this.canvas.width = Math.max(1, Math.round(options.width ?? this.source.width));
        this.canvas.height = Math.max(1, Math.round(options.height ?? this.canvas.width / ratio));
        this.setProfile(options.profile);
        this.draw(a, options);
        const masks = (options.masks ?? []).filter((mask) => mask.visible && mask.amount > 0 && mask.shapes.length);
        let effective = a;
        for (const mask of masks) {
            this.copyCanvas(5, this.baseTexture);
            effective = combineMaskAdjustments(effective, mask.adjustments);
            this.draw(effective, options);
            this.copyCanvas(6, this.adjustedTexture);
            this.blend(mask, mask.amount / 100, Boolean(options.showMaskOverlay && (mask.overlay || mask.id === options.activeMaskId)), options);
            if (mask !== masks.at(-1)) this.copyCanvas(5, this.baseTexture);
        }
    }

    readPixels(): Uint8ClampedArray {
        const data = new Uint8Array(this.canvas.width * this.canvas.height * 4);
        this.gl.readPixels(0, 0, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data);
        const topDown = new Uint8ClampedArray(data.length), stride = this.canvas.width * 4;
        for (let y = 0; y < this.canvas.height; y++) topDown.set(data.subarray((this.canvas.height - y - 1) * stride, (this.canvas.height - y) * stride), y * stride);
        return topDown;
    }

    async blob(type = 'image/jpeg', quality = .94): Promise<Blob> {
        return new Promise((resolve, reject) => this.canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片编码失败')), type, quality));
    }

    dispose() {
        for (const texture of [this.texture, this.curveTexture, this.toneTexture, this.lookTexture, this.deltaTexture, this.baseTexture, this.adjustedTexture, this.maskTexture]) this.gl.deleteTexture(texture);
        this.gl.deleteProgram(this.program); this.gl.deleteProgram(this.blendProgram);
    }
}
