# Moje Ogrzewanie

> **Zasada naczelna: „Dobrze gospodarować powierzonym mi dobrem”.** Chodzi o rozpoznawanie i wybór dobra oraz umiejętne podejmowanie decyzji prowadzących do jego realizacji. Projekt opiera się na czterech cnotach kardynalnych: **roztropności, sprawiedliwości, umiarkowaniu i męstwie**. Wiedza, pomiary, automatyzacja i oszczędności są narzędziami odpowiedzialnego gospodarowania mieszkaniem, energią, środkami finansowymi i komfortem człowieka — nigdy celem samym w sobie. Zobacz [fundamentalne zasady projektu](docs/NAJWAZNIEJSZE-ZASADY-PROJEKTU.md).

Prosty dziennik komfortu i zużycia gazu. Zachowuje sześć pomieszczeń, osiem głowic, drzwi, ENGO Smart, nastawę kotła, cele temperatury, pomiary Setti+, warunki i licznik gazu, eksperymenty oraz historię. Temperatura zewnętrzna dla Katowic jest pobierana automatycznie z Open-Meteo; odczyty gazomierza i nastawy wpisuje się ręcznie, a aktualne pomiary Setti+ aplikacja pobiera z publicznego pliku JSON w gałęzi `setti-data`. Aplikacja nie steruje urządzeniami.

## Jak działa cały system?

**[Architektura „Moje Ogrzewanie” — ENGO, Setti+, Tuya, Home Assistant, MacBook, GitHub, iPhone i ChatGPT](docs/JAK-DZIALA-SYSTEM-OGRZEWANIA.md)** — aktualny schemat przepływu danych, automatyzacji, ograniczeń i postępowania przy awariach (stan 18.11.2026).

## Wersja 1.2 · Gaz i pogoda

Zakładka **Gaz i pogoda** pobiera temperaturę godzinową dla Katowic z Open-Meteo (dane modelowe, nie pomiary stacji), po uruchomieniu aplikacji i na żądanie. Archiwum obejmuje do roku wstecz, w miarę dostępności API i internetu. Dane pogodowe i odczyty użytkownika pozostają lokalnie w aplikacji.

- Jednorazowy import historii ORLEN: skopiuj wiersze `RRRR-MM-DD;nowy;100` (lub `stary` dla poprzedniego gazomierza) do pola **Wklej wiele odczytów ORLEN**. Brak dokładnej godziny jest zapisywany jako 12:00 i statystyki takiej doby są orientacyjne. Import dopisuje dane, nie zastępuje poprzednich wpisów.
- Dwa odczyty z tego samego licznika dają m³ w okresie i m³/dobę; nigdy nie odejmuje się odczytów różnych liczników.
- Przy ≥75% dostępności godzin pomiarowych pokazuje średnią temperaturę zewnętrzną i m³ na stopniodzień przy **stałej temperaturze odniesienia 21,5°C**. Wskaźnik nie oznacza sprawności pieca ani nie rozdziela podgrzewania wody i ogrzewania.
- Historię zmian nastawy ENGO wprowadza się oddzielnym formularzem z datą, np. zmiana w czasie eksperymentu. Nie są pobierane dane z ENGO ani z ORLEN.
- Offline dotychczasowe dane działają dalej. Nowej pogody ani nowych pomiarów Setti+ aplikacja nie pobierze bez internetu.
- Automatyczne pomiary Setti+ służą tylko do odczytu; po 20 minutach od ostatniej synchronizacji oznaczane są jako nieaktualne. Można nadal wprowadzać własne pomiary ręcznie.
- Przy nowym bieżącym odczycie gazu (nie przy imporcie ORLEN) aplikacja zapisuje lokalnie także migawkę sześciu pomiarów Setti+, jeśli są aktualne. Czas synchronizacji nie jest gwarantowanym czasem fizycznego pomiaru.
- Publiczne temperatury i wilgotność są odczytywane z `https://raw.githubusercontent.com/dszak/moje-ogrzewanie/setti-data/pomiary.json` bez jakichkolwiek tokenów w aplikacji. GitHub ani MacBook nie otrzymują historii gazu.

