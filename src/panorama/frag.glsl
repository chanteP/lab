precision mediump float;

// 分辨率，全景图和旋转矩阵
uniform vec2 u_resolution;
uniform sampler2D u_image;
uniform mat3 u_rotation;

void main() {
    // 获取当前像素的坐标（-1到1）
    vec2 xy = (gl_FragCoord.xy / u_resolution - 0.5) * 2.0;

    // 将2D坐标转换为3D坐标
    vec3 direction = normalize(vec3(xy, -1.0));

    // 应用旋转矩阵
    direction = u_rotation * direction;

    // 转换到球面坐标
    float lon = atan(direction.x, direction.z);
    float lat = asin(direction.y);

    // 转换到UV坐标
    vec2 uv;
    uv.x = lon / (2.0 * 3.1415926) + 0.5;
    uv.y = lat / 3.1415926 + 0.5;

    // 从全景图中采样
    gl_FragColor = texture2D(u_image, uv);
}
