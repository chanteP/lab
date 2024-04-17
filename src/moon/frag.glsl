
// https://www.shadertoy.com/view/4lfXRf
#ifdef GL_ES
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D iChannel0;
uniform vec2 moonSize;

#define PI 3.141592653589793
#define PI_OVER_2 1.5707963267948966
#define SPEED 0.1

vec2 getLatLon(vec2 pos,vec2 center,float r,float offsetLong){
    float lat=asin((pos.y-center.y)/r);
    
    float r1=cos(lat)*r;
    float lon=acos((center.x-pos.x)/r1)+offsetLong;
    
    return vec2(lat/PI*2.,fract(lon/2./PI));
}

vec2 moonCoordFromLatlon(vec2 latlon){
    float x=latlon.y;
    float y=latlon.x/2.+.5;
    // float y=sin(latlon.x)/2.+.5;
    return vec2(x,y);
}

vec4 moonShadow(vec2 latlon,float offset){
    float shadowValue=cos((offset-latlon.y)*2.*PI)/2.+.5;
    return vec4(max(shadowValue,.2),shadowValue,shadowValue,1.);
}

void main(){
    vec4 pixel=vec4(0.);
    
    vec2 pos=gl_FragCoord.xy;
    vec2 center=vec2(u_resolution.xy)/2.;
    float r=min(u_resolution.x,u_resolution.y)/1.5/2.;
    
    vec2 vec=pos/u_resolution;
    
    if(distance(pos,center)<=r){
        vec2 latlon=getLatLon(pos,center,r,1.8+u_time*SPEED);
        vec2 moonCoord=moonCoordFromLatlon(latlon);
        // pixel.r=abs(latlon.x);
        // pixel.b=latlon.y;
        // pixel.a=1.;
        pixel=texture2D(iChannel0,moonCoord);
        vec4 shadow=moonShadow(latlon,(u_time*SPEED));
        pixel=pixel*shadow;
        // pixel=shadow;
        
        // pixel=moonShadow(vec, (u_time/SPEED));
        // pixel.b=latlon.y;
        // pixel.r=fract(u_time);
        pixel.a=1.;
    }
    
    gl_FragColor=vec4(pixel);
}
