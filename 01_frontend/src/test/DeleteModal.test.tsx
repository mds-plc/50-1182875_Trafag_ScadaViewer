/**
 * @file DeleteModal.test.tsx
 * @description Dialog smazání — soubor, který ještě není na NAS (done_local), má varování
 *   a smazat ho smí jen admin+ (audit Q5, rozhodnutí uživatele 2026-10-15).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LangProvider } from '../context/LangContext'
import DeleteModal from '../components/DeleteModal'
import type { OrderFile } from '../types'

const file = (sync_status: OrderFile['sync_status']): OrderFile => ({
  file_id: 'PROD_1_M_20261001_080000_DONE.csv', name: 'PROD_1_M_20261001_080000_DONE.csv',
  sync_status,
} as OrderFile)

function renderModal(target: OrderFile, canDeleteUnsynced: boolean) {
  const onConfirm = vi.fn()
  render(
    <LangProvider>
      <DeleteModal target={target} canDeleteUnsynced={canDeleteUnsynced} onCancel={vi.fn()} onConfirm={onConfirm} />
    </LangProvider>,
  )
  return onConfirm
}

const deleteBtn = () => screen.getAllByRole('button').find(b => b.className.includes('btn--danger'))!

describe('DeleteModal — nesynchronizovaný soubor (Q5)', () => {
  it('synchronizovaný soubor: bez varování, smazat lze', () => {
    const onConfirm = renderModal(file('done_remote'), false)
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(deleteBtn())
    expect(onConfirm).toHaveBeenCalled()
  })

  it('done_local bez práva: varování a tlačítko zakázané', () => {
    const onConfirm = renderModal(file('done_local'), false)
    expect(screen.getByRole('alert').textContent).toMatch(/NAS/)
    expect(deleteBtn()).toBeDisabled()
    fireEvent.click(deleteBtn())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('done_local jako admin: varování, smazat lze', () => {
    const onConfirm = renderModal(file('done_local'), true)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(deleteBtn())
    expect(onConfirm).toHaveBeenCalled()
  })
})
