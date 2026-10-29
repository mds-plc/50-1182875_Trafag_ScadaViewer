/**
 * @file i18n/help.cs.ts
 * @description Nápověda stránek (ikona „?" vedle nadpisu — components/PageHelp.tsx), česky.
 *   Při změně stránky upravit i help.en.ts (stejné pořadí položek).
 */
import type { Translations } from './types'

export const helpCs: Translations['help'] = {
  button: 'Nápověda ke stránce',
  pages: {
    database: {
      title: 'Databáze — přehled zakázek a testů',
      intro: 'Hlavní stránka aplikace. Zobrazuje uložené výrobní zakázky (Production) a testy mikrospínačů (Testing), na tomto PC i v archivu na NAS. Odtud se otevírá detail, stahují data a hlídá zaplnění úložiště.',
      items: [
        { title: 'Lokální / Vzdálená', text: 'Lokální = soubory na tomto PC (zakázky čekající na odeslání i už odeslané). Vzdálená = archiv na Synology NAS. Tečka u záložky ukazuje, zda je NAS dostupný.' },
        { title: 'Production / Testing', text: 'Production = zakázky z výroby (každý řádek = jedna zakázka s mnoha kusy). Testing = jednotlivá testovací měření mikrospínače se signálovými daty.' },
        { title: 'Úložiště a NAS', text: 'Ukazatele v hlavičce: zaplnění lokálního úložiště vůči limitu a zaplnění NAS. Od 80 % varování, od 95 % kritický stav. Tlačítkem lze smazat lokální kopie souborů, které už jsou bezpečně na NAS. Administrátor u stroje tu vidí i ukazatel flashky (USB) se zaplněním a tlačítkem bezpečného odebrání.' },
        { title: 'Hledat zakázku', text: 'Napište část čísla nebo názvu zakázky (velikost písmen ani diakritika nevadí). Během hledání se prohledává celý archiv bez ohledu na datum. Křížek nebo Esc hledání zruší.' },
        { title: 'Od – do', text: 'Datumový filtr podle vzniku zakázky, výchozí jsou poslední 2 dny. Když filtr nic nenajde, nabídne přechod na den s nejnovějšími daty.' },
        { title: 'Tabulka', text: 'Klik na záhlaví sloupce řadí. Klik na řádek zakázky (nebo šipka) rozbalí přehled kusů a rozložení kategorií; ikona grafu otevře detail zakázky rovnou, bez rozbalení. CSV / XLSX stáhne celou zakázku. Na PC u stroje se soubor neukládá do prohlížeče, ale na zasunutou flashku (složka Trafag_ScadaViewer) — jen administrátor (i přihlášení přes PLC); bez zasunuté flashky aplikace při pokusu o uložení upozorní a ukazatel USB zabliká. Flashku pak bezpečně odeberete tlačítkem u ukazatele USB v hlavičce Databáze (vedle lokálního úložiště a NAS). V rozbaleném přehledu kusů jsou hodnoty mimo limity třídění lehce podbarvené. „…" u počtu kusů = počet se právě dopočítává. Rozpracovaná zakázka je zvýrazněná nahoře.' },
        { title: 'Hromadné stažení', text: 'Stáhnout vše (v liště filtru) stáhne všechny soubory, které odpovídají aktuálnímu filtru — záložce, datu Od – do, případně hledání (počet je v závorce). Stáhnout vybrané (v liště po zaškrtnutí řádků) stáhne jen zaškrtnuté. Najednou nejvýš 500 souborů — při větším počtu zužte filtr. V dialogu zvolíte formát CSV (originální soubory) nebo XLSX. Na PC u stroje se soubory uloží jednotlivě do nové složky na flashce (jen administrátor) a dialog ukazuje průběh, ukládání lze zrušit; po dokončení můžete flashku rovnou bezpečně odebrat. Z kanceláře se stáhne jeden soubor ZIP. Rozpracovaná zakázka se nestahuje.' },
        { title: 'Sync', text: 'In progress = zakázka se právě vyrábí. Local = uloženo jen na tomto PC, čeká na odeslání na NAS. Synced = už je i na NAS.' },
        { title: 'Mazání', text: 'Jednotlivě nebo hromadně (zaškrtnutím) — technik a výše, operátor nemaže. Soubor, který ještě není na NAS (Local), smí smazat jen administrátor — data by se nenávratně ztratila. Rozpracovanou zakázku (In progress) smí smazat jen administrátor, jednotlivě a po potvrzení rizika; vyrábí-li ji stroj dál, další kus PLC odmítne. Z NAS se nemaže nikdy. Z kanceláře je stránka jen pro prohlížení.' },
        { title: 'Dokončit zakázku', text: 'Tlačítko se zatržítkem u rozpracované zakázky (In progress) — jen administrátor u stroje (i přihlášení přes PLC). Zakázku, která na stroji skončila a neuzavřela se (např. výpadek proudu), uzavře se všemi dosud naměřenými kusy; DatabaseGateway ji pak nahraje na NAS. Zakázku, která na stroji právě běží, dokončit nejde. Když nefunguje spojení s PLC, je nutné potvrdit, že zakázka na stroji neběží. Pokračovat v dokončené zakázce už nelze.' },
      ],
    },
    order: {
      title: 'Detail zakázky',
      intro: 'Souhrn jedné výrobní zakázky: kolik kusů vzniklo, jak dopadly (OK / NOK, kategorie 1–6), s jakým nastavením se testovalo a jak výroba probíhala v čase. Odtud se otevírá detail jednotlivého kusu.',
      items: [
        { title: 'Hlavička zakázky', text: 'Číslo zakázky, typ a ID mikrospínače, receptura, počet kusů a podíl OK / NOK. Ze šarží výrobce jsou vidět první tři; tlačítko „+N dalších" otevře celý seznam v Údajích zakázky.' },
        { title: 'Rozložení kategorií / Časový průběh', text: 'Přepínač grafu: počet kusů v kategoriích 1–6 — zelený pás OK (1–4) a dva samostatné pásy NOK: žlutý NOK Trafag (5, mimo limity Trafag) a oranžový NOK Supplier (6, mimo limity výrobce); barvy kategorií = barvy štítků třídicích krabic, každý se svým součtem; pod OK kategoriemi rozmezí třídicí veličiny (MD), je-li v souboru. Nebo vyrobené kusy v čase s ukazateli (doba výroby, průměrný takt, prodlevy, kusy za hodinu).' },
        { title: 'Údaje zakázky', text: 'Rozbalovací řádky se souhrnem: šarže výrobce (všechny, očíslované v pořadí výskytu), parametry testu, se kterými stroj měřil (rychlost, zrychlení, síla, proud…), meze kategorií třídění a limity jednotlivých parametrů. Klik na řádek ho rozbalí nebo sbalí.' },
        { title: 'Řazení a filtr kusů', text: 'Nejstarší / Nejnovější, filtr Stav (OK / NOK), Kategorie a NOK oblast (Force, Position, Electric, Times, Process — kusy, které v dané oblasti nevyhověly; číslo u tlačítka = počet kusů v celé zakázce, víc oblastí = aspoň jedna z nich). Filtry se kombinují, počty a stránkování se přepočítají.' },
        { title: 'Tabulka kusů', text: 'Jeden řádek = jeden testovaný kus s naměřenými parametry. Klik na řádek otevře detail kusu s diagramy. Hodnoty mimo limity třídění zakázky jsou lehce podbarvené — žlutě mimo limity Trafag nebo MD mimo kategorie 1–4 (NOK Trafag), oranžově mimo limity výrobce (NOK Supplier), oranžově se žlutým pruhem mimo obojí; po najetí se ukážou meze.' },
        { title: 'Tisk a export', text: 'Tisk vytvoří protokol A4 z aktuálně zobrazených kusů. Tlačítka CSV a XLSX stáhnou celou zakázku (originální CSV, nebo tabulku pro Excel s čísly a časy — u nových zakázek ve stejném rozložení jako vzor zakázky: údaje zakázky, testovací parametry, kategorie a limity nad daty). Na PC u stroje se soubor neukládá do prohlížeče, ale na zasunutou flashku (složka Trafag_ScadaViewer) — jen administrátor (i přihlášení přes PLC); bez zasunuté flashky aplikace při pokusu o uložení upozorní a ukazatel USB zabliká. Flashku pak bezpečně odeberete tlačítkem u ukazatele USB v hlavičce Databáze (vedle lokálního úložiště a NAS).' },
      ],
    },
    record: {
      title: 'Detail kusu',
      intro: 'Všechny naměřené hodnoty jednoho kusu z výroby a jejich grafické znázornění. Slouží k posouzení, proč kus skončil v dané kategorii.',
      items: [
        { title: 'Diagram síla – dráha', text: 'Schéma hysterezní smyčky mikrospínače s hodnotami tohoto kusu: polohy (FP, OP, RP, TTP a u novějších souborů FPR — volná poloha po návratu), síly (OF, RF, TTF, silový diferenciál DF), dráhy (PT, OvT, RvT, MD, TT — RvT je od 27. 10. 2026 dráha FP → RP podle DIN 41636-1, u starších souborů TTP → RP, označeno v kótě), odpory kontaktů v bodech přepnutí a u novějších souborů statický odpor sepnutých kontaktů NC / NO (box Static). Ikonou lze zvětšit.' },
        { title: 'Časový diagram', text: 'Průběh napětí kontaktů NC a NO při přepnutí (jako na osciloskopu) s časy UT, RevT, BT a OpT v měřítku. Je-li jeden úsek mnohem delší než ostatní, osa se zkrátí (značka „//") a krátké úseky zůstanou čitelné — hodnoty v kótách platí vždy.' },
        { title: 'NOK kategorie', text: 'Ve kterých oblastech (síla, poloha, elektrika, časy, proces) kus nevyhověl.' },
        { title: 'Tabulka parametrů', text: 'Zkratka, název, hodnota a jednotka. „?" zobrazí popis a výpočet parametru, ikona grafu ukáže parametr zvýrazněný v diagramu. „—" = hodnota nestanovena, ∞ = rozepnutý kontakt. Hodnoty mimo limity třídění zakázky jsou lehce podbarvené — žlutě mimo limity Trafag nebo MD mimo kategorie 1–4 (NOK Trafag), oranžově mimo limity výrobce (NOK Supplier), oranžově se žlutým pruhem mimo obojí; po najetí se ukážou meze.' },
        { title: 'Zpět a tisk', text: 'Zpět vrátí do detailu zakázky na stejné místo. Tisk vytvoří protokol kusu A4.' },
      ],
    },
    testing: {
      title: 'Detail měření (Testing)',
      intro: 'Jedno testovací měření mikrospínače: nastavení testu, vyhodnocené parametry, výsledek a surová signálová data z měření.',
      items: [
        { title: 'Hlavička', text: 'Typ, ID mikrospínače a receptura, čas a doba měření a výsledek OK / NOK (podle NOK kategorií).' },
        { title: 'Nastavení testu', text: 'Parametry pohonu, elektriky a měření, se kterými test proběhl.' },
        { title: 'Měření a Výsledky', text: 'Údaje o průběhu měření (u novějších souborů i kalibrační konstanta C) a vyhodnocené parametry (síly vč. DF, polohy vč. FPR, dráhy, odpory, časy) — stejná tabulka jako u výroby, včetně „?" a grafu parametru.' },
        { title: 'NOK hodnocení', text: 'Výsledek a oblasti, ve kterých měření nevyhovělo.' },
        { title: 'Signálová data', text: 'Pět grafů ze surových dat (přehled, výsledky, hystereze, detail přepnutí, časy) s body FP, OP, TTP, RP a FPR. Zoom kolečkem nebo dvěma prsty, posun tažením, dvojklik = původní zobrazení, ikona = celá obrazovka.' },
        { title: 'Tisk a export', text: 'Protokol A4 včetně všech grafů signálových dat. CSV / XLSX stáhne měření. Na PC u stroje se soubor neukládá do prohlížeče, ale na zasunutou flashku (složka Trafag_ScadaViewer) — jen administrátor (i přihlášení přes PLC); bez zasunuté flashky aplikace při pokusu o uložení upozorní a ukazatel USB zabliká. Flashku pak bezpečně odeberete tlačítkem u ukazatele USB v hlavičce Databáze (vedle lokálního úložiště a NAS).' },
      ],
    },
    settings: {
      title: 'Nastavení',
      intro: 'Předvolby zobrazení, stav připojení k PLC a úložištím, čas PC (NTP server pro IPC) a správa uživatelů.',
      items: [
        { title: 'Předvolby', text: 'Jazyk, světlý / tmavý režim, počet souborů na stránce, interval automatického obnovení a klávesnice na obrazovce (kiosk bez systémové klávesnice — Automaticky = jen u stroje). Ukládají se v tomto prohlížeči.' },
        { title: 'Připojení', text: 'Stav PLC (ADS), Net ID a port, lokální úložiště (zaplnění, limit) a NAS. Administrátor u stroje zde mění cesty k datům a limit lokálního úložiště.' },
        { title: 'Čas / NTP', text: 'PC u stroje slouží jako NTP server pro další IPC. Nahoře je hned vidět, zda si IPC mohou brát čas z tohoto PC (a když ne, proč), čas PC, odkud ho PC bere a adresa, kterou nastavit na IPC. Administrátor u stroje může čas PC ručně nastavit — převezmou ho IPC i časové značky nových záznamů. Údaje pro servis jsou ve sbalených Technických podrobnostech.' },
        { title: 'Uživatelé', text: 'Jen pro administrátora u stroje (z kanceláře se záložka nezobrazí): přidání a odebrání uživatele, změna hesla. Uživatel může mít nejvýše stejnou roli jako ten, kdo ho zakládá. Účet s výchozím heslem „admin" se z kanceláře nepřihlásí a aplikace dole vyzve ke změně hesla. Přihlášení heslem na PC u stroje skončí po 15 minutách nečinnosti. Přihlášení přes PLC (jen nejvyšší autorita na PLC) má práva administrátora, dokud trvá přihlášení na PLC.' },
      ],
    },
    info: {
      title: 'Info',
      intro: 'Informace o aplikaci: verze, projekt, zákazník a dodavatel, popis aplikace a dokumentace.',
      items: [
        { title: 'Projekt', text: 'Verze aplikace (hlásí server), číslo projektu a kontakty.' },
        { title: 'Dokumentace', text: 'Stručný popis aplikace a odkaz na Návod k použití a Technický manuál v dokumentaci testeru.' },
      ],
    },
  },
}
