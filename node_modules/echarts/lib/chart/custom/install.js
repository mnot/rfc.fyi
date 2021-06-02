
/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/


/**
 * AUTO-GENERATED FILE. DO NOT MODIFY.
 */

/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/
import { __extends } from "tslib";
import { hasOwn, assert, isString, retrieve2, retrieve3, defaults, each, keys, isArrayLike, bind, isFunction, eqNaN, indexOf, clone } from 'zrender/lib/core/util';
import * as graphicUtil from '../../util/graphic';
import { setDefaultStateProxy, enableHoverEmphasis } from '../../util/states';
import * as labelStyleHelper from '../../label/labelStyle';
import { getDefaultLabel } from '../helper/labelHelper';
import createListFromArray from '../helper/createListFromArray';
import { getLayoutOnAxis } from '../../layout/barGrid';
import DataDiffer from '../../data/DataDiffer';
import SeriesModel from '../../model/Series';
import ChartView from '../../view/Chart';
import { createClipPath } from '../helper/createClipPathFromCoordSys';
import prepareCartesian2d from '../../coord/cartesian/prepareCustom';
import prepareGeo from '../../coord/geo/prepareCustom';
import prepareSingleAxis from '../../coord/single/prepareCustom';
import preparePolar from '../../coord/polar/prepareCustom';
import prepareCalendar from '../../coord/calendar/prepareCustom';
import { makeInner, normalizeToArray } from '../../util/model';
import { convertToEC4StyleForCustomSerise, isEC4CompatibleStyle, convertFromEC4CompatibleStyle, warnDeprecated } from '../../util/styleCompat';
import Transformable from 'zrender/lib/core/Transformable';
import { cloneValue } from 'zrender/lib/animation/Animator';
import { warn, throwError } from '../../util/log';
import { combine, isInAnyMorphing, morphPath, isCombiningPath, separate } from 'zrender/lib/tool/morphPath';
import * as matrix from 'zrender/lib/core/matrix';
import { createOrUpdatePatternFromDecal } from '../../util/decal';
var inner = makeInner();
var TRANSFORM_PROPS = {
  x: 1,
  y: 1,
  scaleX: 1,
  scaleY: 1,
  originX: 1,
  originY: 1,
  rotation: 1
};
var transformPropNamesStr = keys(TRANSFORM_PROPS).join(', ');
; // Also compat with ec4, where
// `visual('color') visual('borderColor')` is supported.

var STYLE_VISUAL_TYPE = {
  color: 'fill',
  borderColor: 'stroke'
};
var NON_STYLE_VISUAL_PROPS = {
  symbol: 1,
  symbolSize: 1,
  symbolKeepAspect: 1,
  legendSymbol: 1,
  visualMeta: 1,
  liftZ: 1,
  decal: 1
};
var EMPHASIS = 'emphasis';
var NORMAL = 'normal';
var BLUR = 'blur';
var SELECT = 'select';
var STATES = [NORMAL, EMPHASIS, BLUR, SELECT];
var PATH_ITEM_STYLE = {
  normal: ['itemStyle'],
  emphasis: [EMPHASIS, 'itemStyle'],
  blur: [BLUR, 'itemStyle'],
  select: [SELECT, 'itemStyle']
};
var PATH_LABEL = {
  normal: ['label'],
  emphasis: [EMPHASIS, 'label'],
  blur: [BLUR, 'label'],
  select: [SELECT, 'label']
}; // Use prefix to avoid index to be the same as el.name,
// which will cause weird update animation.

var GROUP_DIFF_PREFIX = 'e\0\0';
var attachedTxInfoTmp = {
  normal: {},
  emphasis: {},
  blur: {},
  select: {}
};
var LEGACY_TRANSFORM_PROPS = {
  position: ['x', 'y'],
  scale: ['scaleX', 'scaleY'],
  origin: ['originX', 'originY']
};
var tmpTransformable = new Transformable();
/**
 * To reduce total package size of each coordinate systems, the modules `prepareCustom`
 * of each coordinate systems are not required by each coordinate systems directly, but
 * required by the module `custom`.
 *
 * prepareInfoForCustomSeries {Function}: optional
 *     @return {Object} {coordSys: {...}, api: {
 *         coord: function (data, clamp) {}, // return point in global.
 *         size: function (dataSize, dataItem) {} // return size of each axis in coordSys.
 *     }}
 */

var prepareCustoms = {
  cartesian2d: prepareCartesian2d,
  geo: prepareGeo,
  singleAxis: prepareSingleAxis,
  polar: preparePolar,
  calendar: prepareCalendar
};

var CustomSeriesModel =
/** @class */
function (_super) {
  __extends(CustomSeriesModel, _super);

  function CustomSeriesModel() {
    var _this = _super !== null && _super.apply(this, arguments) || this;

    _this.type = CustomSeriesModel.type;
    return _this;
  }

  CustomSeriesModel.prototype.optionUpdated = function () {
    this.currentZLevel = this.get('zlevel', true);
    this.currentZ = this.get('z', true);
  };

  CustomSeriesModel.prototype.getInitialData = function (option, ecModel) {
    return createListFromArray(this.getSource(), this);
  };

  CustomSeriesModel.prototype.getDataParams = function (dataIndex, dataType, el) {
    var params = _super.prototype.getDataParams.call(this, dataIndex, dataType);

    el && (params.info = inner(el).info);
    return params;
  };

  CustomSeriesModel.type = 'series.custom';
  CustomSeriesModel.dependencies = ['grid', 'polar', 'geo', 'singleAxis', 'calendar'];
  CustomSeriesModel.defaultOption = {
    coordinateSystem: 'cartesian2d',
    zlevel: 0,
    z: 2,
    legendHoverLink: true,
    // Custom series will not clip by default.
    // Some case will use custom series to draw label
    // For example https://echarts.apache.org/examples/en/editor.html?c=custom-gantt-flight
    clip: false // Cartesian coordinate system
    // xAxisIndex: 0,
    // yAxisIndex: 0,
    // Polar coordinate system
    // polarIndex: 0,
    // Geo coordinate system
    // geoIndex: 0,

  };
  return CustomSeriesModel;
}(SeriesModel);

var CustomSeriesView =
/** @class */
function (_super) {
  __extends(CustomSeriesView, _super);

  function CustomSeriesView() {
    var _this = _super !== null && _super.apply(this, arguments) || this;

    _this.type = CustomSeriesView.type;
    return _this;
  }

  CustomSeriesView.prototype.render = function (customSeries, ecModel, api, payload) {
    var oldData = this._data;
    var data = customSeries.getData();
    var group = this.group;
    var renderItem = makeRenderItem(customSeries, data, ecModel, api); // By default, merge mode is applied. In most cases, custom series is
    // used in the scenario that data amount is not large but graphic elements
    // is complicated, where merge mode is probably necessary for optimization.
    // For example, reuse graphic elements and only update the transform when
    // roam or data zoom according to `actionType`.

    var transOpt = customSeries.__transientTransitionOpt; // Enable user to disable transition animation by both set
    // `from` and `to` dimension as `null`/`undefined`.

    if (transOpt && (transOpt.from == null || transOpt.to == null)) {
      oldData && oldData.each(function (oldIdx) {
        doRemoveEl(oldData.getItemGraphicEl(oldIdx), customSeries, group);
      });
      data.each(function (newIdx) {
        createOrUpdateItem(api, null, newIdx, renderItem(newIdx, payload), customSeries, group, data, null);
      });
    } else {
      var morphPreparation_1 = new MorphPreparation(customSeries, transOpt);
      var diffMode = transOpt ? 'multiple' : 'oneToOne';
      new DataDiffer(oldData ? oldData.getIndices() : [], data.getIndices(), createGetKey(oldData, diffMode, transOpt && transOpt.from), createGetKey(data, diffMode, transOpt && transOpt.to), null, diffMode).add(function (newIdx) {
        createOrUpdateItem(api, null, newIdx, renderItem(newIdx, payload), customSeries, group, data, null);
      }).remove(function (oldIdx) {
        doRemoveEl(oldData.getItemGraphicEl(oldIdx), customSeries, group);
      }).update(function (newIdx, oldIdx) {
        morphPreparation_1.reset('oneToOne');
        var oldEl = oldData.getItemGraphicEl(oldIdx);
        morphPreparation_1.findAndAddFrom(oldEl); // PENDING:
        // if may morph, currently we alway recreate the whole el.
        // because if reuse some of the el in the group tree, the old el has to
        // be removed from the group, and consequently we can not calculate
        // the "global transition" of the old element.
        // But is there performance issue?

        if (morphPreparation_1.hasFrom()) {
          removeElementDirectly(oldEl, group);
          oldEl = null;
        }

        createOrUpdateItem(api, oldEl, newIdx, renderItem(newIdx, payload), customSeries, group, data, morphPreparation_1);
        morphPreparation_1.applyMorphing();
      }).updateManyToOne(function (newIdx, oldIndices) {
        morphPreparation_1.reset('manyToOne');

        for (var i = 0; i < oldIndices.length; i++) {
          var oldEl = oldData.getItemGraphicEl(oldIndices[i]);
          morphPreparation_1.findAndAddFrom(oldEl);
          removeElementDirectly(oldEl, group);
        }

        createOrUpdateItem(api, null, newIdx, renderItem(newIdx, payload), customSeries, group, data, morphPreparation_1);
        morphPreparation_1.applyMorphing();
      }).updateOneToMany(function (newIndices, oldIdx) {
        morphPreparation_1.reset('oneToMany');
        var newLen = newIndices.length;
        var oldEl = oldData.getItemGraphicEl(oldIdx);
        morphPreparation_1.findAndAddFrom(oldEl);
        removeElementDirectly(oldEl, group);

        for (var i = 0; i < newLen; i++) {
          createOrUpdateItem(api, null, newIndices[i], renderItem(newIndices[i], payload), customSeries, group, data, morphPreparation_1);
        }

        morphPreparation_1.applyMorphing();
      }).execute();
    } // Do clipping


    var clipPath = customSeries.get('clip', true) ? createClipPath(customSeries.coordinateSystem, false, customSeries) : null;

    if (clipPath) {
      group.setClipPath(clipPath);
    } else {
      group.removeClipPath();
    }

    this._data = data;
  };

  CustomSeriesView.prototype.incrementalPrepareRender = function (customSeries, ecModel, api) {
    this.group.removeAll();
    this._data = null;
  };

  CustomSeriesView.prototype.incrementalRender = function (params, customSeries, ecModel, api, payload) {
    var data = customSeries.getData();
    var renderItem = makeRenderItem(customSeries, data, ecModel, api);

    function setIncrementalAndHoverLayer(el) {
      if (!el.isGroup) {
        el.incremental = true;
        el.ensureState('emphasis').hoverLayer = true;
      }
    }

    for (var idx = params.start; idx < params.end; idx++) {
      var el = createOrUpdateItem(null, null, idx, renderItem(idx, payload), customSeries, this.group, data, null);
      el.traverse(setIncrementalAndHoverLayer);
    }
  };

  CustomSeriesView.prototype.filterForExposedEvent = function (eventType, query, targetEl, packedEvent) {
    var elementName = query.element;

    if (elementName == null || targetEl.name === elementName) {
      return true;
    } // Enable to give a name on a group made by `renderItem`, and listen
    // events that triggerd by its descendents.


    while ((targetEl = targetEl.__hostTarget || targetEl.parent) && targetEl !== this.group) {
      if (targetEl.name === elementName) {
        return true;
      }
    }

    return false;
  };

  CustomSeriesView.type = 'custom';
  return CustomSeriesView;
}(ChartView);

