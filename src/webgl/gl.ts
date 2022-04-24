import { vec3 } from 'gl-matrix';

type Vec3 = [number, number, number];

export const canvas = document.createElement('canvas');
document.body.style.background = '#ccc';
document.body.appendChild(canvas);

function getImage(src: string, onload: (this: HTMLImageElement, e: Event) => void) {
    const img = new Image();
    img.onload = (e) => {
        onload.call(img, e);
    };
    img.onerror = (e) => {
        console.error(`image load fail: `, e);
    };
    img.src = src;
    return img;
}

function reg(deg: number) {
    return (deg / 360) * 2 * Math.PI;
}

canvas.style.cssText = `
    display: block;
    width: 100vw;
    height: 100vh;
`;

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

// https://developer.mozilla.org/zh-CN/docs/Web/API/HTMLCanvasElement/getContext
export const gl = canvas.getContext('webgl', {
    alpha: true,
    depth: true,
    premultipliedAlpha: false,
});

// @ts-ignore
window.gl = gl;

// gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
// // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
// gl.enable(gl.BLEND);

gl.enable(gl.BLEND);
setBlend(gl, 'normal');

export function createProgram(vertex: string, fragment: string) {
    const program = gl.createProgram();
    // 创建顶点着色器
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    // 创建片元着色器
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);

    // shader容器与着色器绑定
    gl.shaderSource(vShader, vertex);
    gl.shaderSource(fShader, fragment);
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

const start = Date.now();
const fnList: ((time: number) => void)[] = [];
const renderTick = () => {
    gl.clearColor(0.0, 0.0, 0.0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    fnList.forEach((fn) => fn(Date.now() - start));
    requestAnimationFrame(renderTick);
};

renderTick();

export function render(callback: (time: number) => void) {
    fnList.push(callback);
}

function setBlend(gl: WebGLRenderingContext, blendMode: 'normal' | 'add' | 'multiply') {
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
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            break;
    }
}


