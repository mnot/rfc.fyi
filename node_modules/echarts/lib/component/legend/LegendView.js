
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
import { parse, stringify } from 'zrender/lib/tool/color';
import * as graphic from '../../util/graphic';
import { enableHoverEmphasis } from '../../util/states';
import { setLabelStyle, createTextStyle } from '../../label/labelStyle';
import { makeBackground } from '../helper/listComponent';
import * as layoutUtil from '../../util/layout';
import ComponentView from '../../view/Component';
import { LINE_STYLE_KEY_MAP } from '../../model/mixin/lineStyle';
import { ITEM_STYLE_KEY_MAP } from '../../model/mixin/itemStyle';
import { createSymbol } from '../../util/symbol';
var curry = zrUtil.curry;
var each = zrUtil.each;
var Group = graphic.Group;

var LegendView =
/** @class */
function (_super) {
  __extends(LegendView, _super);

  function LegendView() {
    var _this = _super !== null && _super.apply(this, arguments) || this;

    _this.type = LegendView.type;
    _this.newlineDisabled = false;
    return _this;
  }

  LegendView.prototype.init = function () {
    this.group.add(this._contentGroup = new Group());
    this.group.add(this._selectorGroup = new Group());
    this._isFirstRender = true;
  };
  /**
   * @protected
   */


  LegendView.prototype.getContentGroup = function () {
    return this._contentGroup;
  };
  /**
   * @protected
   */


  LegendView.prototype.getSelectorGroup = function () {
    return this._selectorGroup;
  };
  /**
   * @override
   */


  LegendView.prototype.render = function (legendModel, ecModel, api) {
    var isFirstRender = this._isFirstRender;
    this._isFirstRender = false;
    this.resetInner();

    if (!legendModel.get('show', true)) {
      return;
    }

    var itemAlign = legendModel.get('align');
    var orient = legendModel.get('orient');

    if (!itemAlign || itemAlign === 'auto') {
      itemAlign = legendModel.get('left') === 'right' && orient === 'vertical' ? 'right' : 'left';
    } // selector has been normalized to an array in model


    var selector = legendModel.get('selector', true);
    var selectorPosition = legendModel.get('selectorPosition', true);

    if (selector && (!selectorPosition || selectorPosition === 'auto')) {
      selectorPosition = orient === 'horizontal' ? 'end' : 'start';
    }

    this.renderInner(itemAlign, legendModel, ecModel, api, selector, orient, selectorPosition); // Perform layout.

    var positionInfo = legendModel.getBoxLayoutParams();
    var viewportSize = {
      width: api.getWidth(),
      height: api.getHeight()
    };
    var padding = legendModel.get('padding');
    var maxSize = layoutUtil.getLayoutRect(positionInfo, viewportSize, padding);
    var mainRect = this.layoutInner(legendModel, itemAlign, maxSize, isFirstRender, selector, selectorPosition); // Place mainGroup, based on the calculated `mainRect`.

    var layoutRect = layoutUtil.getLayoutRect(zrUtil.defaults({
      width: mainRect.width,
      height: mainRect.height
    }, positionInfo), viewportSize, padding);
    this.group.x = layoutRect.x - mainRect.x;
    this.group.y = layoutRect.y - mainRect.y;
    this.group.markRedraw(); // Render background after group is layout.

    this.group.add(this._backgroundEl = makeBackground(mainRect, legendModel));
  };

  LegendView.prototype.resetInner = function () {
    this.getContentGroup().removeAll();
    this._backgroundEl && this.group.remove(this._backgroundEl);
    this.getSelectorGroup().removeAll();
  };

  LegendView.prototype.renderInner = function (itemAlign, legendModel, ecModel, api, selector, orient, selectorPosition) {
    var contentGroup = this.getContentGroup();
    var legendDrawnMap = zrUtil.createHashMap();
    var selectMode = legendModel.get('selectedMode');
    var excludeSeriesId = [];
    ecModel.eachRawSeries(function (seriesModel) {
      !seriesModel.get('legendHoverLink') && excludeSeriesId.push(seriesModel.id);
    });
    each(legendModel.getData(), function (legendItemModel, dataIndex) {
      var name = legendItemModel.get('name'); // Use empty string or \n as a newline string

      if (!this.newlineDisabled && (name === '' || name === '\n')) {
        var g = new Group(); // @ts-ignore

        g.newline = true;
        contentGroup.add(g);
        return;
      } // Representitive series.


      var seriesModel = ecModel.getSeriesByName(name)[0];

      if (legendDrawnMap.get(name)) {
        // Have been drawed
        return;
      } // Legend to control series.


      if (seriesModel) {
        var data = seriesModel.getData();
        var lineVisualStyle = data.getVisual('legendLineStyle') || {};
        var symbolType = data.getVisual('legendSymbol');
        /**
         * `data.getVisual('style')` may be the color from the register
         * in series. For example, for line series,
         */

        var style = data.getVisual('style');
        data.getVisual('symbolSize');

        var itemGroup = this._createItem(seriesModel, name, dataIndex, legendItemModel, legendModel, itemAlign, lineVisualStyle, style, symbolType, selectMode);

        itemGroup.on('click', curry(dispatchSelectAction, name, null, api, excludeSeriesId)).on('mouseover', curry(dispatchHighlightAction, seriesModel.name, null, api, excludeSeriesId)).on('mouseout', curry(dispatchDownplayAction, seriesModel.name, null, api, excludeSeriesId));
        legendDrawnMap.set(name, true);
      } else {
        // Legend to control data. In pie and funnel.
        ecModel.eachRawSeries(function (seriesModel) {
          // In case multiple series has same data name
          if (legendDrawnMap.get(name)) {
            return;
          }

          if (seriesModel.legendVisualProvider) {
            var provider = seriesModel.legendVisualProvider;

            if (!provider.containName(name)) {
              return;
            }

            var idx = provider.indexOfName(name);
            var style = provider.getItemVisual(idx, 'style');
            var symbolType = provider.getItemVisual(idx, 'legendSymbol');
            var colorArr = parse(style.fill); // Color may be set to transparent in visualMap when data is out of range.
            // Do not show nothing.

            if (colorArr && colorArr[3] === 0) {
              colorArr[3] = 0.2; // TODO color is set to 0, 0, 0, 0. Should show correct RGBA

              style.fill = stringify(colorArr, 'rgba');
            }

            var itemGroup = this._createItem(seriesModel, name, dataIndex, legendItemModel, legendModel, itemAlign, {}, style, symbolType, selectMode); // FIXME: consider different series has items with the same name.


            itemGroup.on('click', curry(dispatchSelectAction, null, name, api, excludeSeriesId)) // Should not specify the series name, consider legend controls
            // more than one pie series.
            .on('mouseover', curry(dispatchHighlightAction, null, name, api, excludeSeriesId)).on('mouseout', curry(dispatchDownplayAction, null, name, api, excludeSeriesId));
            legendDrawnMap.set(name, true);
          }
        }, this);
      }

      if (process.env.NODE_ENV !== 'production') {
        if (!legendDrawnMap.get(name)) {
          console.warn(name + ' series not exists. Legend data should be same with series name or data name.');
        }
      }
    }, this);

    if (selector) {
      this._createSelector(selector, legendModel, api, orient, selectorPosition);
    }
  };

  LegendView.prototype._createSelector = function (selector, legendModel, api, orient, selectorPosition) {
    var selectorGroup = this.getSelectorGroup();
    each(selector, function createSelectorButton(selectorItem) {
      var type = selectorItem.type;
      var labelText = new graphic.Text({
        style: {
          x: 0,
          y: 0,
          align: 'center',
          verticalAlign: 'middle'
        },
        onclick: function () {
          api.dispatchAction({
            type: type === 'all' ? 'legendAllSelect' : 'legendInverseSelect'
          });
        }
      });
      selectorGroup.add(labelText);
      var labelModel = legendModel.getModel('selectorLabel');
      var emphasisLabelModel = legendModel.getModel(['emphasis', 'selectorLabel']);
      setLabelStyle(labelText, {
        normal: labelModel,
        emphasis: emphasisLabelModel
      }, {
        defaultText: selectorItem.title
      });
      enableHoverEmphasis(labelText);
    });
  };

  LegendView.prototype._createItem = function (seriesModel, name, dataIndex, itemModel, legendModel, itemAlign, lineVisualStyle, itemVisualStyle, symbolType, selectMode) {
    var drawType = seriesModel.visualDrawType;
    var itemWidth = legendModel.get('itemWidth');
    var itemHeight = legendModel.get('itemHeight');
    var isSelected = legendModel.isSelected(name);
    var symbolKeepAspect = itemModel.get('symbolKeepAspect');
    var legendIconType = itemModel.get('icon');
    symbolType = legendIconType || symbolType || 'roundRect';
    var legendLineStyle = legendModel.getModel('lineStyle');
    var style = getLegendStyle(symbolType, itemModel, legendLineStyle, lineVisualStyle, itemVisualStyle, drawType, isSelected);
    var itemGroup = new Group();
    var textStyleModel = itemModel.getModel('textStyle');

    if (typeof seriesModel.getLegendIcon === 'function' && !legendIconType) {
      // Series has specific way to define legend icon
      itemGroup.add(seriesModel.getLegendIcon({
        itemWidth: itemWidth,
        itemHeight: itemHeight,
        symbolType: symbolType,
        symbolKeepAspect: symbolKeepAspect,
        itemStyle: style.itemStyle,
        lineStyle: style.lineStyle
      }));
    } else {
      // Use default legend icon policy for most series
      itemGroup.add(getDefaultLegendIcon({
        itemWidth: itemWidth,
        itemHeight: itemHeight,
        symbolType: symbolType,
        symbolKeepAspect: symbolKeepAspect,
        itemStyle: style.itemStyle,
        lineStyle: style.lineStyle
      }));
    }

    var textX = itemAlign === 'left' ? itemWidth + 5 : -5;
    var textAlign = itemAlign;
    var formatter = legendModel.get('formatter');
    var content = name;

    if (typeof formatter === 'string' && formatter) {
      content = formatter.replace('{name}', name != null ? name : '');
    } else if (typeof formatter === 'function') {
      content = formatter(name);
    }

    var inactiveColor = itemModel.get('inactiveColor');
    itemGroup.add(new graphic.Text({
      style: createTextStyle(textStyleModel, {
        text: content,
        x: textX,
        y: itemHeight / 2,
        fill: isSelected ? textStyleModel.getTextColor() : inactiveColor,
        align: textAlign,
        verticalAlign: 'middle'
      })
    })); // Add a invisible rect to increase the area of mouse hover

    var hitRect = new graphic.Rect({
      shape: itemGroup.getBoundingRect(),
      invisible: true
    });
    var tooltipModel = itemModel.getModel('tooltip');

    if (tooltipModel.get('show')) {
      graphic.setTooltipConfig({
        el: hitRect,
        componentModel: legendModel,
        itemName: name,
        itemTooltipOption: tooltipModel.option
      });
    }

    itemGroup.add(hitRect);
    itemGroup.eachChild(function (child) {
      child.silent = true;
    });
    hitRect.silent = !selectMode;
    this.getContentGroup().add(itemGroup);
    enableHoverEmphasis(itemGroup); // @ts-ignore

    itemGroup.__legendDataIndex = dataIndex;
    return itemGroup;
  };

  LegendView.prototype.layoutInner = function (legendModel, itemAlign, maxSize, isFirstRender, selector, selectorPosition) {
    var contentGroup = this.getContentGroup();
    var selectorGroup = this.getSelectorGroup(); // Place items in contentGroup.

    layoutUtil.box(legendModel.get('orient'), contentGroup, legendModel.get('itemGap'), maxSize.width, maxSize.height);
    var contentRect = contentGroup.getBoundingRect();
    var contentPos = [-contentRect.x, -contentRect.y];
    selectorGroup.markRedraw();
    contentGroup.markRedraw();

    if (selector) {
      // Place buttons in selectorGroup
      layoutUtil.box( // Buttons in selectorGroup always layout horizontally
      'horizontal', selectorGroup, legendModel.get('selectorItemGap', true));
      var selectorRect = selectorGroup.getBoundingRect();
      var selectorPos = [-selectorRect.x, -selectorRect.y];
      var selectorButtonGap = legendModel.get('selectorButtonGap', true);
      var orientIdx = legendModel.getOrient().index;
      var wh = orientIdx === 0 ? 'width' : 'height';
      var hw = orientIdx === 0 ? 'height' : 'width';
      var yx = orientIdx === 0 ? 'y' : 'x';

      if (selectorPosition === 'end') {
        selectorPos[orientIdx] += contentRect[wh] + selectorButtonGap;
      } else {
        contentPos[orientIdx] += selectorRect[wh] + selectorButtonGap;
      } //Always align selector to content as 'middle'


      selectorPos[1 - orientIdx] += contentRect[hw] / 2 - selectorRect[hw] / 2;
      selectorGroup.x = selectorPos[0];
      selectorGroup.y = selectorPos[1];
      contentGroup.x = contentPos[0];
      contentGroup.y = contentPos[1];
      var mainRect = {
        x: 0,
        y: 0
      };
      mainRect[wh] = contentRect[wh] + selectorButtonGap + selectorRect[wh];
      mainRect[hw] = Math.max(contentRect[hw], selectorRect[hw]);
      mainRect[yx] = Math.min(0, selectorRect[yx] + selectorPos[1 - orientIdx]);
      return mainRect;
    } else {
      contentGroup.x = contentPos[0];
      contentGroup.y = contentPos[1];
      return this.group.getBoundingRect();
    }
  };
  /**
   * @protected
   */


  LegendView.prototype.remove = function () {
    this.getContentGroup().removeAll();
    this._isFirstRender = true;
  };

  LegendView.type = 'legend.plain';
  return LegendView;
}(ComponentView);

