# Architektura systemu „Moje Ogrzewanie” — jak to działa

> **Stan bazowy na 18 listopada 2026 r., aktualizacja operacyjna 19 listopada w sekcji 12.** Dokument przedstawia działające elementy oraz ograniczenia i zadania do sprawdzenia. Nie zawiera adresu mieszkania, prywatnego adresu HA, kluczy, tokenów ani danych pomiarowych. Jest opisem operacyjnym, nie instrukcją zmiany zabezpieczeń kotła.
>
> **Zasady nadrzędne:** [najważniejsze zasady projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md) · [baza wiedzy technicznej](BAZA-WIEDZY-TECHNICZNEJ.md) · [zasady analitycznego archiwum](ARCHIWUM-ANALITYCZNE-PROJEKT.md).
>
> Cel: **dobrze gospodarować powierzonym dobrem**, w cyklu **WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ**. Technologia służy bezpieczeństwu, komfortowi, prawdziwym pomiarom i rozsądnym kosztom.

## 1. Najważniejsze rozróżnienie: sterowanie a obserwacja

**Samo ogrzewanie nie jest sterowane przez MacBooka, Home Assistant, GitHub ani autorską aplikację „Moje Ogrzewanie”.** Sterownik pokojowy ENGO E901WiFi i jego odbiornik przekazują kotłowi BRÖTJE żądanie grzania przez styk przekaźnikowy; lokalne działanie tej pary jest odrębne od pobierania danych do analiz.

- **Sterowanie:** regulator ENGO, odbiornik przy kotle, kocioł BRÖTJE QWHC 20/24; ponadto niezależne głowice termostatyczne Setti+ regulujące dopływ ciepła do grzejników.
- **Zdalna obsługa:** aplikacja ENGO Smart / Tuya Smart korzysta z usług producenta, aby umożliwiać odczyt i zmianę nastaw z telefonu.
- **Monitorowanie i analiza:** Tuya/Setti+, Home Assistant, MacBook, GitHub i aplikacja „Moje Ogrzewanie” przetwarzają obserwacje. Ich przerwa w działaniu **nie powinna sama w sobie wyłączać lokalnego sterowania ogrzewaniem**, ale może pozbawić system zdalnego sterowania lub rejestrowania historii.

Sygnał ENGO **ON/OFF oznacza zapotrzebowanie na ciepło**, a nie potwierdzone włączenie/wyłączenie palnika, modulację ani dokładny czas zużywania gazu.

## 2. Mapa przepływu danych

```text
  MIESZKANIE — URZĄDZENIA FIZYCZNE
  ENGO E901WiFi (regulator) ---> odbiornik NO/COM ---> kocioł BRÖTJE
  8 głowic Setti+ TRV001 <----> bramka ZigBee / system Setti+
  6 osobnych czujników temperatury i wilgotności

                | dane/zdarzenia urządzeń
                v
  USŁUGI I INTEGRACJE
  ENGO Smart / Tuya Smart (obsługa urządzeń na iPhonie)
  Tuya Developer Platform (API, usługi IoT Core / zdarzenia)
  Setti+ / integracje lokalne i chmurowe, m.in. MQTT
                |
                v
  MACBOOK AIR — PRACUJĄCA MASZYNA WIRTUALNA
  Home Assistant: zbiera historię zmian temperatur oraz żądania ENGO
                |
                +---- zadanie „ha-history” (szyfrowanie na Macu)
                |             |
                |             v
                |       GitHub: repozytorium moje-ogrzewanie
                |       gałąź setti-data, ha-historia.enc.json
                |             |
                |             v
                |       iPhone: aplikacja „Moje Ogrzewanie”
                |       odszyfrowuje historię na urządzeniu
                |
                +---- zadanie „private-analytics” (odszyfrowanie
                              na Macu + pliki analityczne z iCloud)
                              |
                              v
                       GitHub: prywatne repozytorium
                       moje-ogrzewanie-archiwum
                              |
                              v
                       ChatGPT: odczyt na żądanie
```

**Uwaga:** pliki `pomiary.json` (sześć czujników) i `glowice.json` (osiem głowic) są także udostępniane w gałęzi `setti-data`. Autorska aplikacja pobiera je bezpośrednio do panelu bieżącego stanu. Dokładną drogę każdego źródła do HA trzeba ustalać na podstawie jego faktycznej konfiguracji — nie zakładać, że wszystkie urządzenia używają tego samego protokołu lub Tuya Developer API.

## 3. Elementy i ich role

