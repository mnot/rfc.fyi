import Eventful from '../core/Eventful';
import Animator from './Animator';
import Clip from './Clip';
interface Stage {
    update?: () => void;
}
declare type OnframeCallback = (deltaTime: number) => void;
interface AnimationOption {
    stage?: Stage;
    onframe?: OnframeCallback;
}
export default class Animation extends Eventful {
    stage: Stage;
    onframe: OnframeCallback;
    private _clipsHead;
    private _clipsTail;
    private _running;
    private _time;
    private _pausedTime;
    private _pauseStart;
    private _paused;
    constructor(opts?: AnimationOption);
    addClip(clip: Clip): void;
    addAnimator(animator: Animator<any>): void;
    removeClip(clip: Clip): void;
    removeAnimator(animator: Animator<any>): void;
    update(notTriggerFrameAndStageUpdate?: boolean): void;
    _startLoop(): void;
    start(): void;
    stop(): void;
    pause(): void;
    resume(): void;
    clear(): void;
    isFinished(): boolean;
    animate<T>(target: T, options: {
        loop?: boolean;
    }): Animator<T>;
}
export {};
