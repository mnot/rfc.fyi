import SeriesModel from '../../model/Series';
import { SeriesOption, SeriesEncodeOptionMixin, LineStyleOption, SeriesLabelOption, SeriesTooltipOption, OptionDataValue, StatesOptionMixin } from '../../util/types';
import GlobalModel from '../../model/Global';
import List from '../../data/List';
import { ParallelActiveState, ParallelAxisOption } from '../../coord/parallel/AxisModel';
import Parallel from '../../coord/parallel/Parallel';
declare type ParallelSeriesDataValue = OptionDataValue[];
export interface ParallelStateOption {
    lineStyle?: LineStyleOption;
    label?: SeriesLabelOption;
}
export interface ParallelSeriesDataItemOption extends ParallelStateOption, StatesOptionMixin<ParallelStateOption> {
    value?: ParallelSeriesDataValue[];
}
export interface ParallelSeriesOption extends SeriesOption<ParallelStateOption>, ParallelStateOption, SeriesEncodeOptionMixin {
    type?: 'parallel';
    coordinateSystem?: string;
    parallelIndex?: number;
    parallelId?: string;
    inactiveOpacity?: number;
    activeOpacity?: number;
    smooth?: boolean | number;
    realtime?: boolean;
    tooltip?: SeriesTooltipOption;
    parallelAxisDefault?: ParallelAxisOption;
    emphasis?: {
        label?: SeriesLabelOption;
        lineStyle?: LineStyleOption;
    };
    data?: (ParallelSeriesDataValue | ParallelSeriesDataItemOption)[];
}
declare class ParallelSeriesModel extends SeriesModel<ParallelSeriesOption> {
    static type: string;
    readonly type: string;
    static dependencies: string[];
    visualStyleAccessPath: string;
    visualDrawType: "stroke";
    coordinateSystem: Parallel;
    getInitialData(this: ParallelSeriesModel, option: ParallelSeriesOption, ecModel: GlobalModel): List;
    /**
     * User can get data raw indices on 'axisAreaSelected' event received.
     *
     * @return Raw indices
     */
    getRawIndicesByActiveState(activeState: ParallelActiveState): number[];
    static defaultOption: ParallelSeriesOption;
}
export default ParallelSeriesModel;