function createGetKey(data, diffMode, dimension) {
  if (!data) {
    return;
  }

  if (diffMode === 'oneToOne') {
    return function (rawIdx, dataIndex) {
      return data.getId(dataIndex);
    };
  }

  var diffByDimName = data.getDimension(dimension);
  var dimInfo = data.getDimensionInfo(diffByDimName);

  if (!dimInfo) {
    var errMsg = '';

    if (process.env.NODE_ENV !== 'production') {
      errMsg = dimension + " is not a valid dimension.";
    }

    throwError(errMsg);
  }

  var ordinalMeta = dimInfo.ordinalMeta;
  return function (rawIdx, dataIndex) {
    var key = data.get(diffByDimName, dataIndex);

    if (ordinalMeta) {
      key = ordinalMeta.categories[key];
    }

    return key == null || eqNaN(key) ? rawIdx + '' : '_ec_' + key;
  };
}

function createEl(elOption) {
  var graphicType = elOption.type;
  var el; // Those graphic elements are not shapes. They should not be
  // overwritten by users, so do them first.

  if (graphicType === 'path') {
    var shape = elOption.shape; // Using pathRect brings convenience to users sacle svg path.

    var pathRect = shape.width != null && shape.height != null ? {
      x: shape.x || 0,
      y: shape.y || 0,
      width: shape.width,
      height: shape.height
    } : null;
    var pathData = getPathData(shape); // Path is also used for icon, so layout 'center' by default.

    el = graphicUtil.makePath(pathData, null, pathRect, shape.layout || 'center');
    inner(el).customPathData = pathData;
  } else if (graphicType === 'image') {
    el = new graphicUtil.Image({});
    inner(el).customImagePath = elOption.style.image;
  } else if (graphicType === 'text') {
    el = new graphicUtil.Text({}); // inner(el).customText = (elOption.style as TextStyleProps).text;
  } else if (graphicType === 'group') {
    el = new graphicUtil.Group();
  } else if (graphicType === 'compoundPath') {
    throw new Error('"compoundPath" is not supported yet.');
  } else {
    var Clz = graphicUtil.getShapeClass(graphicType);

    if (!Clz) {
      var errMsg = '';

      if (process.env.NODE_ENV !== 'production') {
        errMsg = 'graphic type "' + graphicType + '" can not be found.';
      }

      throwError(errMsg);
    }

    el = new Clz();
  }

  inner(el).customGraphicType = graphicType;
  el.name = elOption.name; // Compat ec4: the default z2 lift is 1. If changing the number,
  // some cases probably be broken: hierarchy layout along z, like circle packing,
  // where emphasis only intending to modify color/border rather than lift z2.

  el.z2EmphasisLift = 1;
  el.z2SelectLift = 1;
  return el;
}
/**
 * ----------------------------------------------------------
 * [STRATEGY_MERGE] Merge properties or erase all properties:
 *
 * Based on the fact that the existing zr element probably be reused, we now consider whether
 * merge or erase all properties to the exsiting elements.
 * That is, if a certain props is not specified in the lastest return of `renderItem`:
 * + "Merge" means that do not modify the value on the existing element.
 * + "Erase all" means that use a default value to the existing element.
 *
 * "Merge" might bring some unexpected state retaining for users and "erase all" seams to be
 * more safe. "erase all" force users to specify all of the props each time, which is recommanded
 * in most cases.
 * But "erase all" theoretically disables the chance of performance optimization (e.g., just
 * generete shape and style at the first time rather than always do that).
 * So we still use "merge" rather than "erase all". If users need "erase all", they can
 * simple always set all of the props each time.
 * Some "object-like" config like `textConfig`, `textContent`, `style` which are not needed for
 * every elment, so we replace them only when user specify them. And the that is a total replace.
 *
 * TODO: there is no hint of 'isFirst' to users. So the performance enhancement can not be
 * performed yet. Consider the case:
 * (1) setOption to "mergeChildren" with a smaller children count
 * (2) Use dataZoom to make an item disappear.
 * (3) User dataZoom to make the item display again. At that time, renderItem need to return the
 * full option rather than partial option to recreate the element.
 *
 * ----------------------------------------------
 * [STRATEGY_NULL] `hasOwnProperty` or `== null`:
 *
 * Ditinguishing "own property" probably bring little trouble to user when make el options.
 * So we  trade a {xx: null} or {xx: undefined} as "not specified" if possible rather than
 * "set them to null/undefined". In most cases, props can not be cleared. Some typicall
 * clearable props like `style`/`textConfig`/`textContent` we enable `false` to means
 * "clear". In some othere special cases that the prop is able to set as null/undefined,
 * but not suitable to use `false`, `hasOwnProperty` is checked.
 *
 * ---------------------------------------------
 * [STRATEGY_TRANSITION] The rule of transition:
 * + For props on the root level of a element:
 *      If there is no `transition` specified, tansform props will be transitioned by default,
 *      which is the same as the previous setting in echarts4 and suitable for the scenario
 *      of dataZoom change.
 *      If `transition` specified, only the specified props will be transitioned.
 * + For props in `shape` and `style`:
 *      Only props specified in `transition` will be transitioned.
 * + Break:
 *      Since ec5, do not make transition to shape by default, because it might result in
 *      performance issue (especially `points` of polygon) and do not necessary in most cases.
 *
 * @return if `isMorphTo`, return `allPropsFinal`.
 */


function updateElNormal( // Can be null/undefined
api, el, // Whether be a morph target.
isMorphTo, dataIndex, elOption, styleOpt, attachedTxInfo, seriesModel, isInit, isTextContent) {
  var transFromProps = {};
  var allPropsFinal = {};
  var elDisplayable = el.isGroup ? null : el; // If be "morph to", delay the `updateElNormal` when all of the els in
  // this data item processed. Because at that time we can get all of the
  // "morph from" and make correct separate/combine.

  !isMorphTo && prepareShapeOrExtraTransitionFrom('shape', el, null, elOption, transFromProps, isInit);
  prepareShapeOrExtraAllPropsFinal('shape', elOption, allPropsFinal);
  !isMorphTo && prepareShapeOrExtraTransitionFrom('extra', el, null, elOption, transFromProps, isInit);
  prepareShapeOrExtraAllPropsFinal('extra', elOption, allPropsFinal);
  !isMorphTo && prepareTransformTransitionFrom(el, null, elOption, transFromProps, isInit);
  prepareTransformAllPropsFinal(elOption, allPropsFinal);
  var txCfgOpt = attachedTxInfo && attachedTxInfo.normal.cfg;

  if (txCfgOpt) {
    // PENDING: whether use user object directly rather than clone?
    // TODO:5.0 textConfig transition animation?
    el.setTextConfig(txCfgOpt);
  }

  if (el.type === 'text' && styleOpt) {
    var textOptionStyle = styleOpt; // Compatible with ec4: if `textFill` or `textStroke` exists use them.

    hasOwn(textOptionStyle, 'textFill') && (textOptionStyle.fill = textOptionStyle.textFill);
    hasOwn(textOptionStyle, 'textStroke') && (textOptionStyle.stroke = textOptionStyle.textStroke);
  }

  if (styleOpt) {
    var decalPattern = void 0;
    var decalObj = isPath(el) ? styleOpt.decal : null;

    if (api && decalObj) {
      decalObj.dirty = true;
      decalPattern = createOrUpdatePatternFromDecal(decalObj, api);
    } // Always overwrite in case user specify this prop.


    styleOpt.__decalPattern = decalPattern;
  }

  !isMorphTo && prepareStyleTransitionFrom(el, null, elOption, styleOpt, transFromProps, isInit);

  if (elDisplayable) {
    hasOwn(elOption, 'invisible') && (elDisplayable.invisible = elOption.invisible);
  } // If `isMorphTo`, we should not update these props to el directly, otherwise,
  // when applying morph finally, the original prop are missing for making "animation from".


  if (!isMorphTo) {
    applyPropsFinal(el, allPropsFinal, styleOpt);
    applyTransitionFrom(el, dataIndex, elOption, seriesModel, transFromProps, isInit);
  } // Merge by default.


  hasOwn(elOption, 'silent') && (el.silent = elOption.silent);
  hasOwn(elOption, 'ignore') && (el.ignore = elOption.ignore);

  if (!isTextContent) {
    // `elOption.info` enables user to mount some info on
    // elements and use them in event handlers.
    // Update them only when user specified, otherwise, remain.
    hasOwn(elOption, 'info') && (inner(el).info = elOption.info);
  }

  styleOpt ? el.dirty() : el.markRedraw();
  return isMorphTo ? allPropsFinal : null;
}

