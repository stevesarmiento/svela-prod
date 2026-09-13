// Run with bun Reference/generate-fixtures.ts from this package directory.
// Expected values come from the pinned, unmodified upstream math modules beside this file.
import { writeFileSync } from 'node:fs'
import { drawSpline } from './spline'
import { lerp } from './lerp'
import { computeRange } from './range'
import { detectMomentum } from './momentum'
import { niceTimeInterval } from './intervals'
import { loadingY } from './loadingShape'
const datasets = [
  [[0, 10], [1, 11], [2, 14], [3, 12], [4, 12], [8, 18]],
  [[0, 0.0000001], [5, 0.00000012], [11, 0.00000008], [19, 0.00000015]],
  [[0, 5], [2, 5], [3, 5]],
  [[0, -3], [1, -1], [7, -2], [10, 5]],
  [[0, 1], [1, 100], [2, 101], [3, 101.1]],
]
const curves = datasets.map(points => {
  const segments: number[][] = []
  drawSpline({ bezierCurveTo: (...values: number[]) => segments.push(values), lineTo: () => {} } as any, points as any)
  return { points, segments, samples: segments.flatMap((c, i) => [0.25, 0.5, 0.75].map(t => {
    const a = points[i], b = points[i + 1], u = 1-t
    return { time: a[0] + (b[0]-a[0])*t, value: u*u*u*a[1] + 3*u*u*t*c[1] + 3*u*t*t*c[3] + t*t*t*b[1] }
  })), range: computeRange(points.map(([time,value])=>({time,value})), points.at(-1)![1]), momentum: detectMomentum(points.map(([time,value])=>({time,value}))) }
})
const schedules = [30,60,120].map(hz => {
  let value=0
  for(let i=0;i<hz;i++) value=lerp(value,100,0.08,1000/hz)
  return {hz,value}
})
const fixture = { upstream: '069899598a11e00094ea1eb6b838404825f828be', curves, schedules,
  intervals: [10,30,60,600,3600,86400,604800,31536000].map(window=>({window,value:niceTimeInterval(window)})),
  loading: [0,0.25,0.5,0.75,1].map(t=>({t,value:loadingY(t,0.5,0.07,1.2)})) }
writeFileSync(new URL('../Tests/AggrLivelineTests/Fixtures/upstream.json', import.meta.url), JSON.stringify(fixture,null,2)+'\n')
