import SeriesModel from '../../model/Series';
import { SeriesOption, LineStyleOption, SeriesLabelOption, SymbolOptionMixin, ItemStyleOption, AreaStyleOption, OptionDataValue, StatesOptionMixin, OptionDataItemObject, SeriesEncodeOptionMixin, CallbackDataParams } from '../../util/types';
import GlobalModel from '../../model/Global';
import List from '../../data/List';
import Radar from '../../coord/radar/Radar';
declare type RadarSeriesDataValue = OptionDataValue[];
export interface RadarSeriesStateOption {
    lineStyle?: LineStyleOption;
    areaStyle?: AreaStyleOption;
    label?: SeriesLabelOption;
    itemStyle?: ItemStyleOption;
}
export interface RadarSeriesDataItemOption extends SymbolOptionMixin, RadarSeriesStateOption, StatesOptionMixin<RadarSeriesStateOption>, OptionDataItemObject<RadarSeriesDataValue> {
}
export interface RadarSeriesOption extends SeriesOption<RadarSeriesStateOption>, RadarSeriesStateOption, SymbolOptionMixin<CallbackDataParams>, SeriesEncodeOptionMixin {
    type?: 'radar';
    coordinateSystem?: 'radar';
    radarIndex?: number;
    radarId?: string;
    data?: (RadarSeriesDataItemOption | RadarSeriesDataValue)[];
}
declare class RadarSeriesModel extends SeriesModel<RadarSeriesOption> {
    static readonly type = "series.radar";
    readonly type = "series.radar";
    static dependencies: string[];
    coordinateSystem: Radar;
    useColorPaletteOnData: boolean;
    hasSymbolVisual: boolean;
    init(option: RadarSeriesOption): void;
    getInitialData(option: RadarSeriesOption, ecModel: GlobalModel): List;
    formatTooltip(dataIndex: number, multipleSeries?: boolean, dataType?: string): import("../../component/tooltip/tooltipMarkup").TooltipMarkupSection;
    getTooltipPosition(dataIndex: number): number[];
    static defaultOption: RadarSeriesOption;
}
export default RadarSeriesModel;
