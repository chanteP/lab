export const DEFAULT_GL1_VERT = `
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = (a_position + 1.0) * 0.5;
}`;

const simpleVertHeader = `#version 300 es

out vec2 v_texCoord;

`;

export const DEFAULT_GL2_VERT = `${simpleVertHeader}

layout(location = 0) in vec2 a_position;

void main() {
    // 计算顶点的最终位置
    gl_Position = vec4(a_position, 0.0, 1.0);

    // 将纹理坐标传递给片段着色器
    v_texCoord = (a_position + 1.0) * 0.5;
}
`;

export const DEFAULT_GL1_FRAG = `
precision mediump float;

void main(){
    gl_FragColor=vec4(0.);
}
`;

const simpleFragHeader = `#version 300 es

// 指定默认精度为 highp
precision highp float;
precision highp sampler2D; // 指定精度和 sampler2D 类型

in vec2 v_texCoord; // 从顶点着色器传入的纹理坐标
out vec4 fragColor; // 片段颜色输出

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;

#define fragCoord vec2(v_texCoord * iResolution.xy)

`;
export const DEFAULT_GL2_FRAG = `${simpleFragHeader}

void main(){
    fragColor = vec4(fragCoord.x / iResolution.x , 0., 0., 1.);
}

`;

const DEFAULT_RATIO = Math.min(globalThis.window?.devicePixelRatio ?? 1, 2);

export function ensureCanvas(canvas: HTMLCanvasElement, ratio = DEFAULT_RATIO) {
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
}

export function setBlend(gl: WebGL2RenderingContext, blendMode: 'normal' | 'add' | 'multiply') {
    gl.enable(gl.BLEND);

    switch (blendMode) {
        case 'add':
            gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            break;
        case 'multiply':
            gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
            gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            break;
        case 'normal':
        default:
            gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            break;
    }
}

type AttrField = {
    name: string;
    length: number;
};

function injectAttr(gl: WebGL2RenderingContext, program: WebGLProgram, value: number[], fieldSet: AttrField[]) {
    const data = new Float32Array(value);
    const vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);

    let startOffset = 0;
    const totalLen = fieldSet.reduce((d, c) => (d += c.length), 0);

    fieldSet.forEach((field) => {
        const { name, length } = field;
        const positionAttributeLocation = gl.getAttribLocation(program, name);

        if (positionAttributeLocation < 0) {
            console.error(`name<${name}> does not found in vertShader`);
        }
        gl.vertexAttribPointer(
            positionAttributeLocation,
            length,
            gl.FLOAT,
            false,
            data.BYTES_PER_ELEMENT * totalLen,
            data.BYTES_PER_ELEMENT * startOffset,
        );

        gl.enableVertexAttribArray(positionAttributeLocation);

        startOffset += length;
    });

    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

function createUBO(gl: WebGL2RenderingContext, program: WebGLProgram, index: number = 0, value: number[] = []) {
    const ubo = gl.createBuffer();
    const data = Float32Array.from(value);

    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, index, ubo);
}

function initFBO(gl: WebGL2RenderingContext) {
    const fbo = gl.createFramebuffer();

    // 创建对应的纹理
    const texture = createTexture(gl);

    // 绑定纹理到FBO
    bindFBO(gl, fbo, texture);

    // 初始化纹理为透明
    clearTexture(gl, texture);

    return {
        fbo,
        texture,
    };
}

function createTexture(gl: WebGL2RenderingContext) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // 设置纹理参数（重要！防止边缘闪烁）
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    // 初始空纹理
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return texture;
}

function bindFBO(gl: WebGL2RenderingContext, fbo: WebGLFramebuffer, texture: WebGLTexture) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
}

function clearTexture(gl: WebGL2RenderingContext, texture: WebGLTexture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.canvas.width,
        gl.canvas.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]),
    );
}

