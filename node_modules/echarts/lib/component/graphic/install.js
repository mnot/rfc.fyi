
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
import * as zrUtil from 'zrender/lib/core/util';
import * as modelUtil from '../../util/model';
import * as graphicUtil from '../../util/graphic';
import * as layoutUtil from '../../util/layout';
import { parsePercent } from '../../util/number';
import ComponentModel from '../../model/Component';
import ComponentView from '../../view/Component';
import { getECData } from '../../util/innerStore';
import { isEC4CompatibleStyle, convertFromEC4CompatibleStyle } from '../../util/styleCompat';
var TRANSFORM_PROPS = {
  x: 1,
  y: 1,
  scaleX: 1,
  scaleY: 1,
  originX: 1,
  originY: 1,
  rotation: 1
};
;
var inner = modelUtil.makeInner();
var _nonShapeGraphicElements = {
  // Reserved but not supported in graphic component.
  path: null,
  compoundPath: null,
  // Supported in graphic component.
  group: graphicUtil.Group,
  image: graphicUtil.Image,
  text: graphicUtil.Text
}; // ------------------------
// Preprocessor
// ------------------------

var preprocessor = function (option) {
  var graphicOption = option.graphic; // Convert
  // {graphic: [{left: 10, type: 'circle'}, ...]}
  // or
  // {graphic: {left: 10, type: 'circle'}}
  // to
  // {graphic: [{elements: [{left: 10, type: 'circle'}, ...]}]}

  if (zrUtil.isArray(graphicOption)) {
    if (!graphicOption[0] || !graphicOption[0].elements) {
      option.graphic = [{
        elements: graphicOption
      }];
    } else {
      // Only one graphic instance can be instantiated. (We dont
      // want that too many views are created in echarts._viewMap)
      option.graphic = [option.graphic[0]];
    }
  } else if (graphicOption && !graphicOption.elements) {
    option.graphic = [{
      elements: [graphicOption]
    }];
  }
};

;

var GraphicComponentModel =
/** @class */
function (_super) {
  __extends(GraphicComponentModel, _super);

  function GraphicComponentModel() {
    var _this = _super !== null && _super.apply(this, arguments) || this;

    _this.type = GraphicComponentModel.type;
    _this.preventAutoZ = true;
    return _this;
  }

  GraphicComponentModel.prototype.mergeOption = function (option, ecModel) {
    // Prevent default merge to elements
    var elements = this.option.elements;
    this.option.elements = null;

    _super.prototype.mergeOption.call(this, option, ecModel);

    this.option.elements = elements;
  };

  GraphicComponentModel.prototype.optionUpdated = function (newOption, isInit) {
    var thisOption = this.option;
    var newList = (isInit ? thisOption : newOption).elements;
    var existList = thisOption.elements = isInit ? [] : thisOption.elements;
    var flattenedList = [];

    this._flatten(newList, flattenedList, null);

    var mappingResult = modelUtil.mappingToExists(existList, flattenedList, 'normalMerge'); // Clear elOptionsToUpdate

    var elOptionsToUpdate = this._elOptionsToUpdate = [];
    zrUtil.each(mappingResult, function (resultItem, index) {
      var newElOption = resultItem.newOption;

      if (process.env.NODE_ENV !== 'production') {
        zrUtil.assert(zrUtil.isObject(newElOption) || resultItem.existing, 'Empty graphic option definition');
      }

      if (!newElOption) {
        return;
      }

      elOptionsToUpdate.push(newElOption);
      setKeyInfoToNewElOption(resultItem, newElOption);
      mergeNewElOptionToExist(existList, index, newElOption);
      setLayoutInfoToExist(existList[index], newElOption);
    }, this); // Clean

    for (var i = existList.length - 1; i >= 0; i--) {
      if (existList[i] == null) {
        existList.splice(i, 1);
      } else {
        // $action should be volatile, otherwise option gotten from
        // `getOption` will contain unexpected $action.
        delete existList[i].$action;
      }
    }
  };
  /**
   * Convert
   * [{
   *  type: 'group',
   *  id: 'xx',
   *  children: [{type: 'circle'}, {type: 'polygon'}]
   * }]
   * to
   * [
   *  {type: 'group', id: 'xx'},
   *  {type: 'circle', parentId: 'xx'},
   *  {type: 'polygon', parentId: 'xx'}
   * ]
   */


  GraphicComponentModel.prototype._flatten = function (optionList, result, parentOption) {
    zrUtil.each(optionList, function (option) {
      if (!option) {
        return;
      }

      if (parentOption) {
        option.parentOption = parentOption;
      }

      result.push(option);
      var children = option.children;

      if (option.type === 'group' && children) {
        this._flatten(children, result, option);
      } // Deleting for JSON output, and for not affecting group creation.


      delete option.children;
    }, this);
  }; // FIXME
  // Pass to view using payload? setOption has a payload?


  GraphicComponentModel.prototype.useElOptionsToUpdate = function () {
    var els = this._elOptionsToUpdate; // Clear to avoid render duplicately when zooming.

    this._elOptionsToUpdate = null;
    return els;
  };

  GraphicComponentModel.type = 'graphic';
  GraphicComponentModel.defaultOption = {
    elements: [] // parentId: null

  };
  return GraphicComponentModel;
}(ComponentModel); // ------------------------
// View
// ------------------------


