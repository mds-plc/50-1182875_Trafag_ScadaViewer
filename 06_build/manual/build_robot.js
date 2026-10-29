// Program robota ABB (IRB 920, OmniCore C30) — Technický manuál (docType tech), CS + EN
// Použití: node build_robot.js cs|en <výstupní.docx>
// Rozhodnutí uživatele 2026-10-29: jeden Technický manuál (servis, programátor PLC / robota), v 17.Dokumentace složka 7.Robot.
// Zdroje (13.Robot): 4.Zálohy/920-100056_BACKUP_2026-10-23 (RAPID T_ROB1, SYSPAR EIO / SYS / MOC, system.xml),
// 5.Safety protokol/920-100056_SafetyReport.pdf (SafeMove, 2026-10-23), 1.Architektura/50-1182875_Trafag_Robot.xlsx.
// Při rozporu xlsx × EIO.cfg platí EIO.cfg (skutečná konfigurace robota) — rozdíly hlášeny uživateli, do dokumentu nepatří.
// Jen ověřená fakta ze zdrojů — nic nedomýšlet. Po nové záloze robota upravit ZALOHA a hodnoty v tabulkách.
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `rb_${L}.docx`
const T = (cs, en) => (L === 'cs' ? cs : en)
const ZALOHA = '2026-10-23'

const M = require('./lib')({
  docType: 'tech',
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L),
  product: T('Program robota', 'Robot Program'), version: T(`(záloha ${ZALOHA})`, `(backup ${ZALOHA})`),
  versionLabel: T('Program', 'Program'),
  subtitle: T('Program robota ABB IRB 920 pro manipulaci s mikrospínači v EOL testeru — struktura, rozhraní s PLC, pohyby a bezpečnost',
              'ABB IRB 920 robot program for handling microswitches in the EOL tester — structure, PLC interface, motions and safety'),
  issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, UL, OL, CODE, FIG, NOTE, TABLE, ABOUT } = M
const c = []
let ch = 0
let sec = 0
const REF = {}
const chapter = (cs, en, key) => { ch += 1; sec = 0; if (key) REF[key] = `${ch}`; c.push(H1(`${ch}  ${t(cs, en)}`)) }
const sub = (cs, en, key) => { sec += 1; if (key) REF[key] = `${ch}.${sec}`; c.push(H2(`${ch}.${sec}  ${t(cs, en)}`)) }

// ═══ O tomto dokumentu ═════════════════════════════════════════════════
chapter('O tomto dokumentu', 'About this document')
c.push(...ABOUT({
  purpose: t(`Dokument popisuje program robota ABB v EOL testeru: řídicí systém, strukturu programu, výměnu povelů s PLC, procedury pohybu, chapadlo, pracovní zóny, mapu signálů a bezpečnostní konfiguraci SafeMove. Popis odpovídá záloze řídicího systému ze dne ${ZALOHA}.`,
             `This document describes the ABB robot program in the EOL tester: controller, program structure, command exchange with the PLC, motion procedures, gripper, work zones, signal map and the SafeMove safety configuration. The description corresponds to the controller backup of ${ZALOHA}.`),
  audience: t('servis EOL testeru, programátor PLC a programátor robota.', 'EOL tester service, PLC programmer and robot programmer.'),
  related: t([
    '**Architektura softwaru — Technický popis**: místo robota v systému testeru.',
    '**ABB Safety Configuration Report** systému 920-100056 (složka Podklady).',
    'Dokumentace výrobce ABB: produktová příručka IRB 920, příručka OmniCore C30, technická referenční příručka RAPID, aplikační příručka SafeMove.',
  ], [
    '**Software Architecture — Technical Description**: place of the robot in the tester system.',
    '**ABB Safety Configuration Report** of system 920-100056 (Podklady folder).',
    'ABB documentation: IRB 920 product manual, OmniCore C30 manual, RAPID technical reference manual, SafeMove application manual.',
  ]),
  history: [['1.0', '2026-10-29', t(`První vydání (záloha programu ${ZALOHA}).`, `First issue (program backup ${ZALOHA}).`)]],
}))

// ═══ Řídicí systém ═════════════════════════════════════════════════════
chapter('Robot a řídicí systém', 'Robot and controller', 'ctrl')
c.push(P(t(
  'Robot odebírá změřené mikrospínače z místa vyzvednutí a odkládá je do třídicích boxů 1–6 podle kategorie, kterou určí PLC. O každém pohybu rozhoduje PLC: robot vykonává jen procedury, které mu PLC zadá číslem.',
  'The robot picks the measured microswitches up at the pick position and places them into the sorting boxes 1–6 according to the category determined by the PLC. The PLC decides about every motion: the robot only executes the procedures that the PLC selects by number.')))
c.push(...TABLE(
  [t('Položka', 'Item'), t('Hodnota', 'Value')],
  [
    ['Robot', t('ABB IRB 920 (SCARA, 4 osy), typ ROB1_920_0.65_6', 'ABB IRB 920 (SCARA, 4 axes), type ROB1_920_0.65_6')],
    [t('Řídicí systém', 'Controller'), 'ABB OmniCore C30'],
    [t('Systém', 'System'), '920-100056'],
    [t('Software', 'Software'), 'RobotOS 20.0.0, RobotControl (RobotWare) 8.1.1'],
    [t('Úloha programu', 'Program task'), t('T_ROB1 (pohybová úloha, typ NORMAL)', 'T_ROB1 (motion task, type NORMAL)')],
    [t('Komunikace s PLC', 'Communication with the PLC'), t('EtherCAT (zařízení EC_Internal_Device), bezpečnostní signály FSoE', 'EtherCAT (device EC_Internal_Device), safety signals via FSoE')],
    [t('Volby systému', 'System options'), t('EtherCAT Device, Safety over EtherCAT Device, World Zones, Collision Detection, Multitasking, SafeMove Premium, RobotStudio Connect, FlexPendant Program Package', 'EtherCAT Device, Safety over EtherCAT Device, World Zones, Collision Detection, Multitasking, SafeMove Premium, RobotStudio Connect, FlexPendant Program Package')],
  ],
  [2600, 7038], t('Robot a řídicí systém', 'Robot and controller')))