export function createInjectAttrGroup() {
    const groupData: { name: string; length: number; data: number[][] }[] = [];
    let currentLen = 0;

    return {
        addGroup: (name: string, data: number[][]) => {
            const length = data[0]?.length ?? 0;
            if (length <= 0) {
                console.warn(`no data found in@${name}, received ${data}`);
            }
            if (currentLen && data.length !== currentLen) {
                console.warn(`length not match@${name}, expected ${currentLen}, received ${data.length}`);
            }
            currentLen = data.length;

            groupData.push({
                name,
                length,
                data,
            });
        },
        inject: (gl: WebGL2RenderingContext, program: WebGLProgram) => {
            const value: number[] = [];

            for (let i = 0; i < currentLen; i++) {
                for (let j = 0; j < groupData.length; j++) {
                    const currentGroup = groupData[j];
                    for (let k = 0; k < currentGroup.length; k++) {
                        value.push(currentGroup.data[i]?.[k] ?? 0);
                    }
                }
            }

            injectAttr(gl, program, value, groupData);
        },
        get length() {
            return currentLen;
        },
    };
}

function injectVert() {
    const group = createInjectAttrGroup();

    // [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    group.addGroup('a_position', [
        [-1.0, -1.0],
        [1.0, -1.0],
        [-1.0, 1.0],
        [1.0, 1.0],
    ]);

    return group;
}

type InjectableMethod = keyof WebGL2RenderingContext & `uniform${string}`;
type Tail<T extends any[]> = T extends [any, ...infer U] ? U : never;
function injectUniform<M extends InjectableMethod>(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
    method: M,
    ...value: Tail<Parameters<WebGL2RenderingContext[M]>>
) {
    const n = gl.getUniformLocation(program, name);
    // @ts-expect-error
    gl[method](n, ...value);
}

interface TextureOptions {
    flip?: false;
    mipmap?: boolean;
    texParameteri?: {
        [key: number]: number;
        TEXTURE_MIN_FILTER?: number;
        TEXTURE_MAG_FILTER?: number;
        TEXTURE_WRAP_S?: number;
        TEXTURE_WRAP_T?: number;
    };
}

function injectTexture(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
    index: number = 0,
    img: HTMLImageElement,
    options?: TextureOptions,
) {
    const texture = gl.createTexture();
    const sampler = gl.getUniformLocation(program, name);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options?.flip ?? 1 ? 1 : 0);
    gl.activeTexture(gl[`TEXTURE${index}` as 'TEXTURE0']);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const defaultMinFilter = !options?.mipmap ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR;
    const defaultMaxFilter = !options?.mipmap ? gl.LINEAR : gl.LINEAR;

    const texParameteri = options?.texParameteri;

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        texParameteri?.[gl.TEXTURE_MIN_FILTER] ?? texParameteri?.['TEXTURE_MIN_FILTER'] ?? defaultMinFilter,
    );
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        texParameteri?.[gl.TEXTURE_MAG_FILTER] ?? texParameteri?.['TEXTURE_MAG_FILTER'] ?? defaultMaxFilter,
    );
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        texParameteri?.[gl.TEXTURE_WRAP_S] ?? texParameteri?.['TEXTURE_WRAP_S'] ?? gl.CLAMP_TO_EDGE,
    );
    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        texParameteri?.[gl.TEXTURE_WRAP_T] ?? texParameteri?.['TEXTURE_WRAP_T'] ?? gl.CLAMP_TO_EDGE,
    );

    gl.uniform1i(sampler, index);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    if (options?.mipmap) {
        gl.generateMipmap(gl.TEXTURE_2D);
    }
}

