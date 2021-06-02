/**
 * Base Axis Model for xAxis, yAxis, angleAxis, radiusAxis. singleAxis
 */
import { AxisBaseOption } from './axisCommonTypes';
import ComponentModel from '../model/Component';
import { AxisModelCommonMixin } from './axisModelCommonMixin';
import { AxisModelExtendedInCreator } from './axisModelCreator';
import Axis from './Axis';
export interface AxisBaseModel<T extends AxisBaseOption = AxisBaseOption> extends ComponentModel<T>, AxisModelCommonMixin<T>, AxisModelExtendedInCreator<T> {
    axis: Axis;
}
