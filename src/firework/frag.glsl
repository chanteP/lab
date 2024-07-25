
uniform sampler2D noise;

vec3 random3(vec2 pos, float zoom){
    vec4 ran=texture(noise,pos/zoom);
    return ran.xyz;
}

vec2 getGridIndex(vec2 pos){
    return vec2(
        trunc(pos.x),
        trunc(pos.y)
    );
}

void main(){
    float grid = 3.;
    vec2 pos=fragCoord.xy/iResolution.x * grid;

    vec2 gridIndex = getGridIndex(pos);

    float dis = distance(pos, gridIndex);

    // vec2 samplerP=vec2(pos.x+iTime/10.,pos.y);
    // vec3 ran = random3(samplerP, 5.);

    vec4 color = vec4(dis,dis,dis,1.);

    fragColor=color;
}