## Wersja 1.3.1 · czytelna historia gazu na telefonie

Na ekranach o szerokości do 640 px historia odczytów gazomierza jest wyświetlana jako karty z datą, wartością w m³, źródłem i — jeśli dostępne — rozwijanymi pomiarami sześciu pomieszczeń. Na większych ekranach pozostaje tabela z możliwością przewijania poziomego. Zmiana dotyczy tylko wyglądu: nie modyfikuje formatu danych, klucza zapisu ani historii.

## Wersja 1.4.0 · panel ogrzewania i bezpieczne poprawki

Zakładka **Panel ogrzewania** łączy w jednym widoku temperaturę i wilgotność w sześciu pomieszczeniach, osiem głowic TRV001 oraz ręcznie zapisane wartości ENGO i kotła. Pomiary Setti+ są pobierane tylko do odczytu z `pomiary.json`, a głowice z publicznego `https://raw.githubusercontent.com/dszak/moje-ogrzewanie/setti-data/glowice.json`.

- Każda z ośmiu głowic pokazuje temperaturę przy głowicy, temperaturę zadaną, kalibrację i dosłowną wartość `mode_raw`. Dane głowic nie są tożsame z temperaturą pomieszczenia. Nieaktualne odczyty są oznaczone, a stare nie są udawane jako bieżące.
- Głowice i czujniki odświeżają się przy uruchomieniu, co 5 minut oraz na żądanie, bez tokenów i logowania do Setti+/Tuya.
- ENGO Smart i temperatura kotła pozostają **wpisami ręcznymi**. Panel nie wydaje żadnych poleceń urządzeniom.
- Odczyty gazu z formularza i historii mogą być indywidualnie **edytowane lub usuwane** po potwierdzeniu. Każda poprawka jest odnotowana w historii zmian. W przypadku połączonej obserwacji pogody usunięcie jej wartości gazu pozostawia pozostałe informacje pogodowe.
- Nowe odczyty gazu są potwierdzane przed zapisaniem. Import ORLEN nadal tylko dopisuje dane bez zastępowania istniejących.
- Zakładka Gaz i pogoda posiada osobne **porównania dobowe**, wyszukujące odczyt najbliższy 24 godzinom wstecz (przyjmowany odstęp: 18–30 godzin), nawet jeśli wystąpiły pomiary pośrednie. Porównanie odbywa się wyłącznie między odczytami tego samego gazomierza. Krótsze niż 18 godzin okresy prezentują przeliczenie m³/dobę z oznaczeniem **szac.**; jest to tempo orientacyjne, nie obserwacja całej doby.
- Pogoda jest odświeżana po otwarciu aplikacji, po jej przywróceniu na ekran i po ponownym połączeniu z internetem — jeżeli poprzednie pobranie było co najmniej 12 godzin wcześniej. Przycisk ręczny pozostaje jako opcja awaryjna.
- Tekst i opisy na telefonie zostały powiększone, a panel korzysta z czytelnych kart bez wykresów.
- Nie zmieniono klucza zapisu `moje-ogrzewanie-data-v1`, struktury lokalnych danych, istniejących pomieszczeń, identyfikatorów ani dotychczasowej historii. GitHub nie otrzymuje prywatnych odczytów gazu.

### Zaplanowane oddzielnie na kolejną wersję

Interaktywne oznaczanie drzwi na lokalnej mapie mieszkania oraz trzy poziomy subiektywnego komfortu (obniżony komfort, optymalnie, przegrzanie). Te funkcje wymagają osobnego projektu interfejsu i testów bezpiecznej rozbudowy zapisu — **nie są jeszcze wprowadzone**.

## Wersja 1.8.2 · Odnośniki do pełnych dokumentów w raporcie ChatGPT

Każdy nowo eksportowany raport zawiera w `memory_context.governing_documents` **bezpośrednie adresy** dwóch kanonicznych plików GitHub: `docs/NAJWAZNIEJSZE-ZASADY-PROJEKTU.md` i `docs/BAZA-WIEDZY-TECHNICZNEJ.md`, wraz z ich przeznaczeniem i instrukcją przeczytania przed analizą lub eksperymentem. Odnośniki są także wypisane w `readable_summary` i instrukcji nowego czatu.

