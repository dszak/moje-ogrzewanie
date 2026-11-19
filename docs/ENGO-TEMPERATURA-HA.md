# Temperatura ENGO z Home Assistant — odczyt i eksport

**Status na 19.11.2026:** **lokalny eksporter na MacBooku działa** i zapisał zweryfikowane próbki `engo_readings`; prywatne archiwum zawiera jawne, udostępnione uprawnionym odbiorcom próbki. **Zmiany publicznego kodu iPhone/PWA pozostają w PR #23 (nie scalone z `main`, niepotwierdzone wdrożenie na telefonie).**

## Źródło pomiaru

- Istniejąca encja Home Assistant: `climate.wireless_internet_thermostat_wi_fi`.
- Temperatura zmierzona: atrybut `current_temperature`.
- Temperatura zadana: atrybut `temperature`.
- Weryfikacja ręczna w szablonie HA (19 listopada 2026): obie wartości 22,0°C.
- Niezależny czujnik Setti+ w sypialni pokazywał w tym okresie około 21,6°C; położenie czujników jest różne. Różnicy nie traktować automatycznie jako błędu kalibracji.

## Sposób działania i zakres propozycji kodu

Eksporter `scripts/ha-history-export.mjs` korzysta z **tego samego istniejącego tokenu Home Assistant**. Oprócz dotychczasowej historii ENGO ON/OFF i czujników pokojowych wykonuje jedno zapytanie GET `/api/states/climate.wireless_internet_thermostat_wi_fi` i dołącza próbkę `engo_readings` do **już szyfrowanego** pliku `ha-historia.enc.json`.

Każda próbka ma `at` (czas odczytu przez eksporter), `temp` (temperatura mierzona), `target` (temperatura zadana, jeśli dostępna) i `source_updated_at` (ostatnia aktualizacja według HA). To **odczyt okresowy**, zgodny z harmonogramem eksportera (około 30 minut), a nie ciągły pomiar i nie historia wszystkich zmian termostatu.

- Brak próbki z encji ENGO nie zatrzymuje dotychczasowego eksportu; pojawia się tylko ostrzeżenie.
- Nie ma wywołań zmieniających nastawy ani dodatkowej sesji Tuya.
- Historia `engo_readings` jest szyfrowana AES-256-GCM razem z resztą historii. Nie publikować jej w postaci jawnego JSON.
- Stare archiwa bez `engo_readings` pozostają obsługiwane.
- Aplikacja na iPhonie pokaże najnowszą odszyfrowaną próbkę, jeśli od zapisu upłynęło nie więcej niż 75 minut; w pozostałych przypadkach zachowa ręczny odczyt z dziennika. Nigdy nie nadpisuje ręcznych danych.
- `source_updated_at` może być starszy niż `at`: nie wolno opisywać próbki jako pomiaru w czasie rzeczywistym.

## Ograniczenia i dalsze prace

**Etap prywatnego repozytorium został już wdrożony lokalnie i zweryfikowany**: skrypt synchronizujący dzieli odszyfrowane próbki na pliki `ha/engo-pomiary/YYYY-MM-DD.json`, a indeks zawiera pole `engo_temperature_readings`. ChatGPT ma dostęp do tych jawnych plików **tylko przez autoryzowane połączenie do prywatnego repozytorium i tylko na żądanie**, nie w tle. Sam zaszyfrowany eksport na publicznej gałęzi nie daje dostępu do odczytów.

**Wykonano 19.11.2026:** pełne testy `node --test tests/*.test.cjs` (86/86), `scripts/check.py` i przygotowanie pakietu; zweryfikowano zgodność pliku lokalnego z bazą, wykonano kopię zapasową, uruchomiono faktyczny eksport z diagnostyką oraz synchronizację prywatnego archiwum. W prywatnym pliku potwierdzono próbki ENGO i zachowanie dotychczasowych zdarzeń ON/OFF oraz temperatur SETTI+. **Nie wykonano ani nie potwierdzono testu rzeczywistej aplikacji PWA na iPhonie.**

**Do zrobienia:** osobno przejrzeć i zatwierdzić PR #23 przed scaleniem/wydaniem aplikacji, sprawdzić PWA na urządzeniu, kontrolować świeżość `source_updated_at` i zachować kopie zapasowe skryptów lokalnych. Nie traktować samego `at` jako dowodu świeżości źródłowej temperatury.
