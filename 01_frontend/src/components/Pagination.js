import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file Pagination.tsx
 * @description Navigace mezi stránkami — předchozí / info / další.
 * Skryje se pokud pages <= 1 (vše na jedné stránce).
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '../context/LangContext';
export default function Pagination({ page, pages, onPage }) {
    const { t } = useLang();
    if (pages <= 1)
        return null;
    return (_jsxs("div", { className: "pagination", children: [_jsx("button", { className: "pagination__btn", disabled: page <= 1, onClick: () => onPage(page - 1), "aria-label": "P\u0159edchoz\u00ED str\u00E1nka", children: _jsx(ChevronLeft, { size: 15 }) }), _jsxs("span", { className: "pagination__info", children: [t.db.page, " ", _jsx("strong", { children: page }), " ", t.db.of, " ", pages] }), _jsx("button", { className: "pagination__btn", disabled: page >= pages, onClick: () => onPage(page + 1), "aria-label": "Dal\u0161\u00ED str\u00E1nka", children: _jsx(ChevronRight, { size: 15 }) })] }));
}