var GraphicComponentView =
/** @class */
function (_super) {
  __extends(GraphicComponentView, _super);

  function GraphicComponentView() {
    var _this = _super !== null && _super.apply(this, arguments) || this;

    _this.type = GraphicComponentView.type;
    return _this;
  }

  GraphicComponentView.prototype.init = function () {
    this._elMap = zrUtil.createHashMap();
  };

  GraphicComponentView.prototype.render = function (graphicModel, ecModel, api) {
    // Having leveraged between use cases and algorithm complexity, a very
    // simple layout mechanism is used:
    // The size(width/height) can be determined by itself or its parent (not
    // implemented yet), but can not by its children. (Top-down travel)
    // The location(x/y) can be determined by the bounding rect of itself
    // (can including its descendants or not) and the size of its parent.
    // (Bottom-up travel)
    // When `chart.clear()` or `chart.setOption({...}, true)` with the same id,
    // view will be reused.
    if (graphicModel !== this._lastGraphicModel) {
      this._clear();
    }

    this._lastGraphicModel = graphicModel;

    this._updateElements(graphicModel);

    this._relocate(graphicModel, api);
  };
  /**
   * Update graphic elements.
   */


  GraphicComponentView.prototype._updateElements = function (graphicModel) {
    var elOptionsToUpdate = graphicModel.useElOptionsToUpdate();

    if (!elOptionsToUpdate) {
      return;
    }

    var elMap = this._elMap;
    var rootGroup = this.group; // Top-down tranverse to assign graphic settings to each elements.

    zrUtil.each(elOptionsToUpdate, function (elOption) {
      var id = modelUtil.convertOptionIdName(elOption.id, null);
      var elExisting = id != null ? elMap.get(id) : null;
      var parentId = modelUtil.convertOptionIdName(elOption.parentId, null);
      var targetElParent = parentId != null ? elMap.get(parentId) : rootGroup;
      var elType = elOption.type;
      var elOptionStyle = elOption.style;

      if (elType === 'text' && elOptionStyle) {
        // In top/bottom mode, textVerticalAlign should not be used, which cause
        // inaccurately locating.
        if (elOption.hv && elOption.hv[1]) {
          elOptionStyle.textVerticalAlign = elOptionStyle.textBaseline = elOptionStyle.verticalAlign = elOptionStyle.align = null;
        }
      }

      var textContentOption = elOption.textContent;
      var textConfig = elOption.textConfig;

      if (elOptionStyle && isEC4CompatibleStyle(elOptionStyle, elType, !!textConfig, !!textContentOption)) {
        var convertResult = convertFromEC4CompatibleStyle(elOptionStyle, elType, true);

        if (!textConfig && convertResult.textConfig) {
          textConfig = elOption.textConfig = convertResult.textConfig;
        }

        if (!textContentOption && convertResult.textContent) {
          textContentOption = convertResult.textContent;
        }
      } // Remove unnecessary props to avoid potential problems.


      var elOptionCleaned = getCleanedElOption(elOption); // For simple, do not support parent change, otherwise reorder is needed.

      if (process.env.NODE_ENV !== 'production') {
        elExisting && zrUtil.assert(targetElParent === elExisting.parent, 'Changing parent is not supported.');
      }

      var $action = elOption.$action || 'merge';

      if ($action === 'merge') {
        elExisting ? elExisting.attr(elOptionCleaned) : createEl(id, targetElParent, elOptionCleaned, elMap);
      } else if ($action === 'replace') {
        removeEl(elExisting, elMap);
        createEl(id, targetElParent, elOptionCleaned, elMap);
      } else if ($action === 'remove') {
        removeEl(elExisting, elMap);
      }

      var el = elMap.get(id);

      if (el && textContentOption) {
        if ($action === 'merge') {
          var textContentExisting = el.getTextContent();
          textContentExisting ? textContentExisting.attr(textContentOption) : el.setTextContent(new graphicUtil.Text(textContentOption));
        } else if ($action === 'replace') {
          el.setTextContent(new graphicUtil.Text(textContentOption));
        }
      }

      if (el) {
        var elInner = inner(el);
        elInner.__ecGraphicWidthOption = elOption.width;
        elInner.__ecGraphicHeightOption = elOption.height;
        setEventData(el, graphicModel, elOption);
        graphicUtil.setTooltipConfig({
          el: el,
          componentModel: graphicModel,
          itemName: el.name,
          itemTooltipOption: elOption.tooltip
        });
      }
    });
  };
  /**
   * Locate graphic elements.
   */


  GraphicComponentView.prototype._relocate = function (graphicModel, api) {
    var elOptions = graphicModel.option.elements;
    var rootGroup = this.group;
    var elMap = this._elMap;
    var apiWidth = api.getWidth();
    var apiHeight = api.getHeight(); // Top-down to calculate percentage width/height of group

    for (var i = 0; i < elOptions.length; i++) {
      var elOption = elOptions[i];
      var id = modelUtil.convertOptionIdName(elOption.id, null);
      var el = id != null ? elMap.get(id) : null;

      if (!el || !el.isGroup) {
        continue;
      }

      var parentEl = el.parent;
      var isParentRoot = parentEl === rootGroup; // Like 'position:absolut' in css, default 0.

      var elInner = inner(el);
      var parentElInner = inner(parentEl);
      elInner.__ecGraphicWidth = parsePercent(elInner.__ecGraphicWidthOption, isParentRoot ? apiWidth : parentElInner.__ecGraphicWidth) || 0;
      elInner.__ecGraphicHeight = parsePercent(elInner.__ecGraphicHeightOption, isParentRoot ? apiHeight : parentElInner.__ecGraphicHeight) || 0;
    } // Bottom-up tranvese all elements (consider ec resize) to locate elements.


    for (var i = elOptions.length - 1; i >= 0; i--) {
      var elOption = elOptions[i];
      var id = modelUtil.convertOptionIdName(elOption.id, null);
      var el = id != null ? elMap.get(id) : null;

      if (!el) {
        continue;
      }

      var parentEl = el.parent;
      var parentElInner = inner(parentEl);
      var containerInfo = parentEl === rootGroup ? {
        width: apiWidth,
        height: apiHeight
      } : {
        width: parentElInner.__ecGraphicWidth,
        height: parentElInner.__ecGraphicHeight
      }; // PENDING
      // Currently, when `bounding: 'all'`, the union bounding rect of the group
      // does not include the rect of [0, 0, group.width, group.height], which
      // is probably weird for users. Should we make a break change for it?

      layoutUtil.positionElement(el, elOption, containerInfo, null, {
        hv: elOption.hv,
        boundingMode: elOption.bounding
      });
    }
  };
  /**
   * Clear all elements.
   */


  GraphicComponentView.prototype._clear = function () {
    var elMap = this._elMap;
    elMap.each(function (el) {
      removeEl(el, elMap);
    });
    this._elMap = zrUtil.createHashMap();
  };

  GraphicComponentView.prototype.dispose = function () {
    this._clear();
  };

  GraphicComponentView.type = 'graphic';
  return GraphicComponentView;
}(ComponentView);

