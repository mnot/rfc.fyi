import * as matrix from './matrix';
import * as vector from './vector';
var mIdentity = matrix.identity;
var EPSILON = 5e-5;
function isNotAroundZero(val) {
    return val > EPSILON || val < -EPSILON;
}
var scaleTmp = [];
var tmpTransform = [];
var originTransform = matrix.create();
var abs = Math.abs;
var Transformable = (function () {
    function Transformable() {
    }
    Transformable.prototype.setPosition = function (arr) {
        this.x = arr[0];
        this.y = arr[1];
    };
    Transformable.prototype.setScale = function (arr) {
        this.scaleX = arr[0];
        this.scaleY = arr[1];
    };
    Transformable.prototype.setOrigin = function (arr) {
        this.originX = arr[0];
        this.originY = arr[1];
    };
    Transformable.prototype.needLocalTransform = function () {
        return isNotAroundZero(this.rotation)
            || isNotAroundZero(this.x)
            || isNotAroundZero(this.y)
            || isNotAroundZero(this.scaleX - 1)
            || isNotAroundZero(this.scaleY - 1);
    };
    Transformable.prototype.updateTransform = function () {
        var parent = this.parent;
        var parentHasTransform = parent && parent.transform;
        var needLocalTransform = this.needLocalTransform();
        var m = this.transform;
        if (!(needLocalTransform || parentHasTransform)) {
            m && mIdentity(m);
            return;
        }
        m = m || matrix.create();
        if (needLocalTransform) {
            this.getLocalTransform(m);
        }
        else {
            mIdentity(m);
        }
        if (parentHasTransform) {
            if (needLocalTransform) {
                matrix.mul(m, parent.transform, m);
            }
            else {
                matrix.copy(m, parent.transform);
            }
        }
        this.transform = m;
        this._resolveGlobalScaleRatio(m);
    };
    Transformable.prototype._resolveGlobalScaleRatio = function (m) {
        var globalScaleRatio = this.globalScaleRatio;
        if (globalScaleRatio != null && globalScaleRatio !== 1) {
            this.getGlobalScale(scaleTmp);
            var relX = scaleTmp[0] < 0 ? -1 : 1;
            var relY = scaleTmp[1] < 0 ? -1 : 1;
            var sx = ((scaleTmp[0] - relX) * globalScaleRatio + relX) / scaleTmp[0] || 0;
            var sy = ((scaleTmp[1] - relY) * globalScaleRatio + relY) / scaleTmp[1] || 0;
            m[0] *= sx;
            m[1] *= sx;
            m[2] *= sy;
            m[3] *= sy;
        }
        this.invTransform = this.invTransform || matrix.create();
        matrix.invert(this.invTransform, m);
    };
    Transformable.prototype.getLocalTransform = function (m) {
        return Transformable.getLocalTransform(this, m);
    };
    Transformable.prototype.getComputedTransform = function () {
        var transformNode = this;
        var ancestors = [];
        while (transformNode) {
            ancestors.push(transformNode);
            transformNode = transformNode.parent;
        }
        while (transformNode = ancestors.pop()) {
            transformNode.updateTransform();
        }
        return this.transform;
    };
    Transformable.prototype.setLocalTransform = function (m) {
        if (!m) {
            return;
        }
        var sx = m[0] * m[0] + m[1] * m[1];
        var sy = m[2] * m[2] + m[3] * m[3];
        if (isNotAroundZero(sx - 1)) {
            sx = Math.sqrt(sx);
        }
        if (isNotAroundZero(sy - 1)) {
            sy = Math.sqrt(sy);
        }
        if (m[0] < 0) {
            sx = -sx;
        }
        if (m[3] < 0) {
            sy = -sy;
        }
        this.rotation = Math.atan2(-m[1] / sy, m[0] / sx);
        if (sx < 0 && sy < 0) {
            this.rotation += Math.PI;
            sx = -sx;
            sy = -sy;
        }
        this.x = m[4];
        this.y = m[5];
        this.scaleX = sx;
        this.scaleY = sy;
    };
    Transformable.prototype.decomposeTransform = function () {
        if (!this.transform) {
            return;
        }
        var parent = this.parent;
        var m = this.transform;
        if (parent && parent.transform) {
            matrix.mul(tmpTransform, parent.invTransform, m);
            m = tmpTransform;
        }
        var ox = this.originX;
        var oy = this.originY;
        if (ox || oy) {
            originTransform[4] = ox;
            originTransform[5] = oy;
            matrix.mul(tmpTransform, m, originTransform);
            tmpTransform[4] -= ox;
            tmpTransform[5] -= oy;
            m = tmpTransform;
        }
        this.setLocalTransform(m);
    };
    Transformable.prototype.getGlobalScale = function (out) {
        var m = this.transform;
        out = out || [];
        if (!m) {
            out[0] = 1;
            out[1] = 1;
            return out;
        }
        out[0] = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
        out[1] = Math.sqrt(m[2] * m[2] + m[3] * m[3]);
        if (m[0] < 0) {
            out[0] = -out[0];
        }
        if (m[3] < 0) {
            out[1] = -out[1];
        }
        return out;
    };
    Transformable.prototype.transformCoordToLocal = function (x, y) {
        var v2 = [x, y];
        var invTransform = this.invTransform;
        if (invTransform) {
            vector.applyTransform(v2, v2, invTransform);
        }
        return v2;
    };
    Transformable.prototype.transformCoordToGlobal = function (x, y) {
        var v2 = [x, y];
        var transform = this.transform;
        if (transform) {
            vector.applyTransform(v2, v2, transform);
        }
        return v2;
    };
    Transformable.prototype.getLineScale = function () {
        var m = this.transform;
        return m && abs(m[0] - 1) > 1e-10 && abs(m[3] - 1) > 1e-10
            ? Math.sqrt(abs(m[0] * m[3] - m[2] * m[1]))
            : 1;
    };
    Transformable.getLocalTransform = function (target, m) {
        m = m || [];
        mIdentity(m);
        var ox = target.originX || 0;
        var oy = target.originY || 0;
        var sx = target.scaleX;
        var sy = target.scaleY;
        var rotation = target.rotation || 0;
        var x = target.x;
        var y = target.y;
        m[4] -= ox;
        m[5] -= oy;
        m[0] *= sx;
        m[1] *= sy;
        m[2] *= sx;
        m[3] *= sy;
        m[4] *= sx;
        m[5] *= sy;
        if (rotation) {
            matrix.rotate(m, m, rotation);
        }
        m[4] += ox;
        m[5] += oy;
        m[4] += x;
        m[5] += y;
        return m;
    };
    Transformable.initDefaultProps = (function () {
        var proto = Transformable.prototype;
        proto.x = 0;
        proto.y = 0;
        proto.scaleX = 1;
        proto.scaleY = 1;
        proto.originX = 0;
        proto.originY = 0;
        proto.rotation = 0;
        proto.globalScaleRatio = 1;
    })();
    return Transformable;
}());
;
export default Transformable;
