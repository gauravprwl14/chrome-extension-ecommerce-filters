import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import React from 'react'
import type { Brand } from '../lib/config'
import { CaptureProfilePanel } from '../components/CaptureProfilePanel'

const matched: Brand[] = [
  { id: 'nike', name: 'Nike' },
  { id: 'levis', name: "Levi's" },
]

const userProfiles = [{ id: 'weekend', name: 'Weekend', icon: '🧥' }]

function setup(overrides?: {
  matched?: Brand[]
  unknown?: string[]
  suggestedName?: string
  takenProfileNames?: Set<string>
  userProfiles?: { id: string; name: string; icon: string }[]
}) {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <CaptureProfilePanel
      matched={overrides?.matched ?? matched}
      unknown={overrides?.unknown ?? ['Zara', 'H&M']}
      suggestedName={overrides?.suggestedName ?? 'Myntra picks'}
      takenProfileNames={overrides?.takenProfileNames ?? new Set()}
      userProfiles={overrides?.userProfiles ?? userProfiles}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  )
  return { ...view, onSubmit, onCancel }
}

describe('CaptureProfilePanel — new profile mode', () => {
  it('prefills the suggested name', () => {
    const { getByLabelText } = setup()
    expect((getByLabelText('Profile name') as HTMLInputElement).value).toBe('Myntra picks')
  })

  it('shows matched and new (unknown) brands separately', () => {
    const { getByTestId } = setup()
    expect(within(getByTestId('capture-matched')).getByText('Nike')).toBeTruthy()
    expect(within(getByTestId('capture-unknown')).getByText('Zara')).toBeTruthy()
  })

  it('includes new brands BY DEFAULT (opt-out) when saving', () => {
    const { getByText, onSubmit } = setup()
    fireEvent.click(getByText('Save profile'))
    expect(onSubmit).toHaveBeenCalledWith({
      target: 'new',
      name: 'Myntra picks',
      icon: expect.any(String),
      matchedIds: ['nike', 'levis'],
      promoteStrings: ['Zara', 'H&M'],
    })
  })

  it('excludes a new brand only after it is unticked', () => {
    const { getByText, getByLabelText, onSubmit } = setup()
    fireEvent.click(getByLabelText('Add Zara to library')) // untick (it starts checked)
    fireEvent.click(getByText('Save profile'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'new', promoteStrings: ['H&M'] }),
    )
  })

  it('disables Save when the name collides with an existing profile', () => {
    const { getByText } = setup({ takenProfileNames: new Set(['Myntra picks']) })
    expect((getByText('Save profile') as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables Save when nothing would be in the profile', () => {
    const { getByText, getByLabelText } = setup({ matched: [], unknown: ['Zara'] })
    fireEvent.click(getByLabelText('Add Zara to library')) // untick the only brand
    expect((getByText('Save profile') as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const { getByText, onCancel } = setup()
    fireEvent.click(getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('CaptureProfilePanel — update existing mode', () => {
  it('submits a replace update for the chosen user profile', () => {
    const { getByLabelText, getByText, onSubmit } = setup()
    fireEvent.click(getByLabelText('Update existing profile'))
    fireEvent.click(getByText('Replace'))
    expect(onSubmit).toHaveBeenCalledWith({
      target: 'update',
      profileId: 'weekend',
      mode: 'replace',
      matchedIds: ['nike', 'levis'],
      promoteStrings: ['Zara', 'H&M'],
    })
  })

  it('submits a merge update when Merge is clicked', () => {
    const { getByLabelText, getByText, onSubmit } = setup()
    fireEvent.click(getByLabelText('Update existing profile'))
    fireEvent.click(getByText('Merge'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'update', mode: 'merge' }),
    )
  })

  it('does not offer update mode when there are no user profiles', () => {
    const { queryByLabelText } = setup({ userProfiles: [] })
    expect(queryByLabelText('Update existing profile')).toBeNull()
  })
})