function inverse(m: number[] | Float32Array) {
    const dst = new Float32Array(16);
    const m00 = m[0 * 4 + 0];
    const m01 = m[0 * 4 + 1];
    const m02 = m[0 * 4 + 2];
    const m03 = m[0 * 4 + 3];
    const m10 = m[1 * 4 + 0];
    const m11 = m[1 * 4 + 1];
    const m12 = m[1 * 4 + 2];
    const m13 = m[1 * 4 + 3];
    const m20 = m[2 * 4 + 0];
    const m21 = m[2 * 4 + 1];
    const m22 = m[2 * 4 + 2];
    const m23 = m[2 * 4 + 3];
    const m30 = m[3 * 4 + 0];
    const m31 = m[3 * 4 + 1];
    const m32 = m[3 * 4 + 2];
    const m33 = m[3 * 4 + 3];
    const tmp_0 = m22 * m33;
    const tmp_1 = m32 * m23;
    const tmp_2 = m12 * m33;
    const tmp_3 = m32 * m13;
    const tmp_4 = m12 * m23;
    const tmp_5 = m22 * m13;
    const tmp_6 = m02 * m33;
    const tmp_7 = m32 * m03;
    const tmp_8 = m02 * m23;
    const tmp_9 = m22 * m03;
    const tmp_10 = m02 * m13;
    const tmp_11 = m12 * m03;
    const tmp_12 = m20 * m31;
    const tmp_13 = m30 * m21;
    const tmp_14 = m10 * m31;
    const tmp_15 = m30 * m11;
    const tmp_16 = m10 * m21;
    const tmp_17 = m20 * m11;
    const tmp_18 = m00 * m31;
    const tmp_19 = m30 * m01;
    const tmp_20 = m00 * m21;
    const tmp_21 = m20 * m01;
    const tmp_22 = m00 * m11;
    const tmp_23 = m10 * m01;

    const t0 = (tmp_0 * m11 + tmp_3 * m21 + tmp_4 * m31) -
        (tmp_1 * m11 + tmp_2 * m21 + tmp_5 * m31);
    const t1 = (tmp_1 * m01 + tmp_6 * m21 + tmp_9 * m31) -
        (tmp_0 * m01 + tmp_7 * m21 + tmp_8 * m31);
    const t2 = (tmp_2 * m01 + tmp_7 * m11 + tmp_10 * m31) -
        (tmp_3 * m01 + tmp_6 * m11 + tmp_11 * m31);
    const t3 = (tmp_5 * m01 + tmp_8 * m11 + tmp_11 * m21) -
        (tmp_4 * m01 + tmp_9 * m11 + tmp_10 * m21);

    const d = 1.0 / (m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3);

    dst[0] = d * t0;
    dst[1] = d * t1;
    dst[2] = d * t2;
    dst[3] = d * t3;
    dst[4] = d * ((tmp_1 * m10 + tmp_2 * m20 + tmp_5 * m30) -
        (tmp_0 * m10 + tmp_3 * m20 + tmp_4 * m30));
    dst[5] = d * ((tmp_0 * m00 + tmp_7 * m20 + tmp_8 * m30) -
        (tmp_1 * m00 + tmp_6 * m20 + tmp_9 * m30));
    dst[6] = d * ((tmp_3 * m00 + tmp_6 * m10 + tmp_11 * m30) -
        (tmp_2 * m00 + tmp_7 * m10 + tmp_10 * m30));
    dst[7] = d * ((tmp_4 * m00 + tmp_9 * m10 + tmp_10 * m20) -
        (tmp_5 * m00 + tmp_8 * m10 + tmp_11 * m20));
    dst[8] = d * ((tmp_12 * m13 + tmp_15 * m23 + tmp_16 * m33) -
        (tmp_13 * m13 + tmp_14 * m23 + tmp_17 * m33));
    dst[9] = d * ((tmp_13 * m03 + tmp_18 * m23 + tmp_21 * m33) -
        (tmp_12 * m03 + tmp_19 * m23 + tmp_20 * m33));
    dst[10] = d * ((tmp_14 * m03 + tmp_19 * m13 + tmp_22 * m33) -
        (tmp_15 * m03 + tmp_18 * m13 + tmp_23 * m33));
    dst[11] = d * ((tmp_17 * m03 + tmp_20 * m13 + tmp_23 * m23) -
        (tmp_16 * m03 + tmp_21 * m13 + tmp_22 * m23));
    dst[12] = d * ((tmp_14 * m22 + tmp_17 * m32 + tmp_13 * m12) -
        (tmp_16 * m32 + tmp_12 * m12 + tmp_15 * m22));
    dst[13] = d * ((tmp_20 * m32 + tmp_12 * m02 + tmp_19 * m22) -
        (tmp_18 * m22 + tmp_21 * m32 + tmp_13 * m02));
    dst[14] = d * ((tmp_18 * m12 + tmp_23 * m32 + tmp_15 * m02) -
        (tmp_22 * m32 + tmp_14 * m02 + tmp_19 * m12));
    dst[15] = d * ((tmp_22 * m22 + tmp_16 * m02 + tmp_21 * m12) -
        (tmp_20 * m12 + tmp_23 * m22 + tmp_17 * m02));

    return dst;
}


export class Camera {
    position: Vec3 = [0, 0, 1];
    lookPoint: Vec3 = [0, 0, 0];
    private upDirection: Vec3 = [0, 1, 0];

    view = {
        top: 1,
        left: -1,
        right: 1,
        bottom: -1,

        near: 0,
        far: 100,

        // fov: 30 / 360 * 2 * Math.PI,
        fov: 30,
        aspect: 1,
    };

    constructor(view?: Camera['view']) {
        this.view = Object.assign(this.view, view);
    }

    get matrix() {
        const f = vec3.normalize(
            [],
            [
                this.lookPoint[0] - this.position[0],
                this.lookPoint[1] - this.position[1],
                this.lookPoint[2] - this.position[2],
            ],
        );

        // Calculate cross product of f and up.
        const s = vec3.normalize([], vec3.cross([], f, this.upDirection));

        // Calculate cross product of s and f.
        const u = vec3.cross([], s, f);

        // Set to this.
        return new Float32Array([...s, 0, ...u, 0, ...f.map((d) => -d), 0, ...this.position, 1]);
    }