Samo dodanie linku **nie pobiera zdalnej treści**. Gdy dostęp do GitHub nie jest możliwy, ChatGPT ma to jawnie zaznaczyć i korzystać z zasad moralnych, skróconej bazy 9 źródeł i historii zapisanych **wewnątrz** raportu. Brak zmian w schemacie lokalnych danych i ustawieniach urządzeń.

## Wersja 1.8.1 · Zasada naczelna i cztery cnoty w aplikacji

Na ekranie **Mieszkanie** widoczna jest zasada „Dobrze gospodarować powierzonym mi dobrem” oraz link do rozwinięcia. Na początku zakładki **Pamięć projektu** wyświetlane są cztery cnoty kardynalne: roztropność, sprawiedliwość, umiarkowanie i męstwo — z pełnym sensem moralnym, osobistymi przykładami zastosowania i pytaniem o dobro przed każdą decyzją.

Każdy raport dla ChatGPT zawiera teraz **`memory_context.supreme_principle`**, niezależnie od okresu pomiarów. Słowa zasady, jej sens, cztery cnoty oraz hierarchia celów są dostarczane jako stałe treści programu, nie są kopiowane do prywatnej karty użytkownika i nie wymagają ręcznego uzupełniania. Bez zmian schematu zapisu `moje-ogrzewanie-data-v1`, danych historycznych ani sterowania.

## Wersja 1.8.0 · Pamięć i Optymalizacja

**Biblioteka wiedzy technicznej:** wersja 1.8 zawiera osobną, źródłową bazę wiedzy (BRÖTJE, ENGO, Nesta, Energy Saving Trust, CIBSE, ASHRAE, PKN i Citizens Advice). Każdy materiał ma podaną tezę, praktyczne zastosowanie i ograniczenia. Źródła są widoczne w zakładce „Pamięć projektu” i dołączane do pakietu JSON; są oddzielone od lokalnych pomiarów i zatwierdzonych wyników eksperymentów. Patrz [metodyka badań i literatura](docs/BAZA-WIEDZY-TECHNICZNEJ.md). **Nie przepisuj ogólnych wyników z literatury jako potwierdzonych oszczędności tego mieszkania.**

**Cel nadrzędny:** nie gromadzić samych wykresów, lecz stopniowo *uczyć się zachowania instalacji*, łącząc komfort i ekonomię oraz wykorzystując wyniki wszystkich wcześniejszych eksperymentów. Zasady projektu: [najważniejsza karta metodologii](docs/NAJWAZNIEJSZE-ZASADY-PROJEKTU.md).

