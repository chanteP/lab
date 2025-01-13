import { ref, shallowRef } from 'vue';
import { FileInfo } from '../common/file';
import { getColorByString, sleep } from '../common/common';
import { parse } from 'exifr/dist/lite.esm.mjs'; // to use ES Modules
import { timeout } from '../common/common';

export interface PhotoUnit {
    // url: string;
    info: FileInfo;
    meta: {
        // 焦距
        FocalLength: number;
        // 光圈
        FNumber: number;
        // 快门
        ExposureTime: string;
        // ISO
        ISOSpeedRatings: number;
        // 日期
        DateTime: string;
        // 相机
        Model: string;
        // 镜头
        Lens: string;
    };
}

export async function parseExif(image: File) {
    // console.log(image);
    // console.log(exifr);
    // https://www.npmjs.com/package/exifr
    const options = {
        jfif: false,
        xmp: false,
        icc: false,
        iptc: false,
        ifd0: true,
        ifd1: false,
        exif: true,
        gps: false,
        interop: true,
        makerNote: false,
        userComment: false,
        multiSegment: false,
        skip: [],
        pick: [],
        translateKeys: true,
        translateValues: true,
        reviveValues: false,
        sanitize: true,
        mergeOutput: false,
        silentErrors: false,
        chunked: true,
        firstChunkSizeNode: 512,
        firstChunkSizeBrowser: 65536,
        chunkSize: 65536,
        chunkLimit: 5,
        ihdr: false,
    };
    const exif = await timeout<any>(parse(image, options), 5000);
    return exif;
}

export function getExposureString(value: number) {
    if (value >= 1) {
        return String(value);
    }
    return `1/${Math.round(1 / value)}`;
}
function getTechValue(data: string) {
    let denominator = 0;
    let numerator = 0;
    const arr = data.split('/');
    denominator = Number(arr[1]) || 1;
    numerator = Number(arr[0]);
    return numerator / denominator;
}

export function getBasicBarOptionsWithModel<T extends keyof PhotoUnit['meta']>(
    photos: PhotoUnit[],
    modelOrLens: 'Model' | 'Lens',
    field: T,
    xList: PhotoUnit['meta'][T][],
) {
    const xAxisData = xList;

    // 计算纵轴数据
    const modelCounts: { [model: string]: number[] } = {};
    const lensCounts: { [lens: string]: number[] } = {};
    const models = new Set<string>();
    const lens = new Set<string>();
    photos.forEach((photo) => {
        const model = photo.meta.Model;
        const fieldValue = photo.meta[field];
        models.add(model);
        lens.add(photo.meta.Lens);
        if (!modelCounts[model]) {
            modelCounts[model] = xAxisData.map(() => 0);
        }
        if (!lensCounts[photo.meta.Lens]) {
            lensCounts[photo.meta.Lens] = xAxisData.map(() => 0);
        }
        const index = xAxisData.indexOf(fieldValue);
        if (index !== -1) {
            modelCounts[model][index]++;
            lensCounts[photo.meta.Lens][index]++;
        }
    });

    const baseData = modelOrLens === 'Model' ? modelCounts : lensCounts;

    return {
        title: {
            text: '',
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow',
            },
        },
        legend: {
            data: [...(modelOrLens === 'Model' ? models : lens)],
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true,
        },
        xAxis: {
            type: 'category',
            data: xAxisData,
        },
        yAxis: {
            type: 'value',
        },
        series: Object.keys(baseData).map((k) => {
            return {
                name: k,
                type: 'bar',
                stack: '总量',
                data: baseData[k],
                itemStyle: {
                    color: getColorByString(k),
                },
            };
        }),
        dataZoom: [
            {
                type: 'slider',
                show: true,
                xAxisIndex: [0],
                // filterMode: 'filter',
                filterMode: 'empty', // 设置为 'empty'
                start: 0,
                end: 100,
            },
        ],
    };
}

export function getFOptions(photos: PhotoUnit[], m: 'Model' | 'Lens') {
    const basicF = [
        1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13,
        14, 16, 18, 20, 22,
    ];
    // 生成横轴数据（不重复的FocalLength值）
    const dataF = photos.map((p) => p.meta.FNumber);

    const FNumberList = Array.from(new Set([...basicF, ...dataF])).sort((a, b) => {
        return a > b ? 1 : -1;
    });

    const options = getBasicBarOptionsWithModel(photos, m, 'FNumber', FNumberList);
    options.title.text = '光圈分布';
    return options;
}

