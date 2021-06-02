import TimelineModel, { TimelineOption } from './TimelineModel';
import { DataFormatMixin } from '../../model/mixin/dataFormat';
import List from '../../data/List';
export interface SliderTimelineOption extends TimelineOption {
}
declare class SliderTimelineModel extends TimelineModel {
    static type: string;
    type: string;
    /**
     * @protected
     */
    static defaultOption: SliderTimelineOption;
}
interface SliderTimelineModel extends DataFormatMixin {
    getData(): List<SliderTimelineModel>;
}
export default SliderTimelineModel;
