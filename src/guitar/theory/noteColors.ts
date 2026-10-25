import { pitchClass } from './chords';

/** 全页面唯一音名色相表；只改变明度/透明度，不为同一音换色。 */
export const NOTE_COLORS = [
    '#63876c', // C · 鼠尾草绿
    '#56827c', // C# · 青绿
    '#627f9b', // D · 灰蓝
    '#747b9b', // D# · 靛蓝
    '#ae8353', // E · 蜂蜜棕
    '#a87568', // F · 陶土
    '#a37382', // F# · 枯玫瑰
    '#7f8959', // G · 橄榄绿
    '#728b78', // G# · 灰绿
    '#8c7391', // A · 灰紫
    '#718491', // A# · 蓝灰
    '#9b785e', // B · 胡桃棕
] as const;

export const noteColor = (note: number) => NOTE_COLORS[pitchClass(note)];
export const noteColorStyle = (note: number) => ({ '--note-color': noteColor(note) });