| Element | Rola | Wpływ na ogrzewanie |
| --- | --- | --- |
| **BRÖTJE QWHC 20/24** | Kocioł kondensacyjny, c.o. i c.w.u. | Fizycznie dostarcza ciepło |
| **ENGO E901WiFi + odbiornik** | Mierzy temperaturę w pomieszczeniu sterującym i zgłasza żądanie c.o. | Lokalny tor sterowania kotłem |
| **ENGO Smart / Tuya Smart na iPhonie** | Zdalna obsługa regulatora | Zmiana nastaw przez właściwą usługę producenta |
| **Osiem głowic Setti+ TRV001** | Regulacja grzejników, własne temperatury/nastawy | Lokalny dopływ ciepła do poszczególnych grzejników |
| **Sześć czujników Setti+** | Temperatura/wilgotność w pomieszczeniach | Obserwacja, osobno od pomiaru przy głowicy |
| **Bramka ZigBee** | Łączność urządzeń Setti+ | Zależność komunikacji i funkcji inteligentnych |
| **Tuya Developer Platform** | Projekt programistyczny `Moje Ogrzewanie ENGO`; API/usługi zdarzeń | Krytyczne dla tych integracji, które z niego korzystają, nie dla lokalnego przekaźnika kotła |
| **Home Assistant w VM na MacBooku** | Kolektor i historia stanów/temperatur | Bezpośrednio nie steruje kotłem w tym projekcie |
| **GitHub, gałąź `setti-data`** | Publiczne migawki czujników/głowic, **zaszyfrowana** historia HA | Dystrybucja odczytów |
| **Autorska aplikacja iPhone (PWA)** | Panel, wykresy, gaz, pogoda, decyzje i eksperymenty | Tylko odczyt i dziennik, **nie steruje kotłem** |
| **Prywatne repozytorium GitHub** | Analizy, historia, karta instalacji, rozliczenia i decyzje | Archiwum danych dla uprawnionego odczytu |
| **ChatGPT z połączeniem GitHub** | Analiza archiwum na polecenie użytkownika | Nie jest samodzielnym sterownikiem ani monitoringiem alarmowym |

## 4. Dwa różne znaczenia nazwy „Tuya”

**Aplikacja Tuya Smart / ENGO Smart** to interfejs użytkownika do urządzeń. Przez nią można sprawdzać stany i wykonywać obsługiwane przez sprzęt zmiany nastaw. To inna funkcja niż nasze archiwum.

**Tuya Developer Platform** to panel programisty obsługujący dostęp integracyjny (API/IoT Core, wiadomości o zdarzeniach). „Wiadomości” oznaczają komunikaty techniczne, nie SMS-y.

W projekcie `Moje Ogrzewanie ENGO` złożono **17 listopada 2026 r.** wniosek o **sześciomiesięczne przedłużenie**. Wg ówczesnych ustaleń dostępna usługa ma termin **16 grudnia 2026 r.** Do czasu decyzji nie zakładać przedłużenia. Utrata uprawnień do usługi mogłaby przerwać zależną od niej część monitoringu/API. **Nie jest równoznaczna z wyłączeniem fizycznego ogrzewania.** Konkretne zależności i skutki sprawdzić w konfiguracji integracji.

## 5. MacBook, Home Assistant i synchronizacja co 30 minut

Home Assistant działa w maszynie wirtualnej na MacBooku. Zapisuje zdarzenia stanu ENGO oraz zmian temperatury z sześciu czujników; przechowywanie historii i jej kompletność zależą od działania VM, usług i połączeń.

Na MacBooku działają dwa oddzielne zadania użytkownika macOS (`launchd`):

1. `pl.moje-ogrzewanie.ha-history` — odczytuje historię HA, scala z poprzednim eksportem, **szyfruje AES-256-GCM przed publikacją** pliku `ha-historia.enc.json` do gałęzi `setti-data`. Hasło nie trafia do repozytorium.
2. `pl.moje-ogrzewanie.private-analytics` — czyta zaszyfrowany eksport, **odszyfrowuje go lokalnie** i łączy z wybranymi JSON/JSONL z archiwum iCloud, następnie synchronizuje je do prywatnego repozytorium. Nie przesyła źródłowych PDF ani tokenów.

Zadania mają interwał **1800 s (około 30 min)**. Drugi proces został uruchomiony i pozytywnie zweryfikowany 18 listopada 2026 r.: 13 plików, następny przebieg bez zmian i bez błędów.

