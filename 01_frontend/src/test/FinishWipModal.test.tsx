/**
 * @file FinishWipModal.test.tsx
 * @description Dialog ručního dokončení rozpracované zakázky (2026-10-26) — bez spojení s PLC
 *   vyžaduje zaškrtnutí „zakázka na stroji neběží" a pošle potvrzení serveru.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LangProvider } from '../context/LangContext'
import FinishWipModal from '../components/FinishWipModal'
import type { OrderFile } from '../types'

const WIP = {
  file_id: 'PROD_ORD7_E1_20261026_090000_WIP.csv', name: 'PROD_ORD7_E1_20261026_090000_WIP',
  order_id: 'ORD7', sync_status: 'wip',
} as OrderFile

function renderModal(plcUnknown: boolean) {
  const onConfirm = vi.fn()
  render(
    <LangProvider>
      <FinishWipModal target={WIP} plcUnknown={plcUnknown} onCancel={vi.fn()} onConfirm={onConfirm} />
    </LangProvider>,
  )
  const confirmBtn = screen.getAllByRole('button').find(b => b.className.includes('btn--primary'))!
  return { onConfirm, confirmBtn }
}

describe('FinishWipModal', () => {
  it('PLC připojeno: bez zaškrtnutí, potvrdit lze hned (server ověří, že zakázka neběží)', () => {
    const { onConfirm, confirmBtn } = renderModal(false)
    expect(screen.getByText('ORD7')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('PLC nedostupné: varování, tlačítko zakázané do zaškrtnutí, pak potvrzení serveru', () => {
    const { onConfirm, confirmBtn } = renderModal(true)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(confirmBtn).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledWith(true)
  })
})
