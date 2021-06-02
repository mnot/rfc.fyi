import type { MorphDividingMethod } from 'zrender/lib/tool/morphPath';
import { DataHost, DimensionName, SeriesOption, ZRColor, ScaleDataValue, SeriesDataType, DimensionLoose } from '../util/types';
import ComponentModel from './Component';
import { PaletteMixin } from './mixin/palette';
import { DataFormatMixin } from '../model/mixin/dataFormat';
import Model from '../model/Model';
import GlobalModel from './Global';
import { CoordinateSystem } from '../coord/CoordinateSystem';
import { ExtendableConstructor, Constructor } from '../util/clazz';
import { PipelineContext, SeriesTask } from '../core/Scheduler';
import LegendVisualProvider from '../visual/LegendVisualProvider';
import List from '../data/List';
import Axis from '../coord/Axis';
import type { BrushCommonSelectorsForSeries, BrushSelectableArea } from '../component/brush/selector';
import makeStyleMapper from './mixin/makeStyleMapper';
import { Source } from '../data/Source';
import { ECSymbol } from '../util/symbol';
import { Group } from '../util/graphic';
import { LegendSymbolParams } from '../component/legend/LegendModel';
interface SeriesModel {
    /**
     * Convinient for override in extended class.
     * Implement it if needed.
     */
    preventIncremental(): boolean;
    /**
     * See tooltip.
     * Implement it if needed.
     * @return Point of tooltip. null/undefined can be returned.
     */
    getTooltipPosition(dataIndex: number): number[];
    /**
     * Get data indices for show tooltip content. See tooltip.
     * Implement it if needed.
     */
    getAxisTooltipData(dim: DimensionName[], value: ScaleDataValue, baseAxis: Axis): {
        dataIndices: number[];
        nestestValue: any;
    };
    /**
     * Get position for marker
     */
    getMarkerPosition(value: ScaleDataValue[]): number[];
    /**
     * Get legend icon symbol according to each series type
     */
    getLegendIcon(opt: LegendSymbolParams): ECSymbol | Group;
    /**
     * See `component/brush/selector.js`
     * Defined the brush selector for this series.
     */
    brushSelector(dataIndex: number, data: List, selectors: BrushCommonSelectorsForSeries, area: BrushSelectableArea): boolean;
    enableAriaDecal(): void;
}
declare class SeriesModel<Opt extends SeriesOption = SeriesOption> extends ComponentModel<Opt> {
    type: string;
    defaultOption: SeriesOption;
    seriesIndex: number;
    coordinateSystem: CoordinateSystem;
    dataTask: SeriesTask;
    pipelineContext: PipelineContext;
    __transientTransitionOpt: {
        from: DimensionLoose;
        to: DimensionLoose;
        dividingMethod: MorphDividingMethod;
    };
    legendVisualProvider: LegendVisualProvider;
    visualStyleAccessPath: string;
    visualDrawType: 'fill' | 'stroke';
    visualStyleMapper: ReturnType<typeof makeStyleMapper>;
    ignoreStyleOnData: boolean;
    useColorPaletteOnData: boolean;
    hasSymbolVisual: boolean;
    defaultSymbol: string;
    legendSymbol: string;
    private _selectedDataIndicesMap;
    readonly preventUsingHoverLayer: boolean;
    static protoInitialize: void;
    init(option: Opt, parentModel: Model, ecModel: GlobalModel): void;
    /**
     * Util for merge default and theme to option
     */
    mergeDefaultAndTheme(option: Opt, ecModel: GlobalModel): void;
    mergeOption(newSeriesOption: Opt, ecModel: GlobalModel): void;
    fillDataTextStyle(data: ArrayLike<any>): void;
    /**
     * Init a data structure from data related option in series
     * Must be overriden.
     */
    getInitialData(option: Opt, ecModel: GlobalModel): List;
    /**
     * Append data to list
     */
    appendData(params: {
        data: ArrayLike<any>;
    }): void;
    /**
     * Consider some method like `filter`, `map` need make new data,
     * We should make sure that `seriesModel.getData()` get correct
     * data in the stream procedure. So we fetch data from upstream
     * each time `task.perform` called.
     */
    getData(dataType?: SeriesDataType): List<this>;
    getAllData(): ({
        data: List;
        type?: SeriesDataType;
    })[];
    setData(data: List): void;
    getSource(): Source;
    /**
     * Get data before processed
     */
    getRawData(): List;
    /**
     * Get base axis if has coordinate system and has axis.
     * By default use coordSys.getBaseAxis();
     * Can be overrided for some chart.
     * @return {type} description
     */
    getBaseAxis(): Axis;
    /**
     * Default tooltip formatter
     *
     * @param dataIndex
     * @param multipleSeries
     * @param dataType
     * @param renderMode valid values: 'html'(by default) and 'richText'.
     *        'html' is used for rendering tooltip in extra DOM form, and the result
     *        string is used as DOM HTML content.
     *        'richText' is used for rendering tooltip in rich text form, for those where
     *        DOM operation is not supported.
     * @return formatted tooltip with `html` and `markers`
     *        Notice: The override method can also return string
     */
    formatTooltip(dataIndex: number, multipleSeries?: boolean, dataType?: SeriesDataType): ReturnType<DataFormatMixin['formatTooltip']>;
    isAnimationEnabled(): boolean;
    restoreData(): void;
    getColorFromPalette(name: string, scope: any, requestColorNum?: number): ZRColor;
    /**
     * Use `data.mapDimensionsAll(coordDim)` instead.
     * @deprecated
     */
    coordDimToDataDim(coordDim: DimensionName): DimensionName[];
    /**
     * Get progressive rendering count each step
     */
    getProgressive(): number | false;
    /**
     * Get progressive rendering count each step
     */
    getProgressiveThreshold(): number;
    select(innerDataIndices: number[], dataType?: SeriesDataType): void;
    unselect(innerDataIndices: number[], dataType?: SeriesDataType): void;
    toggleSelect(innerDataIndices: number[], dataType?: SeriesDataType): void;
    getSelectedDataIndices(): number[];
    isSelected(dataIndex: number, dataType?: SeriesDataType): boolean;
    private _innerSelect;
    private _initSelectedMapFromData;
    static registerClass(clz: Constructor): Constructor;
}
interface SeriesModel<Opt extends SeriesOption = SeriesOption> extends DataFormatMixin, PaletteMixin<Opt>, DataHost {
    /**
     * Get dimension to render shadow in dataZoom component
     */
    getShadowDim?(): string;
}
export declare type SeriesModelConstructor = typeof SeriesModel & ExtendableConstructor;
export default SeriesModel;
