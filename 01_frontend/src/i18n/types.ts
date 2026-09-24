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
  }
  nav: {
    overview: string
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
    groupDistribution: string
    totalVsExpected: string
    orderDetail: string
    downloadXlsx: string
    selectedCount: string
    deleteSelected: string
    clearSelection: string
    batchConfirmTitle: string
    batchConfirmBody: string
  }
  chart: {
    diagramForceTravel: string
    diagramSwitchingTimes: string
    openContact: string
    colCategory: string
    unitPcs: string
    records: string
    exportCsv: string
    backToDatabase: string
    recordDetail: string
    categoryDistribution: string
    categoryNote: string
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
    sigSwitchAt: string
    sigHysteresisBand: string
    sigTime: string
    sigOpenContact: string
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
    accountSave:        string
    accountPwdWrong:    string
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
}
