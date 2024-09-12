import { createInjectAttrGroup, getNoiseImg, renderFullScreenCanvas } from '../common/gl';

const triangleWithColor = createInjectAttrGroup();

const len = 0.8;
const side = 3;
const PI2 = Math.PI * 2;

triangleWithColor.addGroup(
    'position',
    Array.from({ length: side }).map((_, index) => {
        const currentAngle = (PI2 / side) * index;
        return [len * Math.sin(currentAngle), len * Math.cos(currentAngle)];
    }),
);
triangleWithColor.addGroup('color', [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
]);

const { gl, play, injectTexture } = renderFullScreenCanvas({
    vertMain: `
    in vec2 position;
    in vec3 color;

    out vec3 v_color;

    uniform vec3 iResolution;

    void main() {
        vec2 p = position.xy;
        p.y = p.y * iResolution.x / iResolution.y;
        

        gl_Position = vec4(p.xy, 0.0, 1.0);
        v_texCoord = (p + 1.0) * 0.5;
        v_color = color;
    }
    `,
    main: `
    in vec3 v_color;

    void main(){
        vec2 st=fragCoord.xy/iResolution.xy;
        // fragColor=vec4(st.x,0.,st.y,1.);
        fragColor=vec4(v_color.rgb,1.);
    }
    `,
    autoPlay: true,
    attr: triangleWithColor,
});
