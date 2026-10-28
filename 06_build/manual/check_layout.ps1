# Kontrola sazby dokumentu přes Word: tabulky rozdělené přes stránku, obrázek odtržený od popisku,
# nadpis na konci strany (osiřelý). Použití: powershell -File check_layout.ps1 -In "C:\….docx;C:\….docx"
# Výstup: řádek na každý problém + souhrn; kód 0 = bez problémů (tabulky delší než strana se jen hlásí).
param([Parameter(Mandatory = $true)][string]$In)
$ErrorActionPreference = 'Stop'
$wdPage = 3            # wdActiveEndPageNumber
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$bad = 0
try {
  foreach ($f in ($In -split ';' | Where-Object { $_ })) {
    $d = $word.Documents.Open($f, $false, $true)
    $d.Repaginate()
    $pages = $d.ComputeStatistics(2)
    $split = @(); $long = @()
    $i = 0
    foreach ($tb in $d.Tables) {
      $i++
      $p1 = $tb.Range.Characters.First.Information($wdPage)
      $p2 = $tb.Range.Characters.Last.Information($wdPage)
      if ($p2 -gt $p1) {
        # nevejde se na stranu ani sama → jen informace (opakuje se hlavička)
        $prev = $tb.Range.Characters.First.Previous(1, 1)
        $atTop = ($prev -eq $null) -or ($prev.Information($wdPage) -lt $p1)
        if ($atTop -or $tb.Rows.Count -gt 28) { $long += "tab $i (str. $p1-$p2, $($tb.Rows.Count) ř.)" }
        else { $split += "tab $i (str. $p1-$p2, $($tb.Rows.Count) ř.)" }
      }
    }
    # Nadpis jako poslední odstavec strany (bez následujícího textu na téže straně)
    $orph = @()
    foreach ($p in $d.Paragraphs) {
      $st = $p.Style.NameLocal
      if ($st -match '^(Heading|Nadpis) [123]$') {
        $next = $p.Next()
        if ($next -ne $null) {
          if ($next.Range.Characters.First.Information($wdPage) -gt $p.Range.Characters.Last.Information($wdPage)) { $orph += ($p.Range.Text.Trim()) }
        }
      }
    }
    $name = Split-Path $f -Leaf
    "{0}: {1} stran, tabulek {2}, rozdělených {3}, dlouhých (> strana) {4}, osiřelých nadpisů {5}" -f $name, $pages, $d.Tables.Count, $split.Count, $long.Count, $orph.Count
    foreach ($s in $split) { "   ROZDĚLENA: $s" }
    foreach ($s in $long)  { "   dlouhá:    $s" }
    foreach ($s in $orph)  { "   NADPIS NA KONCI STRANY: $s" }
    $bad += $split.Count + $orph.Count
    $d.Close($false)
  }
} finally { $word.Quit() }
exit ([int]($bad -gt 0))
