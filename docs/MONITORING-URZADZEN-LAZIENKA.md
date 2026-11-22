# Odczytowy monitoring dodatkowych urządzeń grzewczych

Rozszerzenie korzysta z [istniejącego prywatnego archiwum](HISTORYCZNA-ANALIZA-OGRZEWANIA.md). Partia historii zachowuje schemat wersji 1. Do czasów Recorder, temperatur pokojowych, wilgotności, głowic i ENGO mogą dołączyć opcjonalne szeregi z potwierdzonych źródeł.

## Źródła i poziomy potwierdzenia

- Harmonogram i warunek wilgotności opisują plan. Wyzwolenie sceny i wysłanie polecenia to osobne informacje.
- Stan urządzenia oznacza potwierdzony stan przełącznika albo przekaźnika. Pobór mocy lub zweryfikowany odczyt grzałki ma własną serię.
- Jeżeli źródło zgłasza niedostępność, jej początek kończy ważność stanu. Przy przerwach Recorder nie odtwarza się stanu z poprzedniej sesji. Pusty szereg oznacza brak pokrycia.
- Przy odczycie logów aplikacji zapisuje się cały dostępny kontekst, pochodzenie i precyzję. Tylko widoczna para włączenie–wyłączenie tworzy przedział. Pozostały czas pozostaje nieznany. Sam stan przekaźnika opisuje zasilanie odbiornika.
- Temperatura zmierzona przez urządzenie i temperatura niezależnego czujnika pokojowego mają osobne źródła.

Zbiór `BATH_SERIES` w eksporterze zawiera klucze logiczne. Prywatna konfiguracja `entities` może mapować zweryfikowane encje i ich jednostki. Mapowanie jest jawne dla operatora, a kod nie zawiera identyfikatorów instalacji. Dla przekaźnika używa się `bath.dehumidifier.relay`, dla włączenia konwektora `bath.convector.enabled`. Sygnał `bath.convector.element` jest zarezerwowany dla potwierdzonego stanu elementu grzewczego. Serie `.available` mogą dodatkowo ograniczać czas ważności pozostałych obserwacji. Więcej źródeł można dołączyć po weryfikacji ich znaczenia oraz tego, że Recorder rejestruje przełączenia.

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
