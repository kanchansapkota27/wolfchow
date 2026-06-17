import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Modal } from './Modal'

describe('STORY-047 · Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        body
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape key closes', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Confirm">
        <button type="button">OK</button>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('overlay click closes; dialog click does not', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Confirm">
        <button type="button">OK</button>
      </Modal>,
    )
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    const overlay = document.querySelector('.wc-modal-overlay')!
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('is labelled by its title', () => {
    render(
      <Modal open onClose={() => {}} title="Delete plan">
        body
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Delete plan' })).toBeInTheDocument()
  })
})