// ═══ Struktura programu ════════════════════════════════════════════════
chapter('Struktura programu', 'Program structure', 'struct')
c.push(...TABLE(
  [t('Modul', 'Module'), t('Typ', 'Type'), t('Obsah', 'Content')],
  [
    ['MainModule', t('programový', 'program'), t('Hlavní smyčka main (výměna povelu s PLC, volání procedury), inicializace Init.', 'Main loop main (command exchange with the PLC, procedure call), initialisation Init.')],
    ['mMovement', t('programový', 'program'), t('Procedury pohybu 1–7 a naučené polohy (čekací polohy, místo vyzvednutí, body boxů).', 'Motion procedures 1–7 and taught positions (wait positions, pick position, box points).')],
    ['mUtils', t('programový', 'program'), t('Handshake (povolení vjezdu od PLC), GetPlaceData (číslo boxu a pozice).', 'Handshake (entry enable from the PLC), GetPlaceData (box and position number).')],
    ['mData', t('systémový', 'system'), t('Domovská poloha, nástroj tGripper, rychlosti, proměnné boxu, rozteče pozic.', 'Home position, tool tGripper, speeds, box variables, position pitches.')],
    ['mFunctions', t('systémový', 'system'), t('Funkce bezpečné výšky GoSafelyUp / Safely, obsluhy přerušení.', 'Safe-height functions GoSafelyUp / Safely, interrupt routines.')],
    ['mGripper', t('systémový', 'system'), t('Ovládání chapadla (Init / Open / Close / Check).', 'Gripper control (Init / Open / Close / Check).')],
    ['mWorldZones', t('systémový', 'system'), t('Definice pracovních zón (World Zones); spouští se při zapnutí řídicího systému.', 'Work zone definitions (World Zones); executed at controller power-on.')],
  ],
  [2000, 1700, 5938], t('Moduly programu', 'Program modules')))

sub('Inicializace', 'Initialisation', 'init')
c.push(P(t('Po spuštění programu od začátku (main) proběhne procedura Init:', 'When the program is started from the beginning (main), the Init procedure runs:')))
c.push(...UL(t([
  'zrychlení AccSet 70 % a strmost změny zrychlení 40 %; vypnutá varování o zkrácení zón (CornerPathWarning);',
  `připojení tří přerušení (kap. 4.1);`,
  'převzetí rychlosti požadované od PLC (gi_SpeedReq) a její vrácení v go_RobotSpeed;',
  'vynulování výstupů výměny povelu (go_ProcNum, do_ProcReq, do_ProcBusy, do_ProcDone) a výstupů handshake (do_PickPosReq / Ack, do_PlacePosReq / Ack);',
  'vynulování obou povelů chapadla (Gripper\\Init).',
], [
  'acceleration AccSet 70 % and acceleration ramp 40 %; corner path warnings disabled (CornerPathWarning);',
  `connection of three interrupts (section 4.1);`,
  'adoption of the speed requested by the PLC (gi_SpeedReq) and its echo in go_RobotSpeed;',
  'reset of the command exchange outputs (go_ProcNum, do_ProcReq, do_ProcBusy, do_ProcDone) and handshake outputs (do_PickPosReq / Ack, do_PlacePosReq / Ack);',
  'reset of both gripper commands (Gripper\\Init).',
])))

// ═══ Výměna povelu s PLC ═══════════════════════════════════════════════
chapter('Výměna povelu s PLC', 'Command exchange with the PLC', 'cycle')
c.push(P(t(
  'Hlavní smyčka main opakuje stejný postup pro každý povel PLC:',
  'The main loop main repeats the same sequence for every PLC command:')))
c.push(...FIG('rb_cycle', t('Výměna jednoho povelu mezi PLC a robotem', 'Exchange of one command between the PLC and the robot')))
c.push(...OL(t([
  'Robot je připraven: nastaví do_ProcReq = 1 a čeká, až PLC drží di_ProcStart = 0.',
  'PLC zadá číslo procedury 1–7 v gi_ProcNum a nastaví di_ProcStart = 1. Robot přijme povel jen při platném čísle 1–7.',
  'Robot shodí do_ProcReq, vrátí číslo procedury v go_ProcNum, nastaví do_ProcBusy = 1 a vykoná proceduru.',
  'Po dokončení procedury robot shodí do_ProcBusy, nastaví go_ProcNum = 0 a vyšle impuls do_ProcDone (0,5 s).',
  'Robot znovu nastaví do_ProcReq = 1. Další povel přijme až poté, co PLC vrátí di_ProcStart na 0.',
], [
  'The robot is ready: it sets do_ProcReq = 1 and waits until the PLC holds di_ProcStart = 0.',
  'The PLC sets the procedure number 1–7 in gi_ProcNum and sets di_ProcStart = 1. The robot accepts the command only with a valid number 1–7.',
  'The robot resets do_ProcReq, echoes the procedure number in go_ProcNum, sets do_ProcBusy = 1 and executes the procedure.',
  'After the procedure finishes the robot resets do_ProcBusy, sets go_ProcNum = 0 and sends a pulse on do_ProcDone (0.5 s).',
  'The robot sets do_ProcReq = 1 again. It accepts the next command only after the PLC has returned di_ProcStart to 0.',
])))
c.push(P(t(
  'Během čekání na povel zobrazuje FlexPendant hlášení „Ceka se na povel od PLC“. Procedura se volá podle jména (pozdní vazba, %ProcedureName%).',
  'While waiting for a command the FlexPendant shows the message “Ceka se na povel od PLC” (waiting for a PLC command). The procedure is called by name (late binding, %ProcedureName%).')))

