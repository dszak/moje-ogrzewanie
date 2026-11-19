# Prywatna synchronizacja odczytów gazu — wdrożenie etapowe

**Status: przygotowany kod serwera i testy, nieuruchomiony na produkcji.** Nie istnieje jeszcze URL bramki z prawdziwymi sekretami; bieżąca aplikacja **nadal zapisuje odczyty gazu lokalnie na iPhonie**. Nie wolno opisywać tej funkcji jako aktywnej, dopóki nie przejdzie testu z iPhone'a, prywatnego GitHuba i Sony Bravia.

Powiązane zadanie: [#26](https://github.com/dszak/moje-ogrzewanie/issues/26). Nie scalać PR ani nie instalować serwera bez potwierdzenia, że zachowano kopię dotychczasowej lokalnej historii.

## 1. Po co oddzielny serwer?

Publiczna aplikacja GitHub Pages **nie może zawierać tokenu GitHub z prawem zapisu**. Nie powinna także umieszczać w ogólnodostępnej gałęzi \`setti-data\` jawnej historii używania gazu — seria odczytów może pośrednio zdradzać rutynę dnia i okresy nieobecności.

Dlatego przewidziano małą bramkę HTTPS (Cloudflare Worker) pomiędzy aplikacją PWA a istniejącym **prywatnym** repozytorium \`dszak/moje-ogrzewanie-archiwum\`.

\`\`\`text
iPhone (zapis lokalny + kolejka wysyłki)
   |
   | HTTPS + dedykowany klucz do zapisu (nie GitHub PAT)
   v
Bramka HTTPS (Worker) — walidacja i autoryzacja
   |
   | token GitHub ograniczony tylko do archiwum; sekret serwera
   v
Prywatne repozytorium GitHub:
  sync/gazomierz-v1.json  (historia zdarzeń)
   |                           |
   v                           v
Sony Bravia (odczyt)        ChatGPT (GitHub connector na żądanie)
   |
   +-- rozdzielny klucz tylko do odczytu
\`\`\`

Bramka nie steruje kotłem, ENGO ani głowicami. Nie zależy od tego, czy MacBook i maszyna HA są włączone. **Istniejące szyfrowane archiwum HA pozostaje osobne**; nie należy używać jego hasła jako hasła do serwera synchronizacji.

## 2. Co jest obecnie zaimplementowane w gałęzi roboczej?

- \`sync-worker/worker.mjs\`: API \`GET /v1/gas\` i \`POST /v1/gas\`.
- Oddzielne klucze **tylko do odczytu** i **do zapisu**, na serwerze przechowywane wyłącznie jako skróty SHA-256 (nie publicznie).
- Serwerowy token GitHub jako sekret środowiskowy; ograniczenie celu do jednego **prywatnego** repozytorium i jednego pliku.
- Kontrola pochodzenia żądań przeglądarki, CORS, walidacja rekordów, limity liczby zdarzeń, brak danych w URL, brak cache.
- Idempotentny dopis zdarzeń, zapis korekt oraz usunięć (tombstone), ponowienie po konflikcie zapisu GitHub. Brak modyfikacji innych plików archiwum.
- Testy w \`tests/gas-sync.test.cjs\` bez prawdziwych danych i bez dostępu do realnego GitHuba.

**Nie ma jeszcze** ekranu parowania w iPhonie/TV, kolejki offline ani faktycznie działającego serwera. Bez tego nic nie synchronizuje się automatycznie.

## 3. Uruchomienie usługi — wymagane oddzielnie

Wymaga własnego konta usługi uruchamiającej Worker (np. Cloudflare), odpowiedniej konfiguracji HTTPS i sekretów — nie jest możliwe skonfigurowanie tego samym commitem do repozytorium GitHub.

1. Utworzyć Worker z kodem \`sync-worker/worker.mjs\` i ograniczyć go do potrzebnego API. Bazową konfigurację podaje \`sync-worker/wrangler.toml.example\`. Nie używać \`workers.dev\` bez uprzedniego sprawdzenia kontroli dostępu.
2. Utworzyć fine-grained token GitHub z uprawnieniem **Contents: Read and write wyłącznie** do \`dszak/moje-ogrzewanie-archiwum\` (nigdy do \`moje-ogrzewanie\` publicznego). Wprowadzić go jako Worker secret \`GITHUB_TOKEN\`, nigdy do GitHuba, kodu JS, iPhone'a ani czatu.
3. Lokalnie wygenerować **dwa niezależne losowe klucze**, minimum 128 bitów entropii, np. \`openssl rand -hex 24\`. Ustawić po stronie serwera **ich skróty SHA-256**, odpowiednio \`SYNC_WRITE_TOKEN_SHA256\` i \`SYNC_READ_TOKEN_SHA256\`. Oryginalne klucze służą do jednorazowego parowania urządzeń (iPhone: write; TV: read).
4. Ustawić \`ALLOWED_ORIGIN=https://dszak.github.io\`. To tylko ograniczenie przeglądarek; prawdziwą kontrolą dostępu są losowe klucze.
5. W przyszłej wersji aplikacji dopuścić **konkretny**, zatwierdzony adres Workera w CSP, nie globalną listę dowolnych hostów. Wprowadzić w iPhonie klucz zapisu, a na TV klucz tylko do odczytu; zapamiętywanie kluczy wymaga osobnej zgody i nie może pokazywać ich w logach.
6. Przetestować odczyt pustego archiwum, autoryzację, korekty, powtórzenia i działanie po wyłączeniu MacBooka. **Nie wrzucać fikcyjnych odczytów do produkcyjnego archiwum**; testy mają korzystać z atrap lub osobnego środowiska.
7. Najpierw wyeksportować pełną kopię JSON danych z iPhone'a i przechować ją bezpiecznie. Potem jednorazowo przekazać istniejące odczyty gazu, bez nadpisywania lokalnej historii. Zweryfikować liczbę wpisów, ostatni stan licznika i zachowanie rozdziału starego/nowego licznika.

## 4. Kontrakt API

**Odczyt** \`GET /v1/gas\`: nagłówek \`Authorization: Bearer <klucz-read-lub-write>\`. Odpowiedź:

\`\`\`json
{"schema_version":1,"readings":[{"id":"g-123","at":"2026-11-18T09:24:00.000Z","gas":775.696,"meter":"new","source":"manual"}],"event_count":1}
\`\`\`

Wartość jest **wyłącznie przykładowa** i służy objaśnieniu formatu. To nie jest odczyt automatycznie pobrany z prywatnego archiwum.

**Zapis** \`POST /v1/gas\`: tylko klucz do zapisu. Przesyłamy **zdarzenia**, nie całą prywatną kopię lokalnego dziennika. Dla nowego odczytu/korekty:

\`\`\`json
{"events":[{"id":"event-g-123-1","record_id":"g-123","op":"upsert","at":"2026-11-18T09:24:00.000Z","reading":{"at":"2026-11-18T09:24:00.000Z","gas":775.696,"meter":"new","source":"manual"}}]}
\`\`\`

Dla usunięcia:

\`\`\`json
{"events":[{"id":"event-g-123-deleted","record_id":"g-123","op":"delete","at":"2026-11-18T09:25:00.000Z"}]}
\`\`\`

Identyfikator zdarzenia nie może zostać użyty drugi raz z inną treścią. Ponawianie dokładnie tego samego zdarzenia nie tworzy duplikatu. Zdarzenia usunięcia pozostają w **prywatnej** historii archiwalnej, a dane usunięte nie są zwracane przez \`GET\`. Nie odejmować wskazań starego licznika od nowego. Odczyty gazu obejmują CO i CWU, nie można ich automatycznie utożsamiać ze spalaniem na ogrzewanie.

## 5. Następny etap: klient iPhone/TV (nie zrealizowany)

- Przy \`Zapisz odczyt\`: zapisać lokalnie **najpierw**, dodać zdarzenie do kolejki synchronizacji, następnie próbować HTTPS POST.
- Statusy: „Zapisano lokalnie”, „Oczekuje na synchronizację”, „Zsynchronizowano (potwierdzenie serwera)” albo „Błąd — ponów”.
- Przy braku internetu przechować kolejkę i automatycznie wznowić ją po powrocie połączenia. **Nie usuwać lokalnych rekordów.**
- TV pobiera \`GET /v1/gas\` z kluczem tylko do odczytu, wyświetla pochodzenie/znacznik czasu i nie nadpisuje historii iPhone'a.
- Dla ChatGPT: odczyt na żądanie z prywatnego \`sync/gazomierz-v1.json\` przez obecne połączenie GitHub.
- Test migracji istniejących \`gasHistory\` i \`conditions\`; rozróżnić ich źródła, poprawki, duplikaty i ewentualne usunięcia.
- Osobno zaprojektować synchronizację lokalnych celów komfortu, nastaw kotła i eksperymentów, z regułami konfliktów.

## 6. Kryteria zaakceptowania i zatrzymania

**Akceptujemy dopiero gdy:** iPhone zapisze **prawdziwy** odczyt; serwer potwierdzi jego archiwizację w prywatnym GitHubie; Sony Bravia wyświetli go bez ręcznego wpisywania; ChatGPT odczyta go na żądanie; po wyłączeniu MacBooka rozwiązanie nadal działa; w publicznym repo i logach nie ma prywatnych danych ani sekretów.

**Zatrzymujemy wdrożenie**, jeżeli przeglądarka ujawnia poświadczenia GitHuba, serwer udostępnia dane bez hasła, nadpisuje historię zamiast scalać, migawka jest starsza i nieoznaczona, albo następuje zanik danych lokalnych przy błędzie sieci.