function applyPropsFinal(el, // Can be null/undefined
allPropsFinal, styleOpt) {
  var elDisplayable = el.isGroup ? null : el;

  if (elDisplayable && styleOpt) {
    var decalPattern = styleOpt.__decalPattern;
    var originalDecalObj = void 0;

    if (decalPattern) {
      originalDecalObj = styleOpt.decal;
      styleOpt.decal = decalPattern;
    } // PENDING: here the input style object is used directly.
    // Good for performance but bad for compatibility control.


    elDisplayable.useStyle(styleOpt);

    if (decalPattern) {
      styleOpt.decal = originalDecalObj;
    } // When style object changed, how to trade the existing animation?
    // It is probably conplicated and not needed to cover all the cases.
    // But still need consider the case:
    // (1) When using init animation on `style.opacity`, and before the animation
    //     ended users triggers an update by mousewhell. At that time the init
    //     animation should better be continued rather than terminated.
    //     So after `useStyle` called, we should change the animation target manually
    //     to continue the effect of the init animation.
    // (2) PENDING: If the previous animation targeted at a `val1`, and currently we need
    //     to update the value to `val2` and no animation declared, should be terminate
    //     the previous animation or just modify the target of the animation?
    //     Therotically That will happen not only on `style` but also on `shape` and
    //     `transfrom` props. But we haven't handle this case at present yet.
    // (3) PENDING: Is it proper to visit `animators` and `targetName`?


    var animators = elDisplayable.animators;

    for (var i = 0; i < animators.length; i++) {
      var animator = animators[i]; // targetName is the "topKey".

      if (animator.targetName === 'style') {
        animator.changeTarget(elDisplayable.style);
      }
    }
  } // Set el to the final state firstly.


  allPropsFinal && el.attr(allPropsFinal);
}

function applyTransitionFrom(el, dataIndex, elOption, seriesModel, // Can be null/undefined
transFromProps, isInit) {
  if (transFromProps) {
    // Do not use `el.updateDuringAnimation` here becuase `el.updateDuringAnimation` will
    // be called mutiple time in each animation frame. For example, if both "transform" props
    // and shape props and style props changed, it will generate three animator and called
    // one-by-one in each animation frame.
    // We use the during in `animateTo/From` params.
    var userDuring = elOption.during; // For simplicity, if during not specified, the previous during will not work any more.

    inner(el).userDuring = userDuring;
    var cfgDuringCall = userDuring ? bind(duringCall, {
      el: el,
      userDuring: userDuring
    }) : null;
    var cfg = {
      dataIndex: dataIndex,
      isFrom: true,
      during: cfgDuringCall
    };
    isInit ? graphicUtil.initProps(el, transFromProps, seriesModel, cfg) : graphicUtil.updateProps(el, transFromProps, seriesModel, cfg);
  }
} // See [STRATEGY_TRANSITION]


function prepareShapeOrExtraTransitionFrom(mainAttr, el, morphFromEl, elOption, transFromProps, isInit) {
  var attrOpt = elOption[mainAttr];

  if (!attrOpt) {
    return;
  }

  var elPropsInAttr = el[mainAttr];
  var transFromPropsInAttr;
  var enterFrom = attrOpt.enterFrom;

  if (isInit && enterFrom) {
    !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
    var enterFromKeys = keys(enterFrom);

    for (var i = 0; i < enterFromKeys.length; i++) {
      // `enterFrom` props are not necessarily also declared in `shape`/`style`/...,
      // for example, `opacity` can only declared in `enterFrom` but not in `style`.
      var key = enterFromKeys[i]; // Do not clone, animator will perform that clone.

      transFromPropsInAttr[key] = enterFrom[key];
    }
  }

  if (!isInit && elPropsInAttr // Just ignore shape animation in morphing.
  && !(morphFromEl != null && mainAttr === 'shape')) {
    if (attrOpt.transition) {
      !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
      var transitionKeys = normalizeToArray(attrOpt.transition);

      for (var i = 0; i < transitionKeys.length; i++) {
        var key = transitionKeys[i];
        var elVal = elPropsInAttr[key];

        if (process.env.NODE_ENV !== 'production') {
          checkNonStyleTansitionRefer(key, attrOpt[key], elVal);
        } // Do not clone, see `checkNonStyleTansitionRefer`.


        transFromPropsInAttr[key] = elVal;
      }
    } else if (indexOf(elOption.transition, mainAttr) >= 0) {
      !transFromPropsInAttr && (transFromPropsInAttr = transFromProps[mainAttr] = {});
      var elPropsInAttrKeys = keys(elPropsInAttr);

      for (var i = 0; i < elPropsInAttrKeys.length; i++) {
        var key = elPropsInAttrKeys[i];
        var elVal = elPropsInAttr[key];

        if (isNonStyleTransitionEnabled(attrOpt[key], elVal)) {
          transFromPropsInAttr[key] = elVal;
        }
      }
    }
  }

  var leaveTo = attrOpt.leaveTo;

  if (leaveTo) {
    var leaveToProps = getOrCreateLeaveToPropsFromEl(el);
    var leaveToPropsInAttr = leaveToProps[mainAttr] || (leaveToProps[mainAttr] = {});
    var leaveToKeys = keys(leaveTo);

    for (var i = 0; i < leaveToKeys.length; i++) {
      var key = leaveToKeys[i];
      leaveToPropsInAttr[key] = leaveTo[key];
    }
  }
}

function prepareShapeOrExtraAllPropsFinal(mainAttr, elOption, allProps) {
  var attrOpt = elOption[mainAttr];

  if (!attrOpt) {
    return;
  }

  var allPropsInAttr = allProps[mainAttr] = {};
  var keysInAttr = keys(attrOpt);

  for (var i = 0; i < keysInAttr.length; i++) {
    var key = keysInAttr[i]; // To avoid share one object with different element, and
    // to avoid user modify the object inexpectedly, have to clone.

    allPropsInAttr[key] = cloneValue(attrOpt[key]);
  }
} // See [STRATEGY_TRANSITION].


function prepareTransformTransitionFrom(el, morphFromEl, elOption, transFromProps, isInit) {
  var enterFrom = elOption.enterFrom;

  if (isInit && enterFrom) {
    var enterFromKeys = keys(enterFrom);

    for (var i = 0; i < enterFromKeys.length; i++) {
      var key = enterFromKeys[i];

      if (process.env.NODE_ENV !== 'production') {
        checkTransformPropRefer(key, 'el.enterFrom');
      } // Do not clone, animator will perform that clone.


      transFromProps[key] = enterFrom[key];
    }
  }

  if (!isInit) {
    // If morphing, force transition all transform props.
    // otherwise might have incorrect morphing animation.
    if (morphFromEl) {
      var fromTransformable = calcOldElLocalTransformBasedOnNewElParent(morphFromEl, el);
      setTransformPropToTransitionFrom(transFromProps, 'x', fromTransformable);
      setTransformPropToTransitionFrom(transFromProps, 'y', fromTransformable);
      setTransformPropToTransitionFrom(transFromProps, 'scaleX', fromTransformable);
      setTransformPropToTransitionFrom(transFromProps, 'scaleY', fromTransformable);
      setTransformPropToTransitionFrom(transFromProps, 'originX', fromTransformable);
      setTransformPropToTransitionFrom(transFromProps, 'originY', fromTransformable);
      setTransformPropToTransitionFrom(transFromProps, 'rotation', fromTransformable);
    } else if (elOption.transition) {
      var transitionKeys = normalizeToArray(elOption.transition);

      for (var i = 0; i < transitionKeys.length; i++) {
        var key = transitionKeys[i];

        if (key === 'style' || key === 'shape' || key === 'extra') {
          continue;
        }

        var elVal = el[key];

        if (process.env.NODE_ENV !== 'production') {
          checkTransformPropRefer(key, 'el.transition');
          checkNonStyleTansitionRefer(key, elOption[key], elVal);
        } // Do not clone, see `checkNonStyleTansitionRefer`.


        transFromProps[key] = elVal;
      }
    } // This default transition see [STRATEGY_TRANSITION]
    else {
        setTransformPropToTransitionFrom(transFromProps, 'x', el);
        setTransformPropToTransitionFrom(transFromProps, 'y', el);
      }
  }

  var leaveTo = elOption.leaveTo;

  if (leaveTo) {
    var leaveToProps = getOrCreateLeaveToPropsFromEl(el);
    var leaveToKeys = keys(leaveTo);

    for (var i = 0; i < leaveToKeys.length; i++) {
      var key = leaveToKeys[i];

      if (process.env.NODE_ENV !== 'production') {
        checkTransformPropRefer(key, 'el.leaveTo');
      }

      leaveToProps[key] = leaveTo[key];
    }
  }
}

function prepareTransformAllPropsFinal(elOption, allProps) {
  setLagecyTransformProp(elOption, allProps, 'position');
  setLagecyTransformProp(elOption, allProps, 'scale');
  setLagecyTransformProp(elOption, allProps, 'origin');
  setTransformProp(elOption, allProps, 'x');
  setTransformProp(elOption, allProps, 'y');
  setTransformProp(elOption, allProps, 'scaleX');
  setTransformProp(elOption, allProps, 'scaleY');
  setTransformProp(elOption, allProps, 'originX');
  setTransformProp(elOption, allProps, 'originY');
  setTransformProp(elOption, allProps, 'rotation');
} // See [STRATEGY_TRANSITION].