sub('Přerušení', 'Interrupts', 'int')
c.push(...TABLE(
  [t('Spouštěč', 'Trigger'), t('Obsluha', 'Routine'), t('Účinek', 'Effect')],
  [
    [t('změna gi_SpeedReq', 'change of gi_SpeedReq'), 'SpeedOverride', t('Nová hodnota se nastaví jako rychlost programu v % (SpeedRefresh) a vrátí v go_RobotSpeed.', 'The new value is set as the program speed in % (SpeedRefresh) and echoed in go_RobotSpeed.')],
    [t('di_ProcStop = 1', 'di_ProcStop = 1'), 'QuitJob', t('Přerušení probíhajícího cyklu (ExitCycle) — program pokračuje znovu od začátku main včetně Init.', 'Abort of the running cycle (ExitCycle) — the program continues again from the start of main including Init.')],
    [t('di_ResetExecAlarm = 1', 'di_ResetExecAlarm = 1'), 'ResetFaults', t('Vynuluje do_UnknownPos. Tentýž vstup je zároveň systémový vstup ResetError (kap. 8.2).', 'Resets do_UnknownPos. The same input is also the system input ResetError (section 8.2).')],
  ],
  [2300, 1800, 5538], t('Přerušení programu', 'Program interrupts')))

// ═══ Procedury ═════════════════════════════════════════════════════════
chapter('Procedury', 'Procedures', 'proc')
c.push(...TABLE(
  [t('Č.', 'No.'), t('Název (PLC)', 'Name (PLC)'), t('Procedura', 'Procedure'), t('Pohyb', 'Motion')],
  [
    ['1', 'eSAFEHOME', 'rGoHomeSafe', t('Svisle do bezpečné výšky, pak do domovské polohy (rychlost v200, přesné zastavení). V aktuálním programu shodná s procedurou 2.', 'Vertically to the safe height, then to the home position (speed v200, fine stop). In the current program identical to procedure 2.')],
    ['2', 'eHOME', 'rGoHome', t('Svisle do bezpečné výšky, pak do domovské polohy (v200).', 'Vertically to the safe height, then to the home position (v200).')],
    ['3', 'eGO_WAITPOSITION_PICK', 'rWaitPos_Pick', t('Do bezpečné výšky, v bezpečné výšce nad čekací polohu vyzvednutí a do ní.', 'To the safe height, at the safe height above the pick wait position and into it.')],
    ['4', t('rezerva', 'reserve'), '—', '—'],
    ['5', 'eGO_WAITPOSITION_PLACE', 'rWaitPos_Place', t('Do bezpečné výšky, nad čekací polohu odkládání a do ní.', 'To the safe height, above the place wait position and into it.')],
    ['6', 'eGO_PICK_PART', 'rPickPart', t(`Vyzvednutí kusu s povolením vjezdu od PLC (kap. 5.2).`, `Picking of a piece with entry enable from the PLC (section 5.2).`)],
    ['7', 'eGO_PLACE_PART', 'rPlacePart', t(`Odložení kusu do zadaného boxu a pozice s povolením vjezdu od PLC (kap. 5.3).`, `Placing of the piece into the given box and position with entry enable from the PLC (section 5.3).`)],
  ],
  [700, 2600, 1700, 4638], t('Procedury robota', 'Robot procedures')))

sub('Bezpečná výška', 'Safe height', 'safe')
c.push(P(t(
  'Přejezdy mezi místy probíhají v bezpečné výšce: osa 3 (svislá osa SCARA) má hodnotu domovské polohy (−10,0 mm). Funkce GoSafelyUp vrací aktuální polohu se zvednutou osou 3 (robot nejdřív vyjede svisle nahoru), funkce Safely vrací cílovou polohu ve stejné výšce (robot přejede nad cíl a teprve pak sjede dolů).',
  'Transfers between positions take place at the safe height: axis 3 (the vertical SCARA axis) has the home position value (−10.0 mm). The GoSafelyUp function returns the current position with axis 3 raised (the robot first moves vertically up), the Safely function returns the target position at the same height (the robot travels above the target and only then moves down).')))

sub('Vyzvednutí kusu (6)', 'Picking a piece (6)', 'pick')
c.push(...OL(t([
  'Handshake vyzvednutí: robot nastaví do_PickPosReq = 1 a čeká na di_PickPosEN = 1 od PLC; pak do_PickPosReq shodí a vyšle impuls do_PickPosAck (0,5 s).',
  'Kontrola, že chapadlo je otevřené (di_GripHP = 1).',
  'Přejezd 80 mm nad místo vyzvednutí (ve směru osy nástroje, vFast), dojezd do místa vyzvednutí rychlostí vContact s přesným zastavením.',
  'Zavření chapadla.',
  'Odjezd 80 mm nad místo vyzvednutí a návrat do čekací polohy vyzvednutí.',
], [
  'Pick handshake: the robot sets do_PickPosReq = 1 and waits for di_PickPosEN = 1 from the PLC; then it resets do_PickPosReq and sends a pulse on do_PickPosAck (0.5 s).',
  'Check that the gripper is open (di_GripHP = 1).',
  'Move 80 mm above the pick position (in the tool axis direction, vFast), approach to the pick position at vContact with a fine stop.',
  'Gripper closing.',
  'Retreat 80 mm above the pick position and return to the pick wait position.',
])))