- Nowa prywatna zakładka **Pamięć projektu**: karta charakterystyki mieszkania, instalacji, czujników, indywidualnych kryteriów komfortu, ograniczeń i aktualnego pytania badawczego. Pola startują puste: szczegóły budynku i instalacji wpisuje użytkownik **lokalnie**, nie są publikowane w kodzie aplikacji.
- **Rejestr wiedzy**: obserwacje, hipotezy, wyniki eksperymentów (korzystny/niekorzystny/nierozstrzygnięty), sprawdzone konfiguracje; dla każdego wpisu: źródło, dowody, warunki stosowalności, poziom pewności, powiązany eksperyment. Wpisy można **oznaczyć jako zastąpione bez kasowania historii**. Żaden wpis nie jest automatycznie potwierdzanym faktem.
- **Pakiet dla ChatGPT** z zakładki **Analiza i decyzje**: raport z temperaturami, gazem, ENGO, pogodą i licznikami dla wybranego okresu otrzymuje pełny trwały kontekst **bez ograniczenia do 7/30 dni**: kartę projektu, wszystkie zapisane wnioski (łącznie ze zastąpionymi), wszystkie decyzje oraz eksperymenty, aktywne hipotezy i następne zagadnienie. Nowy raport zachowuje format `moje-ogrzewanie-analiza` i ma `format_version:2` oraz obiekt `memory_context`. Nie migruje ani nie usuwa zapisów z wersji 1.7.
- **Pętla uczenia się z ChatGPT:** skopiuj instrukcję rozpoczęcia nowej rozmowy albo instrukcję propozycji wniosków. ChatGPT może przygotować JSON `moje-ogrzewanie-propozycje-wiedzy` (`version:1`), który można wkleić lub wybrać z Plików na iPhonie. Aplikacja waliduje go, usuwa duplikaty, pokazuje pełny podgląd i dopiero po potwierdzeniu użytkownika **dopisuje** nowe wnioski. ChatGPT nie ma bezpośredniego połączenia z danymi iPhone'a.
- **Bezpieczeństwo danych:** prywatna karta i rejestr wiedzy są zapisane w dotychczasowym kluczu `moje-ogrzewanie-data-v1` jako opcjonalne `projectMemory` i `knowledgeLog`; stare kopie JSON działają bez migracji niszczącej. W kopii bezpieczeństwa zostaje cała pamięć. Nie publikujemy użytkownikowych danych, map ani geometrii; raport dla ChatGPT jest pobierany ręcznie i może zawierać dane prywatne — przed wysłaniem należy go przejrzeć.
- **Ograniczenia:** brak automatycznego treningu modelu AI i brak zdalnego sterowania kotłem. Ekonomiczne korzyści są rozstrzygane dopiero po kontrolowanym eksperymencie, na podstawie porównywalnej pogody, komfortu i wiarygodnych danych gazowych. Etykieta „sprawdzona konfiguracja” oznacza **wpis użytkownika**, a nie obliczony automatycznie optymalny wariant.

## Wersja 1.7.0 · Widzieć – Ocenić – Działać

Zakładka **Analiza i decyzje** wprowadza trzy etapy świadomej oceny ogrzewania:

1. **WIDZIEĆ:** wybierz ostatnie 24 godziny, 7 dni lub 30 dni. Aplikacja lokalnie przygotuje czytelne podsumowanie i kompletny **raport JSON do ChatGPT**. Raport zawiera: historię zmian temperatur z sześciu czujników MQTT (z wcześniejszymi punktami odniesienia), zdarzenia i kompletne pary ENGO, odczyty starego i nowego gazomierza z jednoznacznymi granicami okresów, modelową pogodę, liczniki kotła BRÖTJE, ustawienia ręczne, obserwacje, eksperymenty, decyzje oraz najnowsze migawki Setti+/głowic ze znacznikiem aktualności. Zakres jest wyraźnie ograniczony do okresu i opisany wraz z brakami danych.
2. **OCENIĆ:** użytkownik pobiera raport JSON i **sam dołącza go do rozmowy ChatGPT**. Nie ma automatycznego dostępu ChatGPT do danych na iPhonie. W raporcie prosimy o oddzielenie faktów, hipotez, danych brakujących i bezpiecznego następnego kroku. Bez dostatecznych danych nie wyznaczamy sprawności kotła ani gazu zużytego wyłącznie na ogrzewanie.
3. **DZIAŁAĆ:** po wspólnej ocenie można zapisać lokalnie uzasadnienie i jedno z rozstrzygnięć: **pozostawić ustawienia**, **zebrać więcej danych** albo **przeprowadzić eksperyment**. Dziennik zawiera uzgodniony następny krok, datę ponownej oceny, opcjonalne powiązanie z istniejącym eksperymentem i migawkę dwóch głównych nastaw w chwili decyzji. Decyzje można poprawiać i usuwać, a ich historia jest uwzględniana w prywatnych kopiach JSON.

