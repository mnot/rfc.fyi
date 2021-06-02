import SeriesModel from '../../model/Series';
import { SeriesOption, SeriesOnPolarOptionMixin, SeriesOnCartesianOptionMixin, SeriesOnCalendarOptionMixin, SeriesOnGeoOptionMixin, SeriesOnSingleOptionMixin, SymbolOptionMixin, OptionDataValue, ItemStyleOption, SeriesLabelOption, StatesOptionMixin, SeriesEncodeOptionMixin, CallbackDataParams } from '../../util/types';
import GlobalModel from '../../model/Global';
import List from '../../data/List';
import type { SymbolDrawItemModelOption } from '../helper/SymbolDraw';
import { BrushCommonSelectorsForSeries } from '../../component/brush/selector';
declare type ScatterDataValue = OptionDataValue | OptionDataValue[];
export interface EffectScatterStateOption {
    itemStyle?: ItemStyleOption;
    label?: SeriesLabelOption;
}
export interface EffectScatterDataItemOption extends SymbolOptionMixin, EffectScatterStateOption, StatesOptionMixin<EffectScatterStateOption> {
    name?: string;
    value?: ScatterDataValue;
    rippleEffect?: SymbolDrawItemModelOption['rippleEffect'];
}
export interface EffectScatterSeriesOption extends SeriesOption<EffectScatterStateOption>, EffectScatterStateOption, SeriesOnCartesianOptionMixin, SeriesOnPolarOptionMixin, SeriesOnCalendarOptionMixin, SeriesOnGeoOptionMixin, SeriesOnSingleOptionMixin, SymbolOptionMixin<CallbackDataParams>, SeriesEncodeOptionMixin {
    type?: 'effectScatter';
    coordinateSystem?: string;
    effectType?: 'ripple';
    /**
     * When to show the effect
     */
    showEffectOn?: 'render' | 'emphasis';
    clip?: boolean;
    /**
     * Ripple effect config
     */
    rippleEffect?: SymbolDrawItemModelOption['rippleEffect'];
    data?: (EffectScatterDataItemOption | ScatterDataValue)[];
}
declare class EffectScatterSeriesModel extends SeriesModel<EffectScatterSeriesOption> {
    static readonly type = "series.effectScatter";
    type: string;
    static readonly dependencies: string[];
    hasSymbolVisual: boolean;
    getInitialData(option: EffectScatterSeriesOption, ecModel: GlobalModel): List;
    brushSelector(dataIndex: number, data: List, selectors: BrushCommonSelectorsForSeries): boolean;
    static defaultOption: EffectScatterSeriesOption;
}
export default EffectScatterSeriesModel;
