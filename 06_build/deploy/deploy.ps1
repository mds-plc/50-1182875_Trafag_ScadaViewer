# deploy.ps1 - spolecne nasazeni Analyzing + DatabaseGateway + ScadaViewer na PC u stroje
#
# Spoustet pres deploy.bat (jako spravce). Rollback: rollback.bat
#
# Balicek = slozka s deploy.ps1 / deploy.bat / rollback.bat + ZIPy z build.bat prejmenovane na
#   Analyzing_v<verze>.zip, DatabaseGateway_v<verze>.zip, ScadaViewer_v<verze>.zip
# Verze = $Version (release, hlasi ji ScadaViewer /api/health) + $AppVersions (verze ZIPu kazde aplikace) nize;
# deploy.bat parametry nepredava -> pro novy release upravit hodnoty zde. Nasazuji se vzdy vsechny tri aplikace.
# $PlcNote: neprazdne = pred zastavenim sluzeb se zepta, zda je pripraveny PLC program (release meni DUT).
#
# Postup:
#   1. Najde slozky aplikaci podle NSSM sluzeb (AppDirectory) - nic se nehada.
#   2. Kontroly PRED jakoukoli zmenou: Config.toml existuji, Analyzing ma position_reference_um > 0,
#      DatabaseGateway: cesty na NAS lezi pod \\host\share (od 2.4.0 jinak nenastartuje),
#      production/wip je prazdna, done_local (upozorneni).
#   3. Zastavi ScadaViewer -> DatabaseGateway -> AdsAnalyzer.
#   4. Stary exe + _internal\ PRESUNE do <slozka>.backup_<cas>\ (+ kopie Config.toml / users.toml).
#   5. Rozbali novou verzi: exe, _internal\, Config.toml.example. Config.toml, users.toml, 03_output\,
#      nssm.exe a .bat skripty zustanou beze zmeny.
#   5b. NSSM (od 2.4.0): AppDirectory bez koncoveho "\", DatabaseGateway AppRotateOnline 1 + AppStopMethodConsole 15000.
#   5d. (od 2.6.0) [measurement] max_cycles v Config.toml Analyzingu a Gateway >= $MinMaxCycles (buffer PLC), jinak nastavi.
#   5c. Prejmenovani slozek s verzi v nazvu (od 2.5.0, vypnout -NoRename): rodicovska slozka aplikace ve tvaru
#      v<verze>_<RRRR-MM-DD>-<nazev> (napr. Desktop\v2.1.1_2026-09-28-AdsAnalyzer\ads_analyzer) se prejmenuje na
#      v<nova verze>_<datum z $AppDates>-<nazev>. Prepisou se vsechny odkazy na starou cestu: ImagePath sluzby (nssm.exe),
#      NSSM Application / AppDirectory / AppParameters / AppStdout / AppStderr, Config.toml vsech tri aplikaci
#      (napr. local_path ScadaViewer do vystupu Gateway), zastupci (.lnk) a .bat / .cmd v Po spusteni a na plose;
#      naplanovane ulohy se starou cestou jen nahlasi. Zaznam folder_rename.txt v zaloze -> rollback vrati nazev.
#      Jine rozlozeni (spolecna slozka, nazev bez verze) se neprejmenuje. Selze-li prejmenovani (zamceny soubor),
#      slozka zustane - nasazeni pokracuje.
#   6. Spusti AdsAnalyzer -> DatabaseGateway -> ScadaViewer, po 20 s overi, ze vsechny bezi (chyba v configu =
#      sluzba spadne), a /api/health (hlasena verze ScadaViewer = $Version).
#
# 2.4.0 (2026-10-19): vsechny tri aplikace 2.4.0 - spolecne vydani. Vyzaduje PLC program s DUT
#   ST_APP_Dataset_Production (od 2.3.0) a ST_APP_Dataset_Testing (Recipe UINT, Microswitch_ID STRING,
#   NokCategory ARRAY[1..5]). ScadaViewer 2.4.0 maze rozpracovane zakazky jen s DatabaseGateway 2.4.0.
# 2.4.1 (2026-10-20): jen ScadaViewer 2.4.1 (Nastaveni -> Cas / NTP, nazvy parametru pohonu starsich souboru);
#   Analyzing a DatabaseGateway zustavaji 2.4.0. Nasadit lze i na stroj s 2.4.0 (skript vymeni vsechny tri).
# 2.5.0 (2026-10-21): vsechny tri aplikace 2.5.0 - spolecne vydani. Nove parametry DF (Force) a FPR (Position),
#   konstanta C z PLC (MeasuredRecord.Info.Calibration.PositionReference). Vyzaduje PLC program s DUT
#   AnalyzedParams 104 B (DF, FPR), Info.Calibration a limity trideni DF / FPR (ST_APP_Recipe_Sorting_Limits_Force /
#   _Position) - jinak Analyzing hlasi E6 a DatabaseGateway Op1 PlcSymbolError. Nova datova hlavicka CSV (35 sloupcu)
#   -> rozpracovana zakazka (production\wip) musi byt pred nasazenim uzavrena (kontrola nize zastavi nasazeni).
# 2.6.0 (2026-10-22): vsechny tri aplikace 2.6.0 - spolecne vydani. Staticke odpory R_NC_Static / R_NO_Static
#   (AnalyzedParams 112 B, mez = Limits.Electric.Rezistance), max_cycles 60000 (zaznam 30 s, krok 5d), klavesnice
#   na obrazovce (kiosk), prejmenovani slozek s verzi (krok 5c). Nova datova hlavicka CSV (37 sloupcu) -> wip prazdna.
# 2.6.1 (2026-10-23): Analyzing 2.6.1 (robustni detekce FP), ScadaViewer 2.6.1 (zalozka Electric ukazuje vsechny
#   odpory, sirky sloupcu); DatabaseGateway zustava 2.6.0. Pozadavky na PLC jako 2.6.0 (AnalyzedParams 112 B).