**Prywatność i zasady pomiarów:** raport jest tworzony na urządzeniu i nie jest przesyłany automatycznie. Nie zawiera mapy mieszkania, pełnego dziennika wpisów ani haseł/tokenów (nie są one przechowywane w aplikacji). Raport może natomiast zawierać szczegółowe temperatury, gaz oraz opisy własnych eksperymentów — należy go przejrzeć przed wysłaniem. Projekt nie publikuje żadnych raportów użytkownika na GitHubie. Nowe pole `decisionLog` jest opcjonalne dla starych kopii, a klucz `moje-ogrzewanie-data-v1` i schemat `version:1` nie uległy zmianie. Żadna część nie steruje termostatem, głowicami ani kotłem. Przed zmianą fizycznych nastaw potrzebna jest świadoma decyzja.

## Wersja 1.6.0 · Historia temperatur z Home Assistant i cykle ENGO

Zakładka **Wykresy temperatur** przyjmuje prywatny plik CSV z Home Assistant → Historia → ⋮ → Pobierz dane. Obsługiwane kolumny eksportu to `entity_id,state,last_changed`. Import rozpoznaje sześć encji temperatur Setti+ MQTT, zachowuje znaczniki czasu ISO ze strefą, pomija niezwiązane encje i stany `unknown` / `unavailable`, a pozostałe wiersze rygorystycznie sprawdza.

Po wczytaniu wyświetlany jest **podgląd**: nowe pomiary, duplikaty i liczba zapisów dla poszczególnych pokoi. Po zatwierdzeniu import **dopisuje** tylko nowe wartości. Powtórny eksport z tym samym okresem nie podwaja danych, a sprzeczne wartości tego samego czujnika w tej samej chwili zatrzymują import. Na urządzeniu można przechowywać do 25 000 zmian temperatur; **nigdy nie są automatycznie usuwane**. W każdej chwili można wyeksportować pełną kopię JSON, a usunięcie wybranego dnia wymaga potwierdzenia.

Wykres dzienny pokazuje wybrane spośród sześciu pomieszczeń, historię temperatur jako linie schodkowe oraz zaznaczone okresy zapotrzebowania ENGO z wcześniej wprowadzonych zdarzeń. Oś czasu używa **Europe/Warsaw**, także w dniach zmiany czasu. Przebieg od poprzedniego dnia ma sens tylko wtedy, gdy istnieje wcześniejsza zarejestrowana wartość; aplikacja nie generuje sztucznych pomiarów i nie przedłuża nieznanego końca historii. Pod wykresem widać liczbę zmian oraz minima i maksima dla pomieszczeń danego dnia. Nie są wyliczane pozorne średnie ze zmian wartości.

Historia jest opcjonalnym polem `temperatureHistory` w dotychczasowym schemacie danych `version:1`, z niezmienionym kluczem `moje-ogrzewanie-data-v1`. Eksporty CSV użytkownika **nie są** dodawane do repozytorium ani publicznych plików Pages. Wykres i historia pozostają na iPhonie / urządzeniu, na którym je zaimportowano. Aplikacja nie łączy się z Home Assistant, ENGO ani Setti+ po prywatne dane i niczego nie steruje. Testy opierają się na **sztucznych** pomiarach.

## Wersja 1.5.0 · Cykle ENGO: import ze zrzutów i analiza

Zakładka **Cykle ENGO** umożliwia wklejenie lub wczytanie pliku CSV przygotowanego ze zrzutów dziennika ENGO Smart. Wiersz ma format `RRRR-MM-DD;GG:MM;ON` albo `RRRR-MM-DD;GG:MM;OFF`; nagłówek `data;godzina;stan` jest opcjonalny. Daty wpisuje się zgodnie z lokalnym czasem urządzenia (w Polsce).

Przed zapisem aplikacja sprawdza każdą linię, wyświetla podgląd i pomija duplikaty. Sprzeczne stany z tej samej minuty oraz nieprawidłowe wiersze blokują cały import. Dane są wyłącznie dopisywane, nigdy zastępowane. Każde zdarzenie można edytować albo usunąć po potwierdzeniu.

Statystyki obejmują ukończone pary WŁĄCZONE → WYŁĄCZONE, średni i łączny czas oraz ostatnie dni z odczytami. Niekompletne sekwencje są oznaczone i nie dolicza się im fikcyjnego czasu. Procent odnosi się do odcinka od pierwszego do ostatniego zdarzenia w danym dniu, nie do pełnych 24 godzin. Cykle przekraczające północ są przypisywane do dnia rozpoczęcia, bez procentu.

