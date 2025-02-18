
uniform sampler2D uPrev;

void main(){
    vec2 st=fragCoord.xy/iResolution.xy;
    
    vec4 last=texture(uPrev,st,1.);
    
    st.x=st.x+iTime/100. * 2.;
    float d=distance(st,vec2(.5));
    
    vec4 color=last;
    // vec4 color=vec4(0.);
    // color.a = color.a * .9;
    // color.r = color.b * .9;
    // color.b = 0.5;
    
    if(d<.1){
        // fragColor=vec4(0.,0.,1.,1.);
        color = vec4(0.,0.,1.,1.);
    }else{
        // fragColor=vec4(0.,0.,0.,.1);
        color.a -= 0.01;
    }
    
    fragColor=color;
    
}
