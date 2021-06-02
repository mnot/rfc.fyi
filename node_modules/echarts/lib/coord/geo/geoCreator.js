
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
import Geo from './Geo';
import * as layout from '../../util/layout';
import * as numberUtil from '../../util/number';
import geoSourceManager from './geoSourceManager';
/**
 * Resize method bound to the geo
 */

function resizeGeo(geoModel, api) {
  var boundingCoords = geoModel.get('boundingCoords');

  if (boundingCoords != null) {
    var leftTop = boundingCoords[0];
    var rightBottom = boundingCoords[1];

    if (isNaN(leftTop[0]) || isNaN(leftTop[1]) || isNaN(rightBottom[0]) || isNaN(rightBottom[1])) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Invalid boundingCoords');
      }
    } else {
      this.setBoundingRect(leftTop[0], leftTop[1], rightBottom[0] - leftTop[0], rightBottom[1] - leftTop[1]);
    }
  }

  var rect = this.getBoundingRect();
  var centerOption = geoModel.get('layoutCenter');
  var sizeOption = geoModel.get('layoutSize');
  var viewWidth = api.getWidth();
  var viewHeight = api.getHeight();
  var aspect = rect.width / rect.height * this.aspectScale;
  var useCenterAndSize = false;
  var center;
  var size;

  if (centerOption && sizeOption) {
    center = [numberUtil.parsePercent(centerOption[0], viewWidth), numberUtil.parsePercent(centerOption[1], viewHeight)];
    size = numberUtil.parsePercent(sizeOption, Math.min(viewWidth, viewHeight));

    if (!isNaN(center[0]) && !isNaN(center[1]) && !isNaN(size)) {
      useCenterAndSize = true;
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Given layoutCenter or layoutSize data are invalid. Use left/top/width/height instead.');
      }
    }
  }

  var viewRect;

  if (useCenterAndSize) {
    viewRect = {};

    if (aspect > 1) {
      // Width is same with size
      viewRect.width = size;
      viewRect.height = size / aspect;
    } else {
      viewRect.height = size;
      viewRect.width = size * aspect;
    }

    viewRect.y = center[1] - viewRect.height / 2;
    viewRect.x = center[0] - viewRect.width / 2;
  } else {
    // Use left/top/width/height
    var boxLayoutOption = geoModel.getBoxLayoutParams();
    boxLayoutOption.aspect = aspect;
    viewRect = layout.getLayoutRect(boxLayoutOption, {
      width: viewWidth,
      height: viewHeight
    });
  }

  this.setViewRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
  this.setCenter(geoModel.get('center'));
  this.setZoom(geoModel.get('zoom'));
} // Back compat for ECharts2, where the coord map is set on map series:
// {type: 'map', geoCoord: {'cityA': [116.46,39.92], 'cityA': [119.12,24.61]}},


function setGeoCoords(geo, model) {
  zrUtil.each(model.get('geoCoord'), function (geoCoord, name) {
    geo.addGeoCoord(name, geoCoord);
  });
}

var GeoCreator =
/** @class */
function () {
  function GeoCreator() {
    // For deciding which dimensions to use when creating list data
    this.dimensions = Geo.prototype.dimensions;
  }

  GeoCreator.prototype.create = function (ecModel, api) {
    var geoList = []; // FIXME Create each time may be slow

    ecModel.eachComponent('geo', function (geoModel, idx) {
      var name = geoModel.get('map');
      var geo = new Geo(name + idx, name, {
        nameMap: geoModel.get('nameMap'),
        nameProperty: geoModel.get('nameProperty'),
        aspectScale: geoModel.get('aspectScale')
      });
      geo.zoomLimit = geoModel.get('scaleLimit');
      geoList.push(geo); // setGeoCoords(geo, geoModel);

      geoModel.coordinateSystem = geo;
      geo.model = geoModel; // Inject resize method

      geo.resize = resizeGeo;
      geo.resize(geoModel, api);
    });
    ecModel.eachSeries(function (seriesModel) {
      var coordSys = seriesModel.get('coordinateSystem');

      if (coordSys === 'geo') {
        var geoIndex = seriesModel.get('geoIndex') || 0;
        seriesModel.coordinateSystem = geoList[geoIndex];
      }
    }); // If has map series

    var mapModelGroupBySeries = {};
    ecModel.eachSeriesByType('map', function (seriesModel) {
      if (!seriesModel.getHostGeoModel()) {
        var mapType = seriesModel.getMapType();
        mapModelGroupBySeries[mapType] = mapModelGroupBySeries[mapType] || [];
        mapModelGroupBySeries[mapType].push(seriesModel);
      }
    });
    zrUtil.each(mapModelGroupBySeries, function (mapSeries, mapType) {
      var nameMapList = zrUtil.map(mapSeries, function (singleMapSeries) {
        return singleMapSeries.get('nameMap');
      });
      var geo = new Geo(mapType, mapType, {
        nameMap: zrUtil.mergeAll(nameMapList),
        nameProperty: mapSeries[0].get('nameProperty'),
        aspectScale: mapSeries[0].get('aspectScale')
      });
      geo.zoomLimit = zrUtil.retrieve.apply(null, zrUtil.map(mapSeries, function (singleMapSeries) {
        return singleMapSeries.get('scaleLimit');
      }));
      geoList.push(geo); // Inject resize method

      geo.resize = resizeGeo;
      geo.resize(mapSeries[0], api);
      zrUtil.each(mapSeries, function (singleMapSeries) {
        singleMapSeries.coordinateSystem = geo;
        setGeoCoords(geo, singleMapSeries);
      });
    });
    return geoList;
  };
  /**
   * Fill given regions array
   */


  GeoCreator.prototype.getFilledRegions = function (originRegionArr, mapName, nameMap, nameProperty) {
    // Not use the original
    var regionsArr = (originRegionArr || []).slice();
    var dataNameMap = zrUtil.createHashMap();

    for (var i = 0; i < regionsArr.length; i++) {
      dataNameMap.set(regionsArr[i].name, regionsArr[i]);
    }

    var source = geoSourceManager.load(mapName, nameMap, nameProperty);
    zrUtil.each(source.regions, function (region) {
      var name = region.name;
      !dataNameMap.get(name) && regionsArr.push({
        name: name
      });
    });
    return regionsArr;
  };

  return GeoCreator;
}();

var geoCreator = new GeoCreator();
export default geoCreator;