function prepareStyleTransitionFrom(el, morphFromEl, elOption, styleOpt, transFromProps, isInit) {
  if (!styleOpt) {
    return;
  } // At present in "many-to-one"/"one-to-many" case, to not support "many" have
  // different styles and make style transitions. That might be a rare case.


  var fromEl = morphFromEl || el;
  var fromElStyle = fromEl.style;
  var transFromStyleProps;
  var enterFrom = styleOpt.enterFrom;

  if (isInit && enterFrom) {
    var enterFromKeys = keys(enterFrom);
    !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});

    for (var i = 0; i < enterFromKeys.length; i++) {
      var key = enterFromKeys[i]; // Do not clone, animator will perform that clone.

      transFromStyleProps[key] = enterFrom[key];
    }
  }

  if (!isInit && fromElStyle) {
    if (styleOpt.transition) {
      var transitionKeys = normalizeToArray(styleOpt.transition);
      !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});

      for (var i = 0; i < transitionKeys.length; i++) {
        var key = transitionKeys[i];
        var elVal = fromElStyle[key]; // Do not clone, see `checkNonStyleTansitionRefer`.

        transFromStyleProps[key] = elVal;
      }
    } else if (el.getAnimationStyleProps && indexOf(elOption.transition, 'style') >= 0) {
      var animationProps = el.getAnimationStyleProps();
      var animationStyleProps = animationProps ? animationProps.style : null;

      if (animationStyleProps) {
        !transFromStyleProps && (transFromStyleProps = transFromProps.style = {});
        var styleKeys = keys(styleOpt);

        for (var i = 0; i < styleKeys.length; i++) {
          var key = styleKeys[i];

          if (animationStyleProps[key]) {
            var elVal = fromElStyle[key];
            transFromStyleProps[key] = elVal;
          }
        }
      }
    }
  }

  var leaveTo = styleOpt.leaveTo;

  if (leaveTo) {
    var leaveToKeys = keys(leaveTo);
    var leaveToProps = getOrCreateLeaveToPropsFromEl(el);
    var leaveToStyleProps = leaveToProps.style || (leaveToProps.style = {});

    for (var i = 0; i < leaveToKeys.length; i++) {
      var key = leaveToKeys[i];
      leaveToStyleProps[key] = leaveTo[key];
    }
  }
}
/**
 * If make "transform"(x/y/scaleX/scaleY/orient/originX/originY) transition between
 * two path elements that have different hierarchy, before we retrieve the "from" props,
 * we have to calculate the local transition of the "oldPath" based on the parent of
 * the "newPath".
 * At present, the case only happend in "morphing". Without morphing, the transform
 * transition are all between elements in the same hierarchy, where this kind of process
 * is not needed.
 *
 * [CAVEAT]:
 * This method makes sense only if: (very tricky)
 * (1) "newEl" has been added to its final parent.
 * (2) Local transform props of "newPath.parent" are not at their final value but already
 * have been at the "from value".
 *     This is currently ensured by:
 *     (2.1) "graphicUtil.animationFrom", which will set the element to the "from value"
 *     immediately.
 *     (2.2) "morph" option is not allowed to be set on Group, so all of the groups have
 *     been finished their "updateElNormal" when calling this method in morphing process.
 */


function calcOldElLocalTransformBasedOnNewElParent(oldEl, newEl) {
  if (!oldEl || oldEl === newEl || oldEl.parent === newEl.parent) {
    return oldEl;
  } // Not sure oldEl is rendered (may have "lazyUpdate"),
  // so always call `getComputedTransform`.


  var tmpM = tmpTransformable.transform || (tmpTransformable.transform = matrix.identity([]));
  var oldGlobalTransform = oldEl.getComputedTransform();
  oldGlobalTransform ? matrix.copy(tmpM, oldGlobalTransform) : matrix.identity(tmpM);
  var newParent = newEl.parent;

  if (newParent) {
    newParent.getComputedTransform();
  }

  tmpTransformable.originX = oldEl.originX;
  tmpTransformable.originY = oldEl.originY;
  tmpTransformable.parent = newParent;
  tmpTransformable.decomposeTransform();
  return tmpTransformable;
}

var checkNonStyleTansitionRefer;

if (process.env.NODE_ENV !== 'production') {
  checkNonStyleTansitionRefer = function (propName, optVal, elVal) {
    if (!isArrayLike(optVal)) {
      assert(optVal != null && isFinite(optVal), 'Prop `' + propName + '` must refer to a finite number or ArrayLike for transition.');
    } else {
      // Try not to copy array for performance, but if user use the same object in different
      // call of `renderItem`, it will casue animation transition fail.
      assert(optVal !== elVal, 'Prop `' + propName + '` must use different Array object each time for transition.');
    }
  };
}

function isNonStyleTransitionEnabled(optVal, elVal) {
  // The same as `checkNonStyleTansitionRefer`.
  return !isArrayLike(optVal) ? optVal != null && isFinite(optVal) : optVal !== elVal;
}

var checkTransformPropRefer;

if (process.env.NODE_ENV !== 'production') {
  checkTransformPropRefer = function (key, usedIn) {
    assert(hasOwn(TRANSFORM_PROPS, key), 'Prop `' + key + '` is not a permitted in `' + usedIn + '`. ' + 'Only `' + keys(TRANSFORM_PROPS).join('`, `') + '` are permitted.');
  };
}

function getOrCreateLeaveToPropsFromEl(el) {
  var innerEl = inner(el);
  return innerEl.leaveToProps || (innerEl.leaveToProps = {});
} // Use it to avoid it be exposed to user.


var tmpDuringScope = {};
var customDuringAPI = {
  // Usually other props do not need to be changed in animation during.
  setTransform: function (key, val) {
    if (process.env.NODE_ENV !== 'production') {
      assert(hasOwn(TRANSFORM_PROPS, key), 'Only ' + transformPropNamesStr + ' available in `setTransform`.');
    }

    tmpDuringScope.el[key] = val;
    return this;
  },
  getTransform: function (key) {
    if (process.env.NODE_ENV !== 'production') {
      assert(hasOwn(TRANSFORM_PROPS, key), 'Only ' + transformPropNamesStr + ' available in `getTransform`.');
    }

    return tmpDuringScope.el[key];
  },
  setShape: function (key, val) {
    if (process.env.NODE_ENV !== 'production') {
      assertNotReserved(key);
    }

    var shape = tmpDuringScope.el.shape || (tmpDuringScope.el.shape = {});
    shape[key] = val;
    tmpDuringScope.isShapeDirty = true;
    return this;
  },
  getShape: function (key) {
    if (process.env.NODE_ENV !== 'production') {
      assertNotReserved(key);
    }

    var shape = tmpDuringScope.el.shape;

    if (shape) {
      return shape[key];
    }
  },
  setStyle: function (key, val) {
    if (process.env.NODE_ENV !== 'production') {
      assertNotReserved(key);
    }

    var style = tmpDuringScope.el.style;

    if (style) {
      if (process.env.NODE_ENV !== 'production') {
        if (eqNaN(val)) {
          warn('style.' + key + ' must not be assigned with NaN.');
        }
      }

      style[key] = val;
      tmpDuringScope.isStyleDirty = true;
    }

    return this;
  },
  getStyle: function (key) {
    if (process.env.NODE_ENV !== 'production') {
      assertNotReserved(key);
    }

    var style = tmpDuringScope.el.style;

    if (style) {
      return style[key];
    }
  },
  setExtra: function (key, val) {
    if (process.env.NODE_ENV !== 'production') {
      assertNotReserved(key);
    }

    var extra = tmpDuringScope.el.extra || (tmpDuringScope.el.extra = {});
    extra[key] = val;
    return this;
  },
  getExtra: function (key) {
    if (process.env.NODE_ENV !== 'production') {
      assertNotReserved(key);
    }

    var extra = tmpDuringScope.el.extra;

    if (extra) {
      return extra[key];
    }
  }
};

function assertNotReserved(key) {
  if (process.env.NODE_ENV !== 'production') {
    if (key === 'transition' || key === 'enterFrom' || key === 'leaveTo') {
      throw new Error('key must not be "' + key + '"');
    }
  }
}

function duringCall() {
  // Do not provide "percent" until some requirements come.
  // Because consider thies case:
  // enterFrom: {x: 100, y: 30}, transition: 'x'.
  // And enter duration is different from update duration.
  // Thus it might be confused about the meaning of "percent" in during callback.
  var scope = this;
  var el = scope.el;

  if (!el) {
    return;
  } // If el is remove from zr by reason like legend, during still need to called,
  // becuase el will be added back to zr and the prop value should not be incorrect.


  var newstUserDuring = inner(el).userDuring;
  var scopeUserDuring = scope.userDuring; // Ensured a during is only called once in each animation frame.
  // If a during is called multiple times in one frame, maybe some users' calulation logic
  // might be wrong (not sure whether this usage exists).
  // The case of a during might be called twice can be: by default there is a animator for
  // 'x', 'y' when init. Before the init animation finished, call `setOption` to start
  // another animators for 'style'/'shape'/'extra'.

  if (newstUserDuring !== scopeUserDuring) {
    // release
    scope.el = scope.userDuring = null;
    return;
  }

  tmpDuringScope.el = el;
  tmpDuringScope.isShapeDirty = false;
  tmpDuringScope.isStyleDirty = false; // Give no `this` to user in "during" calling.

  scopeUserDuring(customDuringAPI);

  if (tmpDuringScope.isShapeDirty && el.dirtyShape) {
    el.dirtyShape();
  }

  if (tmpDuringScope.isStyleDirty && el.dirtyStyle) {
    el.dirtyStyle();
  } // markRedraw() will be called by default in during.
  // FIXME `this.markRedraw();` directly ?
  // FIXME: if in future meet the case that some prop will be both modified in `during` and `state`,
  // consider the issue that the prop might be incorrect when return to "normal" state.

}

function updateElOnState(state, el, elStateOpt, styleOpt, attachedTxInfo, isRoot, isTextContent) {
  var elDisplayable = el.isGroup ? null : el;
  var txCfgOpt = attachedTxInfo && attachedTxInfo[state].cfg; // PENDING:5.0 support customize scale change and transition animation?

  if (elDisplayable) {
    // By default support auto lift color when hover whether `emphasis` specified.
    var stateObj = elDisplayable.ensureState(state);

    if (styleOpt === false) {
      var existingEmphasisState = elDisplayable.getState(state);

      if (existingEmphasisState) {
        existingEmphasisState.style = null;
      }
    } else {
      // style is needed to enable defaut emphasis.
      stateObj.style = styleOpt || null;
    } // If `elOption.styleEmphasis` or `elOption.emphasis.style` is `false`,
    // remove hover style.
    // If `elOption.textConfig` or `elOption.emphasis.textConfig` is null/undefined, it does not
    // make sense. So for simplicity, we do not ditinguish `hasOwnProperty` and null/undefined.


    if (txCfgOpt) {
      stateObj.textConfig = txCfgOpt;
    }

    setDefaultStateProxy(elDisplayable);
  }
}

