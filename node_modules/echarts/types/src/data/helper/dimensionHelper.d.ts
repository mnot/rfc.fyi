import List, { ListDimensionType } from '../List';
import { DimensionName, DimensionUserOuput } from '../../util/types';
export declare type DimensionSummaryEncode = {
    defaultedLabel: DimensionName[];
    defaultedTooltip: DimensionName[];
    [coordOrVisualDimName: string]: DimensionName[];
};
export declare type DimensionSummary = {
    encode: DimensionSummaryEncode;
    userOutput: DimensionUserOuput;
    dataDimsOnCoord: DimensionName[];
    encodeFirstDimNotExtra: {
        [coordDim: string]: DimensionName;
    };
};
export declare function summarizeDimensions(data: List): DimensionSummary;
export declare function getDimensionTypeByAxis(axisType: string): ListDimensionType;
