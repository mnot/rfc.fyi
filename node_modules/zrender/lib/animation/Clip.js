import easingFuncs from './easing';
var Clip = (function () {
    function Clip(opts) {
        this._initialized = false;
        this._startTime = 0;
        this._pausedTime = 0;
        this._paused = false;
        this._life = opts.life || 1000;
        this._delay = opts.delay || 0;
        this.loop = opts.loop == null ? false : opts.loop;
        this.gap = opts.gap || 0;
        this.easing = opts.easing || 'linear';
        this.onframe = opts.onframe;
        this.ondestroy = opts.ondestroy;
        this.onrestart = opts.onrestart;
    }
    Clip.prototype.step = function (globalTime, deltaTime) {
        if (!this._initialized) {
            this._startTime = globalTime + this._delay;
            this._initialized = true;
        }
        if (this._paused) {
            this._pausedTime += deltaTime;
            return;
        }
        var percent = (globalTime - this._startTime - this._pausedTime) / this._life;
        if (percent < 0) {
            percent = 0;
        }
        percent = Math.min(percent, 1);
        var easing = this.easing;
        var easingFunc = typeof easing === 'string'
            ? easingFuncs[easing] : easing;
        var schedule = typeof easingFunc === 'function'
            ? easingFunc(percent)
            : percent;
        this.onframe && this.onframe(schedule);
        if (percent === 1) {
            if (this.loop) {
                this._restart(globalTime);
                this.onrestart && this.onrestart();
            }
            else {
                return true;
            }
        }
        return false;
    };
    Clip.prototype._restart = function (globalTime) {
        var remainder = (globalTime - this._startTime - this._pausedTime) % this._life;
        this._startTime = globalTime - remainder + this.gap;
        this._pausedTime = 0;
    };
    Clip.prototype.pause = function () {
        this._paused = true;
    };
    Clip.prototype.resume = function () {
        this._paused = false;
    };
    return Clip;
}());
export default Clip;
