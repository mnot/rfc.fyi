import SeriesModel from '../../model/Series';
import List from '../../data/List';
import { MarkerStatisticType, MarkerPositionOption } from './MarkerModel';
import Axis from '../../coord/Axis';
import { CoordinateSystem } from '../../coord/CoordinateSystem';
import { ScaleDataValue } from '../../util/types';
interface MarkerAxisInfo {
    valueDataDim: string;
    valueAxis: Axis;
    baseAxis: Axis;
    baseDataDim: string;
}
/**
 * Transform markPoint data item to format used in List by do the following
 * 1. Calculate statistic like `max`, `min`, `average`
 * 2. Convert `item.xAxis`, `item.yAxis` to `item.coord` array
 * @param  {module:echarts/model/Series} seriesModel
 * @param  {module:echarts/coord/*} [coordSys]
 * @param  {Object} item
 * @return {Object}
 */
export declare function dataTransform(seriesModel: SeriesModel, item: MarkerPositionOption): MarkerPositionOption;
export declare function getAxisInfo(item: MarkerPositionOption, data: List, coordSys: CoordinateSystem, seriesModel: SeriesModel): MarkerAxisInfo;
/**
 * Filter data which is out of coordinateSystem range
 * [dataFilter description]
 */
export declare function dataFilter(coordSys: CoordinateSystem & {
    containData?(data: ScaleDataValue[]): boolean;
}, item: MarkerPositionOption): boolean;
export declare function dimValueGetter(item: MarkerPositionOption, dimName: string, dataIndex: number, dimIndex: number): string | number;
export declare function numCalculate(data: List, valueDataDim: string, type: MarkerStatisticType): number;
export {};
