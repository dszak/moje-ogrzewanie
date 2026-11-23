# Tablica ogrzewania — odbiór wersji testowej

**Dobrze gospodarować powierzonym mi dobrem.** Tablica pomaga obserwować warunki w mieszkaniu, chronić komfort i podejmować proporcjonalne decyzje na podstawie udokumentowanych pomiarów. Sposób pracy pozostaje ten sam — WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ.

## Gdzie znaleźć funkcje

| Obszar | Funkcje |
| --- | --- |
| Start | Gazomierz, wietrzenie, notatka CO, liczniki BRÖTJE, podsumowanie i pełna tablica |
| Pomieszczenia | Sześć czujników, wilgotność, cele, osiem głowic, ustawienia drzwi, historia i oceny komfortu |
| Analizy | Wykresy temperatur z cyklami ENGO i zapisanym wietrzeniem, gaz i pogoda, import ORLEN, korekty, eksperymenty, raporty, decyzje i dziennik |
| Więcej | Źródła, stan synchronizacji i diagnostyka, ustawienia, kopie i odzyskiwanie JSON, eksport CSV, pamięć projektu, mapa i ręczne zapisy awaryjne |

Kopie v1 zachowują dotychczasowe identyfikatory. Dodano opcjonalne tablice wpisów CO, wietrzenia i ocen komfortu. Starsze kopie nadal można wczytać. Puste pola liczników BRÖTJE oznaczają brak pomiaru tego parametru w danym wpisie. AC001 to godziny zasilania, AC005 i AC006 to wartości surowe ze wskazań technicznych. Przyrost każdego licznika odnosi się do jego wcześniejszego odczytu. Po spadku wyświetlany jest brak przyrostu.

## Zasady odczytu tablicy

- Gaz w litrach to różnica rzeczywistych wskazań w m³ pomnożona przez 1000. Tempo jest odnoszone do rzeczywistego czasu od odczytu do odczytu. Ostatnie dwa odczyty obejmujące 18 h i różniące się o 2,400 m³ dają 2400 l i 3200 l/dobę.
- W oknie 7 lub 30 dni używamy tylko pełnych przedziałów tego samego gazomierza. Średnia jest dzielona przez pokryty czas, a obok jest widoczne pokrycie. Brzegów nie interpolujemy. Spadek wskazania, wymiana gazomierza lub konflikt wskazań przerywa porównanie.
- Poprzedni przedział musi kończyć się w chwili rozpoczęcia ostatniego i mieć czas trwania z tolerancją 10%. Jeżeli oba mają wystarczające dane pogodowe, różnica średniej temperatury jest ograniczona do 2°C. Brak podstaw do oceny pogody jest oznaczony.
- Średnia wnętrza używa aktualnych czujników pokojowych. Obok wyświetlana jest ich liczba. Żądanie ENGO jest ostatnim udokumentowanym stanem. CO na kotle pozostaje ręczną notatką. Konwektor, czujnik pokojowy, przekaźnik gniazdka i moc są osobnymi danymi.
- Daty pokazujemy w strefie Europe/Warsaw. Korekta czasu końca wietrzenia w powtórzonej godzinie jesiennej pozwala wskazać pierwsze lub drugie wystąpienie.

## Dane prywatne i wdrożenie

Zapis gazu korzysta z dotychczasowego prywatnego kanału. Wpis jest przechowywany lokalnie i przeliczany przed potwierdzeniem jego archiwizacji. Wpis CO korzysta z istniejącego endpointu notatek po skonfigurowaniu połączenia. Pole notatki służy do dokumentowania odczytanej nastawy.

Opcjonalna migawka ENGO, SCH700 i gniazdka zawiera tylko wybrane wartości i ich czasy. Rozszerzenie eksportera szyfruje ją w istniejącej kopercie HA. Konfiguracja `HA_DASHBOARD_ENTITIES` wskazuje logiczne pola `climate`, `demand`, `enabled`, `target`, `measured`, `mode`, `relay`, `power`. Pierwsze to encja klimatu. Żądanie, włączenie i przekaźnik to stany binarne. Pozostałe to czujniki. Stan ENGO w migawce wymaga czasu zdarzenia źródłowego `event_ts_ms`. Moc jest akceptowana w W, a temperatury konwektora w °C. Przed wdrożeniem należy sprawdzić zgodność encji, jednostek i znaczników na znanym odczycie i po naturalnym przełączeniu. Brak mapy pozostawia dotychczasowy eksport. Błąd opcjonalnej migawki nie blokuje historii. Wersja testowa używa wyłącznie danych fikcyjnych oraz testowej kopii gazu w przeglądarce.

Wietrzenie jest obecnie zapisywane na urządzeniu i w kopii JSON. Docelowo osobny zasób prywatnego archiwum może przyjmować zdarzenia o stabilnym ID, czasie UTC i kolejnych wersjach wpisu. Mechanizm gazu służy jako wzorzec dla kolejki lokalnej, ponowień i potwierdzeń, z odrębnym zakresem kluczy i bez nadpisywania danych gazomierza. Serwer powinien weryfikować kolejność korekt, odrzucać konflikt wersji i przyjmować powtórzony identyfikator bez drugiego wpisu. Analizy zachowują oryginalne czasy i zestaw wybranych okien. Zmiana wymaga akceptacji konfiguracji usługi i zapisu w prywatnym repozytorium.

## Odbiór na iPhonie

1. Otwórz Start i wpisz większe wskazanie niż podane w formularzu. Po zatwierdzeniu sprawdź od razu ostatni odczyt, litry, czas, tempo oraz pokrycie 7 i 30 dni.
2. Włącz w wersji testowej symulację błędu archiwum, zapisz kolejny odczyt i sprawdź status. Wyłącz symulację i sprawdź potwierdzenie kopii testowej.
3. Rozpocznij wietrzenie zestawem G3 + G5 + G6, zamknij aplikację i otwórz ponownie. Zakończ i sprawdź historię oraz korektę pełnej daty i czasu.
4. Zapisz notatkę CO i zmień tylko jeden licznik. Porównaj oba wyniki z historią. W małej łazience sprawdź sześć pól urządzeń i zapisz ocenę komfortu.
5. Pobierz testową kopię JSON. Po ponownym otwarciu w tej samej przeglądarce powinna pozostać cała historia. Układ na fizycznym iPhonie i telewizorze wymaga osobnego odbioru.
