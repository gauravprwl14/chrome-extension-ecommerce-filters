import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import React from 'react'
import type { Brand, Profile } from '../../lib/config'
import { ProfilesTab } from '../../options/tabs/ProfilesTab'

const BRANDS: Brand[] = [
  { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
  { id: 'calvin-klein', name: 'Calvin Klein' },
  { id: 'levis', name: "Levi's" },
]

const SYSTEM: Profile = {
  id: 'my-brands',
  name: 'My Brands',
  icon: '🛍',
  brandIds: ['tommy-hilfiger', 'calvin-klein'],
  isSystem: true,
}

const USER: Profile = {
  id: 'office-wear',
  name: 'Office wear',
  icon: '👔',
  brandIds: ['tommy-hilfiger'],
  isSystem: false,
}

function setup(profiles: Profile[]) {
  const onAdd = vi.fn()
  const onUpdate = vi.fn()
  const onDelete = vi.fn()
  const onAddBrand = vi.fn((name: string): Brand => ({ id: name.toLowerCase(), name }))
  const view = render(
    <ProfilesTab
      profiles={profiles}
      brands={BRANDS}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onAddBrand={onAddBrand}
    />,
  )
  return { ...view, onAdd, onUpdate, onDelete, onAddBrand }
}

describe('ProfilesTab — system profile cards', () => {
  it('renders the 🔒 lock affordance and a Duplicate button', () => {
    const { getByTestId } = setup([SYSTEM])
    const card = getByTestId('profile-card-my-brands')
    expect(within(card).getByLabelText('Locked')).toBeTruthy()
    expect(within(card).getByText('📋 Duplicate')).toBeTruthy()
  })

  it('does NOT render a Delete control on system cards', () => {
    const { getByTestId } = setup([SYSTEM])
    const card = getByTestId('profile-card-my-brands')
    expect(within(card).queryByLabelText('Delete profile')).toBeNull()
  })

  it('clicking Duplicate opens a confirmation modal', () => {
    const { getByTestId, getByRole } = setup([SYSTEM])
    fireEvent.click(within(getByTestId('profile-card-my-brands')).getByText('📋 Duplicate'))
    expect(getByRole('dialog')).toBeTruthy()
    expect(getByRole('dialog').textContent).toContain('My Brands')
  })

  it('Cancel in the modal does not call onAdd', () => {
    const { getByTestId, getByRole, onAdd } = setup([SYSTEM])
    fireEvent.click(within(getByTestId('profile-card-my-brands')).getByText('📋 Duplicate'))
    fireEvent.click(within(getByRole('dialog')).getByText('Cancel'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('Create copy submits a clone with isSystem:false and auto-numbered name', () => {
    const { getByTestId, getByRole, onAdd } = setup([SYSTEM])
    fireEvent.click(within(getByTestId('profile-card-my-brands')).getByText('📋 Duplicate'))
    fireEvent.click(within(getByRole('dialog')).getByText('Create copy'))
    expect(onAdd).toHaveBeenCalledTimes(1)
    const added = onAdd.mock.calls[0]![0] as Profile
    expect(added.name).toBe('My Brands (copy)')
    expect(added.isSystem).toBe(false)
    expect(added.id).toBe('my-brands-copy')
    expect(added.brandIds).toEqual(SYSTEM.brandIds)
  })
})

describe('ProfilesTab — user profile cards', () => {
  it('renders rename + delete and no lock affordance', () => {
    const { getByTestId } = setup([USER])
    const card = getByTestId('profile-card-office-wear')
    expect(within(card).queryByLabelText('Locked')).toBeNull()
    expect(within(card).getByLabelText('Delete profile')).toBeTruthy()
    expect(within(card).getByLabelText('Profile name')).toBeTruthy()
  })

  it('renaming calls onUpdate with the new name', () => {
    const { getByTestId, onUpdate } = setup([USER])
    const card = getByTestId('profile-card-office-wear')
    fireEvent.change(within(card).getByLabelText('Profile name'), { target: { value: 'Casuals' } })
    expect(onUpdate).toHaveBeenCalled()
    const last = onUpdate.mock.calls.at(-1)![0] as Profile
    expect(last.name).toBe('Casuals')
  })

  it('Delete fires onDelete with the profile id after confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { getByTestId, onDelete } = setup([USER])
    fireEvent.click(
      within(getByTestId('profile-card-office-wear')).getByLabelText('Delete profile'),
    )
    expect(onDelete).toHaveBeenCalledWith('office-wear')
    confirmSpy.mockRestore()
  })

  it('Delete is a no-op when confirm is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { getByTestId, onDelete } = setup([USER])
    fireEvent.click(
      within(getByTestId('profile-card-office-wear')).getByLabelText('Delete profile'),
    )
    expect(onDelete).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('ProfilesTab — Create flow', () => {
  it('+ New profile opens the form', () => {
    const { getByText, getByTestId } = setup([SYSTEM])
    fireEvent.click(getByText('+ New profile'))
    expect(getByTestId('create-profile-form')).toBeTruthy()
  })

  it('Create button is disabled when name is empty', () => {
    const { getByText, getByTestId } = setup([SYSTEM])
    fireEvent.click(getByText('+ New profile'))
    const form = getByTestId('create-profile-form')
    const submit = within(form).getByText('Create') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('Create button is disabled when no brand is selected', () => {
    const { getByText, getByTestId } = setup([SYSTEM])
    fireEvent.click(getByText('+ New profile'))
    const form = getByTestId('create-profile-form')
    fireEvent.change(within(form).getByLabelText('Profile name'), { target: { value: 'Casuals' } })
    const submit = within(form).getByText('Create') as HTMLButtonElement
    expect(submit.disabled).toBe(true) // no brand selected yet
  })

  it('submits a new profile with isSystem:false when name + ≥1 brand provided', () => {
    const { getByText, getByTestId, onAdd } = setup([SYSTEM])
    fireEvent.click(getByText('+ New profile'))
    const form = getByTestId('create-profile-form')
    fireEvent.change(within(form).getByLabelText('Profile name'), { target: { value: 'Casuals' } })
    // Open BrandPicker and pick Tommy
    fireEvent.click(within(form).getByText('None selected'))
    fireEvent.click(within(form).getByText('Tommy Hilfiger'))
    fireEvent.click(within(form).getByText('Create'))
    expect(onAdd).toHaveBeenCalledTimes(1)
    const added = onAdd.mock.calls[0]![0] as Profile
    expect(added.name).toBe('Casuals')
    expect(added.isSystem).toBe(false)
    expect(added.brandIds).toEqual(['tommy-hilfiger'])
    expect(added.id).toBe('casuals')
  })
})

describe('ProfilesTab — brand search + add-to-master', () => {
  it('filters the brand list as the user types', () => {
    const { getByText, getByTestId, getByPlaceholderText, queryByText } = setup([SYSTEM])
    fireEvent.click(getByText('+ New profile'))
    const form = getByTestId('create-profile-form')
    fireEvent.click(within(form).getByText('None selected'))
    fireEvent.change(getByPlaceholderText('Search brands…'), { target: { value: 'tommy' } })
    expect(within(form).getByText('Tommy Hilfiger')).toBeTruthy()
    expect(queryByText("Levi's")).toBeNull()
  })

  it('shows + Add to master when no exact match, and clicking it calls onAddBrand', () => {
    const { getByText, getByTestId, getByPlaceholderText, onAddBrand } = setup([SYSTEM])
    fireEvent.click(getByText('+ New profile'))
    const form = getByTestId('create-profile-form')
    fireEvent.click(within(form).getByText('None selected'))
    fireEvent.change(getByPlaceholderText('Search brands…'), { target: { value: 'Adidas' } })
    const addBtn = within(form).getByText(/Add .* to master brands/)
    fireEvent.click(addBtn)
    expect(onAddBrand).toHaveBeenCalledWith('Adidas')
  })
})

describe('ProfilesTab — sort order', () => {
  it('renders system profiles before user profiles', () => {
    const { getAllByTestId } = setup([USER, SYSTEM])
    const cards = getAllByTestId(/^profile-card-/).map((c) => c.getAttribute('data-testid'))
    expect(cards).toEqual(['profile-card-my-brands', 'profile-card-office-wear'])
  })
})
