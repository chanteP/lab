const DEFAULT_VERT = `
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  
  v_texCoord = (a_position + 1.0) * 0.5;
}
`;

const DEFAULT_FRAG = `
precision mediump float;

void main(){
    gl_FragColor=vec4(0.);
}

`;

export function ensureCanvas(canvas: HTMLCanvasElement, ratio = 2) {
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
}

export function setBlend(gl: WebGLRenderingContext, blendMode: 'normal' | 'add' | 'multiply') {
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
function injectVert(gl: WebGLRenderingContext, program: WebGLProgram) {
    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
    const vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
}

export function useInjectGlData(
    gl: WebGLRenderingContext,
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
        const uTimeLocation = gl.getUniformLocation(program, 'u_time');
        gl.uniform1f(uTimeLocation, (now.getTime() - start) / 1000);

        // 为 u_mouse 提供值
        const uMouseLocation = gl.getUniformLocation(program, 'u_mouse');
        gl.uniform2f(uMouseLocation, ...lastMousePosition);

        const uResolution = gl.getUniformLocation(program, 'u_resolution');
        gl.uniform2f(uResolution, canvas.clientWidth, canvas.clientHeight);

        // 为 u_date 提供值
        const uDateLocation = gl.getUniformLocation(program, 'u_date');
        gl.uniform4f(
            uDateLocation,
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            now.getHours() + now.getMinutes() / 60,
        );

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

export function createGlContext(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
        alpha: true,
        depth: true,
        premultipliedAlpha: true,
    });
    setBlend(gl, 'normal');
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return gl;
}

export function createProgram(gl: WebGLRenderingContext, shader?: { vert?: string; frag?: string }) {
    const program = gl.createProgram();
    // 创建顶点着色器
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    // 创建片元着色器
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);

    // shader容器与着色器绑定
    gl.shaderSource(vShader, shader?.vert ?? DEFAULT_VERT);
    gl.shaderSource(fShader, shader?.frag ?? DEFAULT_FRAG);
    // 将GLSE语言编译成浏览器可用代码
    gl.compileShader(vShader);
    gl.compileShader(fShader);
    // 将着色器添加到程序上
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    // 链接程序，在链接操作执行以后，可以任意修改shader的源代码，
    // 对shader重新编译不会影响整个程序，除非重新链接程序
    gl.linkProgram(program);
    // 加载并使用链接好的程序
    gl.useProgram(program);

    return program;
}

export function simpleInit(canvas: HTMLCanvasElement, options?: { vert?: string; frag?: string; ratio?: number }) {
    const gl = createGlContext(canvas);

    const program = createProgram(gl, options);

    const { inject, destroy } = useInjectGlData(gl, program, canvas, { ratio: options.ratio ?? 2 });
    injectVert(gl, program);
    inject();

    let timer = 0;

    function renderTick() {
        gl.clearColor(0.0, 0.0, 0.0, 0.0); // 使用透明的黑色清除颜色
        gl.clear(gl.COLOR_BUFFER_BIT);

        inject();

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        timer = requestAnimationFrame(renderTick);
    }

    return {
        gl,
        play: renderTick,
        stop: () => {
            cancelAnimationFrame(timer);
        },
    };
}