**Ważne ograniczenia:**
- MacBook musi być włączony, VM/HA uruchomione, a usługi dostępne, aby bieżąca historia była zbierana. **Nie wystarczy tylko włączony ekran ani sama sesja macOS**.
- Uśpienie, zamknięcie maszyny wirtualnej, brak internetu lub wygaśnięcie uprawnień mogą opóźnić synchronizację albo utworzyć nieodtwarzalne luki.
- Zaplanowane zadania użytkownika mogą nie działać, gdy użytkownik jest wylogowany; zachowanie po restarcie oraz automatyczne uruchamianie VM **wymagają osobnego testu**.
- Exporter HA posiada obecnie limit **25 000 zmian temperatur** i **40 000 zdarzeń ENGO**; osiągnięcie limitu ma kończyć eksport błędem zamiast cicho usuwać dane. Potrzebny będzie plan rozszerzenia archiwizacji przed osiągnięciem limitu.
- Samo zadanie private-analytics **nie pobiera aktualnej historii bezpośrednio z HA**: korzysta z ostatniego opublikowanego zaszyfrowanego eksportu. Jeżeli wcześniejszy eksport przestanie działać, drugie zadanie może nadal poprawnie wykonywać synchronizację **starych danych**. Należy kontrolować znaczniki świeżości.

## 6. GitHub i aplikacja na iPhonie

**Publiczne repozytorium `dszak/moje-ogrzewanie`:**
- `main`: kod i dokumentacja aplikacji, publikacja przez GitHub Pages;
- `setti-data`: `pomiary.json`, `glowice.json`, `ha-historia.enc.json`;
- odczyty Setti+ / głowic z tej gałęzi są **publicznymi migawkami technicznymi**, a historia HA jest zaszyfrowana — nie należy mylić obu form ochrony.

**Aplikacja „Moje Ogrzewanie” na iPhonie (PWA, wersja 1.9.0):**
- pobiera migawki temperatury/wilgotności i głowic przy otwarciu, co ok. 5 minut oraz na żądanie; po 20 minutach oznacza je jako nieaktualne;
- pobiera zaszyfrowane archiwum HA, odszyfrowuje je na iPhonie i przedstawia historię ENGO/temperatur;
- pokazuje pogodę z Open-Meteo i umożliwia ręczne prowadzenie historii gazu, odczytów kotła, decyzji i eksperymentów;
- **nie steruje kotłem ani głowicami**; nie wysyła wszystkich prywatnych wpisów iPhone'a automatycznie do archiwum na GitHubie;
- miejscowa pamięć aplikacji wymaga własnych kopii bezpieczeństwa JSON, szczególnie przed czyszczeniem danych przeglądarki lub reinstalacją.

**Prywatne repozytorium `dszak/moje-ogrzewanie-archiwum`:**
- zawiera uporządkowane pliki JSON/JSONL: kartę instalacji, historię i eksperymenty, rozliczenia ORLEN, partycje historii HA, indeks `meta/index.json`;
- **dane w tym repozytorium są jawne dla uprawnionych odbiorców, nie są szyfrowane end-to-end**; repozytorium musi pozostać prywatne, a dostęp powinien być ograniczany i okresowo kontrolowany;
- ChatGPT może czytać zawartość przez podłączoną usługę GitHub **na żądanie**. Nie ma ciągłego wglądu w system ani automatycznego odczytu w tle.

**iCloud Drive** stanowi odrębne miejsce przechowywania oryginałów PDF i prywatnych materiałów źródłowych. Aktualizacja pliku JSON w iCloud może trafić do GitHub podczas kolejnej synchronizacji; dodanie nowej faktury PDF **nie oznacza automatycznego odczytu jej treści**.

## 7. Co przestaje działać w przypadku awarii?

| Zdarzenie | Ogrzewanie | Monitoring / historia |
| --- | --- | --- |
| MacBook wyłączony albo HA zatrzymany | Lokalny regulator i kocioł powinny działać niezależnie | Brak bieżącego zapisu HA, możliwe luki |
| MacBook uśpiony | Ogrzewanie nadal sterowane lokalnie | Eksport i synchronizacja czekają na wznowienie |
| Brak internetu | Lokalny tor ENGO–odbiornik–kocioł pozostaje odrębny | Zdalne API, aplikacje i GitHub mogą nie odświeżać danych |
| Wygaśnięcie Tuya IoT Core | Nie powinno wyłączać lokalnego sterowania | Ryzyko przerwania funkcji integracyjnych zależnych od Tuya |
| Błąd prywatnej synchronizacji | Bez wpływu na kocioł | ChatGPT widzi starą wersję archiwum |
| GitHub niedostępny | Bez wpływu na lokalny regulator | iPhone może nie pobrać świeżych danych; przechowane wcześniej lokalnie dane pozostają |

