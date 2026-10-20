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
        { title: 'Úložiště a NAS', text: 'Ukazatele v hlavičce: zaplnění lokálního úložiště vůči limitu a zaplnění NAS. Od 80 % varování, od 95 % kritický stav. Tlačítkem lze smazat lokální kopie souborů, které už jsou bezpečně na NAS.' },
        { title: 'Hledat zakázku', text: 'Napište část čísla nebo názvu zakázky (velikost písmen ani diakritika nevadí). Během hledání se prohledává celý archiv bez ohledu na datum. Křížek nebo Esc hledání zruší.' },
        { title: 'Od – do', text: 'Datumový filtr podle vzniku zakázky, výchozí jsou poslední 2 dny. Když filtr nic nenajde, nabídne přechod na den s nejnovějšími daty.' },
        { title: 'Tabulka', text: 'Klik na záhlaví sloupce řadí. Klik na řádek zakázky (nebo šipka) rozbalí přehled kusů a rozložení kategorií; ikona grafu otevře detail zakázky rovnou, bez rozbalení. CSV / XLSX stáhne celou zakázku. „…" u počtu kusů = počet se právě dopočítává. Rozpracovaná zakázka je zvýrazněná nahoře.' },
        { title: 'Sync', text: 'In progress = zakázka se právě vyrábí. Local = uloženo jen na tomto PC, čeká na odeslání na NAS. Synced = už je i na NAS.' },
        { title: 'Mazání', text: 'Jednotlivě nebo hromadně (zaškrtnutím). Soubor, který ještě není na NAS (Local), smí smazat jen administrátor — data by se nenávratně ztratila. Rozpracovanou zakázku (In progress) smí smazat jen administrátor, jednotlivě a po potvrzení rizika; vyrábí-li ji stroj dál, další kus PLC odmítne. Z NAS se nemaže nikdy. Z kanceláře je stránka jen pro prohlížení.' },
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
        { title: 'Tabulka kusů', text: 'Jeden řádek = jeden testovaný kus s naměřenými parametry. Klik na řádek otevře detail kusu s diagramy.' },
        { title: 'Tisk a export', text: 'Tisk vytvoří protokol A4 z aktuálně zobrazených kusů. Tlačítka CSV a XLSX stáhnou celou zakázku (originální CSV, nebo tabulku pro Excel s čísly a časy).' },
      ],
    },
    record: {
      title: 'Detail kusu',
      intro: 'Všechny naměřené hodnoty jednoho kusu z výroby a jejich grafické znázornění. Slouží k posouzení, proč kus skončil v dané kategorii.',
      items: [
        { title: 'Diagram síla – dráha', text: 'Schéma hysterezní smyčky mikrospínače s hodnotami tohoto kusu: polohy (FP, OP, RP, TTP), síly (OF, RF, TTF), dráhy (PT, OvT, RvT, MD, TT) a odpory kontaktů v bodech přepnutí. Ikonou lze zvětšit.' },
        { title: 'Časový diagram', text: 'Průběh napětí kontaktů NC a NO při přepnutí (jako na osciloskopu) s časy UT, RevT, BT a OpT v měřítku.' },
        { title: 'NOK kategorie', text: 'Ve kterých oblastech (síla, poloha, elektrika, časy, proces) kus nevyhověl.' },
        { title: 'Tabulka parametrů', text: 'Zkratka, název, hodnota a jednotka. „?" zobrazí popis a výpočet parametru, ikona grafu ukáže parametr zvýrazněný v diagramu. „—" = hodnota nestanovena, ∞ = rozepnutý kontakt.' },
        { title: 'Zpět a tisk', text: 'Zpět vrátí do detailu zakázky na stejné místo. Tisk vytvoří protokol kusu A4.' },
      ],
    },
    testing: {
      title: 'Detail měření (Testing)',
      intro: 'Jedno testovací měření mikrospínače: nastavení testu, vyhodnocené parametry, výsledek a surová signálová data z měření.',
      items: [
        { title: 'Hlavička', text: 'Typ, ID mikrospínače a receptura, čas a doba měření a výsledek OK / NOK (podle NOK kategorií).' },
        { title: 'Nastavení testu', text: 'Parametry pohonu, elektriky a měření, se kterými test proběhl.' },
        { title: 'Měření a Výsledky', text: 'Údaje o průběhu měření a vyhodnocené parametry (síly, polohy, dráhy, odpory, časy) — stejná tabulka jako u výroby, včetně „?" a grafu parametru.' },
        { title: 'NOK hodnocení', text: 'Výsledek a oblasti, ve kterých měření nevyhovělo.' },
        { title: 'Signálová data', text: 'Pět grafů ze surových dat (přehled, výsledky, hystereze, detail přepnutí, časy). Zoom kolečkem nebo dvěma prsty, posun tažením, dvojklik = původní zobrazení, ikona = celá obrazovka.' },
        { title: 'Tisk', text: 'Protokol A4 včetně všech grafů signálových dat.' },
      ],
    },
    settings: {
      title: 'Nastavení',
      intro: 'Předvolby zobrazení, stav připojení k PLC a úložištím, čas PC (NTP server pro IPC) a správa uživatelů.',
      items: [
        { title: 'Předvolby', text: 'Jazyk, světlý / tmavý režim, počet souborů na stránce a interval automatického obnovení. Ukládají se v tomto prohlížeči.' },
        { title: 'Připojení', text: 'Stav serveru, PLC (ADS) a lokálního úložiště a NAS. Administrátor u stroje zde mění cesty k datům a limit lokálního úložiště.' },
        { title: 'Čas / NTP', text: 'Čas PC u stroje, které slouží jako NTP server pro další IPC: běží služba Windows Time, je zapnutý NTP server a ohlašuje se jako spolehlivý zdroj, odkud bere čas PC samo a o kolik se liší od zařízení, ze kterého se díváte. Administrátor u stroje může čas PC ručně nastavit — převezmou ho IPC i časové značky nových záznamů.' },
        { title: 'Uživatelé', text: 'Jen pro administrátora: přidání a odebrání uživatele, změna hesla. Uživatel může mít nejvýše stejnou roli jako ten, kdo ho zakládá.' },
      ],
    },
    info: {
      title: 'Info',
      intro: 'Informace o aplikaci: verze, projekt, zákazník a dodavatel, popis aplikace a dokumentace.',
      items: [
        { title: 'Projekt', text: 'Verze aplikace (hlásí server), číslo projektu a kontakty.' },
        { title: 'Dokumentace', text: 'Stručný popis aplikace a odkaz na uživatelský manuál.' },
      ],
    },
  },
}
