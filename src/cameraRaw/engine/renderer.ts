import type { Adjustments, ImageAsset, MixerColor } from '../types';
import { MIXER_COLORS } from '../types';
import { calibrationMatrix, gradeFor } from './color';
import { createCurveLut } from './curve';
import { fragmentShader, vertexShader } from './shader';

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
    const value = gl.createShader(type)!; gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) || 'Shader compile failed');
    return value;
}

export class RawRenderer {
    readonly canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private texture: WebGLTexture;
    private curveTexture: WebGLTexture;
    private uniforms = new Map<string, WebGLUniformLocation | null>();
    private source?: ImageBitmap;

    constructor(canvas = document.createElement('canvas')) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
        if (!gl) throw new Error('此浏览器不支持 WebGL2');
        this.gl = gl;
        this.program = gl.createProgram()!;
        gl.attachShader(this.program, shader(gl, gl.VERTEX_SHADER, vertexShader));
        gl.attachShader(this.program, shader(gl, gl.FRAGMENT_SHADER, fragmentShader));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) || 'Shader link failed');
        gl.useProgram(this.program);
        const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(this.program, 'aPosition'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        this.texture = this.makeTexture(0); this.curveTexture = this.makeTexture(1);
        gl.uniform1i(this.u('uImage'), 0); gl.uniform1i(this.u('uCurves'), 1);
    }

    private u(name: string) {
        if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
        return this.uniforms.get(name)!;
    }

    private makeTexture(unit: number) {
        const gl = this.gl, texture = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    setSource(source: ImageBitmap) {
        const gl = this.gl; this.source = source;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    render(a: Adjustments, options: { width?: number; height?: number; compare?: number; split?: number } = {}) {
        if (!this.source) return;
        const gl = this.gl, ratio = this.source.width / this.source.height;
        this.canvas.width = Math.max(1, Math.round(options.width ?? this.source.width));
        this.canvas.height = Math.max(1, Math.round(options.height ?? this.canvas.width / ratio));
        gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
        const curveData = new Uint8Array(256 * 4 * 4);
        (['rgb', 'r', 'g', 'b'] as const).forEach((channel, row) => {
            const lut = createCurveLut(a.curves[channel]);
            for (let x = 0; x < 256; x++) curveData.fill(lut[x], (row * 256 + x) * 4, (row * 256 + x) * 4 + 3);
        });
        // ImageBitmap needs Y flipping, but the curve LUT must retain RGB/R/G/B row order.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, curveData);
        gl.uniform2f(this.u('uTexel'), 1 / this.source.width, 1 / this.source.height);
        gl.uniform4f(this.u('uBasic'), a.exposure, a.contrast, a.highlights, a.shadows);
        gl.uniform4f(this.u('uBasic2'), a.whites, a.blacks, 0, 0);
        gl.uniform3f(this.u('uDetail'), a.texture, a.clarity, a.dehaze);
        gl.uniform3f(this.u('uWhiteBalance'), a.temperature, a.tint, 0);
        gl.uniform4f(this.u('uOptics'), a.optics.distortion, a.optics.chromaticAberration, a.optics.vignette, a.optics.midpoint);
        gl.uniform3fv(this.u('uMixer[0]'), MIXER_COLORS.flatMap((color: MixerColor) => [a.mixer[color].hue, a.mixer[color].saturation, a.mixer[color].luminance]));
        gl.uniform3fv(this.u('uGrade[0]'), [...gradeFor(a.grading.shadows), ...gradeFor(a.grading.midtones), ...gradeFor(a.grading.highlights)]);
        gl.uniform3f(this.u('uGradeLum'), a.grading.shadows.luminance, a.grading.midtones.luminance, a.grading.highlights.luminance);
        gl.uniform2f(this.u('uGradeControl'), a.grading.blending, a.grading.balance);
        gl.uniformMatrix3fv(this.u('uCalibration'), false, calibrationMatrix(a.calibration));
        gl.uniform1f(this.u('uShadowTint'), a.calibration.shadowTint);
        gl.uniform1f(this.u('uVibrance'), a.vibrance); gl.uniform1f(this.u('uSaturation'), a.saturation);
        gl.uniform1i(this.u('uCompare'), options.compare ?? 0); gl.uniform1f(this.u('uSplit'), options.split ?? .5);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
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
        this.gl.deleteTexture(this.texture); this.gl.deleteTexture(this.curveTexture); this.gl.deleteProgram(this.program);
    }
}
