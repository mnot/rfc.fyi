
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
import BoundingRect from 'zrender/lib/core/BoundingRect';
import View from '../View';
import geoSourceManager from './geoSourceManager';
import { SINGLE_REFERRING } from '../../util/model';
var GEO_DEFAULT_PARAMS = {
  'geoJSON': {
    aspectScale: 0.75,
    invertLongitute: true
  },
  'geoSVG': {
    aspectScale: 1,
    invertLongitute: false
  }
};

var Geo =
/** @class */
function (_super) {
  __extends(Geo, _super);

  function Geo(name, map, opt) {
    var _this = _super.call(this, name) || this;

    _this.dimensions = ['lng', 'lat'];
    _this.type = 'geo'; // Only store specified name coord via `addGeoCoord`.

    _this._nameCoordMap = zrUtil.createHashMap();
    _this.map = map;
    var source = geoSourceManager.load(map, opt.nameMap, opt.nameProperty);
    var resource = geoSourceManager.getGeoResource(map);
    _this.resourceType = resource ? resource.type : null;
    var defaultParmas = GEO_DEFAULT_PARAMS[resource.type];
    _this._regionsMap = source.regionsMap;
    _this._invertLongitute = defaultParmas.invertLongitute;
    _this.regions = source.regions;
    _this.aspectScale = zrUtil.retrieve2(opt.aspectScale, defaultParmas.aspectScale);
    var boundingRect = source.boundingRect;

    _this.setBoundingRect(boundingRect.x, boundingRect.y, boundingRect.width, boundingRect.height);

    return _this;
  }
  /**
   * Whether contain the given [lng, lat] coord.
   */
  // Never used yet.
  // containCoord(coord: number[]) {
  //     const regions = this.regions;
  //     for (let i = 0; i < regions.length; i++) {
  //         const region = regions[i];
  //         if (region.type === 'geoJSON' && (region as GeoJSONRegion).contain(coord)) {
  //             return true;
  //         }
  //     }
  //     return false;
  // }


  Geo.prototype._transformTo = function (x, y, width, height) {
    var rect = this.getBoundingRect();
    var invertLongitute = this._invertLongitute;
    rect = rect.clone();

    if (invertLongitute) {
      // Longitute is inverted
      rect.y = -rect.y - rect.height;
    }

    var rawTransformable = this._rawTransformable;
    rawTransformable.transform = rect.calculateTransform(new BoundingRect(x, y, width, height));
    var rawParent = rawTransformable.parent;
    rawTransformable.parent = null;
    rawTransformable.decomposeTransform();
    rawTransformable.parent = rawParent;

    if (invertLongitute) {
      rawTransformable.scaleY = -rawTransformable.scaleY;
    }

    this._updateTransform();
  };

  Geo.prototype.getRegion = function (name) {
    return this._regionsMap.get(name);
  };

  Geo.prototype.getRegionByCoord = function (coord) {
    var regions = this.regions;

    for (var i = 0; i < regions.length; i++) {
      var region = regions[i];

      if (region.type === 'geoJSON' && region.contain(coord)) {
        return regions[i];
      }
    }
  };
  /**
   * Add geoCoord for indexing by name
   */


  Geo.prototype.addGeoCoord = function (name, geoCoord) {
    this._nameCoordMap.set(name, geoCoord);
  };
  /**
   * Get geoCoord by name
   */


  Geo.prototype.getGeoCoord = function (name) {
    var region = this._regionsMap.get(name); // calcualte center only on demand.


    return this._nameCoordMap.get(name) || region && region.getCenter();
  };

  Geo.prototype.dataToPoint = function (data, noRoam, out) {
    if (typeof data === 'string') {
      // Map area name to geoCoord
      data = this.getGeoCoord(data);
    }

    if (data) {
      return View.prototype.dataToPoint.call(this, data, noRoam, out);
    }
  };

  Geo.prototype.convertToPixel = function (ecModel, finder, value) {
    var coordSys = getCoordSys(finder);
    return coordSys === this ? coordSys.dataToPoint(value) : null;
  };

  Geo.prototype.convertFromPixel = function (ecModel, finder, pixel) {
    var coordSys = getCoordSys(finder);
    return coordSys === this ? coordSys.pointToData(pixel) : null;
  };

  return Geo;
}(View);

;
zrUtil.mixin(Geo, View);

function getCoordSys(finder) {
  var geoModel = finder.geoModel;
  var seriesModel = finder.seriesModel;
  return geoModel ? geoModel.coordinateSystem : seriesModel ? seriesModel.coordinateSystem // For map series.
  || (seriesModel.getReferringComponents('geo', SINGLE_REFERRING).models[0] || {}).coordinateSystem : null;
}

export default Geo;