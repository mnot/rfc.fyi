import * as echarts from './node_modules/echarts/dist/echarts.esm.js'


export function graphRfcs (rfcList, rfcs, rfcRefs) {
  const nodes = new Set()
  const links = []
  const backRefs = new Map()
  rfcList.forEach(item => {
    const rfcNum = parseInt(item.substring(3))
    const rfcData = rfcs[item]
    const references = rfcRefs[rfcNum]
    nodes.add(item)
    if (!backRefs.has(item)) {
      backRefs.set(item, new Set())
    }
    if (references) {
      references.forEach(ref => {
        const refName = `RFC${ref}`
        if (rfcList.indexOf(refName) > -1) {
          nodes.add(refName)
          if (!backRefs.has(refName)) {
            backRefs.set(refName, new Set())
          }
          backRefs.set(refName, backRefs.get(refName).add(item))
          links.push({
            source: item,
            target: refName
          })
        }
      })
    }
  })
  const nodeList = []
  const wgs = []
  const nodeCount = Array.from(nodes).length
  const minSize = Math.max(3, Math.sqrt(4000 / nodeCount))
  console.log(minSize)
  nodes.forEach(node => {
    const wg = rfcs[node].wg || 'none'
    if (wgs.indexOf(wg) === -1) {
      wgs.push(wg)
    }
    nodeList.push(
      {
        name: node,
        symbol: 'circle',
        symbolSize: Math.max(minSize, Math.sqrt(backRefs.get(node).size * 8000 / nodeCount)),
        category: wgs.indexOf(wg),
        value: rfcs[node].title
      })
  })

  const categories = []
  wgs.forEach(wg => {
    categories.push({
      name: wg
    })
  })

  graph({
    nodes: nodeList,
    links: links,
    categories: categories
  })
}



function graph (data) {
  const chartDom = document.getElementById('graph')
  const myChart = echarts.init(chartDom)

  data.nodes.forEach(function (node) {
    node.label = {
      show: node.symbolSize > 15
    }
  })

  const option = {
  responsive: true,
  maintainAspectRatio: false,
    tooltip: {},
    legend: [{
      selectedMode: 'multiple',
      data: data.categories.map(function (a) {
        return a.name
      })
    }],
    animationDuration: 1000,
    animationEasingUpdate: 'quinticInOut',
    series: [
      {
        type: 'graph',
        layout: 'circular',
        force: {
          initLayout: "circular",
          gravity: 0.1,
          repulsion: [500, 1800],
          layoutAnimation: false
        },
        data: data.nodes,
        links: data.links,
        categories: data.categories,
        roam: false,
        label: {
          position: 'right',
          formatter: '{b}'
        },
        lineStyle: {
          color: 'source',
          curveness: 0.3
        },
        edgeSymbol: ['none', 'arrow'],
        symbolSize: [5],
        emphasis: {
          focus: 'adjacency',
          lineStyle: {
            width: 5
          }
        }
      }
    ]
  }

  myChart.setOption(option)

  option && myChart.setOption(option)

  myChart.on('click', function (params) {
      console.log(params);
  });
}
