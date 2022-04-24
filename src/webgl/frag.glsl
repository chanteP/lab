precision mediump float;
uniform sampler2D u_sampler;
uniform sampler2D u_sampler_mask;
uniform int mask_mode;

varying vec4 v_Color;
varying vec2 v_textCoord;
varying vec3 v_normal;
varying vec4 v_position;

// 平行光
uniform vec3 lightColor;
uniform vec3 lightDirection;
// 环境光
uniform vec3 ambientLightColor;
// 点光
uniform vec3 pointLightColor;
uniform vec3 pointLightPosition;


void main(){
    // // 漫反射颜色
    // float dotLight=max(dot(lightDirection,v_normal),0.);
    // vec3 diffuse=lightColor*vec3(v_Color)*dotLight;
    // // 环境光
    // vec3 ambient=ambientLightColor*v_Color.rgb;
    // // 点光
    // vec3 pointLightDirection=normalize(pointLightPosition-vec3(v_position));
    // float pointDotLight=max(dot(pointLightDirection,v_normal),0.);
    // vec3 pointDiffuse=pointLightColor*vec3(v_Color)*pointDotLight;
    
    // gl_FragColor=vec4(pointDiffuse + diffuse+ambient,v_Color.a);


    gl_FragColor=v_Color;
}
