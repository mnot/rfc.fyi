import List from '../../data/List';
import { InterpolatableValue } from '../../util/types';
/**
 * @return label string. Not null/undefined
 */
export declare function getDefaultLabel(data: List, dataIndex: number): string;
export declare function getDefaultInterpolatedLabel(data: List, interpolatedValue: InterpolatableValue): string;