Zapis `engoCycles` jest opcjonalnym polem w dotychczasowym schemacie `version:1`; starsze pliki JSON działają nadal, a klucz `moje-ogrzewanie-data-v1` pozostaje niezmieniony. Wszystkie prywatne wpisy są zapisywane lokalnie na urządzeniu. Aplikacja nie łączy się z ENGO i nie steruje kotłem. Zdarzenia dotyczą **zapotrzebowania termostatu**, a nie potwierdzonego czasu działania palnika.

## Wersja 1.4.2 · ręczne liczniki kotła BRÖTJE

Nowa zakładka **Kocioł** zawiera prywatny dziennik odczytów z wyświetlacza BRÖTJE QWHC 20/24:

- **AC001**: skumulowana liczba godzin zasilania kotła, nie czas pracy palnika;
- **AC005**: narastający, orientacyjny licznik związany z centralnym ogrzewaniem;
- **AC006**: narastający, orientacyjny licznik związany z przygotowaniem ciepłej wody.

Można wpisać datę i godzinę zdjęcia, trzy wartości całkowite oraz opcjonalną notatkę, przeglądać historię, poprawiać i usuwać błędne wpisy po potwierdzeniu. Program oblicza nieujemne różnice pomiędzy kolejnymi odczytami w porządku chronologicznym. Przy spadku lub resecie licznika nie wylicza fałszywego „ujemnego zużycia”. Wartości AC005 i AC006 pozostają **surowymi wskazaniami bez jednostek**: nie są automatycznie przeliczane na kWh, m³ gazu ani koszt.

Historia jest przechowywana **tylko lokalnie** jako opcjonalne `boilerReadings` w dotychczasowym formacie danych `version:1` i pojawia się również w eksporcie JSON. Stare pliki JSON nieposiadające tego pola są nadal akceptowane; nie jest zmieniany klucz pamięci `moje-ogrzewanie-data-v1`. Aplikacja nie łączy się z elektroniką kotła, nie przełącza ENGO ani nie zmienia nastaw grzania. Pierwsze odczyty ze zdjęć użytkownik wprowadza prywatnie po publikacji — nie znajdują się w publicznym repozytorium.

## Wersja 1.4.1 · czytelne stany danych pogodowych i Setti+

- Na ekranie głównym i w zakładce **Gaz i pogoda** brak aktualnej temperatury zewnętrznej jest opisywany jako niedostępny pomiar z czasem ostatniej aktualizacji. Liczba historycznych godzinowych próbek (np. `8275`) nie zastępuje temperatury.
- Jeśli synchronizacja Setti+ jest starsza niż 20 minut, ostatni zatwierdzony odczyt automatyczny jest nadal widoczny jako **nieaktualny**, z godziną przesłania. Nie jest zastępowany starszą ręczną temperaturą tylko z powodu przekroczenia progu świeżości.
- Nieaktualna temperatura nie jest wykorzystywana do diagnozowania różnicy względem celu, nie staje się bieżącym odczytem ani migawką do odczytów gazu.
- To tylko poprawka prezentacji danych. Nie dotyka `public/storage.js`, klucza lokalnego zapisu, pomiarów użytkownika, danych na GitHub `setti-data`, automatyzacji Setti+/Tuya ani urządzeń ogrzewania.

## Uruchomienie i publikacja

Aplikacja nie wymaga instalowania bibliotek. Podgląd: `python3 -m http.server 8765 --directory public`. Otwórz `http://localhost:8765`.

Publikacja wymaga uprzedniej zgody właściciela. Proponowana nazwa repozytorium: `moje-ogrzewanie`.
Po utworzeniu repozytorium włączyć Settings → Pages → Source: GitHub Actions. Wysłać sprawdzoną wersję na gałąź `main`. Workflow sprawdza testy, przygotowuje wyłącznie dozwolone pliki z `public/` i publikuje Pages. Adres należy odczytać z zakończonego wdrożenia, nie zgadywać.

