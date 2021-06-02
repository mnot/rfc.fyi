
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

/* global Float32Array */
import { map } from 'zrender/lib/core/util';
import createRenderPlanner from '../chart/helper/createRenderPlanner';
import { isDimensionStacked } from '../data/helper/dataStackHelper';
import { createFloat32Array } from '../util/vendor';
export default function pointsLayout(seriesType, forceStoreInTypedArray) {
  return {
    seriesType: seriesType,
    plan: createRenderPlanner(),
    reset: function (seriesModel) {
      var data = seriesModel.getData();
      var coordSys = seriesModel.coordinateSystem;
      var pipelineContext = seriesModel.pipelineContext;
      var useTypedArray = forceStoreInTypedArray || pipelineContext.large;

      if (!coordSys) {
        return;
      }

      var dims = map(coordSys.dimensions, function (dim) {
        return data.mapDimension(dim);
      }).slice(0, 2);
      var dimLen = dims.length;
      var stackResultDim = data.getCalculationInfo('stackResultDimension');

      if (isDimensionStacked(data, dims[0]
      /*, dims[1]*/
      )) {
        dims[0] = stackResultDim;
      }

      if (isDimensionStacked(data, dims[1]
      /*, dims[0]*/
      )) {
        dims[1] = stackResultDim;
      }

      var dimInfo0 = data.getDimensionInfo(dims[0]);
      var dimInfo1 = data.getDimensionInfo(dims[1]);
      var dimIdx0 = dimInfo0 && dimInfo0.index;
      var dimIdx1 = dimInfo1 && dimInfo1.index;
      return dimLen && {
        progress: function (params, data) {
          var segCount = params.end - params.start;
          var points = useTypedArray && createFloat32Array(segCount * dimLen);
          var tmpIn = [];
          var tmpOut = [];

          for (var i = params.start, offset = 0; i < params.end; i++) {
            var point = void 0;

            if (dimLen === 1) {
              var x = data.getByDimIdx(dimIdx0, i); // NOTE: Make sure the second parameter is null to use default strategy.

              point = coordSys.dataToPoint(x, null, tmpOut);
            } else {
              tmpIn[0] = data.getByDimIdx(dimIdx0, i);
              tmpIn[1] = data.getByDimIdx(dimIdx1, i); // Let coordinate system to handle the NaN data.

              point = coordSys.dataToPoint(tmpIn, null, tmpOut);
            }

            if (useTypedArray) {
              points[offset++] = point[0];
              points[offset++] = point[1];
            } else {
              data.setItemLayout(i, point.slice());
            }
          }

          useTypedArray && data.setLayout('points', points);
        }
      };
    }
  };
}
;