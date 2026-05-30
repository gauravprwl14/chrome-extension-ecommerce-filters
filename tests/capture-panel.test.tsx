import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import React from 'react'
import type { Brand } from '../lib/config'
import { CaptureProfilePanel } from '../components/CaptureProfilePanel'

const matched: Brand[] = [
  { id: 'nike', name: 'Nike' },
  { id: 'levis', name: "Levi's" },
]

function setup(overrides?: {
  matched?: Brand[]
  unknown?: string[]
  suggestedName?: string
  takenProfileNames?: Set<string>
}) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <CaptureProfilePanel
      matched={overrides?.matched ?? matched}
      unknown={overrides?.unknown ?? ['Zara', 'H&M']}
      suggestedName={overrides?.suggestedName ?? 'Myntra picks'}
      takenProfileNames={overrides?.takenProfileNames ?? new Set()}
      onSave={onSave}
      onCancel={onCancel}
    />,
  )
  return { ...view, onSave, onCancel }
}

describe('CaptureProfilePanel', () => {
  it('prefills the suggested name', () => {
    const { getByLabelText } = setup()
    expect((getByLabelText('Profile name') as HTMLInputElement).value).toBe('Myntra picks')
  })

  it('shows matched brands and the new (unknown) brands separately', () => {
    const { getByTestId } = setup()
    expect(within(getByTestId('capture-matched')).getByText('Nike')).toBeTruthy()
    expect(within(getByTestId('capture-matched')).getByText("Levi's")).toBeTruthy()
    expect(within(getByTestId('capture-unknown')).getByText('Zara')).toBeTruthy()
    expect(within(getByTestId('capture-unknown')).getByText('H&M')).toBeTruthy()
  })

  it('saves matched brands with no promotions when no new brand is toggled on', () => {
    const { getByText, onSave } = setup()
    fireEvent.click(getByText('Save profile'))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Myntra picks',
      icon: expect.any(String),
      matchedIds: ['nike', 'levis'],
      promoteStrings: [],
    })
  })

  it('includes a new brand in promoteStrings only after it is toggled on', () => {
    const { getByText, getByLabelText, onSave } = setup()
    fireEvent.click(getByLabelText('Add Zara to library'))
    fireEvent.click(getByText('Save profile'))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ matchedIds: ['nike', 'levis'], promoteStrings: ['Zara'] }),
    )
  })

  it('disables Save when the name is empty', () => {
    const { getByText, getByLabelText } = setup()
    fireEvent.change(getByLabelText('Profile name'), { target: { value: '   ' } })
    expect((getByText('Save profile') as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables Save and shows an error when the name collides with an existing profile', () => {
    const { getByText, container } = setup({ takenProfileNames: new Set(['Myntra picks']) })
    expect((getByText('Save profile') as HTMLButtonElement).disabled).toBe(true)
    expect(container.textContent).toContain('already exists')
  })

  it('disables Save when nothing would be in the profile (no matches, nothing toggled)', () => {
    const { getByText } = setup({ matched: [], unknown: ['Zara'] })
    expect((getByText('Save profile') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const { getByText, onCancel } = setup()
    fireEvent.click(getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})