param([switch]$Rollback, [switch]$NoRename, [string]$Version = '2.6.1')

# Datum v novem nazvu slozek (v<verze>_<datum>-<nazev>), krok 5c - datum buildu kazde aplikace; nezmenena aplikace
# (stejna verze i datum) se tak neprejmenuje znovu
$AppDates = @{ AdsAnalyzer = '2026-10-23'; DatabaseGateway = '2026-10-22'; ScadaViewer = '2026-10-23' }
# [measurement] max_cycles v Config.toml Analyzingu a Gateway musi byt >= velikost bufferu v PLC (cMEASURING_MAX_CYCLES);
# nizsi hodnota orizne zaznam mereni. Config.toml se pri nasazeni neprepisuje -> skript ho zkontroluje / nastavi (krok 5d).
$MinMaxCycles = 60000

$AppVersions = @{ AdsAnalyzer = '2.6.1'; DatabaseGateway = '2.6.0'; ScadaViewer = '2.6.1' }
$PlcNote     = 'Bezi na PLC NOVY program (2.6.0)? AnalyzedParams 112 B: Electric.R_NC_Static + R_NO_Static (na konci Electric), z 2.5.0 DF / FPR / Info.Calibration.PositionReference a limity trideni DF / FPR; cMEASURING_MAX_CYCLES = 60000. Se starym programem Analyzing hlasi E6 a DatabaseGateway kusy neulozi.'

$ErrorActionPreference = 'Stop'
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp   = Get-Date -Format 'yyyyMMdd_HHmmss'
$LogFile = Join-Path $Here "deploy_$Stamp.log"

# Poradi = poradi spousteni; zastavuje se obracene
$Apps = @(
    @{ Service = 'AdsAnalyzer';     Exe = 'ads_analyzer.exe'; Zip = "Analyzing_v$($AppVersions.AdsAnalyzer).zip";       Folder = 'ads_analyzer' },
    @{ Service = 'DatabaseGateway'; Exe = 'db_gateway.exe';   Zip = "DatabaseGateway_v$($AppVersions.DatabaseGateway).zip"; Folder = 'db_gateway'   },
    @{ Service = 'ScadaViewer';     Exe = 'scada_viewer.exe'; Zip = "ScadaViewer_v$($AppVersions.ScadaViewer).zip";     Folder = 'scada_viewer' }
)

function Log([string]$msg, [string]$color = 'Gray') {
    $line = '{0}  {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg
    Write-Host $line -ForegroundColor $color
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}
function Fail([string]$msg) { Log "[CHYBA] $msg" 'Red'; throw $msg }

function Ask([string]$question) {
    $a = Read-Host "$question [a/N]"
    return ($a -match '^(a|ano|y|yes)$')
}