sub('Odložení kusu (7)', 'Placing a piece (7)', 'place')
c.push(...OL(t([
  'Handshake odkládání: do_PlacePosReq = 1, čekání na di_PlacePosEN = 1, pak impuls do_PlacePosAck (0,5 s).',
  'Načtení čísla boxu gi_BoxNumber (1–6) a pozice v boxu gi_BoxPosition (1–12) — PLC je tedy musí mít platné nejpozději při povolení vjezdu.',
  'Zdvih do bezpečné výšky a přejezd (MoveJ, vFast, přesné zastavení) na pozici v boxu.',
  'Otevření chapadla — kus se uvolní.',
  'Zdvih do bezpečné výšky a návrat do čekací polohy vyzvednutí.',
], [
  'Place handshake: do_PlacePosReq = 1, wait for di_PlacePosEN = 1, then a pulse on do_PlacePosAck (0.5 s).',
  'Reading of the box number gi_BoxNumber (1–6) and the position in the box gi_BoxPosition (1–12) — the PLC must therefore have them valid no later than the entry enable.',
  'Lift to the safe height and move (MoveJ, vFast, fine stop) to the position in the box.',
  'Gripper opening — the piece is released.',
  'Lift to the safe height and return to the pick wait position.',
])))
c.push(NOTE('warn', t(
  'Při neplatném čísle boxu nebo pozice (0, box > 6, pozice > 12) zapíše robot chybu do protokolu událostí („Neplatne cislo boxu nebo pozice!“) a program ukončí (EXIT). Robot pak nehlásí do_ProcDone; program je nutné spustit znovu od začátku (např. systémovým vstupem di_StartAtMain).',
  'With an invalid box or position number (0, box > 6, position > 12) the robot writes an error to the event log (“Neplatne cislo boxu nebo pozice!”) and ends the program (EXIT). The robot then does not report do_ProcDone; the program must be restarted from the beginning (e.g. with the system input di_StartAtMain).')))

sub('Pozice v boxu', 'Positions in a box', 'box')
c.push(P(t(
  'Každý box má 12 pozic ve 3 sloupcích po 4 řadách. Pozice 1 je naučený bod boxu (pPlacePart_1 až pPlacePart_6), ostatní pozice program dopočítá posunem:',
  'Each box has 12 positions in 3 columns of 4 rows. Position 1 is the taught point of the box (pPlacePart_1 to pPlacePart_6), the program calculates the other positions by an offset:')))
c.push(...CODE([
  t('sloupec = (pozice − 1) DIV 4      → 0 … 2, krok 25 mm', 'column = (position − 1) DIV 4    → 0 … 2, step 25 mm'),
  t('řada    = (pozice − 1) MOD 4      → 0 … 3, krok 52 mm', 'row    = (position − 1) MOD 4    → 0 … 3, step 52 mm'),
  '',
  t('box 1, 2:     X + sloupec · 25,  Y + řada · 52', 'box 1, 2:     X + column · 25,  Y + row · 52'),
  t('box 3 – 6:    X − řada · 52,     Y + sloupec · 25', 'box 3 – 6:    X − row · 52,     Y + column · 25'),
]))
c.push(...FIG('rb_box', t('Číslování pozic v boxu', 'Position numbering in a box'), 0.6))
c.push(P(t(
  'Posun se počítá v souřadnicích robota (X, Y); výška pozice je výška naučeného bodu.',
  'The offset is calculated in robot coordinates (X, Y); the position height is the height of the taught point.')))

// ═══ Nástroj, rychlosti, polohy ════════════════════════════════════════
chapter('Nástroj, rychlosti a polohy', 'Tool, speeds and positions', 'data')
sub('Chapadlo', 'Gripper', 'grip')
c.push(P(t(
  'Chapadlo má dvě polohy: HP (otevřeno, výchozí poloha) a WP (zavřeno, pracovní poloha). Robot posílá povel do PLC (do_GripHP / do_GripWP) a čeká na stav snímačů od PLC (di_GripHP / di_GripWP):',
  'The gripper has two positions: HP (open, home position) and WP (closed, work position). The robot sends the command to the PLC (do_GripHP / do_GripWP) and waits for the sensor state from the PLC (di_GripHP / di_GripWP):')))
c.push(...TABLE(
  [t('Volání', 'Call'), t('Povely', 'Commands'), t('Čeká na', 'Waits for')],
  [
    ['Gripper\\Init', 'do_GripWP = 0, do_GripHP = 0', '—'],
    ['Gripper\\Open', 'do_GripWP = 0, do_GripHP = 1', 'di_GripWP = 0, di_GripHP = 1'],
    ['Gripper\\Close', 'do_GripHP = 0, do_GripWP = 1', 'di_GripHP = 0, di_GripWP = 1'],
    ['Gripper\\Open\\Check', '—', 'di_GripHP = 1'],
    ['Gripper\\Close\\Check', '—', 'di_GripWP = 1'],
  ],
  [2600, 3500, 3538], t('Ovládání chapadla', 'Gripper control')))
c.push(NOTE('info', t(
  'Čekání na chapadlo i na povolení vjezdu (handshake) nemá časový limit. Dokud podmínka neplatí, robot stojí a FlexPendant zobrazuje „Cekam na signal“ s názvem chybějícího signálu.',
  'Waiting for the gripper and for the entry enable (handshake) has no time limit. Until the condition is met, the robot stands still and the FlexPendant shows “Cekam na signal” (waiting for signal) with the name of the missing signal.')))

sub('Nástroj tGripper', 'Tool tGripper', 'tool')
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Hodnota', 'Value')],
  [
    [t('Nástroj nesen robotem', 'Tool held by the robot'), 'TRUE'],
    ['TCP', t('x 0, y 0, z 142 mm od příruby', 'x 0, y 0, z 142 mm from the flange')],
    [t('Orientace TCP', 'TCP orientation'), t('otočení −30° kolem osy z (q = 0,9659; 0; 0; −0,2588)', 'rotation −30° about the z axis (q = 0.9659; 0; 0; −0.2588)')],
    [t('Hmotnost / těžiště', 'Mass / centre of gravity'), t('0,66 kg / z 59 mm', '0.66 kg / z 59 mm')],
  ],
  [3400, 6238], t('Nástroj tGripper', 'Tool tGripper')))

