import { createElement } from './core';
import ZRImage from '../graphic/Image';
import { DEFAULT_FONT, getLineHeight } from '../contain/text';
import { map } from '../core/util';
import { normalizeLineDash } from '../graphic/helper/dashStyle';
var NONE = 'none';
var mathRound = Math.round;
var mathSin = Math.sin;
var mathCos = Math.cos;
var PI = Math.PI;
var PI2 = Math.PI * 2;
var degree = 180 / PI;
var EPSILON = 1e-4;
function round3(val) {
    return mathRound(val * 1e3) / 1e3;
}
function round4(val) {
    return mathRound(val * 1e4) / 1e4;
}
function isAroundZero(val) {
    return val < EPSILON && val > -EPSILON;
}
function pathHasFill(style) {
    var fill = style.fill;
    return fill != null && fill !== NONE;
}
function pathHasStroke(style) {
    var stroke = style.stroke;
    return stroke != null && stroke !== NONE;
}
function setTransform(svgEl, m) {
    if (m) {
        attr(svgEl, 'transform', 'matrix('
            + round3(m[0]) + ','
            + round3(m[1]) + ','
            + round3(m[2]) + ','
            + round3(m[3]) + ','
            + round4(m[4]) + ','
            + round4(m[5])
            + ')');
    }
}
function attr(el, key, val) {
    if (!val || val.type !== 'linear' && val.type !== 'radial') {
        el.setAttribute(key, val);
    }
}
function attrXLink(el, key, val) {
    el.setAttributeNS('http://www.w3.org/1999/xlink', key, val);
}
function attrXML(el, key, val) {
    el.setAttributeNS('http://www.w3.org/XML/1998/namespace', key, val);
}
function bindStyle(svgEl, style, el) {
    var opacity = style.opacity == null ? 1 : style.opacity;
    if (el instanceof ZRImage) {
        svgEl.style.opacity = opacity + '';
        return;
    }
    if (pathHasFill(style)) {
        var fill = style.fill;
        fill = fill === 'transparent' ? NONE : fill;
        attr(svgEl, 'fill', fill);
        attr(svgEl, 'fill-opacity', (style.fillOpacity != null ? style.fillOpacity * opacity : opacity) + '');
    }
    else {
        attr(svgEl, 'fill', NONE);
    }
    if (pathHasStroke(style)) {
        var stroke = style.stroke;
        stroke = stroke === 'transparent' ? NONE : stroke;
        attr(svgEl, 'stroke', stroke);
        var strokeWidth = style.lineWidth;
        var strokeScale_1 = style.strokeNoScale
            ? el.getLineScale()
            : 1;
        attr(svgEl, 'stroke-width', (strokeScale_1 ? strokeWidth / strokeScale_1 : 0) + '');
        attr(svgEl, 'paint-order', style.strokeFirst ? 'stroke' : 'fill');
        attr(svgEl, 'stroke-opacity', (style.strokeOpacity != null ? style.strokeOpacity * opacity : opacity) + '');
        var lineDash = style.lineDash && strokeWidth > 0 && normalizeLineDash(style.lineDash, strokeWidth);
        if (lineDash) {
            var lineDashOffset = style.lineDashOffset;
            if (strokeScale_1 && strokeScale_1 !== 1) {
                lineDash = map(lineDash, function (rawVal) {
                    return rawVal / strokeScale_1;
                });
                if (lineDashOffset) {
                    lineDashOffset /= strokeScale_1;
                    lineDashOffset = mathRound(lineDashOffset);
                }
            }
            attr(svgEl, 'stroke-dasharray', lineDash.join(','));
            attr(svgEl, 'stroke-dashoffset', (lineDashOffset || 0) + '');
        }
        else {
            attr(svgEl, 'stroke-dasharray', '');
        }
        style.lineCap && attr(svgEl, 'stroke-linecap', style.lineCap);
        style.lineJoin && attr(svgEl, 'stroke-linejoin', style.lineJoin);
        style.miterLimit && attr(svgEl, 'stroke-miterlimit', style.miterLimit + '');
    }
    else {
        attr(svgEl, 'stroke', NONE);
    }
}
var SVGPathRebuilder = (function () {
    function SVGPathRebuilder() {
    }
    SVGPathRebuilder.prototype.reset = function () {
        this._d = [];
        this._str = '';
    };
    SVGPathRebuilder.prototype.moveTo = function (x, y) {
        this._add('M', x, y);
    };
    SVGPathRebuilder.prototype.lineTo = function (x, y) {
        this._add('L', x, y);
    };
    SVGPathRebuilder.prototype.bezierCurveTo = function (x, y, x2, y2, x3, y3) {
        this._add('C', x, y, x2, y2, x3, y3);
    };
    SVGPathRebuilder.prototype.quadraticCurveTo = function (x, y, x2, y2) {
        this._add('Q', x, y, x2, y2);
    };
    SVGPathRebuilder.prototype.arc = function (cx, cy, r, startAngle, endAngle, anticlockwise) {
        this.ellipse(cx, cy, r, r, 0, startAngle, endAngle, anticlockwise);
    };
    SVGPathRebuilder.prototype.ellipse = function (cx, cy, rx, ry, psi, startAngle, endAngle, anticlockwise) {
        var firstCmd = this._d.length === 0;
        var dTheta = endAngle - startAngle;
        var clockwise = !anticlockwise;
        var dThetaPositive = Math.abs(dTheta);
        var isCircle = isAroundZero(dThetaPositive - PI2)
            || (clockwise ? dTheta >= PI2 : -dTheta >= PI2);
        var unifiedTheta = dTheta > 0 ? dTheta % PI2 : (dTheta % PI2 + PI2);
        var large = false;
        if (isCircle) {
            large = true;
        }
        else if (isAroundZero(dThetaPositive)) {
            large = false;
        }
        else {
            large = (unifiedTheta >= PI) === !!clockwise;
        }
        var x0 = round4(cx + rx * mathCos(startAngle));
        var y0 = round4(cy + ry * mathSin(startAngle));
        if (isCircle) {
            if (clockwise) {
                dTheta = PI2 - 1e-4;
            }
            else {
                dTheta = -PI2 + 1e-4;
            }
            large = true;
            if (firstCmd) {
                this._d.push('M', x0, y0);
            }
        }
        var x = round4(cx + rx * mathCos(startAngle + dTheta));
        var y = round4(cy + ry * mathSin(startAngle + dTheta));
        if (isNaN(x0) || isNaN(y0) || isNaN(rx) || isNaN(ry) || isNaN(psi) || isNaN(degree) || isNaN(x) || isNaN(y)) {
            return '';
        }
        this._d.push('A', round4(rx), round4(ry), mathRound(psi * degree), +large, +clockwise, x, y);
    };
    SVGPathRebuilder.prototype.rect = function (x, y, w, h) {
        this._add('M', x, y);
        this._add('L', x + w, y);
        this._add('L', x + w, y + h);
        this._add('L', x, y + h);
        this._add('L', x, y);
    };
    SVGPathRebuilder.prototype.closePath = function () {
        if (this._d.length > 0) {
            this._add('Z');
        }
    };
    SVGPathRebuilder.prototype._add = function (cmd, a, b, c, d, e, f, g, h) {
        this._d.push(cmd);
        for (var i = 1; i < arguments.length; i++) {
            var val = arguments[i];
            if (isNaN(val)) {
                this._invalid = true;
                return;
            }
            this._d.push(round4(val));
        }
    };
    SVGPathRebuilder.prototype.generateStr = function () {
        this._str = this._invalid ? '' : this._d.join(' ');
        this._d = [];
    };
    SVGPathRebuilder.prototype.getStr = function () {
        return this._str;
    };
    return SVGPathRebuilder;
}());
var svgPath = {
    brush: function (el) {
        var style = el.style;
        var svgEl = el.__svgEl;
        if (!svgEl) {
            svgEl = createElement('path');
            el.__svgEl = svgEl;
        }
        if (!el.path) {
            el.createPathProxy();
        }
        var path = el.path;
        if (el.shapeChanged()) {
            path.beginPath();
            el.buildPath(path, el.shape);
            el.pathUpdated();
        }
        var pathVersion = path.getVersion();
        var elExt = el;
        var svgPathBuilder = elExt.__svgPathBuilder;
        if (elExt.__svgPathVersion !== pathVersion || !svgPathBuilder || el.style.strokePercent < 1) {
            if (!svgPathBuilder) {
                svgPathBuilder = elExt.__svgPathBuilder = new SVGPathRebuilder();
            }
            svgPathBuilder.reset();
            path.rebuildPath(svgPathBuilder, el.style.strokePercent);
            svgPathBuilder.generateStr();
            elExt.__svgPathVersion = pathVersion;
        }
        attr(svgEl, 'd', svgPathBuilder.getStr());
        bindStyle(svgEl, style, el);
        setTransform(svgEl, el.transform);
    }
};
export { svgPath as path };
var svgImage = {
    brush: function (el) {
        var style = el.style;
        var image = style.image;
        if (image instanceof HTMLImageElement) {
            image = image.src;
        }
        else if (image instanceof HTMLCanvasElement) {
            image = image.toDataURL();
        }
        if (!image) {
            return;
        }
        var x = style.x || 0;
        var y = style.y || 0;
        var dw = style.width;
        var dh = style.height;
        var svgEl = el.__svgEl;
        if (!svgEl) {
            svgEl = createElement('image');
            el.__svgEl = svgEl;
        }
        if (image !== el.__imageSrc) {
            attrXLink(svgEl, 'href', image);
            el.__imageSrc = image;
        }
        attr(svgEl, 'width', dw + '');
        attr(svgEl, 'height', dh + '');
        attr(svgEl, 'x', x + '');
        attr(svgEl, 'y', y + '');
        bindStyle(svgEl, style, el);
        setTransform(svgEl, el.transform);
    }
};
export { svgImage as image };
var TEXT_ALIGN_TO_ANCHOR = {
    left: 'start',
    right: 'end',
    center: 'middle',
    middle: 'middle'
};
function adjustTextY(y, lineHeight, textBaseline) {
    if (textBaseline === 'top') {
        y += lineHeight / 2;
    }
    else if (textBaseline === 'bottom') {
        y -= lineHeight / 2;
    }
    return y;
}
var svgText = {
    brush: function (el) {
        var style = el.style;
        var text = style.text;
        text != null && (text += '');
        if (!text || isNaN(style.x) || isNaN(style.y)) {
            return;
        }
        var textSvgEl = el.__svgEl;
        if (!textSvgEl) {
            textSvgEl = createElement('text');
            attrXML(textSvgEl, 'xml:space', 'preserve');
            el.__svgEl = textSvgEl;
        }
        var font = style.font || DEFAULT_FONT;
        var textSvgElStyle = textSvgEl.style;
        textSvgElStyle.font = font;
        textSvgEl.textContent = text;
        bindStyle(textSvgEl, style, el);
        setTransform(textSvgEl, el.transform);
        var x = style.x || 0;
        var y = adjustTextY(style.y || 0, getLineHeight(font), style.textBaseline);
        var textAlign = TEXT_ALIGN_TO_ANCHOR[style.textAlign]
            || style.textAlign;
        attr(textSvgEl, 'dominant-baseline', 'central');
        attr(textSvgEl, 'text-anchor', textAlign);
        attr(textSvgEl, 'x', x + '');
        attr(textSvgEl, 'y', y + '');
    }
};
export { svgText as text };
