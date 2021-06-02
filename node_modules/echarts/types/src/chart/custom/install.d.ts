import { BarGridLayoutResult, BarGridLayoutOptionForCustomSeries } from '../../layout/barGrid';
import { SeriesOption, SeriesOnCartesianOptionMixin, SeriesOnPolarOptionMixin, SeriesOnSingleOptionMixin, SeriesOnGeoOptionMixin, SeriesOnCalendarOptionMixin, SeriesEncodeOptionMixin, DimensionLoose, ParsedValue, Dictionary, OptionDataValue, ZRStyleProps, BlurScope, OrdinalRawValue, DecalObject, TextCommonOption } from '../../util/types';
import Element from 'zrender/lib/Element';
import { DefaultDataVisual } from '../../data/List';
import Displayable from 'zrender/lib/graphic/Displayable';
import { PathProps, PathStyleProps } from 'zrender/lib/graphic/Path';
import { ImageStyleProps } from 'zrender/lib/graphic/Image';
import { CoordinateSystem } from '../../coord/CoordinateSystem';
import { PatternObject } from 'zrender/lib/graphic/Pattern';
import { ZRenderType } from 'zrender/lib/zrender';
import { EChartsExtensionInstallRegisters } from '../../extension';
declare type CustomExtraElementInfo = Dictionary<unknown>;
declare const TRANSFORM_PROPS: {
    readonly x: 1;
    readonly y: 1;
    readonly scaleX: 1;
    readonly scaleY: 1;
    readonly originX: 1;
    readonly originY: 1;
    readonly rotation: 1;
};
declare type TransformProp = keyof typeof TRANSFORM_PROPS;
declare type TransitionAnyOption = {
    transition?: TransitionAnyProps;
    enterFrom?: Dictionary<unknown>;
    leaveTo?: Dictionary<unknown>;
};
declare type TransitionAnyProps = string | string[];
declare type TransitionTransformOption = {
    transition?: ElementRootTransitionProp | ElementRootTransitionProp[];
    enterFrom?: Dictionary<unknown>;
    leaveTo?: Dictionary<unknown>;
};
declare type ElementRootTransitionProp = TransformProp | 'shape' | 'extra' | 'style';
declare type ShapeMorphingOption = {
    /**
     * If do shape morphing animation when type is changed.
     * Only available on path.
     */
    morph?: boolean;
};
interface CustomBaseElementOption extends Partial<Pick<Element, TransformProp | 'silent' | 'ignore' | 'textConfig'>>, TransitionTransformOption {
    type: string;
    id?: string;
    name?: string;
    info?: CustomExtraElementInfo;
    textContent?: CustomTextOption | false;
    clipPath?: CustomZRPathOption | false;
    extra?: TransitionAnyOption;
    during?(params: typeof customDuringAPI): void;
    focus?: 'none' | 'self' | 'series' | ArrayLike<number>;
    blurScope?: BlurScope;
}
interface CustomDisplayableOption extends CustomBaseElementOption, Partial<Pick<Displayable, 'zlevel' | 'z' | 'z2' | 'invisible'>> {
    style?: ZRStyleProps & TransitionAnyOption;
    styleEmphasis?: ZRStyleProps | false;
    emphasis?: CustomDisplayableOptionOnState;
    blur?: CustomDisplayableOptionOnState;
    select?: CustomDisplayableOptionOnState;
}
interface CustomDisplayableOptionOnState extends Partial<Pick<Displayable, TransformProp | 'textConfig' | 'z2'>> {
    style?: (ZRStyleProps & TransitionAnyOption) | false;
}
interface CustomZRPathOption extends CustomDisplayableOption, ShapeMorphingOption {
    shape?: PathProps['shape'] & TransitionAnyOption;
    style?: CustomDisplayableOption['style'] & {
        decal?: DecalObject;
        __decalPattern?: PatternObject;
    };
}
interface CustomSVGPathOption extends CustomDisplayableOption, ShapeMorphingOption {
    type: 'path';
    shape?: {
        pathData?: string;
        d?: string;
        layout?: 'center' | 'cover';
        x?: number;
        y?: number;
        width?: number;
        height?: number;
    } & TransitionAnyOption;
}
interface CustomImageOption extends CustomDisplayableOption {
    type: 'image';
    style?: ImageStyleProps & TransitionAnyOption;
    emphasis?: CustomImageOptionOnState;
    blur?: CustomImageOptionOnState;
    select?: CustomImageOptionOnState;
}
interface CustomImageOptionOnState extends CustomDisplayableOptionOnState {
    style?: ImageStyleProps & TransitionAnyOption;
}
interface CustomTextOption extends CustomDisplayableOption {
    type: 'text';
}
declare type CustomElementOption = CustomZRPathOption | CustomSVGPathOption | CustomImageOption | CustomTextOption;
export interface CustomSeriesRenderItemAPI extends CustomSeriesRenderItemCoordinateSystemAPI {
    getWidth(): number;
    getHeight(): number;
    getZr(): ZRenderType;
    getDevicePixelRatio(): number;
    value(dim: DimensionLoose, dataIndexInside?: number): ParsedValue;
    ordinalRawValue(dim: DimensionLoose, dataIndexInside?: number): ParsedValue | OrdinalRawValue;
    style(userProps?: ZRStyleProps, dataIndexInside?: number): ZRStyleProps;
    styleEmphasis(userProps?: ZRStyleProps, dataIndexInside?: number): ZRStyleProps;
    visual<VT extends NonStyleVisualProps | StyleVisualProps>(visualType: VT, dataIndexInside?: number): VT extends NonStyleVisualProps ? DefaultDataVisual[VT] : VT extends StyleVisualProps ? PathStyleProps[typeof STYLE_VISUAL_TYPE[VT]] : void;
    barLayout(opt: BarGridLayoutOptionForCustomSeries): BarGridLayoutResult;
    currentSeriesIndices(): number[];
    font(opt: Pick<TextCommonOption, 'fontStyle' | 'fontWeight' | 'fontSize' | 'fontFamily'>): string;
}
interface CustomSeriesRenderItemParamsCoordSys {
    type: string;
}
interface CustomSeriesRenderItemCoordinateSystemAPI {
    coord(data: OptionDataValue | OptionDataValue[], clamp?: boolean): number[];
    size?(dataSize: OptionDataValue | OptionDataValue[], dataItem: OptionDataValue | OptionDataValue[]): number | number[];
}
export interface CustomSeriesRenderItemParams {
    context: Dictionary<unknown>;
    seriesId: string;
    seriesName: string;
    seriesIndex: number;
    coordSys: CustomSeriesRenderItemParamsCoordSys;
    dataInsideLength: number;
    encode: WrapEncodeDefRet;
}
declare type CustomSeriesRenderItem = (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => CustomElementOption;
export interface CustomSeriesOption extends SeriesOption<never>, // don't support StateOption in custom series.
SeriesEncodeOptionMixin, SeriesOnCartesianOptionMixin, SeriesOnPolarOptionMixin, SeriesOnSingleOptionMixin, SeriesOnGeoOptionMixin, SeriesOnCalendarOptionMixin {
    type?: 'custom';
    coordinateSystem?: string | 'none';
    renderItem?: CustomSeriesRenderItem;
    clip?: boolean;
}
declare const STYLE_VISUAL_TYPE: {
    readonly color: "fill";
    readonly borderColor: "stroke";
};
declare type StyleVisualProps = keyof typeof STYLE_VISUAL_TYPE;
declare const NON_STYLE_VISUAL_PROPS: {
    readonly symbol: 1;
    readonly symbolSize: 1;
    readonly symbolKeepAspect: 1;
    readonly legendSymbol: 1;
    readonly visualMeta: 1;
    readonly liftZ: 1;
    readonly decal: 1;
};
declare type NonStyleVisualProps = keyof typeof NON_STYLE_VISUAL_PROPS;
export declare type PrepareCustomInfo = (coordSys: CoordinateSystem) => {
    coordSys: CustomSeriesRenderItemParamsCoordSys;
    api: CustomSeriesRenderItemCoordinateSystemAPI;
};
declare const customDuringAPI: {
    setTransform(key: TransformProp, val: unknown): any;
    getTransform(key: TransformProp): unknown;
    setShape(key: string, val: unknown): any;
    getShape(key: string): unknown;
    setStyle(key: string, val: unknown): any;
    getStyle(key: string): unknown;
    setExtra(key: string, val: unknown): any;
    getExtra(key: string): unknown;
};
declare type WrapEncodeDefRet = Dictionary<number[]>;
export declare function install(registers: EChartsExtensionInstallRegisters): void;
export {};