sub('Rychlosti a zóny', 'Speeds and zones', 'speed')
c.push(...TABLE(
  [t('Data', 'Data'), t('TCP [mm/s]', 'TCP [mm/s]'), t('Použití', 'Use')],
  [
    ['vFast', '2000', t('přejezdy, přiblížení a odjezd od místa vyzvednutí, přejezd na pozici v boxu', 'transfers, approach to and retreat from the pick position, move to the box position')],
    ['vContact', '500', t('dojezd do místa vyzvednutí', 'approach to the pick position')],
    ['v200', '200', t('procedury 1 a 2 (domovská poloha)', 'procedures 1 and 2 (home position)')],
    ['vSlow', '800', t('definováno, v programu se nepoužívá', 'defined, not used in the program')],
  ],
  [1800, 1800, 6038], t('Rychlosti', 'Speeds')))
c.push(P(t(
  'Všechny rychlosti dále násobí rychlost programu v % zadaná PLC (gi_SpeedReq). Zóny: z20 u přejezdů, z5 u přiblížení a odjezdu od místa vyzvednutí, přesné zastavení (fine) v cílových bodech. Rychlost v ručním režimu omezuje SafeMove na 250 mm/s (kap. 9).',
  'All speeds are further multiplied by the program speed in % set by the PLC (gi_SpeedReq). Zones: z20 for transfers, z5 for approach and retreat at the pick position, fine stop at target points. In manual mode SafeMove limits the speed to 250 mm/s (section 9).')))

sub('Naučené polohy', 'Taught positions', 'pos')
c.push(...TABLE(
  [t('Poloha', 'Position'), t('Typ', 'Type'), t('Hodnota', 'Value')],
  [
    ['jtHomePos', t('osy', 'joints'), '−85,24°; 120,55°; −10,01 mm; 149,22°'],
    ['jtWaitPos_Pick', t('osy', 'joints'), '−85,24°; 120,55°; −91,27 mm; 149,21°'],
    ['jtWaitPos_Place', t('osy', 'joints'), '−8,91°; 123,59°; −10,00 mm; 228,56°'],
    ['pPickPart', 'X, Y, Z [mm]', '244,53; −364,40; −111,26'],
    ['pPlacePart_1', 'X, Y, Z [mm]', '273,30; −119,52; 49,50'],
    ['pPlacePart_2', 'X, Y, Z [mm]', '515,17; −119,53; 49,50'],
    ['pPlacePart_3', 'X, Y, Z [mm]', '535,07; 227,62; 49,50'],
    ['pPlacePart_4', 'X, Y, Z [mm]', '193,78; 274,55; 49,50'],
    ['pPlacePart_5', 'X, Y, Z [mm]', '285,32; 502,70; 49,50'],
    ['pPlacePart_6', 'X, Y, Z [mm]', '−55,91; 500,95; 49,50'],
  ].map(r => L === 'cs' ? r : [r[0], r[1], r[2].replace(/,/g, '.').replace(/;/g, ';')]),
  [2600, 2000, 5038], t('Naučené polohy (osy 1–4, resp. TCP v bázi robota)', 'Taught positions (axes 1–4, or TCP in the robot base frame)')))
c.push(NOTE('info', t(
  'Polohy jsou konstanty v modulech mMovement a mData. Po přeučení polohy je třeba vytvořit novou zálohu (kap. 10) a zkontrolovat pracovní zóny (kap. 7), které z poloh vycházejí.',
  'The positions are constants in the mMovement and mData modules. After re-teaching a position a new backup must be created (section 10) and the work zones derived from the positions must be checked (section 7).')))

// ═══ Pracovní zóny ═════════════════════════════════════════════════════
chapter('Pracovní zóny', 'Work zones', 'wz')
c.push(P(t(
  'Procedura Act_Zones se spouští při každém zapnutí řídicího systému (událost POWER_ON) a definuje stálé pracovní zóny (World Zones). Výstup zóny je 1, dokud je robot uvnitř; PLC ho dostává v bajtu 40 (kap. 8.1). Zóny pouze hlásí polohu, pohyb neomezují.',
  'The Act_Zones procedure runs at every controller power-on (POWER_ON event) and defines stationary work zones (World Zones). The zone output is 1 while the robot is inside; the PLC receives it in byte 40 (section 8.1). The zones only report the position, they do not restrict motion.')))
c.push(...TABLE(
  [t('Zóna', 'Zone'), t('Tvar', 'Shape'), t('Výstup', 'Output')],
  [
    [t('Domovská poloha', 'Home position'), t('poloha os jtHomePos ± 0,5', 'joint position jtHomePos ± 0.5'), 'do_wzHomePos'],
    [t('Čekací poloha vyzvednutí', 'Pick wait position'), t('poloha os jtWaitPos_Pick ± 0,5', 'joint position jtWaitPos_Pick ± 0.5'), 'do_wzWaitPick'],
    [t('Místo vyzvednutí', 'Pick position'), t('válec r = 100 mm, výška 400 mm, základna 100 mm pod pPickPart', 'cylinder r = 100 mm, height 400 mm, base 100 mm below pPickPart'), 'do_wzPick'],
    [t('Čekací poloha odkládání', 'Place wait position'), t('poloha os jtWaitPos_Place ± 0,5', 'joint position jtWaitPos_Place ± 0.5'), 'do_wzWaitPlace'],
    [t('Boxy', 'Boxes'), t('3 kvádry (X, Y, Z [mm]): 250…590, −140…60, −150…70; 10…550, 210…340, −150…70; −230…300, 480…570, −150…70', '3 boxes (X, Y, Z [mm]): 250…590, −140…60, −150…70; 10…550, 210…340, −150…70; −230…300, 480…570, −150…70'), t('do_wzPlaceBox (logický součet tří zón)', 'do_wzPlaceBox (logical OR of the three zones)')],
  ],
  [2500, 4900, 2238], t('Pracovní zóny', 'Work zones')))

