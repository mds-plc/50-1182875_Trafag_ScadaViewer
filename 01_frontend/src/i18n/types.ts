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
    disconnectedDetail: string
    waitingForData: string
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
    badgeLocal: string
    showRecords: string
    openInChart: string
    noRecords: string
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
    groupDistribution: string
    totalVsExpected: string
    orderDetail: string
  }
  chart: {
    title: string
    filters: string
    records: string
    noData: string
    noNumericData: string
    exportCsv: string
    backToDatabase: string
    recordDetail: string
    paramsPlaceholder: string
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
    connVersion:         string
    connStatus:          string
    connStatusOk:        string
    connStatusDegraded:  string
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
    accountTile:        string
    accountUser:        string
    accountChangePwd:   string
    accountCurrentPwd:  string
    accountNewPwd:      string
    accountConfirmPwd:  string
    accountSave:        string
    accountLogout:      string
    accountPwdMismatch: string
    accountPwdWrong:    string
    accountPwdChanged:  string
    accountPwdEmpty:    string
  }
  overview: {
    title:          string
    // Režim stroje
    modeUnknown:    string
    // Zakázka
    orderTile:      string
    orderNumber:    string
    orderValidity:  string
    orderValid:     string
    orderInvalid:   string
    orderWaiting:   string
    orderProgress:  string   // "47 / 120"
    orderSwitchType: string
    // Třídění
    sortingTile:    string
    sortingActive:  string
    sortingIdle:    string
    // Boxy
    boxesTile:      string
    boxFull:        string
    boxEmpty:       string
    boxPresent:     string
    // Live záznamy
    recordsTile:    string
    lastRecordTile: string
    colTimestamp:   string
    colId:          string
    colSwitchType:  string
    colGroup:       string
    noRecords:      string
    noActiveOrder:  string
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
    localAccess: string
    signOut: string
  }
  error: {
    title: string
    message: string
    retry: string
  }
}