export function useInjectGlData(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    canvas: HTMLCanvasElement,
    options: {
        ratio: number;
    },
) {
    const lastMousePosition: [number, number] = [0, 0];
    const start = Date.now();

    function inject() {
        const now = new Date();
        // 为 u_time 提供值
        const time = (now.getTime() - start) / 1000;
        const uTimeLocation = gl.getUniformLocation(program, 'u_time');
        gl.uniform1f(uTimeLocation, time);
        const iTimeLocation = gl.getUniformLocation(program, 'iTime');
        gl.uniform1f(iTimeLocation, time);

        // 为 u_mouse 提供值
        const uMouseLocation = gl.getUniformLocation(program, 'iMouse');
        gl.uniform2f(uMouseLocation, ...lastMousePosition);

        const uResolution = gl.getUniformLocation(program, 'u_resolution');
        gl.uniform2f(uResolution, canvas.clientWidth * options.ratio, canvas.clientHeight * options.ratio);
        const iResolution = gl.getUniformLocation(program, 'iResolution');
        gl.uniform3f(iResolution, canvas.clientWidth * options.ratio, canvas.clientHeight * options.ratio, 0);

        // gl.uniform4f(
        //     uDateLocation,
        //     now.getFullYear(),
        //     now.getMonth() + 1,
        //     now.getDate(),
        //     now.getHours() + now.getMinutes() / 60,
        // );

        // 为 u_camera 提供值
        // const uCameraLocation = gl.getUniformLocation(program, 'u_camera');
        // gl.uniform3f(uCameraLocation, 0.0, 0.0, -2.0);

        // 为 u_sampleRate 提供值
        // const uSampleRateLocation = gl.getUniformLocation(program, 'u_sampleRate');
        // gl.uniform1f(uSampleRateLocation, 44100.0);

        // 为 iResolution 提供值
        const iResolutionLocation = gl.getUniformLocation(program, 'iResolution');
        gl.uniform3f(iResolutionLocation, canvas.clientWidth, canvas.clientHeight, options.ratio);
    }

    function setMove(e: PointerEvent) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        lastMousePosition[0] = e.clientX / w;
        lastMousePosition[1] = e.clientY / h;
    }

    canvas.addEventListener('pointermove', setMove);

    return {
        inject,
        destroy: () => {
            canvas.removeEventListener('pointermove', setMove);
        },
    };
}

export function createGlContext(canvas: HTMLCanvasElement, options?: Partial<WebGLContextAttributes>) {
    const gl = canvas.getContext('webgl2', {
        alpha: true,
        depth: true,
        premultipliedAlpha: true,
        ...options,
    });
    if (!gl) {
        throw new Error(`webgl context create failed`);
    }
    setBlend(gl, 'normal');
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return gl;
}

function checkShader(gl: WebGL2RenderingContext, shader: WebGLShader, source: string) {
    const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!compiled) {
        const error = gl.getShaderInfoLog(shader);
        console.error('Shader compile error: ' + error);

        const [match, file, line] = /ERROR: ([\d]+):([\d]+)/.exec(error ?? '') ?? [];
        console.error('error line: ', source.split('\n')[+line - 1]);
    }
}

export function createProgram(gl: WebGL2RenderingContext, shader?: { vert?: string; frag?: string }) {
    const program = gl.createProgram();
    // 创建顶点着色器
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    // 创建片元着色器
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);

    if (!program) {
        throw new Error(`program create failed`);
    }
    if (!vShader || !fShader) {
        throw new Error(`shader create failed`);
    }

    const finalVert = shader?.vert ?? DEFAULT_GL2_VERT;
    const finalFrag = shader?.frag ?? DEFAULT_GL2_FRAG;
    // shader容器与着色器绑定
    gl.shaderSource(vShader, finalVert);
    gl.shaderSource(fShader, finalFrag);
    // 将GLSE语言编译成浏览器可用代码
    gl.compileShader(vShader);
    gl.compileShader(fShader);

    checkShader(gl, vShader, finalVert);
    checkShader(gl, fShader, finalFrag);
    // 将着色器添加到程序上
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);

    // 链接程序，在链接操作执行以后，可以任意修改shader的源代码，
    // 对shader重新编译不会影响整个程序，除非重新链接程序
    gl.linkProgram(program);
    // 加载并使用链接好的程序
    gl.useProgram(program);

    const message = gl.getShaderInfoLog(fShader);
    if (message && message.length > 0) {
        /* message may be an error or a warning */
        throw message;
    }

    return program;
}

interface ShaderOptions {
    vert?: string;
    frag?: string;
    main?: string;
    vertMain?: string;
}

function getFinalShaderConfig(options?: ShaderOptions) {
    return {
        vert: options?.vert ?? (options?.vertMain ? `${simpleVertHeader}${options.vertMain}` : undefined),
        frag: options?.frag ?? (options?.main ? `${simpleFragHeader}${options.main}` : undefined),
    };
}