// ═══ Signály ═══════════════════════════════════════════════════════════
chapter('Mapa signálů', 'Signal map', 'map')
c.push(P(t(
  'Robot je pro PLC zařízením EtherCAT (EC_Internal_Device): 64 B standardních dat v každém směru a 8 B bezpečnostních dat FSoE. Adresa = bajt.bit v datech zařízení. Signály „systémové“ jsou svázány se stavem nebo akcí řídicího systému (SYSSIG_OUT / SYSSIG_IN), ostatní obsluhuje program.',
  'For the PLC the robot is an EtherCAT device (EC_Internal_Device): 64 B of standard data in each direction and 8 B of FSoE safety data. Address = byte.bit in the device data. “System” signals are linked to a controller state or action (SYSSIG_OUT / SYSSIG_IN), the others are handled by the program.')))
sub('Robot → PLC', 'Robot → PLC', 'out')
const NP = t('program nenastavuje', 'not set by the program')
c.push(...TABLE(
  [t('Adresa', 'Address'), t('Signál', 'Signal'), t('Význam', 'Meaning')],
  [
    ['0.0', 'do_MotorsON', t('systémový: motory zapnuty', 'system: motors on')],
    ['0.1', 'do_RunChainOK', t('systémový: bezpečnostní řetězec v pořádku', 'system: run chain OK')],
    ['0.2', 'do_AutoON', t('systémový: automatický režim', 'system: automatic mode')],
    ['0.3', 'do_ProgramRun', t('systémový: program běží', 'system: program running')],
    ['0.4', 'do_SysAlarm', t('systémový: chyba úlohy T_ROB1', 'system: error in task T_ROB1')],
    ['0.5', 'do_Estop', t('systémový: nouzové zastavení', 'system: emergency stop')],
    ['0.6', 'do_Collision', t('systémový: zareagovala detekce kolize (Motion Supervision)', 'system: collision detection triggered (Motion Supervision)')],
    ['0.7', 'do_WriteAccess', t('systémový: PLC má přístup pro zápis', 'system: PLC has write access')],
    ['1.0', 'do_WriteAccessAvailable', t('systémový: přístup pro zápis je k dispozici', 'system: write access available')],
    ['2–3', 'go_ErrorCode', t(`číslo chyby (16 bitů) — ${NP}`, `error number (16 bits) — ${NP}`)],
    ['4.0', 'do_MotionTaskExec', t('systémový: úloha T_ROB1 se vykonává', 'system: task T_ROB1 executing')],
    ['4.1', 'do_LimitSpeedON', t('systémový: omezená rychlost', 'system: limited speed')],
    ['4.2', 'do_StandStill', t('systémový: robot stojí', 'system: robot at standstill')],
    ['4.3', 'do_MotionSupervision', t('systémový: zareagovala detekce kolize (Motion Supervision)', 'system: collision detection triggered (Motion Supervision)')],
    ['5.0', 'do_ProcReq', t(`připraven přijmout povel (kap. 4)`, `ready to accept a command (section 4)`)],
    ['5.1', 'do_ProcBusy', t('procedura probíhá', 'procedure running')],
    ['5.2', 'do_ProcDone', t('procedura dokončena (impuls 0,5 s)', 'procedure finished (0.5 s pulse)')],
    ['5.3', 'do_UnknownPos', t('robot v neznámé poloze — program jen nuluje', 'robot in unknown position — the program only resets it')],
    ['6', 'go_ProcNum', t('číslo právě vykonávané procedury (0 = žádná)', 'number of the procedure being executed (0 = none)')],
    ['7', 'go_RobotSpeed', t('aktuální rychlost programu [%]', 'current program speed [%]')],
    ['8', 'go_RobotVersion', t(`verze programu — ${NP}`, `program version — ${NP}`)],
    ['10.0', 'do_GripHP', t('povel chapadlo otevřít (HP)', 'command gripper open (HP)')],
    ['11.0', 'do_GripWP', t('povel chapadlo zavřít (WP)', 'command gripper close (WP)')],
    ['12.0', 'do_PickPosReq', t('žádost o vjezd na místo vyzvednutí', 'request to enter the pick position')],
    ['12.1', 'do_PickPosAck', t('potvrzení povolení vyzvednutí (impuls 0,5 s)', 'pick enable acknowledgement (0.5 s pulse)')],
    ['12.2', 'do_PlacePosReq', t('žádost o vjezd k boxům', 'request to enter the boxes')],
    ['12.3', 'do_PlacePosAck', t('potvrzení povolení odkládání (impuls 0,5 s)', 'place enable acknowledgement (0.5 s pulse)')],
    ['40.0', 'do_wzHomePos', t('v zóně domovské polohy', 'in the home position zone')],
    ['40.1', 'do_wzWaitPick', t('v zóně čekací polohy vyzvednutí', 'in the pick wait position zone')],
    ['40.2', 'do_wzPick', t('v zóně místa vyzvednutí', 'in the pick position zone')],
    ['40.3', 'do_wzWaitPlace', t('v zóně čekací polohy odkládání', 'in the place wait position zone')],
    ['40.4', 'do_wzPlaceBox', t('v zóně boxů', 'in the box zone')],
  ],
  [1100, 2700, 5838], t('Signály robot → PLC', 'Signals robot → PLC')))