## 8. Zasady analizy i bezpieczeństwo

1. Oddzielić **odczyty przy głowicy**, **odczyty czujnika pokojowego**, **temperaturę zadaną**, **żądanie ENGO** oraz **rzeczywistą pracę palnika**.
2. Doby obliczać dla `Europe/Warsaw`; partycje historii HA w repozytorium są według dat UTC.
3. Zużycie gazu na liczniku obejmuje **c.o. i c.w.u.**; odróżniać rachunki, przedpłaty, saldo i rzeczywiste zużycie.
4. Porównywać eksperymenty z uwzględnieniem pogody, komfortu, przerw w danych i zmiany licznika.
5. Hasła, PAT GitHub, token HA i hasło szyfrowania pozostają w bezpiecznym magazynie Maca — **nigdy w dokumentacji, repozytorium ani rozmowie**.
6. Nie przypisywać ChatGPT automatycznego sterowania, alertowania ani ciągłego monitoringu. Wnioski wymagają przeczytania aktualnych źródeł i określenia niepewności.

## 9. Decyzja zakresowa — energia elektryczna a ogrzewanie (18.11.2026)

**Decyzja:** nie uruchamiać obecnie odrębnego systemu monitorowania całkowitego zużycia energii elektrycznej ani integracji TAURON AMIplus. Priorytetem pozostają **komfort cieplny, gaz, praca kotła, ENGO, głowice, temperatury i rzetelne porównania kosztów**. Rachunki za energię elektryczną są według oceny użytkownika na akceptowalnym poziomie, dlatego dodatkowe inwestycje i obsługa pomiarów prądu nie mają obecnie uzasadnionego priorytetu. Niezależnie od tego eLicznik TAURON nie jest aktualnie dostępny dla tego punktu poboru, a brak wyznaczonej daty wymiany licznika oznacza jedynie termin graniczny do końca 2030 r., nie datę konkretnej instalacji.

**Zależność, którą należy uwzględniać w analizie:** w sezonie grzewczym kocioł zużywa nie tylko gaz, lecz także **energię elektryczną** do zasilania elementów takich jak pompa obiegowa i elektronika sterująca (a zależnie od fazy pracy również inne elementy urządzenia). Użytkownik obserwuje wyższe rachunki za prąd w okresie ogrzewania niż poza sezonem. Jest to obserwacja, **nie potwierdzony pomiarem udział kotła** w całej różnicy rachunków.

**Wniosek warunkowy:** zmniejszenie rzeczywistego zapotrzebowania na ciepło i czasu działania pompy/urządzeń kotła **może dodatkowo ograniczyć zużycie prądu**. Nie wolno jednak zakładać, że każdy spadek zużycia gazu oznacza proporcjonalny lub nawet pewny spadek zużycia energii elektrycznej. Przykładowo niższa temperatura zasilania może zmniejszyć spalanie gazu, a jednocześnie wydłużyć czas pracy pompy. Rzeczywisty efekt elektryczny wymaga osobnego pomiaru; bez niego traktujemy go jako możliwą **korzyść uboczną**, nie wyliczoną oszczędność.

**Praktyczne następstwo:** optymalizujemy przede wszystkim ogrzewanie gazowe przy zachowaniu komfortu i bezpieczeństwa. Nie kupujemy dodatkowych liczników prądu tylko w celu potwierdzenia tej hipotezy. Decyzję można przejrzeć ponownie, jeśli rachunki znacząco wzrosną, zmieni się sposób ogrzewania lub monitoring stanie się dostępny bez istotnych kosztów.

## 10. Stan wdrożenia i kolejne prace

**Potwierdzone 18.11.2026:** dostęp MacBooka do prywatnego repozytorium, jednorazowa synchronizacja 13 plików, powtarzalne wykonanie `launchd` bez błędów, odczyt indeksu i przykładowych plików przez ChatGPT z połączeniem GitHub.

**Do sprawdzenia / poprawienia:**
- zachowanie Home Assistant i obu agentów po restarcie MacBooka, automatyczne uruchomienie VM i ochrona przed uśpieniem;
- kontrola świeżości danych `source_latest_observed_at` i powiadamianie o przerwach, nie tylko o błędach polecenia;
- rzeczywista zależność ścieżek ENGO i Setti+ od IoT Core / API / MQTT przed terminem 16.12.2026;
- bezpieczna, świadomie zatwierdzana aktualizacja prywatnej historii wpisów z aplikacji iPhone oraz nowych dokumentów ORLEN;
- obsługa dłuższej historii i limitów eksportu HA.

