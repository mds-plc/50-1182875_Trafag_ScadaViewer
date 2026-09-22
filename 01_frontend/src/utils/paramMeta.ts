/**
 * @file paramMeta.ts
 * @description Sdílená metadata měřených parametrů — zkratky a anglické popisy.
 *   Parametry jsou vždy v angličtině (technická terminologie).
 *   Používáno v DataTable (ChartView) a FileTable (expand).
 */

/** Zkratka pro záhlaví sloupce — pro klíče bez záznamu se zobrazí surový klíč. */
export const PARAM_LABELS: Record<string, string> = {
  timestamp:        'Timestamp',
  microswitch_id:   'ID',
  microswitch_name: 'Switch',
  sortingcategory:  'KAT.',
  status:           'Status',
  // Forces
  of_operatingforce:           'OF',
  rf_realisingforce:           'RF',
  ttf_totaltravelforce:        'TTF',
  // Distances
  pt_pretravel:                'PT',
  ot_overtravel:               'OvT',
  rt_realisingtravel:          'RvT',
  md_movementdifferential:     'MD',
  tt_totaltravel:              'TT',
  fp_freeposition:             'FP',
  op_operatingposition:        'OP',
  rp_realeasingposition:       'RP',
  ttp_totaltravelposition:     'TTP',
  // Times
  ut_unstabletime:             'UT',
  rt_reversetime:              'RevT',
  bt_bouncetime:               'BT',
  ot_operatingtime:            'OpT',
  // Contacts
  r_nc_operatingposition_neg:  'R NCo−',
  r_nc_operatingposition_pos:  'R NCo+',
  r_nc_releasingposition_neg:  'R NCr−',
  r_nc_releasingposition_pos:  'R NCr+',
  r_no_operatingposition_neg:  'R NOo−',
  r_no_operatingposition_pos:  'R NOo+',
  r_no_releasingposition_neg:  'R NOr−',
  r_no_releasingposition_pos:  'R NOr+',
  // NOK diagnostics
  nokreason:                   'NOK',
  nokcategory_force:           'NOK F',
  nokcategory_position:        'NOK P',
  nokcategory_electric:        'NOK E',
  nokcategory_times:           'NOK T',
  nokcategory_process:         'NOK Pr',
  // Testing input parameters
  drive_distance:              'Dist',
  drive_velocity:              'Vel',
  drive_acceleration:          'Acc',
  drive_deceleration:          'Dec',
  drive_jerk:                  'Jerk',
  electric_current:            'I',
  electric_voltage:            'U',
  measuring_baseperiod:        'BasePer',
  measuring_oversampling:      'OvSmpl',
  measuring_samplesreserve:    'SmplRes',
  limits_distancemax:          'DistMax',
  limits_forcemax:             'FMax',
  // Measured info
  measuretime:                 'MeasT',
  meas_ts:                     'MeasTS',
}

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
export const PARAM_GROUPS: { id: string; label: string; unit: string; color: string; keys: string[] }[] = [
  { id: 'forces',    label: 'Forces',    unit: 'N',   color: '#d97706',
    keys: ['of_operatingforce', 'rf_realisingforce', 'ttf_totaltravelforce'] },
  { id: 'positions', label: 'Positions', unit: 'µm',  color: '#2563eb',
    keys: ['fp_freeposition', 'op_operatingposition', 'rp_realeasingposition', 'ttp_totaltravelposition'] },
  { id: 'travel',    label: 'Travel',    unit: 'µm',  color: '#0891b2',
    keys: ['pt_pretravel', 'ot_overtravel', 'rt_realisingtravel', 'md_movementdifferential', 'tt_totaltravel'] },
  { id: 'times',     label: 'Times',     unit: 'µs',  color: '#059669',
    keys: ['ut_unstabletime', 'rt_reversetime', 'bt_bouncetime', 'ot_operatingtime'] },
  { id: 'electric',  label: 'Electric',  unit: 'Ω', color: '#7c3aed',
    keys: [
      'r_nc_operatingposition_neg', 'r_nc_operatingposition_pos',
      'r_nc_releasingposition_neg', 'r_nc_releasingposition_pos',
      'r_no_operatingposition_neg', 'r_no_operatingposition_pos',
      'r_no_releasingposition_neg', 'r_no_releasingposition_pos',
    ] },
]

