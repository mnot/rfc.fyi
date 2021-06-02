import SeriesModel from '../../model/Series';
import { SeriesOption, BoxLayoutOptionMixin, SeriesEncodeOptionMixin, OptionDataItemObject, OptionDataValueNumeric, ParsedValue, SeriesOnGeoOptionMixin, StatesOptionMixin, SeriesLabelOption } from '../../util/types';
import { Dictionary } from 'zrender/lib/core/types';
import GeoModel, { GeoCommonOptionMixin, GeoItemStyleOption } from '../../coord/geo/GeoModel';
import List from '../../data/List';
import Model from '../../model/Model';
import Geo from '../../coord/geo/Geo';
import { ECSymbol } from '../../util/symbol';
import { LegendSymbolParams } from '../../component/legend/LegendModel';
import { Group } from '../../util/graphic';
export interface MapStateOption {
    itemStyle?: GeoItemStyleOption;
    label?: SeriesLabelOption;
}
export interface MapDataItemOption extends MapStateOption, StatesOptionMixin<MapStateOption>, OptionDataItemObject<OptionDataValueNumeric> {
    cursor?: string;
}
export declare type MapValueCalculationType = 'sum' | 'average' | 'min' | 'max';
export interface MapSeriesOption extends SeriesOption<MapStateOption>, MapStateOption, GeoCommonOptionMixin, SeriesOnGeoOptionMixin, BoxLayoutOptionMixin, SeriesEncodeOptionMixin {
    type?: 'map';
    coordinateSystem?: string;
    silent?: boolean;
    markLine?: any;
    markPoint?: any;
    markArea?: any;
    mapValueCalculation?: MapValueCalculationType;
    showLegendSymbol?: boolean;
    geoCoord?: Dictionary<number[]>;
    data?: OptionDataValueNumeric[] | OptionDataValueNumeric[][] | MapDataItemOption[];
    nameProperty?: string;
}
declare class MapSeries extends SeriesModel<MapSeriesOption> {
    static type: "series.map";
    type: "series.map";
    static dependencies: string[];
    static layoutMode: "box";
    coordinateSystem: Geo;
    originalData: List;
    mainSeries: MapSeries;
    needsDrawMap: boolean;
    seriesGroup: MapSeries[];
    getInitialData(this: MapSeries, option: MapSeriesOption): List;
    /**
     * If no host geo model, return null, which means using a
     * inner exclusive geo model.
     */
    getHostGeoModel(): GeoModel;
    getMapType(): string;
    getRawValue(dataIndex: number): ParsedValue;
    /**
     * Get model of region
     */
    getRegionModel(regionName: string): Model<MapDataItemOption>;
    /**
     * Map tooltip formatter
     */
    formatTooltip(dataIndex: number, multipleSeries: boolean, dataType: string): import("../../component/tooltip/tooltipMarkup").TooltipMarkupSection;
    getTooltipPosition: (this: MapSeries, dataIndex: number) => number[];
    setZoom(zoom: number): void;
    setCenter(center: number[]): void;
    getLegendIcon(opt: LegendSymbolParams): ECSymbol | Group;
    static defaultOption: MapSeriesOption;
}
export default MapSeries;
