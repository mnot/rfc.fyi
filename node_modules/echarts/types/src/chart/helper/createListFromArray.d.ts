import List from '../../data/List';
import { Source } from '../../data/Source';
import { OptionSourceData, EncodeDefaulter } from '../../util/types';
import SeriesModel from '../../model/Series';
declare function createListFromArray(source: Source | OptionSourceData, seriesModel: SeriesModel, opt?: {
    generateCoord?: string;
    useEncodeDefaulter?: boolean | EncodeDefaulter;
    createInvertedIndices?: boolean;
}): List;
export default createListFromArray;
