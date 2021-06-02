import SeriesModel from '../../model/Series';
import { SeriesOption, SymbolOptionMixin, BoxLayoutOptionMixin, RoamOptionMixin, LineStyleOption, ItemStyleOption, SeriesLabelOption, OptionDataValue, StatesOptionMixin, OptionDataItemObject, CallbackDataParams, DefaultEmphasisFocus } from '../../util/types';
import List from '../../data/List';
import View from '../../coord/View';
import { LayoutRect } from '../../util/layout';
interface CurveLineStyleOption extends LineStyleOption {
    curveness?: number;
}
export interface TreeSeriesStateOption {
    itemStyle?: ItemStyleOption;
    /**
     * Line style of the edge between node and it's parent.
     */
    lineStyle?: CurveLineStyleOption;
    label?: SeriesLabelOption;
}
interface ExtraStateOption {
    emphasis?: {
        focus?: DefaultEmphasisFocus | 'ancestor' | 'descendant';
        scale?: boolean;
    };
}
export interface TreeSeriesNodeItemOption extends SymbolOptionMixin<CallbackDataParams>, TreeSeriesStateOption, StatesOptionMixin<TreeSeriesStateOption, ExtraStateOption>, OptionDataItemObject<OptionDataValue> {
    children?: TreeSeriesNodeItemOption[];
    collapsed?: boolean;
    link?: string;
    target?: string;
}
/**
 * Configuration of leaves nodes.
 */
export interface TreeSeriesLeavesOption extends TreeSeriesStateOption, StatesOptionMixin<TreeSeriesStateOption> {
}
export interface TreeSeriesOption extends SeriesOption<TreeSeriesStateOption, ExtraStateOption>, TreeSeriesStateOption, SymbolOptionMixin, BoxLayoutOptionMixin, RoamOptionMixin {
    type?: 'tree';
    layout?: 'orthogonal' | 'radial';
    edgeShape?: 'polyline' | 'curve';
    /**
     * Available when edgeShape is polyline
     */
    edgeForkPosition?: string | number;
    nodeScaleRatio?: number;
    /**
     * The orient of orthoginal layout, can be setted to 'LR', 'TB', 'RL', 'BT'.
     * and the backward compatibility configuration 'horizontal = LR', 'vertical = TB'.
     */
    orient?: 'LR' | 'TB' | 'RL' | 'BT' | 'horizontal' | 'vertical';
    expandAndCollapse?: boolean;
    /**
     * The initial expanded depth of tree
     */
    initialTreeDepth?: number;
    leaves?: TreeSeriesLeavesOption;
    data?: TreeSeriesNodeItemOption[];
}
declare class TreeSeriesModel extends SeriesModel<TreeSeriesOption> {
    static readonly type = "series.tree";
    static readonly layoutMode = "box";
    coordinateSystem: View;
    layoutInfo: LayoutRect;
    hasSymbolVisual: boolean;
    ignoreStyleOnData: boolean;
    /**
     * Init a tree data structure from data in option series
     * @param  option  the object used to config echarts view
     * @return storage initial data
     */
    getInitialData(option: TreeSeriesOption): List;
    /**
     * Make the configuration 'orient' backward compatibly, with 'horizontal = LR', 'vertical = TB'.
     * @returns {string} orient
     */
    getOrient(): "BT" | "LR" | "TB" | "RL";
    setZoom(zoom: number): void;
    setCenter(center: number[]): void;
    formatTooltip(dataIndex: number, multipleSeries: boolean, dataType: string): import("../../component/tooltip/tooltipMarkup").TooltipMarkupNameValueBlock;
    static defaultOption: TreeSeriesOption;
}
export default TreeSeriesModel;
