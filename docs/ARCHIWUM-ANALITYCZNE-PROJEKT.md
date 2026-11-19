# Projekt prywatnego archiwum analitycznego „Moje Ogrzewanie”

> **Status: historyczne założenia projektowe z 18.11.2026, uzupełnione o rzeczywisty stan na 20.11.2026.** Od tego dnia uruchomiono już prywatne repozytorium oraz synchronizację na MacBooku. **Aktualny opis działającej instalacji** znajduje się w [Jak działa cały system ogrzewania](JAK-DZIALA-SYSTEM-OGRZEWANIA.md). Treść poniżej zawiera historyczne propozycje i nie jest dokładnym schematem produkcyjnego JSON. **Prywatna synchronizacja gazomierza działa od 19/20.11.2026**; jej rzeczywiste pliki, role, ograniczenia i testy opisuje [oddzielna instrukcja](PRYWATNA-SYNCHRONIZACJA-GAZU.md). Dokument publiczny nie zawiera prywatnych pomiarów, faktur, adresów ani tokenów.

## 1. Cel i zasady nadrzędne

Archiwum ma wspierać roztropne zarządzanie powierzonym dobrem: zdrowiem, komfortem, mieszkaniem, energią i pieniędzmi. Źródła prawdy: [zasady projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md) oraz [baza wiedzy technicznej](BAZA-WIEDZY-TECHNICZNEJ.md).

Cele techniczne:
- Trwałość informacji niezależnie od historii czatu i pojedynczego iPhone'a.
- Odtwarzalne analizy: źródło, wersja danych, zakres, metoda, luki, niepewność i wynik eksperymentu.
- Rozdzielenie **źródeł oryginalnych**, **danych ustrukturyzowanych** i **wniosków**.
- Możliwość uprawnionego odczytu na żądanie, bez umieszczania haseł, faktur lub historii gospodarstwa w publicznym kodzie.

## Zrealizowane elementy po spisaniu pierwotnego planu

- Utworzono i zabezpieczono **prywatne** repozytorium `dszak/moje-ogrzewanie-archiwum`; część HA/iCloud jest synchronizowana z MacBooka, a jej indeks znajduje się w `meta/index.json`.
- Odrębnie uruchomiono synchronizację **ręcznych odczytów gazomierza** z iPhone'a przez Cloudflare Worker do prywatnego `sync/gazomierz-v1.json`. Na TV Bro odczyt prywatnej historii jest tylko do odczytu. Weryfikacja pierwszego wdrożenia: **12 odczytów i 12 zdarzeń**, w aplikacji TV **11 interwałów**.
- Dostęp ChatGPT jest możliwy **na żądanie** przez uprawnione połączenie GitHub, o ile działa w danej rozmowie; nie jest to autonomiczny monitoring.
- Odczyty gazu w prywatnym `sync/gazomierz-v1.json` stanowią **dziennik zdarzeń**, nie schemat przykładowego wiersza `meter_id/value_m3` opisany niżej. `meta/index.json` może nie wymieniać pliku `sync/`; analizując gaz, otwórz go bezpośrednio.
- **Nadal nieuzyskane:** automatyczne pobieranie faktur ORLEN i synchronizacja wszystkich prywatnych ustawień i wiedzy z iPhone'a.

## 2. Źródła i granice automatyzacji

| Źródło | Zakres | Status/uwaga |
|---|---|---|
| Home Assistant (Setti+, ENGO) | Zmiany temperatur i zgłoszenia żądania ciepła | Istnieje eksport zaszyfrowany; aktualnie nie jest to automatyczny dostęp ChatGPT do jawnych danych |
| Głowice TRV i czujniki pokojowe | Zmierzona i zadana temperatura, ewentualnie stan zaworu i %RH | Zapisać, które pola są rzeczywiście dostępne, ich jakość i częstotliwość |
| Gazomierz | Ręczne odczyty z datą/godziną, identyfikator licznika, zmiana licznika | Wpisy i zdjęcia nie dowodzą ciągłego pomiaru |
| ORLEN | Oryginalne PDF, faktury, taryfy, rozliczenie energii, opłaty i przedpłaty | Brak potwierdzonego automatycznego API do pobierania faktur; pozyskanie może pozostać ręczne |
| Pogoda | Godzinowe temperatury i inne warunki z opisanym źródłem | Dane modelowe != lokalna stacja |
| Dziennik decyzji | Nastawy, lokalizacja czujników, eksperymenty, komfort, wilgotność, wietrzenie | Zmiana nastawy nie jest automatycznie dowodem poprawy |