function updateZ(el, elOption, seriesModel, attachedTxInfo) {
  // Group not support textContent and not support z yet.
  if (el.isGroup) {
    return;
  }

  var elDisplayable = el;
  var currentZ = seriesModel.currentZ;
  var currentZLevel = seriesModel.currentZLevel; // Always erase.

  elDisplayable.z = currentZ;
  elDisplayable.zlevel = currentZLevel; // z2 must not be null/undefined, otherwise sort error may occur.

  var optZ2 = elOption.z2;
  optZ2 != null && (elDisplayable.z2 = optZ2 || 0);

  for (var i = 0; i < STATES.length; i++) {
    updateZForEachState(elDisplayable, elOption, STATES[i]);
  }
}

function updateZForEachState(elDisplayable, elOption, state) {
  var isNormal = state === NORMAL;
  var elStateOpt = isNormal ? elOption : retrieveStateOption(elOption, state);
  var optZ2 = elStateOpt ? elStateOpt.z2 : null;
  var stateObj;

  if (optZ2 != null) {
    // Do not `ensureState` until required.
    stateObj = isNormal ? elDisplayable : elDisplayable.ensureState(state);
    stateObj.z2 = optZ2 || 0;
  }
}

function setLagecyTransformProp(elOption, targetProps, legacyName, fromTransformable // If provided, retrieve from the element.
) {
  var legacyArr = elOption[legacyName];
  var xyName = LEGACY_TRANSFORM_PROPS[legacyName];

  if (legacyArr) {
    if (fromTransformable) {
      targetProps[xyName[0]] = fromTransformable[xyName[0]];
      targetProps[xyName[1]] = fromTransformable[xyName[1]];
    } else {
      targetProps[xyName[0]] = legacyArr[0];
      targetProps[xyName[1]] = legacyArr[1];
    }
  }
}

function setTransformProp(elOption, allProps, name, fromTransformable // If provided, retrieve from the element.
) {
  if (elOption[name] != null) {
    allProps[name] = fromTransformable ? fromTransformable[name] : elOption[name];
  }
}

function setTransformPropToTransitionFrom(transitionFrom, name, fromTransformable // If provided, retrieve from the element.
) {
  if (fromTransformable) {
    transitionFrom[name] = fromTransformable[name];
  }
}

function makeRenderItem(customSeries, data, ecModel, api) {
  var renderItem = customSeries.get('renderItem');
  var coordSys = customSeries.coordinateSystem;
  var prepareResult = {};

  if (coordSys) {
    if (process.env.NODE_ENV !== 'production') {
      assert(renderItem, 'series.render is required.');
      assert(coordSys.prepareCustoms || prepareCustoms[coordSys.type], 'This coordSys does not support custom series.');
    } // `coordSys.prepareCustoms` is used for external coord sys like bmap.


    prepareResult = coordSys.prepareCustoms ? coordSys.prepareCustoms(coordSys) : prepareCustoms[coordSys.type](coordSys);
  }

  var userAPI = defaults({
    getWidth: api.getWidth,
    getHeight: api.getHeight,
    getZr: api.getZr,
    getDevicePixelRatio: api.getDevicePixelRatio,
    value: value,
    style: style,
    ordinalRawValue: ordinalRawValue,
    styleEmphasis: styleEmphasis,
    visual: visual,
    barLayout: barLayout,
    currentSeriesIndices: currentSeriesIndices,
    font: font
  }, prepareResult.api || {});
  var userParams = {
    // The life cycle of context: current round of rendering.
    // The global life cycle is probably not necessary, because
    // user can store global status by themselves.
    context: {},
    seriesId: customSeries.id,
    seriesName: customSeries.name,
    seriesIndex: customSeries.seriesIndex,
    coordSys: prepareResult.coordSys,
    dataInsideLength: data.count(),
    encode: wrapEncodeDef(customSeries.getData())
  }; // If someday intending to refactor them to a class, should consider do not
  // break change: currently these attribute member are encapsulated in a closure
  // so that do not need to force user to call these method with a scope.
  // Do not support call `api` asynchronously without dataIndexInside input.

  var currDataIndexInside;
  var currItemModel;
  var currItemStyleModels = {};
  var currLabelModels = {};
  var seriesItemStyleModels = {};
  var seriesLabelModels = {};

  for (var i = 0; i < STATES.length; i++) {
    var stateName = STATES[i];
    seriesItemStyleModels[stateName] = customSeries.getModel(PATH_ITEM_STYLE[stateName]);
    seriesLabelModels[stateName] = customSeries.getModel(PATH_LABEL[stateName]);
  }

  function getItemModel(dataIndexInside) {
    return dataIndexInside === currDataIndexInside ? currItemModel || (currItemModel = data.getItemModel(dataIndexInside)) : data.getItemModel(dataIndexInside);
  }

  function getItemStyleModel(dataIndexInside, state) {
    return !data.hasItemOption ? seriesItemStyleModels[state] : dataIndexInside === currDataIndexInside ? currItemStyleModels[state] || (currItemStyleModels[state] = getItemModel(dataIndexInside).getModel(PATH_ITEM_STYLE[state])) : getItemModel(dataIndexInside).getModel(PATH_ITEM_STYLE[state]);
  }

  function getLabelModel(dataIndexInside, state) {
    return !data.hasItemOption ? seriesLabelModels[state] : dataIndexInside === currDataIndexInside ? currLabelModels[state] || (currLabelModels[state] = getItemModel(dataIndexInside).getModel(PATH_LABEL[state])) : getItemModel(dataIndexInside).getModel(PATH_LABEL[state]);
  }

  return function (dataIndexInside, payload) {
    currDataIndexInside = dataIndexInside;
    currItemModel = null;
    currItemStyleModels = {};
    currLabelModels = {};
    return renderItem && renderItem(defaults({
      dataIndexInside: dataIndexInside,
      dataIndex: data.getRawIndex(dataIndexInside),
      // Can be used for optimization when zoom or roam.
      actionType: payload ? payload.type : null
    }, userParams), userAPI);
  };
  /**
   * @public
   * @param dim by default 0.
   * @param dataIndexInside by default `currDataIndexInside`.
   */

  function value(dim, dataIndexInside) {
    dataIndexInside == null && (dataIndexInside = currDataIndexInside);
    return data.get(data.getDimension(dim || 0), dataIndexInside);
  }
  /**
   * @public
   * @param dim by default 0.
   * @param dataIndexInside by default `currDataIndexInside`.
   */


  function ordinalRawValue(dim, dataIndexInside) {
    dataIndexInside == null && (dataIndexInside = currDataIndexInside);
    var dimInfo = data.getDimensionInfo(dim || 0);

    if (!dimInfo) {
      return;
    }

    var val = data.get(dimInfo.name, dataIndexInside);
    var ordinalMeta = dimInfo && dimInfo.ordinalMeta;
    return ordinalMeta ? ordinalMeta.categories[val] : val;
  }
  /**
   * @deprecated The orgininal intention of `api.style` is enable to set itemStyle
   * like other series. But it not necessary and not easy to give a strict definition
   * of what it return. And since echarts5 it needs to be make compat work. So
   * deprecates it since echarts5.
   *
   * By default, `visual` is applied to style (to support visualMap).
   * `visual.color` is applied at `fill`. If user want apply visual.color on `stroke`,
   * it can be implemented as:
   * `api.style({stroke: api.visual('color'), fill: null})`;
   *
   * [Compat]: since ec5, RectText has been separated from its hosts el.
   * so `api.style()` will only return the style from `itemStyle` but not handle `label`
   * any more. But `series.label` config is never published in doc.
   * We still compat it in `api.style()`. But not encourage to use it and will still not
   * to pulish it to doc.
   * @public
   * @param dataIndexInside by default `currDataIndexInside`.
   */


  function style(userProps, dataIndexInside) {
    if (process.env.NODE_ENV !== 'production') {
      warnDeprecated('api.style', 'Please write literal style directly instead.');
    }

    dataIndexInside == null && (dataIndexInside = currDataIndexInside);
    var style = data.getItemVisual(dataIndexInside, 'style');
    var visualColor = style && style.fill;
    var opacity = style && style.opacity;
    var itemStyle = getItemStyleModel(dataIndexInside, NORMAL).getItemStyle();
    visualColor != null && (itemStyle.fill = visualColor);
    opacity != null && (itemStyle.opacity = opacity);
    var opt = {
      inheritColor: isString(visualColor) ? visualColor : '#000'
    };
    var labelModel = getLabelModel(dataIndexInside, NORMAL); // Now that the feture of "auto adjust text fill/stroke" has been migrated to zrender
    // since ec5, we should set `isAttached` as `false` here and make compat in
    // `convertToEC4StyleForCustomSerise`.

    var textStyle = labelStyleHelper.createTextStyle(labelModel, null, opt, false, true);
    textStyle.text = labelModel.getShallow('show') ? retrieve2(customSeries.getFormattedLabel(dataIndexInside, NORMAL), getDefaultLabel(data, dataIndexInside)) : null;
    var textConfig = labelStyleHelper.createTextConfig(labelModel, opt, false);
    preFetchFromExtra(userProps, itemStyle);
    itemStyle = convertToEC4StyleForCustomSerise(itemStyle, textStyle, textConfig);
    userProps && applyUserPropsAfter(itemStyle, userProps);
    itemStyle.legacy = true;
    return itemStyle;
  }
  /**
   * @deprecated The reason see `api.style()`
   * @public
   * @param dataIndexInside by default `currDataIndexInside`.
   */


  function styleEmphasis(userProps, dataIndexInside) {
    if (process.env.NODE_ENV !== 'production') {
      warnDeprecated('api.styleEmphasis', 'Please write literal style directly instead.');
    }

    dataIndexInside == null && (dataIndexInside = currDataIndexInside);
    var itemStyle = getItemStyleModel(dataIndexInside, EMPHASIS).getItemStyle();
    var labelModel = getLabelModel(dataIndexInside, EMPHASIS);
    var textStyle = labelStyleHelper.createTextStyle(labelModel, null, null, true, true);
    textStyle.text = labelModel.getShallow('show') ? retrieve3(customSeries.getFormattedLabel(dataIndexInside, EMPHASIS), customSeries.getFormattedLabel(dataIndexInside, NORMAL), getDefaultLabel(data, dataIndexInside)) : null;
    var textConfig = labelStyleHelper.createTextConfig(labelModel, null, true);
    preFetchFromExtra(userProps, itemStyle);
    itemStyle = convertToEC4StyleForCustomSerise(itemStyle, textStyle, textConfig);
    userProps && applyUserPropsAfter(itemStyle, userProps);
    itemStyle.legacy = true;
    return itemStyle;
  }

  function applyUserPropsAfter(itemStyle, extra) {
    for (var key in extra) {
      if (hasOwn(extra, key)) {
        itemStyle[key] = extra[key];
      }
    }
  }

  function preFetchFromExtra(extra, itemStyle) {
    // A trick to retrieve those props firstly, which are used to
    // apply auto inside fill/stroke in `convertToEC4StyleForCustomSerise`.
    // (It's not reasonable but only for a degree of compat)
    if (extra) {
      extra.textFill && (itemStyle.textFill = extra.textFill);
      extra.textPosition && (itemStyle.textPosition = extra.textPosition);
    }
  }
  /**
   * @public
   * @param dataIndexInside by default `currDataIndexInside`.
   */


  function visual(visualType, dataIndexInside) {
    dataIndexInside == null && (dataIndexInside = currDataIndexInside);

    if (hasOwn(STYLE_VISUAL_TYPE, visualType)) {
      var style_1 = data.getItemVisual(dataIndexInside, 'style');
      return style_1 ? style_1[STYLE_VISUAL_TYPE[visualType]] : null;
    } // Only support these visuals. Other visual might be inner tricky
    // for performance (like `style`), do not expose to users.


    if (hasOwn(NON_STYLE_VISUAL_PROPS, visualType)) {
      return data.getItemVisual(dataIndexInside, visualType);
    }
  }
  /**
   * @public
   * @return If not support, return undefined.
   */


  function barLayout(opt) {
    if (coordSys.type === 'cartesian2d') {
      var baseAxis = coordSys.getBaseAxis();
      return getLayoutOnAxis(defaults({
        axis: baseAxis
      }, opt));
    }
  }
  /**
   * @public
   */


  function currentSeriesIndices() {
    return ecModel.getCurrentSeriesIndices();
  }
  /**
   * @public
   * @return font string
   */


  function font(opt) {
    return labelStyleHelper.getFont(opt, ecModel);
  }
}

