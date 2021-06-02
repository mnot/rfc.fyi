
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
import * as graphic from '../../util/graphic';
import { enableHoverEmphasis } from '../../util/states';

var Polyline =
/** @class */
function (_super) {
  __extends(Polyline, _super);

  function Polyline(lineData, idx, seriesScope) {
    var _this = _super.call(this) || this;

    _this._createPolyline(lineData, idx, seriesScope);

    return _this;
  }

  Polyline.prototype._createPolyline = function (lineData, idx, seriesScope) {
    // let seriesModel = lineData.hostModel;
    var points = lineData.getItemLayout(idx);
    var line = new graphic.Polyline({
      shape: {
        points: points
      }
    });
    this.add(line);

    this._updateCommonStl(lineData, idx, seriesScope);
  };

  ;

  Polyline.prototype.updateData = function (lineData, idx, seriesScope) {
    var seriesModel = lineData.hostModel;
    var line = this.childAt(0);
    var target = {
      shape: {
        points: lineData.getItemLayout(idx)
      }
    };
    graphic.updateProps(line, target, seriesModel, idx);

    this._updateCommonStl(lineData, idx, seriesScope);
  };

  ;

  Polyline.prototype._updateCommonStl = function (lineData, idx, seriesScope) {
    var line = this.childAt(0);
    var itemModel = lineData.getItemModel(idx);
    var hoverLineStyle = seriesScope && seriesScope.emphasisLineStyle;

    if (!seriesScope || lineData.hasItemOption) {
      hoverLineStyle = itemModel.getModel(['emphasis', 'lineStyle']).getLineStyle();
    }

    line.useStyle(lineData.getItemVisual(idx, 'style'));
    line.style.fill = null;
    line.style.strokeNoScale = true;
    var lineEmphasisState = line.ensureState('emphasis');
    lineEmphasisState.style = hoverLineStyle;
    enableHoverEmphasis(this);
  };

  ;

  Polyline.prototype.updateLayout = function (lineData, idx) {
    var polyline = this.childAt(0);
    polyline.setShape('points', lineData.getItemLayout(idx));
  };

  ;
  return Polyline;
}(graphic.Group);

export default Polyline;