/** Skupiny vstupních parametrů pro Testing detail (TestingParameters + MeasuredInfo). */
export const TESTING_INPUT_GROUPS: { id: string; label: string; unit: string; color: string; keys: string[] }[] = [
  { id: 'drive',     label: 'Drive',     unit: '',  color: '#0ea5e9',
    keys: ['drive_distance', 'drive_velocity', 'drive_acceleration', 'drive_deceleration', 'drive_jerk'] },
  { id: 'elec_in',   label: 'Electric',  unit: '',  color: '#8b5cf6',
    keys: ['electric_current', 'electric_voltage'] },
  { id: 'measuring', label: 'Measuring', unit: '',  color: '#14b8a6',
    keys: ['measuring_baseperiod', 'measuring_oversampling', 'measuring_samplesreserve'] },
  { id: 'limits',    label: 'Limits',    unit: '',  color: '#f59e0b',
    keys: ['limits_distancemax', 'limits_forcemax'] },
]

/** Metadata sekce — klíče z [Metadata] bloku CSV. */
export const METADATA_KEYS = ['timestamp', 'microswitch_id', 'microswitch_name']

/** NokInfo sekce — klíče z [NokInfo] bloku CSV. */
export const NOKINFO_KEYS = ['nokreason', 'nokcategory_force', 'nokcategory_position',
  'nokcategory_electric', 'nokcategory_times', 'nokcategory_process']

/** MeasuredInfo sekce — klíče z [MeasuredInfo] bloku CSV. */
export const MEASUREDINFO_KEYS = ['measuretime', 'meas_ts']

/** Anglický popis zobrazený v tooltipu (klik/tap na záhlaví sloupce). */
export const PARAM_TOOLTIPS: Record<string, string> = {
  timestamp:        'Measurement Timestamp',
  microswitch_id:   'Microswitch ID',
  microswitch_name: 'Microswitch Type',
  sortingcategory:  'Sorting Category (1–4 OK, 5–6 NOK)',
  status:           'Status (2 = OK · 5 = NOK Trafag · 6 = NOK Manufacturer)',
  // Forces
  of_operatingforce:           'Operating Force [N]',
  rf_realisingforce:           'Realising Force [N]',
  ttf_totaltravelforce:        'Total Travel Force [N]',
  // Distances
  pt_pretravel:                'Pre-travel [µm]',
  ot_overtravel:               'Overtravel [µm]',
  rt_realisingtravel:          'Realising Travel [µm]',
  md_movementdifferential:     'Movement Differential [µm]',
  tt_totaltravel:              'Total Travel [µm]',
  fp_freeposition:             'Free Position [µm]',
  op_operatingposition:        'Operating Position [µm]',
  rp_realeasingposition:       'Releasing Position [µm]',
  ttp_totaltravelposition:     'Total Travel Position [µm]',
  // Times
  ut_unstabletime:             'Unstable Time [µs]',
  rt_reversetime:              'Reverse Time [µs]',
  bt_bouncetime:               'Bounce Time [µs]',
  ot_operatingtime:            'Operating Time [µs]',
  // Contacts
  r_nc_operatingposition_neg:  'NC — Operating Position Neg [Ω]',
  r_nc_operatingposition_pos:  'NC — Operating Position Pos [Ω]',
  r_nc_releasingposition_neg:  'NC — Releasing Position Neg [Ω]',
  r_nc_releasingposition_pos:  'NC — Releasing Position Pos [Ω]',
  r_no_operatingposition_neg:  'NO — Operating Position Neg [Ω]',
  r_no_operatingposition_pos:  'NO — Operating Position Pos [Ω]',
  r_no_releasingposition_neg:  'NO — Releasing Position Neg [Ω]',
  r_no_releasingposition_pos:  'NO — Releasing Position Pos [Ω]',
  // NOK diagnostics
  nokreason:                   'NOK Reason Code',
  nokcategory_force:           'NOK Category — Force',
  nokcategory_position:        'NOK Category — Position',
  nokcategory_electric:        'NOK Category — Electric',
  nokcategory_times:           'NOK Category — Times',
  nokcategory_process:         'NOK Category — Process',
  // Testing input parameters
  drive_distance:              'Drive Distance [mm]',
  drive_velocity:              'Drive Velocity [mm/s]',
  drive_acceleration:          'Drive Acceleration [mm/s²]',
  drive_deceleration:          'Drive Deceleration [mm/s²]',
  drive_jerk:                  'Drive Jerk [mm/s³]',
  electric_current:            'Electric Current [A]',
  electric_voltage:            'Electric Voltage [V]',
  measuring_baseperiod:        'Measuring Base Period [ms]',
  measuring_oversampling:      'Measuring Oversampling [−]',
  measuring_samplesreserve:    'Measuring Samples Reserve [−]',
  limits_distancemax:          'Distance Limit Max [mm]',
  limits_forcemax:             'Force Limit Max [N]',
  // Measured info
  measuretime:                 'Measurement Duration [s]',
  meas_ts:                     'Measurement Timestamp [unix s]',
}
