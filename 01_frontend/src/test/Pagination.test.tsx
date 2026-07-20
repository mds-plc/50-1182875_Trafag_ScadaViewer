/**
 * @file Pagination.test.tsx
 * @description Testy komponenty Pagination:
 *   - skrytí při pages <= 1
 *   - zakázání tlačítek na hranicích
 *   - volání onPage se správnou hodnotou
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import Pagination from '../components/Pagination'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <LangProvider>{children}</LangProvider>
)

function renderPagination(props: { page: number; pages: number; onPage: (p: number) => void }) {
  return render(<Pagination {...props} />, { wrapper: Wrapper })
}

describe('Pagination', () => {
  it('renders nothing when pages is 0', () => {
    const { container } = renderPagination({ page: 1, pages: 0, onPage: vi.fn() })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when pages is 1', () => {
    const { container } = renderPagination({ page: 1, pages: 1, onPage: vi.fn() })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders navigation buttons when pages > 1', () => {
    renderPagination({ page: 2, pages: 5, onPage: vi.fn() })
    expect(screen.getByRole('button', { name: /předchozí/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /další/i })).toBeInTheDocument()
  })

  it('disables previous button on first page', () => {
    renderPagination({ page: 1, pages: 3, onPage: vi.fn() })
    expect(screen.getByRole('button', { name: /předchozí/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /další/i })).not.toBeDisabled()
  })

  it('disables next button on last page', () => {
    renderPagination({ page: 3, pages: 3, onPage: vi.fn() })
    expect(screen.getByRole('button', { name: /další/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /předchozí/i })).not.toBeDisabled()
  })

  it('calls onPage(page - 1) when previous is clicked', async () => {
    const user = userEvent.setup()
    const onPage = vi.fn()
    renderPagination({ page: 3, pages: 5, onPage })
    await user.click(screen.getByRole('button', { name: /předchozí/i }))
    expect(onPage).toHaveBeenCalledOnce()
    expect(onPage).toHaveBeenCalledWith(2)
  })

  it('calls onPage(page + 1) when next is clicked', async () => {
    const user = userEvent.setup()
    const onPage = vi.fn()
    renderPagination({ page: 3, pages: 5, onPage })
    await user.click(screen.getByRole('button', { name: /další/i }))
    expect(onPage).toHaveBeenCalledOnce()
    expect(onPage).toHaveBeenCalledWith(4)
  })
})