## 3. Proponowana struktura *prywatnego* magazynu

```text
Moje Ogrzewanie — prywatna baza/
  README-PRYWATNE.md
  karta-instalacji.json
  historia-decyzji.jsonl
  eksperymenty.jsonl
  raw/
    orlen/faktury/          # oryginalne PDF, prywatne
    orlen/odczyty/          # fotografie / eksporty ORLEN
    ha/                     # eksporty z kontrolą źródła i kompletności
  curated/
    faktury.json
    odczyty-gazomierzy.json
    wplaty-i-salda.json
    temperatura-i-wilgotnosc.jsonl
    engo.jsonl
    nastawy.jsonl
    pogoda.jsonl
  audits/
    kontrola-kompletnosci.json
    rejestr-korekt.jsonl
```

**Lokalizacja startowa:** prywatny folder iCloud Drive kontrolowany przez użytkownika (nie publiczne GitHub Pages). Dalsza opcja: osobne repozytorium **private** z ściśle ograniczonym dostępem tylko do niezbędnych danych. To **historyczny wariant projektu**. Od 18.11.2026 prywatne repozytorium już istnieje, ale połączenie GitHub musi być weryfikowane w każdej nowej rozmowie.

## 4. Minimalne kontrakty danych (propozycja)

Wszystkie rekordy: `schema_version`, `source`, `imported_at`, `record_id`, `confidence` i sygnatura czasu `Europe/Warsaw` wraz z jednoznacznym znacznikiem UTC, jeśli występuje.

### Odczyt gazu

**Uwaga: niżej jest przykładowy kontrakt koncepcyjny z pierwotnego projektu, nie rzeczywisty format produkcyjny.** Wdrożony Worker zapisuje w `sync/gazomierz-v1.json` obiekt `{"schema_version":1,"events":[...]}`, gdzie zdarzenie ma `id`, `record_id`, `op` (`upsert`/`delete`), `at`, a przy `upsert` także `reading: {at,gas,meter,source}`. Pola `meter` rozróżniają `old`/`new`. Nie wrzucać tej prywatnej zawartości do publicznego repo.

```json
{"schema_version":1,"record_id":"reading-example","at":"2026-11-18T08:00:00+01:00","meter_id":"meter-b","value_m3":123.456,"read_type":"manual","source":"gas-meter-photo","confidence":"user-confirmed"}
```

`meter_id` ma rozdzielać serie przy wymianie licznika; nie odejmować wskazań różnych liczników. Założenie wiersza **przykładowego**, nie prawdziwego odczytu.

### Faktura / rozrachunki

```json
{"schema_version":1,"record_id":"invoice-example","period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD","issue_date":"YYYY-MM-DD","volume_m3":null,"energy_kwh":null,"fuel_net_pln":null,"distribution_variable_net_pln":null,"distribution_fixed_net_pln":null,"subscription_net_pln":null,"vat_pln":null,"gross_pln":null,"due_pln":null,"source_pdf":"private-relative-path","is_correction":false}
```

Osobne rejestry: `payments` (faktyczne wpłaty, bank/ORLEN, ich potwierdzenie), `account_balances` (saldo z datą). Przy sumowaniu wykluczać podwójne ujęcie faktur i korekt. Zachować odpowiedni przedział rozliczeniowy; suma kwot faktur wystawionych w roku nie oznacza kosztu kalendarzowego roku.