export function simpleInit(
    canvas: HTMLCanvasElement,
    options?: {
        fps?: number;
        ratio?: number;
        autoPlay?: boolean;

        attr?: ReturnType<typeof createInjectAttrGroup>;
        drawType?: number; // WebGL2RenderingContext.LINE_LOOP | WebGL2RenderingContext.TRIANGLE_STRIP
        clearColor?: [number, number, number, number];

        preserveDrawingBuffer?: boolean;

        useLastView?: boolean;

        // postProcess?: ShaderOptions[];
    } & ShaderOptions,
) {
    const ratio = options?.ratio ?? DEFAULT_RATIO;
    const fps = options?.fps ?? 40;

    ensureCanvas(canvas, ratio);
    const gl = createGlContext(canvas, {
        preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
    });

    const program = createProgram(gl, getFinalShaderConfig(options));

    const { inject, destroy } = useInjectGlData(gl, program, canvas, { ratio });

    const injectGroupData = options?.attr ?? injectVert();
    injectGroupData.inject(gl, program);

    inject();

    let timer = 0;
    let lastRender = Date.now();
    const tickDuration = 1000 / fps;

    const clearColor = options.clearColor ?? [0, 0, 0, 0];

    // FBO处理
    const { fbo: fbo1, texture: texture1 } = initFBO(gl);
    const { fbo: fbo2, texture: texture2 } = initFBO(gl);
    const FBOCache = [fbo1, fbo2];
    const FBOTextureCache = [texture1, texture2];
    const FBOCacheLength = FBOCache.length;

    // if(options?.postProcess){
    //     const postPostPrograms = options.postProcess?.map(shaderOptions => createProgram(gl, getFinalShaderConfig(shaderOptions)));
    // }

    // FBO处理
    let currentFBOIndex = 0;
    let prevFBOIndex = 1;

    function clear() {
        // clear
        gl.clearColor(...clearColor);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    function draw() {
        gl.drawArrays(options?.drawType ?? gl.TRIANGLE_STRIP, 0, injectGroupData.length);
    }

    let currentRenderer: undefined | (() => void) = undefined;

    function loopRender() {
        const now = Date.now();
        if (now - lastRender >= tickDuration) {
            lastRender = now;

            currentRenderer?.();
        }

        timer = requestAnimationFrame(loopRender);
    }

    function renderTickWithLastScene() {
        // 绑定到当前FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, FBOCache[currentFBOIndex]);

        // 使用上一帧的结果作为纹理输入
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, FBOTextureCache[prevFBOIndex]); // 注意这里使用交换后的texture2

        // 注入uniform
        const loc = gl.getUniformLocation(program, 'uPrev');
        gl.uniform1i(loc, 0);

        inject();

        clear();

        // 绘制到fbo
        draw();

        // 解绑FBO，后续绘制到屏幕
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // 将最终结果绘制到屏幕（使用当前FBO的纹理）
        gl.bindTexture(gl.TEXTURE_2D, FBOTextureCache[currentFBOIndex]);
        draw();

        currentFBOIndex = (currentFBOIndex + 1) % FBOCacheLength;
        prevFBOIndex = (prevFBOIndex + 1) % FBOCacheLength;
    }

    function renderTick() {
        inject();

        clear();

        // 绘制到fbo
        draw();
    }

    if (options.useLastView) {
        currentRenderer = renderTickWithLastScene;
    } else {
        currentRenderer = renderTick;
    }

    const api = {
        gl,
        inject: <M extends InjectableMethod>(
            name: string,
            method: M,
            ...value: Tail<Parameters<WebGL2RenderingContext[M]>>
        ) => {
            injectUniform(gl, program, name, method, ...value);
        },
        injectTexture: (name: string, index: number, img: HTMLImageElement, options?: TextureOptions) => {
            injectTexture(gl, program, name, index, img, options);
        },
        createUBO: (index: number, value: number[]) => {
            // layout(std140) uniform UBO
            // {
            //     vec2 data[100];
            // } ubo;
            // ubo.data[i];
            return createUBO(gl, program, index, value);
        },
        play: () => {
            cancelAnimationFrame(timer);
            loopRender();
        },
        stop: () => {
            cancelAnimationFrame(timer);
        },
    };

    if (options?.autoPlay) {
        api.play();
    }
    return api;
}

export function renderFullScreenCanvas(options?: Parameters<typeof simpleInit>[1]) {
    const canvas = document.createElement('canvas');
    document.body.style.cssText += `margin:0;padding:0;`;
    canvas.style.cssText = `display:block;width:100vw;height:100vh;background:transparent;`;
    document.body.appendChild(canvas);
    ensureCanvas(canvas);

    return simpleInit(canvas, options);
}
