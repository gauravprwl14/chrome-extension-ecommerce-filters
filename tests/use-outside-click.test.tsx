import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React, { useRef } from 'react'
import { useOutsideClick } from '../lib/use-outside-click'

function Host({ onClose, active = true }: { onClose: () => void; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClick(ref, onClose, active)
  return (
    <div>
      <div data-testid="outside">outside</div>
      <div ref={ref} data-testid="inside">
        <button data-testid="trigger">trigger</button>
        <div data-testid="menu">menu</div>
      </div>
    </div>
  )
}

describe('useOutsideClick', () => {
  it('does not invoke onClose when clicking inside the ref', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<Host onClose={onClose} />)
    fireEvent.mouseDown(getByTestId('trigger'))
    fireEvent.mouseDown(getByTestId('menu'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('invokes onClose when clicking outside the ref', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<Host onClose={onClose} />)
    fireEvent.mouseDown(getByTestId('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('invokes onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onClose for other keys', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('no-ops when active is false', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<Host onClose={onClose} active={false} />)
    fireEvent.mouseDown(getByTestId('outside'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes listeners on unmount', () => {
    const onClose = vi.fn()
    const { unmount, getByTestId } = render(<Host onClose={onClose} />)
    fireEvent.mouseDown(getByTestId('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1) // no additional calls
  })
})
