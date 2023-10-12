
#ifdef GL_ES
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;

void main(){
    vec2 st=gl_FragCoord.xy/u_resolution.xy;
    
    vec2 dd = gl_FragCoord.xy / 500.;

    gl_FragColor = vec4(dd.x, 0., 0., 1.);
}
