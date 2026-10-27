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
#      production/wip je prazdna (jen kdyz vydani meni hlavicku CSV - $WipBlocksDeploy; jinak upozorneni), done_local (upozorneni).
#   3. Rozbali ZIPy do docasne slozky (jeste pred zastavenim - kratsi odstavka).
#   4. Zastavi ScadaViewer -> DatabaseGateway -> AdsAnalyzer (pri $WipBlocksDeploy znovu zkontroluje production\wip).
#   5. Stary exe + _internal\ PRESUNE do <slozka>.backup_<cas>\ (+ kopie Config.toml / users.toml) a nasadi novou
#      verzi: exe, _internal\, Config.toml.example. Config.toml, users.toml, 03_output\, nssm.exe a .bat zustanou.
#   5b. NSSM (od 2.4.0): AppDirectory bez koncoveho "\", DatabaseGateway AppRotateOnline 1 + AppStopMethodConsole 15000.
#   5d. (od 2.6.0) [measurement] max_cycles v Config.toml Analyzingu a Gateway >= $MinMaxCycles (buffer PLC), jinak nastavi;
#       (od 2.6.6) [analysis.detection] Analyzingu podle $AnSettings (op_definition, staticke odpory).
#   5c. Prejmenovani slozek s verzi v nazvu (od 2.5.0, vypnout -NoRename): rodicovska slozka aplikace ve tvaru
#      v<verze>_<RRRR-MM-DD>-<nazev> (napr. Desktop\v2.1.1_2026-09-28-AdsAnalyzer\ads_analyzer) se prejmenuje na
#      v<nova verze>_<datum z $AppDates>-<nazev>. Prepisou se vsechny odkazy na starou cestu: ImagePath sluzby (nssm.exe),
#      NSSM Application / AppDirectory / AppParameters / AppStdout / AppStderr, Config.toml vsech tri aplikaci
#      (napr. local_path ScadaViewer do vystupu Gateway), zastupci (.lnk) a .bat / .cmd v Po spusteni a na plose;
#      naplanovane ulohy se starou cestou jen nahlasi. Zaznam folder_rename.txt v zaloze -> rollback vrati nazev.
#      Jine rozlozeni (spolecna slozka, nazev bez verze) se neprejmenuje. Selze-li prejmenovani (zamceny soubor),
#      slozka zustane - nasazeni pokracuje.
#      Presun mimo profil uzivatele (od 2026-10-23, smernice Trafag pro OT - lokalni ucet admin se ma vypnout): lezi-li
#      aplikace v C:\Users\..., skript nabidne presun do $DefaultAppsRoot (-MoveTo <slozka> jinam, -NoMove vypne).
#      Rodicovska slozka se presune i s prejmenovanim, odkazy se prepisou stejne jako u prejmenovani; nova
#      $DefaultAppsRoot dostane prava jen Administrators + SYSTEM (plna) a ucty sluzeb (zapis), Users zadna -
#      Config.toml obsahuje heslo k NAS a hash admina. Presunute slozky prevezmou prava od ni (icacls /reset).
#   5e. (od 2.6.2) lokalni databaze z profilu uzivatele do $DefaultDataRoot (-MoveDataTo / -NoMoveData): presun slozky,
#      Config.toml Gateway + ScadaViewer a sync_state.json, zaznam data_move.txt v zaloze Gateway (rollback vrati);
#      s rozpracovanou zakazkou se presun preskoci.
#   Selhani v krocich 5-5e (od 2026-10-25, audit A26-04): skript vrati presuny slozek, exe + _internal a Config.toml
#      ze zalohy (vc. presunu databaze), spusti sluzby a skonci chybou - bezi predchozi verze.
#   Rollback (A26-05): last_deploy.txt v balicku = razitko posledniho nasazeni; rollback obnovi jen zalohy s nim
#      (aplikace bez takove zalohy se jen restartuje). Bez zaznamu (starsi nasazeni) musi byt zalohy ze stejneho behu.
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
# 2.6.2 (2026-10-26): vsechny tri aplikace 2.6.2 - opravy celkoveho auditu A26 (fsync, kus bez mereni = odpory 9999,9,
#   vychozi heslo, odhlaseni po necinnosti, Op5 pri vypadku ADS, heartbeat, misto na disku ...). Format CSV beze zmeny.
#   Pozadavky na PLC jako 2.6.0; Gateway nove posila WarningCode 2 (test bez signalu) a 3 (malo mista na disku).
# 2.6.3 (2026-10-26): jen ScadaViewer 2.6.3 - admin u stroje muze dokoncit rozpracovanou zakazku (Databaze ->
#   In progress -> Dokoncit zakazku). Analyzing a DatabaseGateway zustavaji 2.6.2, PLC ani format CSV beze zmeny.
# 2.6.4 (2026-10-26): jen ScadaViewer 2.6.4 - PLC prihlaseni (UserLoggedIn = nejvyssi autorita na PLC) ma prava admina,
#   jen dokud prihlaseni na PLC trva.
# 2.6.5 (2026-10-27): jen ScadaViewer 2.6.5 - export XLSX podle vzoru Gateway (sample_production.xlsx), bez odkazu
#   na repozitar. Format CSV ani PLC beze zmeny.
# 2.6.6 (2026-10-27): Analyzing 2.6.3 + ScadaViewer 2.6.6 (Gateway 2.6.2). Analyzing: RT_RealisingTravel = |RP - FP|
#   (Leerlaufweg, DIN 41636-1; driv |TTP - RP|, hodnoty cca 550-730 um misto 850-1320), OP = prvni sepnuti NO
#   (op_definition "no_close"), staticke odpory (NC bez 50 % PT, NO 100 um). Format CSV a PLC DUT beze zmeny,
#   ale LIMITY RT v recepturach PLC se musi prenastavit. Krok 5d nastavi [analysis.detection] v Config.toml.
#   Rozpracovana zakazka nasazeni zastavi ($WipBlocksDeploy) - jeji kusy by mely RT / OP jinak nez limity zakazky.
# 2.6.7 (2026-10-27): jen ScadaViewer 2.6.7 - u stroje CSV / XLSX jen na flashku (admin), ukazatel USB + bezpecne odebrani v Databazi.
# 2.6.8 (2026-10-27): jen ScadaViewer 2.6.8 - opravy z kontroly (soubezny zapis na flashku, XLSX hodnoty za hlavickou,
#   nazev bezici zakazky z PLC). Pozadavky jako 2.6.6 / 2.6.7 (limity RT v PLC, $WipBlocksDeploy = $true).
# 2.6.9 (2026-10-27): jen ScadaViewer 2.6.9 - hlavicka Databaze (ovladaci prvky vedle nadpisu, kompaktni ukazatel USB).
# 2.6.10 (2026-10-27): jen ScadaViewer 2.6.10 - hromadne stazeni podle filtru / vyberu (u stroje na flashku, vzdalene ZIP).

