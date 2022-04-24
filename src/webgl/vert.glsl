attribute vec4 position;
varying vec4 v_position;
attribute vec4 color;
varying vec4 v_Color;

attribute vec2 textCoord;
varying vec2 v_textCoord;

// 法向量
attribute vec4 normal;
varying vec3 v_normal;

// camera
uniform mat4 viewMatrix;
// 裁剪
uniform mat4 clipMatrix;

void main(){
    gl_Position=clipMatrix*viewMatrix*vec4(position.xyz,1.);
    gl_PointSize=1.;
    
    // 法向量归一化。为什么这个不在js做？
    v_normal=normalize(vec3(normal));
    v_Color=color;
    v_textCoord=textCoord;
}
