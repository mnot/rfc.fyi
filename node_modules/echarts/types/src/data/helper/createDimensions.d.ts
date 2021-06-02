import { DimensionDefinitionLoose, OptionEncode, OptionEncodeValue, EncodeDefaulter, OptionSourceData, DimensionName, DimensionDefinition, DataVisualDimensions, DimensionIndex } from '../../util/types';
import List from '../List';
import DataDimensionInfo from '../DataDimensionInfo';
import { HashMap } from 'zrender/lib/core/util';
import OrdinalMeta from '../OrdinalMeta';
import { Source } from '../Source';
export interface CoordDimensionDefinition extends DimensionDefinition {
    dimsDef?: (DimensionName | {
        name: DimensionName;
        defaultTooltip?: boolean;
    })[];
    otherDims?: DataVisualDimensions;
    ordinalMeta?: OrdinalMeta;
    coordDim?: DimensionName;
    coordDimIndex?: DimensionIndex;
}
export declare type CoordDimensionDefinitionLoose = CoordDimensionDefinition['name'] | CoordDimensionDefinition;
export declare type CreateDimensionsParams = {
    coordDimensions?: CoordDimensionDefinitionLoose[];
    dimensionsDefine?: DimensionDefinitionLoose[];
    encodeDefine?: HashMap<OptionEncodeValue, DimensionName> | OptionEncode;
    dimensionsCount?: number;
    encodeDefaulter?: EncodeDefaulter;
    generateCoord?: string;
    generateCoordCount?: number;
};
/**
 * @param opt.coordDimensions
 * @param opt.dimensionsDefine By default `source.dimensionsDefine` Overwrite source define.
 * @param opt.encodeDefine By default `source.encodeDefine` Overwrite source define.
 * @param opt.encodeDefaulter Make default encode if user not specified.
 */
export default function createDimensions(source: Source | List | OptionSourceData, opt?: CreateDimensionsParams): DataDimensionInfo[];
