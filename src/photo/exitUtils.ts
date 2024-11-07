import exifr from 'exifr/dist/full.esm.mjs'; // to use ES Modules

const translateCNMap = {
    ImageWidth: '图像宽度',
    ImageHeight: '图像高度',
    Make: '制造商',
    Model: '型号',
    Software: '软件',
    ExposureTime: '曝光时间',
    ShutterSpeedValue: '快门速度值',
    FNumber: '光圈值',
    ApertureValue: '光圈值',
    ISO: '感光度',
    LensModel: '镜头型号',
    latitude: '纬度',
    longitude: '经度',
    InteropIndex: '互操作性索引',
    InteropVersion: '互操作性版本',
    ThumbnailLength: '缩略图长度',
    Headline: '标题',
    Byline: '作者',
    Credit: '版权信息',
    Caption: '说明',
    Source: '来源',
    Country: '国家',
    ProfileVersion: '色彩配置文件版本',
    ProfileClass: '色彩配置文件类别',
    ColorSpaceData: '色彩空间数据',
    ProfileConnectionSpace: '配置文件连接空间',
    ProfileFileSignature: '配置文件文件签名',
    DeviceManufacturer: '设备制造商',
    RenderingIntent: '渲染意图',
    ProfileCreator: '配置文件创建者',
    ProfileDescription: '配置文件描述',
};

export async function parseExif(image: File) {
    // console.log(image);
    // console.log(exifr);
    // https://www.npmjs.com/package/exifr
    const options = {
        jfif: true,
        xmp: false,
        icc: false,
        iptc: false,
        ifd0: true,
        ifd1: true,
        exif: true,
        gps: true,
        interop: true,
        makerNote: true,
        userComment: true,
        multiSegment: false,
        skip: [],
        pick: [],
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
        sanitize: true,
        mergeOutput: false,
        silentErrors: true,
        chunked: true,
        firstChunkSizeNode: 512,
        firstChunkSizeBrowser: 65536,
        chunkSize: 65536,
        chunkLimit: 5,
        ihdr: true,
    };
    const exif = await exifr.parse(image, options);
    console.log(exif);
    return exif;
}

function translate(key: string, enable = false) {
    if (!enable) {
        return key;
    }
    return translateCNMap[key] ?? key;
}

type Field = { key: string; name: string; value: string };
type Group = { title: string; fields: Field[] };

export async function parseFile(file: File, cn = false) {
    const data = await parseExif(file);

    const result = {
        ifd0: undefined as Group,
        exif: undefined as Group,
        gps: undefined as Group,
        others: [] as Group[],
    };

    Object.keys(data).forEach((group) => {
        const value = {
            title: translate(group, cn),
            fields: Object.keys(data[group]).map((field) => {
                return {
                    name: translate(field, cn),
                    key: field,
                    value: data[group][field],
                };
            }),
        };

        if (group in result) {
            result[group] = value;
        } else {
            result['others'].push(value);
        }
    });

    return result;
}
