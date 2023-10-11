
// https://www.shadertoy.com/view/4lfXRf
#ifdef GL_ES
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D iChannel0;

#define NUM_PARTICLES 75
#define NUM_FIREWORKS 5

vec3 pow3(vec3 v,float p)
{
    return pow(abs(v),vec3(p));
}

vec2 noise(vec2 tc){
    return (2.*texture2D(iChannel0, tc).xy-1.).xy;
}


vec3 fireworks(vec2 p){
    vec3 color=vec3(0.,0.,0.);
    
    for(int fw=0;fw<NUM_FIREWORKS;fw++){
        vec2 pos=noise(vec2(.82,.11)*float(fw))*1.5;
        float time=mod(u_time*3.,6.*(1.+noise(vec2(.123,.987)*float(fw)).x));
        for(int i=0;i<NUM_PARTICLES;i++)
        {
            vec2 dir=noise(vec2(.512,.133)*float(i));
            dir.y-=time*.1;
            float term=1./length(p-pos-dir*time)/50.;
            color+=pow3(vec3(
                    term*noise(vec2(.123,.133)*float(i)).y,
                    .8*term*noise(vec2(.533,.133)*float(i)).x,
                    .5*term*noise(vec2(.512,.133)*float(i)).x),
                1.25);
            }
        }
        return color;
    }
    
    void main(){
        vec2 p=2.*gl_FragCoord.xy/u_resolution.xy-1.;
        p.x*=u_resolution.x/u_resolution.y;
        
        vec3 color=fireworks(p);
        gl_FragColor=vec4(color,1.);
    }