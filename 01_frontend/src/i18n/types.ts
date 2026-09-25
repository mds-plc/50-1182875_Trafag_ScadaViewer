/**
 * @file i18n/types.ts
 * @description Typy pro internacionalizaci — interface překladu a Lang union type.
 */

export type Lang = 'cs' | 'en'

export interface Translations {
  common: {
    loading: string
    noData: string
    cancel: string
    delete: string
    refresh: string
    from: string
    to: string
    errorInvalidResponse: string
    errorLoading: string
    backendOffline: string
    save: string
    help: string
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
    deleteTitle: string
    deleteBody: string
    deleteBtn: string
    deleteSuccess: string
    deleteError: string
    rangeRecords: string
    clearFilter: string
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
    colCategory: string
    unitPcs: string
    exportCsv: string
    backToDatabase: string
    recordDetail: string
    categoryDistribution: string
    categoryNote: string
    timelineView: string
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
    catNokTrafag: string
    catNokMaker: string
    nokCategories: string
    forceTravelAria: string
    switchTimesAria: string
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
  }
}