sub('PLC → robot', 'PLC → robot', 'in')
c.push(...TABLE(
  [t('Adresa', 'Address'), t('Signál', 'Signal'), t('Význam', 'Meaning')],
  [
    ['0.0', 'di_MotorsON', t('systémový: zapnout motory', 'system: motors on')],
    ['0.1', 'di_MotorsOFF', t('systémový: vypnout motory', 'system: motors off')],
    ['0.2', 'di_StartAtMain', t('systémový: spustit program od začátku (main)', 'system: start the program from the beginning (main)')],
    ['0.3', 'di_ContinueRun', t('systémový: spustit / pokračovat v programu', 'system: start / continue the program')],
    ['0.4', 'di_QuickStop', t('systémový: rychlé zastavení', 'system: quick stop')],
    ['0.5', 'di_ProgramStop', t('systémový: zastavení programu (měkké)', 'system: program stop (soft)')],
    ['0.6', 'di_ResetExecAlarm', t('systémový: kvitování chyby; v programu nuluje do_UnknownPos', 'system: error reset; in the program resets do_UnknownPos')],
    ['0.7', 'di_WriteAccess', t('systémový: požadavek na přístup pro zápis', 'system: write access request')],
    ['5.0', 'di_ProcStart', t('start procedury', 'procedure start')],
    ['5.1', 'di_ProcStop', t('přerušení cyklu (ExitCycle)', 'cycle abort (ExitCycle)')],
    ['6', 'gi_ProcNum', t('číslo procedury 1–7', 'procedure number 1–7')],
    ['7', 'gi_SpeedReq', t('požadovaná rychlost programu [%]', 'requested program speed [%]')],
    ['8', 'gi_VersionReq', t('požadovaná verze — program nepoužívá', 'requested version — not used by the program')],
    ['10.0', 'di_GripHP', t('chapadlo otevřeno (HP)', 'gripper open (HP)')],
    ['11.0', 'di_GripWP', t('chapadlo zavřeno (WP)', 'gripper closed (WP)')],
    ['12.0', 'di_PickPosEN', t('povolení vjezdu na místo vyzvednutí', 'entry enable for the pick position')],
    ['12.1', 'di_PlacePosEN', t('povolení vjezdu k boxům', 'entry enable for the boxes')],
    ['20', 'gi_BoxNumber', t('číslo boxu 1–6', 'box number 1–6')],
    ['21', 'gi_BoxPosition', t('pozice v boxu 1–12', 'position in the box 1–12')],
  ],
  [1100, 2700, 5838], t('Signály PLC → robot', 'Signals PLC → robot')))
c.push(P(t('Ostatní bajty standardních dat jsou rezerva.', 'The other bytes of the standard data are reserved.')))
sub('Bezpečnostní signály FSoE', 'FSoE safety signals', 'fsoe')
c.push(...TABLE(
  [t('Adresa FSoE', 'FSoE address'), t('Signál', 'Signal'), t('Směr', 'Direction'), t('Funkce', 'Function')],
  [
    ['0.0', 'sdi_Estop', 'PLC → robot', t('nouzové zastavení PLC_Estop (kategorie 0)', 'emergency stop PLC_Estop (category 0)')],
    ['0.1', 'sdi_AutoStop', 'PLC → robot', t('ochranné zastavení PLC_AutoStop v automatickém režimu (kategorie 1)', 'protective stop PLC_AutoStop in automatic mode (category 1)')],
    ['0.2', 'sdi_ExtReset', 'PLC → robot', t('externí reset (funkce ExtReset)', 'external reset (ExtReset function)')],
    ['0.0', 'sdo_EstopOK', 'robot → PLC', t('stav lokálního nouzového zastavení (LocalEmergencyStopStatus)', 'local emergency stop status (LocalEmergencyStopStatus)')],
    ['0.1', 'sdo_Automatic', 'robot → PLC', t('automatický režim (kopie AutomaticMode)', 'automatic mode (copy of AutomaticMode)')],
  ],
  [1500, 1900, 1800, 4438], t('Signály FSoE', 'FSoE signals')))

// ═══ Bezpečnost ════════════════════════════════════════════════════════
chapter('Bezpečnostní konfigurace (SafeMove)', 'Safety configuration (SafeMove)', 'safe')
c.push(P(t(
  'Bezpečnostní funkce robota zajišťuje SafeMove (volba SafeMove Premium). Úplnou konfiguraci uvádí ABB Safety Configuration Report; zde je její souhrn.',
  'The robot safety functions are provided by SafeMove (SafeMove Premium option). The complete configuration is given in the ABB Safety Configuration Report; this is its summary.')))
c.push(...TABLE(
  [t('Položka', 'Item'), t('Hodnota', 'Value')],
  [
    [t('Konfigurace', 'Configuration'), t('verze 4.00.00, vytvořena 2026-10-23, kontrolní součet (krátký) A698B24E', 'version 4.00.00, created 2026-10-23, checksum (short) A698B24E')],
    [t('Max. rychlost v ručním režimu', 'Max. speed in manual mode'), '250 mm/s'],
    [t('Bezpečná zóna Safe_Zone', 'Safe zone Safe_Zone'), t('X −300…650 mm, Y −550…650 mm, Z −150…650 mm; hlídání polohy nástroje vč. ramene trvale aktivní, robot smí být jen uvnitř, porušení = zastavení kategorie 1', 'X −300…650 mm, Y −550…650 mm, Z −150…650 mm; tool position supervision incl. upper arm permanently active, robot allowed only inside, violation = category 1 stop')],
    [t('Geometrie pro hlídání', 'Supervised geometry'), t('rameno: válec s polokoulemi r 90 mm (x −50…250 mm, z 60 mm); nástroj: r 40 mm (z −10…105 mm)', 'upper arm: capsule r 90 mm (x −50…250 mm, z 60 mm); tool: capsule r 40 mm (z −10…105 mm)')],
    [t('Synchronizace', 'Synchronisation'), t('softwarová, v poloze os −85,243°; 120,547°; −10,013 mm; 149,244°', 'software, at joint position −85.243°; 120.547°; −10.013 mm; 149.244°')],
    [t('Cyklická kontrola brzd', 'Cyclic brake check'), t('neaktivní', 'inactive')],
    ['FSoE', t('bezpečnostní adresa 6, 64 bitů v každém směru', 'safety address 6, 64 bits in each direction')],
  ],
  [3200, 6438], t('Souhrn SafeMove', 'SafeMove summary')))
