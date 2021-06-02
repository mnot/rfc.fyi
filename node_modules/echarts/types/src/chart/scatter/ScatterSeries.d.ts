import SeriesModel from '../../model/Series';
import { SeriesOption, SeriesOnCartesianOptionMixin, SeriesOnPolarOptionMixin, SeriesOnCalendarOptionMixin, SeriesOnGeoOptionMixin, SeriesOnSingleOptionMixin, OptionDataValue, ItemStyleOption, SeriesLabelOption, SeriesLargeOptionMixin, SeriesStackOptionMixin, SymbolOptionMixin, StatesOptionMixin, OptionDataItemObject, SeriesEncodeOptionMixin, CallbackDataParams, DefaultEmphasisFocus } from '../../util/types';
import GlobalModel from '../../model/Global';
import List from '../../data/List';
import { BrushCommonSelectorsForSeries } from '../../component/brush/selector';
interface ScatterStateOption {
    itemStyle?: ItemStyleOption;
    label?: SeriesLabelOption;
}
interface ExtraStateOption {
    emphasis?: {
        focus?: DefaultEmphasisFocus;
        scale?: boolean;
    };
}
export interface ScatterDataItemOption extends SymbolOptionMixin, ScatterStateOption, StatesOptionMixin<ScatterStateOption, ExtraStateOption>, OptionDataItemObject<OptionDataValue> {
}
export interface ScatterSeriesOption extends SeriesOption<ScatterStateOption, ExtraStateOption>, ScatterStateOption, SeriesOnCartesianOptionMixin, SeriesOnPolarOptionMixin, SeriesOnCalendarOptionMixin, SeriesOnGeoOptionMixin, SeriesOnSingleOptionMixin, SeriesLargeOptionMixin, SeriesStackOptionMixin, SymbolOptionMixin<CallbackDataParams>, SeriesEncodeOptionMixin {
    type?: 'scatter';
    coordinateSystem?: string;
    cursor?: string;
    clip?: boolean;
    data?: (ScatterDataItemOption | OptionDataValue | OptionDataValue[])[] | ArrayLike<number>;
}
declare class ScatterSeriesModel extends SeriesModel<ScatterSeriesOption> {
    static readonly type = "series.scatter";
    type: string;
    static readonly dependencies: string[];
    hasSymbolVisual: boolean;
    getInitialData(option: ScatterSeriesOption, ecModel: GlobalModel): List;
    getProgressive(): number | false;
    getProgressiveThreshold(): number;
    brushSelector(dataIndex: number, data: List, selectors: BrushCommonSelectorsForSeries): boolean;
    static defaultOption: ScatterSeriesOption;
}
export default ScatterSeriesModel;
