import * as graphic from '../../util/graphic';
import List from '../../data/List';
import { AnimationOption, ZRColor } from '../../util/types';
import { SymbolDrawSeriesScope } from './SymbolDraw';
interface SymbolOpts {
    disableAnimation?: boolean;
    useNameLabel?: boolean;
    symbolInnerColor?: ZRColor;
}
declare class Symbol extends graphic.Group {
    private _seriesModel;
    private _symbolType;
    /**
     * Original scale
     */
    private _sizeX;
    private _sizeY;
    private _z2;
    constructor(data: List, idx: number, seriesScope?: SymbolDrawSeriesScope, opts?: SymbolOpts);
    _createSymbol(symbolType: string, data: List, idx: number, symbolSize: number[], keepAspect: boolean): void;
    /**
     * Stop animation
     * @param {boolean} toLastFrame
     */
    stopSymbolAnimation(toLastFrame: boolean): void;
    /**
     * FIXME:
     * Caution: This method breaks the encapsulation of this module,
     * but it indeed brings convenience. So do not use the method
     * unless you detailedly know all the implements of `Symbol`,
     * especially animation.
     *
     * Get symbol path element.
     */
    getSymbolPath(): import("../../util/symbol").ECSymbol;
    /**
     * Highlight symbol
     */
    highlight(): void;
    /**
     * Downplay symbol
     */
    downplay(): void;
    /**
     * @param {number} zlevel
     * @param {number} z
     */
    setZ(zlevel: number, z: number): void;
    setDraggable(draggable: boolean): void;
    /**
     * Update symbol properties
     */
    updateData(data: List, idx: number, seriesScope?: SymbolDrawSeriesScope, opts?: SymbolOpts): void;
    _updateCommon(data: List, idx: number, symbolSize: number[], seriesScope?: SymbolDrawSeriesScope, opts?: SymbolOpts): void;
    setSymbolScale(scale: number): void;
    fadeOut(cb: () => void, opt?: {
        fadeLabel: boolean;
        animation?: AnimationOption;
    }): void;
    static getSymbolSize(data: List, idx: number): number[];
}
export default Symbol;
