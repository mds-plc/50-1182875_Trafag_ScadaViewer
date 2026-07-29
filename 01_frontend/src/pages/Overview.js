import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @file Overview.tsx
 * @description Hlavní dashboard (/) — gradient hero badge, zakázka, boxy, live záznamy.
 *
 * Režim stroje (E_APP_ModeManager_Mode UINT z ADS):
 *   0  = eMACHINEOFF          → šedý gradient
 *   3  = ePRESSURING          → jantarový pulzující
 *   4  = eSTARTINGAUX         → jantarový pulzující
 *   5  = eUNHOMED             → jantarový statický
 *   6  = eHOMING              → jantarový pulzující
 *   9  = eRESUMEPRODUCTION   → jantarový statický
 *  10  = eAUTOSTOP            → zelený statický
 *  11  = eDUMMYMODE           → modrý pulzující
 *  14  = eSTOPPINGMODE        → jantarový pulzující
 *  15  = eAUTOMODE            → zelený pulzující
 *  16  = eMSAMODE             → zelený pulzující
 *  17  = eLIMODE              → zelený pulzující
 *  20  = eSERVICEMODE         → oranžový statický
 *  21  = eSERVICEMODESPECIAL  → oranžový statický
 *  25  = eSTEPBYSTEP          → oranžový statický
 *  30  = eEMPTYING            → jantarový pulzující
 */
import { useMemo, useState, useEffect } from 'react';
import { PauseCircle, Clock, WifiOff } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, } from 'recharts';
import { Link } from 'react-router-dom';
import { usePlc } from '../context/PlcContext';
import { useLang } from '../context/LangContext';
import { useOrderWatcher } from '../hooks/useOrderWatcher';
import { useWipData } from '../hooks/useWipData';
// E_APP_ModeManager_Mode — hodnoty z TwinCAT ENUM + bilingvní texty
const MODE_MAP = {
    0: {
        cls: 'off',
        label: { cs: 'Vypnuto', en: 'Machine Off' },
        sub: { cs: 'Stroj je vypnut', en: 'Machine is powered off' },
    },
    3: {
        cls: 'init',
        label: { cs: 'Tlakování', en: 'Pressurizing' },
        sub: { cs: 'Probíhá tlakování hydrauliky', en: 'Hydraulic system pressurizing' },
    },
    4: {
        cls: 'init',
        label: { cs: 'Spouštění', en: 'Starting Up' },
        sub: { cs: 'Spouštění pomocných systémů', en: 'Starting auxiliary systems' },
    },
    5: {
        cls: 'wait',
        label: { cs: 'Není zahomováno', en: 'Not Homed' },
        sub: { cs: 'Čekání na dokončení homování', en: 'Waiting for homing to complete' },
    },
    6: {
        cls: 'init',
        label: { cs: 'Homování', en: 'Homing' },
        sub: { cs: 'Probíhá nastavení referenčních pozic', en: 'Setting reference positions' },
    },
    9: {
        cls: 'wait',
        label: { cs: 'Obnova výroby', en: 'Resume Production' },
        sub: { cs: 'Čekání na potvrzení operátora', en: 'Waiting for operator confirmation' },
    },
    10: {
        cls: 'auto-stop',
        label: { cs: 'Auto — Stop', en: 'Auto — Stop' },
        sub: { cs: 'Automatický režim — čeká na spuštění', en: 'Automatic mode — waiting to start' },
    },
    11: {
        cls: 'test',
        label: { cs: 'Dummy', en: 'Dummy' },
        sub: { cs: 'Testovací průchod bez výstupu', en: 'Test run without output' },
    },
    14: {
        cls: 'init',
        label: { cs: 'Zastavování', en: 'Stopping' },
        sub: { cs: 'Probíhá řízené zastavování stroje', en: 'Controlled machine shutdown in progress' },
    },
    15: {
        cls: 'auto-run',
        label: { cs: 'Auto — Run', en: 'Auto — Run' },
        sub: { cs: 'Automatický provoz — třídění aktivní', en: 'Automatic operation — sorting active' },
    },
    16: {
        cls: 'auto-run',
        label: { cs: 'Režim MSA', en: 'MSA Mode' },
        sub: { cs: 'Statistická analýza měřicího systému', en: 'Measurement system analysis' },
    },
    17: {
        cls: 'auto-run',
        label: { cs: 'Režim LI', en: 'LI Mode' },
        sub: { cs: 'Kontrola linearity', en: 'Linearity inspection' },
    },
    20: {
        cls: 'service',
        label: { cs: 'Servis', en: 'Service' },
        sub: { cs: 'Servisní zásah — výroba přerušena', en: 'Service intervention — production paused' },
    },
    21: {
        cls: 'service',
        label: { cs: 'Servis speciální', en: 'Service Special' },
        sub: { cs: 'Speciální servisní operace', en: 'Special service operation' },
    },
    25: {
        cls: 'service',
        label: { cs: 'Krok za krokem', en: 'Step by Step' },
        sub: { cs: 'Manuální krokový provoz', en: 'Manual step-by-step operation' },
    },
    30: {
        cls: 'init',
        label: { cs: 'Vyprazdňování', en: 'Emptying' },
        sub: { cs: 'Probíhá vyprazdňování systému', en: 'System emptying in progress' },
    },
};
/** Formátování ISO timestamp → HH:MM:SS (24h) pro badge. */
function _fmtTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });
    }
    catch {
        return '';
    }
}
const BOX_COUNT = 6;
/**
 * DEV helper: nastavit na číslo zakázky pro testování bez PLC.
 * MUSÍ zůstat `undefined` v produkci.
 */
