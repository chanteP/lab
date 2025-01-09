import { ref, shallowRef } from 'vue';
import { FileInfo } from '../common/file';
import EXIF from 'exif-js';
import { getColorByString } from '../common/common';

interface PhotoUnit {
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
    };
}

export const photos = ref<PhotoUnit[]>([]);
export const parseTotal = ref(0);
export const parseDone = ref(0);

export function reset() {
    parseDone.value = 0;
    parseTotal.value = 0;
}

function getTechString(data: { denominator: number; numerator: number }) {
    const { denominator, numerator } = data;
    // console.log(data, numerator, denominator);
    const text = denominator === 1 ? numerator : `${numerator}/${denominator}`;
    return text;
}

function getTechValue(data: string) {
    let denominator = 0;
    let numerator = 0;
    const arr = data.split('/');
    denominator = Number(arr[1]) || 1;
    numerator = Number(arr[0]);
    return numerator / denominator;
}

export function addFile(file: File, info?: FileInfo) {
    parseTotal.value = parseTotal.value + 1;
    // @ts-expect-error
    EXIF.getData(file, function () {
        const exifData = EXIF.getAllTags(this);

        // console.log(exifData);
        parseDone.value = parseDone.value + 1;

        if (!exifData.FNumber) {
            return;
        }

        const item = {
            // url: URL.createObjectURL(file),
            info,
            meta: {
                FocalLength: exifData.FocalLength.valueOf(),
                FNumber: exifData.FNumber.valueOf(),
                ExposureTime: `${getTechString(exifData.ExposureTime)}`,
                ISOSpeedRatings: exifData.ISOSpeedRatings,
                DateTime: exifData.DateTimeOriginal,
                Model: exifData.Model,
            },
        };

        photos.value.push(item);
        // console.log(item);
    });
}

export function getBasicBarOptionsWithModel<T extends keyof PhotoUnit['meta']>(
    field: T,
    xList: PhotoUnit['meta'][T][],
) {
    const xAxisData = xList;

    // 计算纵轴数据
    const modelCounts: { [model: string]: number[] } = {};
    const models = new Set<string>();
    photos.value.forEach((photo) => {
        const model = photo.meta.Model;
        const fieldValue = photo.meta[field];
        models.add(model);
        if (!modelCounts[model]) {
            modelCounts[model] = xAxisData.map(() => 0);
        }
        const index = xAxisData.indexOf(fieldValue);
        if (index !== -1) {
            modelCounts[model][index]++;
        }
    });

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
            data: [...models],
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
        series: Object.keys(modelCounts).map((model) => {
            return {
                name: model,
                type: 'bar',
                stack: '总量',
                data: modelCounts[model],
                itemStyle: {
                    color: getColorByString(model),
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

export function getFOptions() {
    const basicF = [
        1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13,
        14, 16, 18, 20, 22,
    ];
    // 生成横轴数据（不重复的FocalLength值）
    const dataF = photos.value.map((p) => p.meta.FNumber);

    const FNumberList = Array.from(new Set([...basicF, ...dataF])).sort((a, b) => {
        return a > b ? 1 : -1;
    });

    const options = getBasicBarOptionsWithModel('FNumber', FNumberList);
    options.title.text = '光圈分布';
    return options;
}

export function getExposureTimeOptions() {
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
    const data = photos.value.map((p) => p.meta.ExposureTime);

    const valueList = Array.from(new Set([...basic, ...data]));
    valueList.sort((a, b) => {
        return getTechValue(a) > getTechValue(b) ? 1 : -1;
    });

    const options = getBasicBarOptionsWithModel('ExposureTime', valueList);
    options.title.text = '快门分布';
    return options;
}

export function getFocalLengthOptions() {
    const basicFocalLength = [12, 24, 28, 50, 70, 85, 120, 200];
    // 生成横轴数据（不重复的FocalLength值）
    const dataFocalLength = photos.value.map((p) => p.meta.FocalLength);
    const FocalLengthList = Array.from(new Set([...basicFocalLength, ...dataFocalLength])).sort((a, b) => {
        return a > b ? 1 : -1;
    });

    const options = getBasicBarOptionsWithModel('FocalLength', FocalLengthList);
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
