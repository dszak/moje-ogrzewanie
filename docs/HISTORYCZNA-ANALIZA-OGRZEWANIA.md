# Historyczna analiza ogrzewania

Analiza służy utrzymaniu komfortu i odpowiedzialnemu gospodarowaniu energią. Raport gromadzi dowody do kolejnych decyzji zgodnie z [kartą projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md).

## Audyt z 21 listopada 2026 r.

| Źródło | Ustalenie | Zastosowanie |
|---|---|---|
| Szyfrowany eksport HA i starsze prywatne partycje | Zapis temperatur pokojowych i zdarzeń ENGO. Eksporter przerywa zapis przy kolizji ON/OFF w tej samej znormalizowanej minucie. Starsze zapisy nie zawierają sesji Recorder i pełnej historii nastaw. | Zachować wcześniejsze wersje. Do obliczania czasu używać bezpośredniej historii HA. |
| Recorder Home Assistanta | Dostępne są właściwe czujniki Setti+ i sygnał synchronizacji mostka, encja termostatu ENGO z atrybutami temperatury oraz zapis żądania ENGO. Istniejąca usługa SQL zwraca granice sesji Recorder. | Historia z pełnymi znacznikami czasu, dostępnością i granicami sesji. Odtworzenie dopiero od pierwszego dowodu danego stanu. |
| Prywatna deklaracja CO | Encja notatki CO zawiera wartość wprowadzoną w aplikacji i osobny czas zapisu. Dziennik decyzji i stare migawki mają charakter punktowy. | Oś deklaracji od pierwszego zapisu. Pomiar wody w kotle, praca palnika i historia CWU pozostają niepotwierdzone. |
| Głowice Setti+ | Recorder ma cztery encje na głowicę i zapis niedostępności. Pasywny dziennik lokalny dodaje znacznik odczytu temperatury, nastawy i surowego trybu. Właściwa korekta pochodzi z DPS 27 w HA. | Zachowanie pomiarów głowic oddzielnie od pokojowych. Korekta wyłącznie z HA. |
| Pogoda | Historyczny model godzinowy Open-Meteo ICON-EU uzupełnia analizę. HA ma osobną serię modelową Met.no z innego okresu i inną częstotliwością. | ICON-EU jako wspólna podstawa porównań. Met.no jako oddzielna seria pomocnicza. |
| Prywatny dziennik gazomierza | `sync/gazomierz-v1.json` to rejestr dodawania, korekt i usuwania odczytów. Punkt odczytu gazu obejmuje także zużycie na CWU. | Odtwarzać stan dziennika. Obliczać zużycie między kolejnymi rzeczywistymi odczytami tego samego licznika. |
| Karta, decyzje i cele | Karta zawiera powierzchnie sześciu pokoi. Datująca się migawka zawiera progi komfortu. Dziennik decyzji i eksperymentów dostarcza kontekstu. | Ważenie według karty. Progi z migawki to punkt odniesienia. Potwierdzony czas poniżej rzeczywistego celu wymaga udokumentowanych okresów jego obowiązywania. |

