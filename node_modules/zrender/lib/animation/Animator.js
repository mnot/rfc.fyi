import Clip from './Clip';
import * as color from '../tool/color';
import { isArrayLike, keys, logError } from '../core/util';
var arraySlice = Array.prototype.slice;
export function interpolateNumber(p0, p1, percent) {
    return (p1 - p0) * percent + p0;
}
export function step(p0, p1, percent) {
    return percent > 0.5 ? p1 : p0;
}
export function interpolate1DArray(out, p0, p1, percent) {
    var len = p0.length;
    for (var i = 0; i < len; i++) {
        out[i] = interpolateNumber(p0[i], p1[i], percent);
    }
}
export function interpolate2DArray(out, p0, p1, percent) {
    var len = p0.length;
    var len2 = len && p0[0].length;
    for (var i = 0; i < len; i++) {
        if (!out[i]) {
            out[i] = [];
        }
        for (var j = 0; j < len2; j++) {
            out[i][j] = interpolateNumber(p0[i][j], p1[i][j], percent);
        }
    }
}
function add1DArray(out, p0, p1, sign) {
    var len = p0.length;
    for (var i = 0; i < len; i++) {
        out[i] = p0[i] + p1[i] * sign;
    }
    return out;
}
function add2DArray(out, p0, p1, sign) {
    var len = p0.length;
    var len2 = len && p0[0].length;
    for (var i = 0; i < len; i++) {
        if (!out[i]) {
            out[i] = [];
        }
        for (var j = 0; j < len2; j++) {
            out[i][j] = p0[i][j] + p1[i][j] * sign;
        }
    }
    return out;
}
function fillArray(val0, val1, arrDim) {
    var arr0 = val0;
    var arr1 = val1;
    if (!arr0.push || !arr1.push) {
        return;
    }
    var arr0Len = arr0.length;
    var arr1Len = arr1.length;
    if (arr0Len !== arr1Len) {
        var isPreviousLarger = arr0Len > arr1Len;
        if (isPreviousLarger) {
            arr0.length = arr1Len;
        }
        else {
            for (var i = arr0Len; i < arr1Len; i++) {
                arr0.push(arrDim === 1 ? arr1[i] : arraySlice.call(arr1[i]));
            }
        }
    }
    var len2 = arr0[0] && arr0[0].length;
    for (var i = 0; i < arr0.length; i++) {
        if (arrDim === 1) {
            if (isNaN(arr0[i])) {
                arr0[i] = arr1[i];
            }
        }
        else {
            for (var j = 0; j < len2; j++) {
                if (isNaN(arr0[i][j])) {
                    arr0[i][j] = arr1[i][j];
                }
            }
        }
    }
}
function is1DArraySame(arr0, arr1) {
    var len = arr0.length;
    if (len !== arr1.length) {
        return false;
    }
    for (var i = 0; i < len; i++) {
        if (arr0[i] !== arr1[i]) {
            return false;
        }
    }
    return true;
}
function is2DArraySame(arr0, arr1) {
    var len = arr0.length;
    if (len !== arr1.length) {
        return false;
    }
    var len2 = arr0[0].length;
    for (var i = 0; i < len; i++) {
        for (var j = 0; j < len2; j++) {
            if (arr0[i][j] !== arr1[i][j]) {
                return false;
            }
        }
    }
    return true;
}
function catmullRomInterpolate(p0, p1, p2, p3, t, t2, t3) {
    var v0 = (p2 - p0) * 0.5;
    var v1 = (p3 - p1) * 0.5;
    return (2 * (p1 - p2) + v0 + v1) * t3
        + (-3 * (p1 - p2) - 2 * v0 - v1) * t2
        + v0 * t + p1;
}
function catmullRomInterpolate1DArray(out, p0, p1, p2, p3, t, t2, t3) {
    var len = p0.length;
    for (var i = 0; i < len; i++) {
        out[i] = catmullRomInterpolate(p0[i], p1[i], p2[i], p3[i], t, t2, t3);
    }
}
function catmullRomInterpolate2DArray(out, p0, p1, p2, p3, t, t2, t3) {
    var len = p0.length;
    var len2 = p0[0].length;
    for (var i = 0; i < len; i++) {
        if (!out[i]) {
            out[1] = [];
        }
        for (var j = 0; j < len2; j++) {
            out[i][j] = catmullRomInterpolate(p0[i][j], p1[i][j], p2[i][j], p3[i][j], t, t2, t3);
        }
    }
}
export function cloneValue(value) {
    if (isArrayLike(value)) {
        var len = value.length;
        if (isArrayLike(value[0])) {
            var ret = [];
            for (var i = 0; i < len; i++) {
                ret.push(arraySlice.call(value[i]));
            }
            return ret;
        }
        return arraySlice.call(value);
    }
    return value;
}
function rgba2String(rgba) {
    rgba[0] = Math.floor(rgba[0]);
    rgba[1] = Math.floor(rgba[1]);
    rgba[2] = Math.floor(rgba[2]);
    return 'rgba(' + rgba.join(',') + ')';
}
function guessArrayDim(value) {
    return isArrayLike(value && value[0]) ? 2 : 1;
}
var tmpRgba = [0, 0, 0, 0];
var Track = (function () {
    function Track(propName) {
        this.keyframes = [];
        this.maxTime = 0;
        this.arrDim = 0;
        this.interpolable = true;
        this._needsSort = false;
        this._isAllValueEqual = true;
        this._lastFrame = 0;
        this._lastFramePercent = 0;
        this.propName = propName;
    }
    Track.prototype.isFinished = function () {
        return this._finished;
    };
    Track.prototype.setFinished = function () {
        this._finished = true;
        if (this._additiveTrack) {
            this._additiveTrack.setFinished();
        }
    };
    Track.prototype.needsAnimate = function () {
        return !this._isAllValueEqual && this.keyframes.length >= 2 && this.interpolable;
    };
    Track.prototype.getAdditiveTrack = function () {
        return this._additiveTrack;
    };
    Track.prototype.addKeyframe = function (time, value) {
        if (time >= this.maxTime) {
            this.maxTime = time;
        }
        else {
            this._needsSort = true;
        }
        var keyframes = this.keyframes;
        var len = keyframes.length;
        if (this.interpolable) {
            if (isArrayLike(value)) {
                var arrayDim = guessArrayDim(value);
                if (len > 0 && this.arrDim !== arrayDim) {
                    this.interpolable = false;
                    return;
                }
                if (arrayDim === 1 && typeof value[0] !== 'number'
                    || arrayDim === 2 && typeof value[0][0] !== 'number') {
                    this.interpolable = false;
                    return;
                }
                if (len > 0) {
                    var lastFrame = keyframes[len - 1];
                    if (this._isAllValueEqual) {
                        if (arrayDim === 1) {
                            if (!is1DArraySame(value, lastFrame.value)) {
                                this._isAllValueEqual = false;
                            }
                        }
                        else {
                            this._isAllValueEqual = false;
                        }
                    }
                }
                this.arrDim = arrayDim;
            }
            else {
                if (this.arrDim > 0) {
                    this.interpolable = false;
                    return;
                }
                if (typeof value === 'string') {
                    var colorArray = color.parse(value);
                    if (colorArray) {
                        value = colorArray;
                        this.isValueColor = true;
                    }
                    else {
                        this.interpolable = false;
                    }
                }
                else if (typeof value !== 'number' || isNaN(value)) {
                    this.interpolable = false;
                    return;
                }
                if (this._isAllValueEqual && len > 0) {
                    var lastFrame = keyframes[len - 1];
                    if (this.isValueColor && !is1DArraySame(lastFrame.value, value)) {
                        this._isAllValueEqual = false;
                    }
                    else if (lastFrame.value !== value) {
                        this._isAllValueEqual = false;
                    }
                }
            }
        }
        var kf = {
            time: time,
            value: value,
            percent: 0
        };
        this.keyframes.push(kf);
        return kf;
    };
    Track.prototype.prepare = function (additiveTrack) {
        var kfs = this.keyframes;
        if (this._needsSort) {
            kfs.sort(function (a, b) {
                return a.time - b.time;
            });
        }
        var arrDim = this.arrDim;
        var kfsLen = kfs.length;
        var lastKf = kfs[kfsLen - 1];
        for (var i = 0; i < kfsLen; i++) {
            kfs[i].percent = kfs[i].time / this.maxTime;
            if (arrDim > 0 && i !== kfsLen - 1) {
                fillArray(kfs[i].value, lastKf.value, arrDim);
            }
        }
        if (additiveTrack
            && this.needsAnimate()
            && additiveTrack.needsAnimate()
            && arrDim === additiveTrack.arrDim
            && this.isValueColor === additiveTrack.isValueColor
            && !additiveTrack._finished) {
            this._additiveTrack = additiveTrack;
            var startValue = kfs[0].value;
            for (var i = 0; i < kfsLen; i++) {
                if (arrDim === 0) {
                    if (this.isValueColor) {
                        kfs[i].additiveValue
                            = add1DArray([], kfs[i].value, startValue, -1);
                    }
                    else {
                        kfs[i].additiveValue = kfs[i].value - startValue;
                    }
                }
                else if (arrDim === 1) {
                    kfs[i].additiveValue = add1DArray([], kfs[i].value, startValue, -1);
                }
                else if (arrDim === 2) {
                    kfs[i].additiveValue = add2DArray([], kfs[i].value, startValue, -1);
                }
            }
        }
    };
    Track.prototype.step = function (target, percent) {
        if (this._finished) {
            return;
        }
        if (this._additiveTrack && this._additiveTrack._finished) {
            this._additiveTrack = null;
        }
        var isAdditive = this._additiveTrack != null;
        var valueKey = isAdditive ? 'additiveValue' : 'value';
        var keyframes = this.keyframes;
        var kfsNum = this.keyframes.length;
        var propName = this.propName;
        var arrDim = this.arrDim;
        var isValueColor = this.isValueColor;
        var frameIdx;
        if (percent < 0) {
            frameIdx = 0;
        }
        else if (percent < this._lastFramePercent) {
            var start = Math.min(this._lastFrame + 1, kfsNum - 1);
            for (frameIdx = start; frameIdx >= 0; frameIdx--) {
                if (keyframes[frameIdx].percent <= percent) {
                    break;
                }
            }
            frameIdx = Math.min(frameIdx, kfsNum - 2);
        }
        else {
            for (frameIdx = this._lastFrame; frameIdx < kfsNum; frameIdx++) {
                if (keyframes[frameIdx].percent > percent) {
                    break;
                }
            }
            frameIdx = Math.min(frameIdx - 1, kfsNum - 2);
        }
        var nextFrame = keyframes[frameIdx + 1];
        var frame = keyframes[frameIdx];
        if (!(frame && nextFrame)) {
            return;
        }
        this._lastFrame = frameIdx;
        this._lastFramePercent = percent;
        var range = (nextFrame.percent - frame.percent);
        if (range === 0) {
            return;
        }
        var w = (percent - frame.percent) / range;
        var targetArr = isAdditive ? this._additiveValue
            : (isValueColor ? tmpRgba : target[propName]);
        if ((arrDim > 0 || isValueColor) && !targetArr) {
            targetArr = this._additiveValue = [];
        }
        if (this.useSpline) {
            var p1 = keyframes[frameIdx][valueKey];
            var p0 = keyframes[frameIdx === 0 ? frameIdx : frameIdx - 1][valueKey];
            var p2 = keyframes[frameIdx > kfsNum - 2 ? kfsNum - 1 : frameIdx + 1][valueKey];
            var p3 = keyframes[frameIdx > kfsNum - 3 ? kfsNum - 1 : frameIdx + 2][valueKey];
            if (arrDim > 0) {
                arrDim === 1
                    ? catmullRomInterpolate1DArray(targetArr, p0, p1, p2, p3, w, w * w, w * w * w)
                    : catmullRomInterpolate2DArray(targetArr, p0, p1, p2, p3, w, w * w, w * w * w);
            }
            else if (isValueColor) {
                catmullRomInterpolate1DArray(targetArr, p0, p1, p2, p3, w, w * w, w * w * w);
                if (!isAdditive) {
                    target[propName] = rgba2String(targetArr);
                }
            }
            else {
                var value = void 0;
                if (!this.interpolable) {
                    value = p2;
                }
                else {
                    value = catmullRomInterpolate(p0, p1, p2, p3, w, w * w, w * w * w);
                }
                if (isAdditive) {
                    this._additiveValue = value;
                }
                else {
                    target[propName] = value;
                }
            }
        }
        else {
            if (arrDim > 0) {
                arrDim === 1
                    ? interpolate1DArray(targetArr, frame[valueKey], nextFrame[valueKey], w)
                    : interpolate2DArray(targetArr, frame[valueKey], nextFrame[valueKey], w);
            }
            else if (isValueColor) {
                interpolate1DArray(targetArr, frame[valueKey], nextFrame[valueKey], w);
                if (!isAdditive) {
                    target[propName] = rgba2String(targetArr);
                }
            }
            else {
                var value = void 0;
                if (!this.interpolable) {
                    value = step(frame[valueKey], nextFrame[valueKey], w);
                }
                else {
                    value = interpolateNumber(frame[valueKey], nextFrame[valueKey], w);
                }
                if (isAdditive) {
                    this._additiveValue = value;
                }
                else {
                    target[propName] = value;
                }
            }
        }
        if (isAdditive) {
            this._addToTarget(target);
        }
    };
    Track.prototype._addToTarget = function (target) {
        var arrDim = this.arrDim;
        var propName = this.propName;
        var additiveValue = this._additiveValue;
        if (arrDim === 0) {
            if (this.isValueColor) {
                color.parse(target[propName], tmpRgba);
                add1DArray(tmpRgba, tmpRgba, additiveValue, 1);
                target[propName] = rgba2String(tmpRgba);
            }
            else {
                target[propName] = target[propName] + additiveValue;
            }
        }
        else if (arrDim === 1) {
            add1DArray(target[propName], target[propName], additiveValue, 1);
        }
        else if (arrDim === 2) {
            add2DArray(target[propName], target[propName], additiveValue, 1);
        }
    };
    return Track;
}());
var Animator = (function () {
    function Animator(target, loop, additiveTo) {
        this._tracks = {};
        this._trackKeys = [];
        this._delay = 0;
        this._maxTime = 0;
        this._paused = false;
        this._started = 0;
        this._clip = null;
        this._target = target;
        this._loop = loop;
        if (loop && additiveTo) {
            logError('Can\' use additive animation on looped animation.');
            return;
        }
        this._additiveAnimators = additiveTo;
    }
    Animator.prototype.getTarget = function () {
        return this._target;
    };
    Animator.prototype.changeTarget = function (target) {
        this._target = target;
    };
    Animator.prototype.when = function (time, props) {
        return this.whenWithKeys(time, props, keys(props));
    };
    Animator.prototype.whenWithKeys = function (time, props, propNames) {
        var tracks = this._tracks;
        for (var i = 0; i < propNames.length; i++) {
            var propName = propNames[i];
            var track = tracks[propName];
            if (!track) {
                track = tracks[propName] = new Track(propName);
                var initialValue = void 0;
                var additiveTrack = this._getAdditiveTrack(propName);
                if (additiveTrack) {
                    var lastFinalKf = additiveTrack.keyframes[additiveTrack.keyframes.length - 1];
                    initialValue = lastFinalKf && lastFinalKf.value;
                    if (additiveTrack.isValueColor && initialValue) {
                        initialValue = rgba2String(initialValue);
                    }
                }
                else {
                    initialValue = this._target[propName];
                }
                if (initialValue == null) {
                    continue;
                }
                if (time !== 0) {
                    track.addKeyframe(0, cloneValue(initialValue));
                }
                this._trackKeys.push(propName);
            }
            track.addKeyframe(time, cloneValue(props[propName]));
        }
        this._maxTime = Math.max(this._maxTime, time);
        return this;
    };
    Animator.prototype.pause = function () {
        this._clip.pause();
        this._paused = true;
    };
    Animator.prototype.resume = function () {
        this._clip.resume();
        this._paused = false;
    };
    Animator.prototype.isPaused = function () {
        return !!this._paused;
    };
    Animator.prototype._doneCallback = function () {
        this._setTracksFinished();
        this._clip = null;
        var doneList = this._doneList;
        if (doneList) {
            var len = doneList.length;
            for (var i = 0; i < len; i++) {
                doneList[i].call(this);
            }
        }
    };
    Animator.prototype._abortedCallback = function () {
        this._setTracksFinished();
        var animation = this.animation;
        var abortedList = this._abortedList;
        if (animation) {
            animation.removeClip(this._clip);
        }
        this._clip = null;
        if (abortedList) {
            for (var i = 0; i < abortedList.length; i++) {
                abortedList[i].call(this);
            }
        }
    };
    Animator.prototype._setTracksFinished = function () {
        var tracks = this._tracks;
        var tracksKeys = this._trackKeys;
        for (var i = 0; i < tracksKeys.length; i++) {
            tracks[tracksKeys[i]].setFinished();
        }
    };
    Animator.prototype._getAdditiveTrack = function (trackName) {
        var additiveTrack;
        var additiveAnimators = this._additiveAnimators;
        if (additiveAnimators) {
            for (var i = 0; i < additiveAnimators.length; i++) {
                var track = additiveAnimators[i].getTrack(trackName);
                if (track) {
                    additiveTrack = track;
                }
            }
        }
        return additiveTrack;
    };
    Animator.prototype.start = function (easing, forceAnimate) {
        if (this._started > 0) {
            return;
        }
        this._started = 1;
        var self = this;
        var tracks = [];
        for (var i = 0; i < this._trackKeys.length; i++) {
            var propName = this._trackKeys[i];
            var track = this._tracks[propName];
            var additiveTrack = this._getAdditiveTrack(propName);
            var kfs = track.keyframes;
            track.prepare(additiveTrack);
            if (track.needsAnimate()) {
                tracks.push(track);
            }
            else if (!track.interpolable) {
                var lastKf = kfs[kfs.length - 1];
                if (lastKf) {
                    self._target[track.propName] = lastKf.value;
                }
            }
        }
        if (tracks.length || forceAnimate) {
            var clip = new Clip({
                life: this._maxTime,
                loop: this._loop,
                delay: this._delay,
                onframe: function (percent) {
                    self._started = 2;
                    var additiveAnimators = self._additiveAnimators;
                    if (additiveAnimators) {
                        var stillHasAdditiveAnimator = false;
                        for (var i = 0; i < additiveAnimators.length; i++) {
                            if (additiveAnimators[i]._clip) {
                                stillHasAdditiveAnimator = true;
                                break;
                            }
                        }
                        if (!stillHasAdditiveAnimator) {
                            self._additiveAnimators = null;
                        }
                    }
                    for (var i = 0; i < tracks.length; i++) {
                        tracks[i].step(self._target, percent);
                    }
                    var onframeList = self._onframeList;
                    if (onframeList) {
                        for (var i = 0; i < onframeList.length; i++) {
                            onframeList[i](self._target, percent);
                        }
                    }
                },
                ondestroy: function () {
                    self._doneCallback();
                }
            });
            this._clip = clip;
            if (this.animation) {
                this.animation.addClip(clip);
            }
            if (easing && easing !== 'spline') {
                clip.easing = easing;
            }
        }
        else {
            this._doneCallback();
        }
        return this;
    };
    Animator.prototype.stop = function (forwardToLast) {
        if (!this._clip) {
            return;
        }
        var clip = this._clip;
        if (forwardToLast) {
            clip.onframe(1);
        }
        this._abortedCallback();
    };
    Animator.prototype.delay = function (time) {
        this._delay = time;
        return this;
    };
    Animator.prototype.during = function (cb) {
        if (cb) {
            if (!this._onframeList) {
                this._onframeList = [];
            }
            this._onframeList.push(cb);
        }
        return this;
    };
    Animator.prototype.done = function (cb) {
        if (cb) {
            if (!this._doneList) {
                this._doneList = [];
            }
            this._doneList.push(cb);
        }
        return this;
    };
    Animator.prototype.aborted = function (cb) {
        if (cb) {
            if (!this._abortedList) {
                this._abortedList = [];
            }
            this._abortedList.push(cb);
        }
        return this;
    };
    Animator.prototype.getClip = function () {
        return this._clip;
    };
    Animator.prototype.getTrack = function (propName) {
        return this._tracks[propName];
    };
    Animator.prototype.stopTracks = function (propNames, forwardToLast) {
        if (!propNames.length || !this._clip) {
            return true;
        }
        var tracks = this._tracks;
        var tracksKeys = this._trackKeys;
        for (var i = 0; i < propNames.length; i++) {
            var track = tracks[propNames[i]];
            if (track) {
                if (forwardToLast) {
                    track.step(this._target, 1);
                }
                else if (this._started === 1) {
                    track.step(this._target, 0);
                }
                track.setFinished();
            }
        }
        var allAborted = true;
        for (var i = 0; i < tracksKeys.length; i++) {
            if (!tracks[tracksKeys[i]].isFinished()) {
                allAborted = false;
                break;
            }
        }
        if (allAborted) {
            this._abortedCallback();
        }
        return allAborted;
    };
    Animator.prototype.saveFinalToTarget = function (target, trackKeys) {
        if (!target) {
            return;
        }
        trackKeys = trackKeys || this._trackKeys;
        for (var i = 0; i < trackKeys.length; i++) {
            var propName = trackKeys[i];
            var track = this._tracks[propName];
            if (!track || track.isFinished()) {
                continue;
            }
            var kfs = track.keyframes;
            var lastKf = kfs[kfs.length - 1];
            if (lastKf) {
                var val = cloneValue(lastKf.value);
                if (track.isValueColor) {
                    val = rgba2String(val);
                }
                target[propName] = val;
            }
        }
    };
    Animator.prototype.__changeFinalValue = function (finalProps, trackKeys) {
        trackKeys = trackKeys || keys(finalProps);
        for (var i = 0; i < trackKeys.length; i++) {
            var propName = trackKeys[i];
            var track = this._tracks[propName];
            if (!track) {
                continue;
            }
            var kfs = track.keyframes;
            if (kfs.length > 1) {
                var lastKf = kfs.pop();
                track.addKeyframe(lastKf.time, finalProps[propName]);
                track.prepare(track.getAdditiveTrack());
            }
        }
    };
    return Animator;
}());
export default Animator;
