import { TextCommonOption, LineStyleOption, OrdinalRawValue, ZRColor, AreaStyleOption, ComponentOption, ColorString, AnimationOptionMixin, Dictionary, ScaleDataValue } from '../util/types';
export declare const AXIS_TYPES: {
    readonly value: 1;
    readonly category: 1;
    readonly time: 1;
    readonly log: 1;
};
export declare type OptionAxisType = keyof typeof AXIS_TYPES;
export interface AxisBaseOption extends ComponentOption, AnimationOptionMixin {
    type?: OptionAxisType;
    show?: boolean;
    inverse?: boolean;
    name?: string;
    nameLocation?: 'start' | 'middle' | 'end';
    nameRotate?: number;
    nameTruncate?: {
        maxWidth?: number;
        ellipsis?: string;
        placeholder?: string;
    };
    nameTextStyle?: AxisNameTextStyleOption;
    nameGap?: number;
    silent?: boolean;
    triggerEvent?: boolean;
    tooltip?: {
        show?: boolean;
    };
    axisPointer?: any;
    axisLine?: AxisLineOption;
    axisTick?: AxisTickOption;
    axisLabel?: AxisLabelOption;
    minorTick?: MinorTickOption;
    splitLine?: SplitLineOption;
    minorSplitLine?: MinorSplitLineOption;
    splitArea?: SplitAreaOption;
    boundaryGap?: boolean | [number | string, number | string];
    min?: ScaleDataValue | 'dataMin' | ((extent: {
        min: number;
        max: number;
    }) => ScaleDataValue);
    max?: ScaleDataValue | 'dataMax' | ((extent: {
        min: number;
        max: number;
    }) => ScaleDataValue);
    scale?: boolean;
    deduplication?: boolean;
    data?: (OrdinalRawValue | {
        value: OrdinalRawValue;
        textStyle?: TextCommonOption;
    })[];
    splitNumber?: number;
    interval?: number;
    minInterval?: number;
    maxInterval?: number;
    logBase?: number;
}
interface AxisNameTextStyleOption extends TextCommonOption {
    rich?: Dictionary<TextCommonOption>;
}
interface AxisLineOption {
    show?: boolean | 'auto';
    onZero?: boolean;
    onZeroAxisIndex?: number;
    symbol?: string | [string, string];
    symbolSize?: number[];
    symbolOffset?: number[];
    lineStyle?: LineStyleOption;
}
interface AxisTickOption {
    show?: boolean | 'auto';
    inside?: boolean;
    length?: number;
    lineStyle?: LineStyleOption;
    alignWithLabel?: boolean;
    interval?: 'auto' | number | ((index: number, value: string) => boolean);
}
export declare type AxisLabelFormatterOption = string | ((value: OrdinalRawValue | number, index: number) => string);
declare type TimeAxisLabelUnitFormatter = AxisLabelFormatterOption | string[];
export declare type TimeAxisLabelFormatterOption = string | ((value: number, index: number, extra: {
    level: number;
}) => string) | {
    year?: TimeAxisLabelUnitFormatter;
    month?: TimeAxisLabelUnitFormatter;
    week?: TimeAxisLabelUnitFormatter;
    day?: TimeAxisLabelUnitFormatter;
    hour?: TimeAxisLabelUnitFormatter;
    minute?: TimeAxisLabelUnitFormatter;
    second?: TimeAxisLabelUnitFormatter;
    millisecond?: TimeAxisLabelUnitFormatter;
    inherit?: boolean;
};
interface AxisLabelOption extends Omit<TextCommonOption, 'color'> {
    show?: boolean;
    inside?: boolean;
    rotate?: number;
    showMinLabel?: boolean;
    showMaxLabel?: boolean;
    margin?: number;
    formatter?: AxisLabelFormatterOption | TimeAxisLabelFormatterOption;
    interval?: 'auto' | number | ((index: number, value: string) => boolean);
    color?: ColorString | ((value?: string | number, index?: number) => ColorString);
    rich?: Dictionary<TextCommonOption>;
}
interface MinorTickOption {
    show?: boolean;
    splitNumber?: number;
    length?: number;
    lineStyle?: LineStyleOption;
}
interface SplitLineOption {
    show?: boolean;
    interval?: 'auto' | number | ((index: number, value: string) => boolean);
    lineStyle?: LineStyleOption<ZRColor | ZRColor[]>;
}
interface MinorSplitLineOption {
    show?: boolean;
    lineStyle?: LineStyleOption;
}
interface SplitAreaOption {
    show?: boolean;
    interval?: 'auto' | number | ((index: number, value: string) => boolean);
    areaStyle?: AreaStyleOption<ZRColor[]>;
}
export {};
