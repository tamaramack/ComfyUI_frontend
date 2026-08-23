import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LGraphNode, LiteGraph } from '@/lib/litegraph/src/litegraph'
import type { ISerialisedNode } from '@/lib/litegraph/src/types/serialisation'
import type { TWidgetValue } from '@/lib/litegraph/src/types/widgets'

import { computeLegacyWidgetShadow } from './utils/namedValuesShadowDiff'

/**
 * Regression tests for #15669.
 *
 * `widgets_values` is positionally aligned to `LGraphNode.widgets`:
 * `serialize()` writes each value at the widget's index in the full widget
 * array, so a widget with `serialize === false` leaves a slot that JSON
 * materialises as `null`. The indexed restore path in `configure()` read the
 * array back with a compacted counter instead, shifting every value that
 * followed a non-serialised widget by one slot per skipped widget.
 */
describe('LGraphNode widgets_values index alignment (#15669)', () => {
  let namedValuesRestore: boolean

  beforeEach(() => {
    namedValuesRestore = LiteGraph.namedValuesRestore
    // `Comfy.Workflow.NamedValuesRestore` ships `defaultValue: false`, so the
    // indexed path below is the production default.
    LiteGraph.namedValuesRestore = false
  })

  afterEach(() => {
    LiteGraph.namedValuesRestore = namedValuesRestore
  })

  /** steps, a non-serialised button, then seed. */
  function makeNode(): LGraphNode {
    const node = new LGraphNode('TestNode')
    node.serialize_widgets = true
    node.addWidget('number', 'steps', 30, () => {}, {})
    const hidden = node.addWidget('button', 'action', 'Click', () => {}, {})
    hidden.serialize = false
    node.addWidget('number', 'seed', 12345, () => {}, {})
    return node
  }

  it('preserves values after a non-serialised widget across a save/load round trip', () => {
    const saved = JSON.parse(
      JSON.stringify(makeNode().serialize())
    ) as ISerialisedNode

    const reloaded = makeNode()
    reloaded.widgets![0].value = 0
    reloaded.widgets![2].value = 0
    reloaded.configure(saved)

    expect(reloaded.widgets![0].value).toBe(30)
    expect(reloaded.widgets![1].value).toBe('Click')
    expect(reloaded.widgets![2].value).toBe(12345)
  })

  it('restores from the on-disk full-index payload written by serialize()', () => {
    const node = makeNode()
    node.widgets![0].value = 0
    node.widgets![2].value = 0

    node.configure({
      id: 1,
      type: 'TestNode',
      pos: [0, 0],
      size: [200, 100],
      flags: {},
      order: 0,
      mode: 0,
      // Exactly what `serialize()` emits for this node once JSON-encoded: the
      // skipped widget holds its slot as `null`. `TWidgetValue` does not admit
      // `null`, so the on-disk shape has to be cast in.
      widgets_values: [30, null, 12345] as unknown as TWidgetValue[]
    })

    expect(node.widgets!.map((w) => w.value)).toStrictEqual([
      30,
      'Click',
      12345
    ])
  })

  it('computeLegacyWidgetShadow maps the same slots as the indexed restore', () => {
    const shadow = computeLegacyWidgetShadow(makeNode().widgets!, [
      30,
      null,
      12345
    ])

    expect(shadow).toEqual([
      { widgetIndex: 0, name: 'steps', value: 30 },
      { widgetIndex: 2, name: 'seed', value: 12345 }
    ])
  })
})
