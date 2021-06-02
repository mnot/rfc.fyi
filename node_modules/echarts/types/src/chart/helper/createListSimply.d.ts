import { CreateDimensionsParams } from '../../data/helper/createDimensions';
import List from '../../data/List';
import SeriesModel from '../../model/Series';
/**
 * [Usage]:
 * (1)
 * createListSimply(seriesModel, ['value']);
 * (2)
 * createListSimply(seriesModel, {
 *     coordDimensions: ['value'],
 *     dimensionsCount: 5
 * });
 */
export default function createListSimply(seriesModel: SeriesModel, opt: CreateDimensionsParams | CreateDimensionsParams['coordDimensions'], nameList?: string[]): List;
