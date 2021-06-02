import SeriesModel from '../../model/Series';
import { SeriesOnCartesianOptionMixin, SeriesOption, SeriesOnPolarOptionMixin, SeriesStackOptionMixin, SeriesLabelOption, LineStyleOption, ItemStyleOption, AreaStyleOption, OptionDataValue, SymbolOptionMixin, SeriesSamplingOptionMixin, StatesOptionMixin, SeriesEncodeOptionMixin, CallbackDataParams, DefaultEmphasisFocus } from '../../util/types';
import List from '../../data/List';
import type Cartesian2D from '../../coord/cartesian/Cartesian2D';
import type Polar from '../../coord/polar/Polar';
import { ECSymbol } from '../../util/symbol';
import { Group } from '../../util/graphic';
import { LegendSymbolParams } from '../../component/legend/LegendModel';
declare type LineDataValue = OptionDataValue | OptionDataValue[];
interface ExtraStateOption {
    emphasis?: {
        focus?: DefaultEmphasisFocus;
        scale?: boolean;
    };
}
export interface LineStateOption {
    itemStyle?: ItemStyleOption;
    label?: SeriesLabelOption;
}
export interface LineDataItemOption extends SymbolOptionMixin, LineStateOption, StatesOptionMixin<LineStateOption, ExtraStateOption> {
    name?: string;
    value?: LineDataValue;
}
export interface LineEndLabelOption extends SeriesLabelOption {
    valueAnimation: boolean;
}
export interface LineSeriesOption extends SeriesOption<LineStateOption, ExtraStateOption & {
    emphasis?: {
        lineStyle?: LineStyleOption | {
            width?: 'bolder';
        };
        areaStyle?: AreaStyleOption;
    };
    blur?: {
        lineStyle?: LineStyleOption;
        areaStyle?: AreaStyleOption;
    };
}>, LineStateOption, SeriesOnCartesianOptionMixin, SeriesOnPolarOptionMixin, SeriesStackOptionMixin, SeriesSamplingOptionMixin, SymbolOptionMixin<CallbackDataParams>, SeriesEncodeOptionMixin {
    type?: 'line';
    coordinateSystem?: 'cartesian2d' | 'polar';
    clip?: boolean;
    label?: SeriesLabelOption;
    endLabel?: LineEndLabelOption;
    lineStyle?: LineStyleOption;
    areaStyle?: AreaStyleOption & {
        origin?: 'auto' | 'start' | 'end';
    };
    step?: false | 'start' | 'end' | 'middle';
    smooth?: boolean | number;
    smoothMonotone?: 'x' | 'y' | 'none';
    connectNulls?: boolean;
    showSymbol?: boolean;
    showAllSymbol?: 'auto';
    data?: (LineDataValue | LineDataItemOption)[];
}
declare class LineSeriesModel extends SeriesModel<LineSeriesOption> {
    static readonly type = "series.line";
    type: string;
    static readonly dependencies: string[];
    coordinateSystem: Cartesian2D | Polar;
    hasSymbolVisual: boolean;
    getInitialData(option: LineSeriesOption): List;
    static defaultOption: LineSeriesOption;
    getLegendIcon(opt: LegendSymbolParams): ECSymbol | Group;
}
export default LineSeriesModel;
