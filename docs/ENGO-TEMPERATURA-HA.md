# Temperatura ENGO z Home Assistant — odczyt i eksport

**Status:** propozycja do przeglądu. Nie jest wdrożona na MacBooku ani opublikowana w `main`.

## Źródło pomiaru

- Istniejąca encja Home Assistant: `climate.wireless_internet_thermostat_wi_fi`.
- Temperatura zmierzona: atrybut `current_temperature`.
- Temperatura zadana: atrybut `temperature`.
- Weryfikacja ręczna w szablonie HA (19 listopada 2026): obie wartości 22,0°C.
- Niezależny czujnik Setti+ w sypialni pokazywał w tym okresie około 21,6°C; położenie czujników jest różne. Różnicy nie traktować automatycznie jako błędu kalibracji.

## Co dodaje propozycja

Eksporter `scripts/ha-history-export.mjs` korzysta z **tego samego istniejącego tokenu Home Assistant**. Oprócz dotychczasowej historii ENGO ON/OFF i czujników pokojowych wykonuje jedno zapytanie GET `/api/states/climate.wireless_internet_thermostat_wi_fi` i dołącza próbkę `engo_readings` do **już szyfrowanego** pliku `ha-historia.enc.json`.

Każda próbka ma `at` (czas odczytu przez eksporter), `temp` (temperatura mierzona), `target` (temperatura zadana, jeśli dostępna) i `source_updated_at` (ostatnia aktualizacja według HA). To **odczyt okresowy**, zgodny z harmonogramem eksportera (około 30 minut), a nie ciągły pomiar i nie historia wszystkich zmian termostatu.

- Brak próbki z encji ENGO nie zatrzymuje dotychczasowego eksportu; pojawia się tylko ostrzeżenie.
- Nie ma wywołań zmieniających nastawy ani dodatkowej sesji Tuya.
- Historia `engo_readings` jest szyfrowana AES-256-GCM razem z resztą historii. Nie publikować jej w postaci jawnego JSON.
- Stare archiwa bez `engo_readings` pozostają obsługiwane.
- Aplikacja na iPhonie pokaże najnowszą odszyfrowaną próbkę, jeśli od zapisu upłynęło nie więcej niż 75 minut; w pozostałych przypadkach zachowa ręczny odczyt z dziennika. Nigdy nie nadpisuje ręcznych danych.
- `source_updated_at` może być starszy niż `at`: nie wolno opisywać próbki jako pomiaru w czasie rzeczywistym.

## Ograniczenia i dalsze prace

Prywatne repozytorium analityczne jest oddzielnym etapem. Jego lokalne zadanie synchronizujące musi zostać dostosowane, aby udostępniać odczyty ENGO ChatGPT przez prywatne pliki — **sam zaszyfrowany eksport nie daje asystentowi jawnego odczytu**.

Przed wdrożeniem: przetestować `node --test tests/ha-sync.test.cjs` i cały zestaw testów, skontrolować istniejący stan skryptu na MacBooku i wykonać kopię. Wdrożyć dopiero po świadomym zatwierdzeniu. Po wdrożeniu potwierdzić, że prywatny plik zawiera nowe odczyty, dotychczasowe ON/OFF nie zniknęły, a aplikacja nie pokazuje starej wartości jako aktualnej.
