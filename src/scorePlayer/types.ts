/** 谱面 JSON 数据结构（bapu 管线生成，v1） */

export interface ScoreMeta {
    title: string;
    artist?: string;
    /** 调式，例如 "1=C" / "1=Am" */
    key?: string;
    bpm: number;
    /** 拍号，例如 "4/4" */
    timeSig?: string;
    capo?: number;
}

export interface ScoreNote {
    /** 唱名数字 '1'..'7'，'0' 为休止 */
    d: string;
    /** 临时升降号 '#' | 'b' */
    acc?: '' | '#' | 'b';
    /** 八度偏移，0 中音，1 高音（上加点），-1 低音（下加点） */
    oct?: number;
    /** 时值，单位拍（四分音符=1，八分=0.5） */
    len: number;
    /** 该音对应的歌词字 */
    ly?: string;
}

export interface ScoreBar {
    /** 本小节的和弦，如 "C" "Am7" "G/B"，空表示沿用上一小节 */
    chord?: string;
    notes: ScoreNote[];
    /** 覆盖拍号（变拍用），缺省用 meta.timeSig */
    beats?: number;
}

export interface ScoreSection {
    name: string;
    /** 起始小节（0 基） */
    bar: number;
}

export interface Score {
    version: number;
    meta: ScoreMeta;
    sections?: ScoreSection[];
    bars: ScoreBar[];
}

/* ---------- 展平后的播放/渲染模型 ---------- */

export interface FlatNote {
    /** 全局音符序号（含休止，不含延音线占位） */
    idx: number;
    bar: number;
    /** 全局起始拍 */
    startBeat: number;
    len: number;
    d: string;
    acc: '' | '#' | 'b';
    oct: number;
    ly: string;
    midi: number | null; // 休止为 null
}

export interface FlatBar {
    index: number;
    startBeat: number;
    beats: number;
    chord: string; // 已做沿用处理
    notes: FlatNote[];
}
