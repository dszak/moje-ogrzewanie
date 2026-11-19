# START TUTAJ — nowy czat projektu „Moje Ogrzewanie”

> **Stan dokumentu: 19 listopada 2026 r.** To publiczny **drogowskaz**, a nie kopia prywatnej historii. Dokument nie daje sam z siebie uprawnień do GitHuba i nie oznacza, że ChatGPT stale obserwuje ogrzewanie. Aktualny stan należy sprawdzać w repozytoriach.

## Gotowa instrukcja na rozpoczęcie nowego czatu

> Kontynuujemy projekt „Moje Ogrzewanie”. Najpierw otwórz i przeczytaj https://github.com/dszak/moje-ogrzewanie/blob/main/docs/START-TUTAJ-NOWY-CZAT.md, a następnie wskazane w nim dokumenty i **aktualne** dane. Mamy połączone konto GitHub: spróbuj odczytać także prywatne repozytorium `dszak/moje-ogrzewanie-archiwum` przez połączenie GitHub; nie zakładaj, że dostęp działa, dopóki tego nie sprawdzisz. Odtwórz ostatnie ustalenia, decyzje, eksperymenty, braki i następny krok. Nie każ mi ponownie opisywać instalacji ani podawać danych, które możesz już odczytać. Oddziel fakty pomiarowe, hipotezy i rekomendacje. Nie zmieniaj sprzętu, nastaw ani danych repozytorium bez mojej świadomej decyzji.

## 1. Misja i reguły

**„Dobrze gospodarować powierzonym mi dobrem”.** Ważne są bezpieczeństwo, zdrowie, komfort, ochrona mieszkania, racjonalne zużycie gazu i pieniądze — nie sama minimalizacja m³.

Metoda: **WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ**. Zawsze sprawdzać, co już wiadomo i jakie eksperymenty wykonano. Nie powtarzać zakończonych badań bez nowego uzasadnienia. Jeden kontrolowany eksperyment naraz; przed zmianą zapisać punkt odniesienia, hipotezę, kryteria wyniku i możliwość wycofania.

Dokumenty obowiązkowe, w tej kolejności:
1. [Najważniejsze zasady projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md).
2. [Baza wiedzy technicznej](BAZA-WIEDZY-TECHNICZNEJ.md).
3. [Jak działa system ogrzewania](JAK-DZIALA-SYSTEM-OGRZEWANIA.md).
4. [Archiwum analityczne — zasady](ARCHIWUM-ANALITYCZNE-PROJEKT.md).
5. [README aplikacji](../README.md).

## 2. Gdzie są dane i jakie są granice dostępu?

