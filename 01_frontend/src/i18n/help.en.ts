/**
 * @file i18n/help.en.ts
 * @description Page help (icon next to the page title — components/PageHelp.tsx), English.
 *   Keep the same order of items as help.cs.ts.
 */
import type { Translations } from './types'

export const helpEn: Translations['help'] = {
  button: 'Help for this page',
  pages: {
    database: {
      title: 'Database — orders and tests',
      intro: 'The main page of the application. It lists stored production orders (Production) and microswitch tests (Testing), on this PC and in the NAS archive. From here you open details, download data and keep an eye on storage usage.',
      items: [
        { title: 'Local / Remote', text: 'Local = files on this PC (orders waiting to be uploaded and already uploaded). Remote = archive on the Synology NAS. The dot on the tab shows whether the NAS is reachable.' },
        { title: 'Production / Testing', text: 'Production = production orders (each row is one order with many pieces). Testing = single microswitch test measurements with signal data.' },
        { title: 'Storage and NAS', text: 'Indicators in the header: local storage usage against its limit and NAS usage. Warning from 80 %, critical from 95 %. A button removes local copies of files that are already safely on the NAS.' },
        { title: 'Search order', text: 'Type part of the order number or name (case and accents do not matter). While searching, the whole archive is searched regardless of the date. The cross or Esc clears the search.' },
        { title: 'From – to', text: 'Date filter by order creation, the last 2 days by default. If nothing matches, it offers to jump to the day with the newest data.' },
        { title: 'Table', text: 'Click a column header to sort. Click an order row (or the arrow) to expand the pieces and category distribution; the chart icon opens the order detail directly, without expanding. CSV / XLSX downloads the whole order. In the expanded piece overview, values outside the sorting limits are lightly tinted. "…" in the piece count = the count is being calculated. The order in progress is highlighted at the top.' },
        { title: 'Sync', text: 'In progress = the order is being produced. Local = stored on this PC only, waiting for upload to the NAS. Synced = also on the NAS.' },
        { title: 'Deleting', text: 'One by one or in bulk (tick boxes) — technician and above; operators cannot delete. A file that is not on the NAS yet (Local) can only be deleted by an administrator — the data would be lost for good. An order in progress can only be deleted by an administrator, one at a time after confirming the risk; if the machine keeps producing it, the PLC rejects the next piece. Nothing is ever deleted from the NAS. From the office the page is view-only.' },
        { title: 'Finish order', text: 'The check-mark button on an order in progress — administrator at the machine only. An order that has ended on the machine but was not closed (e.g. power failure) is closed with all pieces measured so far; DatabaseGateway then uploads it to the NAS. An order that is running on the machine right now cannot be finished. When the PLC connection is down, you must confirm that the order is not running on the machine. A finished order cannot be continued.' },
      ],
    },
    order: {
      title: 'Order detail',
      intro: 'Summary of one production order: how many pieces were produced, how they turned out (OK / NOK, categories 1–6), which test settings were used and how production went over time. From here you open the detail of a single piece.',
      items: [
        { title: 'Order header', text: 'Order number, microswitch type and ID, recipe, number of pieces and OK / NOK share. The first three supplier lots are shown; the "+N more" button opens the full list in Order data.' },
        { title: 'Category distribution / Timeline', text: 'Chart switch: pieces per category 1–6 — green OK band (1–4) and two separate NOK bands: yellow NOK Trafag (5, outside Trafag limits) and orange NOK Supplier (6, outside supplier limits); category colours = label colours of the sorting boxes, each with its own total; below the OK categories the range of the sorting quantity (MD), if the file contains it. Or produced pieces over time with indicators (duration, average cycle, pauses, pieces per hour).' },
        { title: 'Order data', text: 'Expandable rows with a summary: supplier lots (all of them, numbered in order of appearance), test parameters the machine measured with (speed, acceleration, force, current…), sorting category bounds and limits of the individual parameters. Click a row to expand or collapse it.' },
        { title: 'Sorting and piece filter', text: 'Oldest / Newest, Status filter (OK / NOK), Category and NOK area (Force, Position, Electric, Times, Process — pieces that failed in that area; the number on the button = pieces in the whole order, several areas = at least one of them). Filters combine, counts and pages follow them.' },
        { title: 'Piece table', text: 'One row = one tested piece with its measured parameters. Click a row to open the piece detail with diagrams. Values outside the sorting limits of the order are lightly tinted — yellow outside Trafag limits or MD outside categories 1–4 (NOK Trafag), orange outside supplier limits (NOK Supplier), orange with a yellow bar outside both; hover to see the limits.' },
        { title: 'Print and export', text: 'Print creates an A4 report of the pieces currently shown. The CSV and XLSX buttons download the whole order (original CSV, or an Excel table with numbers and times).' },
      ],
    },
    record: {
      title: 'Piece detail',
      intro: 'All measured values of one production piece and their graphical representation. Use it to see why the piece ended up in its category.',
      items: [
        { title: 'Force – travel diagram', text: 'Schematic hysteresis loop of the microswitch with the values of this piece: positions (FP, OP, RP, TTP and, in newer files, FPR — free position return), forces (OF, RF, TTF, differential force DF), travels (PT, OvT, RvT, MD, TT), contact resistances at the switching points and, in newer files, the static resistance of the closed NC / NO contacts (Static box). The icon enlarges it.' },
        { title: 'Time diagram', text: 'Voltage of the NC and NO contacts during switching (like an oscilloscope) with the UT, RevT, BT and OpT times to scale. If one segment is much longer than the others, the axis is compressed (mark "//") so the short segments stay readable — the dimension values always apply.' },
        { title: 'NOK categories', text: 'In which areas (force, position, electric, times, process) the piece failed.' },
        { title: 'Parameter table', text: 'Abbreviation, name, value and unit. "?" shows the description and calculation of the parameter, the chart icon shows the parameter highlighted in the diagram. "—" = value not determined, ∞ = open contact. Values outside the sorting limits of the order are lightly tinted — yellow outside Trafag limits or MD outside categories 1–4 (NOK Trafag), orange outside supplier limits (NOK Supplier), orange with a yellow bar outside both; hover to see the limits.' },
        { title: 'Back and print', text: 'Back returns to the order detail at the same place. Print creates an A4 piece report.' },
      ],
    },
    testing: {
      title: 'Measurement detail (Testing)',
      intro: 'One microswitch test measurement: test settings, evaluated parameters, result and the raw signal data of the measurement.',
      items: [
        { title: 'Header', text: 'Type, microswitch ID and recipe, time and duration of the measurement and the OK / NOK result (from the NOK categories).' },
        { title: 'Test settings', text: 'Drive, electric and measuring parameters the test ran with.' },
        { title: 'Measurement and Results', text: 'Measurement information (in newer files including the calibration constant C) and the evaluated parameters (forces incl. DF, positions incl. FPR, travels, resistances, times) — the same table as for production, including "?" and the parameter chart.' },
        { title: 'NOK evaluation', text: 'Result and the areas in which the measurement failed.' },
        { title: 'Signal data', text: 'Five charts from the raw data (overview, results, hysteresis, switching detail, times) with the points FP, OP, TTP, RP and FPR. Zoom with the wheel or two fingers, drag to pan, double-click = original view, icon = full screen.' },
        { title: 'Print', text: 'A4 report including all signal data charts.' },
      ],
    },
    settings: {
      title: 'Settings',
      intro: 'Display preferences, connection status of the PLC and storages, PC time (NTP server for IPCs) and user management.',
      items: [
        { title: 'Preferences', text: 'Language, light / dark mode, files per page, auto-refresh interval and the on-screen keyboard (kiosk without a system keyboard — Automatic = only at the machine). Stored in this browser.' },
        { title: 'Connection', text: 'Status of the server, PLC (ADS), local storage and NAS. An administrator at the machine changes the data paths and the local storage limit here.' },
        { title: 'Time / NTP', text: 'The PC at the machine serves as the NTP server for the other IPCs. The top shows at a glance whether the IPCs can take their time from this PC (and if not, why), the PC time, where the PC takes it from and the address to set on the IPCs. An administrator at the machine can set the PC time manually — the IPCs and the timestamps of new records take it over. Data for service are in the collapsed Technical details.' },
        { title: 'Users', text: 'Administrators only: add and remove users, change passwords. A user can have at most the same role as the person creating them. An account with the default password "admin" cannot sign in remotely and the app shows a prompt at the bottom to change it. A password sign-in on the machine PC ends after 15 minutes of inactivity.' },
      ],
    },
    info: {
      title: 'Info',
      intro: 'Information about the application: version, project, customer and supplier, description and documentation.',
      items: [
        { title: 'Project', text: 'Application version (reported by the server), project number and contacts.' },
        { title: 'Documentation', text: 'Short description of the application and a link to the user manual.' },
      ],
    },
  },
}
