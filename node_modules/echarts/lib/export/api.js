
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
// These APIs are for more advanced usages
// For example extend charts and components, creating graphic elements, formatting.
import ComponentModel from '../model/Component';
import ComponentView from '../view/Component';
import SeriesModel from '../model/Series';
import ChartView from '../view/Chart';
import * as zrender_1 from 'zrender/lib/zrender';
export { zrender_1 as zrender };
import * as matrix_1 from 'zrender/lib/core/matrix';
export { matrix_1 as matrix };
import * as vector_1 from 'zrender/lib/core/vector';
export { vector_1 as vector };
import * as zrUtil_1 from 'zrender/lib/core/util';
export { zrUtil_1 as zrUtil };
import * as color_1 from 'zrender/lib/tool/color';
export { color_1 as color };
export { throttle } from '../util/throttle';
import * as helper_1 from './api/helper';
export { helper_1 as helper };
export { use } from '../extension'; //////////////// Helper Methods /////////////////////

export { default as parseGeoJSON } from '../coord/geo/parseGeoJson';
export { default as parseGeoJson } from '../coord/geo/parseGeoJson';
import * as number_1 from './api/number';
export { number_1 as number };
import * as time_1 from './api/time';
export { time_1 as time };
import * as graphic_1 from './api/graphic';
export { graphic_1 as graphic };
import * as format_1 from './api/format';
export { format_1 as format };
import * as util_1 from './api/util';
export { util_1 as util };
export { default as env } from 'zrender/lib/core/env'; //////////////// Export for Exension Usage ////////////////

export { default as List } from '../data/List';
export { default as Model } from '../model/Model';
export { default as Axis } from '../coord/Axis';
export { ComponentModel, ComponentView, SeriesModel, ChartView }; // Only for GL

export { brushSingle as innerDrawElementOnCanvas } from 'zrender/lib/canvas/graphic'; //////////////// Deprecated Extension Methods ////////////////
// Should use `ComponentModel.extend` or `class XXXX extend ComponentModel` to create class.
// Then use `registerComponentModel` in `install` parameter when `use` this extension. For example:
// class Bar3DModel extends ComponentModel {}
// export function install(registers) { regsiters.registerComponentModel(Bar3DModel); }
// echarts.use(install);

export function extendComponentModel(proto) {
  var Model = ComponentModel.extend(proto);
  ComponentModel.registerClass(Model);
  return Model;
}
export function extendComponentView(proto) {
  var View = ComponentView.extend(proto);
  ComponentView.registerClass(View);
  return View;
}
export function extendSeriesModel(proto) {
  var Model = SeriesModel.extend(proto);
  SeriesModel.registerClass(Model);
  return Model;
}
export function extendChartView(proto) {
  var View = ChartView.extend(proto);
  ChartView.registerClass(View);
  return View;
}