param([switch]$Rollback, [switch]$NoRename, [string]$Version = '2.6.10', [string]$MoveTo = '', [switch]$NoMove,
      [string]$MoveDataTo = '', [switch]$NoMoveData)

# Cil presunu aplikaci z profilu uzivatele (krok 5c) - nabidne se, kdyz aplikace lezi v C:\Users\...
$DefaultAppsRoot = Join-Path $env:SystemDrive 'apps'
# Cil presunu lokalni databaze (Gateway local_base_dir = ScadaViewer local_path) z profilu uzivatele (krok 5e)
$DefaultDataRoot = Join-Path $env:SystemDrive 'Data'

# Datum v novem nazvu slozek (v<verze>_<datum>-<nazev>), krok 5c - datum buildu kazde aplikace; nezmenena aplikace
# (stejna verze i datum) se tak neprejmenuje znovu
$AppDates = @{ AdsAnalyzer = '2026-10-27'; DatabaseGateway = '2026-10-26'; ScadaViewer = '2026-10-27' }
# [measurement] max_cycles v Config.toml Analyzingu a Gateway musi byt >= velikost bufferu v PLC (cMEASURING_MAX_CYCLES);
# nizsi hodnota orizne zaznam mereni. Config.toml se pri nasazeni neprepisuje -> skript ho zkontroluje / nastavi (krok 5d).
$MinMaxCycles = 60000

$AppVersions = @{ AdsAnalyzer = '2.6.3'; DatabaseGateway = '2.6.2'; ScadaViewer = '2.6.10' }
# Meni vydani datovou hlavicku CSV (sloupce [Data]) nebo vyznam hodnot? $true = rozpracovana zakazka (production\wip)
# nasazeni ZASTAVI (Gateway by do WIP se starou hlavickou kusy nepridala / kusy by se tridily podle limitu stare
# definice). $false = jen upozorneni, zakazka po nasazeni pokracuje.
# 2.6.3-2.6.5: beze zmeny -> $false. 2.6.6: nova definice RT a OP (limity zakazky) -> $true.
# 2.6.7 - 2.6.10: balicek obsahuje Analyzing 2.6.3 (stroj zatim bez 2.6.6) -> $true; az bude stroj na 2.6.6+, dalsi vydani
# bez zmeny hlavicky / vyznamu hodnot -> $false.
$WipBlocksDeploy = $true
$PlcNote     = 'Bezi na PLC program od verze 2.6.0? AnalyzedParams 112 B (Electric.R_NC_Static + R_NO_Static, DF / FPR, Info.Calibration.PositionReference, limity DF / FPR), cMEASURING_MAX_CYCLES = 60000. Se starsim programem Analyzing hlasi E6 a DatabaseGateway kusy neulozi. Od 2.6.2: Gateway WarningCode 2 = test bez signalu, 3 = malo mista na disku (provoz neblokuji). 2.6.6 (Analyzing 2.6.3): RT_RealisingTravel = |RP - FP| (Leerlaufweg DIN 41636-1, cca 550-730 um misto 850-1320) a OP = prvni sepnuti NO - jsou LIMITY RT (a pripadne PT / OT / MD) v recepturach PLC prenastavene? Zakaznik: RT 300-1400 um.'

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

$script:LogEnc    = New-Object Text.UTF8Encoding $true
$script:LogWarned = $false
# Zapis do logu nesmi nasazeni NIKDY shodit: Add-Content v PS 5.1 pri kratkem zamku souboru (antivir / indexovani)
# hazel "Stream was not readable" a s $ErrorActionPreference Stop ukoncil skript i v bloku obnovy po chybe - sluzby
# zustaly zastavene, aplikace napul vymenene (nasazeni 2.6.10, 2026-10-27). AppendAllText jen zapisuje (nic necte),
# pri zamku 5 pokusu, pak pokracovat bez logu.
function Log([string]$msg, [string]$color = 'Gray') {
    $line = '{0}  {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg
    Write-Host $line -ForegroundColor $color
    for ($i = 0; $i -lt 5; $i++) {
        try { [IO.File]::AppendAllText($LogFile, $line + "`r`n", $script:LogEnc); return }
        catch { Start-Sleep -Milliseconds 300 }
    }
    if (-not $script:LogWarned) {
        $script:LogWarned = $true
        Write-Host "[VAROVANI] Zapis do $LogFile selhal - nasazeni pokracuje, vystup sledujte v tomto okne." -ForegroundColor Yellow
    }
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
            if ($h.checks.default_password) {
                # A26-18: ucet s vychozim heslem "admin" - z kancelare se neprihlasi, ale u stroje ano
                Log '[VAROVANI] ScadaViewer: ucet s VYCHOZIM heslem (admin) - zmente ho: Nastaveni -> Uzivatele.' 'Yellow'
            }
            return $h
        } catch { Start-Sleep -Seconds 2 }
    }
    Log "[VAROVANI] ScadaViewer neodpovida na $url - zkontrolujte logy." 'Yellow'
    return $null
}

# --- Prejmenovani slozek s verzi (krok 5c) --------------------------------------------------
$VersionedFolder = '^v\d+(\.\d+){1,3}_\d{4}-\d{2}-\d{2}-(?<name>.+)$'

