/**
 * @deprecated
 * Use `echarts/data/helper/createDimensions` instead.
 */
import { HashMap } from 'zrender/lib/core/util';
import { Source } from '../Source';
import { DimensionDefinitionLoose, OptionSourceData, EncodeDefaulter, OptionEncodeValue, OptionEncode, DimensionName } from '../../util/types';
import DataDimensionInfo from '../DataDimensionInfo';
import List from '../List';
import { CoordDimensionDefinitionLoose } from './createDimensions';
/**
 * @see {module:echarts/test/ut/spec/data/completeDimensions}
 *
 * This method builds the relationship between:
 * + "what the coord sys or series requires (see `sysDims`)",
 * + "what the user defines (in `encode` and `dimensions`, see `opt.dimsDef` and `opt.encodeDef`)"
 * + "what the data source provids (see `source`)".
 *
 * Some guess strategy will be adapted if user does not define something.
 * If no 'value' dimension specified, the first no-named dimension will be
 * named as 'value'.
 *
 * @param {Array.<string>} sysDims Necessary dimensions, like ['x', 'y'], which
 *      provides not only dim template, but also default order.
 *      properties: 'name', 'type', 'displayName'.
 *      `name` of each item provides default coord name.
 *      [{dimsDef: [string|Object, ...]}, ...] dimsDef of sysDim item provides default dim name, and
 *                                    provide dims count that the sysDim required.
 *      [{ordinalMeta}] can be specified.
 * @param {module:echarts/data/Source|Array|Object} source or data (for compatibal with pervious)
 * @param {Object} [opt]
 * @param {Array.<Object|string>} [opt.dimsDef] option.series.dimensions User defined dimensions
 *      For example: ['asdf', {name, type}, ...].
 * @param {Object|HashMap} [opt.encodeDef] option.series.encode {x: 2, y: [3, 1], tooltip: [1, 2], label: 3}
 * @param {Function} [opt.encodeDefaulter] Called if no `opt.encodeDef` exists.
 *      If not specified, auto find the next available data dim.
 *      param source {module:data/Source}
 *      param dimCount {number}
 *      return {Object} encode Never be `null/undefined`.
 * @param {string} [opt.generateCoord] Generate coord dim with the given name.
 *      If not specified, extra dim names will be:
 *      'value', 'value0', 'value1', ...
 * @param {number} [opt.generateCoordCount] By default, the generated dim name is `generateCoord`.
 *      If `generateCoordCount` specified, the generated dim names will be:
 *      `generateCoord` + 0, `generateCoord` + 1, ...
 *      can be Infinity, indicate that use all of the remain columns.
 * @param {number} [opt.dimCount] If not specified, guess by the first data item.
 * @return {Array.<module:data/DataDimensionInfo>}
 */
declare function completeDimensions(sysDims: CoordDimensionDefinitionLoose[], source: Source | List | OptionSourceData, opt: {
    dimsDef?: DimensionDefinitionLoose[];
    encodeDef?: HashMap<OptionEncodeValue, DimensionName> | OptionEncode;
    dimCount?: number;
    encodeDefaulter?: EncodeDefaulter;
    generateCoord?: string;
    generateCoordCount?: number;
}): DataDimensionInfo[];
export default completeDimensions;
