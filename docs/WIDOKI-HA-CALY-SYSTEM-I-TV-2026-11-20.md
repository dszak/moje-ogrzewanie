# Widoki Home Assistant: „Cały system” i „TV — Przegląd ogrzewania”

> **Stan: 20 listopada 2026 r.** Dokumentacja ukończonej konfiguracji Home Assistant, oparta na raporcie z wdrożenia i sprawdzenia na urządzeniach. To **opis istniejących widoków i ich weryfikacji**, nie eksport konfiguracji Lovelace/YAML ani kopia ustawień HA.
>
> **Zasada projektu:** dobrze gospodarować powierzonym dobrem — [cele i metodologia](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md). Interfejs pomaga **widzieć i oceniać**, nie zastępuje odrębnej decyzji o zmianie ogrzewania.

## 1. Dwa widoki w istniejącym Home Assistant

W dashboardzie **„Ogrzewanie — Całość”** przygotowano dwa uzupełniające się widoki:

| Widok | Przeznaczenie | Zakres |
| --- | --- | --- |
| **TV — Przegląd ogrzewania** | Szybki, czytelny z kanapy przegląd bieżących warunków | ENGO i ON/OFF, statystyki, temperatura i wilgotność, sześć pomieszczeń |
| **Cały system** | Analiza ogrzewania pomieszczenie po pomieszczeniu | Sześć czujników pokojowych, osiem głowic G1–G8, pomiary/nastawy/różnice ΔT, pogoda, bilans i statystyki |

Widok **TV** jest **pierwszą zakładką** dashboardu „Ogrzewanie — Całość”. Dotychczasowy widok **„Cały system”** zachowano.

To **bezpośredni interfejs Home Assistant**, niezależny od autorskiej aplikacji „Moje Ogrzewanie” na GitHub Pages. Sposób bezpiecznego dostępu z telewizora opisano w [wdrożeniu HA na Sony Bravia przez Tailscale](HOME-ASSISTANT-SONY-BRAVIA-TAILSCALE-2026-11-20.md). Ze względów prywatności nie publikujemy tutaj prywatnego URL, adresów IP, sesji ani tokenów.

## 2. „Cały system” — ukończony panel analityczny

Zachowano działające części: **Sypialnia**, **pogoda i regulator ENGO**, **bilans temperatur mieszkania** oraz **praca ogrzewania**. Dokończono **Salon** z odrębnym czujnikiem pokojowym i głowicami **G6 oraz G5**. Dodano **Kuchnię**, **Dużą łazienkę**, **Małą łazienkę** i **Przedpokój**.

W każdym pomieszczeniu temperatura z **niezależnego czujnika Setti+** jest odróżniona od temperatur mierzonych blisko grzejników przez głowice. Karty grzejników zawierają:

- **Pom** — temperaturę mierzoną przez daną głowicę;
- **Cel** — nastawę głowicy;
- **ΔT** — różnicę: *Cel − Pom*.

| Pomieszczenie | Czujnik temperatury pokojowej | Głowice |
| --- | --- | --- |
| Sypialnia | `sensor.setti_sypialnia_temperatura` | G8 i G7 |
| Salon | `sensor.setti_salon_temperatura` | G6 i G5 |
| Kuchnia | `sensor.setti_kuchnia_temperatura` | G4 i G3 |
| Duża łazienka | `sensor.setti_duza_lazienka_temperatura` | G2 |
| Mała łazienka | `sensor.setti_mala_lazienka_temperatura` | G1 |
| Przedpokój | `sensor.setti_przedpokoj_temperatura` | bez głowicy |

Kolejność kart w pomieszczeniach z dwiema głowicami: **wyższy numer po lewej**. Lista encji dokumentuje odczyty pokojowe, a nie ich historię.

### Obliczenia ΔT i dostępność

Dla **G1–G6** utworzono brakujące czujniki różnicy; **G7–G8** działały już wcześniej. Dla każdej głowicy zastosowano zasadę:

```jinja2
{{ (states('sensor.setti_trv_gX_zadana') | float(0)
    - states('sensor.setti_trv_gX_temperatura') | float(0)) | round(1) }}
```

W szablonie **Gx** oznacza odpowiedni numer głowicy (np. `g5` w identyfikatorze encji); powyższy kod jest **wzorcem**, a nie gotowym szablonem do wklejenia bez podstawienia numeru.

Warunek dostępności wymaga dwóch poprawnych liczb:

```jinja2
{{ is_number(states('sensor.setti_trv_gX_zadana'))
   and is_number(states('sensor.setti_trv_gX_temperatura')) }}
```

Dzięki temu brak wartości liczbowej nie powinien być przedstawiany jako wiarygodna różnica temperatur. Sam warunek nie jest jednak kontrolą świeżości ostatniego poprawnego pomiaru.

**Kolory wskaźnika ΔT** (wynik zaokrąglony do 0,1°C):

| ΔT | Kolor ikony | Znaczenie |
| --- | --- | --- |
| **> +0,2°C** | Pomarańczowy | Głowica mierzy temperaturę poniżej nastawy |
| **od −0,2°C do +0,2°C** | Zielony | Pomiar blisko nastawy |
| **< −0,2°C** | Niebieski | Głowica mierzy temperaturę powyżej nastawy |

