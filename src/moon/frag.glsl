
// https://www.shadertoy.com/view/4lfXRf
#ifdef GL_ES
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D iChannel0;

#define PI 3.141592653589793

vec2 normalizeVec2(vec2 value,vec2 rangeMin,vec2 rangeMax){
    vec2 normalizedValue;
    vec2 range=rangeMax-rangeMin;
    
    normalizedValue.x=(value.x-rangeMin.x)/range.x;
    normalizedValue.y=(value.y-rangeMin.y)/range.y;
    
    return normalizedValue;
}

// 将纹理坐标转换为球体表面坐标
// 2:1贴图
// offset [0, 1]
vec2 mapToSphere(vec2 uv,float offset){
    // 转换输入的uv值使原点位于中心，范围是[-1, 1]
    // 换算map尺寸为4:2，半径1的圆
    vec2 center=vec2(offset+.5,1.);
    vec2 normalizedPos=vec2(
        uv.x*4.,
        2.*uv.y-1.
    );
    
    vec2 pos=vec2(1.);
    
    float phi=normalizedPos.y/PI;
    pos.y=sin(phi)+.5;
    
    float rTheta=sin(PI/2.-phi);
    float xp=center.x-normalizedPos.x;
    float theta=acos(xp/rTheta);
    
    pos.x=(theta/(2. * PI));
    // pos.y = normalizedPos.y / 2.;
    return pos;
}

vec4 readMoon(vec2 st){
    // vec2 uv=st;
    vec2 uv=mapToSphere(st,0.);
    
    return vec4(uv.x,0.,0.,uv.y);
    // vec4 pixel=texture2D(iChannel0,uv);
    // return pixel;
}

void main(){
    vec4 pixel=vec4(0.);
    
    vec2 center=vec2(u_resolution.xy)/2.;
    float size=u_resolution.x/2.;
    
    vec2 o=center-size/2.;
    vec2 e=center+size/2.;
    vec2 pos=gl_FragCoord.xy;
    
    if(distance(pos,center)<=size/2.){
        pixel=readMoon(normalizeVec2(pos,o,e));
    }
    
    gl_FragColor=vec4(pixel);
}
