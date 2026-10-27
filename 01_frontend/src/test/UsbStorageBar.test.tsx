/**
 * @file UsbStorageBar.test.tsx
 * @description Ukazatel flashky v hlavičce Databáze (2026-10-27): jen admin u stroje, bez flashky „zasuňte flashku",
 *   s flashkou zaplnění + bezpečné odebrání; pokus o uložení bez flashky (USB_ATTENTION_EVENT) → zabliká.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { LangProvider } from '../context/LangContext'

const usb = {
  canUse: true,
  drives: [] as { letter: string; label: string; total_bytes: number; free_bytes: number }[],
  eject: vi.fn(),
  ejecting: false,
}
vi.mock('../context/UsbContext', () => ({
  USB_ATTENTION_EVENT: 'scada:usb-attention',
  useUsb: () => usb,
}))

import UsbStorageBar from '../components/UsbStorageBar'

const renderBar = () => render(<LangProvider><UsbStorageBar /></LangProvider>)

beforeEach(() => {
  Object.assign(usb, { canUse: true, drives: [], ejecting: false })
  usb.eject.mockReset()
})
afterEach(() => { vi.useRealTimers() })

describe('UsbStorageBar', () => {
  it('bez práva (není admin u stroje) se nevykreslí', () => {
    usb.canUse = false
    const { container } = renderBar()
    expect(container.innerHTML).toBe('')
  })

  it('bez flashky: šedé „zasuňte flashku"', () => {
    const { container } = renderBar()
    expect(container.querySelector('.db-storage--usb.db-storage--unavailable')).not.toBeNull()
    expect(container.textContent).toMatch(/insert a drive/i)
  })

  it('s flashkou: písmeno, zaplnění a bezpečné odebrání', () => {
    usb.drives = [{ letter: 'E', label: 'FLASH', total_bytes: 8e9, free_bytes: 2e9 }]
    const { container } = renderBar()
    expect(container.textContent).toContain('USB E:')
    expect((container.querySelector('.db-storage--usb') as HTMLElement).title).toContain('E: FLASH')   // popisek v tooltipu
    expect((container.querySelector('.db-storage__fill') as HTMLElement).style.width).toBe('75%')
    fireEvent.click(container.querySelector('.db-storage__btn--eject')!)
    expect(usb.eject).toHaveBeenCalledWith('E')
  })

  it('během odebírání je tlačítko zakázané', () => {
    usb.drives = [{ letter: 'E', label: '', total_bytes: 8e9, free_bytes: 8e9 }]
    usb.ejecting = true
    renderBar()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('pokus o uložení bez flashky → ukazatel zabliká a pak se vrátí', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 0 })
    const { container } = renderBar()
    act(() => { window.dispatchEvent(new Event('scada:usb-attention')) })
    expect(container.querySelector('.db-storage--attention')).not.toBeNull()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1700) })
    expect(container.querySelector('.db-storage--attention')).toBeNull()
  })
})
