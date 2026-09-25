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
  switch_name:  string
  created_at:   string          // ISO datetime z prvního záznamu
  record_count: number
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