function wrapEncodeDef(data) {
  var encodeDef = {};
  each(data.dimensions, function (dimName, dataDimIndex) {
    var dimInfo = data.getDimensionInfo(dimName);

    if (!dimInfo.isExtraCoord) {
      var coordDim = dimInfo.coordDim;
      var dataDims = encodeDef[coordDim] = encodeDef[coordDim] || [];
      dataDims[dimInfo.coordDimIndex] = dataDimIndex;
    }
  });
  return encodeDef;
}

function createOrUpdateItem(api, el, dataIndex, elOption, seriesModel, group, data, morphPreparation) {
  // [Rule]
  // If `renderItem` returns `null`/`undefined`/`false`, remove the previous el if existing.
  //     (It seems that violate the "merge" principle, but most of users probably intuitively
  //     regard "return;" as "show nothing element whatever", so make a exception to meet the
  //     most cases.)
  // The rule or "merge" see [STRATEGY_MERGE].
  // If `elOption` is `null`/`undefined`/`false` (when `renderItem` returns nothing).
  if (!elOption) {
    removeElementDirectly(el, group);
    return;
  }

  el = doCreateOrUpdateEl(api, el, dataIndex, elOption, seriesModel, group, true, morphPreparation);
  el && data.setItemGraphicEl(dataIndex, el);
  enableHoverEmphasis(el, elOption.focus, elOption.blurScope);
  return el;
}

function doCreateOrUpdateEl(api, el, dataIndex, elOption, seriesModel, group, isRoot, morphPreparation) {
  if (process.env.NODE_ENV !== 'production') {
    assert(elOption, 'should not have an null/undefined element setting');
  }

  var toBeReplacedIdx = -1;

  if (el && doesElNeedRecreate(el, elOption) // || (
  //     // PENDING: even in one-to-one mapping case, if el is marked as morph,
  //     // do not sure whether the el will be mapped to another el with different
  //     // hierarchy in Group tree. So always recreate el rather than reuse the el.
  //     morphPreparation && morphPreparation.isOneToOneFrom(el)
  // )
  ) {
    // Should keep at the original index, otherwise "merge by index" will be incorrect.
    toBeReplacedIdx = group.childrenRef().indexOf(el);
    el = null;
  }

  var elIsNewCreated = !el;

  if (!el) {
    el = createEl(elOption);
  } else {
    // FIMXE:NEXT unified clearState?
    // If in some case the performance issue arised, consider
    // do not clearState but update cached normal state directly.
    el.clearStates();
  }

  var canMorph = inner(el).canMorph = elOption.morph && isPath(el);
  var thisElIsMorphTo = canMorph && morphPreparation && morphPreparation.hasFrom(); // Use update animation when morph is enabled.

  var isInit = elIsNewCreated && !thisElIsMorphTo;
  attachedTxInfoTmp.normal.cfg = attachedTxInfoTmp.normal.conOpt = attachedTxInfoTmp.emphasis.cfg = attachedTxInfoTmp.emphasis.conOpt = attachedTxInfoTmp.blur.cfg = attachedTxInfoTmp.blur.conOpt = attachedTxInfoTmp.select.cfg = attachedTxInfoTmp.select.conOpt = null;
  attachedTxInfoTmp.isLegacy = false;
  doCreateOrUpdateAttachedTx(el, dataIndex, elOption, seriesModel, isInit, attachedTxInfoTmp);
  doCreateOrUpdateClipPath(el, dataIndex, elOption, seriesModel, isInit);
  var pendingAllPropsFinal = updateElNormal(api, el, thisElIsMorphTo, dataIndex, elOption, elOption.style, attachedTxInfoTmp, seriesModel, isInit, false);

  if (thisElIsMorphTo) {
    morphPreparation.addTo(el, elOption, dataIndex, pendingAllPropsFinal);
  }

  for (var i = 0; i < STATES.length; i++) {
    var stateName = STATES[i];

    if (stateName !== NORMAL) {
      var otherStateOpt = retrieveStateOption(elOption, stateName);
      var otherStyleOpt = retrieveStyleOptionOnState(elOption, otherStateOpt, stateName);
      updateElOnState(stateName, el, otherStateOpt, otherStyleOpt, attachedTxInfoTmp, isRoot, false);
    }
  }

  updateZ(el, elOption, seriesModel, attachedTxInfoTmp);

  if (elOption.type === 'group') {
    mergeChildren(api, el, dataIndex, elOption, seriesModel, morphPreparation);
  }

  if (toBeReplacedIdx >= 0) {
    group.replaceAt(el, toBeReplacedIdx);
  } else {
    group.add(el);
  }

  return el;
} // `el` must not be null/undefined.


function doesElNeedRecreate(el, elOption) {
  var elInner = inner(el);
  var elOptionType = elOption.type;
  var elOptionShape = elOption.shape;
  var elOptionStyle = elOption.style;
  return (// If `elOptionType` is `null`, follow the merge principle.
    elOptionType != null && elOptionType !== elInner.customGraphicType || elOptionType === 'path' && hasOwnPathData(elOptionShape) && getPathData(elOptionShape) !== elInner.customPathData || elOptionType === 'image' && hasOwn(elOptionStyle, 'image') && elOptionStyle.image !== elInner.customImagePath // // FIXME test and remove this restriction?
    // || (elOptionType === 'text'
    //     && hasOwn(elOptionStyle, 'text')
    //     && (elOptionStyle as TextStyleProps).text !== elInner.customText
    // )

  );
}

function doCreateOrUpdateClipPath(el, dataIndex, elOption, seriesModel, isInit) {
  // Based on the "merge" principle, if no clipPath provided,
  // do nothing. The exists clip will be totally removed only if
  // `el.clipPath` is `false`. Otherwise it will be merged/replaced.
  var clipPathOpt = elOption.clipPath;

  if (clipPathOpt === false) {
    if (el && el.getClipPath()) {
      el.removeClipPath();
    }
  } else if (clipPathOpt) {
    var clipPath = el.getClipPath();

    if (clipPath && doesElNeedRecreate(clipPath, clipPathOpt)) {
      clipPath = null;
    }

    if (!clipPath) {
      clipPath = createEl(clipPathOpt);

      if (process.env.NODE_ENV !== 'production') {
        assert(clipPath instanceof graphicUtil.Path, 'Only any type of `path` can be used in `clipPath`, rather than ' + clipPath.type + '.');
      }

      el.setClipPath(clipPath);
    }

    updateElNormal(null, clipPath, null, dataIndex, clipPathOpt, null, null, seriesModel, isInit, false);
  } // If not define `clipPath` in option, do nothing unnecessary.

}