const DEV_ORDER = undefined;
/** Formátuje ms trvání → "Xh Ym" nebo "Y min". */
function _fmtDur(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
/** Formátuje ISO timestamp → HH:MM */
function _fmtHHMM(iso) {
    try {
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    catch {
        return '';
    }
}
/**
 * Hlavní dashboard (/) — live status stroje, aktuální zakázka, boxy a WIP záznamy.
 * PLC data přijímá z PlcContext (WebSocket /ws/plc).
 * Live CSV záznamy přijímá z useOrderWatcher (WebSocket /ws/orders).
 */
export default function Overview() {
    const { status, adsConnected } = usePlc();
    const { t, lang } = useLang();
    const { records } = useOrderWatcher();
    // Zablokuje scroll v .content — Overview musí vyplnit výšku bez scrollování
    useEffect(() => {
        const el = document.querySelector('.content');
        if (el)
            el.style.overflowY = 'hidden';
        return () => { if (el)
            el.style.overflowY = ''; };
    }, []);
    // Aktuální čas — obnovuje se každých 10 s, aby osa X grafu „tekla" živě
    const [nowTs, setNowTs] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNowTs(Date.now()), 10000);
        return () => clearInterval(id);
    }, []);
    // ── PLC hodnoty ──────────────────────────────────────────────────────────
    const modeRaw = status['mode']?.value;
    const modeNum = typeof modeRaw === 'number' ? modeRaw : null;
    const modeInfo = modeNum !== null ? (MODE_MAP[modeNum] ?? null) : null;
    const orderValid = status['order_valid']?.value;
    const orderName = status['order_name']?.value;
    const expectedCnt = status['order_count_expected']?.value;
    const actualCnt = status['order_count_actual']?.value;
    const modeTs = status['mode']?.ts;
    // Zobrazit aktivní obsah jen pro auto-stop a auto-run (a jen pokud je ADS připojeno)
    const showActive = DEV_ORDER ? true : (adsConnected && (modeInfo?.cls === 'auto-stop' || modeInfo?.cls === 'auto-run'));
    // ── WIP data (REST) — načte historická data po obnovení stránky ──────────
    const { data: wipData, loading: wipLoading } = useWipData(showActive, DEV_ORDER ?? orderName);
    // ── Merge: WIP REST snapshot + WebSocket přírůstky ───────────────────────
    const allRecords = useMemo(() => {
        if (wipData === null)
            return records;
        const wipTs = new Set(wipData.records.map(r => r.timestamp));
        const newWs = records.filter(r => !wipTs.has(r.timestamp));
        return [...newWs, ...wipData.records]; // nejnovější nahoře
    }, [wipData, records]);
    // Inline progress v badgeu: jen v auto módech s platnou zakázkou a známými počty
    const showInlineProgress = orderValid === true &&
        (modeInfo?.cls === 'auto-run' || modeInfo?.cls === 'auto-stop') &&
        expectedCnt != null && expectedCnt > 0;
    // ── Progress zakázky ─────────────────────────────────────────────────────
    const progressPct = useMemo(() => {
        if (!expectedCnt || expectedCnt <= 0)
            return 0;
        return Math.min(100, Math.round(((actualCnt ?? 0) / expectedCnt) * 100));
    }, [actualCnt, expectedCnt]);
    // Záznamy pro zobrazení — prázdné když zakázka není platná
    const displayRecords = orderValid ? allRecords : [];
    // ── Mini chart — seřazeno vzestupně dle timestamp, kumulativní počet ───────
    const chartData = useMemo(() => {
        if (displayRecords.length === 0)
            return [];
        return [...displayRecords]
            .sort((a, b) => {
            const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return ta - tb; // nejstarší vlevo → vzestupný průběh
        })
            .map((r, i) => ({
            t: r.timestamp ? new Date(r.timestamp).getTime() : 0,
            count: i + 1,
        }));
    }, [displayRecords]);
    // Čas prvního záznamu = start zakázky (nejstarší po seřazení)
    const orderStartTs = chartData.length > 0
        ? new Date(chartData[0].t).toISOString()
        : undefined;
    // ── Produkční KPIs ────────────────────────────────────────────────────────
    const { remaining, ratePerMin, etaStr, remainingTimeStr } = useMemo(() => {
        if (!orderValid || chartData.length < 2) {
            return { remaining: null, ratePerMin: null, etaStr: null, remainingTimeStr: null };
        }
        const firstT = chartData[0].t;
        const lastT = chartData[chartData.length - 1].t;
        const elapsedMin = (lastT - firstT) / 60000;
        const rem = expectedCnt != null && actualCnt != null
            ? Math.max(0, expectedCnt - actualCnt)
            : null;
        const rate = elapsedMin > 0 ? chartData.length / elapsedMin : null;
        const eta = rem != null && rate != null && rate > 0
            ? new Date(Date.now() + (rem / rate) * 60000)
            : null;
        const remMs = rem != null && rate != null && rate > 0
            ? (rem / rate) * 60000
            : null;
        return {
            remaining: rem,
            ratePerMin: rate,
            etaStr: eta
                ? eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                : null,
            remainingTimeStr: remMs != null ? _fmtDur(remMs) : null,
        };
    }, [orderValid, chartData, expectedCnt, actualCnt]);
    // Uplynulý čas od prvního záznamu
    const elapsedStr = useMemo(() => {
        if (!orderValid || chartData.length === 0)
            return null;
        return _fmtDur(nowTs - chartData[0].t);
    }, [orderValid, chartData, nowTs]);
    // Plné boxy
    const fullBoxCount = useMemo(() => {
        if (!orderValid)
            return null;
        let n = 0;
        for (let i = 1; i <= BOX_COUNT; i++) {
            if (status[`box_${i}_full`]?.value === true)
                n++;
        }
        return n;
    }, [orderValid, status]);
    // ── Chart data prodloužená do nowTs (flat hladina od posl. záznamu) ───────
    const chartDataWithNow = useMemo(() => {
        if (chartData.length === 0)
            return [];
        const last = chartData[chartData.length - 1];
        if (nowTs <= last.t)
            return chartData;
        return [...chartData, { t: nowTs, count: last.count }];
    }, [chartData, nowTs]);
    // ── Tiky na celé hodiny (HH:00) pro osu X ────────────────────────────────
    const hourTicks = useMemo(() => {
        if (chartData.length === 0)
            return [];
        const startT = chartData[0].t;
        const firstHour = new Date(startT);
        firstHour.setMinutes(0, 0, 0);
        firstHour.setHours(firstHour.getHours() + 1);
        const ticks = [];
        let t = firstHour.getTime();
        while (t <= nowTs) {
            ticks.push(t);
            t += 3600000;
        }
        return ticks;
    }, [chartData, nowTs]);
    // ── Render ───────────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "db-page ov-page", children: [_jsx("div", { className: "db-header", children: _jsx("h1", { className: "page-title", children: t.overview.title }) }), !adsConnected && (_jsxs("div", { className: "ov-plc-offline", children: [_jsx(WifiOff, { size: 60, className: "ov-plc-offline__icon" }), _jsx("p", { className: "ov-plc-offline__title", children: lang === 'cs' ? 'PLC není připojeno' : 'PLC not connected' }), _jsx("p", { className: "ov-plc-offline__sub", children: lang === 'cs' ? 'Čekám na připojení…' : 'Waiting for connection…' })] })), adsConnected && (_jsxs("div", { className: `ov-mode ov-mode--${modeInfo?.cls ?? 'off'}`, children: [_jsxs("div", { className: "ov-mode__top", children: [_jsx("div", { className: "ov-mode__dot" }), _jsx("span", { className: "ov-mode__label", children: modeInfo ? modeInfo.label[lang] : t.overview.modeUnknown }), modeTs && (_jsx("span", { className: "ov-mode__ts", children: _fmtTime(modeTs) }))] }), modeInfo && (_jsx("span", { className: "ov-mode__sub", children: modeInfo.sub[lang] })), showInlineProgress && (_jsxs("div", { className: "ov-mode__progress", children: [_jsx("div", { className: "ov-mode__bar", children: _jsx("div", { className: "ov-mode__bar-fill", style: { width: `${progressPct}%` } }) }), _jsxs("span", { className: "ov-mode__bar-text", children: [actualCnt ?? 0, " / ", expectedCnt, " \u00B7 ", progressPct, " %"] })] }))] })), adsConnected && !showActive && (_jsxs("div", { className: "ov-idle", children: [_jsx(PauseCircle, { size: 48, className: "ov-idle__icon" }), _jsx("p", { className: "ov-idle__text", children: t.overview.noActiveOrder })] })), showActive && (_jsxs("div", { className: "tile-grid ov-tile-grid", children: [_jsxs("div", { className: "tile tile--5", children: [_jsxs("div", { className: "tile__header", children: [_jsx("span", { className: "tile__title", children: t.overview.orderTile }), orderValid && wipData?.file && (_jsx("span", { className: "ov-wip-file", children: wipData.file }))] }), _jsx("div", { className: "ov-kpi__name", children: orderValid ? (orderName || '—') : '— — — —' }), orderValid !== undefined && (_jsx("div", { className: `ov-kpi__validity ov-kpi__validity--${orderValid ? 'ok' : 'err'}`, children: orderValid ? t.overview.orderValid : t.overview.orderInvalid })), orderValid ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "ov-kpi__count", children: [_jsx("span", { className: "ov-kpi__count-actual", children: actualCnt ?? '—' }), _jsx("span", { className: "ov-kpi__count-sep", children: " / " }), _jsx("span", { className: "ov-kpi__count-expected", children: expectedCnt ?? '—' })] }), expectedCnt != null && expectedCnt > 0 && (_jsxs("div", { className: "ov-kpi__bar-row", children: [_jsx("div", { className: "ov-kpi__bar", children: _jsx("div", { className: "ov-kpi__bar-fill", style: { width: `${progressPct}%` } }) }), _jsxs("span", { className: "ov-kpi__pct", children: [progressPct, " %"] })] })), _jsx("div", { className: "ov-kpi__stats-sep" }), _jsxs("div", { className: "ov-stats", children: [_jsxs("div", { className: "ov-stat", children: [_jsx("span", { className: "ov-stat__label", children: lang === 'cs' ? 'Zbývá' : 'Remaining' }), _jsxs("span", { className: `ov-stat__value${remaining == null ? ' ov-stat__value--muted' : ''}`, children: [remaining != null ? remaining : '—', remaining != null && _jsx("span", { className: "ov-stat__unit", children: " ks" })] })] }), _jsxs("div", { className: "ov-stat", children: [_jsx("span", { className: "ov-stat__label", children: lang === 'cs' ? 'Uplynulo' : 'Elapsed' }), _jsx("span", { className: `ov-stat__value${elapsedStr == null ? ' ov-stat__value--muted' : ''}`, children: elapsedStr ?? '—' })] }), _jsxs("div", { className: "ov-stat", children: [_jsx("span", { className: "ov-stat__label", children: lang === 'cs' ? 'Rychlost' : 'Rate' }), _jsxs("span", { className: `ov-stat__value${ratePerMin == null ? ' ov-stat__value--muted' : ''}`, children: [ratePerMin != null ? ratePerMin.toFixed(1) : '—', ratePerMin != null && _jsx("span", { className: "ov-stat__unit", children: " ks/min" })] })] }), _jsxs("div", { className: "ov-stat", children: [_jsx("span", { className: "ov-stat__label", children: lang === 'cs' ? 'Zbývá ~' : 'Time left' }), _jsx("span", { className: `ov-stat__value${remainingTimeStr == null ? ' ov-stat__value--muted' : ''}`, children: remainingTimeStr ?? '—' })] }), _jsxs("div", { className: "ov-stat", children: [_jsx("span", { className: "ov-stat__label", children: lang === 'cs' ? 'Dokončení' : 'Est. finish' }), _jsx("span", { className: `ov-stat__value${etaStr == null ? ' ov-stat__value--muted' : ''}`, children: etaStr ?? '—' })] }), _jsxs("div", { className: "ov-stat", children: [_jsx("span", { className: "ov-stat__label", children: lang === 'cs' ? 'Plné boxy' : 'Full boxes' }), _jsx("span", { className: `ov-stat__value${fullBoxCount == null ? ' ov-stat__value--muted' : ''}`, children: fullBoxCount != null ? `${fullBoxCount}/${BOX_COUNT}` : '—' })] })] })] })) : (_jsxs("div", { className: "ov-no-data", children: [_jsx(Clock, { size: 28 }), _jsx("span", { children: t.overview.orderWaiting })] }))] }), _jsxs("div", { className: "tile tile--7", children: [_jsx("div", { className: "tile__header", children: _jsx("span", { className: "tile__title", children: t.overview.boxesTile }) }), _jsx("div", { className: `ov-boxes${orderValid ? '' : ' ov-boxes--dim'}`, children: Array.from({ length: BOX_COUNT }, (_, i) => {
                                    const n = i + 1;
                                    const present = orderValid ? status[`box_${n}_present`]?.value : undefined;
                                    const full = orderValid ? status[`box_${n}_full`]?.value : undefined;
                                    const count = orderValid ? status[`box_${n}_count`]?.value : undefined;
                                    const cls = full ? 'full' : present ? 'present' : 'empty';
                                    const chipLabel = full
                                        ? (lang === 'cs' ? 'Plná' : 'Full')
                                        : present
                                            ? (lang === 'cs' ? 'K dispozici' : 'Available')
                                            : (lang === 'cs' ? 'Nepřítomna' : 'Absent');
                                    return (_jsxs("div", { className: `ov-box ov-box--${cls}`, children: [_jsxs("span", { className: "ov-box__number", children: ["BOX ", n] }), _jsx("div", { className: "ov-box__dot" }), present && count != null && (_jsx("span", { className: "ov-box__count", children: count })), _jsx("span", { className: `ov-box__chip ov-box__chip--${cls}`, children: chipLabel })] }, n));
                                }) })] }), _jsxs("div", { className: "tile tile--5", children: [_jsxs("div", { className: "tile__header", children: [_jsx("span", { className: "tile__title", children: t.overview.lastRecordTile }), orderValid && wipData?.file && (_jsx(Link, { to: "/wip", className: "btn btn--sm btn--primary", children: lang === 'cs' ? 'Záznamy' : 'Records' }))] }), !orderValid ? (_jsxs("div", { className: "ov-no-data", children: [_jsx(Clock, { size: 28 }), _jsx("span", { children: t.overview.orderWaiting })] })) : wipLoading && displayRecords.length === 0 ? (_jsxs("div", { className: "ov-skeleton-wrap", children: [_jsx("div", { className: "ov-skeleton", style: { width: '55%' } }), _jsx("div", { className: "ov-skeleton", style: { width: '35%' } }), _jsx("div", { className: "ov-skeleton", style: { width: '45%' } })] })) : displayRecords.length === 0 ? (_jsx("div", { className: "ov-records__empty", children: t.overview.noRecords })) : (_jsxs("div", { className: "ov-rec-list", children: [_jsxs("div", { className: "ov-rec-list__header", children: [_jsx("span", { children: lang === 'cs' ? 'Čas' : 'Time' }), _jsx("span", { children: t.overview.colId }), _jsx("span", { children: t.overview.colGroup })] }), displayRecords.slice(0, 7).map((rec, i) => (_jsxs("div", { className: `ov-rec-item${i === 0 ? ' ov-rec-item--latest' : ''}`, children: [_jsx("span", { className: "ov-rec-item__ts", children: rec.timestamp ? _fmtHHMM(rec.timestamp) : '—' }), _jsx("span", { className: "ov-rec-item__id", children: rec.microswitch_id ?? '—' }), rec.group != null
                                                ? _jsx("span", { className: "ov-rec-item__grp", children: rec.group.toString() })
                                                : _jsx("span", {})] }, i)))] }))] }), _jsxs("div", { className: "tile tile--7 ov-chart-tile", children: [_jsxs("div", { className: "tile__header", children: [_jsx("span", { className: "tile__title", children: lang === 'cs' ? 'Průběh výroby' : 'Production progress' }), orderValid && orderStartTs && (_jsxs("span", { className: "ov-ts-mono", children: [_fmtHHMM(orderStartTs), ' — now ', _fmtHHMM(new Date(nowTs).toISOString())] }))] }), !orderValid ? (_jsxs("div", { className: "ov-no-data", children: [_jsx(Clock, { size: 28 }), _jsx("span", { children: t.overview.orderWaiting })] })) : chartData.length > 1 ? (_jsx("div", { className: "ov-chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: chartDataWithNow, margin: { top: 8, right: 24, left: -16, bottom: 0 }, children: [_jsx(XAxis, { dataKey: "t", type: "number", domain: [chartData[0]?.t ?? 'dataMin', nowTs], scale: "time", ticks: hourTicks, tick: { fontSize: 11, fill: 'var(--color-text-muted)' }, tickFormatter: (v) => _fmtHHMM(new Date(v).toISOString()), axisLine: false, tickLine: false }), _jsx(YAxis, { tick: { fontSize: 11, fill: 'var(--color-text-muted)' }, axisLine: false, tickLine: false, allowDecimals: false, domain: [0, 'auto'] }), _jsx(Tooltip, { contentStyle: { fontSize: 12, borderRadius: 8 }, labelFormatter: (v) => _fmtHHMM(new Date(Number(v)).toISOString()), formatter: (v) => [v, lang === 'cs' ? 'ks' : 'pcs'] }), expectedCnt != null && expectedCnt > 0 && (_jsx(ReferenceLine, { y: expectedCnt, stroke: "var(--color-text-muted)", strokeDasharray: "5 3", label: {
                                                    value: expectedCnt,
                                                    position: 'insideTopRight',
                                                    fontSize: 11,
                                                    fill: 'var(--color-text-muted)',
                                                } })), _jsx(Line, { type: "monotone", dataKey: "count", stroke: "var(--color-success)", strokeWidth: 2.5, dot: false, isAnimationActive: false })] }) }) })) : (_jsx("div", { className: "ov-records__empty", children: lang === 'cs' ? 'Žádná data' : 'No data' }))] })] }))] }));
}
