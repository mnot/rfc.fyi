import { ImageLike } from '../core/types';
declare type CanvasPatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
export interface PatternObject {
    id?: number;
    type: 'pattern';
    image: ImageLike | string;
    svgElement: SVGElement;
    svgWidth: number;
    svgHeight: number;
    repeat: CanvasPatternRepeat;
    x?: number;
    y?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    __image?: ImageLike;
}
declare class Pattern {
    type: 'pattern';
    image: ImageLike | string;
    svgElement: SVGElement;
    repeat: CanvasPatternRepeat;
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    constructor(image: ImageLike | string, repeat: CanvasPatternRepeat);
}
export default Pattern;