### Zdarzenie ENGO i wynik eksperymentu

```json
{"schema_version":1,"record_id":"engo-example","at_utc":"YYYY-MM-DDTHH:mm:ssZ","state":"on","means":"thermostat-call-for-heat","source":"home-assistant"}
```

```json
{"schema_version":1,"experiment_id":"EXP-0001","hypothesis":"...","baseline":"...","single_change":"...","weather_and_disturbances":"...","safety_stop":"...","success_criteria":"...","result":"inconclusive","confidence":"low","decision":"collect-more-data"}
```

Nie przypisywać okresom bez zdarzeń wymyślonego stanu. Konieczne są flagi ciągłości i kompletności obserwacji.

## 5. Ochrona prywatności i dostęp ChatGPT

1. **Nigdy nie wgrywać** prywatnych danych do publicznego repozytorium ani publicznego adresu GitHub Pages. Nie kopiować haseł Home Assistant, GitHuba ani hasła archiwum do dokumentów, kodu czy czatu.
2. Zaszyfrowany plik na GitHubie chroni treść, ale sam z siebie nie daje asystentowi możliwości analizowania: do tego potrzebny jest autoryzowany sposób odszyfrowania/przekazania wyników lub bezpieczna usługa tylko do odczytu.
3. **Wariant początkowy (historyczny):** użytkownik udostępniał eksporty iCloud w rozmowie. Obecnie część danych synchronizuje MacBook, a gaz z iPhone'a — oddzielny Worker. Nie oznacza to synchronizacji całego iCloud ani lokalnej pamięci PWA.
4. **Częściowo zrealizowane:** prywatne repozytorium i dostęp na żądanie przez uprawnione połączenie GitHub; TV ma osobny klucz tylko do odczytu. Pozostają: okresowy audyt uprawnień, rotacja/revokacja kluczy, kontrola przyszłych wdrożeń Workera oraz plan retencji i monitorowania błędów.
5. Nie umieszczać w systemach integracyjnych niepotrzebnych danych osobowych z PDF; oryginały pozostają w osobnej prywatnej lokalizacji.

## 6. Kontrola jakości i kolejność wdrożenia

1. **Inwentaryzacja i walidacja archiwum ORLEN:** faktury, odczyty, podział liczników, ciągłość okresów, korekty, zgodność kosztów i ilości; zachować pochodzenie każdego pola.
2. **Karta instalacji:** układ pokoi i grzejników, lokalizacja ENGO, sześć sensorów, stan docieplenia i osuszania, bieżące nastawy z datą obowiązywania. Rozróżniać wartości zmierzone, ręcznie wpisane i nieznane.
3. **Pomiary i znaczniki jakości:** cykle ENGO, temperatura, wilgotność, gaz, pogoda; luki, zmiana czasu, kompletność dobowa, jednostki i pola źródłowe.
4. **Zapis decyzji i eksperymentów:** nie nadpisywać historii, przechowywać też próby nieudane i nierozstrzygnięte. Import wniosków z ChatGPT tylko po podglądzie i zatwierdzeniu przez użytkownika.
5. **Bezpieczny dostęp na żądanie:** wybrać i przetestować wariant prywatny, uprawnienia, odtwarzanie i kopie bezpieczeństwa, dopiero potem automatyzować.
6. **Analiza wpływu na koszty:** porównywać pogodowo znormalizowane zużycie i komfort oraz identyfikować wkład c.w.u. Nie wyciągać wniosków o oszczędnościach z samego czasu ENGO.

## 7. Kryterium gotowości

Archiwum jest gotowe do analiz dopiero gdy można: (a) wskazać źródło i zakres dowolnej liczby; (b) odtworzyć dane mimo wymiany licznika; (c) określić luki ENGO i pogody; (d) oddzielić zużycie, koszt, przelewy i saldo; (e) odzyskać historię doświadczeń; (f) bezpiecznie odczytać potrzebny zakres danych **bez** udostępniania sekretów.
