import { createElement } from './core';
import * as util from '../core/util';
import Path from '../graphic/Path';
import ZRImage from '../graphic/Image';
import TSpan from '../graphic/TSpan';
import arrayDiff from '../core/arrayDiff';
import GradientManager from './helper/GradientManager';
import PatternManager from './helper/PatternManager';
import ClippathManager, { hasClipPath } from './helper/ClippathManager';
import ShadowManager from './helper/ShadowManager';
import { path as svgPath, image as svgImage, text as svgText } from './graphic';
function parseInt10(val) {
    return parseInt(val, 10);
}
function getSvgProxy(el) {
    if (el instanceof Path) {
        return svgPath;
    }
    else if (el instanceof ZRImage) {
        return svgImage;
    }
    else if (el instanceof TSpan) {
        return svgText;
    }
    else {
        return svgPath;
    }
}
function checkParentAvailable(parent, child) {
    return child && parent && child.parentNode !== parent;
}
function insertAfter(parent, child, prevSibling) {
    if (checkParentAvailable(parent, child) && prevSibling) {
        var nextSibling = prevSibling.nextSibling;
        nextSibling ? parent.insertBefore(child, nextSibling)
            : parent.appendChild(child);
    }
}
function prepend(parent, child) {
    if (checkParentAvailable(parent, child)) {
        var firstChild = parent.firstChild;
        firstChild ? parent.insertBefore(child, firstChild)
            : parent.appendChild(child);
    }
}
function remove(parent, child) {
    if (child && parent && child.parentNode === parent) {
        parent.removeChild(child);
    }
}
function removeFromMyParent(child) {
    if (child && child.parentNode) {
        child.parentNode.removeChild(child);
    }
}
function getSvgElement(displayable) {
    return displayable.__svgEl;
}
var SVGPainter = (function () {
    function SVGPainter(root, storage, opts, zrId) {
        this.type = 'svg';
        this.refreshHover = createMethodNotSupport('refreshHover');
        this.pathToImage = createMethodNotSupport('pathToImage');
        this.configLayer = createMethodNotSupport('configLayer');
        this.root = root;
        this.storage = storage;
        this._opts = opts = util.extend({}, opts || {});
        var svgDom = createElement('svg');
        svgDom.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg');
        svgDom.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svgDom.setAttribute('version', '1.1');
        svgDom.setAttribute('baseProfile', 'full');
        svgDom.style.cssText = 'user-select:none;position:absolute;left:0;top:0;';
        var bgRoot = createElement('g');
        svgDom.appendChild(bgRoot);
        var svgRoot = createElement('g');
        svgDom.appendChild(svgRoot);
        this._gradientManager = new GradientManager(zrId, svgRoot);
        this._patternManager = new PatternManager(zrId, svgRoot);
        this._clipPathManager = new ClippathManager(zrId, svgRoot);
        this._shadowManager = new ShadowManager(zrId, svgRoot);
        var viewport = document.createElement('div');
        viewport.style.cssText = 'overflow:hidden;position:relative';
        this._svgDom = svgDom;
        this._svgRoot = svgRoot;
        this._backgroundRoot = bgRoot;
        this._viewport = viewport;
        root.appendChild(viewport);
        viewport.appendChild(svgDom);
        this.resize(opts.width, opts.height);
        this._visibleList = [];
    }
    SVGPainter.prototype.getType = function () {
        return 'svg';
    };
    SVGPainter.prototype.getViewportRoot = function () {
        return this._viewport;
    };
    SVGPainter.prototype.getSvgDom = function () {
        return this._svgDom;
    };
    SVGPainter.prototype.getSvgRoot = function () {
        return this._svgRoot;
    };
    SVGPainter.prototype.getViewportRootOffset = function () {
        var viewportRoot = this.getViewportRoot();
        if (viewportRoot) {
            return {
                offsetLeft: viewportRoot.offsetLeft || 0,
                offsetTop: viewportRoot.offsetTop || 0
            };
        }
    };
    SVGPainter.prototype.refresh = function () {
        var list = this.storage.getDisplayList(true);
        this._paintList(list);
    };
    SVGPainter.prototype.setBackgroundColor = function (backgroundColor) {
        if (this._backgroundRoot && this._backgroundNode) {
            this._backgroundRoot.removeChild(this._backgroundNode);
        }
        var bgNode = createElement('rect');
        bgNode.setAttribute('width', this.getWidth());
        bgNode.setAttribute('height', this.getHeight());
        bgNode.setAttribute('x', 0);
        bgNode.setAttribute('y', 0);
        bgNode.setAttribute('id', 0);
        bgNode.style.fill = backgroundColor;
        this._backgroundRoot.appendChild(bgNode);
        this._backgroundNode = bgNode;
    };
    SVGPainter.prototype.createSVGElement = function (tag) {
        return createElement(tag);
    };
    SVGPainter.prototype.paintOne = function (el) {
        var svgProxy = getSvgProxy(el);
        svgProxy && svgProxy.brush(el);
        return getSvgElement(el);
    };
    SVGPainter.prototype._paintList = function (list) {
        var gradientManager = this._gradientManager;
        var patternManager = this._patternManager;
        var clipPathManager = this._clipPathManager;
        var shadowManager = this._shadowManager;
        gradientManager.markAllUnused();
        patternManager.markAllUnused();
        clipPathManager.markAllUnused();
        shadowManager.markAllUnused();
        var svgRoot = this._svgRoot;
        var visibleList = this._visibleList;
        var listLen = list.length;
        var newVisibleList = [];
        for (var i = 0; i < listLen; i++) {
            var displayable = list[i];
            var svgProxy = getSvgProxy(displayable);
            var svgElement = getSvgElement(displayable);
            if (!displayable.invisible) {
                if (displayable.__dirty || !svgElement) {
                    svgProxy && svgProxy.brush(displayable);
                    svgElement = getSvgElement(displayable);
                    if (svgElement && displayable.style) {
                        gradientManager.update(displayable.style.fill);
                        gradientManager.update(displayable.style.stroke);
                        patternManager.update(displayable.style.fill);
                        patternManager.update(displayable.style.stroke);
                        shadowManager.update(svgElement, displayable);
                    }
                    displayable.__dirty = 0;
                }
                if (svgElement) {
                    newVisibleList.push(displayable);
                }
            }
        }
        var diff = arrayDiff(visibleList, newVisibleList);
        var prevSvgElement;
        var topPrevSvgElement;
        for (var i = 0; i < diff.length; i++) {
            var item = diff[i];
            if (item.removed) {
                for (var k = 0; k < item.count; k++) {
                    var displayable = visibleList[item.indices[k]];
                    var svgElement = getSvgElement(displayable);
                    hasClipPath(displayable) ? removeFromMyParent(svgElement)
                        : remove(svgRoot, svgElement);
                }
            }
        }
        var prevDisplayable;
        var currentClipGroup;
        for (var i = 0; i < diff.length; i++) {
            var item = diff[i];
            if (item.removed) {
                continue;
            }
            for (var k = 0; k < item.count; k++) {
                var displayable = newVisibleList[item.indices[k]];
                var clipGroup = clipPathManager.update(displayable, prevDisplayable);
                if (clipGroup !== currentClipGroup) {
                    prevSvgElement = topPrevSvgElement;
                    if (clipGroup) {
                        prevSvgElement ? insertAfter(svgRoot, clipGroup, prevSvgElement)
                            : prepend(svgRoot, clipGroup);
                        topPrevSvgElement = clipGroup;
                        prevSvgElement = null;
                    }
                    currentClipGroup = clipGroup;
                }
                var svgElement = getSvgElement(displayable);
                prevSvgElement
                    ? insertAfter(currentClipGroup || svgRoot, svgElement, prevSvgElement)
                    : prepend(currentClipGroup || svgRoot, svgElement);
                prevSvgElement = svgElement || prevSvgElement;
                if (!currentClipGroup) {
                    topPrevSvgElement = prevSvgElement;
                }
                gradientManager.markUsed(displayable);
                gradientManager.addWithoutUpdate(svgElement, displayable);
                patternManager.markUsed(displayable);
                patternManager.addWithoutUpdate(svgElement, displayable);
                clipPathManager.markUsed(displayable);
                prevDisplayable = displayable;
            }
        }
        gradientManager.removeUnused();
        patternManager.removeUnused();
        clipPathManager.removeUnused();
        shadowManager.removeUnused();
        this._visibleList = newVisibleList;
    };
    SVGPainter.prototype.resize = function (width, height) {
        var viewport = this._viewport;
        viewport.style.display = 'none';
        var opts = this._opts;
        width != null && (opts.width = width);
        height != null && (opts.height = height);
        width = this._getSize(0);
        height = this._getSize(1);
        viewport.style.display = '';
        if (this._width !== width || this._height !== height) {
            this._width = width;
            this._height = height;
            var viewportStyle = viewport.style;
            viewportStyle.width = width + 'px';
            viewportStyle.height = height + 'px';
            var svgRoot = this._svgDom;
            svgRoot.setAttribute('width', width + '');
            svgRoot.setAttribute('height', height + '');
        }
        if (this._backgroundNode) {
            this._backgroundNode.setAttribute('width', width);
            this._backgroundNode.setAttribute('height', height);
        }
    };
    SVGPainter.prototype.getWidth = function () {
        return this._width;
    };
    SVGPainter.prototype.getHeight = function () {
        return this._height;
    };
    SVGPainter.prototype._getSize = function (whIdx) {
        var opts = this._opts;
        var wh = ['width', 'height'][whIdx];
        var cwh = ['clientWidth', 'clientHeight'][whIdx];
        var plt = ['paddingLeft', 'paddingTop'][whIdx];
        var prb = ['paddingRight', 'paddingBottom'][whIdx];
        if (opts[wh] != null && opts[wh] !== 'auto') {
            return parseFloat(opts[wh]);
        }
        var root = this.root;
        var stl = document.defaultView.getComputedStyle(root);
        return ((root[cwh] || parseInt10(stl[wh]) || parseInt10(root.style[wh]))
            - (parseInt10(stl[plt]) || 0)
            - (parseInt10(stl[prb]) || 0)) | 0;
    };
    SVGPainter.prototype.dispose = function () {
        this.root.innerHTML = '';
        this._svgRoot
            = this._backgroundRoot
                = this._svgDom
                    = this._backgroundNode
                        = this._viewport
                            = this.storage
                                = null;
    };
    SVGPainter.prototype.clear = function () {
        var viewportNode = this._viewport;
        if (viewportNode && viewportNode.parentNode) {
            viewportNode.parentNode.removeChild(viewportNode);
        }
    };
    SVGPainter.prototype.toDataURL = function () {
        this.refresh();
        var svgDom = this._svgDom;
        var outerHTML = svgDom.outerHTML
            || (svgDom.parentNode && svgDom.parentNode).innerHTML;
        var html = encodeURIComponent(outerHTML.replace(/></g, '>\n\r<'));
        return 'data:image/svg+xml;charset=UTF-8,' + html;
    };
    return SVGPainter;
}());
function createMethodNotSupport(method) {
    return function () {
        util.logError('In SVG mode painter not support method "' + method + '"');
    };
}
export default SVGPainter;
