export declare type EventCallback<Ctx, Impl, EvtParam = unknown> = (this: CbThis<Ctx, Impl>, eventParam: EvtParam, ...args: unknown[]) => boolean | void;
export declare type EventQuery = string | Object;
declare type CbThis<Ctx, Impl> = unknown extends Ctx ? Impl : Ctx;
declare type DefaultEventDefinition = {
    [eventName: string]: unknown;
};
export interface EventProcessor<EvtDef = DefaultEventDefinition> {
    normalizeQuery?: (query: EventQuery) => EventQuery;
    filter?: (eventType: keyof EvtDef, query: EventQuery) => boolean;
    afterTrigger?: (eventType: keyof EvtDef) => void;
}
export default class Eventful<EvtDef = DefaultEventDefinition> {
    private _$handlers;
    protected _$eventProcessor: EventProcessor<EvtDef>;
    constructor(eventProcessors?: EventProcessor<EvtDef>);
    on<Ctx, EvtNm extends keyof EvtDef>(event: EvtNm, handler: EventCallback<Ctx, this, EvtDef[EvtNm]>, context?: Ctx): this;
    on<Ctx, EvtNm extends keyof EvtDef>(event: EvtNm, query: EventQuery, handler: EventCallback<Ctx, this, EvtDef[EvtNm]>, context?: Ctx): this;
    isSilent(eventName: keyof EvtDef): boolean;
    off(eventType?: keyof EvtDef, handler?: Function): this;
    trigger(eventType: keyof EvtDef, eventParam?: EvtDef[keyof EvtDef], ...args: any[]): this;
    triggerWithContext(type: keyof EvtDef): this;
}
export {};