## 11. Gdzie szukać danych i dokumentów?

- [Główna strona projektu i kod aplikacji](../README.md)
- [Zasady nadrzędne](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md)
- [Baza wiedzy technicznej](BAZA-WIEDZY-TECHNICZNEJ.md)
- [Założenia archiwum analitycznego](ARCHIWUM-ANALITYCZNE-PROJEKT.md)
- [Repozytorium prywatnego archiwum](https://github.com/dszak/moje-ogrzewanie-archiwum) — wymaga odpowiednich uprawnień
- [Panel Tuya Developer](https://iot.tuya.com/) — konto programistyczne, dostęp do usług i status przedłużenia

**Zasada aktualizacji:** zmiana architektury (urządzenie, usługa, harmonogram, skrypt, repozytorium, bezpieczeństwo) wymaga aktualizacji tego dokumentu i daty stanu. Samo dodanie nowej dokumentacji nie zmienia działania urządzeń ani automatyzacji.

## 12. Zmiany potwierdzone 19.11.2026 — odczyt ENGO i badania głowic

**Działający odczyt ENGO (MacBook):** do cyklicznego, szyfrowanego eksportu HA dodano okresowe odczyty encji `climate.wireless_internet_thermostat_wi_fi` — `current_temperature` i `temperature`. Po testach i wykonaniu kopii zapasowych potwierdzono faktyczne próbki w `engo_readings` zaszyfrowanego pliku na `setti-data`. Prywatny synchronizator udostępnia je uprawnionym odbiorcom jako `ha/engo-pomiary/YYYY-MM-DD.json`, z polami `at`, `temp`, `target`, `source_updated_at`. Indeks prywatnego repozytorium zawiera licznik `engo_temperature_readings`. **To próbki okresowe, nie nieprzerwany strumień i nie dane o palniku.**

**Stan wydań:** lokalne skrypty produkcyjne na MacBooku zostały zaktualizowane i sprawdzone. Odpowiadające im zmiany w publicznym kodzie aplikacji są nadal propozycją na gałęzi `feat/engo-actual-temperature` (PR #23), **nie są scalone z `main` ani automatycznie wdrożone na iPhonie**. Dokumentacja kodu w PR może nie odzwierciedlać już stanu lokalnych skryptów, dopóki nie zostanie zaktualizowana.

**Działający mostek SETTI+:** istniejąca sesja Tuya z jedynym wywołaniem `devices()` w `one_cycle()` zapisuje lokalnie, prywatnie (nie do publicznej gałęzi):
- `trv-passive-observations.jsonl` — m.in. DPS 3, 102, 103, 104;
- `trv-status-obserwacje.jsonl` — m.in. DPS 3, 101, 104, 108 i zdekodowaną tablicę `dps119_24_values`.

Działający mostek **już dekoduje i zbiera DPS 119**; niezależny moduł `scripts/trv_dps_history.py` z PR #22 pozostaje prototypem, którego nie należy wdrażać jako duplikatu drugiego mechanizmu. Dane te **nie trafiają jeszcze automatycznie do prywatnego repozytorium GitHub** — do zdalnej analizy potrzeba osobnego, świadomie zaprojektowanego eksportu lub przekazania wyników.

**Znaczenie DPS 119:** 24 wartości odpowiadają godzinowym słupkom „Czas ogrzewania (%)” SETTI+; aktualizacja kolejnego indeksu następuje najpewniej po zakończeniu godziny. To historyczny wskaźnik aplikacji, **nie pewny stan otwarcia zaworu, czas działania kotła ani pomiar przepływu wody**. Niskie/zerowe wartości nie muszą oznaczać zimnego grzejnika. DPS 3, 101, 104, 108 nie dały dotąd wiarygodnego sygnału bieżącego otwarcia. Szczegóły i ograniczenia: [badania DPS TRV001](SETTI-TRV-DPS-BADANIA.md) (w przygotowaniu na PR #22); pełne dane przypadków wyłącznie w archiwum prywatnym.

**Kwestia otwarta:** użytkownik wysłał do SETTI+ pytanie o udostępnienie aktualnego otwarcia zaworu 0–100% przez oryginalną bramkę i identyfikator DPS. Nie podejmować nowych eksperymentów sterujących ani nie zmieniać bramki bez uzasadnienia i zgody.