function getLegendStyle(symbolType, legendModel, legendLineStyle, lineVisualStyle, itemVisualStyle, drawType, isSelected) {
  /**
   * Use series style if is inherit;
   * elsewise, use legend style
   */
  // itemStyle
  var legendItemModel = legendModel.getModel('itemStyle');
  var itemProperties = ITEM_STYLE_KEY_MAP.concat([['decal']]);
  var itemStyle = {};

  for (var i = 0; i < itemProperties.length; ++i) {
    var propName = itemProperties[i][itemProperties[i].length - 1];
    var visualName = itemProperties[i][0];
    var value = legendItemModel.getShallow(propName);

    if (value === 'inherit') {
      switch (visualName) {
        case 'fill':
          /**
           * Series with visualDrawType as 'stroke' should have
           * series stroke as legend fill
           */
          itemStyle.fill = itemVisualStyle[drawType];
          break;

        case 'stroke':
          /**
           * symbol type with "emptyXXX" should use fill color
           * in visual style
           */
          itemStyle.stroke = itemVisualStyle[symbolType.startsWith('empty') ? 'fill' : 'stroke'];
          break;

        case 'opacity':
          /**
           * Use lineStyle.opacity if drawType is stroke
           */
          itemStyle.opacity = (drawType === 'fill' ? itemVisualStyle : lineVisualStyle).opacity;
          break;

        default:
          itemStyle[visualName] = itemVisualStyle[visualName];
      }
    } else if (value === 'auto' && visualName === 'lineWidth') {
      // If lineStyle.width is 'auto', it is set to be 2 if series has border
      itemStyle.lineWidth = itemVisualStyle.lineWidth > 0 ? 2 : 0;
    } else {
      itemStyle[visualName] = value;
    }
  } // lineStyle


  var legendLineModel = legendModel.getModel('lineStyle');
  var lineProperties = LINE_STYLE_KEY_MAP.concat([['inactiveColor'], ['inactiveWidth']]);
  var lineStyle = {};

  for (var i = 0; i < lineProperties.length; ++i) {
    var propName = lineProperties[i][1];
    var visualName = lineProperties[i][0];
    var value = legendLineModel.getShallow(propName);

    if (value === 'inherit') {
      lineStyle[visualName] = lineVisualStyle[visualName];
    } else if (value === 'auto' && visualName === 'lineWidth') {
      // If lineStyle.width is 'auto', it is set to be 2 if series has border
      lineStyle.lineWidth = lineVisualStyle.lineWidth > 0 ? 2 : 0;
    } else {
      lineStyle[visualName] = value;
    }
  } // Fix auto color to real color


  itemStyle.fill === 'auto' && (itemStyle.fill = itemVisualStyle.fill);
  itemStyle.stroke === 'auto' && (itemStyle.stroke = itemVisualStyle.fill);
  lineStyle.stroke === 'auto' && (lineStyle.stroke = itemVisualStyle.fill);

  if (!isSelected) {
    var borderWidth = legendModel.get('inactiveBorderWidth');
    /**
     * Since stroke is set to be inactiveBorderColor, it may occur that
     * there is no border in series but border in legend, so we need to
     * use border only when series has border if is set to be auto
     */

    var visualHasBorder = itemStyle[symbolType.indexOf('empty') > -1 ? 'fill' : 'stroke'];
    itemStyle.lineWidth = borderWidth === 'auto' ? itemVisualStyle.lineWidth > 0 && visualHasBorder ? 2 : 0 : itemStyle.lineWidth;
    itemStyle.fill = legendModel.get('inactiveColor');
    itemStyle.stroke = legendModel.get('inactiveBorderColor');
    lineStyle.stroke = legendLineStyle.get('inactiveColor');
    lineStyle.lineWidth = legendLineStyle.get('inactiveWidth');
  }

  return {
    itemStyle: itemStyle,
    lineStyle: lineStyle
  };
}

