import List from '../List';
import { SeriesDataType } from '../../util/types';
declare type Datas = {
    [key in SeriesDataType]?: List;
};
declare type StructReferDataAttr = 'data' | 'edgeData';
declare type StructAttr = 'tree' | 'graph';
declare type LinkListOpt = {
    mainData: List;
    struct: {
        update: () => void;
    } & {
        [key in StructReferDataAttr]?: List;
    };
    structAttr: StructAttr;
    datas?: Datas;
    datasAttr?: {
        [key in SeriesDataType]?: StructReferDataAttr;
    };
};
declare function linkList(opt: LinkListOpt): void;
export default linkList;
