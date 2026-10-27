export const vertexShader = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() { vUv = vec2(aPosition.x * .5 + .5, .5 - aPosition.y * .5); gl_Position = vec4(aPosition, 0., 1.); }`;

export const fragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImage;
uniform sampler2D uCurves;
uniform vec2 uTexel;
uniform vec4 uBasic;
uniform vec4 uBasic2;
uniform vec3 uDetail;
uniform vec3 uWhiteBalance;
uniform vec4 uOptics;
uniform vec3 uMixer[8];
uniform vec3 uGrade[3];
uniform vec3 uGradeLum;
uniform vec2 uGradeControl;
uniform mat3 uCalibration;
uniform float uShadowTint;
uniform float uVibrance;
uniform float uSaturation;
uniform vec3 uGrain;
uniform int uCompare;
uniform float uSplit;

float lum(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.), vec3(1. / 2.4)) - .055, step(.0031308, c)); }
vec3 rgb2hsl(vec3 c) {
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
    float l = (mx + mn) * .5, h = 0., s = 0.;
    if (d > .00001) {
        s = d / (1. - abs(2. * l - 1.));
        if (mx == c.r) h = mod((c.g - c.b) / d, 6.);
        else if (mx == c.g) h = (c.b - c.r) / d + 2.;
        else h = (c.r - c.g) / d + 4.;
        h *= 60.;
    }
    return vec3(h, s, l);
}
float hueChannel(float p, float q, float t) {
    if (t < 0.) t += 1.; if (t > 1.) t -= 1.;
    if (t < 1. / 6.) return p + (q - p) * 6. * t;
    if (t < .5) return q;
    if (t < 2. / 3.) return p + (q - p) * (2. / 3. - t) * 6.;
    return p;
}
vec3 hsl2rgb(vec3 hsl) {
    float h = mod(hsl.x, 360.) / 360., s = clamp(hsl.y, 0., 1.), l = clamp(hsl.z, 0., 1.);
    if (s < .00001) return vec3(l);
    float q = l < .5 ? l * (1. + s) : l + s - l * s, p = 2. * l - q;
    return vec3(hueChannel(p, q, h + 1. / 3.), hueChannel(p, q, h), hueChannel(p, q, h - 1. / 3.));
}
float centerAt(int i) {
    if (i == 0) return 0.; if (i == 1) return 30.; if (i == 2) return 60.; if (i == 3) return 120.;
    if (i == 4) return 180.; if (i == 5) return 225.; if (i == 6) return 275.; return 315.;
}
vec3 applyMixer(vec3 c) {
    vec3 hsl = rgb2hsl(c);
    for (int i = 0; i < 8; i++) {
        float d = abs(hsl.x - centerAt(i)); d = min(d, 360. - d);
        float w = clamp(1. - d / 45., 0., 1.);
        hsl.x += uMixer[i].x * .6 * w;
        hsl.y *= 1. + uMixer[i].y / 100. * w;
        hsl.z += uMixer[i].z / 200. * w;
    }
    return hsl2rgb(hsl);
}
vec3 sourceAt(vec2 uv) {
    vec2 p = uv - .5;
    float r2 = dot(p, p), k = 1. + uOptics.x / 100. * r2 * (1.5 - uOptics.w / 100.);
    vec2 d = p * k;
    float ca = uOptics.y / 10000. * r2;
    return vec3(texture(uImage, .5 + d * (1. + ca)).r, texture(uImage, .5 + d).g, texture(uImage, .5 + d * (1. - ca)).b);
}
vec3 curve(vec3 c) {
    c = vec3(texture(uCurves, vec2(clamp(c.r, 0., 1.), .125)).r, texture(uCurves, vec2(clamp(c.g, 0., 1.), .125)).r, texture(uCurves, vec2(clamp(c.b, 0., 1.), .125)).r);
    return vec3(texture(uCurves, vec2(c.r, .375)).r, texture(uCurves, vec2(c.g, .625)).r, texture(uCurves, vec2(c.b, .875)).r);
}
void main() {
    vec3 original = sourceAt(vUv);
    if (uCompare == 1 || (uCompare == 2 && vUv.x < uSplit)) { outColor = vec4(original, 1.); return; }
    vec3 c = toLinear(clamp(original, 0., 1.));
    float temp = uWhiteBalance.x / 100., tint = uWhiteBalance.y / 100.;
    c *= vec3(1. + temp * .35, 1. - abs(temp) * .04 + tint * .18, 1. - temp * .35);
    c *= exp2(uBasic.x);
    float l = lum(c), sw = 1. - clamp(l * 2., 0., 1.), hw = clamp((l - .5) * 2., 0., 1.);
    c += uBasic.w / 100. * sw * .35 + uBasic.z / 100. * hw * .3;
    c += uBasic2.x / 100. * .35 * clamp(l * 2., 0., 1.) + uBasic2.y / 100. * .3 * (1. - clamp(l * 2., 0., 1.));
    c = (c - .18) * (1. + uBasic.y / 100.) + .18;
    float mean = (texture(uImage, vUv + vec2(uTexel.x * 2., 0.)).r + texture(uImage, vUv - vec2(uTexel.x * 2., 0.)).r + texture(uImage, vUv + vec2(0., uTexel.y * 2.)).r + texture(uImage, vUv - vec2(0., uTexel.y * 2.)).r) * .25;
    float local = toLinear(vec3(mean)).r;
    c += (c - local) * (uDetail.x / 100. * .25 + uDetail.y / 100. * .18 * (1. - abs(l - .5)));
    c += uDetail.z / 100. * (lum(c) - .5) * .35;
    float avg = (c.r + c.g + c.b) / 3., mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    float sat = mx > 0. ? (mx - mn) / mx : 0.;
    c = avg + (c - avg) * (1. + uSaturation / 100. + uVibrance / 100. * (1. - sat));
    // Curves use display-referred values, matching Camera Raw's perceptual dragging behavior.
    c = toLinear(curve(toSrgb(clamp(c, 0., 1.))));
    c = applyMixer(clamp(c, 0., 1.));
    l = lum(c);
    float balance = uGradeControl.y / 100., blend = mix(.05, .45, uGradeControl.x / 100.);
    float hw2 = smoothstep(.45 + balance * .25, .45 + balance * .25 + blend, l);
    float sw2 = 1. - smoothstep(max(0., .55 + balance * .25 - blend), .55 + balance * .25, l), mw = max(0., 1. - hw2 - sw2);
    c += uGrade[0] * sw2 + uGrade[1] * mw + uGrade[2] * hw2;
    c *= 1. + (uGradeLum.x * sw2 + uGradeLum.y * mw + uGradeLum.z * hw2) / 100.;
    c = uCalibration * c;
    c += vec2(-uShadowTint, uShadowTint).xyx / 1000. * sw;
    float vignette = smoothstep(.65, .05, length((vUv - .5) * vec2(1.2, 1.)));
    c *= 1. + uOptics.z / 100. * mix(.25, 1., vignette);
    float grainSize = 1. + uGrain.y / 18.;
    vec2 grainCell = floor(gl_FragCoord.xy / grainSize);
    float grainNoise = fract(sin(dot(grainCell, vec2(12.9898, 78.233))) * 43758.5453);
    float grainFine = fract(sin(dot(grainCell + 17., vec2(39.3468, 11.135))) * 24634.6345);
    grainNoise = mix(grainNoise, grainFine, uGrain.z / 300.);
    c += (grainNoise - .5) * uGrain.x / 100. * .22 * (1. - lum(c) * .45);
    outColor = vec4(toSrgb(clamp(c, 0., 1.)), 1.);
}`;