function getDefaultLegendIcon(opt) {
  var symboType = opt.symbolType || 'roundRect';
  var symbol = createSymbol(symboType, 0, 0, opt.itemWidth, opt.itemHeight, opt.itemStyle.fill, opt.symbolKeepAspect);
  symbol.setStyle(opt.itemStyle);

  if (symboType.indexOf('empty') > -1) {
    symbol.style.stroke = symbol.style.fill;
    symbol.style.fill = '#fff';
    symbol.style.lineWidth = 2;
  }

  return symbol;
}

function dispatchSelectAction(seriesName, dataName, api, excludeSeriesId) {
  // downplay before unselect
  dispatchDownplayAction(seriesName, dataName, api, excludeSeriesId);
  api.dispatchAction({
    type: 'legendToggleSelect',
    name: seriesName != null ? seriesName : dataName
  }); // highlight after select
  // TODO higlight immediately may cause animation loss.

  dispatchHighlightAction(seriesName, dataName, api, excludeSeriesId);
}

function isUseHoverLayer(api) {
  var list = api.getZr().storage.getDisplayList();
  var emphasisState;
  var i = 0;
  var len = list.length;

  while (i < len && !(emphasisState = list[i].states.emphasis)) {
    i++;
  }

  return emphasisState && emphasisState.hoverLayer;
}

function dispatchHighlightAction(seriesName, dataName, api, excludeSeriesId) {
  // If element hover will move to a hoverLayer.
  if (!isUseHoverLayer(api)) {
    api.dispatchAction({
      type: 'highlight',
      seriesName: seriesName,
      name: dataName,
      excludeSeriesId: excludeSeriesId
    });
  }
}

function dispatchDownplayAction(seriesName, dataName, api, excludeSeriesId) {
  // If element hover will move to a hoverLayer.
  if (!isUseHoverLayer(api)) {
    api.dispatchAction({
      type: 'downplay',
      seriesName: seriesName,
      name: dataName,
      excludeSeriesId: excludeSeriesId
    });
  }
}

export default LegendView;