c.push(...TABLE(
  [t('Zastavení', 'Stop'), t('Spouštěč', 'Trigger'), t('Kategorie', 'Category')],
  [
    ['TPU_EmergencyStop', t('nouzové tlačítko FlexPendantu', 'FlexPendant emergency stop button'), '0'],
    ['ES_ExternalEmergencyStop', t('externí nouzové zastavení', 'external emergency stop'), '0'],
    ['PLC_Estop', 'sdi_Estop', '0'],
    ['PLC_AutoStop', t('sdi_AutoStop (automatický režim)', 'sdi_AutoStop (automatic mode)'), '1'],
    ['A_AutoStop', t('automatický režim', 'automatic mode'), '1'],
    ['G_GeneralStop', t('obecné zastavení', 'general stop'), '1'],
  ],
  [3200, 4600, 1838], t('Konfigurace zastavení', 'Stop configurations')))
c.push(NOTE('warn', t(
  'Každá změna bezpečnostní konfigurace mění kontrolní součet. Změněnou konfiguraci je nutné ověřit podle aplikační příručky SafeMove a vystavit nový Safety Configuration Report.',
  'Every change of the safety configuration changes the checksum. A changed configuration must be validated according to the SafeMove application manual and a new Safety Configuration Report must be issued.')))

// ═══ Zálohy ════════════════════════════════════════════════════════════
chapter('Zálohy', 'Backups', 'bk')
c.push(P(t(
  `Aktuální záloha řídicího systému je 920-100056_BACKUP_${ZALOHA} (složka projektu 13.Robot/4.Zálohy, také jako ZIP). Obsahuje program (RAPID, úloha T_ROB1), konfiguraci systému (SYSPAR: EIO, MOC, SYS, SIO, MMC, PROC), licenci a uživatele řídicího systému. Starší záloha 2026-08-28 je archivní.`,
  `The current controller backup is 920-100056_BACKUP_${ZALOHA} (project folder 13.Robot/4.Zálohy, also as ZIP). It contains the program (RAPID, task T_ROB1), the system configuration (SYSPAR: EIO, MOC, SYS, SIO, MMC, PROC), the licence and the controller users. The older backup of 2026-08-28 is archival.`)))
c.push(...UL(t([
  'Po každé změně programu, poloh nebo konfigurace se vytvoří nová záloha (FlexPendant nebo RobotStudio) a uloží se do projektu.',
  'Obnova se provádí funkcí Obnovit (Restore) řídicího systému ze zálohy stejného systému 920-100056.',
  'Po obnově se ověří kontrolní součet bezpečnostní konfigurace proti Safety Configuration Reportu.',
], [
  'After every change of the program, positions or configuration a new backup is created (FlexPendant or RobotStudio) and stored in the project.',
  'Restoring is done with the controller Restore function from a backup of the same system 920-100056.',
  'After restoring, the safety configuration checksum is verified against the Safety Configuration Report.',
])))

// ═══ Pojmy ═════════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production; “tester” for short in the text.')],
    ['SCARA', t('Robot se dvěma vodorovnými rotačními osami, svislou osou 3 a rotací nástroje (osa 4).', 'Robot with two horizontal rotary axes, vertical axis 3 and tool rotation (axis 4).')],
    ['RAPID', t('Programovací jazyk robotů ABB.', 'Programming language of ABB robots.')],
    ['FlexPendant', t('Ruční ovládací panel robota.', 'Robot teach pendant.')],
    ['TCP', t('Tool Center Point — pracovní bod nástroje.', 'Tool Center Point — working point of the tool.')],
    ['HP / WP', t('Poloha chapadla: výchozí (otevřeno) / pracovní (zavřeno).', 'Gripper position: home (open) / work (closed).')],
    ['World Zones', t('Pracovní zóny řídicího systému hlásící polohu robota.', 'Controller work zones reporting the robot position.')],
    ['SafeMove', t('Bezpečnostní řízení ABB (bezpečné zóny, rychlosti, zastavení).', 'ABB safety controller (safe zones, speeds, stops).')],
    ['FSoE', t('Fail Safe over EtherCAT — bezpečnostní komunikace s PLC.', 'Fail Safe over EtherCAT — safety communication with the PLC.')],
    [t('Kategorie zastavení 0 / 1', 'Stop category 0 / 1'), t('0: okamžité odpojení energie; 1: řízené zastavení, pak odpojení energie.', '0: immediate removal of power; 1: controlled stop, then removal of power.')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

// kontrola pevných odkazů na kapitoly proti skutečnému číslování
const EXPECT = {'INT': '4.1', 'PICK': '5.2', 'PLACE': '5.3', 'CYCLE': '4', 'SYS': '8.2', 'SAFE': '9', 'BK': '10', 'WZ': '7', 'MAP': '8.1'}
const KEY = { INT: 'int', PICK: 'pick', PLACE: 'place', CYCLE: 'cycle', SYS: 'in', SAFE: 'safe', BK: 'bk', WZ: 'wz', MAP: 'out' }
for (const [k, v] of Object.entries(EXPECT)) if (REF[KEY[k]] !== v) throw new Error(`odkaz ${k}: ${REF[KEY[k]]} ≠ ${v}`)
M.write(OUT, c)