- **Publiczne repozytorium** `dszak/moje-ogrzewanie`, gałąź `main`: dokumentacja i kod aplikacji. Gałąź `setti-data` zawiera `pomiary.json` (sześć czujników pokojowych), `glowice.json` (osiem głowic) oraz **zaszyfrowaną** historię HA `ha-historia.enc.json`. Migawki Setti+ mają znaczniki czasu; nie uznawać starych danych za bieżące.
- **Prywatne repozytorium** `dszak/moje-ogrzewanie-archiwum`: [README](https://github.com/dszak/moje-ogrzewanie-archiwum/blob/main/README.md), `meta/index.json` (indeks i znacznik świeżości), `karta/karta-instalacji.json`, `badania/`, `decyzje/`, `ha/engo/`, `ha/engo-pomiary/`, `ha/temperatury/`, `orlen/`, `snapshot/`. **Zacząć od README i indeksu, a potem odczytywać wskazane pliki.** Nie publikować prywatnej zawartości.
- GitHub jest dostępny w czacie **tylko wtedy, gdy narzędzie/połączenie GitHub jest w tej rozmowie aktywne i odczyt się powiedzie**. Jeśli odczyt się nie uda, powiedzieć to wprost; nie udawać dostępu ani nie odtwarzać „aktualnych” liczb z pamięci.
- Home Assistant działa w maszynie wirtualnej na MacBooku. Synchronizatory działają nominalnie co około 30 min; powodzenie synchronizacji nie dowodzi świeżości danych, trzeba sprawdzić `source_latest_observed_at`.
- Aplikacja „Moje Ogrzewanie” na iPhonie przechowuje część danych **lokalnie**; nie wszystko trafia automatycznie na GitHub. Surowe diagnostyczne JSONL części badań głowic pozostają na MacBooku.
- ChatGPT nie ma ciągłego dostępu na żywo do iPhona, lokalnego MacBooka ani kotła i **nie steruje** ogrzewaniem w tym projekcie.

## 3. Co wiemy o instalacji?

- Kocioł kondensacyjny dwufunkcyjny **BRÖTJE QWHC 20/24**; ENGO **E901WiFi** w sypialni przez odbiornik żąda c.o.; osiem lokalnych głowic **Setti+ TRV001** i sześć oddzielnych pokojowych czujników temperatury/wilgotności.
- ENGO i Setti+ działają niezależnie. **ENGO ON/OFF = żądanie ogrzewania, nie potwierdzona praca palnika**. Temperatura przy głowicy nie jest temperaturą całego pokoju.
- Rozmieszczenie: **G1** mała łazienka, **G2** duża łazienka, **G3–G4** kuchnia, **G5–G6** salon, **G7–G8** sypialnia; korytarz bez grzejnika. Nad mieszkaniem strych, ocieplenie stropu potwierdzone nad salonem. Szczegóły wymiarów i pozostałe nastawy w **prywatnej karcie instalacji**, nie zgadywać.
- Punkt odniesienia z ostatniej zapisanej decyzji: **ENGO 22°C, zasilanie c.o. 55°C**. To stan archiwalny — nie gwarancja nastaw bieżących.
- W historycznie zapisanym układzie drzwi salon/kuchnia/sypialnia były otwarte na pozostałą przestrzeń, a łazienki zamknięte. Przed oceną wpływu drzwi sprawdzić stan w danym eksperymencie.

## 4. Ustalenia badań, których nie wolno zgubić

**19 listopada 2026 — badania SETTI+ TRV001:** najpierw przeczytać prywatny plik [`badania/SETTI-TRV001-DPS-2026-11-19.md`](https://github.com/dszak/moje-ogrzewanie-archiwum/blob/main/badania/SETTI-TRV001-DPS-2026-11-19.md).

- DPS 102 = temperatura przy głowicy, 103 = temperatura zadana, 27 = korekta wskazania.
- DPS 119: 24-elementowa historyczna tablica „Czas ogrzewania (%)”; **nie** jest zweryfikowaną bieżącą pozycją zaworu ani przepływem. Dla godziny 23:00–00:00 brak wiarygodnych danych.
- W obecnym torze odczytu DPS 104 był stale 0 w 904 odczytach, a DPS 3 stale `standy`; **nie interpretować ich jako pewnego stanu zaworu**. Podobnie nie używać 101 ani 108 do sterowania.
- Fizyczna obserwacja 19.11 o 11:53: przy ENGO ON wszystkie grzejniki poza G6 były gorące; w tym **G4 był gorący pomimo DPS 119 = 0**. Jest to dowód, że wskaźnik godzinowy nie ustala faktycznego otwarcia. Zimna G6 przy zadanych 20°C i zmierzonych lokalnie 20,8°C jest zgodna z ograniczeniem grzania, ale **nie dowodzi** braku problemu hydraulicznego.
- Do producenta SETTI+ wysłano pytanie o rzeczywisty stopień otwarcia zaworu i odpowiadający mu DPS; według stanu raportu **czekamy na odpowiedź**. Nie powtarzać eksperymentów DPS ani nie zmieniać mostka, parowania, głowic czy bramki tylko w celu odczytu zaworu.

## 5. Aktualny problem i stan decyzji na 19.11.2026

Pytanie: **jak współpracują ENGO w sypialni, osiem głowic i kocioł, czy inne pokoje zdążają osiągnąć cele oraz czy układ grzejników i otwartych drzwi zapewnia równowagę temperatur bez zbędnego gazu?**

- **15.11.2026** zapisano decyzję `observe`: **pozostawić 22°C ENGO i 55°C na kotle**, zbierać dane referencyjne, zwłaszcza o łazienkach i ciągłości HA; ponowna ocena **22.11.2026**. Sprawdzić, czy pojawiła się nowsza decyzja w `decyzje/`.
- W migawce 19.11 wieczorem: w salonie czujnik pokojowy pokazywał **21,8°C** przy celu archiwalnym 21,5°C, a G6 miała nastawę **20,0°C** i odczyt przy głowicy **20,8°C**; G5 miała nastawę 21,5°C i odczyt 20,2°C. To **wyjaśnia prawdopodobną różnicę zapotrzebowania**, ale bez odczytu zaworu nie dowodzi jego położenia.
- W kuchni G3 i G4 potrafią grzać jednocześnie (obserwacja 19.11), mimo mylących historycznych wskaźników DPS.
- Priorytet: **wykorzystać dostępne historie HA, ENGO, głowic, pokojów, drzwi, pogody i gazu**, a następnie określić jeden kolejny test *tylko jeśli dane go uzasadniają*. Nie podnosić wszystkich nastaw ani nie zlecać równoważenia hydraulicznego na podstawie samego faktu, że jeden grzejnik bywa zimny.
- Ewentualna korekta G6 lub badanie wpływu otwierania drzwi musi być osobnym, świadomie zatwierdzonym eksperymentem z porównywalnymi warunkami. Regulacja hydrauliczna i prace przy kotle wymagają diagnostyki/fachowca.

## 6. Procedura odpowiedzi w każdym nowym czacie

1. **Przeczytaj dokumenty źródłowe**, a nie tylko tę ściągę.
2. Otwórz **prywatne README**, **`meta/index.json`**, najnowsze **`badania/`**, **`decyzje/`** i **`karta/`**, a przy analizie bieżącej także `setti-data/pomiary.json`, `setti-data/glowice.json` i wskazane partycje HA. Odczytaj rzeczywiste daty najnowszych danych.
3. Podaj zwięźle: **(a) co potwierdzono, (b) czego nadal nie wiemy, (c) jaka była ostatnia decyzja, (d) co rekomendujesz teraz i dlaczego**. Odsyłaj do konkretnych plików.
4. Temperatury odczytów, temperatury zadane, korekty kalibracji, sygnały ENGO, fizyczną pracę palnika i wskaźniki DPS trzymaj **oddzielnie**. Temperatur z różnych godzin nie przedstawiaj jako jednoczesnych.
5. Dla oszczędności uwzględniaj pogodę i jakość danych, c.w.u., przerwy oraz zmianę gazomierza. Nie wyprowadzaj sprawności z samych temperatur ani ENGO ON.
6. **Bez automatycznych zmian** w urządzeniach, prywatnych plikach, gałęzi `main` lub eksperymentach. Przy propozycji aktualizacji wiedzy pokaż uzasadnienie i uzyskaj zgodę na zapis.
7. Po istotnym nowym badaniu **zaktualizuj odpowiedni prywatny protokół i ten drogowskaz po zatwierdzeniu**, z datą i odnośnikiem; nigdy nie przepisuj tu prywatnych identyfikatorów, tokenów, dokładnego adresu, rozliczeń ani osobistych notatek.

**Uwaga:** ten dokument jest punktem startowym, ale **bieżącym źródłem prawdy** są najnowsze dane, protokoły i decyzje w repozytoriach.
