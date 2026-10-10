param([string]$In, [string]$Pdf)
$w = New-Object -ComObject Word.Application
$w.Visible = $false
$w.DisplayAlerts = 0
try {
  $d = $w.Documents.Open($In, $false, $false)
  foreach ($toc in $d.TablesOfContents) { $toc.Update() }
  $d.Fields.Update() | Out-Null
  foreach ($toc in $d.TablesOfContents) { $toc.Update() }
  $d.Save()
  $d.ExportAsFixedFormat($Pdf, 17)
  "pages: " + $d.ComputeStatistics(2)
  $d.Close($false)
} finally { $w.Quit() }
