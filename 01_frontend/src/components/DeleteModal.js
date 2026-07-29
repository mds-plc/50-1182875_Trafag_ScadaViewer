import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file DeleteModal.tsx
 * @description Potvrzovací dialog smazání souboru.
 *   Vykreslen jako overlay (klik mimo = zavřít). Obsah modálu zastaví propagaci.
 */
import { useLang } from '../context/LangContext';
export default function DeleteModal({ target, onCancel, onConfirm }) {
    const { t } = useLang();
    return (_jsx("div", { className: "db-overlay", onClick: onCancel, children: _jsxs("div", { className: "db-modal", onClick: e => e.stopPropagation(), children: [_jsx("h3", { className: "db-modal__title", children: t.db.deleteTitle }), _jsxs("p", { className: "db-modal__body", children: [_jsx("strong", { children: target.name }), _jsx("br", {}), t.db.deleteBody] }), _jsxs("div", { className: "db-modal__actions", children: [_jsx("button", { className: "btn btn--secondary", onClick: onCancel, children: t.common.cancel }), _jsx("button", { className: "btn btn--danger", onClick: onConfirm, children: t.db.deleteBtn })] })] }) }));
}