function doCreateOrUpdateAttachedTx(el, dataIndex, elOption, seriesModel, isInit, attachedTxInfo) {
  // group do not support textContent temporarily untill necessary.
  if (el.isGroup) {
    return;
  } // Normal must be called before emphasis, for `isLegacy` detection.


  processTxInfo(elOption, null, attachedTxInfo);
  processTxInfo(elOption, EMPHASIS, attachedTxInfo); // If `elOption.textConfig` or `elOption.textContent` is null/undefined, it does not make sence.
  // So for simplicity, if "elOption hasOwnProperty of them but be null/undefined", we do not
  // trade them as set to null to el.
  // Especially:
  // `elOption.textContent: false` means remove textContent.
  // `elOption.textContent.emphasis.style: false` means remove the style from emphasis state.

  var txConOptNormal = attachedTxInfo.normal.conOpt;
  var txConOptEmphasis = attachedTxInfo.emphasis.conOpt;
  var txConOptBlur = attachedTxInfo.blur.conOpt;
  var txConOptSelect = attachedTxInfo.select.conOpt;

  if (txConOptNormal != null || txConOptEmphasis != null || txConOptSelect != null || txConOptBlur != null) {
    var textContent = el.getTextContent();

    if (txConOptNormal === false) {
      textContent && el.removeTextContent();
    } else {
      txConOptNormal = attachedTxInfo.normal.conOpt = txConOptNormal || {
        type: 'text'
      };

      if (!textContent) {
        textContent = createEl(txConOptNormal);
        el.setTextContent(textContent);
      } else {
        // If in some case the performance issue arised, consider
        // do not clearState but update cached normal state directly.
        textContent.clearStates();
      }

      var txConStlOptNormal = txConOptNormal && txConOptNormal.style;
      updateElNormal(null, textContent, null, dataIndex, txConOptNormal, txConStlOptNormal, null, seriesModel, isInit, true);

      for (var i = 0; i < STATES.length; i++) {
        var stateName = STATES[i];

        if (stateName !== NORMAL) {
          var txConOptOtherState = attachedTxInfo[stateName].conOpt;
          updateElOnState(stateName, textContent, txConOptOtherState, retrieveStyleOptionOnState(txConOptNormal, txConOptOtherState, stateName), null, false, true);
        }
      }

      txConStlOptNormal ? textContent.dirty() : textContent.markRedraw();
    }
  }
}

function processTxInfo(elOption, state, attachedTxInfo) {
  var stateOpt = !state ? elOption : retrieveStateOption(elOption, state);
  var styleOpt = !state ? elOption.style : retrieveStyleOptionOnState(elOption, stateOpt, EMPHASIS);
  var elType = elOption.type;
  var txCfg = stateOpt ? stateOpt.textConfig : null;
  var txConOptNormal = elOption.textContent;
  var txConOpt = !txConOptNormal ? null : !state ? txConOptNormal : retrieveStateOption(txConOptNormal, state);

  if (styleOpt && ( // Because emphasis style has little info to detect legacy,
  // if normal is legacy, emphasis is trade as legacy.
  attachedTxInfo.isLegacy || isEC4CompatibleStyle(styleOpt, elType, !!txCfg, !!txConOpt))) {
    attachedTxInfo.isLegacy = true;
    var convertResult = convertFromEC4CompatibleStyle(styleOpt, elType, !state); // Explicitly specified `textConfig` and `textContent` has higher priority than
    // the ones generated by legacy style. Otherwise if users use them and `api.style`
    // at the same time, they not both work and hardly to known why.

    if (!txCfg && convertResult.textConfig) {
      txCfg = convertResult.textConfig;
    }

    if (!txConOpt && convertResult.textContent) {
      txConOpt = convertResult.textContent;
    }
  }

  if (!state && txConOpt) {
    var txConOptNormal_1 = txConOpt; // `textContent: {type: 'text'}`, the "type" is easy to be missing. So we tolerate it.

    !txConOptNormal_1.type && (txConOptNormal_1.type = 'text');

    if (process.env.NODE_ENV !== 'production') {
      // Do not tolerate incorret type for forward compat.
      txConOptNormal_1.type !== 'text' && assert(txConOptNormal_1.type === 'text', 'textContent.type must be "text"');
    }
  }

  var info = !state ? attachedTxInfo.normal : attachedTxInfo[state];
  info.cfg = txCfg;
  info.conOpt = txConOpt;
}

function retrieveStateOption(elOption, state) {
  return !state ? elOption : elOption ? elOption[state] : null;
}

function retrieveStyleOptionOnState(stateOptionNormal, stateOption, state) {
  var style = stateOption && stateOption.style;

  if (style == null && state === EMPHASIS && stateOptionNormal) {
    style = stateOptionNormal.styleEmphasis;
  }

  return style;
} // Usage:
// (1) By default, `elOption.$mergeChildren` is `'byIndex'`, which indicates that
//     the existing children will not be removed, and enables the feature that
//     update some of the props of some of the children simply by construct
//     the returned children of `renderItem` like:
//     `var children = group.children = []; children[3] = {opacity: 0.5};`
// (2) If `elOption.$mergeChildren` is `'byName'`, add/update/remove children
//     by child.name. But that might be lower performance.
// (3) If `elOption.$mergeChildren` is `false`, the existing children will be
//     replaced totally.
// (4) If `!elOption.children`, following the "merge" principle, nothing will happen.
//
// For implementation simpleness, do not provide a direct way to remove sinlge
// child (otherwise the total indicies of the children array have to be modified).
// User can remove a single child by set its `ignore` as `true`.


function mergeChildren(api, el, dataIndex, elOption, seriesModel, morphPreparation) {
  var newChildren = elOption.children;
  var newLen = newChildren ? newChildren.length : 0;
  var mergeChildren = elOption.$mergeChildren; // `diffChildrenByName` has been deprecated.

  var byName = mergeChildren === 'byName' || elOption.diffChildrenByName;
  var notMerge = mergeChildren === false; // For better performance on roam update, only enter if necessary.

  if (!newLen && !byName && !notMerge) {
    return;
  }

  if (byName) {
    diffGroupChildren({
      api: api,
      oldChildren: el.children() || [],
      newChildren: newChildren || [],
      dataIndex: dataIndex,
      seriesModel: seriesModel,
      group: el,
      morphPreparation: morphPreparation
    });
    return;
  }

  notMerge && el.removeAll(); // Mapping children of a group simply by index, which
  // might be better performance.

  var index = 0;

  for (; index < newLen; index++) {
    newChildren[index] && doCreateOrUpdateEl(api, el.childAt(index), dataIndex, newChildren[index], seriesModel, el, false, morphPreparation);
  }

  for (var i = el.childCount() - 1; i >= index; i--) {
    // Do not supprot leave elements that are not mentioned in the latest
    // `renderItem` return. Otherwise users may not have a clear and simple
    // concept that how to contorl all of the elements.
    doRemoveEl(el.childAt(i), seriesModel, el);
  }
}

function diffGroupChildren(context) {
  new DataDiffer(context.oldChildren, context.newChildren, getKey, getKey, context).add(processAddUpdate).update(processAddUpdate).remove(processRemove).execute();
}

function getKey(item, idx) {
  var name = item && item.name;
  return name != null ? name : GROUP_DIFF_PREFIX + idx;
}

function processAddUpdate(newIndex, oldIndex) {
  var context = this.context;
  var childOption = newIndex != null ? context.newChildren[newIndex] : null;
  var child = oldIndex != null ? context.oldChildren[oldIndex] : null;
  doCreateOrUpdateEl(context.api, child, context.dataIndex, childOption, context.seriesModel, context.group, false, context.morphPreparation);
}

function processRemove(oldIndex) {
  var context = this.context;
  var child = context.oldChildren[oldIndex];
  doRemoveEl(child, context.seriesModel, context.group);
}

function doRemoveEl(el, seriesModel, group) {
  if (el) {
    var leaveToProps = inner(el).leaveToProps;
    leaveToProps ? graphicUtil.updateProps(el, leaveToProps, seriesModel, {
      cb: function () {
        group.remove(el);
      }
    }) : group.remove(el);
  }
}
/**
 * @return SVG Path data.
 */


function getPathData(shape) {
  // "d" follows the SVG convention.
  return shape && (shape.pathData || shape.d);
}

function hasOwnPathData(shape) {
  return shape && (hasOwn(shape, 'pathData') || hasOwn(shape, 'd'));
}

function isPath(el) {
  return el && el instanceof graphicUtil.Path;
}

function removeElementDirectly(el, group) {
  el && group.remove(el);
}
/**
 * Any morph-potential el should added by `morphPreparation.addTo(el)`.
 * And they may apply morph or not when `morphPreparation.applyMorphing()`.
 * But at least, all of the "to" elements will apply all of the updates
 * as `doCreateOrUpdateItem` did.
 */


