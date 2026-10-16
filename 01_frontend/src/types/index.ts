// ============================================================
// Sdílené TypeScript typy — odpovídají backend datovým modelům
// ============================================================

/** Live stav PLC přijatý přes WebSocket */
export interface PlcStatus {
  symbol: string
  value: boolean | number | string
  ts: string  // ISO datetime
}

/** Metadata zakázkového souboru */
export interface OrderFile extends Record<string, unknown> {
  file_id:      string
  name:         string
  type:         'production' | 'testing'
  location:     'local' | 'remote'
  order_id:     string | null   // null pro testovací soubory
  switch_name:  string          // název mikrospínače (Microswitch_Name)
  /** ID mikrospínače (Microswitch_ID = SAP číslo) — jen soubory z Gateway 2.3.0+, jinak '' */
  switch_id?:   string
  created_at:   string          // ISO datetime z prvního záznamu
  record_count: number | null   // null = počet kusů se ještě dopočítává (přehled jde z názvů souborů)
  sync_status?: 'wip' | 'done_local' | 'done_remote'  // jen pro lokální soubory; 'wip' = rozpracovaná zakázka
}

/** Jeden záznam z CSV souboru (klíče normalizovány na lowercase) */
export interface CsvRecord extends Record<string, unknown> {
  timestamp:        string
  microswitch_id:   string
  microswitch_name: string
  order?:           string   // pouze production
  group?:           number   // skupina třídění 1–6
  expected_count?:  number   // očekávaný počet mikrospínačů v zakázce
}

/** Parametry filtru pro /api/data */
export interface DataFilter {
  file:      string
  location?: string
  type?:     string
  from?:     string
  to?:       string
  page?:     number   // stránka (od 1); default 1
  perPage?:  number   // počet záznamů; 0 = vše; default 200
  /** Filtr detailu zakázky — 'ok' (kategorie 1–4) / 'nok' (5–6) */
  status?:     'ok' | 'nok'
  /** Filtr kategorií '1'–'6'; prázdné = bez filtru */
  categories?: string[]
  /** Řazení kusů — 'asc' od nejstaršího (výchozí), 'desc' od nejnovějšího (záznamy pak nesou `_idx`) */
  order?:      'asc' | 'desc'
}

/** Zaplnění lokálního úložiště — GET /api/storage */
export interface StorageStatus {
  used_bytes:       number
  limit_bytes:      number
  percent:          number                          // zaplnění limitu [%]
  level:            'ok' | 'warning' | 'critical'   // ≥ 80 % varování, ≥ 95 % kritické (nebo málo místa na disku)
  file_count:       number
  synced_bytes:     number                          // done_remote/ — lze vyčistit
  synced_count:     number
  disk_total_bytes: number | null
  disk_free_bytes:  number | null
  disk_low:         boolean                         // na disku zbývá < 10 %
  /** Zaplnění NAS (sdílená složka; s kvótou na Synology = kvóta). null = NAS není nastavený */
  nas?:             NasStorage | null
}

/** Zaplnění sdílené složky NAS — GET /api/storage → nas */
export interface NasStorage {
  available:   boolean
  total_bytes: number | null
  used_bytes:  number | null
  free_bytes:  number | null
  percent:     number | null
  level:       'ok' | 'warning' | 'critical' | null
}

/** Výsledek POST /api/storage/cleanup */
export interface CleanupResult {
  deleted:     number
  freed_bytes: number
  skipped:     number   // na NAS chybí / nesedí velikost — ponecháno
  failed:      number
}

/** Časový průběh zakázky — GET /api/timeline (sloupcový formát, seřazeno podle času) */
export interface OrderTimeline {
  timestamps: string[]            // ISO 8601
  categories: (number | null)[]   // kategorie 1–6 ke každé časové značce
}

// ── Údaje zakázky (blokový PROD_ soubor, DatabaseGateway 2.3.0+) — /api/data order_info ──

/** Hodnota z [TestingParameters] — název a jednotka z hlavičky CSV */
export interface OrderParam {
  key:   string
  name:  string
  unit:  string
  value: string | null
}

/** Mez kategorie třídění 1–6; min / max null = kategorie se nepoužívá */
export interface SortingGroup {
  group: number
  min:   string | null
  max:   string | null
}

/** Limit parametru — Trafag (min / max) a výrobce (min_supplier / max_supplier); null = neaktivní */
export interface SortingLimit {
  key:          string
  name:         string
  unit:         string
  max:          string | null
  min:          string | null
  max_supplier: string | null
  min_supplier: string | null
}

export interface OrderInfo {
  recipe:             string | null
  /** Šarže výrobce v pořadí výskytu (seznam za zakázku, bez vazby na kus) */
  lots:               string[]
  testing_parameters: OrderParam[]
  sorting_categories: { grouping_value: string | null; unit: string; groups: SortingGroup[] } | null
  sorting_limits:     SortingLimit[]
}