function createEl(id, targetElParent, elOption, elMap) {
  var graphicType = elOption.type;

  if (process.env.NODE_ENV !== 'production') {
    zrUtil.assert(graphicType, 'graphic type MUST be set');
  }

  var Clz = zrUtil.hasOwn(_nonShapeGraphicElements, graphicType) // Those graphic elements are not shapes. They should not be
  // overwritten by users, so do them first.
  ? _nonShapeGraphicElements[graphicType] : graphicUtil.getShapeClass(graphicType);

  if (process.env.NODE_ENV !== 'production') {
    zrUtil.assert(Clz, 'graphic type can not be found');
  }

  var el = new Clz(elOption);
  targetElParent.add(el);
  elMap.set(id, el);
  inner(el).__ecGraphicId = id;
}

function removeEl(elExisting, elMap) {
  var existElParent = elExisting && elExisting.parent;

  if (existElParent) {
    elExisting.type === 'group' && elExisting.traverse(function (el) {
      removeEl(el, elMap);
    });
    elMap.removeKey(inner(elExisting).__ecGraphicId);
    existElParent.remove(elExisting);
  }
} // Remove unnecessary props to avoid potential problems.


function getCleanedElOption(elOption) {
  elOption = zrUtil.extend({}, elOption);
  zrUtil.each(['id', 'parentId', '$action', 'hv', 'bounding', 'textContent'].concat(layoutUtil.LOCATION_PARAMS), function (name) {
    delete elOption[name];
  });
  return elOption;
}

