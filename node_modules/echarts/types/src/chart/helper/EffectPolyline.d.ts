import Polyline from './Polyline';
import EffectLine, { ECSymbolOnEffectLine } from './EffectLine';
import { LineDrawSeriesScope } from './LineDraw';
import List from '../../data/List';
declare class EffectPolyline extends EffectLine {
    private _lastFrame;
    private _lastFramePercent;
    private _length;
    private _points;
    private _offsets;
    createLine(lineData: List, idx: number, seriesScope: LineDrawSeriesScope): Polyline;
    protected _updateAnimationPoints(symbol: ECSymbolOnEffectLine, points: number[][]): void;
    protected _getLineLength(): number;
    protected _updateSymbolPosition(symbol: ECSymbolOnEffectLine): void;
}
export default EffectPolyline;