# Vsechny zapisy cesty: C:\a\b, C:/a/b a TOML escapovane C:\\a\\b (bez ohledu na velikost pismen).
# Jen cela slozka: za cestou nesmi pokracovat nazev (pismeno, cislice, _ - .) - jinak by "...-AdsAnalyzer"
# prepsalo i "...-AdsAnalyzer_old" (audit A26-46).
function Replace-PathText([string]$text, [string]$old, [string]$new) {
    if (-not $text) { return $text }
    $variants = New-Object System.Collections.ArrayList
    [void]$variants.Add(@{ From = $old;                   To = $new })
    [void]$variants.Add(@{ From = $old.Replace('\', '/');  To = $new.Replace('\', '/') })
    [void]$variants.Add(@{ From = $old.Replace('\', '\\'); To = $new.Replace('\', '\\') })
    foreach ($v in $variants) {
        $text = [regex]::Replace($text, [regex]::Escape($v.From) + '(?![\w.\-])', $v.To.Replace('$', '$$'), 'IgnoreCase')
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

# Parametr NSSM sluzby - primo z registru (Services\<svc>\Parameters, Unicode). `nssm get` vypisuje UTF-16, ktere
# PS 5.1 cte jako ANSI (diakritika v ceste se poskodi) a stderr s $ErrorActionPreference Stop muze skript ukoncit
# (audit A26-21). Hodnota v registru chybi -> fallback na `nssm get` s potlacenymi chybami.
function Get-NssmParam([string]$nssm, [string]$service, [string]$param) {
    $key = "HKLM:\SYSTEM\CurrentControlSet\Services\$service\Parameters"
    try {
        $v = (Get-ItemProperty -LiteralPath $key -Name $param -ErrorAction Stop).$param
        if ($null -ne $v) { return (@($v) -join ' ').Trim() }
    } catch { }
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { return ((& $nssm get $service $param 2>$null) -join '' -replace "`0", '').Trim() }
    finally { $ErrorActionPreference = $old }
}

# Prejmenuje / presune rodicovskou slozku aplikace $from -> $to (cela cesta, stejny disk) a prepise odkazy sluzby
# (ImagePath + NSSM parametry). Sluzba musi byt zastavena. Vraci $true / $false (chyba = slozka zustane, nic se neprepise).
function Move-AppParent($app, [string]$from, [string]$to) {
    $svcKey   = "HKLM:\SYSTEM\CurrentControlSet\Services\$($app.Service)"
    $image    = (Get-ItemProperty -LiteralPath $svcKey -Name ImagePath).ImagePath
    $params   = @{}
    foreach ($n in 'Application', 'AppDirectory', 'AppParameters', 'AppStdout', 'AppStderr') {
        $params[$n] = Get-NssmParam $app.Nssm $app.Service $n
    }
    try {
        $toParent = Split-Path $to
        if (-not (Test-Path -LiteralPath $toParent)) { New-Item -ItemType Directory -Path $toParent | Out-Null }
        [IO.Directory]::Move($from, $to)   # prejmenovani i presun na stejnem disku (Move-Item v PS 5.1 neumi cesty 8.3)
    } catch {
        Log "[VAROVANI] $($app.Service): slozku $from nelze presunout / prejmenovat ($($_.Exception.Message)) - zustava, nasazeni pokracuje." 'Yellow'
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
    Log "  $($app.Service): slozka $from -> $to (sluzba NSSM prepsana)" 'Green'
    return $true
}

# Ucty sluzeb, ktere nejsou systemove (LocalSystem ma pristup vzdy) - ".\svc" -> "POCITAC\svc" pro icacls
function Get-ServiceAccounts {
    $system = 'LocalSystem', 'NT AUTHORITY\SYSTEM', 'NT AUTHORITY\LocalService', 'NT AUTHORITY\NetworkService', ''
    return @($Apps | ForEach-Object { "$($_.Account)" } | Where-Object { $system -notcontains $_ } |
             ForEach-Object { if ($_.StartsWith('.\')) { "$env:COMPUTERNAME\$($_.Substring(2))" } else { $_ } } |
             Select-Object -Unique)
}

# Nova spolecna slozka aplikaci: bez dedenych prav z C:\ (tam ma Authenticated Users zapis). Jen Administrators + SYSTEM
# (plna) a ucty sluzeb (zapis - logy, data, Config.toml / users.toml z UI). Users ZADNY pristup: Config.toml obsahuje
# heslo k NAS a hash admina (i kopie v zalohach *.backup_*); kiosk ani obsluha slozku aplikaci nepotrebuji (audit A26-06).
# SID misto nazvu skupin (lokalizovany Windows).
# Rozpracovane zakazky (*_WIP.csv) - pred nasazenim musi byt production\wip prazdna (nova hlavicka CSV)
function Get-WipFiles([string]$localPath) {
    return @(Get-ChildItem -LiteralPath (Join-Path $localPath 'production\wip') -File -Filter '*.csv' -ErrorAction SilentlyContinue)
}

function New-AppsRoot([string]$root) {
    New-Item -ItemType Directory -Path $root | Out-Null
    $grants = @('*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F') + @(Get-ServiceAccounts | ForEach-Object { "${_}:(OI)(CI)M" })
    & icacls $root /inheritance:r /grant:r @grants | Out-Null
    if ($LASTEXITCODE -ne 0) { Log "[VAROVANI] Prava slozky $root se nepodarilo nastavit (icacls $LASTEXITCODE) - zkontrolujte rucne." 'Yellow' }
    else { Log "  $root vytvorena: Administrators + SYSTEM plna prava$(if (Get-ServiceAccounts) { ', ucty sluzeb zapis' }), Users bez pristupu" 'Green' }
}

# Existujici cilova slozka: upozornit, ma-li k ni pristup kazdy uzivatel (heslo v Config.toml by bylo citelne)
function Test-AppsRootAcl([string]$root) {
    $open = 'S-1-1-0', 'S-1-5-11', 'S-1-5-32-545'      # Everyone, Authenticated Users, Users
    $acl  = Get-Acl -LiteralPath $root
    $hits = @($acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and
             $open -contains $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })
    if ($hits.Count -gt 0) {
        Log "[VAROVANI] $root je pristupna vsem uzivatelum ($(@($hits | ForEach-Object { $_.IdentityReference.Value } | Select-Object -Unique) -join ', ')) -" 'Yellow'
        Log '           Config.toml (heslo k NAS, hash admina) by byl citelny. Doporuceno: icacls <slozka> /inheritance:r ...' 'Yellow'
    }
}

# Po presunu do nove slozky: prevzit prava od ni (presun na stejnem disku si nese puvodni ACL z profilu uzivatele)
function Reset-MovedAcl([string]$dir) {
    & icacls $dir /reset /T /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { Log "[VAROVANI] Prava $dir se nepodarilo prevzit od nadrazene slozky (icacls $LASTEXITCODE)." 'Yellow' }
}

# Soubory v presunutych slozkach, na ktere miri zastupce / skript z Po spusteni nebo plochy (plni Update-PathReferences)
$script:HelperTargets = New-Object System.Collections.ArrayList

# Kiosk po prihlaseni bezi s omezenymi pravy (UAC) - clenstvi v Administrators se neuplatni, do C:\apps by nesmel.
# Pomocnym .bat / .cmd (kiosk_start, open_browser - jen oteviraji Chrome, nic citliveho) povolit Users jen spusteni
# TOHOTO souboru (Windows u prime cesty nekontroluje prava nadrazenych slozek - Bypass traverse checking).
# Config.toml a zbytek slozky zustanou zavrene. Zastupce na exe jen nahlasit - server bezi jako sluzba.
function Grant-HelperExecute {
    foreach ($t in @($script:HelperTargets | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $t -PathType Leaf)) { continue }
        if ([IO.Path]::GetExtension($t) -in '.bat', '.cmd') {
            & icacls $t /grant '*S-1-5-32-545:(RX)' | Out-Null
            if ($LASTEXITCODE -eq 0) { Log "  $t : Users smi spustit (kiosk / zastupce po prihlaseni)" 'Green' }
            else { Log "[VAROVANI] Prava pro spusteni $t se nepodarilo nastavit - kiosk po startu PC zkontrolujte." 'Yellow' }
        } else {
            Log "[VAROVANI] Zastupce / skript spousti primo $t - pod beznym uctem nepujde; aplikace bezi jako sluzba, zastupce smazte." 'Yellow'
        }
    }
}

# Krok 5e: lokalni databaze z profilu uzivatele do vlastni slozky (sluzby zastavene). Slozka se presune (stejny disk =
# prejmenovani, okamzite i u velkych dat), Update-PathReferences prepise Config.toml vsech aplikaci (Gateway
# local_base_dir, ScadaViewer local_path) i plne cesty v sync_state.json. Zaznam data_move.txt v zaloze Gateway -> rollback.
$script:DataMoved = $false
function Invoke-DataMove($move, [string]$recordDir) {
    if (-not (Test-Path -LiteralPath $move.Root)) { New-AppsRoot $move.Root } else { Test-AppsRootAcl $move.Root }
    if ($recordDir) { [IO.File]::WriteAllLines((Join-Path $recordDir 'data_move.txt'), [string[]]@($move.From, $move.To)) }
    [IO.Directory]::Move($move.From, $move.To)
    $script:DataMoved = $true
    Reset-MovedAcl $move.To
    $pairs = New-Object System.Collections.ArrayList
    [void]$pairs.Add(@{ From = $move.From; To = $move.To })
    Update-PathReferences $pairs
    Log "  Lokalni databaze: $($move.From) -> $($move.To) (Config.toml Gateway + ScadaViewer, sync_state.json prepsany)" 'Green'
}

# Selhani po zastaveni sluzeb (krok 5-5e): vratit presuny slozek, exe + _internal a Config.toml ze zalohy (audit A26-04)
function Restore-AfterFailure($donePairs) {
    $back = New-Object System.Collections.ArrayList
    if ($script:DataMoved -and $DataMove -and (Test-Path -LiteralPath $DataMove.To) -and -not (Test-Path -LiteralPath $DataMove.From)) {
        try {
            [IO.Directory]::Move($DataMove.To, $DataMove.From)
            [void]$back.Add(@{ From = $DataMove.To; To = $DataMove.From })
            Log "  Lokalni databaze vracena do $($DataMove.From)" 'Green'
        } catch { Log "[CHYBA] Databazi $($DataMove.To) se nepodarilo vratit ($($_.Exception.Message)) - vratte rucne do $($DataMove.From)." 'Red' }
    }
    for ($i = $donePairs.Count - 1; $i -ge 0; $i--) {
        $p = $donePairs[$i]; $app = $p.App
        try {
            if (Move-AppParent $app $p.To $p.From) {
                [void]$back.Add(@{ From = $p.To; To = $p.From })
                if ($app.Backup) { $app.Backup = Replace-PathText $app.Backup $p.To $p.From }
            }
        } catch { Log "[CHYBA] $($app.Service): slozku $($p.To) se nepodarilo vratit ($($_.Exception.Message)) - vratte rucne." 'Red' }
    }
    try { Update-PathReferences $back } catch { Log "[CHYBA] Odkazy na cesty se nepodarilo vratit: $($_.Exception.Message)" 'Red' }
    foreach ($app in $Apps) {
        $b = $app.Backup
        if (-not $b -or -not (Test-Path -LiteralPath $b)) { continue }
        try {
            foreach ($item in '_internal', $app.Exe) {
                $saved = Join-Path $b $item
                if (-not (Test-Path -LiteralPath $saved)) { continue }     # do zalohy se jeste nepresunulo = puvodni na miste
                $cur = Join-Path $app.Dir $item
                if (Test-Path -LiteralPath $cur) { Remove-Item -LiteralPath $cur -Recurse -Force }
                Move-Item -LiteralPath $saved -Destination $app.Dir
            }
            $cfg = Join-Path $b 'Config.toml'
            if (Test-Path -LiteralPath $cfg) { Copy-Item -LiteralPath $cfg -Destination $app.Dir -Force }
            Log "  $($app.Service): predchozi verze obnovena ze zalohy" 'Green'
        } catch { Log "[CHYBA] $($app.Service): obnova ze zalohy $b selhala ($($_.Exception.Message)) - obnovte rucne." 'Red' }
    }
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
    # Po spusteni a plocha VSECH profilu - kiosk muze bezet pod jinym uctem nez spravce, ktery skript spousti (A26-46)
    $profileDirs = @(Get-ChildItem -LiteralPath (Join-Path $env:SystemDrive 'Users') -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { (Join-Path $_.FullName 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup'),
                         (Join-Path $_.FullName 'Desktop') })
    $dirs  = @(@('CommonStartup', 'Startup', 'CommonDesktopDirectory', 'Desktop') | ForEach-Object { [Environment]::GetFolderPath($_) }) +
             $profileDirs | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
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
                foreach ($p in $pairs) {
                    if ($lnk.TargetPath -and $lnk.TargetPath.StartsWith("$($p.To)\", [StringComparison]::OrdinalIgnoreCase)) {
                        [void]$script:HelperTargets.Add($lnk.TargetPath)
                    }
                }
            } elseif ($f.Extension -in '.bat', '.cmd') {
                $text = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::Default); $new = $text
                foreach ($p in $pairs) { $new = Replace-PathText $new $p.From $p.To }
                if ($new -ne $text) { [IO.File]::WriteAllText($f.FullName, $new, [Text.Encoding]::Default); Log "  skript upraven: $($f.FullName)" 'Green' }
                foreach ($p in $pairs) {
                    foreach ($m in [regex]::Matches($new, [regex]::Escape($p.To) + '\\[^"\r\n]+?\.(bat|cmd|exe)', 'IgnoreCase')) {
                        [void]$script:HelperTargets.Add($m.Value)
                    }
                }
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
    $raw = Get-NssmParam $app.Nssm $app.Service 'AppDirectory'
    $app.DirRaw = $raw
    $dir = $raw.Trim('"').TrimEnd('\')
    if (-not (Test-Path -LiteralPath (Join-Path $dir $app.Exe))) { Fail "$($app.Service): $($app.Exe) neni v $dir" }
    $app.Dir = $dir
    $acct = (Get-CimInstance Win32_Service -Filter "Name='$($app.Service)'").StartName
    $app.Account = $acct
    Log ("{0,-16} {1}   (ucet sluzby: {2})" -f $app.Service, $dir, $acct)
}
$sv     = $Apps[2]
$svCfg  = Join-Path $sv.Dir 'Config.toml'
$port   = Get-TomlValue $svCfg 'server' 'port'; if (-not $port) { $port = 8080 }

# ---------------------------------------------------------------------------------------------
if ($Rollback) {
    # Zalohy jen z JEDNOHO nasazeni (last_deploy.txt) - jinak by aplikace, u ktere posledni nasazeni nedobehlo,
    # vzala zalohu o verzi starsi a vznikl by mix verzi (audit A26-05)
    $marker = Join-Path $Here 'last_deploy.txt'
    $stampR = if (Test-Path -LiteralPath $marker) { "$(Get-Content -LiteralPath $marker -Encoding UTF8 -TotalCount 1)".Trim() } else { '' }
    if ($stampR) { Log "Posledni nasazeni z tohoto balicku: $stampR" } else { Log '[INFO] last_deploy.txt chybi (starsi nasazeni) - zalohy musi byt ze stejneho behu.' 'Yellow' }
    foreach ($app in $Apps) {
        $all = @(Get-ChildItem -LiteralPath (Split-Path $app.Dir) -Directory -Filter ((Split-Path -Leaf $app.Dir) + '.backup_*') |
                 Sort-Object Name -Descending)
        $b = if ($stampR) { $all | Where-Object { $_.Name.EndsWith(".backup_$stampR") } | Select-Object -First 1 } else { $all | Select-Object -First 1 }
        if ($b -and -not (Test-Path -LiteralPath (Join-Path $b.FullName $app.Exe))) {
            Log "$($app.Service): zaloha $($b.Name) neobsahuje $($app.Exe) (nasazeni ji nevymenilo / uz obnoveno) - zustava, jen se restartuje." 'Yellow'
            $b = $null
        } elseif (-not $b) {
            if (-not $stampR) { Fail "$($app.Service): zadna zaloha $($app.Dir).backup_* nenalezena." }
            Log "$($app.Service): zaloha z nasazeni $stampR neni - aplikace se nemenila, jen se restartuje." 'Yellow'
        }
        $app.Backup = if ($b) { $b.FullName } else { $null }
        if ($b) { Log "$($app.Service): obnovim z $($b.FullName)" }
    }
    if (-not $stampR) {
        $stamps = @($Apps | Where-Object { $_.Backup } | ForEach-Object { ($_.Backup -split '\.backup_')[-1] } | Select-Object -Unique)
        if ($stamps.Count -gt 1) { Fail "Zalohy aplikaci jsou z ruznych nasazeni ($($stamps -join ', ')) - rollback by vratil mix verzi. Obnovte rucne." }
    }
    if (@($Apps | Where-Object { $_.Backup }).Count -eq 0) { Fail 'Neni co obnovit (zadna zaloha s exe).' }
    if (-not (Ask 'Obnovit predchozi verzi?')) { Log 'Zruseno.'; exit 1 }
    # Config.toml ze zalohy - vrati i max_cycles (krok 5d) a cesty; vychozi ne (rucni zmeny po nasazeni zustanou). A26-46
    $restoreCfg = Ask 'Obnovit i Config.toml ze zalohy (max_cycles, cesty - zmeny po nasazeni se ztrati)?'
    Stop-Apps
    foreach ($app in $Apps) {
        if (-not $app.Backup) { continue }
        Remove-Item -LiteralPath (Join-Path $app.Dir '_internal') -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path $app.Dir $app.Exe) -Force -ErrorAction SilentlyContinue
        Copy-Item -LiteralPath (Join-Path $app.Backup '_internal') -Destination $app.Dir -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $app.Backup $app.Exe)    -Destination $app.Dir -Force
        Log "  $($app.Service) obnoven (exe + _internal; zaloha $($app.Backup))" 'Green'
    }
    # Nasazeni prejmenovalo slozky (folder_rename.txt v zaloze) -> vratit puvodni nazev a odkazy
    $back = New-Object System.Collections.ArrayList
    foreach ($app in $Apps) {
        if (-not $app.Backup) { continue }
        $rec = Join-Path $app.Backup 'folder_rename.txt'
        if (-not (Test-Path -LiteralPath $rec)) { continue }
        $l = @(Get-Content -LiteralPath $rec -Encoding UTF8)
        if ($l.Count -ge 2 -and (Split-Path $app.Dir) -eq $l[1] -and -not (Test-Path -LiteralPath $l[0])) {
            if (Move-AppParent $app $l[1] $l[0]) {
                [void]$back.Add(@{ From = $l[1]; To = $l[0] })
                $app.Backup = Replace-PathText $app.Backup $l[1] $l[0]     # zaloha se presunula se slozkou
            }
        }
    }
    # Nasazeni presunulo lokalni databazi (data_move.txt v zaloze Gateway) -> vratit
    if ($Apps[1].Backup) {
        $rec = Join-Path $Apps[1].Backup 'data_move.txt'
        if (Test-Path -LiteralPath $rec) {
            $l = @(Get-Content -LiteralPath $rec -Encoding UTF8)
            if ($l.Count -ge 2 -and (Test-Path -LiteralPath $l[1]) -and -not (Test-Path -LiteralPath $l[0])) {
                try {
                    [IO.Directory]::Move($l[1], $l[0])
                    [void]$back.Add(@{ From = $l[1]; To = $l[0] })
                    Log "  Lokalni databaze vracena: $($l[1]) -> $($l[0])" 'Green'
                } catch { Log "[CHYBA] Databazi $($l[1]) se nepodarilo vratit ($($_.Exception.Message)) - vratte rucne." 'Red' }
            }
        }
    }
    Update-PathReferences $back
    if ($restoreCfg) {
        # Kopie z doby nasazeni (pred krokem 5d / 5c) = puvodni stav vcetne cest - prepise i Update-PathReferences
        foreach ($app in $Apps) {
            if (-not $app.Backup) { continue }
            $cfg = Join-Path $app.Backup 'Config.toml'
            if (Test-Path -LiteralPath $cfg) { Copy-Item -LiteralPath $cfg -Destination $app.Dir -Force; Log "  $($app.Service): Config.toml obnoven ze zalohy" 'Green' }
        }
    }
    Start-Apps
    Check-Health $port | Out-Null
    if ($stampR) { Move-Item -LiteralPath $marker -Destination (Join-Path $Here "last_deploy_rolledback_$stampR.txt") -Force }
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

# Nastaveni analyzy v Config.toml Analyzingu, ktera vydani vyzaduje (Config.toml na stroji se neprepisuje) - krok 5d.
# 2.6.3: op_definition "no_close" (OP = prvni sepnuti NO, DIN 41636-1; v kodu vychozi "nc_open"),
# static_resistance_margin_um 100 (stroj ma z 2.6.0 50 - prebil by novy default), static_nc_exclude_pt_fraction 0.5.
$AnSettings = @(
    @{ Section = 'analysis.detection'; Key = 'op_definition';                 Value = '"no_close"'; Want = 'no_close' },
    @{ Section = 'analysis.detection'; Key = 'static_resistance_margin_um';   Value = '100.0';      Want = '100.0' },
    @{ Section = 'analysis.detection'; Key = 'static_nc_exclude_pt_fraction'; Value = '0.5';        Want = '0.5' }
)
$AnFix = New-Object System.Collections.ArrayList
$anCfgPath = Join-Path $Apps[0].Dir 'Config.toml'
foreach ($s in $AnSettings) {
    $cur = Get-TomlValue $anCfgPath $s.Section $s.Key
    $same = ("$cur" -eq $s.Want)
    if (-not $same) {
        $a = 0.0; $b = 0.0
        if ([double]::TryParse("$cur", [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$a) -and
            [double]::TryParse($s.Want, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$b)) {
            $same = ($a -eq $b)
        }
    }
    if ($same) { Log "Analyzing [$($s.Section)] $($s.Key) = $cur" 'Green'; continue }
    Log "[UPRAVA] Analyzing Config.toml [$($s.Section)] $($s.Key) = '$cur' -> $($s.Value)" 'Yellow'
    [void]$AnFix.Add($s)
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
    # Neexistujici slozka by se tvarila jako "wip prazdna" (A26-20)
    if (-not (Test-Path -LiteralPath (Join-Path $local 'production'))) {
        Fail "Datova slozka $local\production neexistuje - zkontrolujte [data] local_path v Config.toml ScadaViewer."
    }
    $wip = Get-WipFiles $local
    $dl  = @(Get-ChildItem -LiteralPath (Join-Path $local 'production\done_local') -File -ErrorAction SilentlyContinue) +
           @(Get-ChildItem -LiteralPath (Join-Path $local 'testing\done_local') -File -ErrorAction SilentlyContinue)
    if ($wip.Count -gt 0 -and $WipBlocksDeploy) {
        # Vydani meni datovou hlavicku CSV - Gateway do WIP se starou hlavickou kus neprida
        Log "[CHYBA] production\wip obsahuje $($wip.Count) soubor(u): $($wip.Name -join ', ')" 'Red'
        Log '        Toto vydani meni hlavicku CSV / vyznam hodnot (2.6.6: RT, OP) - zakazku nejdriv uzavrete na PLC (Op3)' 'Red'
        Log '        nebo ve ScadaViewer (Databaze -> In progress -> Dokoncit zakazku). Potom spustte deploy.bat znovu.' 'Red'
        exit 1
    } elseif ($wip.Count -gt 0) {
        # Format CSV beze zmeny - rozpracovana zakazka nasazeni neblokuje (sluzby se jen kratce zastavi)
        Log "[VAROVANI] production\wip obsahuje $($wip.Count) soubor(u): $($wip.Name -join ', ')" 'Yellow'
        Log '        Format CSV se nemeni - zakazka po nasazeni pokracuje. Behem nasazeni (cca 1-2 min) stroj kusy' 'Yellow'
        Log '        neulozi (Gateway zastavena) - nasazujte, kdyz stroj nemeri.' 'Yellow'
    } else { Log 'production\wip je prazdna' 'Green' }
    if ($dl.Count -gt 0) { Log "[INFO] done_local: $($dl.Count) soubor(u) jeste neni na NAS - po startu Gateway se dosynchronizuji." 'Yellow' }
} else { Log '[VAROVANI] [data] local_path v Config.toml ScadaViewer nenalezen - kontrola wip preskocena.' 'Yellow' }

# Presun z profilu uzivatele (krok 5c) - smernice Trafag pro OT: lokalni ucet admin se vypne / omezi
$profiles = Join-Path $env:SystemDrive 'Users'
$inProfile = @($Apps | Where-Object { $_.Dir.StartsWith("$profiles\", [StringComparison]::OrdinalIgnoreCase) })
if (-not $MoveTo -and -not $NoMove -and $inProfile.Count -gt 0) {
    Log "[INFO] Aplikace lezi v profilu uzivatele ($(Split-Path (Split-Path $inProfile[0].Dir)))." 'Yellow'
    Log "       Smernice Trafag pro OT pocita s vypnutim / omezenim lokalniho uctu admin - doporuceny presun do $DefaultAppsRoot." 'Yellow'
    if (Ask "Presunout aplikace do $DefaultAppsRoot (sluzby, Config.toml, zastupci se prepisou; rollback vrati)?") { $MoveTo = $DefaultAppsRoot }
}
if ($MoveTo) {
    $MoveTo = $MoveTo.TrimEnd('\')
    if (-not [IO.Path]::IsPathRooted($MoveTo)) { Fail "-MoveTo musi byt cela cesta (napr. $DefaultAppsRoot)." }
    if (Test-Path -LiteralPath $MoveTo -PathType Leaf) { Fail "$MoveTo je soubor, ne slozka." }
}

# Plan prejmenovani / presunu slozek (krok 5c) - kontrola pred zastavenim sluzeb
$Renames = New-Object System.Collections.ArrayList
$parents = @($Apps | ForEach-Object { Split-Path $_.Dir })
foreach ($app in $Apps) {
    $parent = Split-Path $app.Dir
    $leaf   = Split-Path -Leaf $parent
    $newLeaf = $leaf
    if (-not $NoRename) {
        if ($leaf -match $VersionedFolder) {
            $newLeaf = "v{0}_{1}-{2}" -f $AppVersions[$app.Service], $AppDates[$app.Service], $Matches['name']
        } else { Log "Slozka $parent nema nazev v<verze>_<datum>-<nazev> - neprejmenuje se." 'Gray' }
    }
    $newRoot = if ($MoveTo) { $MoveTo } else { Split-Path $parent }
    $target  = Join-Path $newRoot $newLeaf
    if ($target -eq $parent) { if ($newLeaf -ne $leaf -or $MoveTo) { Log "$($app.Service): slozka uz je na miste ($parent)" 'Gray' }; continue }
    if (@($parents | Where-Object { $_ -eq $parent }).Count -gt 1) { Log "[INFO] $parent sdili vic aplikaci - neprejmenuje / nepresune se (presunte rucne)." 'Yellow'; continue }
    if ((Split-Path -Qualifier $parent) -ne (Split-Path -Qualifier $target)) { Fail "$($app.Service): presun na jiny disk ($target) skript neumi - zvolte -MoveTo na disku $(Split-Path -Qualifier $parent)." }
    if (Test-Path -LiteralPath $target) { Fail "$($app.Service): cilova slozka $target uz existuje - prejmenujte / smazte ji, nebo spustte s -NoRename / -NoMove." }
    $app.RenameTo = $target
    [void]$Renames.Add($app)
    Log ("Presune / prejmenuje se: {0}  ->  {1}" -f $parent, $target) 'Cyan'
}

# Plan presunu lokalni databaze (krok 5e) - jen lezi-li v profilu uzivatele (nebo -MoveDataTo) a ne ve slozce aplikace
$DataMove = $null
$gwCfgPath = Join-Path $Apps[1].Dir 'Config.toml'
$dataDir   = Get-TomlValue $gwCfgPath 'storage' 'local_base_dir'
if (-not $dataDir) { $dataDir = '03_output' }
if (-not [IO.Path]::IsPathRooted($dataDir)) { $dataDir = Join-Path $Apps[1].Dir $dataDir }
$dataDir = $dataDir.TrimEnd('\')
$dataInApp = @($Apps | Where-Object { $dataDir.StartsWith("$(Split-Path $_.Dir)\", [StringComparison]::OrdinalIgnoreCase) })
if (-not $NoMoveData -and $dataInApp.Count -eq 0 -and
    ($MoveDataTo -or $dataDir.StartsWith("$profiles\", [StringComparison]::OrdinalIgnoreCase))) {
    if ($local -and $local.TrimEnd('\') -ne $dataDir) {
        Log "[INFO] ScadaViewer local_path ($local) a Gateway local_base_dir ($dataDir) se lisi - presun databaze se preskoci." 'Yellow'
    } elseif (-not (Test-Path -LiteralPath $dataDir)) {
        Log "[INFO] Lokalni databaze $dataDir neexistuje - presun se preskoci." 'Yellow'
    } elseif ((Get-WipFiles $dataDir).Count -gt 0) {
        # Rozpracovanou zakazku nepresouvat pod rukama (kontrola wip je podle $WipBlocksDeploy chyba nebo jen upozorneni)
        Log "[INFO] V databazi je rozpracovana zakazka (production\wip) - presun databaze se preskoci (pristi nasazeni)." 'Yellow'
    } else {
        if (-not $MoveDataTo) {
            Log "[INFO] Lokalni databaze lezi v profilu uzivatele: $dataDir" 'Yellow'
            Log "       Po vypnuti / omezeni uctu (smernice Trafag pro OT) by byla ohrozena - doporuceny presun do $DefaultDataRoot." 'Yellow'
            if (Ask "Presunout lokalni databazi do $DefaultDataRoot (Config.toml Gateway + ScadaViewer a sync_state.json se prepisou; rollback vrati)?") {
                $MoveDataTo = $DefaultDataRoot
            }
        }
        if ($MoveDataTo) {
            $dataRoot = $MoveDataTo.TrimEnd('\')
            if (-not [IO.Path]::IsPathRooted($dataRoot)) { Fail "-MoveDataTo musi byt cela cesta (napr. $DefaultDataRoot)." }
            $target = Join-Path $dataRoot (Split-Path -Leaf $dataDir)
            if ((Split-Path -Qualifier $dataDir) -ne (Split-Path -Qualifier $target)) { Fail "Presun databaze na jiny disk ($target) skript neumi - zvolte cil na disku $(Split-Path -Qualifier $dataDir)." }
            if (Test-Path -LiteralPath $target) { Fail "Cilova slozka databaze $target uz existuje - prejmenujte / smazte ji, nebo spustte s -NoMoveData." }
            $DataMove = @{ From = $dataDir; To = $target; Root = $dataRoot }
            Log ("Presune se lokalni databaze: {0}  ->  {1}" -f $dataDir, $target) 'Cyan'
        }
    }
}

if ($PlcNote) {
    Log "[PLC] $PlcNote" 'Yellow'
    if (-not (Ask 'PLC program je pripraveny?')) { Log 'Zruseno - nejdriv nahrat program do PLC.'; exit 1 }
}
$renameText = if ($Renames.Count -gt 0) { " a presunout / prejmenovat $($Renames.Count) slozk(y)" } else { '' }
if ($DataMove) { $renameText += " a presunout lokalni databazi do $($DataMove.To)" }
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

# Kontrola wip znovu az se zastavenou Gateway: behem dotazu vyse mohla obsluha zalozit zakazku (Op1) a nova
# Gateway by do WIP se starou hlavickou kusy nepridala (A26-20). Nic jeste neni vymenene -> spustit a skoncit.
if ($local -and $WipBlocksDeploy) {
    $wipNow = Get-WipFiles $local
    if ($wipNow.Count -gt 0) {
        Log "[CHYBA] Behem pripravy vznikla rozpracovana zakazka: $($wipNow.Name -join ', ') - nasazeni preruseno, nic nevymeneno." 'Red'
        Log '        Uzavrete ji na PLC (Op3) nebo ve ScadaViewer (Databaze -> In progress -> Dokoncit zakazku)' 'Red'
        Log '        a spustte deploy.bat znovu. Sluzby se spousti zpet.' 'Red'
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Start-Apps
        exit 1
    }
}

# Zaznam nasazeni pro rollback.bat - obnovuje jen zalohy s timto razitkem (audit A26-05)
Set-Content -LiteralPath (Join-Path $Here 'last_deploy.txt') -Value $Stamp -Encoding ASCII
$done = New-Object System.Collections.ArrayList
$rootExisted = $MoveTo -and (Test-Path -LiteralPath $MoveTo)

# Kroky 5-5e: jakakoli chyba (zamek Defenderu, plny disk ...) -> vratit predchozi stav a spustit sluzby;
# bez toho by sluzby zustaly zastavene a aplikace napul vymenene - stroj by nemeril (audit A26-04)
try {

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
# Analyzing: rotace stdout logu i za behu (starsi nssm_install.bat ji nenastavoval - log rostl do restartu), A26-47
& $Apps[0].Nssm set $Apps[0].Service AppRotateOnline 1 | Out-Null
Log '  AdsAnalyzer: NSSM AppRotateOnline 1' 'Green'

# 5d. max_cycles v Config.toml (Config.toml je zalohovany v *.backup_$Stamp)
foreach ($app in $CycleFix) {
    $cfg = Join-Path $app.Dir 'Config.toml'
    if (Set-TomlValue $cfg 'measurement' 'max_cycles' "$MinMaxCycles") { Log "  $($app.Service): max_cycles = $MinMaxCycles" 'Green' }
    else { Log "[VAROVANI] $($app.Service): sekce [measurement] v $cfg nenalezena - max_cycles nastavte rucne." 'Yellow' }
}
# 5d. nastaveni analyzy (Analyzing Config.toml, zalohovany v *.backup_$Stamp)
foreach ($s in $AnFix) {
    if (Set-TomlValue $anCfgPath $s.Section $s.Key $s.Value) { Log "  AdsAnalyzer: [$($s.Section)] $($s.Key) = $($s.Value)" 'Green' }
    else { Log "[VAROVANI] AdsAnalyzer: sekce [$($s.Section)] v $anCfgPath nenalezena - $($s.Key) = $($s.Value) nastavte rucne." 'Yellow' }
}

# 5c. Prejmenovani / presun slozek + prepsani odkazu (sluzby jsou zastavene)
if ($MoveTo -and $Renames.Count -gt 0 -and -not $rootExisted) { New-AppsRoot $MoveTo }
elseif ($MoveTo -and $Renames.Count -gt 0) { Test-AppsRootAcl $MoveTo }
foreach ($app in $Renames) {
    $from = Split-Path $app.Dir
    # zaznam pro rollback - zaloha lezi v rodicovske slozce, presune se s ni
    [IO.File]::WriteAllLines((Join-Path $app.Backup 'folder_rename.txt'), [string[]]@($from, $app.RenameTo))
    if (Move-AppParent $app $from $app.RenameTo) {
        [void]$done.Add(@{ From = $from; To = $app.RenameTo; App = $app })
        $app.Backup = Replace-PathText $app.Backup $from $app.RenameTo
        # presun z profilu do nove slozky: prava prevzit od ni (vc. zaloh s kopii Config.toml) - A26-06
        if ($MoveTo -and (Split-Path $from) -ne (Split-Path $app.RenameTo)) { Reset-MovedAcl $app.RenameTo }
    }
}
Update-PathReferences $done
if ($MoveTo) { Grant-HelperExecute }    # kiosk / zastupce z Po spusteni po presunu do C:\apps (UAC)

# 5e. Lokalni databaze z profilu uzivatele do vlastni slozky (zaznam pro rollback v zaloze Gateway)
if ($DataMove -and (Get-WipFiles $DataMove.From).Count -gt 0) {
    # Zakazka vznikla behem pripravy (pred zastavenim Gateway) - databazi ted nepresouvat
    Log '[INFO] Behem pripravy vznikla rozpracovana zakazka - presun databaze se preskoci (pristi nasazeni).' 'Yellow'
    $DataMove = $null
}
if ($DataMove) { Invoke-DataMove $DataMove $Apps[1].Backup }

} catch {
    $err = $_
    Log "[CHYBA] Nasazeni selhalo po zastaveni sluzeb: $($err.Exception.Message)" 'Red'
    Log '        Vracim predchozi stav (slozky, exe, _internal, Config.toml) a spoustim sluzby ...' 'Yellow'
    # Kazdy krok zvlast - selhani obnovy nesmi zabranit spusteni sluzeb (stroj by nemeril)
    try { Restore-AfterFailure $done } catch { Log "[CHYBA] Obnova predchoziho stavu selhala: $($_.Exception.Message) - zkontrolujte rucne, pripadne rollback.bat." 'Red' }
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    try { Start-Apps } catch { Log "[CHYBA] Spusteni sluzeb selhalo: $($_.Exception.Message) - spustte je rucne (services.msc)." 'Red' }
    try { Check-Health $port | Out-Null } catch { }
    Log "[CHYBA] Nasazeni v$Version NEPROBEHLO - bezi predchozi verze. Pricinu najdete vyse; log: $LogFile" 'Red'
    exit 1
}

if ($MoveTo) {
    # Cesty do profilu mimo presunute slozky (napr. export do Dokumentu) presun neprepise - po vypnuti uctu by chybely
    foreach ($app in $Apps) {
        $cfg = Join-Path $app.Dir 'Config.toml'
        if (-not (Test-Path -LiteralPath $cfg)) { continue }
        $hits = @(Select-String -LiteralPath $cfg -Pattern ([regex]::Escape($profiles) -replace '\\\\', '[\\/]+') -Encoding UTF8 |
                  Where-Object { $_.Line.Trim() -notmatch '^#' })
        foreach ($h in $hits) { Log "[VAROVANI] $($app.Service) Config.toml radek $($h.LineNumber) odkazuje do profilu uzivatele: $($h.Line.Trim())" 'Yellow' }
    }
}

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
Log '  6. 2.6.2: ScadaViewer -> Nastaveni -> Uzivatele: zmenit vychozi heslo admin (pruh dole); prihlaseni heslem u stroje'
Log ('     konci po 15 min necinnosti; Info -> verze ' + $Version + '. Heslo k NAS zmenit (stare je v historii gitu Gateway).')
Log '  7. 2.6.3/2.6.4: Databaze -> radek In progress -> tlacitko Dokoncit zakazku (admin u stroje nebo prihlaseni pres PLC),'
Log '     jen u zakazky, ktera na stroji skoncila a neuzavrela se. Po odhlaseni na PLC prava admina konci. XLSX zakazky = rozlozeni vzoru.'
Log '  8. 2.6.6: novy kus - RT (RvT) cca 550-730 um (FP -> RP), v diagramu kusu kota RvT mezi FP a RP; starsi kusy'
Log ('     "RvT (TTP -> RP)". Log Analyzingu bez chyb Config (op_definition, static_*). Info -> verze ' + $Version + '.')
Log '  9. 2.6.7: zasunout flashku -> Databaze, vedle uloziste a NAS ukazatel USB E: (admin u stroje); CSV / XLSX'
Log '     ulozi do E:\Trafag_ScadaViewer; tlacitko u ukazatele USB = bezpecne odebrani (toast "lze vyjmout").'
Log ' 10. Zalohy *.backup_* po overeni smazat.'
