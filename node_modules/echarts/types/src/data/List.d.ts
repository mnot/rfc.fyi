import { PathStyleProps } from 'zrender/lib/graphic/Path';
import Model from '../model/Model';
import DataDiffer from './DataDiffer';
import { DataProvider } from './helper/dataProvider';
import DataDimensionInfo from './DataDimensionInfo';
import { ArrayLike, Dictionary, FunctionPropertyNames } from 'zrender/lib/core/types';
import Element from 'zrender/lib/Element';
import { DimensionIndex, DimensionName, DimensionLoose, OptionDataItem, ParsedValue, ParsedValueNumeric, OrdinalNumber, DimensionUserOuput, SeriesDataType, OptionSourceData, DecalObject } from '../util/types';
import type Graph from './Graph';
import type Tree from './Tree';
import type { VisualMeta } from '../component/visualMap/VisualMapModel';
import { Source } from './Source';
import { LineStyleProps } from '../model/mixin/lineStyle';
declare const dataCtors: {
    float: ArrayConstructor | Float64ArrayConstructor;
    int: ArrayConstructor | Int32ArrayConstructor;
    ordinal: ArrayConstructor;
    number: ArrayConstructor;
    time: ArrayConstructor;
};
export declare type ListDimensionType = keyof typeof dataCtors;
declare type DimValueGetter = (this: List, dataItem: any, dimName: DimensionName, dataIndex: number, dimIndex: DimensionIndex) => ParsedValue;
declare type ItrParamDims = DimensionLoose | Array<DimensionLoose>;
declare type CtxOrList<Ctx> = unknown extends Ctx ? List : Ctx;
declare type EachCb0<Ctx> = (this: CtxOrList<Ctx>, idx: number) => void;
declare type EachCb1<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, idx: number) => void;
declare type EachCb2<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, y: ParsedValue, idx: number) => void;
declare type EachCb<Ctx> = (this: CtxOrList<Ctx>, ...args: any) => void;
declare type FilterCb0<Ctx> = (this: CtxOrList<Ctx>, idx: number) => boolean;
declare type FilterCb1<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, idx: number) => boolean;
declare type FilterCb2<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, y: ParsedValue, idx: number) => boolean;
declare type FilterCb<Ctx> = (this: CtxOrList<Ctx>, ...args: any) => boolean;
declare type MapArrayCb0<Ctx> = (this: CtxOrList<Ctx>, idx: number) => any;
declare type MapArrayCb1<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, idx: number) => any;
declare type MapArrayCb2<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, y: ParsedValue, idx: number) => any;
declare type MapArrayCb<Ctx> = (this: CtxOrList<Ctx>, ...args: any) => any;
declare type MapCb1<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, idx: number) => ParsedValue | ParsedValue[];
declare type MapCb2<Ctx> = (this: CtxOrList<Ctx>, x: ParsedValue, y: ParsedValue, idx: number) => ParsedValue | ParsedValue[];
export interface DefaultDataVisual {
    style: PathStyleProps;
    drawType: 'fill' | 'stroke';
    symbol?: string;
    symbolSize?: number | number[];
    symbolRotate?: number;
    symbolKeepAspect?: boolean;
    symbolOffset?: string | number | (string | number)[];
    liftZ?: number;
    legendSymbol?: string;
    legendLineStyle?: LineStyleProps;
    visualMeta?: VisualMeta[];
    colorFromPalette?: boolean;
    decal?: DecalObject;
}
export interface DataCalculationInfo<SERIES_MODEL> {
    stackedDimension: string;
    stackedByDimension: string;
    isStackedByIndex: boolean;
    stackedOverDimension: string;
    stackResultDimension: string;
    stackedOnSeries?: SERIES_MODEL;
}
declare class List<HostModel extends Model = Model, Visual extends DefaultDataVisual = DefaultDataVisual> {
    readonly type = "list";
    readonly dimensions: string[];
    private _dimensionInfos;
    readonly hostModel: HostModel;
    /**
     * @readonly
     */
    dataType: SeriesDataType;
    /**
     * @readonly
     * Host graph if List is used to store graph nodes / edges.
     */
    graph?: Graph;
    /**
     * @readonly
     * Host tree if List is used to store tree ndoes.
     */
    tree?: Tree;
    private _indices;
    private _count;
    private _rawCount;
    private _storage;
    private _storageArr;
    private _nameList;
    private _idList;
    private _visual;
    private _layout;
    private _itemVisuals;
    private _itemLayouts;
    private _graphicEls;
    private _rawData;
    private _rawExtent;
    private _extent;
    private _approximateExtent;
    private _dimensionsSummary;
    private _invertedIndicesMap;
    private _calculationInfo;
    readonly userOutput: DimensionUserOuput;
    hasItemOption: boolean;
    defaultDimValueGetter: DimValueGetter;
    private _dimValueGetter;
    private _dimValueGetterArrayRows;
    private _nameRepeatCount;
    private _nameDimIdx;
    private _nameOrdinalMeta;
    private _idDimIdx;
    private _idOrdinalMeta;
    private _dontMakeIdFromName;
    private __wrappedMethods;
    TRANSFERABLE_METHODS: readonly ["cloneShallow", "downSample", "lttbDownSample", "map"];
    CHANGABLE_METHODS: readonly ["filterSelf", "selectRange"];
    DOWNSAMPLE_METHODS: readonly ["downSample", "lttbDownSample"];
    /**
     * @param dimensions
     *        For example, ['someDimName', {name: 'someDimName', type: 'someDimType'}, ...].
     *        Dimensions should be concrete names like x, y, z, lng, lat, angle, radius
     */
    constructor(dimensions: Array<string | object | DataDimensionInfo>, hostModel: HostModel);
    /**
     * The meanings of the input parameter `dim`:
     *
     * + If dim is a number (e.g., `1`), it means the index of the dimension.
     *   For example, `getDimension(0)` will return 'x' or 'lng' or 'radius'.
     * + If dim is a number-like string (e.g., `"1"`):
     *     + If there is the same concrete dim name defined in `this.dimensions`, it means that concrete name.
     *     + If not, it will be converted to a number, which means the index of the dimension.
     *        (why? because of the backward compatbility. We have been tolerating number-like string in
     *        dimension setting, although now it seems that it is not a good idea.)
     *     For example, `visualMap[i].dimension: "1"` is the same meaning as `visualMap[i].dimension: 1`,
     *     if no dimension name is defined as `"1"`.
     * + If dim is a not-number-like string, it means the concrete dim name.
     *   For example, it can be be default name `"x"`, `"y"`, `"z"`, `"lng"`, `"lat"`, `"angle"`, `"radius"`,
     *   or customized in `dimensions` property of option like `"age"`.
     *
     * Get dimension name
     * @param dim See above.
     * @return Concrete dim name.
     */
    getDimension(dim: DimensionLoose): DimensionName;
    /**
     * Get type and calculation info of particular dimension
     * @param dim
     *        Dimension can be concrete names like x, y, z, lng, lat, angle, radius
     *        Or a ordinal number. For example getDimensionInfo(0) will return 'x' or 'lng' or 'radius'
     */
    getDimensionInfo(dim: DimensionLoose): DataDimensionInfo;
    /**
     * concrete dimension name list on coord.
     */
    getDimensionsOnCoord(): DimensionName[];
    /**
     * @param coordDim
     * @param idx A coordDim may map to more than one data dim.
     *        If not specified, return the first dim not extra.
     * @return concrete data dim. If not found, return null/undefined
     */
    mapDimension(coordDim: DimensionName): DimensionName;
    mapDimension(coordDim: DimensionName, idx: number): DimensionName;
    mapDimensionsAll(coordDim: DimensionName): DimensionName[];
    /**
     * Initialize from data
     * @param data source or data or data provider.
     * @param nameList The name of a datum is used on data diff and
     *        default label/tooltip.
     *        A name can be specified in encode.itemName,
     *        or dataItem.name (only for series option data),
     *        or provided in nameList from outside.
     */
    initData(data: Source | OptionSourceData | DataProvider, nameList?: string[], dimValueGetter?: DimValueGetter): void;
    getProvider(): DataProvider;
    /**
     * Caution: Can be only called on raw data (before `this._indices` created).
     */
    appendData(data: ArrayLike<any>): void;
    /**
     * Caution: Can be only called on raw data (before `this._indices` created).
     * This method does not modify `rawData` (`dataProvider`), but only
     * add values to storage.
     *
     * The final count will be increased by `Math.max(values.length, names.length)`.
     *
     * @param values That is the SourceType: 'arrayRows', like
     *        [
     *            [12, 33, 44],
     *            [NaN, 43, 1],
     *            ['-', 'asdf', 0]
     *        ]
     *        Each item is exaclty cooresponding to a dimension.
     */
    appendValues(values: any[][], names?: string[]): void;
    private _initDataFromProvider;
    count(): number;
    getIndices(): ArrayLike<number>;
    getByDimIdx(dimIdx: number, idx: number): ParsedValue;
    /**
     * Get value. Return NaN if idx is out of range.
     * @param dim Dim must be concrete name.
     */
    get(dim: DimensionName, idx: number): ParsedValue;
    /**
     * @param dim concrete dim
     */
    getByRawIndex(dim: DimensionName, rawIdx: number): ParsedValue;
    /**
     * Get value for multi dimensions.
     * @param dimensions If ignored, using all dimensions.
     */
    getValues(idx: number): ParsedValue[];
    getValues(dimensions: readonly DimensionName[], idx: number): ParsedValue[];
    /**
     * If value is NaN. Inlcuding '-'
     * Only check the coord dimensions.
     */
    hasValue(idx: number): boolean;
    /**
     * Get extent of data in one dimension
     */
    getDataExtent(dim: DimensionLoose): [number, number];
    /**
     * PENDING: In fact currently this function is only used to short-circuit
     * the calling of `scale.unionExtentFromData` when data have been filtered by modules
     * like "dataZoom". `scale.unionExtentFromData` is used to calculate data extent for series on
     * an axis, but if a "axis related data filter module" is used, the extent of the axis have
     * been fixed and no need to calling `scale.unionExtentFromData` actually.
     * But if we add "custom data filter" in future, which is not "axis related", this method may
     * be still needed.
     *
     * Optimize for the scenario that data is filtered by a given extent.
     * Consider that if data amount is more than hundreds of thousand,
     * extent calculation will cost more than 10ms and the cache will
     * be erased because of the filtering.
     */
    getApproximateExtent(dim: DimensionLoose): [number, number];
    /**
     * Calculate extent on a filtered data might be time consuming.
     * Approximate extent is only used for: calculte extent of filtered data outside.
     */
    setApproximateExtent(extent: [number, number], dim: DimensionLoose): void;
    getCalculationInfo<CALC_INFO_KEY extends keyof DataCalculationInfo<HostModel>>(key: CALC_INFO_KEY): DataCalculationInfo<HostModel>[CALC_INFO_KEY];
    /**
     * @param key or k-v object
     */
    setCalculationInfo(key: DataCalculationInfo<HostModel>): void;
    setCalculationInfo<CALC_INFO_KEY extends keyof DataCalculationInfo<HostModel>>(key: CALC_INFO_KEY, value: DataCalculationInfo<HostModel>[CALC_INFO_KEY]): void;
    /**
     * Get sum of data in one dimension
     */
    getSum(dim: DimensionName): number;
    /**
     * Get median of data in one dimension
     */
    getMedian(dim: DimensionLoose): number;
    /**
     * Only support the dimension which inverted index created.
     * Do not support other cases until required.
     * @param dim concrete dim
     * @param value ordinal index
     * @return rawIndex
     */
    rawIndexOf(dim: DimensionName, value: OrdinalNumber): number;
    /**
     * Retreive the index with given name
     */
    indexOfName(name: string): number;
    /**
     * Retreive the index with given raw data index
     */
    indexOfRawIndex(rawIndex: number): number;
    /**
     * Retreive the index of nearest value
     * @param dim
     * @param value
     * @param [maxDistance=Infinity]
     * @return If and only if multiple indices has
     *         the same value, they are put to the result.
     */
    indicesOfNearest(dim: DimensionName, value: number, maxDistance?: number): number[];
    /**
     * Get raw data index.
     * Do not initialize.
     * Default `getRawIndex`. And it can be changed.
     */
    getRawIndex: (idx: number) => number;
    /**
     * Get raw data item
     */
    getRawDataItem(idx: number): OptionDataItem;
    /**
     * @return Never be null/undefined. `number` will be converted to string. Becuase:
     * In most cases, name is used in display, where returning a string is more convenient.
     * In other cases, name is used in query (see `indexOfName`), where we can keep the
     * rule that name `2` equals to name `'2'`.
     */
    getName(idx: number): string;
    /**
     * @return Never null/undefined. `number` will be converted to string. Becuase:
     * In all cases having encountered at present, id is used in making diff comparison, which
     * are usually based on hash map. We can keep the rule that the internal id are always string
     * (treat `2` is the same as `'2'`) to make the related logic simple.
     */
    getId(idx: number): string;
    /**
     * Data iteration
     * @param ctx default this
     * @example
     *  list.each('x', function (x, idx) {});
     *  list.each(['x', 'y'], function (x, y, idx) {});
     *  list.each(function (idx) {})
     */
    each<Ctx>(cb: EachCb0<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): void;
    each<Ctx>(dims: DimensionLoose, cb: EachCb1<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): void;
    each<Ctx>(dims: [DimensionLoose], cb: EachCb1<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): void;
    each<Ctx>(dims: [DimensionLoose, DimensionLoose], cb: EachCb2<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): void;
    each<Ctx>(dims: ItrParamDims, cb: EachCb<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): void;
    /**
     * Data filter
     */
    filterSelf<Ctx>(cb: FilterCb0<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): this;
    filterSelf<Ctx>(dims: DimensionLoose, cb: FilterCb1<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): this;
    filterSelf<Ctx>(dims: [DimensionLoose], cb: FilterCb1<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): this;
    filterSelf<Ctx>(dims: [DimensionLoose, DimensionLoose], cb: FilterCb2<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): this;
    filterSelf<Ctx>(dims: ItrParamDims, cb: FilterCb<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): this;
    /**
     * Select data in range. (For optimization of filter)
     * (Manually inline code, support 5 million data filtering in data zoom.)
     */
    selectRange(range: {
        [dimName: string]: [number, number];
    }): List;
    /**
     * Data mapping to a plain array
     */
    mapArray<Ctx, Cb extends MapArrayCb0<Ctx>>(cb: Cb, ctx?: Ctx, ctxCompat?: Ctx): ReturnType<Cb>[];
    mapArray<Ctx, Cb extends MapArrayCb1<Ctx>>(dims: DimensionLoose, cb: Cb, ctx?: Ctx, ctxCompat?: Ctx): ReturnType<Cb>[];
    mapArray<Ctx, Cb extends MapArrayCb1<Ctx>>(dims: [DimensionLoose], cb: Cb, ctx?: Ctx, ctxCompat?: Ctx): ReturnType<Cb>[];
    mapArray<Ctx, Cb extends MapArrayCb2<Ctx>>(dims: [DimensionLoose, DimensionLoose], cb: Cb, ctx?: Ctx, ctxCompat?: Ctx): ReturnType<Cb>[];
    mapArray<Ctx, Cb extends MapArrayCb<Ctx>>(dims: ItrParamDims, cb: Cb, ctx?: Ctx, ctxCompat?: Ctx): ReturnType<Cb>[];
    /**
     * Data mapping to a new List with given dimensions
     */
    map<Ctx>(dims: DimensionLoose, cb: MapCb1<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): List<HostModel>;
    map<Ctx>(dims: [DimensionLoose], cb: MapCb1<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): List<HostModel>;
    map<Ctx>(dims: [DimensionLoose, DimensionLoose], cb: MapCb2<Ctx>, ctx?: Ctx, ctxCompat?: Ctx): List<HostModel>;
    /**
     * Large data down sampling on given dimension
     * @param sampleIndex Sample index for name and id
     */
    downSample(dimension: DimensionName, rate: number, sampleValue: (frameValues: ArrayLike<ParsedValue>) => ParsedValueNumeric, sampleIndex: (frameValues: ArrayLike<ParsedValue>, value: ParsedValueNumeric) => number): List<HostModel>;
    /**
     * Large data down sampling using largest-triangle-three-buckets
     * @param {string} valueDimension
     * @param {number} targetCount
     */
    lttbDownSample(valueDimension: DimensionName, rate: number): List<Model<any>, DefaultDataVisual>;
    /**
     * Get model of one data item.
     */
    getItemModel<ItemOpts extends unknown = unknown>(idx: number): Model<ItemOpts>;
    /**
     * Create a data differ
     */
    diff(otherList: List): DataDiffer;
    /**
     * Get visual property.
     */
    getVisual<K extends keyof Visual>(key: K): Visual[K];
    /**
     * Set visual property
     *
     * @example
     *  setVisual('color', color);
     *  setVisual({
     *      'color': color
     *  });
     */
    setVisual<K extends keyof Visual>(key: K, val: Visual[K]): void;
    setVisual(kvObj: Partial<Visual>): void;
    /**
     * Get visual property of single data item
     */
    getItemVisual<K extends keyof Visual>(idx: number, key: K): Visual[K];
    /**
     * If exists visual property of single data item
     */
    hasItemVisual(): boolean;
    /**
     * Make sure itemVisual property is unique
     */
    ensureUniqueItemVisual<K extends keyof Visual>(idx: number, key: K): Visual[K];
    /**
     * Set visual property of single data item
     *
     * @param {number} idx
     * @param {string|Object} key
     * @param {*} [value]
     *
     * @example
     *  setItemVisual(0, 'color', color);
     *  setItemVisual(0, {
     *      'color': color
     *  });
     */
    setItemVisual<K extends keyof Visual>(idx: number, key: K, value: Visual[K]): void;
    setItemVisual(idx: number, kvObject: Partial<Visual>): void;
    /**
     * Clear itemVisuals and list visual.
     */
    clearAllVisual(): void;
    /**
     * Set layout property.
     */
    setLayout(key: string, val: any): void;
    setLayout(kvObj: Dictionary<any>): void;
    /**
     * Get layout property.
     */
    getLayout(key: string): any;
    /**
     * Get layout of single data item
     */
    getItemLayout(idx: number): any;
    /**
     * Set layout of single data item
     */
    setItemLayout<M = false>(idx: number, layout: (M extends true ? Dictionary<any> : any), merge?: M): void;
    /**
     * Clear all layout of single data item
     */
    clearItemLayouts(): void;
    /**
     * Set graphic element relative to data. It can be set as null
     */
    setItemGraphicEl(idx: number, el: Element): void;
    getItemGraphicEl(idx: number): Element;
    eachItemGraphicEl<Ctx = unknown>(cb: (this: Ctx, el: Element, idx: number) => void, context?: Ctx): void;
    /**
     * Shallow clone a new list except visual and layout properties, and graph elements.
     * New list only change the indices.
     */
    cloneShallow(list?: List<HostModel>): List<HostModel>;
    /**
     * Wrap some method to add more feature
     */
    wrapMethod(methodName: FunctionPropertyNames<List>, injectFunction: (...args: any) => any): void;
    private static internalField;
}
interface List {
    getLinkedData(dataType?: SeriesDataType): List;
    getLinkedDataAll(): {
        data: List;
        type?: SeriesDataType;
    }[];
}
export default List;
