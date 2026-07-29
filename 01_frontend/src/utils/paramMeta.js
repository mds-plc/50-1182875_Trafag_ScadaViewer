/**
 * @file paramMeta.ts
 * @description Sdílená metadata měřených parametrů — zkratky a anglické popisy.
 *   Parametry jsou vždy v angličtině (technická terminologie).
 *   Používáno v DataTable (ChartView) a FileTable (expand).
 */
/** Zkratka pro záhlaví sloupce — pro klíče bez záznamu se zobrazí surový klíč. */
export const PARAM_LABELS = {
    timestamp: 'Timestamp',
    sortingcategory: 'KAT.',
    status: 'Status',
    // Forces
    of_operatingforce: 'OF',
    rf_realisingforce: 'RF',
    ttf_totaltravelforce: 'TTF',
    // Distances
    pt_pretravel: 'PT',
    ot_overtravel: 'OvT',
    rt_realisingtravel: 'RvT',
    md_movementdifferential: 'MD',
    tt_totaltravel: 'TT',
    fp_freeposition: 'FP',
    op_operatingposition: 'OP',
    rp_realeasingposition: 'RP',
    ttp_totaltravelposition: 'TTP',
    // Times
    ut_unstabletime: 'UT',
    rt_reversetime: 'RevT',
    bt_bouncetime: 'BT',
    ot_operatingtime: 'OpT',
    // Contacts
    r_nc_operatingposition_neg: 'R NCo−',
    r_nc_operatingposition_pos: 'R NCo+',
    r_nc_releasingposition_neg: 'R NCr−',
    r_nc_releasingposition_pos: 'R NCr+',
    r_no_operatingposition_neg: 'R NOo−',
    r_no_operatingposition_pos: 'R NOo+',
    r_no_releasingposition_neg: 'R NOr−',
    r_no_releasingposition_pos: 'R NOr+',
};
/**
 * Skupiny parametrů — sdíleno mezi ChartView (záložky tabulky) a RecordDiagram (ParamTable).
 * Každá skupina má id, label, barvu a seznam klíčů CSV záznamu.
 */
/**
 * `id`    — klíč pro tab state v ChartView
 * `label` — zkrácený název (ChartView záložky)
 * `unit`  — jednotka zobrazená v RecordDiagram záhlaví skupiny
 * `color` — barva skupiny (RecordDiagram group header, SVG kóty)
 * `keys`  — CSV klíče v této skupině
 */
export const PARAM_GROUPS = [
    { id: 'forces', label: 'Forces', unit: 'N', color: '#d97706',
        keys: ['of_operatingforce', 'rf_realisingforce', 'ttf_totaltravelforce'] },
    { id: 'positions', label: 'Positions', unit: 'mm', color: '#2563eb',
        keys: ['fp_freeposition', 'op_operatingposition', 'rp_realeasingposition', 'ttp_totaltravelposition'] },
    { id: 'travel', label: 'Travel', unit: 'mm', color: '#0891b2',
        keys: ['pt_pretravel', 'ot_overtravel', 'rt_realisingtravel', 'md_movementdifferential', 'tt_totaltravel'] },
    { id: 'times', label: 'Times', unit: 'ms', color: '#059669',
        keys: ['ut_unstabletime', 'rt_reversetime', 'bt_bouncetime', 'ot_operatingtime'] },
    { id: 'electric', label: 'Electric', unit: 'mΩ', color: '#7c3aed',
        keys: [
            'r_nc_operatingposition_neg', 'r_nc_operatingposition_pos',
            'r_nc_releasingposition_neg', 'r_nc_releasingposition_pos',
            'r_no_operatingposition_neg', 'r_no_operatingposition_pos',
            'r_no_releasingposition_neg', 'r_no_releasingposition_pos',
        ] },
];
/** Anglický popis zobrazený v tooltipu (klik/tap na záhlaví sloupce). */
export const PARAM_TOOLTIPS = {
    sortingcategory: 'Sorting Category (1–4 OK, 5–6 NOK)',
    status: 'Status (2 = OK · 5 = NOK Trafag · 6 = NOK Manufacturer)',
    // Forces
    of_operatingforce: 'Operating Force [N]',
    rf_realisingforce: 'Realising Force [N]',
    ttf_totaltravelforce: 'Total Travel Force [N]',
    // Distances
    pt_pretravel: 'Pre-travel [mm]',
    ot_overtravel: 'Overtravel [mm]',
    rt_realisingtravel: 'Realising Travel [mm]',
    md_movementdifferential: 'Movement Differential [mm]',
    tt_totaltravel: 'Total Travel [mm]',
    fp_freeposition: 'Free Position [mm]',
    op_operatingposition: 'Operating Position [mm]',
    rp_realeasingposition: 'Releasing Position [mm]',
    ttp_totaltravelposition: 'Total Travel Position [mm]',
    // Times
    ut_unstabletime: 'Unstable Time [ms]',
    rt_reversetime: 'Reverse Time [ms]',
    bt_bouncetime: 'Bounce Time [ms]',
    ot_operatingtime: 'Operating Time [ms]',
    // Contacts
    r_nc_operatingposition_neg: 'NC — Operating Position Neg [mΩ]',
    r_nc_operatingposition_pos: 'NC — Operating Position Pos [mΩ]',
    r_nc_releasingposition_neg: 'NC — Releasing Position Neg [mΩ]',
    r_nc_releasingposition_pos: 'NC — Releasing Position Pos [mΩ]',
    r_no_operatingposition_neg: 'NO — Operating Position Neg [mΩ]',
    r_no_operatingposition_pos: 'NO — Operating Position Pos [mΩ]',
    r_no_releasingposition_neg: 'NO — Releasing Position Neg [mΩ]',
    r_no_releasingposition_pos: 'NO — Releasing Position Pos [mΩ]',
};
