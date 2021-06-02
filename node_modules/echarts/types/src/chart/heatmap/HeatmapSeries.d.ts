import SeriesModel from '../../model/Series';
import { SeriesOption, SeriesOnCartesianOptionMixin, SeriesOnGeoOptionMixin, ItemStyleOption, SeriesLabelOption, OptionDataValue, StatesOptionMixin, SeriesEncodeOptionMixin, SeriesOnCalendarOptionMixin } from '../../util/types';
import GlobalModel from '../../model/Global';
import List from '../../data/List';
import type Geo from '../../coord/geo/Geo';
import type Cartesian2D from '../../coord/cartesian/Cartesian2D';
import type Calendar from '../../coord/calendar/Calendar';
declare type HeatmapDataValue = OptionDataValue[];
export interface HeatmapStateOption {
    itemStyle?: ItemStyleOption;
    label?: SeriesLabelOption;
}
export interface HeatmapDataItemOption extends HeatmapStateOption, StatesOptionMixin<HeatmapStateOption> {
    value: HeatmapDataValue;
}
export interface HeatmapSeriesOption extends SeriesOption<HeatmapStateOption>, HeatmapStateOption, SeriesOnCartesianOptionMixin, SeriesOnGeoOptionMixin, SeriesOnCalendarOptionMixin, SeriesEncodeOptionMixin {
    type?: 'heatmap';
    coordinateSystem?: 'cartesian2d' | 'geo' | 'calendar';
    blurSize?: number;
    pointSize?: number;
    maxOpacity?: number;
    minOpacity?: number;
    data?: (HeatmapDataItemOption | HeatmapDataValue)[];
}
declare class HeatmapSeriesModel extends SeriesModel<HeatmapSeriesOption> {
    static readonly type = "series.heatmap";
    readonly type = "series.heatmap";
    static readonly dependencies: string[];
    coordinateSystem: Cartesian2D | Geo | Calendar;
    getInitialData(option: HeatmapSeriesOption, ecModel: GlobalModel): List;
    preventIncremental(): boolean;
    static defaultOption: HeatmapSeriesOption;
}
export default HeatmapSeriesModel;
