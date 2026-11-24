# Prywatny dziennik eksperymentów i decyzji

Dziennik wspiera zasadę odpowiedzialnego gospodarowania powierzonym dobrem. Zachowuje uzgodniony cel próby, rzeczywiste pomiary i niepewność wniosków, żeby kolejne decyzje służyły bezpieczeństwu, komfortowi i proporcjonalnemu oszczędzaniu. [Najważniejsze zasady projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md)

## Audyt

| Obszar | Wynik |
| --- | --- |
| Eksperymenty i decyzje | `state.experiments` i `state.decisionLog` były przechowywane w lokalnym v1 aplikacji. Kopia JSON przenosiła wpisy, a odzyskiwanie miało jeden poprzedni zapis. |
| Gazomierz | Aplikacja ma osobne klucze odczytu i zapisu w IndexedDB i korzysta z istniejącego Cloudflare Workera. Wersja z PR #27 zawiera ścieżkę `/v1/gas` i warunkowy zapis do prywatnego GitHuba. Porównano kod kandydata z PR #27. Dostęp testowy do punktu produkcyjnego zwrócił HTTP 403, a wersja skryptu na koncie Cloudflare wymaga osobnej weryfikacji administracyjnej. |
| Nastawa CO | To informacyjna wartość w prywatnym Home Assistant. Aplikacja ją odczytuje i zapisuje przez oddzielne połączenie. Dziennik może opisywać wykonaną ręcznie zmianę i zachować migawkę lokalnie dostępnych informacji. |
| Prywatne archiwum | Starsze pliki `decyzje/historia-eksperymentow.jsonl` i `decyzje/historia-decyzji.jsonl` zawierają wcześniejsze zapisy. Główna gałąź w czasie audytu nie zawierała wspólnego dziennika. Wydzielony test potwierdził zapis i odczyt przez konektor GitHuba. |

## Przepływ

`sync/dziennik-v1.json` w prywatnym archiwum jest wspólnym zapisem po uruchomieniu synchronizacji. Ma wersję schematu i uporządkowane zdarzenia. Każda rewizja ma trwały identyfikator, źródło, czas zapisu i odsyłacz do poprzedniej rewizji wpisu. Pole `started` oznacza rzeczywisty początek, a `ended` koniec próby. Brakująca migawka lub pomiar może pozostać pusty. Bieżący stan wynika z historii. Zarchiwizowana decyzja pozostaje w rewizjach.

Aplikacja zapisuje zmianę i kolejkę w dotychczasowym lokalnym magazynie. Pobiera archiwum przy uruchomieniu, powrocie do aplikacji, odzyskaniu połączenia oraz co pięć minut, gdy przeglądarka pozwala uruchomić kod. Po wysłaniu porównuje rewizję z ponownym odczytem GitHuba. Przy ograniczeniu pracy przeglądarki w tle najbliższą okazją do synchronizacji jest powrót do aplikacji.

Konflikt tego samego wpisu zachowuje wersję lokalną. Użytkownik wybiera wersję z archiwum albo dopisuje swoją korektę opartą na aktualnej rewizji. Sprawdzenie pozycji w historii chroni przed ponowieniem tego samego zapisu. Worker używa ponadto sumy kontrolnej pliku GitHuba przy aktualizacji, dzięki czemu zmiany różnych wpisów mogą się połączyć bez utraty rewizji.

Istniejący Worker dostaje ścieżkę `/v1/journal`, która używa osobnego zakresu uprawnień. Klucze odczytu i zapisu są oddzielne od kluczy gazomierza. Aplikacja przechowuje swój klucz w IndexedDB, poza kopią JSON. Klucz GitHuba istnieje wyłącznie w sekretach Workera. Dane są prywatne na poziomie uprawnień GitHuba i przesyłane przez HTTPS. Repozytorium zawiera czytelny JSON dla osób i narzędzi mających dostęp do archiwum. Pochodzenie `https://dszak.github.io` jest współdzielone przez witryny tego konta. Tylko zaufany kod aplikacji powinien działać na tym pochodzeniu. Limit bieżącego formatu to 4000 rewizji i 650 000 bajtów. Przed osiągnięciem limitu potrzebny będzie następny format z zachowaniem historii.

## Zapis po akceptacji w ChatGPT

1. Ustal model wpisu z użytkownikiem i uzyskaj jego zgodę na ten konkretny zapis. Określ, czy to plan, próba już rozpoczęta czy podsumowanie zakończonej próby.
2. Odczytaj z prywatnego repozytorium aktualny plik, jego SHA i historię danego wpisu. Wyszukaj istniejący wpis po identyfikatorze oraz tytule, czasie i zmienianym parametrze. Zachowaj jego identyfikator, gdy dopisujesz korektę.
3. Utwórz rewizję z `source: "chatgpt"`, osobnym czasem zapisu, identyfikatorem rewizji i rodzicem. `node scripts/journal-append.mjs ŚCIEŻKA_DO_PRYWATNEJ_KOPII` pobiera uzgodnioną rewizję ze standardowego wejścia i wypisuje zwalidowany dziennik. Nie przesyłaj go do publicznego repozytorium, komentarzy ani logów.
4. Użyj uprawnionego konektora GitHuba z dokładnym SHA odczytanego pliku. Po konflikcie ponownie odczytaj plik. Gdy zmienił się rodzic danego wpisu, sprawdź nową wersję z użytkownikiem. Po zapisaniu ponownie pobierz plik i potwierdź identyfikator rewizji. Potwierdzenie widoku telefonu wymaga osobnego odczytu w aplikacji.
5. Gdy rozmowa ma tylko odczyt, zgłoś oczekujący zapis. Zatwierdzony materiał może zostać przekazany do późniejszego zapisu w uprawnionej sesji bez używania kluczy w treści rozmowy.

