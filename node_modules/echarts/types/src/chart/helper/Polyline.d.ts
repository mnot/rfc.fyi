import * as graphic from '../../util/graphic';
import type { LineDrawSeriesScope } from './LineDraw';
import type List from '../../data/List';
declare class Polyline extends graphic.Group {
    constructor(lineData: List, idx: number, seriesScope: LineDrawSeriesScope);
    private _createPolyline;
    updateData(lineData: List, idx: number, seriesScope: LineDrawSeriesScope): void;
    _updateCommonStl(lineData: List, idx: number, seriesScope: LineDrawSeriesScope): void;
    updateLayout(lineData: List, idx: number): void;
}
export default Polyline;
