# Plan wersji 1.9 — bezpieczna synchronizacja z Home Assistant

> **Status: historyczny plan z fazy projektowania v1.9.** Szyfrowany kanał HA został później uruchomiony; jego bieżący opis znajduje się w [architekturze systemu](JAK-DZIALA-SYSTEM-OGRZEWANIA.md) i [instrukcji integracji HA](INTEGRACJA-HA-SZYFROWANA-1-9.md). **20.11.2026** odrębnie wdrożono synchronizację odczytów **gazu** (nie HA) do prywatnego GitHuba przez Cloudflare Worker — [szczegóły](PRYWATNA-SYNCHRONIZACJA-GAZU.md). Poniższa lista jest historycznym projektem wymagań, nie aktualnym backlogiem.

## Cel

Zastąpić ręczny import danych, które Home Assistant już zbiera, synchronizacją **tylko do odczytu**. Zachować cały dotychczasowy dziennik gazu, liczniki kotła, decyzje, eksperymenty, pamięć projektu i raporty. Nie budować równoległej bazy o innych znaczeniach pomiarów.

## Stan rzeczywisty

- Aplikacja PWA z GitHub Pages pobiera już automatycznie *bieżące* wartości temperatury i wilgotności sześciu pokoi z `setti-data/pomiary.json`, a dane ośmiu głowic z `setti-data/glowice.json`. Publiczne pliki są migawkami, nie historią.
- `public/engo.js` importuje dotąd zdarzenia ON/OFF **ręcznie** z CSV; `public/temperatures.js` dotąd importuje prywatną historię temperatur z CSV Home Assistant.
- Home Assistant odbiera telemetrię ENGO i Setti+, a panel HA oblicza dzienne statystyki. Stan ENGO to **żądanie ogrzewania**, nie potwierdzona praca palnika.
- Elektronika BRÖTJE QWHC 20/24 nie jest potwierdzona jako podłączona do Tuya. Liczniki AC001, AC005 i AC006 nadal mają być odczytywane ręcznie; brak potwierdzonego API tych liczników.
- Repozytorium kodu i gałąź `setti-data` są **publiczne**, a dane historii temperatur, minutowych zdarzeń i gazu należy traktować jako prywatne.

## Projektowane źródła i odpowiedzialności

| Źródło | Dane | W aplikacji |
| --- | --- | --- |
| Setti+ / istniejący JSON | bieżące temperatury i wilgotność 6 pomieszczeń | pozostawić automatyczny odczyt |
| Setti+ / istniejący JSON | bieżące dane 8 głowic | pozostawić automatyczny odczyt |
| Home Assistant | historię zmian temperatur z czasem zdarzenia, identyfikatorem i jakością | automatyczny **prywatny** import przyrostowy |
| Home Assistant / ENGO Bridge | historię rzeczywistych zmian żądania ON/OFF z czasem zdarzenia | automatyczny **prywatny** import przyrostowy |
| Home Assistant | agregaty liczby cykli, czasu żądania ON, udziału i okna obserwacji | porównywać z historią i opisywać definicję okna |
| iPhone lokalnie | odczyty gazomierza, AC001/AC005/AC006, eksperymenty, decyzje i wiedza | **Stan późniejszy:** gazomierz pozostaje ręczny i lokalny, ale odczyty są również wysyłane do prywatnego GitHuba przez osobny Worker po włączeniu tej funkcji; reszta pozostaje lokalna |

## Kluczowa decyzja o transporcie przed implementacją

**Nie publikować** surowej historii Home Assistant jako otwartego JSON w publicznej gałęzi `setti-data` — nawet jeśli takie rozwiązanie technicznie byłoby najłatwiejsze.

PWA jest serwowana po HTTPS. Dostęp bezpośrednio do lokalnego Home Assistant po `http://192.168.x.x` może być blokowany w przeglądarce jako mieszana zawartość; potrzebny jest bezpieczny, potwierdzony kanał **HTTPS**, z kontrolą uprawnień i origin/CORS lub pośrednik ograniczony do odczytu. Nie umieszczać tokenów HA/Tuya/GitHub w kodzie ani publicznych plikach; token o szerokich uprawnieniach HA nie jest dobrym tokenem tylko do odczytu. Rozważyć dedykowany, uwierzytelniony serwis eksportu z wąskim zakresem danych, dostępny tylko dla iPhone'a, albo szyfrowany eksport klienta; ocenić koszt utrzymania i ryzyka. Wybór wymaga sprawdzenia obecnej konfiguracji Home Assistant/mostka i dostępu z iPhone'a, a nie zgadywania.

## Minimalne wymagania dla synchronizacji

1. **Wyłącznie odczyt**. Brak service call do `climate.*`, `switch.*`, `number.*`, kotła i głowic.
2. Pobierać pozycje ze znacznikiem czasu zdarzenia (ISO 8601 z offsetem lub UTC), nie czasem pobrania. Prawidłowo obsłużyć zmianę CET/CEST i niejednoznaczności.
3. Zapamiętywać punkt synchronizacji i deduplikować historyczne zdarzenia. Przy konflikcie zachować dane bez nadpisania i przedstawić użytkownikowi ostrzeżenie.
4. Import wcześniejszych plików CSV musi nadal działać, a powtarzający się pomiar z automatu nie może utworzyć drugiej kopii.
5. Przerwy transmisji, `unknown`, `unavailable` i niekompletne cykle oznaczać jawnie. Nie estymować pracy palnika ani objętości gazu ze stanów ENGO.
6. Zachować klucz `moje-ogrzewanie-data-v1` i obsłużyć stare kopie JSON. Nie przycinać istniejących archiwów. Dane lokalne nadal wymagają kopii bezpieczeństwa; osobny Worker synchronizuje tylko odczyty gazu (stan po wdrożeniu 19/20.11.2026).
7. Bieżące publiczne migawki Setti+ mogą nadal zasilać dashboard, ale historia prywatna ma pochodzić wyłącznie z zatwierdzonego kanału.
8. Rozdzielić **dane źródłowe**, **agregaty**, **oceny i hipotezy**; raport ChatGPT powinien zawierać zakres i kompletność.
9. Przed scaleniem: testy parserów, idempotentnego importu i zgodności kopii danych (`node --test tests/*.test.cjs`, `python3 scripts/check.py`, `python3 scripts/package.py`), przegląd bezpieczeństwa, test użytkownika na iPhonie.
10. Nie scalać do `main` i nie publikować aktualizacji bez wyraźnego zatwierdzenia.

## Etapowanie

- **1.9a**: weryfikacja bezpiecznego kanału, lista realnych encji HA oraz próbny, prywatny eksport małej paczki danych bez historii użytkownika w repo.
- **1.9b**: adapter i automatyczny przyrostowy import ENGO + temperatur; zachować ręczny CSV jako awaryjny.
- **1.9c**: powiązanie z analizą, jakością źródeł i raportem ChatGPT; kontrola działania na iPhonie.
