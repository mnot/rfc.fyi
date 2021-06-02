import MarkerModel, { MarkerOption, MarkerPositionOption } from './MarkerModel';
import GlobalModel from '../../model/Global';
import { SymbolOptionMixin, ItemStyleOption, SeriesLabelOption, CallbackDataParams, StatesOptionMixin } from '../../util/types';
interface MarkPointStateOption {
    itemStyle?: ItemStyleOption;
    label?: SeriesLabelOption;
}
export interface MarkPointDataItemOption extends MarkPointStateOption, StatesOptionMixin<MarkPointStateOption>, SymbolOptionMixin<CallbackDataParams>, MarkerPositionOption {
    name: string;
}
export interface MarkPointOption extends MarkerOption, SymbolOptionMixin<CallbackDataParams>, StatesOptionMixin<MarkPointStateOption>, MarkPointStateOption {
    mainType?: 'markPoint';
    precision?: number;
    data?: MarkPointDataItemOption[];
}
declare class MarkPointModel extends MarkerModel<MarkPointOption> {
    static type: string;
    type: string;
    createMarkerModelFromSeries(markerOpt: MarkPointOption, masterMarkerModel: MarkPointModel, ecModel: GlobalModel): MarkPointModel;
    static defaultOption: MarkPointOption;
}
export default MarkPointModel;
