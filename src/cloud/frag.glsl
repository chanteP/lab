// https://www.shadertoy.com/view/XslGRr
uniform sampler2D uNoise;

#define NUM_OCTAVES 5

mat3 setCamera(in vec3 ro,in vec3 ta,float cr)
{
    vec3 cw=normalize(ta-ro);
    vec3 cp=vec3(sin(cr),cos(cr),0.);
    vec3 cu=normalize(cross(cw,cp));
    vec3 cv=normalize(cross(cu,cw));
    return mat3(cu,cv,cw);
}

float noise(in vec3 x)
{
    vec3 p=floor(x);
    vec3 f=fract(x);
    f=f*f*(3.-2.*f);
    
    // vec2 uv=(p.xy+vec2(37.,239.)*p.z)+f.xy;
    // vec2 rg=textureLod(uNoise,(uv+.5)/256.,0.).yx;
    // return mix(rg.x,rg.y,f.z)*2.-1.;
    
    ivec3 q=ivec3(p);
    ivec2 uv=q.xy+ivec2(37,239)*q.z;
    vec2 rg=mix(mix(texelFetch(uNoise,(uv)&255,0),
    texelFetch(uNoise,(uv+ivec2(1,0))&255,0),f.x),
    mix(texelFetch(uNoise,(uv+ivec2(0,1))&255,0),
    texelFetch(uNoise,(uv+ivec2(1,1))&255,0),f.x),f.y).yx;
    return mix(rg.x,rg.y,f.z)*2.-1.;
}

float map5(in vec3 p)
{
    vec3 q=p-vec3(0.,.1,1.)*iTime;
    float f;
    f=.50000*noise(q);q=q*2.02;
    f+=.25000*noise(q);q=q*2.03;
    f+=.12500*noise(q);q=q*2.01;
    f+=.06250*noise(q);q=q*2.02;
    f+=.03125*noise(q);
    return clamp(1.5-p.y-2.+1.75*f,0.,1.);
}
float map4(in vec3 p)
{
    vec3 q=p-vec3(0.,.1,1.)*iTime;
    float f;
    f=.50000*noise(q);q=q*2.02;
    f+=.25000*noise(q);q=q*2.03;
    f+=.12500*noise(q);q=q*2.01;
    f+=.06250*noise(q);
    return clamp(1.5-p.y-2.+1.75*f,0.,1.);
}
float map3(in vec3 p)
{
    vec3 q=p-vec3(0.,.1,1.)*iTime;
    float f;
    f=.50000*noise(q);q=q*2.02;
    f+=.25000*noise(q);q=q*2.03;f+=.12500*noise(q);
    return clamp(1.5-p.y-2.+1.75*f,0.,1.);
}
float map2(in vec3 p)
{
    vec3 q=p-vec3(0.,.1,1.)*iTime;
    float f;
    f=.50000*noise(q);
    q=q*2.02;f+=.25000*noise(q);;
    return clamp(1.5-p.y-2.+1.75*f,0.,1.);
}

const vec3 sundir=vec3(-.7071,0.,-.7071);
const vec3 lightColor=vec3(.949,.3529,.2314);
const vec3 backColor=vec3(.91,.98,1.05);
const vec3 foreGroundColor=vec3(1.,.95,.8);
const vec3 backGroundColor=vec3(.25,.3,.35);

#define MARCH(STEPS,MAPLOD)for(int i=0;i<STEPS;i++){vec3 pos=ro+t*rd;if(pos.y<-3.||pos.y>2.||sum.a>.99)break;float den=MAPLOD(pos);if(den>.01){float dif=clamp((den-MAPLOD(pos+.3*sundir))/.6,0.,1.);vec3 lin=lightColor*dif+backColor;vec4 col=vec4(mix(foreGroundColor,backGroundColor,den),den);col.xyz*=lin;col.xyz=mix(col.xyz,bgcol,1.-exp(-.003*t*t));col.w*=.4;col.rgb*=col.a;sum+=col*(1.-sum.a);}t+=max(.06,.05*t);}

vec4 raymarch(in vec3 ro,in vec3 rd,in vec3 bgcol,in ivec2 px)
{
    vec4 sum=vec4(0.);
    float t=.3*texelFetch(uNoise,px&255,0).x;
    MARCH(40,map5);
    MARCH(40,map4);
    MARCH(30,map3);
    MARCH(30,map2);
    return clamp(sum,0.,1.);
}

vec4 render(in vec3 ro,in vec3 rd,in ivec2 px)
{
    // background sky
    float sun=clamp(dot(sundir,rd),0.,1.);
    vec3 col=vec3(.6,.71,.75)-rd.y*.2*vec3(1.,.5,1.)+.15*.5;
    col+=.2*vec3(1.,.6,.1)*pow(sun,8.);
    // clouds
    vec4 res=raymarch(ro,rd,col,px);
    col=col*(1.-res.w)+res.xyz;
    // sun glare
    col+=vec3(.2,.08,.04)*pow(sun,3.);
    return vec4(col,distance(col.xyz,vec3(0.,0.,0.)));
    // return vec4(col,1.);
}

void main()
{
    vec2 p=(2.*fragCoord-iResolution.xy)/iResolution.y;
    vec2 m=vec2(-iResolution.x/2.,400.)*iMouse.xy/iResolution.xy;
    
    // camera
    vec3 ro=4.*normalize(vec3(sin(3.*m.x),.8*m.y,cos(3.*m.x)))-vec3(0.,-.9,0.);
    vec3 ta=vec3(0.,-1.,0.);
    // mat3 ca=setCamera(ro,ta,.07*cos(.25*iTime));
    mat3 ca=setCamera(ro,ta,.07);
    // ray
    vec3 rd=ca*normalize(vec3(p.xy,1.5));
    
    fragColor=render(ro,rd,ivec2(fragCoord-.5));
}
