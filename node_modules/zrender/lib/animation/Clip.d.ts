import { AnimationEasing } from './easing';
import type Animation from './Animation';
declare type OnframeCallback = (percent: number) => void;
declare type ondestroyCallback = () => void;
declare type onrestartCallback = () => void;
export declare type DeferredEventTypes = 'destroy' | 'restart';
export interface ClipProps {
    life?: number;
    delay?: number;
    loop?: boolean;
    gap?: number;
    easing?: AnimationEasing;
    onframe?: OnframeCallback;
    ondestroy?: ondestroyCallback;
    onrestart?: onrestartCallback;
}
export default class Clip {
    private _life;
    private _delay;
    private _initialized;
    private _startTime;
    private _pausedTime;
    private _paused;
    animation: Animation;
    loop: boolean;
    gap: number;
    easing: AnimationEasing;
    next: Clip;
    prev: Clip;
    onframe: OnframeCallback;
    ondestroy: ondestroyCallback;
    onrestart: onrestartCallback;
    constructor(opts: ClipProps);
    step(globalTime: number, deltaTime: number): boolean;
    private _restart;
    pause(): void;
    resume(): void;
}
export {};
