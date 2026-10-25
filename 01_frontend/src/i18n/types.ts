/**
 * @file i18n/types.ts
 * @description Typy pro internacionalizaci — interface překladu a Lang union type.
 */

export type Lang = 'cs' | 'en'

/** Nápověda stránky (ikona vedle nadpisu — components/PageHelp.tsx) */
export type HelpPageId = 'database' | 'order' | 'record' | 'testing' | 'settings' | 'info'
export interface HelpPage {
  title: string
  /** K čemu stránka slouží — jedna až dvě věty */
  intro: string
  /** Co na stránce je: část obrazovky → co dělá */
  items: { title: string; text: string }[]
}

export interface Translations {
  help: {
    button: string
    pages:  Record<HelpPageId, HelpPage>
  }
  common: {
    loading: string
    noData: string
    cancel: string
    delete: string
    refresh: string
    from: string
    to: string
    errorInvalidResponse: string
    /** HTTP 413 — zakázka nad strop velikosti (audit Q7) */
    errorFileTooLarge: string
    errorLoading: string
    backendOffline: string
    save: string
    help: string
    remoteChip: string
    remoteReadOnly: string
  }
  nav: {
    database: string
    settings: string
    info: string
  }
  plc: {
    connected: string
    disconnected: string
    toastConnected: string
    toastDisconnected: string
  }
  db: {
    title: string
    tabLocal: string
    tabRemote: string
    tabProduction: string
    tabTesting: string
    dotChecking: string
    dotAvailable: string
    dotUnavailable: string
    remoteUnavailable: string
    colCreated: string
    colOrder: string
    colSwitchType: string
    colRecords: string
    colSync: string
    colTimestamp: string
    colId: string
    colSwitch: string
    badgeSynced: string
    badgeWip: string
    noFilesInRange: string
    hiddenByFilter: string
    showLatestDay: string
    wipTooltip: string
    badgeLocal: string
    showRecords: string
    openInChart: string
    noFilesLocal: string
    noFilesRemote: string
    footerFiles: string
    footerTotalRecords: string
    countPending: string
    deleteTitle: string
    deleteBody: string
    deleteBtn: string
    deleteSuccess: string
    deleteError: string
    /** Soubor z done_local — ještě není na NAS (audit Q5) */
    deleteUnsyncedWarning: string
    deleteUnsyncedAdminOnly: string
    deleteUnsyncedForbidden: string
    deleteWipWarning: string
    deleteWipConfirm: string
    deleteWipForbidden: string
    deleteBusy: string
    batchUnsyncedCount: string
    rangeRecords: string
    clearFilter: string
    /** Hledání zakázky podle čísla / názvu (Production) */
    searchOrder: string
    searchClear: string
    searchNoMatch: string
    searchAllDates: string
    page: string
    of: string
    colGroup: string
    colStatus: string
    totalVsExpected: string
    orderDetail: string
    downloadXlsx: string
    selectedCount: string
    deleteSelected: string
    clearSelection: string
    batchConfirmTitle: string
    batchConfirmBody: string
    selectAll: string
    prevPage: string
    nextPage: string
  }
  chart: {
    diagramForceTravel: string
    diagramSwitchingTimes: string
    openContact: string
    /** Tabulka parametrů: tlačítko „?" (popis) a tlačítko grafu (parametr zvýrazněný v diagramu) */
    paramHelp: string
    paramGraph: string
    paramGraphHint: string
    positionScaleEncoder: string
    colCategory: string
    unitPcs: string
    exportCsv: string
    backToDatabase: string
    recordDetail: string
    categoryDistribution: string
    categoryNote: string
    catRange: string
    catRangeNote: string
    timelineView: string
    filterStatus: string
    filterAll: string
    filterCategory: string
    filterNok: string
    filterNokHint: string
    limitTrafag: string
    limitSupplier: string
    limitCategory: string
    limitLegend: string
    limitLegendTrafag: string
    limitLegendSupplier: string
    limitLegendBoth: string
    filterShown: string
    filterClear: string
    filterEmpty: string
    sortOrder: string
    sortOldest: string
    sortNewest: string
    printNewestFirst: string
    oiTitle: string
    oiTabTesting: string
    oiTabCategories: string
    oiTabLimits: string
    oiRecipe: string
    oiLots: string
    oiLotsNote: string
    oiLotsMore: string
    oiMin: string
    oiMax: string
    oiGroupingBy: string
    oiUnused: string
    oiCatNokTrafag: string
    oiCatNokSupplier: string
    oiCategoriesNote: string
    oiLimitTrafag: string
    oiLimitSupplier: string
    oiLimitsNote: string
    oiActiveLimits: string
    oiOnlyActive: string
    oiNoActive: string
    printRange: string
    printFilter: string
    tlStart: string
    tlEnd: string
    tlTotal: string
    tlAvgGap: string
    tlMedianGap: string
    tlMaxGap: string
    tlBefore: string
    tlPauses: string
    tlRate: string
    tlRateUnit: string
    tlPauseHelp: string
    tlPieces: string
    tlTooFew: string
    paramsTitle: string
    paramAbbr: string
    paramName: string
    paramValue: string
    maximize: string
    measureDuration: string
    measuredAt: string
    printedAt: string
    fullscreen: string
    close: string
    zoomReset: string
    zoomHint: string
    zoomHintFs: string
    printPreparing: string
    print: string
    testingDetail: string
    sectionTestingParams: string
    sectionMeasuredInfo: string
    sectionAnalyzedParams: string
    sectionNokInfo: string
    sectionSignal: string
    signalOverview: string
    signalResults: string
    signalHysteresis: string
    signalSwitching: string
    signalTiming: string
    signalSamples: string
    sigPosition: string
    sigForce: string
    sigVoltage: string
    sigCurrent: string
    sigResistance: string
    sigForward: string
    sigReverse: string
    sigThreshold: string
    sigAnalysis: string
    sigTime: string
    sigOpenContact: string
    sigPositionRef: string
    catNokTrafagHint: string
    catNokSupplierHint: string
    nokCategories: string
    forceTravelAria: string
    switchTimesAria: string
    switchTimesAxisCompressed: string
  }
  settings: {
    title: string
    // Předvolby tile
    prefsTile:       string
    prefsLang:       string
    prefsTheme:      string
    prefsThemeDark:  string
    prefsThemeLight: string
    prefsPerPage:    string
    prefsRefresh:    string
    // Připojení tile
    connTile:            string
    connPlcSection:      string
    connStorageSection:  string
    connAds:             string
    connAdsConnected:    string
    connAdsDisconnected: string
    connNetId:           string
    connPort:            string
    connLocal:           string
    connLocalOk:         string
    connLocalMissing:    string
    connLocalPath:       string
    connNas:             string
    connNasAvail:        string
    connNasUnavail:      string
    connRemotePath:      string
    connPathSaved:       string
    connPathError:       string
    connBrowse:          string
    connPickerDrives:    string
    connPickerSelect:    string
    connPickerEmpty:     string
    // Nápověda — vysvětlivky parametrů
    helpLang:            string
    helpTheme:           string
    helpPerPage:         string
    helpRefresh:         string
    prefsOsk:            string
    prefsOskAuto:        string
    prefsOskOn:          string
    prefsOskOff:         string
    helpOsk:             string
    helpAds:             string
    helpNetId:           string
    helpPort:            string
    helpLocal:           string
    helpLocalPath:       string
    helpNas:             string
    helpRemotePath:      string
    // Účet tile
    accountPwdWrong:    string
    themeToLight: string
    themeToDark: string
  }
  overview: {
    title:          string
    // Režim stroje
    modeUnknown:    string
    // Zakázka
    orderTile:      string
    orderValid:     string
    orderInvalid:   string
    orderWaiting:   string
    // Třídění
    // Boxy
    boxesTile:      string
    boxFull:        string
    // Live záznamy
    lastRecordTile: string
    colTimestamp:   string
    colId:          string
    colSwitchType:  string
    colGroup:       string
    noRecords:      string
    noActiveOrder:  string
    // KPI statistiky
    statRemaining:  string
    statElapsed:    string
    statRate:       string
    statTimeLeft:   string
    statFinish:     string
    statFullBoxes:  string
    // Boxy — stavy
    boxAbsent:      string
    boxAvailable:   string
    // Ostatní
    plcOffline:     string
    plcOfflineSub:  string
    recordsBtn:     string
    chartTile:      string
    chartNoData:    string
    unitPcs:        string
  }
  info: {
    title:        string
    appVersion:   string
    appGithubLink: string
    projectTile:  string
    projNumber:   string
    projCustomer: string
    projSupplier: string
    projContact:  string
    docsTile:     string
    docsAbout:    string
    docsManual:   string
    docsManualNote: string
  }
  login: {
    waitingPLC: string
    orLocal: string
    username: string
    password: string
    signIn: string
    errorCredentials: string
    errorServer: string
    sessionExpired: string
    localAccess: string
    signOut: string
    remoteHint: string
  }
  error: {
    title: string
    message: string
    retry: string
  }
  users: {
    title:           string
    addUser:         string
    addUserBtn:      string
    username:        string
    displayName:     string
    role:            string
    password:        string
    changePassword:  string
    newPassword:     string
    currentPassword: string
    deleteUser:      string
    deleteConfirm:   string
    noUsers:         string
    roleOperator:    string
    roleTechnician:  string
    roleAdmin:       string
    roleManufacturer: string
    errUserExists:   string
    errEmptyField:   string
    errHigherRole:   string
    errLastUser:     string
    errSelf:         string
    successAdded:    string
    successDeleted:  string
    successPassword: string
  }
  storage: {
    title:          string
    usage:          string   // „{used} z {limit}"
    files:          string
    synced:         string   // „synchronizováno na NAS: {count} souborů ({size})"
    warning:        string
    critical:       string
    diskLow:        string   // „na disku zbývá jen {free}"
    cleanBtn:       string
    cleaning:       string
    nothingToClean: string
    confirmTitle:   string
    confirmBody:    string   // „Smaže se až {count} souborů ({size}) …"
    confirmNote:    string
    cleanDone:      string   // „Vyčištěno: {count} souborů, uvolněno {size}"
    cleanSkipped:   string   // „{count} souborů ponecháno — na NAS nenalezeny"
    cleanFailed:    string
    cleanNas:       string
    cleanBusy:      string
    cleanRunning:   string
    forceLink:      string
    forceTitle:     string
    forceBody:      string   // „Smaže se všech {count} souborů ({size}) …"
    forceRiskTitle: string
    forceRisk:      string
    forceAck:       string
    forceBtn:       string
    forceDone:      string   // „Smazáno bez ověření: {count} souborů, uvolněno {size}"
    toastWarning:   string
    toastCritical:  string
    chipTitle:      string
    usageLabel:     string
    limitLabel:     string
    limitSaved:     string
    limitError:     string
    limitAdminOnly: string
    helpLimit:      string
    helpUsage:      string
    nasTitle: string
    nasUsage: string
    nasUsageLabel: string
    nasUnavailable: string
    nasWarning: string
    nasCritical: string
    nasToastWarning: string
    nasToastCritical: string
    nasChipTitle: string
    nasHelp: string
  }
  /** Nastavení → Čas / NTP (components/TimeServerTab.tsx) */
  /** Klávesnice na obrazovce (kiosk) */
  osk: {
    label:     string
    space:     string
    enter:     string
    hide:      string
    backspace: string
    shift:     string
    left:      string
    right:     string
    symbols:   string
    letters:   string
  }
  time: {
    tab: string
    sectionPc: string
    sectionServer: string
    sectionSource: string
    sectionSet: string
    pcTime: string
    timeZone: string
    deviceDiff: string
    deviceDiffHint: string
    service: string
    svcRunning: string
    svcStopped: string
    svcNotInstalled: string
    svcOther: string
    startAuto: string
    startManual: string
    startDisabled: string
    server: string
    serverOn: string
    serverOff: string
    udp: string
    udpOn: string
    udpOff: string
    announce: string
    announceReliable: string
    announceConditional: string
    announceNever: string
    addresses: string
    addressesHint: string
    source: string
    synchronized: string
    syncYes: string
    syncNo: string
    stratum: string
    lastSync: string
    configured: string
    details: string
    summaryOk: string
    summaryBad: string
    reasonService: string
    reasonServer: string
    reasonUdp: string
    reasonAnnounce: string
    fixHint: string
    sourceLocal: string
    sourceSynced: string
    sourceNotSynced: string
    ipcAddress: string
    technical: string
    warnUpstream: string
    setLabel: string
    setNow: string
    setBtn: string
    confirmTitle: string
    confirmFrom: string
    confirmTo: string
    confirmDiff: string
    confirmWarning: string
    confirmAck: string
    setSuccess: string
    setError: string
    errPrivilege: string
    adminOnly: string
    unsupported: string
    loadError: string
  }
}