var MorphPreparation =
/** @class */
function () {
  function MorphPreparation(seriesModel, transOpt) {
    this._fromList = [];
    this._toList = [];
    this._toElOptionList = [];
    this._allPropsFinalList = [];
    this._toDataIndices = []; // Key: `toDataIndex`, not `toIdx`

    this._morphConfigList = [];
    this._seriesModel = seriesModel;
    this._transOpt = transOpt;
  }

  MorphPreparation.prototype.hasFrom = function () {
    return !!this._fromList.length;
  }; // isOneToOneFrom(el: Element): boolean {
  //     if (el && inner(el).canMorph) {
  //         const fromList = this._fromList;
  //         for (let i = 0; i < fromList.length; i++) {
  //             if (fromList[i] === el) {
  //                 return true;
  //             }
  //         }
  //     }
  // }


  MorphPreparation.prototype.findAndAddFrom = function (el) {
    if (!el) {
      return;
    }

    if (inner(el).canMorph) {
      this._fromList.push(el);
    }

    if (el.isGroup) {
      var children = el.childrenRef();

      for (var i = 0; i < children.length; i++) {
        this.findAndAddFrom(children[i]);
      }
    }
  };

  MorphPreparation.prototype.addTo = function (path, elOption, dataIndex, allPropsFinal) {
    if (path) {
      this._toList.push(path);

      this._toElOptionList.push(elOption);

      this._toDataIndices.push(dataIndex);

      this._allPropsFinalList.push(allPropsFinal);
    }
  };

  MorphPreparation.prototype.applyMorphing = function () {
    // [MORPHING_LOGIC_HINT]
    // Pay attention to the order:
    // (A) Apply `allPropsFinal` and `styleOption` to "to".
    //     (Then "to" becomes to the final state.)
    // (B) Apply `morphPath`/`combine`/`separate`.
    //     (Based on the current state of "from" and the final state of "to".)
    //     (Then we may get "from.subList" or "to.subList".)
    // (C) Copy the related props from "from" to "from.subList", from "to" to "to.subList".
    // (D) Collect `transitionFromProps` for "to" and "to.subList"
    //     (Based on "from" or "from.subList".)
    // (E) Apply `transitionFromProps` to "to" and "to.subList"
    //     (It might change the prop values to the first frame value.)
    // Case_I:
    //     If (D) should be after (C), we use sequence: A - B - C - D - E
    // Case_II:
    //     If (A) should be after (D), we use sequence: D - A - B - C - E
    // [MORPHING_LOGIC_HINT]
    // zrender `morphPath`/`combine`/`separate` only manages the shape animation.
    // Other props (like transfrom, style transition) will handled in echarts).
    // [MORPHING_LOGIC_HINT]
    // Make sure `applyPropsFinal` always be called for "to".
    var type = this._type;
    var fromList = this._fromList;
    var toList = this._toList;
    var toListLen = toList.length;
    var fromListLen = fromList.length;

    if (!fromListLen || !toListLen) {
      return;
    }

    if (type === 'oneToOne') {
      // In one-to-one case, we by default apply a simple rule:
      // map "from" and "to" one by one.
      // For this case: old_data_item_el and new_data_item_el
      // has the same hierarchy of group tree but only some path type changed.
      for (var toIdx = 0; toIdx < toListLen; toIdx++) {
        this._oneToOneForSingleTo(toIdx, toIdx);
      }
    } else if (type === 'manyToOne') {
      // A rough strategy: if there are more than one "to", we simply divide "fromList" equally.
      var fromSingleSegLen = Math.max(1, Math.floor(fromListLen / toListLen));

      for (var toIdx = 0, fromIdxStart = 0; toIdx < toListLen; toIdx++, fromIdxStart += fromSingleSegLen) {
        var fromCount = toIdx + 1 >= toListLen ? fromListLen - fromIdxStart : fromSingleSegLen;

        this._manyToOneForSingleTo(toIdx, fromIdxStart >= fromListLen ? null : fromIdxStart, fromCount);
      }
    } else if (type === 'oneToMany') {
      // A rough strategy: if there are more than one "from", we simply divide "toList" equally.
      var toSingleSegLen = Math.max(1, Math.floor(toListLen / fromListLen));

      for (var toIdxStart = 0, fromIdx = 0; toIdxStart < toListLen; toIdxStart += toSingleSegLen, fromIdx++) {
        var toCount = toIdxStart + toSingleSegLen >= toListLen ? toListLen - toIdxStart : toSingleSegLen;

        this._oneToManyForSingleFrom(toIdxStart, toCount, fromIdx >= fromListLen ? null : fromIdx);
      }
    }
  };

  MorphPreparation.prototype._oneToOneForSingleTo = function ( // "to" must NOT be null/undefined.
  toIdx, // May `fromIdx >= this._fromList.length`
  fromIdx) {
    var to = this._toList[toIdx];
    var toElOption = this._toElOptionList[toIdx];
    var toDataIndex = this._toDataIndices[toIdx];
    var allPropsFinal = this._allPropsFinalList[toIdx];
    var from = this._fromList[fromIdx];

    var elAnimationConfig = this._getOrCreateMorphConfig(toDataIndex);

    var morphDuration = elAnimationConfig.duration;

    if (from && isCombiningPath(from)) {
      applyPropsFinal(to, allPropsFinal, toElOption.style);

      if (morphDuration) {
        var combineResult = combine([from], to, elAnimationConfig, copyPropsWhenDivided);

        this._processResultIndividuals(combineResult, toIdx, null);
      } // The target el will not be displayed and transition from multiple path.
      // transition on the target el does not make sense.

    } else {
      var morphFrom = morphDuration // from === to usually happen in scenarios where internal update like
      // "dataZoom", "legendToggle" happen. If from is not in any morphing,
      // we do not need to call `morphPath`.
      && from && (from !== to || isInAnyMorphing(from)) ? from : null; // See [Case_II] above.
      // In this case, there is probably `from === to`. And the `transitionFromProps` collecting
      // does not depends on morphing. So we collect `transitionFromProps` first.

      var transFromProps = {};
      prepareShapeOrExtraTransitionFrom('shape', to, morphFrom, toElOption, transFromProps, false);
      prepareShapeOrExtraTransitionFrom('extra', to, morphFrom, toElOption, transFromProps, false);
      prepareTransformTransitionFrom(to, morphFrom, toElOption, transFromProps, false);
      prepareStyleTransitionFrom(to, morphFrom, toElOption, toElOption.style, transFromProps, false);
      applyPropsFinal(to, allPropsFinal, toElOption.style);

      if (morphFrom) {
        morphPath(morphFrom, to, elAnimationConfig);
      }

      applyTransitionFrom(to, toDataIndex, toElOption, this._seriesModel, transFromProps, false);
    }
  };

  MorphPreparation.prototype._manyToOneForSingleTo = function ( // "to" must NOT be null/undefined.
  toIdx, // May be null.
  fromIdxStart, fromCount) {
    var to = this._toList[toIdx];
    var toElOption = this._toElOptionList[toIdx];
    var allPropsFinal = this._allPropsFinalList[toIdx];
    applyPropsFinal(to, allPropsFinal, toElOption.style);

    var elAnimationConfig = this._getOrCreateMorphConfig(this._toDataIndices[toIdx]);

    if (elAnimationConfig.duration && fromIdxStart != null) {
      var combineFromList = [];

      for (var fromIdx = fromIdxStart; fromIdx < fromCount; fromIdx++) {
        combineFromList.push(this._fromList[fromIdx]);
      }

      var combineResult = combine(combineFromList, to, elAnimationConfig, copyPropsWhenDivided);

      this._processResultIndividuals(combineResult, toIdx, null);
    }
  };

  MorphPreparation.prototype._oneToManyForSingleFrom = function ( // "to" must NOT be null/undefined.
  toIdxStart, toCount, // May be null
  fromIdx) {
    var from = fromIdx == null ? null : this._fromList[fromIdx];
    var toList = this._toList;
    var separateToList = [];

    for (var toIdx = toIdxStart; toIdx < toCount; toIdx++) {
      var to = toList[toIdx];
      applyPropsFinal(to, this._allPropsFinalList[toIdx], this._toElOptionList[toIdx].style);
      separateToList.push(to);
    }

    var elAnimationConfig = this._getOrCreateMorphConfig(this._toDataIndices[toIdxStart]);

    if (elAnimationConfig.duration && from) {
      var separateResult = separate(from, separateToList, elAnimationConfig, copyPropsWhenDivided);

      this._processResultIndividuals(separateResult, toIdxStart, toCount);
    }
  };

  MorphPreparation.prototype._processResultIndividuals = function (combineSeparateResult, toIdxStart, toCount) {
    var isSeparate = toCount != null;

    for (var i = 0; i < combineSeparateResult.count; i++) {
      var fromIndividual = combineSeparateResult.fromIndividuals[i];
      var toIndividual = combineSeparateResult.toIndividuals[i]; // Here it's a trick:
      // For "combine" case, all of the `toIndividuals` map to the same `toIdx`.
      // For "separate" case, the `toIndividuals` map to some certain segment of `_toList` accurately.

      var toIdx = toIdxStart + (isSeparate ? i : 0);
      var toElOption = this._toElOptionList[toIdx];
      var dataIndex = this._toDataIndices[toIdx];
      var transFromProps = {};
      prepareTransformTransitionFrom(toIndividual, fromIndividual, toElOption, transFromProps, false);
      prepareStyleTransitionFrom(toIndividual, fromIndividual, toElOption, toElOption.style, transFromProps, false);
      applyTransitionFrom(toIndividual, dataIndex, toElOption, this._seriesModel, transFromProps, false);
    }
  };

  MorphPreparation.prototype._getOrCreateMorphConfig = function (dataIndex) {
    var morphConfigList = this._morphConfigList;
    var config = morphConfigList[dataIndex];

    if (config) {
      return config;
    }

    var duration;
    var easing;
    var delay;
    var seriesModel = this._seriesModel;
    var transOpt = this._transOpt;

    if (seriesModel.isAnimationEnabled()) {
      // PENDING: refactor? this is the same logic as `src/util/graphic.ts#animateOrSetProps`.
      var animationPayload = void 0;

      if (seriesModel && seriesModel.ecModel) {
        var updatePayload = seriesModel.ecModel.getUpdatePayload();
        animationPayload = updatePayload && updatePayload.animation;
      }

      if (animationPayload) {
        duration = animationPayload.duration || 0;
        easing = animationPayload.easing || 'cubicOut';
        delay = animationPayload.delay || 0;
      } else {
        easing = seriesModel.get('animationEasingUpdate');
        var delayOption = seriesModel.get('animationDelayUpdate');
        delay = isFunction(delayOption) ? delayOption(dataIndex) : delayOption;
        var durationOption = seriesModel.get('animationDurationUpdate');
        duration = isFunction(durationOption) ? durationOption(dataIndex) : durationOption;
      }
    }

    config = {
      duration: duration || 0,
      delay: delay,
      easing: easing,
      dividingMethod: transOpt ? transOpt.dividingMethod : null
    };
    morphConfigList[dataIndex] = config;
    return config;
  };

  MorphPreparation.prototype.reset = function (type) {
    // `this._morphConfigList` can be kept. It only related to `dataIndex`.
    this._type = type;
    this._fromList.length = this._toList.length = this._toElOptionList.length = this._allPropsFinalList.length = this._toDataIndices.length = 0;
  };

  return MorphPreparation;
}();

function copyPropsWhenDivided(srcPath, tarPath, willClone) {
  // Do not copy transform props.
  // Sub paths are transfrom based on their host path.
  // tarPath.x = srcPath.x;
  // tarPath.y = srcPath.y;
  // tarPath.scaleX = srcPath.scaleX;
  // tarPath.scaleY = srcPath.scaleY;
  // tarPath.originX = srcPath.originX;
  // tarPath.originY = srcPath.originY;
  // If just carry the style, will not be modifed, so do not copy.
  tarPath.style = willClone ? clone(srcPath.style) : srcPath.style;
  tarPath.zlevel = srcPath.zlevel;
  tarPath.z = srcPath.z;
  tarPath.z2 = srcPath.z2;
}

export function install(registers) {
  registers.registerChartView(CustomSeriesView);
  registers.registerSeriesModel(CustomSeriesModel);
}