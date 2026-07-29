import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLang } from '../context/LangContext';
function formatValue(value) {
    if (typeof value === 'boolean')
        return { text: value ? 'TRUE' : 'FALSE', type: value ? 'bool-on' : 'bool-off' };
    if (typeof value === 'number')
        return { text: String(value), type: 'number' };
    return { text: String(value), type: 'text' };
}
/** PlcStatus — SCADA status grid s live hodnotami PLC symbolů. */
export default function PlcStatus({ connected, status }) {
    const { t, lang } = useLang();
    const locale = lang === 'cs' ? 'cs-CZ' : 'en-US';
    const symbols = Object.values(status);
    return (_jsxs("div", { className: "plc-status", children: [_jsxs("div", { className: 'plc-status__connection' + (connected ? ' plc-status__connection--ok' : ' plc-status__connection--err'), children: [_jsx("div", { className: 'plc-status__dot' + (connected ? '' : ' plc-status__dot--err') }), _jsx("span", { children: connected ? t.plc.connected : t.plc.disconnectedDetail })] }), symbols.length > 0 && (_jsx("div", { className: "plc-status__grid", children: symbols.map(s => {
                    const { text, type } = formatValue(s.value);
                    return (_jsxs("div", { className: "plc-status__item", children: [_jsx("span", { className: "plc-status__symbol", children: s.symbol }), _jsx("span", { className: `plc-status__value plc-status__value--${type}`, children: text }), _jsx("span", { className: "plc-status__ts", children: new Date(s.ts).toLocaleTimeString(locale) })] }, s.symbol));
                }) })), symbols.length === 0 && connected && (_jsx("p", { className: "plc-status__empty", children: t.plc.waitingForData }))] }));
}
