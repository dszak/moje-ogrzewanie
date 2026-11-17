# Moje Ogrzewanie v1.9 — szyfrowana historia Home Assistant

**Status:** gałąź testowa. Dopóki eksportera nie skonfigurowano, na iPhonie nic nowego nie synchronizuje się automatycznie. Nie publikować do `main` bez zgody właściciela i przejścia testów.

## Co daje wersja 1.9

Zachowuje działające automatyczne migawki sześciu czujników Setti+ i ośmiu głowic TRV oraz dodaje szyfrowany kanał dla **historii sześciu temperatur** i **zmian żądania ogrzewania ENGO**. Nie steruje piecem, termostatem ani głowicami. Ręczne CSV pozostaje dostępne jako procedura awaryjna. Ręczne dane gazu, liczniki AC001/AC005/AC006, eksperymenty i rejestr wiedzy pozostają prywatne i zachowane.

### Architektura

```text
ENGO / Setti+ -> Home Assistant (Recorder)
                -> scripts/ha-history-export.mjs (na zaufanym hoście)
                -> AES-256-GCM + PBKDF2-SHA256
                -> github.com/.../setti-data/ha-historia.enc.json [tylko szyfrogram]
                -> iPhone: PWA, Web Crypto + klucz na urządzeniu
                -> historia ENGO i temperatur w lokalnym DataStore
```

GitHub jest publiczny, dlatego **nie wolno** wgrywać jawnej historii, haseł, tokenów HA, dokładnego adresu ani osobistych notatek do gałęzi `setti-data`. Szyfrogram i metadane jego aktualizacji są publiczne. Hasło archiwum powinno być unikalne, długie (minimum 16, zalecane co najmniej 24 losowe znaki) i nie może być hasłem do konta.

## Co trzeba skonfigurować na zaufanym hoście z dostępem do HA

1. Node.js 22; uruchamiany plik `scripts/ha-history-export.mjs` z gałęzi nowej wersji aplikacji.
2. Lokalny lub bezpieczny adres `HA_URL` instancji Home Assistant oraz osobny, chroniony `HA_TOKEN` do API historii HA. Token nie trafia do iPhone'a, kodu publicznego, logów ani GitHub.
3. Token GitHub `GITHUB_TOKEN` ograniczony do repozytorium `dszak/moje-ogrzewanie` i uprawnienia **Contents: Read and write**. Nie umieszczać go w aplikacji na telefonie.
4. Unikalna fraza `HA_HISTORY_PASSPHRASE`. Ta sama fraza zostanie **raz** wpisana na iPhonie w zakładce **Cykle ENGO** i zamieniona w klucz nieeksportowalny przechowywany lokalnie przez IndexedDB.
5. Opcjonalne `HA_DAYS=3` (1–14 dni): ile ostatnich dni historii pobrać przy każdym wykonaniu. Eksporter łączy je z wcześniej odszyfrowanym archiwum, usuwa powtórzenia i nie przycina starych danych.

W zaufanej powłoce z ustawionymi powyższymi zmiennymi uruchomić:

```sh
node scripts/ha-history-export.mjs
```

Skrypt sam tworzy albo uzupełnia zaszyfrowany plik `ha-historia.enc.json` w `setti-data`. **Nie uruchamiać**, dopóki tokeny i hasło nie zostały ustawione w bezpiecznym magazynie sekretów. Nie podawać ich w argumentach komendy (mogą trafić do historii powłoki). Kontrola `HA_URL` wymaga HTTPS lub lokalnego `localhost`. Dla prywatnej sieci lokalnej (adresy 192.168/10/172.16–31 lub `.local`) można jawnie ustawić `HA_ALLOW_LAN_HTTP=1`, ale token HA będzie wtedy przesyłany po HTTP, co zmniejsza bezpieczeństwo; HTTPS jest preferowany.

### Automatyczne wykonywanie

Należy **osobno** skonfigurować harmonogram uruchamiania skryptu na tym hoście (np. co 15–30 minut, w zależności od obciążenia), tak by działał także wtedy, kiedy telefon jest wyłączony. Sam commit w GitHubie nie uruchamia skryptu na komputerze z Home Assistant. Należy również zweryfikować retencję `Recorder`: po dłuższej przerwie niż okres retencji mogą wystąpić nieodwracalne luki. iPhone odświeża archiwum podczas działania aplikacji, nie jest to ciągła praca w tle iOS.

## Włączanie na iPhonie

Po opublikowaniu przetestowanej wersji i **po powstaniu zaszyfrowanego pliku** otwórz **Cykle ENGO → Historia automatyczna — Home Assistant**, wpisz frazę eksportera i wybierz **Połącz prywatną historię**. Aplikacja odszyfruje dane w telefonie, sprawdzi je i dopisze tylko nowe wpisy. Klucz jest przechowywany jako nieeksportowalny `CryptoKey` w IndexedDB origin aplikacji, dzięki czemu kolejny odczyt może następować bez ponownego wpisywania frazy. Tryb prywatny i czyszczenie danych Safari mogą usunąć klucz; historie lokalne są osobną częścią kopii JSON.

Przycisk **Zapomnij klucz na tym urządzeniu** usuwa dostęp do przyszłych szyfrowanych aktualizacji, ale **nie usuwa historii już zapisanej w aplikacji**. W razie niezgodności danych, błędnego szyfrogramu, utraty sieci, braku miejsca lub konfliktu wartości aktualizacja jest przerywana bez częściowego zapisu. Nic nie jest wymazywane ani nadpisywane automatycznie.

## Precyzja i ograniczenia

- ENGO ON/OFF jest **zapotrzebowaniem termostatu**, nigdy dowodem, że palnik kotła pracuje. Statystyki z aplikacji nadal liczą tylko pełne pary, a niektóre różnice definicji okresów HA i iPhone'a mogą dać różne procenty.
- Eksporter czyta `last_changed`, a dane HA mogą odzwierciedlać rejestrację zmian, nie każdą próbkę z fizycznego czujnika. `unknown` i `unavailable` są pomijane, ale nie wolno udawać ciągłości w lukach.
- Starsze ręczne wpisy ENGO mają rozdzielczość minutową. W razie sprzecznych stanów w tej samej minucie synchronizacja jawnie zgłasza konflikt zamiast zgadywać.
- Historia temperatur w bieżącym lokalnym schemacie jest ograniczona do 25 000 zmian. Po dojściu do limitu należy wykonać kopię i zaplanować rozszerzenie modelu; **żadna historia nie jest kasowana automatycznie**.
- GitHub nie otrzymuje danych gazu, liczników kotła ani prywatnej pamięci projektu.
- Wypchnięcie poprawki w gałęzi nie oznacza publikacji na Pages. Przed scaleniem uruchomić `node --test tests/*.test.cjs`, `python3 scripts/check.py`, `python3 scripts/package.py`, przetestować iPhone'a i uzyskać zgodę na wdrożenie.
