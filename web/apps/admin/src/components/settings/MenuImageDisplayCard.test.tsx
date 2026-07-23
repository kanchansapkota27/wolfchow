import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Restaurant } from '@wolfchow/types'
import { MenuImageDisplayCard } from './MenuImageDisplayCard'

const mockPatchRestaurant = vi.fn().mockResolvedValue({})

vi.mock('../../lib/api', () => ({
  useApi: () => ({ admin: { patchRestaurant: mockPatchRestaurant } }),
}))

const RESTAURANT = { menu_image_display: 'both' } as Restaurant

describe('MenuImageDisplayCard', () => {
  it('pre-selects the restaurant\'s current scope', () => {
    render(<MenuImageDisplayCard restaurant={RESTAURANT} onSave={vi.fn()} />)
    expect(screen.getByRole('radio', { name: /Both/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Off/ })).not.toBeChecked()
  })

  it('selecting a new scope calls patchRestaurant and onSave', async () => {
    const onSave = vi.fn()
    render(<MenuImageDisplayCard restaurant={RESTAURANT} onSave={onSave} />)

    fireEvent.click(screen.getByRole('radio', { name: /Mobile only/ }))

    await waitFor(() => expect(mockPatchRestaurant).toHaveBeenCalledWith({ menu_image_display: 'mobile' }))
    expect(onSave).toHaveBeenCalled()
  })
})