## Kopia i migracja

1. Na właściwej instalacji PWA użyj **Ustawienia → Pobierz kopię JSON**. Zachowaj ją w prywatnych Plikach lub iCloud. Jeśli aplikacja była niezależnie używana w Safari, pobierz też tam osobną kopię do porównania. Zachowaj prywatny punkt przywracania repozytorium z dotychczasowymi zapisami decyzji i eksperymentów.
2. Przed migracją porównaj kopię iPhone’a, starsze JSONL i pozostałą dokumentację prywatną. Uzgodnij mapę istniejących identyfikatorów. Dla G5/G6 i zmiany CO 55 → 60°C z 24 listopada sprawdź opis, rzeczywisty czas, parametry, stan i źródło pomiaru. Sama informacja o nastawie CO nie potwierdza kompletnego wpisu eksperymentu. Rozbieżności pozostaw do rozstrzygnięcia. Danych tych prób nie dodawano przy pracach nad PR.
3. Po akceptacji przygotuj prywatny dziennik na podstawie uzgodnionej mapy. Zachowaj stare pliki bez zmian. Dane bez wiarygodnego czasu, nastawy albo pomiaru oznacz jako niepełne i zachowaj oryginał. Użyj `source: "migration"` dla zaakceptowanych zapisów z archiwum. Po połączeniu iPhone’a zakładka **Eksperymenty → Wpisy zapisane przed połączeniem** pozwala dołączać sprawdzone wpisy pojedynczo. Potencjalne odpowiedniki pozostają do porównania.
4. Przywrócenie starszej kopii nie tworzy poleceń usuwających zapis zdalny. Aktualne, potwierdzone rewizje i bieżąca kolejka są zachowywane. Zapisy oczekujące odnalezione wyłącznie w kopii są odkładane do ręcznego sprawdzenia przed wysłaniem.
5. Po wdrożeniu na iPhonie wejdź do **Analizy → Eksperymenty → Połączenie z prywatnym archiwum** i podaj jednorazowo klucz zapisu. Klucz dziennika jest odrębny od klucza gazu. Na innym urządzeniu możesz użyć klucza odczytu.

## Plan wdrożenia po akceptacji

1. W Cloudflare pobierz identyfikator bieżącego wdrożenia i pliki faktycznie używanego Workera. Sprawdź wejściowy skrypt, trasę `/v1/gas`, ustawienia zgodności i nazwy powiązań z PR #27. Jeżeli skrypty się różnią, dołącz nową trasę do potwierdzonego kodu produkcyjnego i ponów testy gazu. `sync-worker/worker.mjs` jest kandydatem na podstawie referencji z PR #27. [Wersje i wdrożenia Cloudflare](https://developers.cloudflare.com/workers/versions-and-deployments/)
2. Przygotuj prywatny plik docelowy według planu migracji. Dodaj `JOURNAL_GITHUB_TOKEN` ograniczony do docelowego prywatnego repozytorium i uprawnienia Contents. Wygeneruj niezależne 24-bajtowe klucze urządzeń i ustaw odpowiadające im skróty SHA-256 w `JOURNAL_READ_TOKEN_SHA256` i `JOURNAL_WRITE_TOKEN_SHA256`. Zachowaj ustawienia gazu i obecne pochodzenie aplikacji.
3. Po oddzielnej zgodzie wgraj wersję Workera i sprawdź ją w kontrolowanym środowisku Cloudflare. Zweryfikuj odczyt z poprawnym kluczem, odmowę zapisu kluczem odczytu, odmowę dla obcego pochodzenia, zachowanie gazomierza i możliwość cofnięcia do zapamiętanego wdrożenia. Do weryfikacji gazu użyj odczytu i bieżących testów kontraktu.
4. Po zatwierdzeniu PR uruchom GitHub Pages i potwierdź opublikowany identyfikator wersji. Po połączeniu fizycznego iPhone’a przejdź oba kierunki z wyraźnie zatwierdzonym wpisem. Zweryfikuj odczyt po restarcie aplikacji i dopiero wtedy uznaj produkcyjne uruchomienie za potwierdzone.

## Weryfikacja kandydata

Na wydzielonej gałęzi prawdziwego prywatnego GitHuba sprawdzono utworzenie syntetycznego planu przez uprawniony konektor oraz jego odczyt w przeglądarce w rozmiarach 320 i 390 px szerokości. Aplikacja utworzyła próbę bez połączenia, wysłała ją po powrocie połączenia, zakończyła i skorygowała próbę, a także zapisała powiązaną decyzję. Konektor niezależnie odczytał wszystkie pięć rewizji. Test uruchamiał kandydata Workera lokalnie i korzystał z odrębnego klucza testowego. Weryfikacja fizycznego iPhone’a oraz produkcyjnego Workera pozostaje etapem wdrożenia.
