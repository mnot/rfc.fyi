import Path from './graphic/Path';
import ZRImage from './graphic/Image';
import { GradientObject } from './graphic/Gradient';
import { PatternObject } from './graphic/Pattern';
import { Dictionary } from './core/types';
export interface PainterBase {
    type: string;
    root: HTMLElement;
    resize(width?: number | string, height?: number | string): void;
    refresh(): void;
    clear(): void;
    getType: () => string;
    getWidth(): number;
    getHeight(): number;
    dispose(): void;
    getViewportRoot: () => HTMLElement;
    getViewportRootOffset: () => {
        offsetLeft: number;
        offsetTop: number;
    };
    refreshHover(): void;
    pathToImage(e: Path, dpr: number): ZRImage;
    configLayer(zlevel: number, config: Dictionary<any>): void;
    setBackgroundColor(backgroundColor: string | GradientObject | PatternObject): void;
}
