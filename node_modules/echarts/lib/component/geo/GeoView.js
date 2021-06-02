
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
import MapDraw from '../helper/MapDraw';
import ComponentView from '../../view/Component';
import { getECData } from '../../util/innerStore';
import { findEventDispatcher } from '../../util/event';

var GeoView =
/** @class */
function (_super) {
  __extends(GeoView, _super);

  function GeoView() {
    var _this = _super !== null && _super.apply(this, arguments) || this;

    _this.type = GeoView.type;
    _this.focusBlurEnabled = true;
    return _this;
  }

  GeoView.prototype.init = function (ecModel, api) {
    var mapDraw = new MapDraw(api);
    this._mapDraw = mapDraw;
    this.group.add(mapDraw.group);
    this._api = api;
  };

  GeoView.prototype.render = function (geoModel, ecModel, api, payload) {
    var mapDraw = this._mapDraw;

    if (geoModel.get('show')) {
      mapDraw.draw(geoModel, ecModel, api, this, payload);
    } else {
      this._mapDraw.group.removeAll();
    }

    mapDraw.group.on('click', this._handleRegionClick, this);
    mapDraw.group.silent = geoModel.get('silent');
    this._model = geoModel;
    this.updateSelectStatus(geoModel, ecModel, api);
  };

  GeoView.prototype._handleRegionClick = function (e) {
    var eventData;
    findEventDispatcher(e.target, function (current) {
      return (eventData = getECData(current).eventData) != null;
    }, true);

    if (eventData) {
      this._api.dispatchAction({
        type: 'geoToggleSelect',
        geoId: this._model.id,
        name: eventData.name
      });
    }
  };

  GeoView.prototype.updateSelectStatus = function (model, ecModel, api) {
    var _this = this;

    this._mapDraw.group.traverse(function (node) {
      var eventData = getECData(node).eventData;

      if (eventData) {
        _this._model.isSelected(eventData.name) ? api.enterSelect(node) : api.leaveSelect(node); // No need to traverse children.

        return true;
      }
    });
  };

  GeoView.prototype.findHighDownDispatchers = function (name) {
    return this._mapDraw && this._mapDraw.findHighDownDispatchers(name, this._model);
  };

  GeoView.prototype.dispose = function () {
    this._mapDraw && this._mapDraw.remove();
  };

  GeoView.type = 'geo';
  return GeoView;
}(ComponentView);

export default GeoView;