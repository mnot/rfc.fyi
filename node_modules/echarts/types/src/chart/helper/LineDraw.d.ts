import * as graphic from '../../util/graphic';
import List from '../../data/List';
import { StageHandlerProgressParams, LineStyleOption, LineLabelOption, ColorString, AnimationOptionMixin, ZRStyleProps, StatesOptionMixin, DisplayState, LabelOption } from '../../util/types';
import Model from '../../model/Model';
interface LineLike extends graphic.Group {
    updateData(data: List, idx: number, scope?: LineDrawSeriesScope): void;
    updateLayout(data: List, idx: number): void;
    fadeOut?(cb: () => void): void;
}
interface LineLikeCtor {
    new (data: List, idx: number, scope?: LineDrawSeriesScope): LineLike;
}
interface LineDrawStateOption {
    lineStyle?: LineStyleOption;
    label?: LineLabelOption;
}
export interface LineDrawModelOption extends LineDrawStateOption, StatesOptionMixin<LineDrawStateOption> {
    effect?: {
        show?: boolean;
        period?: number;
        delay?: number | ((idx: number) => number);
        /**
         * If move with constant speed px/sec
         * period will be ignored if this property is > 0,
         */
        constantSpeed?: number;
        symbol?: string;
        symbolSize?: number | number[];
        loop?: boolean;
        /**
         * Length of trail, 0 - 1
         */
        trailLength?: number;
        /**
         * Default to be same with lineStyle.color
         */
        color?: ColorString;
    };
}
declare type ListForLineDraw = List<Model<LineDrawModelOption & AnimationOptionMixin>>;
export interface LineDrawSeriesScope {
    lineStyle?: ZRStyleProps;
    emphasisLineStyle?: ZRStyleProps;
    blurLineStyle?: ZRStyleProps;
    selectLineStyle?: ZRStyleProps;
    labelStatesModels: Record<DisplayState, Model<LabelOption>>;
}
declare class LineDraw {
    group: graphic.Group;
    private _LineCtor;
    private _lineData;
    private _seriesScope;
    constructor(LineCtor?: LineLikeCtor);
    isPersistent(): boolean;
    updateData(lineData: ListForLineDraw): void;
    updateLayout(): void;
    incrementalPrepareUpdate(lineData: ListForLineDraw): void;
    incrementalUpdate(taskParams: StageHandlerProgressParams, lineData: ListForLineDraw): void;
    remove(): void;
    private _doAdd;
    private _doUpdate;
}
export default LineDraw;
