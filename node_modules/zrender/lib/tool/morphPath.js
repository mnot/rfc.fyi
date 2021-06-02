import PathProxy from '../core/PathProxy';
import { cubicSubdivide } from '../core/curve';
import { defaults, assert, noop, clone } from '../core/util';
import { lerp } from '../core/vector';
import Rect from '../graphic/shape/Rect';
import Sector from '../graphic/shape/Sector';
var CMD = PathProxy.CMD;
var PI2 = Math.PI * 2;
var PROP_XY = ['x', 'y'];
var PROP_WH = ['width', 'height'];
var tmpArr = [];
function aroundEqual(a, b) {
    return Math.abs(a - b) < 1e-5;
}
export function pathToBezierCurves(path) {
    var data = path.data;
    var len = path.len();
    var bezierArray = [];
    var currentSubpath;
    var xi = 0;
    var yi = 0;
    var x0 = 0;
    var y0 = 0;
    function createNewSubpath(x, y) {
        if (currentSubpath && currentSubpath.length > 2) {
            bezierArray.push(currentSubpath);
        }
        currentSubpath = [x, y];
    }
    function addLine(x0, y0, x1, y1) {
        if (!(aroundEqual(x0, x1) && aroundEqual(y0, y1))) {
            currentSubpath.push(x0, y0, x1, y1, x1, y1);
        }
    }
    function addArc(startAngle, endAngle, cx, cy, rx, ry) {
        var delta = Math.abs(endAngle - startAngle);
        var len = Math.tan(delta / 4) * 4 / 3;
        var dir = endAngle < startAngle ? -1 : 1;
        var c1 = Math.cos(startAngle);
        var s1 = Math.sin(startAngle);
        var c2 = Math.cos(endAngle);
        var s2 = Math.sin(endAngle);
        var x1 = c1 * rx + cx;
        var y1 = s1 * ry + cy;
        var x4 = c2 * rx + cx;
        var y4 = s2 * ry + cy;
        var hx = rx * len * dir;
        var hy = ry * len * dir;
        currentSubpath.push(x1 - hx * s1, y1 + hy * c1, x4 + hx * s2, y4 - hy * c2, x4, y4);
    }
    var x1;
    var y1;
    var x2;
    var y2;
    for (var i = 0; i < len;) {
        var cmd = data[i++];
        var isFirst = i === 1;
        if (isFirst) {
            xi = data[i];
            yi = data[i + 1];
            x0 = xi;
            y0 = yi;
            if (cmd === CMD.L || cmd === CMD.C || cmd === CMD.Q) {
                currentSubpath = [x0, y0];
            }
        }
        switch (cmd) {
            case CMD.M:
                xi = x0 = data[i++];
                yi = y0 = data[i++];
                createNewSubpath(x0, y0);
                break;
            case CMD.L:
                x1 = data[i++];
                y1 = data[i++];
                addLine(xi, yi, x1, y1);
                xi = x1;
                yi = y1;
                break;
            case CMD.C:
                currentSubpath.push(data[i++], data[i++], data[i++], data[i++], xi = data[i++], yi = data[i++]);
                break;
            case CMD.Q:
                x1 = data[i++];
                y1 = data[i++];
                x2 = data[i++];
                y2 = data[i++];
                currentSubpath.push(xi + 2 / 3 * (x1 - xi), yi + 2 / 3 * (y1 - yi), x2 + 2 / 3 * (x1 - x2), y2 + 2 / 3 * (y1 - y2), x2, y2);
                xi = x2;
                yi = y2;
                break;
            case CMD.A:
                var cx = data[i++];
                var cy = data[i++];
                var rx = data[i++];
                var ry = data[i++];
                var startAngle = data[i++];
                var endAngle = data[i++] + startAngle;
                i += 1;
                var anticlockwise = !data[i++];
                x1 = Math.cos(startAngle) * rx + cx;
                y1 = Math.sin(startAngle) * ry + cy;
                if (isFirst) {
                    x0 = x1;
                    y0 = y1;
                    createNewSubpath(x0, y0);
                }
                else {
                    addLine(xi, yi, x1, y1);
                }
                xi = Math.cos(endAngle) * rx + cx;
                yi = Math.sin(endAngle) * ry + cy;
                var step = (anticlockwise ? -1 : 1) * Math.PI / 2;
                for (var angle = startAngle; anticlockwise ? angle > endAngle : angle < endAngle; angle += step) {
                    var nextAngle = anticlockwise ? Math.max(angle + step, endAngle)
                        : Math.min(angle + step, endAngle);
                    addArc(angle, nextAngle, cx, cy, rx, ry);
                }
                break;
            case CMD.R:
                x0 = xi = data[i++];
                y0 = yi = data[i++];
                x1 = x0 + data[i++];
                y1 = y0 + data[i++];
                createNewSubpath(x1, y0);
                addLine(x1, y0, x1, y1);
                addLine(x1, y1, x0, y1);
                addLine(x0, y1, x0, y0);
                addLine(x0, y0, x1, y0);
                break;
            case CMD.Z:
                currentSubpath && addLine(xi, yi, x0, y0);
                xi = x0;
                yi = y0;
                break;
        }
    }
    if (currentSubpath && currentSubpath.length > 2) {
        bezierArray.push(currentSubpath);
    }
    return bezierArray;
}
function alignSubpath(subpath1, subpath2) {
    var len1 = subpath1.length;
    var len2 = subpath2.length;
    if (len1 === len2) {
        return [subpath1, subpath2];
    }
    var shorterPath = len1 < len2 ? subpath1 : subpath2;
    var shorterLen = Math.min(len1, len2);
    var diff = Math.abs(len2 - len1) / 6;
    var shorterBezierCount = (shorterLen - 2) / 6;
    var eachCurveSubDivCount = Math.ceil(diff / shorterBezierCount) + 1;
    var newSubpath = [shorterPath[0], shorterPath[1]];
    var remained = diff;
    var tmpSegX = [];
    var tmpSegY = [];
    for (var i = 2; i < shorterLen;) {
        var x0 = shorterPath[i - 2];
        var y0 = shorterPath[i - 1];
        var x1 = shorterPath[i++];
        var y1 = shorterPath[i++];
        var x2 = shorterPath[i++];
        var y2 = shorterPath[i++];
        var x3 = shorterPath[i++];
        var y3 = shorterPath[i++];
        if (remained <= 0) {
            newSubpath.push(x1, y1, x2, y2, x3, y3);
            continue;
        }
        var actualSubDivCount = Math.min(remained, eachCurveSubDivCount - 1) + 1;
        for (var k = 1; k <= actualSubDivCount; k++) {
            var p = k / actualSubDivCount;
            cubicSubdivide(x0, x1, x2, x3, p, tmpSegX);
            cubicSubdivide(y0, y1, y2, y3, p, tmpSegY);
            x0 = tmpSegX[3];
            y0 = tmpSegY[3];
            newSubpath.push(tmpSegX[1], tmpSegY[1], tmpSegX[2], tmpSegY[2], x0, y0);
            x1 = tmpSegX[5];
            y1 = tmpSegY[5];
            x2 = tmpSegX[6];
            y2 = tmpSegY[6];
        }
        remained -= actualSubDivCount - 1;
    }
    return shorterPath === subpath1 ? [newSubpath, subpath2] : [subpath1, newSubpath];
}
function createSubpath(lastSubpathSubpath, otherSubpath) {
    var len = lastSubpathSubpath.length;
    var lastX = lastSubpathSubpath[len - 2];
    var lastY = lastSubpathSubpath[len - 1];
    var newSubpath = [];
    for (var i = 0; i < otherSubpath.length;) {
        newSubpath[i++] = lastX;
        newSubpath[i++] = lastY;
    }
    return newSubpath;
}
export function alignBezierCurves(array1, array2) {
    var _a;
    var lastSubpath1;
    var lastSubpath2;
    var newArray1 = [];
    var newArray2 = [];
    for (var i = 0; i < Math.max(array1.length, array2.length); i++) {
        var subpath1 = array1[i];
        var subpath2 = array2[i];
        var newSubpath1 = void 0;
        var newSubpath2 = void 0;
        if (!subpath1) {
            newSubpath1 = createSubpath(lastSubpath1 || subpath2, subpath2);
            newSubpath2 = subpath2;
        }
        else if (!subpath2) {
            newSubpath2 = createSubpath(lastSubpath2 || subpath1, subpath1);
            newSubpath1 = subpath1;
        }
        else {
            _a = alignSubpath(subpath1, subpath2), newSubpath1 = _a[0], newSubpath2 = _a[1];
            lastSubpath1 = newSubpath1;
            lastSubpath2 = newSubpath2;
        }
        newArray1.push(newSubpath1);
        newArray2.push(newSubpath2);
    }
    return [newArray1, newArray2];
}
export function centroid(array) {
    var signedArea = 0;
    var cx = 0;
    var cy = 0;
    var len = array.length;
    for (var i = 0, j = len - 2; i < len; j = i, i += 2) {
        var x0 = array[j];
        var y0 = array[j + 1];
        var x1 = array[i];
        var y1 = array[i + 1];
        var a = x0 * y1 - x1 * y0;
        signedArea += a;
        cx += (x0 + x1) * a;
        cy += (y0 + y1) * a;
    }
    if (signedArea === 0) {
        return [array[0] || 0, array[1] || 0];
    }
    return [cx / signedArea / 3, cy / signedArea / 3, signedArea];
}
function findBestRingOffset(fromSubBeziers, toSubBeziers, fromCp, toCp) {
    var bezierCount = (fromSubBeziers.length - 2) / 6;
    var bestScore = Infinity;
    var bestOffset = 0;
    var len = fromSubBeziers.length;
    var len2 = len - 2;
    for (var offset = 0; offset < bezierCount; offset++) {
        var cursorOffset = offset * 6;
        var score = 0;
        for (var k = 0; k < len; k += 2) {
            var idx = k === 0 ? cursorOffset : ((cursorOffset + k - 2) % len2 + 2);
            var x0 = fromSubBeziers[idx] - fromCp[0];
            var y0 = fromSubBeziers[idx + 1] - fromCp[1];
            var x1 = toSubBeziers[k] - toCp[0];
            var y1 = toSubBeziers[k + 1] - toCp[1];
            var dx = x1 - x0;
            var dy = y1 - y0;
            score += dx * dx + dy * dy;
        }
        if (score < bestScore) {
            bestScore = score;
            bestOffset = offset;
        }
    }
    return bestOffset;
}
function reverse(array) {
    var newArr = [];
    var len = array.length;
    for (var i = 0; i < len; i += 2) {
        newArr[i] = array[len - i - 2];
        newArr[i + 1] = array[len - i - 1];
    }
    return newArr;
}
function findBestMorphingRotation(fromArr, toArr, searchAngleIteration, searchAngleRange) {
    var result = [];
    var fromNeedsReverse;
    for (var i = 0; i < fromArr.length; i++) {
        var fromSubpathBezier = fromArr[i];
        var toSubpathBezier = toArr[i];
        var fromCp = centroid(fromSubpathBezier);
        var toCp = centroid(toSubpathBezier);
        if (fromNeedsReverse == null) {
            fromNeedsReverse = fromCp[2] < 0 !== toCp[2] < 0;
        }
        var newFromSubpathBezier = [];
        var newToSubpathBezier = [];
        var bestAngle = 0;
        var bestScore = Infinity;
        var tmpArr_1 = [];
        var len = fromSubpathBezier.length;
        if (fromNeedsReverse) {
            fromSubpathBezier = reverse(fromSubpathBezier);
        }
        var offset = findBestRingOffset(fromSubpathBezier, toSubpathBezier, fromCp, toCp) * 6;
        var len2 = len - 2;
        for (var k = 0; k < len2; k += 2) {
            var idx = (offset + k) % len2 + 2;
            newFromSubpathBezier[k + 2] = fromSubpathBezier[idx] - fromCp[0];
            newFromSubpathBezier[k + 3] = fromSubpathBezier[idx + 1] - fromCp[1];
        }
        newFromSubpathBezier[0] = fromSubpathBezier[offset] - fromCp[0];
        newFromSubpathBezier[1] = fromSubpathBezier[offset + 1] - fromCp[1];
        if (searchAngleIteration > 0) {
            var step = searchAngleRange / searchAngleIteration;
            for (var angle = -searchAngleRange / 2; angle <= searchAngleRange / 2; angle += step) {
                var sa = Math.sin(angle);
                var ca = Math.cos(angle);
                var score = 0;
                for (var k = 0; k < fromSubpathBezier.length; k += 2) {
                    var x0 = newFromSubpathBezier[k];
                    var y0 = newFromSubpathBezier[k + 1];
                    var x1 = toSubpathBezier[k] - toCp[0];
                    var y1 = toSubpathBezier[k + 1] - toCp[1];
                    var newX1 = x1 * ca - y1 * sa;
                    var newY1 = x1 * sa + y1 * ca;
                    tmpArr_1[k] = newX1;
                    tmpArr_1[k + 1] = newY1;
                    var dx = newX1 - x0;
                    var dy = newY1 - y0;
                    score += dx * dx + dy * dy;
                }
                if (score < bestScore) {
                    bestScore = score;
                    bestAngle = angle;
                    for (var m = 0; m < tmpArr_1.length; m++) {
                        newToSubpathBezier[m] = tmpArr_1[m];
                    }
                }
            }
        }
        else {
            for (var i_1 = 0; i_1 < len; i_1 += 2) {
                newToSubpathBezier[i_1] = toSubpathBezier[i_1] - toCp[0];
                newToSubpathBezier[i_1 + 1] = toSubpathBezier[i_1 + 1] - toCp[1];
            }
        }
        result.push({
            from: newFromSubpathBezier,
            to: newToSubpathBezier,
            fromCp: fromCp,
            toCp: toCp,
            rotation: -bestAngle
        });
    }
    return result;
}
export function morphPath(fromPath, toPath, animationOpts) {
    var fromPathProxy;
    var toPathProxy;
    if (!fromPath || !toPath) {
        return toPath;
    }
    !fromPath.path && fromPath.createPathProxy();
    fromPathProxy = fromPath.path;
    fromPathProxy.beginPath();
    fromPath.buildPath(fromPathProxy, fromPath.shape);
    !toPath.path && toPath.createPathProxy();
    toPathProxy = toPath.path;
    toPathProxy === fromPathProxy && (toPathProxy = new PathProxy(false));
    toPathProxy.beginPath();
    if (isIndividualMorphingPath(toPath)) {
        toPath.__oldBuildPath(toPathProxy, toPath.shape);
    }
    else {
        toPath.buildPath(toPathProxy, toPath.shape);
    }
    var _a = alignBezierCurves(pathToBezierCurves(fromPathProxy), pathToBezierCurves(toPathProxy)), fromBezierCurves = _a[0], toBezierCurves = _a[1];
    var morphingData = findBestMorphingRotation(fromBezierCurves, toBezierCurves, 10, Math.PI);
    becomeIndividualMorphingPath(toPath, morphingData, 0);
    var oldDone = animationOpts && animationOpts.done;
    var oldAborted = animationOpts && animationOpts.aborted;
    var oldDuring = animationOpts && animationOpts.during;
    toPath.animateTo({
        __morphT: 1
    }, defaults({
        during: function (p) {
            toPath.dirtyShape();
            oldDuring && oldDuring(p);
        },
        done: function () {
            restoreIndividualMorphingPath(toPath);
            toPath.createPathProxy();
            toPath.dirtyShape();
            oldDone && oldDone();
        },
        aborted: function () {
            oldAborted && oldAborted();
        }
    }, animationOpts));
    return toPath;
}
function morphingPathBuildPath(path) {
    var morphingData = this.__morphingData;
    var t = this.__morphT;
    var onet = 1 - t;
    var newCp = [];
    for (var i = 0; i < morphingData.length; i++) {
        var item = morphingData[i];
        var from = item.from;
        var to = item.to;
        var angle = item.rotation * t;
        var fromCp = item.fromCp;
        var toCp = item.toCp;
        var sa = Math.sin(angle);
        var ca = Math.cos(angle);
        lerp(newCp, fromCp, toCp, t);
        for (var m = 0; m < from.length; m += 2) {
            var x0 = from[m];
            var y0 = from[m + 1];
            var x1 = to[m];
            var y1 = to[m + 1];
            var x = x0 * onet + x1 * t;
            var y = y0 * onet + y1 * t;
            tmpArr[m] = (x * ca - y * sa) + newCp[0];
            tmpArr[m + 1] = (x * sa + y * ca) + newCp[1];
        }
        for (var m = 0; m < from.length;) {
            if (m === 0) {
                path.moveTo(tmpArr[m++], tmpArr[m++]);
            }
            path.bezierCurveTo(tmpArr[m++], tmpArr[m++], tmpArr[m++], tmpArr[m++], tmpArr[m++], tmpArr[m++]);
        }
    }
}
;
function becomeIndividualMorphingPath(path, morphingData, morphT) {
    if (isIndividualMorphingPath(path)) {
        updateIndividualMorphingPath(path, morphingData, morphT);
        return;
    }
    var morphingPath = path;
    morphingPath.__oldBuildPath = morphingPath.buildPath;
    morphingPath.buildPath = morphingPathBuildPath;
    updateIndividualMorphingPath(morphingPath, morphingData, morphT);
}
function updateIndividualMorphingPath(morphingPath, morphingData, morphT) {
    morphingPath.__morphingData = morphingData;
    morphingPath.__morphT = morphT;
}
function restoreIndividualMorphingPath(path) {
    if (isIndividualMorphingPath(path)) {
        path.buildPath = path.__oldBuildPath;
        path.__oldBuildPath = path.__morphingData = null;
    }
}
function isIndividualMorphingPath(path) {
    return path.__oldBuildPath != null;
}
export function isCombiningPath(path) {
    return !!path.__combiningSubList;
}
export function isInAnyMorphing(path) {
    return isIndividualMorphingPath(path) || isCombiningPath(path);
}
export function combine(fromPathList, toPath, animationOpts, copyPropsIfDivided) {
    var fromIndividuals = [];
    var separateCount = 0;
    for (var i = 0; i < fromPathList.length; i++) {
        var fromPath = fromPathList[i];
        if (isCombiningPath(fromPath)) {
            var fromCombiningSubList = fromPath.__combiningSubList;
            for (var j = 0; j < fromCombiningSubList.length; j++) {
                fromIndividuals.push(fromCombiningSubList[j]);
            }
            separateCount += fromCombiningSubList.length;
        }
        else {
            fromIndividuals.push(fromPath);
            separateCount++;
        }
    }
    if (!separateCount) {
        return;
    }
    var dividingMethod = animationOpts ? animationOpts.dividingMethod : null;
    var toPathSplittedList = divideShape(toPath, separateCount, dividingMethod);
    assert(toPathSplittedList.length === separateCount);
    var oldDone = animationOpts && animationOpts.done;
    var oldAborted = animationOpts && animationOpts.aborted;
    var oldDuring = animationOpts && animationOpts.during;
    var doneCount = 0;
    var abortedCalled = false;
    var morphAnimationOpts = defaults({
        during: function (p) {
            oldDuring && oldDuring(p);
        },
        done: function () {
            doneCount++;
            if (doneCount === toPathSplittedList.length) {
                restoreCombiningPath(toPath);
                oldDone && oldDone();
            }
        },
        aborted: function () {
            if (!abortedCalled) {
                abortedCalled = true;
                oldAborted && oldAborted();
            }
        }
    }, animationOpts);
    for (var i = 0; i < separateCount; i++) {
        var from = fromIndividuals[i];
        var to = toPathSplittedList[i];
        copyPropsIfDivided && copyPropsIfDivided(toPath, to, true);
        morphPath(from, to, morphAnimationOpts);
    }
    becomeCombiningPath(toPath, toPathSplittedList);
    return {
        fromIndividuals: fromIndividuals,
        toIndividuals: toPathSplittedList,
        count: separateCount
    };
}
function becomeCombiningPath(path, combiningSubList) {
    if (isCombiningPath(path)) {
        updateCombiningPathSubList(path, combiningSubList);
        return;
    }
    var combiningPath = path;
    updateCombiningPathSubList(combiningPath, combiningSubList);
    combiningPath.__oldAddSelfToZr = path.addSelfToZr;
    combiningPath.__oldRemoveSelfFromZr = path.removeSelfFromZr;
    combiningPath.addSelfToZr = combiningAddSelfToZr;
    combiningPath.removeSelfFromZr = combiningRemoveSelfFromZr;
    combiningPath.__oldBuildPath = combiningPath.buildPath;
    combiningPath.buildPath = noop;
    combiningPath.childrenRef = combiningChildrenRef;
}
function restoreCombiningPath(path) {
    if (!isCombiningPath(path)) {
        return;
    }
    var combiningPath = path;
    updateCombiningPathSubList(combiningPath, null);
    combiningPath.addSelfToZr = combiningPath.__oldAddSelfToZr;
    combiningPath.removeSelfFromZr = combiningPath.__oldRemoveSelfFromZr;
    combiningPath.buildPath = combiningPath.__oldBuildPath;
    combiningPath.childrenRef =
        combiningPath.__combiningSubList =
            combiningPath.__oldAddSelfToZr =
                combiningPath.__oldRemoveSelfFromZr =
                    combiningPath.__oldBuildPath = null;
}
function updateCombiningPathSubList(combiningPath, combiningSubList) {
    if (combiningPath.__combiningSubList !== combiningSubList) {
        combiningPathSubListAddRemoveWithZr(combiningPath, 'removeSelfFromZr');
        combiningPath.__combiningSubList = combiningSubList;
        if (combiningSubList) {
            for (var i = 0; i < combiningSubList.length; i++) {
                combiningSubList[i].parent = combiningPath;
            }
        }
        combiningPathSubListAddRemoveWithZr(combiningPath, 'addSelfToZr');
    }
}
function combiningAddSelfToZr(zr) {
    this.__oldAddSelfToZr(zr);
    combiningPathSubListAddRemoveWithZr(this, 'addSelfToZr');
}
function combiningPathSubListAddRemoveWithZr(path, method) {
    var combiningSubList = path.__combiningSubList;
    var zr = path.__zr;
    if (combiningSubList && zr) {
        for (var i = 0; i < combiningSubList.length; i++) {
            var child = combiningSubList[i];
            child[method](zr);
        }
    }
}
function combiningRemoveSelfFromZr(zr) {
    this.__oldRemoveSelfFromZr(zr);
    var combiningSubList = this.__combiningSubList;
    for (var i = 0; i < combiningSubList.length; i++) {
        var child = combiningSubList[i];
        child.removeSelfFromZr(zr);
    }
}
function combiningChildrenRef() {
    return this.__combiningSubList;
}
export function separate(fromPath, toPathList, animationOpts, copyPropsIfDivided) {
    var toPathListLen = toPathList.length;
    var fromPathList;
    var dividingMethod = animationOpts ? animationOpts.dividingMethod : null;
    var copyProps = false;
    if (isCombiningPath(fromPath)) {
        var fromCombiningSubList = fromPath.__combiningSubList;
        if (fromCombiningSubList.length === toPathListLen) {
            fromPathList = fromCombiningSubList;
        }
        else {
            fromPathList = divideShape(fromPath, toPathListLen, dividingMethod);
            copyProps = true;
        }
    }
    else {
        fromPathList = divideShape(fromPath, toPathListLen, dividingMethod);
        copyProps = true;
    }
    assert(fromPathList.length === toPathListLen);
    for (var i = 0; i < toPathListLen; i++) {
        if (copyProps && copyPropsIfDivided) {
            copyPropsIfDivided(fromPath, fromPathList[i], false);
        }
        morphPath(fromPathList[i], toPathList[i], animationOpts);
    }
    return {
        fromIndividuals: fromPathList,
        toIndividuals: toPathList,
        count: toPathListLen
    };
}
function divideShape(path, separateCount, dividingMethod) {
    return dividingMethod === 'duplicate'
        ? duplicateShape(path, separateCount)
        : splitShape(path, separateCount);
}
function splitShape(path, separateCount) {
    var resultPaths = [];
    if (separateCount <= 0) {
        return resultPaths;
    }
    if (separateCount === 1) {
        return duplicateShape(path, separateCount);
    }
    if (path instanceof Rect) {
        var toPathShape = path.shape;
        var splitPropIdx = toPathShape.height > toPathShape.width ? 1 : 0;
        var propWH = PROP_WH[splitPropIdx];
        var propXY = PROP_XY[splitPropIdx];
        var subWH = toPathShape[propWH] / separateCount;
        var xyCurr = toPathShape[propXY];
        for (var i = 0; i < separateCount; i++, xyCurr += subWH) {
            var subShape = {
                x: toPathShape.x,
                y: toPathShape.y,
                width: toPathShape.width,
                height: toPathShape.height
            };
            subShape[propXY] = xyCurr;
            subShape[propWH] = i < separateCount - 1
                ? subWH
                : toPathShape[propXY] + toPathShape[propWH] - xyCurr;
            var splitted = new Rect({ shape: subShape });
            resultPaths.push(splitted);
        }
    }
    else if (path instanceof Sector) {
        var toPathShape = path.shape;
        var clockwise = toPathShape.clockwise;
        var startAngle = toPathShape.startAngle;
        var endAngle = toPathShape.endAngle;
        var endAngleNormalized = normalizeRadian(startAngle, toPathShape.endAngle, clockwise);
        var step = (endAngleNormalized - startAngle) / separateCount;
        var angleCurr = startAngle;
        for (var i = 0; i < separateCount; i++, angleCurr += step) {
            var splitted = new Sector({
                shape: {
                    cx: toPathShape.cx,
                    cy: toPathShape.cy,
                    r: toPathShape.r,
                    r0: toPathShape.r0,
                    clockwise: clockwise,
                    startAngle: angleCurr,
                    endAngle: i === separateCount - 1 ? endAngle : angleCurr + step
                }
            });
            resultPaths.push(splitted);
        }
    }
    else {
        return duplicateShape(path, separateCount);
    }
    return resultPaths;
}
function duplicateShape(path, separateCount) {
    var resultPaths = [];
    if (separateCount <= 0) {
        return resultPaths;
    }
    var ctor = path.constructor;
    for (var i = 0; i < separateCount; i++) {
        var sub = new ctor({
            shape: clone(path.shape)
        });
        resultPaths.push(sub);
    }
    return resultPaths;
}
function normalizeRadian(start, end, clockwise) {
    return end + PI2 * (Math[clockwise ? 'ceil' : 'floor']((start - end) / PI2));
}
