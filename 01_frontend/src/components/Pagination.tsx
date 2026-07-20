/**
 * @file Pagination.tsx
 * @description Navigace mezi stránkami — předchozí / info / další.
 * Skryje se pokud pages <= 1 (vše na jedné stránce).
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLang } from '../context/LangContext'

interface Props {
  page:   number
  pages:  number
  onPage: (p: number) => void
}

export default function Pagination({ page, pages, onPage }: Props) {
  const { t } = useLang()
  if (pages <= 1) return null

  return (
    <div className="pagination">
      <button
        className="pagination__btn"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Předchozí stránka"
      >
        <ChevronLeft size={15} />
      </button>

      <span className="pagination__info">
        {t.db.page} <strong>{page}</strong> {t.db.of} {pages}
      </span>

      <button
        className="pagination__btn"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Další stránka"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
