
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
#define PI_2 6.283185307179586
#define SPEED.1

vec2 getLatLon(vec2 pos,vec2 center,float r,float offsetLong){
    float lat=asin((pos.y-center.y)/r);
    
    float r1=cos(lat)*r;
    float lon=acos((center.x-pos.x)/r1)+offsetLong;
    
    return vec2(lat/PI*2.,fract(lon/2./PI));
}

vec3 getXYZ(vec2 latlon,float r){
    float r1=cos(latlon.x*PI/2.)*r;
    
    return vec3(
        r1*cos(latlon.y*2.*PI),
        r*sin(latlon.x*PI/2.),
        r1*sin(latlon.y*2.*PI)
    );
}

vec2 moonCoordFromLatlon(vec2 latlon){
    float x=latlon.y;
    float y=latlon.x/2.+.5;
    // float y=sin(latlon.x)/2.+.5;
    return vec2(x,y);
}

// vec4 moonLight(vec2 latlon,float offset, vec4 light){
    //     float scale=6.;
    //     float shadowValue=cos((offset-latlon.y)*2.*PI)*scale/2.+.5;
    //     shadowValue=clamp(shadowValue,0.,1.2);
    
    //     return vec4(shadowValue,shadowValue,shadowValue,1.);
// }

mat3 getRotationMatrixZ(float theta){
    float c=cos(theta);// GLSL 中的cos函数返回弧度的余弦值
    float s=sin(theta);// GLSL 中的sin函数返回弧度的正弦值
    
    // 创建绕z轴的旋转矩阵
    mat3 rotationMatrix=mat3(
        c,-s,0,
        0,0,1,
        s,c,0
    );
    
    return rotationMatrix;
}
// 计算旋转后的坐标
vec3 getRotatedPoint(float r,float degreeOffset,float t){
    vec3 targetA=vec3(
        r*cos(t),
        r*sin(t),
        0.
    );
    mat3 R=getRotationMatrixZ(degreeOffset);
    return R*targetA;
}

// 计算两个向量之间的夹角（弧度值）
float calculateAngle(vec3 vecA,vec3 vecB){
    // 计算两个向量的点乘
    float dotProduct=dot(vecA,vecB);
    // 计算两个向量的模长
    float lengthA=length(vecA);
    float lengthB=length(vecB);
    // 计算夹角的余弦值
    float cosAngle=dotProduct/(lengthA*lengthB);
    // 确保余弦值在[-1, 1]的范围内，防止由于精度问题导致的计算错误
    cosAngle=clamp(cosAngle,-1.,1.);
    // 计算夹角（弧度值）
    float angle=acos(cosAngle);
    return angle;
}

vec4 moonLight(vec2 latlon,float t,vec4 lightColor){
    float lightDistance=12.;
    float degreeOffset=PI/180.*-12.;
    // float degreeOffset = 0.;
    vec3 lightPos=getRotatedPoint(lightDistance,degreeOffset,t);
    
    vec3 pos=getXYZ(latlon,1.);
    
    float angle=calculateAngle(pos,lightPos);
    
    float shadowValue=max(0., cos(angle));
    
    return vec4(shadowValue,shadowValue,shadowValue,1.)*lightColor;
}

void main(){
    vec4 pixel=vec4(0.);
    
    vec2 pos=gl_FragCoord.xy;
    vec2 center=vec2(u_resolution.xy)/2.;
    float r=min(u_resolution.x,u_resolution.y)/1.5/2.;
    
    vec4 lightColor=vec4(1.,.9765,.8706,1.);
    vec4 spaceColor=vec4(.051,0.,1.,1.) * .08;
    
    vec2 vec=pos/u_resolution;
    
    if(distance(pos,center)<=r){
        vec2 latlon=getLatLon(pos,center,r,4.*(1.8+u_time*SPEED));
        vec2 moonCoord=moonCoordFromLatlon(latlon);
        
        pixel=texture2D(iChannel0,moonCoord);
        
        float lightT=u_time*SPEED*5.;
        vec4 light=moonLight(latlon,lightT,lightColor*1.7);
        
        pixel=pixel*light+spaceColor;
        // pixel=shadow;
        
        // pixel=moonLight(vec, (u_time/SPEED));
        // pixel.b=latlon.y;
        // pixel.r=fract(u_time);
        pixel.a=1.;
    }
    
    gl_FragColor=vec4(pixel);
}
