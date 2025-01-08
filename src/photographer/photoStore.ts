import { FileInfo } from '../common/file';
import EXIF from 'exif-js';

interface PhotoUnit {
    url: string;
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

export const photos: PhotoUnit[] = [];

function getTechString(data: { denominator: number; numerator: number }) {
    if (data.denominator === 1) {
        return data.numerator;
    }
    return `${data.numerator}/${data.denominator}`;
}

export function addFile(file: File, info?: FileInfo) {
    EXIF.getData(file, function () {
        const exifData = EXIF.getAllTags(this);

        console.log(exifData);
        if (!exifData.FNumber) {
            return;
        }

        const item = {
            url: URL.createObjectURL(file),
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

        photos.push(item);

        console.log(item);
    });
}

export function getBasicBarOptionsWithModel<T extends keyof PhotoUnit['meta']>(
    field: T,
    xList: PhotoUnit['meta'][T][],
) {
    const xAxisData = xList.sort((a, b) => {
        return a > b ? 1 : -1;
    });

    // 计算纵轴数据
    const modelCounts: { [model: string]: number[] } = {};
    const models = new Set<string>();
    photos.forEach((photo) => {
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
            };
        }),
    };
}

export function getFOptions() {
    const basicF = [
        1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13,
        14, 16, 18, 20, 22,
    ];
    // 生成横轴数据（不重复的FocalLength值）
    const dataF = photos.map((p) => p.meta.FNumber);

    const FNumberList = Array.from(new Set([...basicF, ...dataF]));

    const options = getBasicBarOptionsWithModel('FNumber', FNumberList);
    options.title.text = '光圈分布';
    return options;
}

export function getFocalLengthOptions() {
    const basicFocalLength = [12, 24, 28, 50, 70, 85, 120, 200];
    // 生成横轴数据（不重复的FocalLength值）
    const dataFocalLength = photos.map((p) => p.meta.FocalLength);
    const FocalLengthList = Array.from(new Set([...basicFocalLength, ...dataFocalLength]));

    const options = getBasicBarOptionsWithModel('FocalLength', FocalLengthList);
    options.title.text = '焦距分布';
    return options;
}
