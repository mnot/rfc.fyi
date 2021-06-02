/**
 * A mapping of visual provided to deverloper and visual stored in the List module.
 * To developer:
 *  'color', 'opacity', 'symbol', 'symbolSize'...
 * In the List module storage:
 *  'style', 'symbol', 'symbolSize'...
 */
import List from '../data/List';
export declare function getItemVisualFromData(data: List, dataIndex: number, key: string): string | number | number[] | import("zrender/lib/graphic/Pattern").PatternObject | import("zrender/lib/graphic/LinearGradient").LinearGradientObject | import("zrender/lib/graphic/RadialGradient").RadialGradientObject;
export declare function getVisualFromData(data: List, key: string): string | number | number[] | import("zrender/lib/graphic/Pattern").PatternObject | import("zrender/lib/graphic/LinearGradient").LinearGradientObject | import("zrender/lib/graphic/RadialGradient").RadialGradientObject;
export declare function setItemVisualFromData(data: List, dataIndex: number, key: string, value: any): void;
