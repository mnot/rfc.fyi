import List from '../../data/List';
import Graph from '../../data/Graph';
import { OptionSourceDataOriginal, GraphEdgeItemObject, OptionDataValue, OptionDataItemObject } from '../../util/types';
import SeriesModel from '../../model/Series';
export default function createGraphFromNodeEdge(nodes: OptionSourceDataOriginal<OptionDataValue, OptionDataItemObject<OptionDataValue>>, edges: OptionSourceDataOriginal<OptionDataValue, GraphEdgeItemObject<OptionDataValue>>, seriesModel: SeriesModel, directed: boolean, beforeLink: (nodeData: List, edgeData: List) => void): Graph;
