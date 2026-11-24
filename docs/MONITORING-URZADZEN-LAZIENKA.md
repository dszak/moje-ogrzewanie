# Odczytowy monitoring dodatkowych urządzeń grzewczych

Rozszerzenie korzysta z [istniejącego prywatnego archiwum](HISTORYCZNA-ANALIZA-OGRZEWANIA.md). Partia historii zachowuje schemat wersji 1. Do czasów Recorder, temperatur pokojowych, wilgotności, głowic i ENGO mogą dołączyć opcjonalne szeregi z potwierdzonych źródeł.

## Aktualne wyposażenie

| Pomieszczenie | Osuszacz Equation | Dane znamionowe | Źródła odczytów |
| --- | --- | --- | --- |
| Mała łazienka | OL12-BD031M | Maks. 200 W, 220–240 V / 50 Hz, R290 0,05 kg. Wydajność niepotwierdzona. | Gniazdko Setti+ i niezależny czujnik temperatury i wilgotności Setti+ |
| Duża łazienka | D015B-12L | 280 W, 220–240 V / 50 Hz, R290 0,046 kg. 12 l/24 h przy 30°C i 80% RH. | Gniazdko Setti+ SP301 i niezależny czujnik temperatury i wilgotności Setti+ |

Modele i dane znamionowe zostały potwierdzone z tabliczek przez użytkownika 23.11.2026. W dużej łazience istniejące sceny Setti+ sterują gniazdkiem na podstawie wilgotności. Karta małej łazienki nadal pokazuje oddzielnie konwektor SCH700 i głowicę G1.

