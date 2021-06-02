import { normalizeArcAngles } from '../../core/PathProxy';
var PI = Math.PI;
var PI2 = PI * 2;
var mathSin = Math.sin;
var mathCos = Math.cos;
var mathACos = Math.acos;
var mathATan2 = Math.atan2;
var mathAbs = Math.abs;
var mathSqrt = Math.sqrt;
var mathMax = Math.max;
var mathMin = Math.min;
var e = 1e-4;
function intersect(x0, y0, x1, y1, x2, y2, x3, y3) {
    var x10 = x1 - x0;
    var y10 = y1 - y0;
    var x32 = x3 - x2;
    var y32 = y3 - y2;
    var t = y32 * x10 - x32 * y10;
    if (t * t < e) {
        return;
    }
    t = (x32 * (y0 - y2) - y32 * (x0 - x2)) / t;
    return [x0 + t * x10, y0 + t * y10];
}
function computeCornerTangents(x0, y0, x1, y1, radius, cr, clockwise) {
    var x01 = x0 - x1;
    var y01 = y0 - y1;
    var lo = (clockwise ? cr : -cr) / mathSqrt(x01 * x01 + y01 * y01);
    var ox = lo * y01;
    var oy = -lo * x01;
    var x11 = x0 + ox;
    var y11 = y0 + oy;
    var x10 = x1 + ox;
    var y10 = y1 + oy;
    var x00 = (x11 + x10) / 2;
    var y00 = (y11 + y10) / 2;
    var dx = x10 - x11;
    var dy = y10 - y11;
    var d2 = dx * dx + dy * dy;
    var r = radius - cr;
    var s = x11 * y10 - x10 * y11;
    var d = (dy < 0 ? -1 : 1) * mathSqrt(mathMax(0, r * r * d2 - s * s));
    var cx0 = (s * dy - dx * d) / d2;
    var cy0 = (-s * dx - dy * d) / d2;
    var cx1 = (s * dy + dx * d) / d2;
    var cy1 = (-s * dx + dy * d) / d2;
    var dx0 = cx0 - x00;
    var dy0 = cy0 - y00;
    var dx1 = cx1 - x00;
    var dy1 = cy1 - y00;
    if (dx0 * dx0 + dy0 * dy0 > dx1 * dx1 + dy1 * dy1) {
        cx0 = cx1;
        cy0 = cy1;
    }
    return {
        cx: cx0,
        cy: cy0,
        x01: -ox,
        y01: -oy,
        x11: cx0 * (radius / r - 1),
        y11: cy0 * (radius / r - 1)
    };
}
export function buildPath(ctx, shape) {
    var radius = mathMax(shape.r, 0);
    var innerRadius = mathMax(shape.r0 || 0, 0);
    var hasRadius = radius > 0;
    var hasInnerRadius = innerRadius > 0;
    if (!hasRadius && !hasInnerRadius) {
        return;
    }
    if (!hasRadius) {
        radius = innerRadius;
        innerRadius = 0;
    }
    if (innerRadius > radius) {
        var tmp = radius;
        radius = innerRadius;
        innerRadius = tmp;
    }
    var clockwise = !!shape.clockwise;
    var startAngle = shape.startAngle;
    var endAngle = shape.endAngle;
    var arc;
    if (startAngle === endAngle) {
        arc = 0;
    }
    else {
        var tmpAngles = [startAngle, endAngle];
        normalizeArcAngles(tmpAngles, !clockwise);
        arc = mathAbs(tmpAngles[0] - tmpAngles[1]);
    }
    var x = shape.cx;
    var y = shape.cy;
    var cornerRadius = shape.cornerRadius || 0;
    var innerCornerRadius = shape.innerCornerRadius || 0;
    if (!(radius > e)) {
        ctx.moveTo(x, y);
    }
    else if (arc > PI2 - e) {
        ctx.moveTo(x + radius * mathCos(startAngle), y + radius * mathSin(startAngle));
        ctx.arc(x, y, radius, startAngle, endAngle, !clockwise);
        if (innerRadius > e) {
            ctx.moveTo(x + innerRadius * mathCos(endAngle), y + innerRadius * mathSin(endAngle));
            ctx.arc(x, y, innerRadius, endAngle, startAngle, clockwise);
        }
    }
    else {
        var halfRd = mathAbs(radius - innerRadius) / 2;
        var cr = mathMin(halfRd, cornerRadius);
        var icr = mathMin(halfRd, innerCornerRadius);
        var cr0 = icr;
        var cr1 = cr;
        var xrs = radius * mathCos(startAngle);
        var yrs = radius * mathSin(startAngle);
        var xire = innerRadius * mathCos(endAngle);
        var yire = innerRadius * mathSin(endAngle);
        var xre = void 0;
        var yre = void 0;
        var xirs = void 0;
        var yirs = void 0;
        if (cr > e || icr > e) {
            xre = radius * mathCos(endAngle);
            yre = radius * mathSin(endAngle);
            xirs = innerRadius * mathCos(startAngle);
            yirs = innerRadius * mathSin(startAngle);
            if (arc < PI) {
                var it_1 = intersect(xrs, yrs, xirs, yirs, xre, yre, xire, yire);
                if (it_1) {
                    var x0 = xrs - it_1[0];
                    var y0 = yrs - it_1[1];
                    var x1 = xre - it_1[0];
                    var y1 = yre - it_1[1];
                    var a = 1 / mathSin(mathACos((x0 * x1 + y0 * y1) / (mathSqrt(x0 * x0 + y0 * y0) * mathSqrt(x1 * x1 + y1 * y1))) / 2);
                    var b = mathSqrt(it_1[0] * it_1[0] + it_1[1] * it_1[1]);
                    cr0 = mathMin(icr, (innerRadius - b) / (a - 1));
                    cr1 = mathMin(cr, (radius - b) / (a + 1));
                }
            }
        }
        if (!(arc > e)) {
            ctx.moveTo(x + xrs, y + yrs);
        }
        else if (cr1 > e) {
            var ct0 = computeCornerTangents(xirs, yirs, xrs, yrs, radius, cr1, clockwise);
            var ct1 = computeCornerTangents(xre, yre, xire, yire, radius, cr1, clockwise);
            ctx.moveTo(x + ct0.cx + ct0.x01, y + ct0.cy + ct0.y01);
            if (cr1 < cr) {
                ctx.arc(x + ct0.cx, y + ct0.cy, cr1, mathATan2(ct0.y01, ct0.x01), mathATan2(ct1.y01, ct1.x01), !clockwise);
            }
            else {
                ctx.arc(x + ct0.cx, y + ct0.cy, cr1, mathATan2(ct0.y01, ct0.x01), mathATan2(ct0.y11, ct0.x11), !clockwise);
                ctx.arc(x, y, radius, mathATan2(ct0.cy + ct0.y11, ct0.cx + ct0.x11), mathATan2(ct1.cy + ct1.y11, ct1.cx + ct1.x11), !clockwise);
                ctx.arc(x + ct1.cx, y + ct1.cy, cr1, mathATan2(ct1.y11, ct1.x11), mathATan2(ct1.y01, ct1.x01), !clockwise);
            }
        }
        else {
            ctx.moveTo(x + xrs, y + yrs);
            ctx.arc(x, y, radius, startAngle, endAngle, !clockwise);
        }
        if (!(innerRadius > e) || !(arc > e)) {
            ctx.lineTo(x + xire, y + yire);
        }
        else if (cr0 > e) {
            var ct0 = computeCornerTangents(xire, yire, xre, yre, innerRadius, -cr0, clockwise);
            var ct1 = computeCornerTangents(xrs, yrs, xirs, yirs, innerRadius, -cr0, clockwise);
            ctx.lineTo(x + ct0.cx + ct0.x01, y + ct0.cy + ct0.y01);
            if (cr0 < icr) {
                ctx.arc(x + ct0.cx, y + ct0.cy, cr0, mathATan2(ct0.y01, ct0.x01), mathATan2(ct1.y01, ct1.x01), !clockwise);
            }
            else {
                ctx.arc(x + ct0.cx, y + ct0.cy, cr0, mathATan2(ct0.y01, ct0.x01), mathATan2(ct0.y11, ct0.x11), !clockwise);
                ctx.arc(x, y, innerRadius, mathATan2(ct0.cy + ct0.y11, ct0.cx + ct0.x11), mathATan2(ct1.cy + ct1.y11, ct1.cx + ct1.x11), clockwise);
                ctx.arc(x + ct1.cx, y + ct1.cy, cr0, mathATan2(ct1.y11, ct1.x11), mathATan2(ct1.y01, ct1.x01), !clockwise);
            }
        }
        else {
            ctx.lineTo(x + xire, y + yire);
            ctx.arc(x, y, innerRadius, endAngle, startAngle, clockwise);
        }
    }
    ctx.closePath();
}
