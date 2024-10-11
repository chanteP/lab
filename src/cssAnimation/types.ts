export interface LayerInfo {
    name: string;
    id: string;

    pic?: string;
    width: number;
    height: number;

    keyframes: Keyframe[];
    animationText: string;

    children: LayerInfo[];
}
