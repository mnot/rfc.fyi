import { Group } from '../../util/graphic';
import List from '../../data/List';
import type { ZRColor } from '../../util/types';
interface RippleEffectCfg {
    showEffectOn?: 'emphasis' | 'render';
    rippleScale?: number;
    brushType?: 'fill' | 'stroke';
    period?: number;
    effectOffset?: number;
    z?: number;
    zlevel?: number;
    symbolType?: string;
    color?: ZRColor;
    rippleEffectColor?: ZRColor;
}
declare class EffectSymbol extends Group {
    private _effectCfg;
    constructor(data: List, idx: number);
    stopEffectAnimation(): void;
    startEffectAnimation(effectCfg: RippleEffectCfg): void;
    /**
     * Update effect symbol
     */
    updateEffectAnimation(effectCfg: RippleEffectCfg): void;
    /**
     * Highlight symbol
     */
    highlight(): void;
    /**
     * Downplay symbol
     */
    downplay(): void;
    /**
     * Update symbol properties
     */
    updateData(data: List, idx: number): void;
    fadeOut(cb: () => void): void;
}
export default EffectSymbol;
