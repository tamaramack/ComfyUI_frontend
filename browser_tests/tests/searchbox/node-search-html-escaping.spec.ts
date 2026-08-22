/**
 * QA test plan "cloud 1.50 → 1.51", Node Search Highlights (#14789): search
 * results must render HTML characters literally rather than as markup.
 *
 * The plan phrases this as "type a query containing HTML characters", but the
 * query itself never reaches the DOM — `highlightQuery()` only ever emits
 * slices of the node's display name, so the display name is the actual
 * injection point and is what this pins.
 *
 * `NodeSearchListItem.test.ts` already covers the escaping at the component
 * level. This is kept for the layer that unit test cannot reach: a node
 * definition travelling from `object_info` through the node-def store into the
 * v2 search dialog, where a raw `innerHTML` assignment anywhere along the way
 * would slip past both that test and the `v-html` lint ban.
 */
import { expect } from '@playwright/test'

import { comfyPageFixture as test } from '@e2e/fixtures/ComfyPage'
import {
  addNodeWithDisplayName,
  routeObjectInfoFromSetupApi
} from '@e2e/fixtures/utils/objectInfo'

const INJECTED_NODE_TYPE = 'HtmlEscapingProbeNode'
const SEARCH_TERM = 'HtmlEscapingProbe'
/** `onerror` fires the instant a browser parses this as markup, so a rendered payload cannot pass silently. */
const HTML_PAYLOAD = `${SEARCH_TERM} <img src=x onerror="window.__nodeSearchXss = true">`

test.describe('Node search HTML escaping', { tag: ['@node'] }, () => {
  test('renders a display name containing HTML as literal text', async ({
    comfyPage
  }) => {
    const unrouteObjectInfo = await routeObjectInfoFromSetupApi(
      comfyPage.page,
      (objectInfo) =>
        addNodeWithDisplayName(objectInfo, INJECTED_NODE_TYPE, HTML_PAYLOAD)
    )

    try {
      await comfyPage.searchBoxV2.ensureV2Search()
      // Reload so the node definition store boots from the patched object_info.
      await comfyPage.workflow.reloadAndWaitForApp()

      await comfyPage.searchBoxV2.open()
      await comfyPage.searchBoxV2.input.fill(SEARCH_TERM)

      const result = comfyPage.searchBoxV2.results
        .filter({ hasText: SEARCH_TERM })
        .first()
      await expect(result).toBeVisible()

      // `toContainText` compares rendered text, so anything parsed as markup
      // would have been stripped out of it.
      await expect(result).toContainText(HTML_PAYLOAD)
      await expect(result.locator('img')).toHaveCount(0)
    } finally {
      await unrouteObjectInfo()
    }
  })
})