## Kolejne aktualizacje

1. Użytkownik opisuje zmianę w tym projekcie, z dostępem agenta do repozytorium GitHub.
2. Agent przygotowuje gałąź, poprawkę, testy i propozycję zmian (pull request).
3. Użytkownik zatwierdza konkretną wersję. Dopiero wtedy agent scala ją do `main`.
4. GitHub Actions automatycznie sprawdza i publikuje wersję. Agent weryfikuje wynik i podaje adres.
5. Aplikacja pobiera aktualizację w tle. Należy zamknąć wszystkie jej karty i ponownie otworzyć aplikację, aby włączyć nową wersję.

Nigdy nie publikować prywatnych kopii, planu mieszkania ani pierwotnego ZIP-a. Dostęp do GitHub musi umożliwiać zapis; samo odczytywanie repozytorium nie wystarczy. Zgoda na pierwszą publikację nie jest zgodą na dowolne przyszłe aktualizacje.

## Dane i kopie

Dane są lokalne; GitHub otrzymuje kod, nie wpisy użytkownika. Brak analityki i zewnętrznych bibliotek. Publiczny kod nie zawiera dokładnego adresu, geometrii mieszkania ani planu. Zakładka Mapa pozwala dodać lokalny plik SVG/PNG/JPEG (do 2 MB), zawarty następnie w kopii JSON.

- Ustawienia → Pobierz kopię JSON: zapisz w Plikach / iCloud, najlepiej po każdym eksperymencie. CSV zawiera tylko pomiary, nie pełną kopię.
- Ustawienia → Wczytaj kopię JSON: po potwierdzeniu zastępuje dane, zachowując poprzedni poprawny zapis jako lokalną kopię odzyskiwania.
- Lokalna kopia odzyskiwania powstaje przy zmianie danych, o ile wystarczy pamięci. Nie zastępuje pliku poza przeglądarką.
- Aktualizacje pod tym samym adresem zachowują klucz i format danych. Nie zmieniać domeny ani adresu instalacji bez planu migracji.
- Wersja 1.0 jest zgodna z importem. Gdy działała pod innym adresem lub jako plik, wyeksportuj z niej JSON i zaimportuj do nowej aplikacji. Paczka ZIP nie zawiera historii przechowywanej w przeglądarce.
- Safari i aplikacja z ekranu początkowego mogą korzystać z odrębnego zapisu. W razie potrzeby przenieś dane kopią JSON.
- Pamięć przeglądarki nie gwarantuje przetrwania czyszczenia danych, utraty telefonu ani usunięcia aplikacji. Przycisk „Chroń zapis na urządzeniu” wysyła prośbę; przeglądarka może odmówić.
- Nie ma synchronizacji między urządzeniami. Publiczne aplikacje pod tym samym hostem Pages współdzielą pochodzenie przeglądarki; na tym hoście utrzymuj tylko zaufany kod.

## iPhone

Po publikacji otwórz HTTPS w Safari → Udostępnij → Do ekranu początkowego (włącz otwieranie jako aplikacja, jeśli widoczne) → Dodaj. Uruchom z nowej ikony, zapisz testowy pomiar i kopię JSON. Zamknij i otwórz ponownie; potem sprawdź tryb samolotowy. Pierwsze otwarcie musi odbyć się online.

Przygotowano manifest, ikony, obszary bezpieczne ekranu, pola 16 px, przyciski dotykowe i pamięć offline. Test na prawdziwym iPhonie i test publicznego wdrożenia pozostają do wykonania po zatwierdzeniu publikacji.

## Weryfikacja

`node --test tests/*.test.cjs`

`python3 scripts/check.py`

`python3 scripts/package.py`

Testy obejmują funkcje ogrzewania, zachowanie danych, import starej wersji, uszkodzone kopie, brak miejsca, konflikt kart, odzyskiwanie i historię. Pakiet publikacyjny powstaje w `dist/`; kopie użytkownika są wykluczone.

Dokumentacja: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [instalacja na iPhonie](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios), [trwałość pamięci WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/).