Te kolory **nie potwierdzają** temperatury powierzchni grzejnika, pozycji zaworu ani tego, czy kocioł właśnie dostarcza ciepło. W szczególności dodatnie ΔT może wystąpić przy wyłączonym żądaniu ENGO.

## 3. „TV — Przegląd ogrzewania” — pierwszy widok dashboardu

Widok zaprojektowano do obserwowania na **Sony Bravia 55″** z przeglądarki **TV Bro**, a nie tylko z komputera.

### Regulator ENGO i jego statystyki

Wspólna karta ENGO zawiera **temperaturę zadaną**, **wskaźnik ON/OFF** oraz **temperaturę mierzoną**. Wskaźnik odwołuje się do **żądania ciepła przez regulator**, nie do bezpośredniego pomiaru płomienia czy czasu pracy palnika kotła.

Źródło żądania: `binary_sensor.engo_e901wifi_monitoring_zadanie_ogrzewania`.

Sekcja **„Praca ogrzewania dziś”** pokazuje: **czas ON**, **udział ON** i **czas obserwacji**. Procent ON należy rozumieć jako udział w okresie obserwacji, a nie automatycznie procent całej doby lub zużycia gazu.

### Pogoda, bilans i wilgotność

Widok pokazuje:

- temperaturę i wilgotność na zewnątrz;
- średnią temperaturę i wilgotność mieszkania;
- różnicę temperatur **wewnątrz − zewnątrz** w °C;
- różnicę wilgotności **wewnątrz − zewnątrz** w **punktach procentowych** (p.p.).

Wskaźniki zewnętrzne pochodzą z danych pogodowych dostępnych w HA, a nie z termometru zamontowanego za oknem mieszkania. Nie należy traktować ich jako lokalnego pomiaru na elewacji.

### Sześć kart pokojowych

Karty ułożono w **dwóch kolumnach**. Każda pokazuje niezależną **temperaturę pokojową**, **wilgotność** oraz — jeśli w pomieszczeniu są głowice — ich **kolorowe wskaźniki ΔT**. Dla dwóch grzejników wyższy numer jest po lewej.

Dzięki temu widok TV służy do szybkiej orientacji, natomiast dokładne **Pom / Cel / ΔT** pozostają w widoku „Cały system”.

## 4. Kiosk Mode, konto telewizora i nawigacja

Zainstalowano **Kiosk Mode** w Home Assistant. Ukrywanie górnego paska skonfigurowano dla **dedykowanego konta telewizora** w widoku TV. Po wejściu na główny adres Home Assistant z tego konta otwiera się **TV — Przegląd ogrzewania**.

Nie oznacza to, że konto telewizora otrzymało technicznie gwarantowany dostęp „tylko do odczytu” do wszystkich encji. W dokumentacji dostępu opisano je jako **konto bez uprawnień administratora**; uprawnienia i interakcje z kartami wymagają odrębnej kontroli.

## 5. Weryfikacja i granice potwierdzenia

**Z raportu zakończonego wdrożenia (20.11.2026):**

- Sprawdzono odczyty **sześciu pomieszczeń** i wartości **ΔT wszystkich ośmiu głowic**.
- Sprawdzono **oba stany** żądania ciepła ENGO (ON oraz OFF).
- Po korekcie odstępów panel z ukrytym paskiem mieścił się w **podglądzie Chrome 640 × 360 px**, z około **14 px zapasu** pod ostatnim rzędem.
- Użytkownik potwierdził działanie widoku na **Sony Bravia w TV Bro**.
- Zmiany zostały zapisane w działającej konfiguracji Home Assistant.
- **Nie zmieniano** nastaw głowic, regulatora ENGO, kotła ani automatyzacji ogrzewania.

**Granica testu:** podgląd 640 × 360 px wykonano **w Chrome** — nie jest to pomiar geometrii ekranu ani skali pikseli bezpośrednio w TV Bro. Potwierdzenie pracy na Sony Bravia jest odrębnym testem użytkownika. Nie przeprowadzono w ramach tej aktualizacji repozytorium niezależnej inspekcji eksportu konfiguracji HA ani pełnego testu odporności po awarii zasilania/łączności.

## 6. Co zostało zapisane i gdzie

- **Home Assistant:** faktycznie działające widoki, karty, szablony pomocników, konfiguracja Kiosk Mode i ustawienia konta.
- **To publiczne repozytorium GitHub:** opis struktury, logiki i wyników wdrożenia — **bez** pełnego eksportu dashboardu, danych historycznych, prywatnego adresu HA i sekretów.
- **Autorska PWA „Moje Ogrzewanie”:** osobny system prezentacji i analiz; samo udokumentowanie nowych widoków HA **nie zmienia kodu aplikacji**, publikacji GitHub Pages ani synchronizacji gazomierza.

Przed przyszłymi modyfikacjami pamiętać o [architekturze systemu](JAK-DZIALA-SYSTEM-OGRZEWANIA.md), [zasadach projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md) i [wdrożeniu dostępu TV przez Tailscale](HOME-ASSISTANT-SONY-BRAVIA-TAILSCALE-2026-11-20.md).
