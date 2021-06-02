
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
import * as zrUtil from 'zrender/lib/core/util';
import List from '../../data/List';
import createDimensions from '../../data/helper/createDimensions';
import { getDimensionTypeByAxis } from '../../data/helper/dimensionHelper';
import { getDataItemValue } from '../../util/model';
import CoordinateSystem from '../../core/CoordinateSystem';
import { getCoordSysInfoBySeries } from '../../model/referHelper';
import { createSourceFromSeriesDataOption, isSourceInstance } from '../../data/Source';
import { enableDataStack } from '../../data/helper/dataStackHelper';
import { makeSeriesEncodeForAxisCoordSys } from '../../data/helper/sourceHelper';
import { SOURCE_FORMAT_ORIGINAL } from '../../util/types';

function createListFromArray(source, seriesModel, opt) {
  opt = opt || {};

  if (!isSourceInstance(source)) {
    source = createSourceFromSeriesDataOption(source);
  }

  var coordSysName = seriesModel.get('coordinateSystem');
  var registeredCoordSys = CoordinateSystem.get(coordSysName);
  var coordSysInfo = getCoordSysInfoBySeries(seriesModel);
  var coordSysDimDefs;

  if (coordSysInfo && coordSysInfo.coordSysDims) {
    coordSysDimDefs = zrUtil.map(coordSysInfo.coordSysDims, function (dim) {
      var dimInfo = {
        name: dim
      };
      var axisModel = coordSysInfo.axisMap.get(dim);

      if (axisModel) {
        var axisType = axisModel.get('type');
        dimInfo.type = getDimensionTypeByAxis(axisType); // dimInfo.stackable = isStackable(axisType);
      }

      return dimInfo;
    });
  }

  if (!coordSysDimDefs) {
    // Get dimensions from registered coordinate system
    coordSysDimDefs = registeredCoordSys && (registeredCoordSys.getDimensionsInfo ? registeredCoordSys.getDimensionsInfo() : registeredCoordSys.dimensions.slice()) || ['x', 'y'];
  }

  var useEncodeDefaulter = opt.useEncodeDefaulter;
  var dimInfoList = createDimensions(source, {
    coordDimensions: coordSysDimDefs,
    generateCoord: opt.generateCoord,
    encodeDefaulter: zrUtil.isFunction(useEncodeDefaulter) ? useEncodeDefaulter : useEncodeDefaulter ? zrUtil.curry(makeSeriesEncodeForAxisCoordSys, coordSysDimDefs, seriesModel) : null
  });
  var firstCategoryDimIndex;
  var hasNameEncode;
  coordSysInfo && zrUtil.each(dimInfoList, function (dimInfo, dimIndex) {
    var coordDim = dimInfo.coordDim;
    var categoryAxisModel = coordSysInfo.categoryAxisMap.get(coordDim);

    if (categoryAxisModel) {
      if (firstCategoryDimIndex == null) {
        firstCategoryDimIndex = dimIndex;
      }

      dimInfo.ordinalMeta = categoryAxisModel.getOrdinalMeta();

      if (opt.createInvertedIndices) {
        dimInfo.createInvertedIndices = true;
      }
    }

    if (dimInfo.otherDims.itemName != null) {
      hasNameEncode = true;
    }
  });

  if (!hasNameEncode && firstCategoryDimIndex != null) {
    dimInfoList[firstCategoryDimIndex].otherDims.itemName = 0;
  }

  var stackCalculationInfo = enableDataStack(seriesModel, dimInfoList);
  var list = new List(dimInfoList, seriesModel);
  list.setCalculationInfo(stackCalculationInfo);
  var dimValueGetter = firstCategoryDimIndex != null && isNeedCompleteOrdinalData(source) ? function (itemOpt, dimName, dataIndex, dimIndex) {
    // Use dataIndex as ordinal value in categoryAxis
    return dimIndex === firstCategoryDimIndex ? dataIndex : this.defaultDimValueGetter(itemOpt, dimName, dataIndex, dimIndex);
  } : null;
  list.hasItemOption = false;
  list.initData(source, null, dimValueGetter);
  return list;
}

function isNeedCompleteOrdinalData(source) {
  if (source.sourceFormat === SOURCE_FORMAT_ORIGINAL) {
    var sampleItem = firstDataNotNull(source.data || []);
    return sampleItem != null && !zrUtil.isArray(getDataItemValue(sampleItem));
  }
}

function firstDataNotNull(data) {
  var i = 0;

  while (i < data.length && data[i] == null) {
    i++;
  }

  return data[i];
}

export default createListFromArray;