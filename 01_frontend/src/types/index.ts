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
  sync_status?: 'done_local' | 'done_remote'  // jen pro lokální soubory
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
}