export function getExposureTimeOptions(photos: PhotoUnit[], m: 'Model' | 'Lens') {
    const basic = [
        '1/8000',
        '1/4000',
        '1/2000',
        '1/1000',
        '1/500',
        '1/250',
        '1/125',
        '1/60',
        '1/30',
        '1/15',
        '1/8',
        '1/4',
        '1/2',
        '1',
        '2',
        '4',
        '8',
        '15',
        '30',
    ];
    // 生成横轴数据（不重复的FocalLength值）
    const data = photos.map((p) => p.meta.ExposureTime);

    const valueList = Array.from(new Set([...basic, ...data]));
    valueList.sort((a, b) => {
        return getTechValue(a) > getTechValue(b) ? 1 : -1;
    });

    const options = getBasicBarOptionsWithModel(photos, m, 'ExposureTime', valueList);
    options.title.text = '快门分布';
    return options;
}

export function getFocalLengthOptions(photos: PhotoUnit[], m: 'Model' | 'Lens') {
    const basicFocalLength = [12, 24, 28, 50, 70, 85, 120, 200];
    // 生成横轴数据（不重复的FocalLength值）
    const dataFocalLength = photos.map((p) => p.meta.FocalLength);
    const FocalLengthList = Array.from(new Set([...basicFocalLength, ...dataFocalLength])).sort((a, b) => {
        return a > b ? 1 : -1;
    });

    const options = getBasicBarOptionsWithModel(photos, m, 'FocalLength', FocalLengthList);
    options.title.text = '焦距分布';
    return options;
}

export function getPercent(chart: echarts.ECharts) {
    const option = chart.getOption();

    // 获取当前 dataZoom 的起始和结束百分比
    const startValue = option.dataZoom[0].start;
    const endValue = option.dataZoom[0].end;

    const legendSelected = Object.keys(option.legend[0].selected).filter((k) => option.legend[0].selected[k]);

    const data: number[] = [];
    // @ts-expect-error
    option.series?.forEach?.((series) => {
        if (legendSelected.length && !legendSelected.includes(series.name)) {
            return;
        }
        series.data.forEach((d, index) => {
            data[index] = (data[index] || 0) + d;
        });
    });

    const totalSum = data.reduce((d, c) => d + c, 0);

    // 计算起始和结束的索引
    const startIndex = Math.floor((startValue / 100) * data.length);
    const endIndex = Math.floor((endValue / 100) * data.length);

    const start = option.xAxis[0].data[startIndex];
    const end = option.xAxis[0].data[endIndex] ?? option.xAxis[0].data[option.xAxis[0].data.length - 1];

    // 计算选中范围内的数据总和
    const selectedSum = data.slice(startIndex, endIndex).reduce((sum, value) => sum + value, 0);

    // 计算百分比
    const percentage = (selectedSum / totalSum) * 100;

    option.tooltip = {
        trigger: 'axis',
        alwaysShowContent: true,
        position: [0, 40], // 设置 tooltip 的位置为右上角，具体位置可以根据需要调整
        formatter: function (params) {
            return `${start}-${end}: ${percentage.toFixed(2)}%`;
        },
    };

    chart.setOption(option);

    // 手动触发 tooltip 显示
    chart.dispatchAction({
        type: 'showTip',
        seriesIndex: 0,
        dataIndex: startIndex, // 选择一个数据点来触发 tooltip
    });
}

export function getBaseBarOption(photos: PhotoUnit[], field: keyof PhotoUnit['meta']) {
    const map: Record<string, number> = {};
    photos.forEach((photo) => {
        const k = photo.meta[field];
        if (!map[k]) {
            map[k] = 0;
        }
        map[k]++;
    });

    return {
        legend: {
            top: 'bottom',
        },
        series: [
            {
                name: 'Nightingale Chart',
                type: 'pie',
                radius: [50, 100],
                center: ['50%', '50%'],
                roseType: 'area',
                itemStyle: {
                    borderRadius: 8,
                },
                data: Object.keys(map).map((k) => {
                    return {
                        value: map[k],
                        name: k,
                        itemStyle: {
                            color: getColorByString(k),
                        },
                    };
                }),
            },
        ],
    };
}
