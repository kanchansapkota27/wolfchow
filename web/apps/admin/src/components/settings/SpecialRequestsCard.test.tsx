import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Restaurant } from '@wolfchow/types'
import { SpecialRequestsCard } from './SpecialRequestsCard'

const mockPatchRestaurant = vi.fn().mockResolvedValue({})

vi.mock('../../lib/api', () => ({
  useApi: () => ({ admin: { patchRestaurant: mockPatchRestaurant } }),
}))

describe('SpecialRequestsCard', () => {
  it('reflects the restaurant default (enabled)', () => {
    render(<SpecialRequestsCard restaurant={{ special_requests_enabled: true } as Restaurant} onSave={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Allow special instructions' })).toHaveAttribute('aria-checked', 'true')
  })

  it('toggling calls patchRestaurant with the new value and onSave', async () => {
    const onSave = vi.fn()
    render(<SpecialRequestsCard restaurant={{ special_requests_enabled: true } as Restaurant} onSave={onSave} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Allow special instructions' }))

    await waitFor(() => expect(mockPatchRestaurant).toHaveBeenCalledWith({ special_requests_enabled: false }))
    expect(onSave).toHaveBeenCalled()
  })
})