function isSetLoc(obj, props) {
  var isSet;
  zrUtil.each(props, function (prop) {
    obj[prop] != null && obj[prop] !== 'auto' && (isSet = true);
  });
  return isSet;
}

function setKeyInfoToNewElOption(resultItem, newElOption) {
  var existElOption = resultItem.existing; // Set id and type after id assigned.

  newElOption.id = resultItem.keyInfo.id;
  !newElOption.type && existElOption && (newElOption.type = existElOption.type); // Set parent id if not specified

  if (newElOption.parentId == null) {
    var newElParentOption = newElOption.parentOption;

    if (newElParentOption) {
      newElOption.parentId = newElParentOption.id;
    } else if (existElOption) {
      newElOption.parentId = existElOption.parentId;
    }
  } // Clear


  newElOption.parentOption = null;
}

function mergeNewElOptionToExist(existList, index, newElOption) {
  // Update existing options, for `getOption` feature.
  var newElOptCopy = zrUtil.extend({}, newElOption);
  var existElOption = existList[index];
  var $action = newElOption.$action || 'merge';

  if ($action === 'merge') {
    if (existElOption) {
      if (process.env.NODE_ENV !== 'production') {
        var newType = newElOption.type;
        zrUtil.assert(!newType || existElOption.type === newType, 'Please set $action: "replace" to change `type`');
      } // We can ensure that newElOptCopy and existElOption are not
      // the same object, so `merge` will not change newElOptCopy.


      zrUtil.merge(existElOption, newElOptCopy, true); // Rigid body, use ignoreSize.

      layoutUtil.mergeLayoutParam(existElOption, newElOptCopy, {
        ignoreSize: true
      }); // Will be used in render.

      layoutUtil.copyLayoutParams(newElOption, existElOption);
    } else {
      existList[index] = newElOptCopy;
    }
  } else if ($action === 'replace') {
    existList[index] = newElOptCopy;
  } else if ($action === 'remove') {
    // null will be cleaned later.
    existElOption && (existList[index] = null);
  }
}

function setLayoutInfoToExist(existItem, newElOption) {
  if (!existItem) {
    return;
  }

  existItem.hv = newElOption.hv = [// Rigid body, dont care `width`.
  isSetLoc(newElOption, ['left', 'right']), // Rigid body, dont care `height`.
  isSetLoc(newElOption, ['top', 'bottom'])]; // Give default group size. Otherwise layout error may occur.

  if (existItem.type === 'group') {
    var existingGroupOpt = existItem;
    var newGroupOpt = newElOption;
    existingGroupOpt.width == null && (existingGroupOpt.width = newGroupOpt.width = 0);
    existingGroupOpt.height == null && (existingGroupOpt.height = newGroupOpt.height = 0);
  }
}

function setEventData(el, graphicModel, elOption) {
  var eventData = getECData(el).eventData; // Simple optimize for large amount of elements that no need event.

  if (!el.silent && !el.ignore && !eventData) {
    eventData = getECData(el).eventData = {
      componentType: 'graphic',
      componentIndex: graphicModel.componentIndex,
      name: el.name
    };
  } // `elOption.info` enables user to mount some info on
  // elements and use them in event handlers.


  if (eventData) {
    eventData.info = elOption.info;
  }
}

export function install(registers) {
  registers.registerComponentModel(GraphicComponentModel);
  registers.registerComponentView(GraphicComponentView);
  registers.registerPreprocessor(preprocessor);
}