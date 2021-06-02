import DataDimensionInfo from '../DataDimensionInfo';
import SeriesModel from '../../model/Series';
import List, { DataCalculationInfo } from '../List';
import type { SeriesOption, SeriesStackOptionMixin, DimensionName } from '../../util/types';
/**
 * Note that it is too complicated to support 3d stack by value
 * (have to create two-dimension inverted index), so in 3d case
 * we just support that stacked by index.
 *
 * @param seriesModel
 * @param dimensionInfoList The same as the input of <module:echarts/data/List>.
 *        The input dimensionInfoList will be modified.
 * @param opt
 * @param opt.stackedCoordDimension Specify a coord dimension if needed.
 * @param opt.byIndex=false
 * @return calculationInfo
 * {
 *     stackedDimension: string
 *     stackedByDimension: string
 *     isStackedByIndex: boolean
 *     stackedOverDimension: string
 *     stackResultDimension: string
 * }
 */
export declare function enableDataStack(seriesModel: SeriesModel<SeriesOption & SeriesStackOptionMixin>, dimensionInfoList: (DataDimensionInfo | string)[], opt?: {
    stackedCoordDimension?: string;
    byIndex?: boolean;
}): Pick<DataCalculationInfo<unknown>, 'stackedDimension' | 'stackedByDimension' | 'isStackedByIndex' | 'stackedOverDimension' | 'stackResultDimension'>;
export declare function isDimensionStacked(data: List, stackedDim: string): boolean;
export declare function getStackedDimension(data: List, targetDim: string): DimensionName;
