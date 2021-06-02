import type Polar from '../../coord/polar/Polar';
import type Cartesian2D from '../../coord/cartesian/Cartesian2D';
import List from '../../data/List';
import type { LineSeriesOption } from './LineSeries';
interface CoordInfo {
    dataDimsForPoint: string[];
    valueStart: number;
    valueAxisDim: string;
    baseAxisDim: string;
    stacked: boolean;
    valueDim: string;
    baseDim: string;
    baseDataOffset: number;
    stackedOverDimension: string;
}
export declare function prepareDataCoordInfo(coordSys: Cartesian2D | Polar, data: List, valueOrigin?: LineSeriesOption['areaStyle']['origin']): CoordInfo;
export declare function getStackedOnPoint(dataCoordInfo: CoordInfo, coordSys: Cartesian2D | Polar, data: List, idx: number): number[];
export {};
