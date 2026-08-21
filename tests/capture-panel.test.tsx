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
  defaultUpdateProfileId?: string
  lockedMode?: 'new' | 'update'
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
      defaultUpdateProfileId={overrides?.defaultUpdateProfileId}
      lockedMode={overrides?.lockedMode}
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

  it('opens pre-targeted to the selected profile in update mode (Replace one click away)', () => {
    const { getByText, onSubmit } = setup({ defaultUpdateProfileId: 'weekend' })
    // No need to click the "Update existing" radio — it should already be active.
    fireEvent.click(getByText('Replace'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'update', profileId: 'weekend', mode: 'replace' }),
    )
  })

  it('falls back to new-profile mode when the default target is not a user profile', () => {
    const { getByText } = setup({ defaultUpdateProfileId: 'my-brands' }) // not in userProfiles
    expect((getByText('Save profile') as HTMLButtonElement) != null).toBe(true)
  })
})

describe('CaptureProfilePanel — lockedMode="new"', () => {
  it('hides the radio toggle so only the new-profile form is shown', () => {
    const { queryByLabelText } = setup({ lockedMode: 'new' })
    expect(queryByLabelText('Create new profile')).toBeNull()
    expect(queryByLabelText('Update existing profile')).toBeNull()
  })

  it('shows Save profile button and submits a new-profile payload', () => {
    const { getByText, onSubmit } = setup({ lockedMode: 'new' })
    fireEvent.click(getByText('Save profile'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'new', name: 'Myntra picks' }),
    )
  })

  it('does not show Replace or Merge buttons', () => {
    const { queryByText } = setup({ lockedMode: 'new' })
    expect(queryByText('Replace')).toBeNull()
    expect(queryByText('Merge')).toBeNull()
  })
})

describe('CaptureProfilePanel — lockedMode="update"', () => {
  it('hides the radio toggle', () => {
    const { queryByLabelText } = setup({
      lockedMode: 'update',
      defaultUpdateProfileId: 'weekend',
    })
    expect(queryByLabelText('Create new profile')).toBeNull()
    expect(queryByLabelText('Update existing profile')).toBeNull()
  })

  it('shows Replace and Merge buttons, no Save profile', () => {
    const { getByText, queryByText } = setup({
      lockedMode: 'update',
      defaultUpdateProfileId: 'weekend',
    })
    expect(getByText('Replace')).toBeTruthy()
    expect(getByText('Merge')).toBeTruthy()
    expect(queryByText('Save profile')).toBeNull()
  })

  it('submits replace for the pre-targeted profile', () => {
    const { getByText, onSubmit } = setup({
      lockedMode: 'update',
      defaultUpdateProfileId: 'weekend',
    })
    fireEvent.click(getByText('Replace'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'update', profileId: 'weekend', mode: 'replace' }),
    )
  })

  it('submits merge for the pre-targeted profile', () => {
    const { getByText, onSubmit } = setup({
      lockedMode: 'update',
      defaultUpdateProfileId: 'weekend',
    })
    fireEvent.click(getByText('Merge'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'update', profileId: 'weekend', mode: 'merge' }),
    )
  })

  it('shows the profile name in the panel header', () => {
    const { getByTestId } = setup({
      lockedMode: 'update',
      defaultUpdateProfileId: 'weekend',
    })
    expect(getByTestId('capture-panel').textContent).toMatch(/Weekend/)
  })
})
