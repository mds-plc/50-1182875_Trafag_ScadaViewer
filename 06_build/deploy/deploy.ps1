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
#   6. Spusti AdsAnalyzer -> DatabaseGateway -> ScadaViewer, po 20 s overi, ze vsechny bezi (chyba v configu =
#      sluzba spadne), a /api/health (hlasena verze ScadaViewer = $Version).
#
# 2.4.0 (2026-10-19): vsechny tri aplikace 2.4.0 - spolecne vydani. Vyzaduje PLC program s DUT
#   ST_APP_Dataset_Production (od 2.3.0) a ST_APP_Dataset_Testing (Recipe UINT, Microswitch_ID STRING,
#   NokCategory ARRAY[1..5]). ScadaViewer 2.4.0 maze rozpracovane zakazky jen s DatabaseGateway 2.4.0.
# 2.4.1 (2026-10-20): jen ScadaViewer 2.4.1 (Nastaveni -> Cas / NTP, nazvy parametru pohonu starsich souboru);
#   Analyzing a DatabaseGateway zustavaji 2.4.0. Nasadit lze i na stroj s 2.4.0 (skript vymeni vsechny tri).

param([switch]$Rollback, [string]$Version = '2.4.1')

$AppVersions = @{ AdsAnalyzer = '2.4.0'; DatabaseGateway = '2.4.0'; ScadaViewer = '2.4.1' }
$PlcNote     = 'Bezi na PLC NOVY program? DUT ST_APP_Dataset_Testing: Recipe UINT, Microswitch_ID STRING, NokCategory ARRAY[1..5] (2.4.0) a ST_APP_Dataset_Production: Microswitch_ID STRING, Recipe, SupplierOrder, Sorting (od 2.3.0). DatabaseGateway 2.4.0 se starym programem testy / zakazky neulozi.'

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
        Log "[VAROVANI] production\wip obsahuje $($wip.Count) soubor(u): $($wip.Name -join ', ')" 'Yellow'
        Log '           Rozpracovana zakazka se starou hlavickou (33 sloupcu, s NokReason) nove kusy odmitne - nejdriv ji uzavrete na PLC.' 'Yellow'
        if (-not (Ask 'Presto pokracovat?')) { Log 'Zruseno.'; exit 1 }
    } else { Log 'production\wip je prazdna' 'Green' }
    if ($dl.Count -gt 0) { Log "[INFO] done_local: $($dl.Count) soubor(u) jeste neni na NAS - po startu Gateway se dosynchronizuji." 'Yellow' }
} else { Log '[VAROVANI] [data] local_path v Config.toml ScadaViewer nenalezen - kontrola wip preskocena.' 'Yellow' }

if ($PlcNote) {
    Log "[PLC] $PlcNote" 'Yellow'
    if (-not (Ask 'PLC program je pripraveny?')) { Log 'Zruseno - nejdriv nahrat program do PLC.'; exit 1 }
}
if (-not (Ask "Zastavit sluzby a nasadit v$Version (Analyzing $($AppVersions.AdsAnalyzer), Gateway $($AppVersions.DatabaseGateway), ScadaViewer $($AppVersions.ScadaViewer))?")) { Log 'Zruseno.'; exit 1 }

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
Log '  2. Novy test na stroji (Op5): detail testu ukazuje ID mikrospinace a recepturu, vysledek OK / NOK.'
Log '  3. Nova zakazka: Databaze -> detail zakazky: graf kategorii (pasy OK / NOK Trafag / NOK Supplier, barvy krabic),'
Log '     filtr NOK oblasti, udaje zakazky (sarze). Prejimaci test 04_docs/acceptance_test.md body 2.2 a 3.17.'
Log '  4. Nastaveni -> Cas / NTP: sluzba Windows Time bezi, NTP server zapnuty, ohlasovani "spolehlivy zdroj" (AnnounceFlags 5),'
Log '     UDP 123 nasloucha - jinak viz ScadaViewer 04_docs/deployment.md -> Cas PC - NTP server pro IPC.'
Log '  5. Zalohy *.backup_* po overeni smazat.'
