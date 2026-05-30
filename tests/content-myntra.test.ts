/**
 * Pins the Core Rule #4 INVERSION for the capture feature.
 *
 * `applyProfile` navigates → its handler must ACK synchronously (return false,
 * respond immediately) so the channel isn't held open across a navigation that
 * destroys the content script.
 *
 * `captureSelection` is read-only and must RETURN DATA → its handler keeps the
 * channel open (return true) and calls sendResponse only AFTER awaiting the
 * read. Reversing either side breaks the popup (capture would get an empty
 * response) — this test goes red if someone "unifies" the two handlers.
 */
import { describe, it, expect, vi } from 'vitest'
import type { CaptureSelectionResponse } from '../lib/config'

// Importing the content script registers its onMessage listener on the mocked
// chrome.runtime (see tests/setup.ts).
import '../contents/myntra'

// Snapshot the listener at module-eval time — tests/setup.ts calls
// vi.clearAllMocks() in beforeEach, which would wipe the import-time call.
const REGISTERED_LISTENERS = vi
  .mocked(chrome.runtime.onMessage.addListener)
  .mock.calls.map((c) => c[0])

function stubLocation(href: string): void {
  const u = new URL(href)
  Object.defineProperty(window, 'location', {
    value: { href, pathname: u.pathname, hostname: u.hostname, assign: vi.fn() },
    writable: true,
  })
}

type MessageListener = (
  message: { action: string; profileId?: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined

function getListener(): MessageListener {
  return REGISTERED_LISTENERS[REGISTERED_LISTENERS.length - 1] as unknown as MessageListener
}

describe('contents/myntra message handling', () => {
  it('captureSelection keeps the channel open (return true) and responds with selected brands', async () => {
    stubLocation('https://www.myntra.com/tshirts?f=Brand:Nike,Puma')
    const listener = getListener()
    const sendResponse = vi.fn()

    const ret = listener({ action: 'captureSelection' }, {}, sendResponse)

    expect(ret).toBe(true) // async channel — the inverse of applyProfile
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled())
    const response = sendResponse.mock.calls[0]![0] as CaptureSelectionResponse
    expect(response).toEqual({ ok: true, isFilterPage: true, brands: ['Nike', 'Puma'] })
  })

  it('applyProfile ACKs synchronously (return false) and does NOT hold the channel open', () => {
    stubLocation('https://www.myntra.com/tshirts')
    const listener = getListener()
    const sendResponse = vi.fn()

    const ret = listener({ action: 'applyProfile', profileId: 'x' }, {}, sendResponse)

    expect(ret).toBe(false)
    expect(sendResponse).toHaveBeenCalledWith({ ok: true })
  })
})
