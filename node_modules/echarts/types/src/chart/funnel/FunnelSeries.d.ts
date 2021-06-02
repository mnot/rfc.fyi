import SeriesModel from '../../model/Series';
import { SeriesOption, BoxLayoutOptionMixin, HorizontalAlign, LabelOption, LabelLineOption, ItemStyleOption, OptionDataValueNumeric, StatesOptionMixin, OptionDataItemObject, LayoutOrient, VerticalAlign, SeriesLabelOption, SeriesEncodeOptionMixin } from '../../util/types';
import GlobalModel from '../../model/Global';
import List from '../../data/List';
declare type FunnelLabelOption = Omit<SeriesLabelOption, 'position'> & {
    position?: LabelOption['position'] | 'outer' | 'inner' | 'center' | 'rightTop' | 'rightBottom' | 'leftTop' | 'leftBottom';
};
export interface FunnelStateOption {
    itemStyle?: ItemStyleOption;
    label?: FunnelLabelOption;
    labelLine?: LabelLineOption;
}
export interface FunnelDataItemOption extends FunnelStateOption, StatesOptionMixin<FunnelStateOption>, OptionDataItemObject<OptionDataValueNumeric> {
    itemStyle?: ItemStyleOption & {
        width?: number | string;
        height?: number | string;
    };
}
export interface FunnelSeriesOption extends SeriesOption<FunnelStateOption>, FunnelStateOption, BoxLayoutOptionMixin, SeriesEncodeOptionMixin {
    type?: 'funnel';
    min?: number;
    max?: number;
    /**
     * Absolute number or percent string
     */
    minSize?: number | string;
    maxSize?: number | string;
    sort?: 'ascending' | 'descending' | 'none';
    orient?: LayoutOrient;
    gap?: number;
    funnelAlign?: HorizontalAlign | VerticalAlign;
    data?: (OptionDataValueNumeric | OptionDataValueNumeric[] | FunnelDataItemOption)[];
}
declare class FunnelSeriesModel extends SeriesModel<FunnelSeriesOption> {
    static type: "series.funnel";
    type: "series.funnel";
    useColorPaletteOnData: boolean;
    init(option: FunnelSeriesOption): void;
    getInitialData(this: FunnelSeriesModel, option: FunnelSeriesOption, ecModel: GlobalModel): List;
    _defaultLabelLine(option: FunnelSeriesOption): void;
    getDataParams(dataIndex: number): import("../../util/types").CallbackDataParams;
    static defaultOption: FunnelSeriesOption;
}
export default FunnelSeriesModel;