    get inverseMatrix(){
        return inverse(this.matrix);
    }

    get orthographic() {
        const { left, right, top, bottom, far, near } = this.view;
        const dst = new Float32Array(16);

        dst[0] = 2 / (right - left);
        dst[1] = 0;
        dst[2] = 0;
        dst[3] = 0;
        dst[4] = 0;
        dst[5] = 2 / (top - bottom);
        dst[6] = 0;
        dst[7] = 0;
        dst[8] = 0;
        dst[9] = 0;
        dst[10] = 2 / (near - far);
        dst[11] = 0;
        dst[12] = (left + right) / (left - right);
        dst[13] = (bottom + top) / (bottom - top);
        dst[14] = (near + far) / (near - far);
        dst[15] = 1;

        return dst;
    }

    get perspective() {
        const { left, right, top, bottom, far, near, fov, aspect } = this.view;
        const dst = new Float32Array(16);

        const fovReg = reg(fov);

        const f = Math.tan(Math.PI * 0.5 - fovReg * 0.5);
        const rangeInv = 1.0 / (near - far);

        dst[0] = f / aspect;
        dst[1] = 0;
        dst[2] = 0;
        dst[3] = 0;
        dst[4] = 0;
        dst[5] = f;
        dst[6] = 0;
        dst[7] = 0;
        dst[8] = 0;
        dst[9] = 0;
        dst[10] = (near + far) * rangeInv;
        dst[11] = -1;
        dst[12] = 0;
        dst[13] = 0;
        dst[14] = near * far * rangeInv * 2;
        dst[15] = 0;

        return dst;
    }

    moveTo(position: Vec3) {
        this.position = [...position];
    }

    lookAt(point: Vec3, upDirection?: Vec3) {
        this.lookPoint = [...point];
        this.upDirection = [...(upDirection ?? this.upDirection)];
    }
}

export function createDefine(gl: WebGLRenderingContext, program: WebGLProgram) {
    return {
        // 定义uniform
        defineVec(name: string, value: number[]) {
            const v = gl.getUniformLocation(program, name);
            gl[`uniform${value.length}f`](v, ...value);
            return v;
        },
        defineMat(name: string, value: number[] | Float32Array) {
            const v = gl.getUniformLocation(program, name);
            gl[`uniformMatrix${Math.sqrt(value.length)}fv`](v, false, new Float32Array(value));
            return v;
        },
        defineTexture: (() => {
            let textureIndex = 0;

            return (name: string, image: string) => {
                const index = textureIndex++;
                const texture = gl.createTexture();
                const sampler = gl.getUniformLocation(program, name);

                getImage(image, function (e) {
                    // 纹理yFlip
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
                    gl.activeTexture(gl[`TEXTURE${index}`]);
                    gl.bindTexture(gl.TEXTURE_2D, texture);

                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.uniform1i(sampler, index);

                    const img = this;
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                });
            };
        })(),
        // 定义顶点buffer
        defineVertexBuffer(value: number[], varList: [string, number][], indices: number[] = []) {
            const data = new Float32Array(value);

            const vBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

            const totalLen = varList.reduce((d, c) => (d += c[1]), 0);

            let i = 0;
            varList.forEach(([name, len]) => {
                const v = gl.getAttribLocation(program, name);
                gl.vertexAttribPointer(
                    v,
                    len,
                    gl.FLOAT,
                    false,
                    data.BYTES_PER_ELEMENT * totalLen,
                    data.BYTES_PER_ELEMENT * i,
                );
                gl.enableVertexAttribArray(v);

                console.log(`define attribute [${name}] ${i} - ${i + len}(${len}) in ${totalLen}`);

                i += len;
            });

            // 添加索引
            let indicesData: [] | Uint8Array = [];
            if (indices.length) {
                indicesData = new Uint8Array(indices);

                const indexBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indicesData, gl.STATIC_DRAW);
                console.log(`define indices`, indicesData);
            }

            return {
                data: data,
                length: data.length / i,
                indices: indicesData,
                indicesLength: indicesData.length,
            };
        },
    };
}
