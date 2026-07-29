import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file AdsStatus.tsx
 * @description Průmyslový indikátor stavu PLC připojení — pulsující dot (zelený/červený)
 *   + textový popis "PLC Connected" / "PLC Disconnected". Používán v Topbar i LoginOverlay.
 */
import { useLang } from '../context/LangContext';
/** Průmyslový pulsující dot indikátor stavu PLC připojení. */
export default function AdsStatus({ connected }) {
    const { t } = useLang();
    return (_jsxs("div", { className: "status-indicator", children: [_jsx("div", { className: `status-indicator__dot${connected ? '' : ' status-indicator__dot--danger'}` }), _jsx("span", { children: connected ? t.plc.connected : t.plc.disconnected })] }));
}