Niezależne obserwacje z tego samego mostka Setti+ są przypisane po potwierdzonych tożsamościach gniazdek. Przekaźnik jest binarny, a chwilowa moc z DP19 jest normalizowana do W. Jej skala odpowiada wzorcowi gniazdka Tuya i została sprawdzona podczas naturalnego włączenia gniazdka dużej łazienki. Mapowanie zachowuje dotychczasowe serie małej łazienki. [Definicje funkcji Tuya](https://developer.tuya.com/en/docs/iot/product-standard-function-introduction?id=K9tp15ceh63gr) · [Dokumentacja Setti+ SP301](https://setti.pl/produkty/sterowanie/gniazdka/inteligentne-gniazdko-sp301-smart)

## Źródła i poziomy potwierdzenia

- Harmonogram i warunek wilgotności opisują plan. Wyzwolenie sceny i wysłanie polecenia to osobne informacje.
- Stan urządzenia oznacza potwierdzony stan przełącznika albo przekaźnika. Pobór mocy lub zweryfikowany odczyt grzałki ma własną serię.
- Jeżeli źródło zgłasza niedostępność, jej początek kończy ważność stanu. Przy przerwach Recorder nie odtwarza się stanu z poprzedniej sesji. Pusty szereg oznacza brak pokrycia.
- Przy odczycie logów aplikacji zapisuje się cały dostępny kontekst, pochodzenie i precyzję. Tylko widoczna para włączenie–wyłączenie tworzy przedział. Pozostały czas pozostaje nieznany. Sam stan przekaźnika opisuje zasilanie odbiornika.
- Temperatura zmierzona przez urządzenie i temperatura niezależnego czujnika pokojowego mają osobne źródła.

Zbiór `BATH_SERIES` w eksporterze zawiera klucze logiczne. Prywatna konfiguracja `entities` może mapować zweryfikowane encje i ich jednostki. Mapowanie jest jawne dla operatora, a kod nie zawiera identyfikatorów instalacji. Dla przekaźników używa się `bath.dehumidifier.relay` (mała łazienka) i `bath.bigbath.dehumidifier.relay` (duża łazienka). Moc ma klucz `power_w` w tym samym obiekcie. Dla włączenia konwektora używa się `bath.convector.enabled`. Sygnał `bath.convector.element` jest zarezerwowany dla potwierdzonego stanu elementu grzewczego. Serie `.available` mogą dodatkowo ograniczać czas ważności pozostałych obserwacji. Więcej źródeł można dołączyć po weryfikacji ich znaczenia oraz tego, że Recorder rejestruje przełączenia.

## Energia i okresy porównawcze

- Seria `.power_w` normalizuje W lub kW do watów. Seria `.energy_total_kwh` przyjmuje potwierdzony licznik narastający, a `.energy_day_kwh` potwierdzony licznik dobowy. Dopuszczalne wartości energii w Wh i kWh są normalizowane do kWh.
- Wskazanie licznika dobowego jest punktem w danym dniu strefy Europe/Warsaw. Najnowszy zapis zastępuje wcześniejszy w zestawieniu dnia, a brak odczytu na końcu doby pozostawia dobę częściową. Wartości narastających obserwacji dziennych nie sumuje się.
- Różnice licznika narastającego używają kolejnych prawidłowych obserwacji w tej samej sesji i dostępności. Spadek wartości, luka lub nieznany stan przerywają obliczenie. Raport podaje pokrycie obliczonych różnic.
- Analiza skrzyżowana ENGO, konwektora i przekaźnika wymaga trzech znanych stanów. Pokazuje także pokrycie temperatury pokojowej, wilgotności i pogody dla każdej kategorii. Pozostały czas jest nieznany.
- W oknach wilgotności raport zestawia %RH z obliczoną wilgotnością bezwzględną i punktem rosy. To szacunek stanu lokalnego powietrza, który nie mierzy masy wody usuniętej przez urządzenie.

Obserwacje ręczne i wyniki należą do prywatnego repozytorium. Wejściowy plik wersji 1 zawiera `source: app_log_excerpt`, listę `relay_events` z polami `at` i `state` oraz opcjonalną listę `daily_energy`. Znaczniki czasu wymagają informacji o strefie. Raport da się odtworzyć z katalogu istniejącego archiwum.

```sh
python3 -B scripts/bathroom_report.py \
  --archive "$PRYWATNE_ARCHIWUM" --observations "$PRYWATNE_OBSERWACJE" \
  --start "$DATA_OD" --end "$DATA_DO_WYŁĄCZNA"
```

Przed włączeniem mapowania należy potwierdzić urządzenie, jednostkę, sens stanu, zachowanie licznika przy restarcie i obserwacje w Recorder bez zdalnego przełączania. Dostępność funkcji Matter zależy od modelu i oprogramowania urządzenia. Kod parowania, zrzuty z aplikacji oraz dane dostępowe pozostają poza repozytoriami. [Home Assistant Matter](https://www.home-assistant.io/integrations/matter/) · [Energia w standardzie Matter](https://csa-iot.org/newsroom/matter-1-3-specification-released/)


## Odczyty w aplikacji

Aplikacja może pobierać opcjonalny fragment `bathrooms` z istniejącej koperty zaszyfrowanej AES-256-GCM. Wersja wcześniejsza nadal pobiera bieżącą migawkę małej łazienki z `dashboard.bath`. Wersja z nowymi kartami korzysta z oznaczonych pokojem odczytów `bathrooms`. W razie braku nowej serii małej łazienki karta zachowuje dotychczasową migawkę gniazdka. Eksporter korzysta z tej samej prywatnej mapy encji, co archiwum. Ciągła historia odkładana jest w dotychczasowym prywatnym archiwum, a okno aplikacji obejmuje do 14 ostatnich dni.

Wykresy pokazują odczytane punkty i przerywają linię przy niedostępności lub zbyt dużym odstępie. Stany zasilania i energia są liczone w przedziałach pomiędzy wiarygodnymi odczytami, z maksymalnym odstępem 12 min. Przy braku zweryfikowanego licznika energia może być szacowana z mocy metodą trapezów. Przy wyniku widoczny jest czas pokryty obliczeniem. Czas zasilania pozostawia poza wynikiem przerwy i przedziały, w których przekaźnik zmienił stan między odczytami. Przebieg wilgotności przed i po włączeniu wymaga próbki z ostatnich 30 minut przed pierwszym odczytem ON, zarejestrowanej najpóźniej przy ostatnim potwierdzonym OFF i próbki z następnych 30–60 minut przy ciągłości obserwowanego zasilania. Wartości te nie określają ilości odprowadzonej wody ani same w sobie przyczyny zmian.

Dla żadnego z dwóch gniazdek nie potwierdzono jeszcze dostępnego w Home Assistant licznika narastającego kWh. Praca sprężarki nie ma bezpośredniego odczytu. Historia dużej łazienki zaczyna się od dołączenia gniazdka do mostka i rośnie wraz z kolejnymi odczytami.
