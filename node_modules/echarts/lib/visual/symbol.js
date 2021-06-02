
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
import { isFunction } from 'zrender/lib/core/util'; // Encoding visual for all series include which is filtered for legend drawing

var seriesSymbolTask = {
  createOnAllSeries: true,
  // For legend.
  performRawSeries: true,
  reset: function (seriesModel, ecModel) {
    var data = seriesModel.getData();

    if (seriesModel.legendSymbol) {
      data.setVisual('legendSymbol', seriesModel.legendSymbol);
    }

    if (!seriesModel.hasSymbolVisual) {
      return;
    }

    var symbolType = seriesModel.get('symbol');
    var symbolSize = seriesModel.get('symbolSize');
    var keepAspect = seriesModel.get('symbolKeepAspect');
    var symbolRotate = seriesModel.get('symbolRotate');
    var symbolOffset = seriesModel.get('symbolOffset');
    var hasSymbolTypeCallback = isFunction(symbolType);
    var hasSymbolSizeCallback = isFunction(symbolSize);
    var hasSymbolRotateCallback = isFunction(symbolRotate);
    var hasSymbolOffsetCallback = isFunction(symbolOffset);
    var hasCallback = hasSymbolTypeCallback || hasSymbolSizeCallback || hasSymbolRotateCallback || hasSymbolOffsetCallback;
    var seriesSymbol = !hasSymbolTypeCallback && symbolType ? symbolType : seriesModel.defaultSymbol;
    var seriesSymbolSize = !hasSymbolSizeCallback ? symbolSize : null;
    var seriesSymbolRotate = !hasSymbolRotateCallback ? symbolRotate : null;
    var seriesSymbolOffset = !hasSymbolOffsetCallback ? symbolOffset : null;
    data.setVisual({
      legendSymbol: seriesModel.legendSymbol || seriesSymbol,
      // If seting callback functions on `symbol` or `symbolSize`, for simplicity and avoiding
      // to bring trouble, we do not pick a reuslt from one of its calling on data item here,
      // but just use the default value. Callback on `symbol` or `symbolSize` is convenient in
      // some cases but generally it is not recommanded.
      symbol: seriesSymbol,
      symbolSize: seriesSymbolSize,
      symbolKeepAspect: keepAspect,
      symbolRotate: seriesSymbolRotate,
      symbolOffset: seriesSymbolOffset
    }); // Only visible series has each data be visual encoded

    if (ecModel.isSeriesFiltered(seriesModel)) {
      return;
    }

    function dataEach(data, idx) {
      var rawValue = seriesModel.getRawValue(idx);
      var params = seriesModel.getDataParams(idx);
      hasSymbolTypeCallback && data.setItemVisual(idx, 'symbol', symbolType(rawValue, params));
      hasSymbolSizeCallback && data.setItemVisual(idx, 'symbolSize', symbolSize(rawValue, params));
      hasSymbolRotateCallback && data.setItemVisual(idx, 'symbolRotate', symbolRotate(rawValue, params));
      hasSymbolOffsetCallback && data.setItemVisual(idx, 'symbolOffset', symbolOffset(rawValue, params));
    }

    return {
      dataEach: hasCallback ? dataEach : null
    };
  }
};
var dataSymbolTask = {
  createOnAllSeries: true,
  // For legend.
  performRawSeries: true,
  reset: function (seriesModel, ecModel) {
    if (!seriesModel.hasSymbolVisual) {
      return;
    } // Only visible series has each data be visual encoded


    if (ecModel.isSeriesFiltered(seriesModel)) {
      return;
    }

    var data = seriesModel.getData();

    function dataEach(data, idx) {
      var itemModel = data.getItemModel(idx);
      var itemSymbolType = itemModel.getShallow('symbol', true);
      var itemSymbolSize = itemModel.getShallow('symbolSize', true);
      var itemSymbolRotate = itemModel.getShallow('symbolRotate', true);
      var itemSymbolOffset = itemModel.getShallow('symbolOffset', true);
      var itemSymbolKeepAspect = itemModel.getShallow('symbolKeepAspect', true); // If has item symbol

      if (itemSymbolType != null) {
        data.setItemVisual(idx, 'symbol', itemSymbolType);
      }

      if (itemSymbolSize != null) {
        // PENDING Transform symbolSize ?
        data.setItemVisual(idx, 'symbolSize', itemSymbolSize);
      }

      if (itemSymbolRotate != null) {
        data.setItemVisual(idx, 'symbolRotate', itemSymbolRotate);
      }

      if (itemSymbolOffset != null) {
        data.setItemVisual(idx, 'symbolOffset', itemSymbolOffset);
      }

      if (itemSymbolKeepAspect != null) {
        data.setItemVisual(idx, 'symbolKeepAspect', itemSymbolKeepAspect);
      }
    }

    return {
      dataEach: data.hasItemOption ? dataEach : null
    };
  }
};
export { seriesSymbolTask, dataSymbolTask };