Mapowanie głowic zachowuje [dotychczasowy podział](WIDOKI-HA-CALY-SYSTEM-I-TV-2026-11-20.md). Techniczne źródła odczytu obejmują [historię HA](https://contributors.home-assistant.io/core/internals/rest-api/#get-apihistoryperiodtimestamp), [usługę SQL tylko do odczytu](https://www.home-assistant.io/integrations/sql/#list-of-actions) i [godzinowy model Open-Meteo](https://open-meteo.com/en/docs/historical-forecast-api).

## Archiwizacja i kontrola

MacBook odpytuje historię Home Assistanta i model pogodowy. Zapisuje jawnie do prywatnego repozytorium z kontrolą jego widoczności i prawa zapisu. Home Assistant otrzymuje tylko zapytanie o historię i `SELECT` granic sesji. Eksporter korzysta z dotychczasowych wpisów w Pęku kluczy. Nie wymaga zmian konfiguracji HA, MQTT, kotła ani urządzeń.

Prywatna konfiguracja lokalna zawiera adres HA, mapę identyfikatorów źródeł, wskazanie prywatnego repozytorium, współrzędne modelu i nazwy wpisów w Pęku kluczy. Pole `entities` mapuje logiczne identyfikatory z `HA_SERIES` na encje Recorder. `demand_sources` zawiera dopuszczalne etykiety pochodzenia zdarzeń ENGO. Hasła są odczytywane z Pęku kluczy. Przykład wywołania z istniejącą konfiguracją jest następujący.

```sh
python3 -B scripts/heating_archive.py --config "$KONFIG_PRYWATNY" run
```

- `analityka/v1/partie/` zawiera wersjonowane pliki źródłowe z oknami eksportu, źródłowymi znacznikami czasu, stanami nieznanymi i metadanymi Recorder. Suma zawartości identyfikuje partię. Identyczny plik nie tworzy kolejnej kopii. Nowsza partia może zawierać spóźnione dane. Raport usuwa powtórzenia według serii i znacznika czasu, a w razie nierozstrzygniętego konfliktu oznacza stan jako nieznany.
- `analityka/v1/zestawienia/` zawiera przeliczone doby i tygodnie. Plik podaje zakresy, wykorzystane partie i skróty treści prywatnych źródeł. Po korekcie danych nowsze zestawienie ma własną nazwę. Wersje źródłowe i wcześniejsze raporty pozostają dostępne.
- Zadanie na MacBooku działa co sześć godzin podczas dostępności komputera i przy załadowaniu zadania. Każdy przebieg ponawia ostatnie doby, z próbą odzyskania do ośmiu dni po dłuższej przerwie. Dostępność starszych wpisów zależy od retencji HA. Lokalny bufor pozwala ponowić wysyłkę po awarii sieci lub GitHuba.
- W katalogu zadania pod `~/Library/Application Support/Moje Ogrzewanie/` plik `status.json` podaje wynik ostatniej próby, ostatni potwierdzony zakres, identyfikator zapisu i świeżość źródeł. `failed`, `partial` albo ponad 14 godzin od potwierdzonego eksportu wymagają sprawdzenia logów. Surowy eksport może się udać mimo błędu pogody lub zestawienia. Brak kolejnej zmiany stanu ENGO nie jest sam w sobie awarią.
- Po scaleniu prywatnego PR zadanie zapisuje na `main` przez argument `--branch main`. Odczyt dziennika gazu, karty, migawki i potwierdzeń nastaw przy generowaniu zestawień odbywa się z prywatnego `main`. Eksport dopisuje pliki w obszarze analityki i aktualizuje gałąź bez wymuszania zmiany historii.

ChatGPT może na wyraźne żądanie odczytać raport z prywatnego repozytorium, kiedy użytkownik udostępni je połączeniu GitHub. Wystarczą zestawienie i potrzebne pliki kontekstowe. Połączenie z Home Assistantem nie jest wymagane do odtworzenia raportu.

## Reguły obliczeń

- Doba kalendarzowa biegnie między północami strefy `Europe/Warsaw`, także w dni 23- i 25-godzinne. Czas przedziałów liczony jest w sekundach UTC. Bieżąca doba kończy się w raporcie na granicy zebranego materiału.
- Żądanie ENGO zaczyna się na wiarygodnym zapisie z właściwym znacznikiem po ostatniej przerwie albo starcie Recorder. Kończy się na kolejnym stanie, niedostępności lub końcu sesji. Przy nieczystym zakończeniu sesji granicą jest ostatni zapis źródła. ON mierzy zapotrzebowanie regulatora. Czas bez danych nie wchodzi do udziału ON/OFF. Pełne odcinki mają potwierdzone przełączenie na obu końcach, bez luki między nimi. Dwa zapisy wywołane przez aktualizację stanu i atrybutów tej samej wiadomości są rozpoznawane po pełnym znaczniku źródłowym i kolejności.
- Pomiary pokojowe wykorzystują sygnał ukończonej synchronizacji mostka Setti+ i granicę świeżości 25 minut. Średnie są ważone czasem obserwacji. Równa średnia mieszkania oraz średnia powierzchniowa obejmują tylko wspólny czas pomiarów wszystkich sześciu pokoi. Zestawienie z progiem z migawki jest porównaniem do stałej referencji. Potwierdzoną historię progów można wczytać z udokumentowanych przedziałów w prywatnym `analityka/v1/cele-pokojowe.json`.
- Retrospektywne potwierdzenia nastawy CO są w prywatnym `analityka/v1/potwierdzenia-co.json`. Z wpisu z początkiem obowiązywania, datą potwierdzenia i wartością powstaje oddzielne źródło osi czasu. Dostępny zapis deklaracji z HA ma pierwszeństwo. Dzięki temu późniejsze wprowadzenie tej samej wartości nie jest wykazywane jako zmiana nastawy.
- Godzinowy model pogody opisuje godziny, dla których są dane. Liczba stopniodni to całka z `max(0, 21.5 − T_zewnętrzna)` liczona godzinowo i dzielona przez 24. Baza 21,5°C jest wspólną konwencją analityczną z aplikacją. Pokrycie jest podane odrębnie.
- Gaz jest wykazywany w pełnych rzeczywistych oknach. Dobowy wynik pojawia się, gdy istnieje ciąg pomiarów o dokładnych granicach doby. Wskaźnik m³/24 h to przeliczenie rzeczywistego okna. m³/stopniodzień wymaga kompletnego pokrycia okna pogodą. Dodatkowo należy uwzględniać CWU, wietrzenie i inne zdarzenia zapisane w dzienniku decyzji.
- Progi wyszukiwania kandydatów do porównań wynoszą 2°C różnicy średniej, 30% odległości między rozkładami czasu w przedziałach temperatury oraz 10% różnicy długości okresu. Wymagane pokrycie modelu to co najmniej 90% w porównaniach okresów i pełne pokrycie dla dopasowanych okien gazu. Progi służą do wybierania porównań. O wyniku decydują dane o nastawach, cieple we wszystkich pokojach, dostępności pomiarów oraz okolicznościach. Samo dopasowanie pogody pozostawia wynik nierozstrzygnięty.

## Powtórzenie po 28 listopada

Pobierz prywatną gałąź z partiami oraz aktualny prywatny `main` z dziennikiem. Na potrzeby powtarzalności zapisz skróty obu rewizji. Mając oba katalogi lokalnie, uruchom z repozytorium kodu:

```sh
python3 -B scripts/heating_report.py \
  --archive "$ARCHIWUM_PARTII" \
  --context-archive "$ARCHIWUM_DZIENNIKA" \
  --start 2026-11-21 --end 2026-11-28 \
  --against 2026-11-14 2026-11-21 \
  --output "$PRYWATNY_WYNIK"
```

Daty końcowe są wyłączne. Raport zestawia 14–20 i 21–27 listopada. Jeśli pierwszy okres ma zbyt słabe pokrycie, sprawdź dodatkowo krótsze okna o porównywalnej pogodzie i znanych nastawach. Oceń pokrycie wszystkich pokoi, wiarygodność celów komfortu oraz oba rzeczywiste końce okien gazowych. Zapisz w dzienniku decyzji także wynik nierozstrzygnięty. Dla raportu sporządzanego w trakcie doby użyj jawnego `--as-of` i tej samej rewizji źródeł.

Testy historycznej analizy i zapisów uruchamiamy poleceniem `python3 -B -m unittest discover -s tests -p '*_test.py'`. Testy korzystają z danych syntetycznych i imitacji odpowiedzi GitHuba.

## Rewizje godzinowej pogody ICON-EU

1. Godzina modelu jest przedziałem UTC od znacznika próbki do kolejnej pełnej godziny. Doba raportu ma granice północy w Europe/Warsaw. Eksporter żąda godzin GMT w sekundach epoki i sprawdza jednostki przed zapisem. Późny początek albo wczesny koniec raportu ogranicza uwzględniony czas. [Dokumentacja Open-Meteo Historical Forecast API](https://open-meteo.com/en/docs/historical-forecast-api).
2. Nowa partia z pogodą zawiera `weather_fetched_at`, czas odebrania odpowiedzi zapisany w UTC. Rozbieżne wartości jednego modelu wybiera się według najnowszego poprawnego pobrania. Temperatura musi być skończoną liczbą w °C w zakresie od −90 do 65 i mieć znacznik pełnej godziny mieszczący się w granicach partii.
3. Starsze partie mają granice obserwacji `since` i `until`. Do kolejności ich publikacji służy pierwsze dodanie niezmienionego pliku w historii pierwszego rodzica prywatnego Git. Jest to udokumentowana kolejność publikacji, przybliżenie kolejności pobrań. Sprzeczne wartości dodane w tym samym zapisie zostają nierozstrzygnięte. Jeśli nowe pobranie ma się rozstrzygnąć względem starszej wartości opublikowanej później niż to pobranie, rozbieżna godzina także pozostaje nierozstrzygnięta.
4. Gdy zgodne wartości powtórzono w kilku partiach, godzina wchodzi do obliczeń raz. Przy różnych wartościach i braku metadanych rozbieżna godzina pozostaje nieznana. Dla każdego wyboru raport JSON wskazuje partię, dostępną datę pobrania lub pierwszej publikacji i metodę. Godziny z rewizjami mają komplet poprawnych kandydatów. Nieprawidłowe wiersze, rzeczywiste braki i nierozstrzygnięte godziny są widoczne w audycie. Konflikty pomiarów HA i pomocnicza seria Met.no zachowują dotychczasowe reguły.

Indeks pierwszych publikacji wygeneruj z pełnego prywatnego checkoutu wskazującego przypiętą rewizję źródeł. Katalog wyjściowy musi należeć do prywatnego archiwum.

```sh
python3 -B scripts/heating_weather.py \
  --archive "$PRYWATNY_CHECKOUT" \
  --output "$PRYWATNY_CHECKOUT/analityka/v1/pogoda-pochodzenie-v1.json"
```

W indeksie są wyłącznie informacje o partiach wersji 1 i ich pierwszym pojawieniu się w prywatnym Git. Przed uruchomieniem nowego kodu harmonogramu indeks musi objąć starsze partie zapisane do chwili przełączenia. Raport wczytuje go z katalogu prywatnych danych kontekstowych. Nowe partie zapisują czas pobrania we własnym pliku, więc nie trzeba co przebieg odtwarzać indeksu. Pliki przed wdrożeniem i wcześniejsze zestawienia pozostają częścią historii. Komenda raportu wymaga pustej ścieżki plików wynikowych w nowym katalogu rewizji.

`Archive.weather_at` łączy znacznik zdarzenia z godziną UTC modelu, zwraca pochodzenie próbki i przesunięcie od początku godziny. Brak godziny pozostaje brakiem. Zestawienia średnich dla cykli ENGO i gazu tną przedziały pogody według rzeczywistych granic i podają liczbę obserwowanych sekund. Gaz w raporcie jest zaliczany według końcowego odczytu i pochodzi z pełnych okien tego samego gazomierza. Porównanie okien gazu i m³/stopniodzień wymagają pełnego pokrycia pogodą. Stopniodni są nadal liczone z bazą 21,5°C i dzielone przez 24 godziny, także przy zmianie czasu.
