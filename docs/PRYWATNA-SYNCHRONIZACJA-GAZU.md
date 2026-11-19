# Prywatna synchronizacja gazomierza — iPhone, Cloudflare, GitHub i Sony Bravia

> **Stan operacyjny: 20 listopada 2026 r., po uruchomieniu w nocy z 19 na 20 listopada.** Synchronizacja **odczytów gazomierza** została rzeczywiście sprawdzona na iPhonie, przez Cloudflare i w prywatnym GitHubie, a następnie na Sony Bravia w TV Bro. Pozostałe dane aplikacji nie są automatycznie synchronizowane tą usługą. To dokument techniczny bez sekretów i bez prywatnych wartości odczytów.

## Co potwierdzono

- Odczyt \`GET /v1/gas\` **bez klucza** zwrócił \`401\` i \`{"error":"Brak autoryzacji."}\`.
- Odczyt z prawidłowym kluczem zwrócił \`HTTP 200\`, początkowo \`{"schema_version":1,"readings":[],"event_count":0}\`.
- Po potwierdzonym włączeniu wysyłki na iPhonie aplikacja pokazała **12 zsynchronizowanych zmian i 12 odczytów**. Ponowny odczyt Workera zwrócił tę samą liczbę.
- Na telewizorze **Sony Bravia**, przez **TV Bro**, wybrano **„Tylko odczyt (telewizor)”**, połączono prywatne archiwum i pokazano **12 odczytów oraz 11 interwałów zużycia**. Zweryfikowano również widok porównań dobowych.
- ChatGPT z aktywnym połączeniem GitHub odczytał plik prywatnego archiwum \`sync/gazomierz-v1.json\` i potwierdził **12 aktualnych odczytów oraz 12 zdarzeń**. **Nie jest to monitoring na żywo ani trwałe uprawnienie każdego nowego czatu.**
- **Jeszcze niepotwierdzone:** przyszły, 13. rzeczywisty odczyt zapisany po uruchomieniu usługi i jego samoczynne pojawienie się na TV bez ręcznego odświeżenia; praca po wielu dniach offline, po restarcie urządzeń oraz przy wyczerpaniu limitu zdarzeń.

## Aktualna architektura

\`\`\`text
iPhone · PWA „Moje Ogrzewanie” (HTTPS / GitHub Pages)
    | ręczny odczyt -> DataStore localStorage (zapis lokalny najpierw)
    | włączona przez użytkownika synchronizacja -> żądanie HTTPS + Bearer WRITE
    v
Cloudflare Worker: moje-ogrzewanie-gaz-sync
    | sprawdzanie uprawnień, CORS/Origin, limit wielkości żądań
    | token GitHub tylko jako sekret po stronie Workera
    v
PRYWATNE repozytorium: dszak/moje-ogrzewanie-archiwum
    sync/gazomierz-v1.json (schemat 1, dziennik zdarzeń)
    |                               |
    v                               v
TV Bro / Sony Bravia               ChatGPT + uprawnione połączenie GitHub
GET + Bearer READ                  odczyt na wyraźne żądanie użytkownika
\`\`\`

Publiczne repozytorium \`dszak/moje-ogrzewanie\` zawiera **kod klienta i dokumentację**, a nie jawne pomiary. Kod klienta: \`public/gas-sync.js\`, integracja interfejsu: \`public/app.js\`, polityka sieciowa: CSP \`connect-src\` w \`public/index.html\`, zasoby offline: \`public/sw.js\`, testy: \`tests/gas-sync-client.test.cjs\`.

Publiczny adres Workera: \`https://moje-ogrzewanie-gaz-sync.ks-stawarz.workers.dev/v1/gas\`. **Znajomość adresu nie daje dostępu do odczytów bez uprawnień.** Kod serwera wdrożono ręcznie w Cloudflare na podstawie \`sync-worker/worker.mjs\` z [PR #27](https://github.com/dszak/moje-ogrzewanie/pull/27) — **ten PR pozostaje oddzielnym, niescalonym źródłem kodu backendu**. Przed przyszłymi zmianami produkcyjnymi trzeba zapewnić kontrolę wersji i zgodność rzeczywistego Workera z kodem repozytorium; nie utożsamiać wersji GitHub z wdrożeniem Cloudflare.

## Trzy klucze — rozdzielenie odpowiedzialności

| Etykieta do stosowania w Hasłach Apple | Identyfikator / sekret po stronie Cloudflare | Uprawnienie |
| --- | --- | --- |
| **GAZ 1 – iPhone – ZAPIS** | \`SYNC_WRITE\` / \`SYNC_WRITE_TOKEN_SHA256\` | Odczyt oraz zapis zdarzeń gazu |
| **GAZ 2 – Telewizor – ODCZYT** | \`SYNC_READ\` / \`SYNC_READ_TOKEN_SHA256\` | Wyłącznie odczyt |
| **GAZ 3 – Cloudflare – GitHub** | \`GITHUB_TOKEN\` | Zapis/odczyt zawartości wyłącznie prywatnego repozytorium |

Dodatkowa zwykła zmienna Workera: \`ALLOWED_ORIGIN=https://dszak.github.io\`. Trzy powyższe wartości poufne w Cloudflare mają typ **Secret**, a nie zwykłą zmienną. Hasła urządzeń są losowymi kluczami **48 znaków szesnastkowych**; do aplikacji wkleja się **KLUCZ** z pola hasła, **nigdy jego SHA-256 ani token GitHuba**. Nie kopiować rzeczywistych wartości kluczy do dokumentów, kodu, issue, czatu ani zrzutów ekranu.

**Istotny niuans:** wybór z listy \`Zapis (iPhone)\` albo \`Tylko odczyt (telewizor)\` ustawia rolę w interfejsie. Sam napis „iPhone · zapis” **nie dowodzi uprawnień serwerowych do POST**: o tym przesądza rzeczywisty zapis zweryfikowany przez Worker. W dniu wdrożenia pierwszy zapis 12 zdarzeń się powiódł.

## Jak korzystać

**iPhone:**

1. Otwórz \`Moje Ogrzewanie → Gaz i pogoda → Prywatne archiwum gazomierza\`.
2. Wybierz **Zapis (iPhone)**, wklej właściwy klucz z Hasła Apple (wpis \`SYNC_WRITE\`) i wybierz **Połącz prywatne archiwum**.
3. Pierwsza synchronizacja dotychczasowej historii wymaga osobnego potwierdzenia **Włącz wysyłanie i archiwizację odczytów**. Zrób wcześniej **Ustawienia → Pobierz kopię JSON**, zachowaj poza przeglądarką, np. w iCloud Drive.
4. Kolejne zapisy odczytów gazu najpierw trafiają do pamięci iPhone'a, dopiero potem aplikacja próbuje wysłać zdarzenia do prywatnego archiwum. Podczas otwartej aplikacji działa też cykliczna próba synchronizacji co ok. **5 minut**. \`Synchronizuj teraz\` jest ręczną możliwością ponowienia. Brak internetu nie blokuje lokalnego zapisu, lecz **nie oznacza udanej zdalnej archiwizacji**.
5. Nie usuwać lokalnego zapisu przy problemie z połączeniem. Sprawdzić komunikat i liczbę odczytów w archiwum.

**Sony Bravia / TV Bro:**

1. Otwórz \`https://dszak.github.io/moje-ogrzewanie/\` i zakładkę **Gaz i pogoda**.
2. Wybierz **Tylko odczyt (telewizor)**, wklej klucz \`SYNC_READ\` i wybierz **Połącz prywatne archiwum**.
3. Po \`Pobierz dane z archiwum\` sprawdź liczbę odczytów. Aplikacja nakłada zdalną historię na **widoki analityczne** (bez kopiowania jej do lokalnego DataStore telewizora).
4. TV nie może wysyłać zmian gazu do archiwum. Jeśli nowa wersja aplikacji nie jest widoczna, odśwież stronę lub ponownie uruchom TV Bro; **nie czyść danych aplikacji** bez kopii i decyzji.

**ChatGPT:** w nowej rozmowie trzeba rzeczywiście odczytać przez połączone konto GitHub plik z **prywatnego** repozytorium, a nie opierać się wyłącznie na pamięci rozmowy. Kod aplikacji, plik prywatnego archiwum i dane ORLEN/HA są **różnymi źródłami**. Nie twierdzić, że bieżący stan gazomierza jest znany, jeśli nie ma świeżego odczytu.

## Co jest synchronizowane, a co nie

- **Tak:** ręczne i historyczne odczyty gazomierza z \`gasHistory\`, odczyty z \`conditions\`, ich wartości, czas, stary/nowy gazomierz i źródło; korekty i usunięcia jako zdarzenia \`upsert\` / \`delete\`. Dane rozdzielone według starego i nowego gazomierza. Zdarzenia są deduplikowane; Worker ogranicza paczkę do 100 zdarzeń.
- **Nie:** cała lokalna kopia JSON, dziennik innych nastaw, temperatura pokojowa, migawki Setti+, prywatne notatki, plan mieszkania, decyzje i eksperymenty, hasła. Nie ma synchronizacji ustawień między iPhone'em a TV.
- **Osobny kanał:** szyfrowana historia HA/ENGO i Setti+; nie mieszać jej z synchronizacją gazomierza.
- **Osobny zasób:** \`orlen/faktury-i-odczyty.json\` w prywatnym archiwum nie jest automatycznie aktualizowany przez usługę gazomierza; może odzwierciedlać wcześniejszy eksport.
- \`meta/index.json\` indeksuje dane z osobnego synchronizatora HA/iCloud i **nie jest pełnym indeksem odczytów \`sync/gazomierz-v1.json\`**.

## Zasady bezpieczeństwa, integralność i ograniczenia

1. **Prywatne repozytorium nie jest szyfrowaniem end-to-end**: treść JSON jest jawna dla uprawnionego konta GitHub i dostępnych mu integracji. Nie zmieniać widoczności repozytorium na publiczną. Nie umieszczać pomiarów w publicznym \`setti-data\`.
2. Klucz urządzenia (Bearer) jest zapamiętywany po stronie klienta w **IndexedDB** w obrębie origin aplikacji, nie w kodzie publicznym ani w pliku kopii JSON. **Nie jest to nieeksportowalny klucz kryptograficzny**; skrypt działający w tym samym origin może mieć do niego dostęp. Dbać o bezpieczeństwo i aktualność aplikacji na GitHub Pages i bezpieczeństwo urządzeń.
3. W Cloudflare przechowuje się **hash SHA-256 kluczy odczytu/zapisu** oraz **sekret PAT GitHub**. Uprawnienia PAT ograniczyć do \`dszak/moje-ogrzewanie-archiwum\`, zakres \`Contents: Read and write\`; nie nadawać niepotrzebnych uprawnień.
4. \`ALLOWED_ORIGIN\` i CORS ograniczają przeglądarkowy dostęp z innych domen, ale **nie zastępują** weryfikacji Bearer. Nie są ogólną barierą dla klientów spoza przeglądarki.
5. Zapisy są najpierw lokalne i nie powinny być usuwane w reakcji na awarię sieci. **Wysyłanie działa przy uruchomionej aplikacji**, nie jest gwarantowaną usługą w tle po zamknięciu iOS lub telewizora.
6. Przy \`Wczytaj kopię JSON\`, \`Przywróć poprzedni zapis\` lub \`Wyczyść dane\` automatyczna wysyłka gazu jest **wstrzymywana** — aby nie nadpisać zdalnej historii przez przypadkowe skasowanie lokalnego zbioru. Ponowne włączenie wymaga świadomego sprawdzenia sytuacji.
7. Kopia JSON z iPhone'a **nie zawiera oddzielnego magazynu klucza IndexedDB ani metadanych synchronizacji**. Jest ważną niezależną kopią danych, nie pełną kopią konfiguracji synchronizatora. Oddzielnie zabezpieczyć klucze w Hasłach Apple.
8. Raporty do ChatGPT, faktury i praca kotła to oddzielne obszary. **ENGO ON/OFF nie oznacza potwierdzonej pracy palnika**, a zużycie gazu obejmuje także **c.w.u.**; 18–30-godzinne porównania są *przeliczeniami* na dobę, nie pomiarami pełnej doby kalendarzowej.

## Dalsza kontrola

- Przy następnym **rzeczywistym** odczycie z iPhone'a sprawdzić potwierdzenie zapisu i następnie, czy TV bez ponownego wklejania klucza pokazuje **13 odczytów**; zweryfikować też przy odświeżaniu bez ręcznego kliknięcia.
- Przetestować ponowne otwarcie TV Bro/iPhone'a, tryb offline i wznowienie po powrocie sieci. Nie zastępować rzeczywistego pomiaru fikcyjnym wpisem wyłącznie na potrzeby testu.
- Okresowo sprawdzać widoczność prywatnego repozytorium, zakres PAT, dostęp do Cloudflare i ważność kluczy. Przed zmianą backendu wprowadzić kontrolę wersji Workera i test wdrożeniowy.
- Ustalić retencję archiwum: backend ogranicza dziennik do **15 000 zdarzeń** i w razie przekroczenia zwraca błąd, zamiast usuwać starsze zdarzenia automatycznie.

Dokumentację kontekstu projektu znajdziesz też w [architekturze](JAK-DZIALA-SYSTEM-OGRZEWANIA.md), [README](../README.md) i [punkcie startowym nowego czatu](START-TUTAJ-NOWY-CZAT.md).