# Minimalni cteni TOML: hodnota klice v dane sekci (retezec nebo cislo, bez komentare)
function Get-TomlValue([string]$file, [string]$section, [string]$key) {
    $inSection = $false
    foreach ($line in Get-Content -LiteralPath $file -Encoding UTF8) {
        $t = $line.Trim()
        if ($t -match '^\[(.+)\]$') { $inSection = ($Matches[1].Trim() -eq $section); continue }
        if ($inSection -and $t -match ('^' + [regex]::Escape($key) + '\s*=\s*(.+)$')) {
            $v = $Matches[1]
            if ($v -match '^"((?:[^"\\]|\\.)*)"') { return ($Matches[1] -replace '\\\\', '\') }
            if ($v -match "^'([^']*)'")           { return $Matches[1] }
            return ($v -split '#')[0].Trim()
        }
    }
    return $null
}

function Get-Nssm([string]$service) {
    $svc = Get-CimInstance Win32_Service -Filter "Name='$service'" -ErrorAction SilentlyContinue
    if (-not $svc) { Fail "Sluzba $service neexistuje. Nejdriv ji nainstalujte (nssm_install.bat)." }
    $exe = $svc.PathName.Trim()
    if ($exe.StartsWith('"')) { $exe = $exe.Substring(1, $exe.IndexOf('"', 1) - 1) } else { $exe = ($exe -split ' ')[0] }
    if ((Split-Path -Leaf $exe) -notmatch '^nssm') { Fail "Sluzba $service nebezi pres NSSM ($exe)." }
    return $exe
}

function Wait-ServiceState([string]$service, [string]$state, [int]$timeoutS = 60) {
    $deadline = (Get-Date).AddSeconds($timeoutS)
    while ((Get-Date) -lt $deadline) {
        if ((Get-Service $service).Status -eq $state) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Stop-Apps {
    foreach ($app in ($Apps[($Apps.Count - 1)..0])) {
        $s = $app.Service
        if ((Get-Service $s).Status -ne 'Stopped') {
            Log "Zastavuji $s ..."
            & $app.Nssm stop $s | Out-Null
            if (-not (Wait-ServiceState $s 'Stopped' 60)) { Fail "$s se nezastavila do 60 s." }
        }
        Log "  $s zastavena" 'Green'
    }
    Start-Sleep -Seconds 2   # uvolneni zamku souboru (exe, _internal)
}

function Start-Apps {
    foreach ($app in $Apps) {
        $s = $app.Service
        Log "Spoustim $s ..."
        & $app.Nssm start $s | Out-Null
        if (-not (Wait-ServiceState $s 'Running' 60)) { Log "[VAROVANI] $s nebezi - zkontrolujte $($app.Dir)\03_output\logs\" 'Yellow' }
        else { Log "  $s bezi" 'Green' }
        Start-Sleep -Seconds 3
    }
}

function Check-Health([int]$port) {
    $url = "http://localhost:$port/api/health"
    Log "Overuji $url ..."
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $h = Invoke-RestMethod -Uri $url -TimeoutSec 5
            Log ("  status={0}  version={1}  local_storage={2}  ads={3}" -f $h.status, $h.version, $h.checks.local_storage, $h.checks.ads) 'Cyan'
            return $h
        } catch { Start-Sleep -Seconds 2 }
    }
    Log "[VAROVANI] ScadaViewer neodpovida na $url - zkontrolujte logy." 'Yellow'
    return $null
}

# --- Prejmenovani slozek s verzi (krok 5c) --------------------------------------------------
$VersionedFolder = '^v\d+(\.\d+){1,3}_\d{4}-\d{2}-\d{2}-(?<name>.+)$'

# Vsechny zapisy cesty: C:\a\b, C:/a/b a TOML escapovane C:\\a\\b (bez ohledu na velikost pismen)
function Replace-PathText([string]$text, [string]$old, [string]$new) {
    if (-not $text) { return $text }
    $variants = New-Object System.Collections.ArrayList
    [void]$variants.Add(@{ From = $old;                   To = $new })
    [void]$variants.Add(@{ From = $old.Replace('\', '/');  To = $new.Replace('\', '/') })
    [void]$variants.Add(@{ From = $old.Replace('\', '\\'); To = $new.Replace('\', '\\') })
    foreach ($v in $variants) {
        $text = [regex]::Replace($text, [regex]::Escape($v.From), $v.To.Replace('$', '$$'), 'IgnoreCase')
    }
    return $text
}

# Zapis hodnoty klice v sekci TOML (radek "klic = hodnota  # komentar" - komentar zustane); klic chybi -> pridat za
# hlavicku sekce. Kodovani UTF-8 bez BOM (jako aplikace). Vraci $true pri zmene.
function Set-TomlValue([string]$file, [string]$section, [string]$key, [string]$value) {
    $lines = [System.Collections.Generic.List[string]]([IO.File]::ReadAllLines($file))
    $in = $false; $head = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $t = $lines[$i].Trim()
        if ($t -match '^\[(.+)\]$') { $in = ($Matches[1].Trim() -eq $section); if ($in) { $head = $i }; continue }
        if ($in -and $t -match ('^' + [regex]::Escape($key) + '(\s*=\s*)([^#]*?)(\s*#.*)?$')) {
            $lines[$i] = $lines[$i].Substring(0, $lines[$i].IndexOf($key)) + $key + $Matches[1] + $value + $Matches[3]
            [IO.File]::WriteAllLines($file, $lines, (New-Object Text.UTF8Encoding $false))
            return $true
        }
    }
    if ($head -lt 0) { return $false }
    $lines.Insert($head + 1, "$key = $value")
    [IO.File]::WriteAllLines($file, $lines, (New-Object Text.UTF8Encoding $false))
    return $true
}

function Get-NssmParam([string]$nssm, [string]$service, [string]$param) {
    return ((& $nssm get $service $param 2>$null) -join '' -replace "`0", '').Trim()
}

# Prejmenuje rodicovskou slozku aplikace $from -> $to a prepise odkazy sluzby (ImagePath + NSSM parametry).
# Sluzba musi byt zastavena. Vraci $true / $false (chyba = slozka zustane, nic se neprepise).
function Move-AppParent($app, [string]$from, [string]$to) {
    $svcKey   = "HKLM:\SYSTEM\CurrentControlSet\Services\$($app.Service)"
    $image    = (Get-ItemProperty -LiteralPath $svcKey -Name ImagePath).ImagePath
    $params   = @{}
    foreach ($n in 'Application', 'AppDirectory', 'AppParameters', 'AppStdout', 'AppStderr') {
        $params[$n] = Get-NssmParam $app.Nssm $app.Service $n
    }
    try { Rename-Item -LiteralPath $from -NewName (Split-Path -Leaf $to) -ErrorAction Stop }
    catch {
        Log "[VAROVANI] $($app.Service): slozku $from nelze prejmenovat ($($_.Exception.Message)) - zustava, nasazeni pokracuje." 'Yellow'
        return $false
    }
    $newImage = Replace-PathText $image $from $to
    if ($newImage -ne $image) { Set-ItemProperty -LiteralPath $svcKey -Name ImagePath -Value $newImage }
    $app.Nssm = Replace-PathText $app.Nssm $from $to
    foreach ($n in $params.Keys) {
        $nv = Replace-PathText $params[$n] $from $to
        if ($params[$n] -and $nv -ne $params[$n]) { & $app.Nssm set $app.Service $n $nv | Out-Null }
    }
    $app.Dir = Replace-PathText $app.Dir $from $to
    Log "  $($app.Service): slozka prejmenovana -> $to (sluzba NSSM prepsana)" 'Green'
    return $true
}

# Odkazy mimo sluzbu: Config.toml vsech aplikaci, zastupci a skripty v Po spusteni / na plose, naplanovane ulohy
function Update-PathReferences($pairs) {
    if ($pairs.Count -eq 0) { return }
    foreach ($app in $Apps) {
        $cfg = Join-Path $app.Dir 'Config.toml'
        if (-not (Test-Path -LiteralPath $cfg)) { continue }
        $text = [IO.File]::ReadAllText($cfg)
        $new  = $text
        foreach ($p in $pairs) { $new = Replace-PathText $new $p.From $p.To }
        if ($new -ne $text) {
            [IO.File]::WriteAllText($cfg, $new, (New-Object Text.UTF8Encoding $false))
            Log "  $($app.Service): cesty v Config.toml prepsany (zaloha v *.backup_$Stamp)" 'Green'
        }
    }
    # DatabaseGateway sync_state.json (+ .bak) uklada ABSOLUTNI cesty souboru (local_path) - vychozi
    # local_base_dir = 03_output lezi ve slozce Gateway -> bez prepsani by se nedosynchronizovane soubory nenasly
    $gwApp  = $Apps | Where-Object { $_.Service -eq 'DatabaseGateway' } | Select-Object -First 1
    $gwBase = Get-TomlValue (Join-Path $gwApp.Dir 'Config.toml') 'storage' 'local_base_dir'
    if (-not $gwBase) { $gwBase = '03_output' }
    if (-not [IO.Path]::IsPathRooted($gwBase)) { $gwBase = Join-Path $gwApp.Dir $gwBase }
    foreach ($name in 'sync_state.json', 'sync_state.json.bak') {
        $f = Join-Path $gwBase $name
        if (-not (Test-Path -LiteralPath $f)) { continue }
        $text = [IO.File]::ReadAllText($f); $new = $text
        foreach ($p in $pairs) { $new = Replace-PathText $new $p.From $p.To }
        if ($new -ne $text) { [IO.File]::WriteAllText($f, $new, (New-Object Text.UTF8Encoding $false)); Log "  DatabaseGateway: cesty v $name prepsany" 'Green' }
    }
    $shell = New-Object -ComObject WScript.Shell
    $dirs  = @('CommonStartup', 'Startup', 'CommonDesktopDirectory', 'Desktop') |
             ForEach-Object { [Environment]::GetFolderPath($_) } | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
    foreach ($d in $dirs) {
        foreach ($f in Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue) {
            if ($f.Extension -eq '.lnk') {
                $lnk = $shell.CreateShortcut($f.FullName); $changed = $false
                foreach ($p in $pairs) {
                    foreach ($prop in 'TargetPath', 'WorkingDirectory', 'Arguments', 'IconLocation') {
                        $v = $lnk.$prop; $nv = Replace-PathText $v $p.From $p.To
                        if ($v -and $nv -ne $v) { $lnk.$prop = $nv; $changed = $true }
                    }
                }
                if ($changed) { $lnk.Save(); Log "  zastupce upraven: $($f.FullName)" 'Green' }
            } elseif ($f.Extension -in '.bat', '.cmd') {
                $text = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::Default); $new = $text
                foreach ($p in $pairs) { $new = Replace-PathText $new $p.From $p.To }
                if ($new -ne $text) { [IO.File]::WriteAllText($f.FullName, $new, [Text.Encoding]::Default); Log "  skript upraven: $($f.FullName)" 'Green' }
            }
        }
    }
    try {
        foreach ($t in Get-ScheduledTask -ErrorAction Stop) {
            foreach ($a in $t.Actions) {
                $s = "$($a.Execute) $($a.Arguments) $($a.WorkingDirectory)"
                foreach ($p in $pairs) {
                    if ($s.IndexOf($p.From, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                        Log "[VAROVANI] Naplanovana uloha '$($t.TaskPath)$($t.TaskName)' odkazuje na $($p.From) - upravte ji rucne (Planovac uloh)." 'Yellow'
                    }
                }
            }
        }
    } catch { Log '[INFO] Naplanovane ulohy nelze projit - zkontrolujte rucne.' 'Gray' }
}

# ---------------------------------------------------------------------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Fail 'Spustte jako spravce (deploy.bat to zaridi sam).' }

Log "=== ScadaViewer ekosystem v$Version - $(if ($Rollback) { 'ROLLBACK' } else { 'NASAZENI' }) ===" 'Cyan'
Log "Log: $LogFile"

# 1. Slozky aplikaci podle NSSM
foreach ($app in $Apps) {
    $app.Nssm = Get-Nssm $app.Service
    $raw = ((& $app.Nssm get $app.Service AppDirectory) -join '' -replace "`0", '').Trim()
    $app.DirRaw = $raw
    $dir = $raw.Trim('"').TrimEnd('\')
    if (-not (Test-Path -LiteralPath (Join-Path $dir $app.Exe))) { Fail "$($app.Service): $($app.Exe) neni v $dir" }
    $app.Dir = $dir
    Log ("{0,-16} {1}" -f $app.Service, $dir)
}
$sv     = $Apps[2]
$svCfg  = Join-Path $sv.Dir 'Config.toml'
$port   = Get-TomlValue $svCfg 'server' 'port'; if (-not $port) { $port = 8080 }

# ---------------------------------------------------------------------------------------------
if ($Rollback) {
    foreach ($app in $Apps) {
        $b = Get-ChildItem -LiteralPath (Split-Path $app.Dir) -Directory -Filter ((Split-Path -Leaf $app.Dir) + '.backup_*') |
             Sort-Object Name -Descending | Select-Object -First 1
        if (-not $b) { Fail "$($app.Service): zadna zaloha $($app.Dir).backup_* nenalezena." }
        $app.Backup = $b.FullName
        Log "$($app.Service): obnovim z $($b.FullName)"
    }
    if (-not (Ask 'Obnovit predchozi verzi vsech tri aplikaci?')) { Log 'Zruseno.'; exit 1 }
    Stop-Apps
    foreach ($app in $Apps) {
        Remove-Item -LiteralPath (Join-Path $app.Dir '_internal') -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $app.Dir $app.Exe) -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $app.Backup '_internal') -Destination $app.Dir -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $app.Backup $app.Exe)    -Destination $app.Dir -Force
        Log "  $($app.Service) obnoven (Config.toml beze zmeny - zaloha je v $($app.Backup))" 'Green'
    }
    # Nasazeni prejmenovalo slozky (folder_rename.txt v zaloze) -> vratit puvodni nazev a odkazy
    $back = New-Object System.Collections.ArrayList
    foreach ($app in $Apps) {
        $rec = Join-Path $app.Backup 'folder_rename.txt'
        if (-not (Test-Path -LiteralPath $rec)) { continue }
        $l = @(Get-Content -LiteralPath $rec -Encoding UTF8)
        if ($l.Count -ge 2 -and (Split-Path $app.Dir) -eq $l[1] -and -not (Test-Path -LiteralPath $l[0])) {
            if (Move-AppParent $app $l[1] $l[0]) { [void]$back.Add(@{ From = $l[1]; To = $l[0] }) }
        }
    }
    Update-PathReferences $back
    Start-Apps
    Check-Health $port | Out-Null
    Log '=== Rollback hotov ===' 'Cyan'
    exit 0
}

# ---------------------------------------------------------------------------------------------
# 2. Kontroly pred zmenou
foreach ($app in $Apps) {
    $zip = Join-Path $Here $app.Zip
    if (-not (Test-Path -LiteralPath $zip)) { Fail "Chybi $zip" }
    $app.ZipPath = $zip
    if (-not (Test-Path -LiteralPath (Join-Path $app.Dir 'Config.toml'))) { Fail "$($app.Service): chybi Config.toml v $($app.Dir)" }
}

try { $old = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 5; Log "Aktualni verze ScadaViewer: $($old.version)" }
catch { Log 'Aktualni verze ScadaViewer: (neodpovida)' 'Yellow' }

$anCfg = Join-Path $Apps[0].Dir 'Config.toml'
$c = Get-TomlValue $anCfg 'measurement' 'position_reference_um'
if (-not $c -or [double]::Parse($c, [Globalization.CultureInfo]::InvariantCulture) -le 0) {
    Log "[CHYBA] Analyzing Config.toml nema [measurement] position_reference_um > 0 (ted: '$c')." 'Red'
    Log '        Verze 2.2.0 bez nej zapise polohy na stupnici enkoderu misto souradnic zakaznika.' 'Red'
    Log "        Doplnte do sekce [measurement] v $anCfg :" 'Red'
    Log '            position_reference_um = 9500.0   # provizorni - kalibrovat' 'Red'
    Fail 'Chybi position_reference_um.'
}
Log "Analyzing position_reference_um = $c" 'Green'

# max_cycles (Analyzing + Gateway) - mensi nez buffer PLC orizne zaznam mereni; uprava az po zaloze (krok 5d)
$CycleFix = New-Object System.Collections.ArrayList
foreach ($app in $Apps[0..1]) {
    $cfg = Join-Path $app.Dir 'Config.toml'
    $mcv = Get-TomlValue $cfg 'measurement' 'max_cycles'
    $mcn = 0; [void][int]::TryParse(("$mcv" -replace '_', ''), [ref]$mcn)
    if ($mcn -ge $MinMaxCycles) { Log "$($app.Service) max_cycles = $mcn" 'Green'; continue }
    Log "[UPRAVA] $($app.Service) Config.toml [measurement] max_cycles = '$mcv' -> $MinMaxCycles (PLC cMEASURING_MAX_CYCLES, zaznam 30 s)" 'Yellow'
    [void]$CycleFix.Add($app)
}

# DatabaseGateway 2.4.0: s vyplnenym [server] host musi production_path / testing_path lezet pod \\host\share,
# jinak sluzba nenastartuje (audit 2026-10-18 - upload pod jinym nazvem serveru by sel bez prihlaseni)
$gwCfg  = Join-Path $Apps[1].Dir 'Config.toml'
$gwHost = Get-TomlValue $gwCfg 'server' 'host'
if ($gwHost) {
    $gwShare = Get-TomlValue $gwCfg 'server' 'share'
    $root    = ("\\$gwHost\$gwShare").ToLower()
    foreach ($k in 'production_path', 'testing_path') {
        $p = Get-TomlValue $gwCfg 'server' $k
        if (-not $p -or -not ($p.ToLower() -eq $root -or $p.ToLower().StartsWith("$root\"))) {
            Log "[CHYBA] DatabaseGateway Config.toml: [server] $k = '$p' nelezi pod \\$gwHost\$gwShare." 'Red'
            Log "        Verze 2.4.0 s takovym nastavenim nenastartuje. Oprava v $gwCfg :" 'Red'
            Log "            $k = ""\\\\$gwHost\\$gwShare\\...""   (stejny host jako v [server] host)" 'Red'
            Fail "DatabaseGateway: $k mimo \\host\share."
        }
    }
    Log "DatabaseGateway NAS cesty lezi pod \\$gwHost\$gwShare" 'Green'
} else { Log 'DatabaseGateway [server] host prazdny - NAS se nepripojuje automaticky (cmdkey / ucet sluzby)' 'Gray' }

$local = Get-TomlValue $svCfg 'data' 'local_path'
if ($local) {
    if (-not [IO.Path]::IsPathRooted($local)) { $local = Join-Path $sv.Dir $local }
    $wip = @(Get-ChildItem -LiteralPath (Join-Path $local 'production\wip') -File -ErrorAction SilentlyContinue)
    $dl  = @(Get-ChildItem -LiteralPath (Join-Path $local 'production\done_local') -File -ErrorAction SilentlyContinue) +
           @(Get-ChildItem -LiteralPath (Join-Path $local 'testing\done_local') -File -ErrorAction SilentlyContinue)
    if ($wip.Count -gt 0) {
        # 2.5.0: nova datova hlavicka (DF, FPR, PositionReference) - Gateway do WIP se starou hlavickou kus neprida
        Log "[CHYBA] production\wip obsahuje $($wip.Count) soubor(u): $($wip.Name -join ', ')" 'Red'
        Log '        Rozpracovanou zakazku nejdriv uzavrete na PLC (Op3) - DatabaseGateway 2.5.0 do souboru se starou' 'Red'
        Log '        hlavickou (bez DF / FPR / PositionReference) dalsi kusy neprida. Potom spustte deploy.bat znovu.' 'Red'
        exit 1
    } else { Log 'production\wip je prazdna' 'Green' }
    if ($dl.Count -gt 0) { Log "[INFO] done_local: $($dl.Count) soubor(u) jeste neni na NAS - po startu Gateway se dosynchronizuji." 'Yellow' }
} else { Log '[VAROVANI] [data] local_path v Config.toml ScadaViewer nenalezen - kontrola wip preskocena.' 'Yellow' }

# Plan prejmenovani slozek (krok 5c) - kontrola pred zastavenim sluzeb
$Renames = New-Object System.Collections.ArrayList
if (-not $NoRename) {
    $parents = @($Apps | ForEach-Object { Split-Path $_.Dir })
    foreach ($app in $Apps) {
        $parent = Split-Path $app.Dir
        $leaf   = Split-Path -Leaf $parent
        if ($leaf -notmatch $VersionedFolder) { Log "Slozka $parent nema nazev v<verze>_<datum>-<nazev> - neprejmenuje se." 'Gray'; continue }
        if (@($parents | Where-Object { $_ -eq $parent }).Count -gt 1) { Log "[INFO] $parent sdili vic aplikaci - neprejmenuje se." 'Yellow'; continue }
        $target = Join-Path (Split-Path $parent) ("v{0}_{1}-{2}" -f $AppVersions[$app.Service], $AppDates[$app.Service], $Matches['name'])
        if ($target -eq $parent) { Log "$($app.Service): slozka uz ma spravny nazev" 'Gray'; continue }
        if (Test-Path -LiteralPath $target) { Fail "$($app.Service): cilova slozka $target uz existuje - prejmenujte / smazte ji, nebo spustte s -NoRename." }
        $app.RenameTo = $target
        [void]$Renames.Add($app)
        Log ("Prejmenuje se: {0}  ->  {1}" -f $parent, (Split-Path -Leaf $target)) 'Cyan'
    }
}

if ($PlcNote) {
    Log "[PLC] $PlcNote" 'Yellow'
    if (-not (Ask 'PLC program je pripraveny?')) { Log 'Zruseno - nejdriv nahrat program do PLC.'; exit 1 }
}
$renameText = if ($Renames.Count -gt 0) { " a prejmenovat $($Renames.Count) slozk(y)" } else { '' }
if (-not (Ask "Zastavit sluzby a nasadit v$Version (Analyzing $($AppVersions.AdsAnalyzer), Gateway $($AppVersions.DatabaseGateway), ScadaViewer $($AppVersions.ScadaViewer))$renameText?")) { Log 'Zruseno.'; exit 1 }

# 3. Rozbaleni do docasne slozky (pred zastavenim - kratsi odstavka)
$tmp = Join-Path $Here "_unpack_$Stamp"
foreach ($app in $Apps) {
    $dst = Join-Path $tmp $app.Service
    Expand-Archive -LiteralPath $app.ZipPath -DestinationPath $dst -Force
    $app.New = Join-Path $dst $app.Folder
    if (-not (Test-Path -LiteralPath (Join-Path $app.New $app.Exe))) { Fail "$($app.Zip): neobsahuje $($app.Folder)\$($app.Exe)" }
    Log "Rozbaleno $($app.Zip)"
}

# 4. Zastavit
Stop-Apps

# 5. Zaloha + vymena
foreach ($app in $Apps) {
    $backup = "$($app.Dir).backup_$Stamp"
    New-Item -ItemType Directory -Path $backup | Out-Null
    $app.Backup = $backup
    Move-Item -LiteralPath (Join-Path $app.Dir '_internal') -Destination $backup
    Move-Item -LiteralPath (Join-Path $app.Dir $app.Exe)    -Destination $backup
    foreach ($f in 'Config.toml', 'users.toml') {
        $p = Join-Path $app.Dir $f
        if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination $backup }
    }
    Copy-Item -LiteralPath (Join-Path $app.New '_internal') -Destination $app.Dir -Recurse
    Copy-Item -LiteralPath (Join-Path $app.New $app.Exe)    -Destination $app.Dir
    $ex = Join-Path $app.New 'Config.toml.example'
    if (Test-Path -LiteralPath $ex) { Copy-Item -LiteralPath $ex -Destination $app.Dir -Force }
    # chybejici pomocne skripty doplnit, existujici (mozna upravene) neprepisovat
    Get-ChildItem -LiteralPath $app.New -Filter '*.bat' | ForEach-Object {
        if (-not (Test-Path -LiteralPath (Join-Path $app.Dir $_.Name))) { Copy-Item -LiteralPath $_.FullName -Destination $app.Dir }
    }
    Log "  $($app.Service): vymeneno, zaloha $backup" 'Green'
}
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

# 5b. NSSM nastaveni (2.4.0): AppDirectory bez koncoveho "\" (starsi nssm_install.bat ho predaval jako
#     escapovanou uvozovku), Gateway: rotace stdout logu za behu + 15 s na dokonceni operace / uploadu pri stopu
foreach ($app in $Apps) {
    if ($app.DirRaw -ne $app.Dir) {
        & $app.Nssm set $app.Service AppDirectory $app.Dir | Out-Null
        Log "  $($app.Service): AppDirectory opraveno na $($app.Dir) (bylo '$($app.DirRaw)')" 'Green'
    }
}
$gw = $Apps[1]
& $gw.Nssm set $gw.Service AppRotateOnline 1 | Out-Null
& $gw.Nssm set $gw.Service AppStopMethodConsole 15000 | Out-Null
Log '  DatabaseGateway: NSSM AppRotateOnline 1, AppStopMethodConsole 15000' 'Green'

# 5d. max_cycles v Config.toml (Config.toml je zalohovany v *.backup_$Stamp)
foreach ($app in $CycleFix) {
    $cfg = Join-Path $app.Dir 'Config.toml'
    if (Set-TomlValue $cfg 'measurement' 'max_cycles' "$MinMaxCycles") { Log "  $($app.Service): max_cycles = $MinMaxCycles" 'Green' }
    else { Log "[VAROVANI] $($app.Service): sekce [measurement] v $cfg nenalezena - max_cycles nastavte rucne." 'Yellow' }
}

# 5c. Prejmenovani slozek s verzi + prepsani odkazu (sluzby jsou zastavene)
$done = New-Object System.Collections.ArrayList
foreach ($app in $Renames) {
    $from = Split-Path $app.Dir
    # zaznam pro rollback - zaloha lezi v rodicovske slozce, presune se s ni
    [IO.File]::WriteAllLines((Join-Path $app.Backup 'folder_rename.txt'), [string[]]@($from, $app.RenameTo))
    if (Move-AppParent $app $from $app.RenameTo) {
        [void]$done.Add(@{ From = $from; To = $app.RenameTo })
        $app.Backup = Replace-PathText $app.Backup $from $app.RenameTo
    }
}
Update-PathReferences $done

# 6. Spustit + overit
Start-Apps
# Sluzba s chybou v Config.toml se ukonci hned po startu (od 2.4.0 i bez Config.toml) - NSSM ji pak restartuje
# nebo pozastavi; po 20 s musi vsechny bezet
Log 'Kontrola za 20 s, ze sluzby po startu nespadly ...'
Start-Sleep -Seconds 20
$down = @($Apps | Where-Object { (Get-Service $_.Service).Status -ne 'Running' })
foreach ($app in $down) {
    Log "[CHYBA] $($app.Service) nebezi ($((Get-Service $app.Service).Status)) - log: $($app.Dir)\03_output\logs\ (stderr: chyba v Config.toml?)" 'Red'
}
$h = Check-Health $port
if ($down.Count -eq 0 -and $h -and $h.version -eq $Version) { Log "=== Nasazeno: v$Version, ScadaViewer hlasi $($h.version) ===" 'Green' }
else { Log "[VAROVANI] Nasazeni neni v poradku (nebezici sluzby / /api/health nehlasi $Version) - zkontrolujte logy, pripadne rollback.bat" 'Yellow' }

Log ''
Log 'Dalsi kroky (rucne):'
Log '  1. Logy vsech tri aplikaci: zadne "[SVC] Config: neznamy klic" (Analyzing) ani chyby pri startu.'
Log '  2. Novy test na stroji (Op5): detail testu ukazuje ID mikrospinace a recepturu, vysledek OK / NOK,'
Log '     v Mereni konstantu C, ve Vysledcich DF a FPR, v Signal Data bod FPR (Hystereze: hodnoty v radku nad grafem).'
Log '     Log Analyzingu po pripojeni: "In.Data.AnalyzedParams: 112 B - souhlasi", zadne E6 / W8.'
Log '     Vysledky testu: staticke odpory R NC stat / R NO stat (dobry kus pod ~50 mOhm), diagram kusu: box Static.'
Log '  3. Nova zakazka: Databaze -> detail zakazky: graf kategorii (pasy OK / NOK Trafag / NOK Supplier, barvy krabic),'
Log '     filtr NOK oblasti, udaje zakazky (sarze, limity DF / FPR), podbarveni mimo limity (Trafag / vyrobce / oboji),'
Log '     detail kusu: polohy FP / RP / OP / TTP s hodnotami, bod FPR, DF. Prejimaci test 04_docs/acceptance_test.md body 2.2 a 3.17.'
Log '  4. Nastaveni -> Cas / NTP: sluzba Windows Time bezi, NTP server zapnuty, ohlasovani "spolehlivy zdroj" (AnnounceFlags 5),'
Log '     UDP 123 nasloucha - jinak viz ScadaViewer 04_docs/deployment.md -> Cas PC - NTP server pro IPC.'
Log '  5. Kiosk: klepnuti do hledani zakazky ukaze klavesnici na obrazovce (Nastaveni -> Predvolby: Automaticky).'
Log '  6. Zalohy *.backup_* po overeni smazat.'
