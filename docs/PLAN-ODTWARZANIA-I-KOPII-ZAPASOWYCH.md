# Moje Ogrzewanie — pełna procedura kopii zapasowych i odtwarzania

> **Wersja robocza: 24 listopada 2026.** Inwentarz sporządzono na podstawie istniejących repozytoriów i dokumentacji. Jest to plan, a **nie potwierdzenie**, że kopie niezależne od GitHuba, backup HA lub eksport produkcyjnego Cloudflare już wykonano. Uzupełnienie danych z rzeczywistych kont i próba odtworzenia wymagają oddzielnej kontroli właściciela. Nie ma tu sekretów, prywatnych adresów, odczytów ani danych mieszkania.

## 1. Cel i reguły bezpieczeństwa

Odtworzyć po awarii telefon, aplikację PWA, pomiary, dziennik eksperymentów, Home Assistant, eksporty, dostęp z TV i połączenia chmurowe bez budowania systemu od nowa.

- **Nie mylić monitorowania ze sterowaniem:** kocioł BRÖTJE, regulator ENGO i fizyczne głowice pracują lokalnie, niezależnie od GitHub Pages i Cloudflare; nie ingerować w automatykę bezpieczeństwa kotła.
- **Najpierw zachowaj aktualny stan:** nie przywracaj starszej kopii prywatnego dziennika, nie kasuj danych iPhone'a i nie resetuj integracji przed sprawdzeniem zmian niewysłanych do chmury.
- **Zasada 3–2–1:** trzy kopie istotnych danych, dwa rodzaje nośników/miejsc, jedna niezależna kopia poza kontem GitHub i poza MacBookiem. Wszystkie kopie z danymi prywatnymi szyfrowane. Raz na kwartał sprawdź możliwość odczytu/odtworzenia.
- **Żadnych sekretów w repo:** nie zapisywać wartości haseł, tokenów, kodów odzyskiwania, prywatnych adresów Tailscale/HA, lokalizacji mieszkania, faktur ani jawnej historii temperatur w tym dokumencie, issue, CI czy PR.
- Przed wdrożeniem produkcyjnym zawsze potwierdzić uprawnienia i zgodę użytkownika; istniejący kod `sync-worker/worker.mjs` sam określa się jako **kandydat** i wymaga porównania z rzeczywistym produkcyjnym Workerem.

## 2. Pełny spis warstw i zależności

| Warstwa | Znane źródło / funkcja | Co zabezpieczyć oddzielnie |
| --- | --- | --- |
| Fizyczne ogrzewanie | BRÖTJE QWHC 20/24, ENGO E901WiFi + odbiornik przy kotle, 8 głowic TRV001 | Numeracja urządzeń, przypisania pomieszczeń, procedura ponownego parowania, ustawienia lokalne; **bez** zmian serwisowych kotła |
| Setti+ | Bramka ZigBee, 8 głowic, 6 czujników temperatury/wilgotności; dodatkowe gniazdka, sceny osuszania | Lista urządzeń i identyfikatorów, mapa głowic G1–G8, sceny, harmonogramy, reguły wilgotności, powiązania z bramką i kontem; backup/eksport konfiguracji, o ile aplikacja go umożliwia |
| ENGO Smart / Tuya Smart | Zdalny dostęp do regulatora; osobne konto/bramka ENGO, nie to samo co bramka ZigBee Setti+ | Konto, aplikacja, przypisanie regulator–odbiornik, dostęp Wi-Fi, uprawnienia i ustawienia zdalne |
| Tuya Developer Platform | Projekt integracyjny ENGO, IoT Core, API/eventy; możliwe ograniczenie czasowe usługi | Dane projektu i regionu, powiązane konto aplikacyjne, zakres i ważność subskrypcji, konfiguracja API i webhooków **bez sekretów w repo**; procedura ponownego autoryzowania |
| MacBook / UTM / Home Assistant | VM Home Assistant OS, Recorder, encje ENGO i Setti+, dashboardy, integracja `boiler_note` | Pełny backup HA poza VM, pliki/ustawienia VM UTM, integracje, konta, uprawnienia, Recorder/retencja, modyfikacje sieci i pomocnicze skrypty |
| Eksporter HA historii | Lokalny `launchd` `pl.moje-ogrzewanie.ha-history`; zaszyfrowany plik `ha-historia.enc.json` w gałęzi `setti-data` | Konfiguracja eksportera, harmonogram, nazwy zmiennych i hasło `HA_HISTORY_PASSPHRASE` w menedżerze haseł; sprawdzenie ostatniego udanego eksportu |
| Prywatna analityka | Lokalny `launchd` `pl.moje-ogrzewanie.private-analytics`; analiza HA i plików iCloud → prywatny GitHub | Lokalne skrypty i konfiguracje, źródła iCloud, reguły mapowania, klucz szyfrowania i token repo w sejfie, stan ostatniej synchronizacji |
| Publiczne repo kodu | `dszak/moje-ogrzewanie`, `main`; także `setti-data` dla migawek i szyfrogramu | Pełne, niezależne kopie Git **wszystkich gałęzi i historii** |
| GitHub Pages | `.github/workflows/pages.yml`; testy Node/Python, paczka `dist`, publikacja z `main` | Konfiguracja Pages/Actions, aktywność workflow, ostatni dobry commit, dostęp administratora i 2FA |
| Prywatne archiwum | `dszak/moje-ogrzewanie-archiwum`: `sync/gazomierz-v1.json`, `sync/dziennik-v1.json`, `ha/`, `analityka/`, `badania/`, `decyzje/` | **Osobna szyfrowana kopia pełnego repo** poza GitHubem, bez zmiany widoczności na publiczną |
| Cloudflare Worker | Trasy `/v1/gas` i `/v1/journal`, dostęp do prywatnego GitHub | Kopia **rzeczywiście wdrożonego** kodu i deploymentu, wersja runtime, bindingi, trasy, zmienne, zakres tokenów i procedura rollbacku |
| iPhone PWA | Lokalne dane, zapis offline i kolejka, klucze urządzenia w IndexedDB | `Ustawienia → Pobierz kopię JSON` oraz odrębny sejf kluczy; eksport JSON **nie obejmuje wszystkich sekretów i konfiguracji IndexedDB** |
| Sony Bravia | TV Bro dla PWA; osobna zakładka panelu HA przez Tailscale | Zakładki, połączenie Tailscale, konto HA bez uprawnień administratora, klucz gazu tylko do odczytu |
| Tailscale i proxy | Prywatne HTTPS Tailscale Serve → proxy na MacBooku `127.0.0.1:8123` → HA w UTM; `launchd` `pl.mojeogrzewanie.ha-proxy` | Eksport/odtworzenie konfiguracji Serve i ACL, plik proxy + plist, autostart UTM/Tailscale, zaufany proxy w HA ograniczony do adresu zweryfikowanego w logach |
| Dodatkowe urządzenia | Konwektor, gniazdka Setti+ SP301, osuszacze, scena według wilgotności; część liczników energii wpisywana ręcznie | Powiązania urządzeń, sceny, stany przekaźników, nazwy encji; nie traktować stanu w aplikacji jako niezawodnego dowodu zasilania |
| Oryginalne źródła | Prywatny iCloud Drive: eksporty, JSON/JSONL, dokumenty ORLEN/PDF | Niezależna zaszyfrowana kopia oryginałów i metadanych, niezależna od prywatnego GitHuba |

**Istotne rozróżnienia:** Tuya Smart/ENGO Smart to obsługa użytkownika, a **Tuya Developer Platform** to projekt integracyjny z API. Setti+ ma własną bramkę ZigBee. Żaden z tych kanałów nie jest automatycznie równoważny pozostałym; rzeczywiste transporty i zależności potwierdza konfiguracja HA, nie domysł. Cloudflare nie zasila zaszyfrowanej historii HA: ten tor działa lokalnie na MacBooku i publikuje szyfrogram w GitHub.

## 3. Co trzeba zabezpieczyć TERAZ

1. **Dwa niezależne klony Git z historią**, nie tylko ZIP najnowszego `main`. Upewnić się, że zachowano publiczną gałąź `setti-data` i wszystkie pliki prywatnego repo. Składować zaszyfrowane poza kontem GitHub, np. na zewnętrznym dysku lub w oddzielnym sejfie kopii.
2. **Home Assistant:** wykonać pełną kopię HA z interfejsu i **pobrać ją poza UTM i MacBook**. Zachować jej hasło (jeśli użyte). Opcjonalnie osobny backup VM/konfiguracji UTM. Przetestować odczyt na odizolowanej instalacji, nie na produkcyjnym kotle.
3. **MacBook:** zabezpieczyć pliki uruchomieniowe i lokalne `launchd` dla `ha-history`, `private-analytics`, `ha-proxy`, lokalny kod proxy, autostart „Uruchom Home Assistant”, konfiguracje i oryginały z iCloud. Sam commit w repo nie odtworzy tych usług.
4. **Cloudflare:** w panelu właściciela zapisać poza publicznym repo **dokładny aktywny skrypt i identyfikator deploymentu**, runtime/compatibility, trasy, wszystkie nazwy zmiennych i bindingów oraz rollback; porównać z kandydatem `sync-worker/worker.mjs`. Bez dostępu do konta nie można tego uznać za wykonane.
5. **Sekrety poza repo:** dostęp GitHub/Cloudflare/Tuya/Tailscale/HA, kody 2FA, hasła i klucze urządzeń gaz/dziennik, fraza `HA_HISTORY_PASSPHRASE`, tokeny GitHub/HA, sekret prywatnej notatki CO. Bezpieczne hasła Apple lub inny szyfrowany sejf, z niezależną procedurą odzyskania konta.
6. **iPhone:** wyeksportować lokalny JSON PWA, porównać liczbę odczytów i rewizji z prywatnym GitHubem, potwierdzić brak oczekujących zmian, zachować dane niezsynchroniczowane. Osobna instalacja PWA i Safari mogą mieć różne lokalne dane.
7. **Tuya / Setti / ENGO:** spisać listę kont, hubów, parowań, scen, nazw encji i uprawnień. Sprawdzić, czy platforma daje eksport konfiguracji. Jeśli nie, przygotować **prywatne** zrzuty ustawień bez widocznych haseł i procedurę ponownego parowania. Zapisać termin/warunki usługi Tuya IoT Core, ale nie zakładać, że lokalne sterowanie ogrzewaniem zależy od niej.

### Wymagane nazwy konfiguracji Cloudflare (z kodu kandydata)

- `ALLOWED_ORIGIN`: zwykła zmienna z dozwolonym origin.
- Gaz: `GITHUB_TOKEN`, `SYNC_READ_TOKEN_SHA256`, `SYNC_WRITE_TOKEN_SHA256`.
- Dziennik: `JOURNAL_GITHUB_TOKEN`, `JOURNAL_READ_TOKEN_SHA256`, `JOURNAL_WRITE_TOKEN_SHA256`.

**Nie umieszczać wartości w dokumencie.** SHA-256 urządzenia jest nieodwracalne; utraconego klucza Bearer nie odzyska się z jego hasha. Sekrety Workera mogą wymagać ponownego wprowadzenia/rotacji. Tokeny GitHub powinny mieć wyłącznie konieczne uprawnienia do określonego prywatnego repozytorium.

## 4. Scenariusze odzyskiwania

### A. Utrata iPhone'a lub danych Safari/PWA

1. Nie kasować danych w innych przeglądarkach ani prywatnym repo. Sprawdzić ostatnie zdalne zdarzenie gazu i dziennika.
2. Uruchomić znaną, sprawdzoną PWA na nowym urządzeniu i **porównać** datę lokalnej kopii JSON z ostatnimi rewizjami zdalnymi. Import nie może nadpisać nowszych zapisów.
3. Połączyć gazomierz przez osobny klucz `SYNC_READ` lub `SYNC_WRITE` z sejfu. Wysyłanie włączyć dopiero po kontroli zgodności liczby i identyfikatorów odczytów.
4. W `Analizy → Eksperymenty` połączyć dziennik osobnym kluczem, pobrać rewizje, rozwiązać konflikty bez usuwania którejkolwiek wersji.
5. Oddzielnie przywrócić odszyfrowanie historii HA i parowanie notatki CO w HA. Sprawdzić, czy pozostały oczekujące lokalne edycje. Bez kopii iPhone'a niewysłane dane mogą być nieodwracalnie utracone.

### B. Awaria Cloudflare Workera

1. Nie wykonywać testowych zmian gazomierza w produkcji; lokalne wpisy zachować w kolejce.
2. Sprawdzić stan `/v1/gas` **i** `/v1/journal`, status konta i autoryzacji, zawartość prywatnego GitHuba.
3. Ustalić aktywne źródło i deployment; porównać z ostatnią sprawdzoną wersją. Jeśli potrzebny rollback, upewnić się, że wersja obsługuje **obie** trasy i aktualne schematy. Nie cofać samego Workera, jeśli skutkiem jest utrata dziennika.
4. Jeśli niezbędne pełne odtworzenie, wdrożyć sprawdzony kod z zachowanymi ustawieniami i nowymi/sejfowo odzyskanymi sekretami. Najpierw przetestować na oddzielnym środowisku/staging.
5. Potwierdzić odmowę anonimowego dostępu i zapisu kluczem tylko do odczytu; następnie odczyt rzeczywistych danych, test kontrolowanej rewizji na **wydzielonym** archiwum oraz ponowną synchronizację kolejki iPhone'a, bez duplikatów.
6. Nie nadpisywać `sync/gazomierz-v1.json` ani `sync/dziennik-v1.json` starszą kopią bez rozstrzygnięcia konfliktów.

### C. Utrata GitHuba lub błędna aktualizacja GitHub Pages

1. Jeśli tylko publikacja zawiodła, wskazać ostatni dobry commit `main` i sprawdzić `.github/workflows/pages.yml`, testy i `scripts/package.py`. Wdrażać poprawkę dopiero po akceptacji.
2. Jeśli usunięto repo, odtworzyć je z **niezależnego pełnego backupu**, jawnie ustawiając prywatne archiwum jako **private** i przywracając gałąź `setti-data`.
3. Sprawdzić adres Pages, ustawienia Actions, uprawnienia oraz wszystkie integracje, które mają na stałe wpisaną nazwę repo/branch. Zmiana właściciela lub nazwy repo wymaga aktualizacji odwołań i tokenów.
4. Porównać zawartość gazomierza/dziennika i najnowsze rewizje z lokalnymi kopiami iPhone'a, zanim wznowisz wysyłanie.

### D. Awaria MacBooka / Home Assistant / UTM

1. Nie przywracać HA na żywym sprzęcie w sposób, który mógłby generować niezamierzone polecenia; do testu użyć izolowanego środowiska.
2. Zainstalować UTM/HA w zgodnej wersji, odtworzyć **pełny backup HA**, jego integracje, entitety, użytkowników, historię Recorder i `boiler_note`. Przywrócić uprawnienia dostępu.
3. Z odrębnej kopii MacBooka przywrócić pliki startowe i konfiguracje `pl.moje-ogrzewanie.ha-history`, `pl.moje-ogrzewanie.private-analytics`, `pl.mojeogrzewanie.ha-proxy`, konfiguracje eksportów, lokalny proxy, „Uruchom Home Assistant”, UTM i Tailscale Serve.
4. Przywrócić tokeny/hasło historii z sejfu; połączyć ENGO, Setti i Tuya zgodnie z **potwierdzonym** transportem właściwej integracji. Jeśli zmieniły się identyfikatory encji, poprawić mapowania w prywatnych konfiguracjach.
5. Sprawdzić osobno: działanie HA na MacBooku, świeżość Recorder, źródłowe czujniki, ENGO jako **żądanie ciepła**, eksport szyfrowanej historii, eksport prywatnej analityki, statystyki z uwzględnieniem luk; nie mylić stanu ON ENGO z pracą palnika.
6. Tailscale: odtworzyć tylko prywatne Serve, **bez publicznego Funnel**, proxy ograniczyć do loopback, potwierdzić zakres zaufanych adresów w HA; na TV sprawdzić osobno panel HA i PWA.

### E. Utrata sesji Tuya, bramki ZigBee lub usługi IoT Core

1. Sprawdzić najpierw, co nadal działa **lokalnie**: ENGO–odbiornik–kocioł oraz lokalne nastawy TRV. Nie resetować kotła ani nie zmieniać ustawień bezpieczeństwa.
2. Oddzielnie zdiagnozować: konto ENGO Smart/Tuya Smart, projekt Tuya Developer i ważność IoT Core, konto Setti+, bramkę ZigBee, Wi-Fi, integrację MQTT/API i HA. Nie zakładać, że brak chmurowego API oznacza brak lokalnego grzania.
3. Jeśli przywracane jest parowanie, wykonać je zgodnie z instrukcjami producenta i **z zachowaniem listy urządzeń, mapowania G1–G8, scen i reguł**; każdą zależną automatyzację po odtworzeniu przetestować bezpiecznie.
4. Sprawdzić pojawienie się świeżych `pomiary.json` i `glowice.json`, zdarzenia i encje w HA, sceny łazienkowe oraz dostęp do ENGO, zanim uznasz odzyskanie za zakończone.

### F. Utrata dostępu do Cloudflare/GitHub/Tuya/Tailscale

Odzyskać konto z wcześniej zabezpieczonych metod 2FA i kodów awaryjnych. W razie niemożności odzyskania utworzyć nowe zasoby dopiero po odzyskaniu **niezależnej kopii danych**, zweryfikowaniu własności i rotacji sekretów. Nie publikować prywatnego archiwum ani włączać publicznego dostępu do HA jako drogi na skróty.

## 5. Lista kontrolna przywracania — kryterium sukcesu

- [ ] PWA otwiera się po publikacji z właściwej gałęzi; testy Node/Python i budowa paczki są zielone.
- [ ] Repo prywatne pozostaje prywatne; gaz i dziennik mają poprawne schematy, historię i brak duplikatów.
- [ ] Test **samego odczytu** obydwu usług Cloudflare działa; anonimowe żądania są blokowane.
- [ ] iPhone i TV mają właściwe **osobne role**; nie ujawniono tokenów w kodzie ani logach.
- [ ] Zdalna rewizja dziennika jest widoczna na iPhonie; test pełnego zapisu przeprowadza się wyłącznie na zgodnie uzgodnionych danych.
- [ ] Odzyskano działanie VM/HA, Recorder, encji, dashboardów, kopii szyfrowanej, eksportera prywatnej analityki i danych z iCloud.
- [ ] Setti+/ZigBee, ENGO/Tuya, Tuya Developer i sceny zostały zidentyfikowane; świeżość danych jest potwierdzona **znacznikami czasu**, nie tylko obecnością pliku.
- [ ] Na Sony Bravia działa zarówno PWA, jak i **osobny** panel HA za prywatnym Tailscale Serve.
- [ ] Rozłączony MacBook/Cloudflare nie zaburza lokalnego sterowania kotłem; po przywróceniu nie uruchomiono niezamierzonych poleceń.
- [ ] Kopie dają się odszyfrować i odczytać **poza** pierwotnym telefonem/MacBookiem i kontem GitHub.

## 6. Kadencja utrzymania i odpowiedzialność

| Częstotliwość | Czynność |
| --- | --- |
| Po większej zmianie aplikacji, Workera lub HA | Zapisz stabilny commit/deployment, zaktualizuj inwentarz, zrób backup lokalny i niezależny |
| Co tydzień | Porównaj świeżość migawek Setti+, eksportów HA i prywatnej analityki; zweryfikuj brak zalegającej kolejki synchronizacji |
| Co miesiąc | Pobierz aktualny JSON PWA, pełny backup HA i szyfrowane kopie repozytoriów; sprawdź, że kopie są czytelne |
| Co kwartał | Niedestrukcyjny **test odzyskania** w odizolowanym środowisku i przegląd dostępu/2FA, sekretów, terminów usług oraz możliwości rollbacku |
| Przy zmianie tokenu lub konta | Natychmiast uaktualnij sejf i dokumentację *nazw/zakresów*, a następnie zweryfikuj klienta i usługę bez ujawniania sekretów |

## 7. Otwarte punkty wymagające realnego audytu

**Nie oznaczać ich jako wykonane tylko dlatego, że dokument został scalony.**

- [ ] Potwierdzić rzeczywistą wersję i deployment Cloudflare, odczytać z panelu konfigurację i bezpiecznie zachować działający skrypt produkcyjny.
- [ ] Ustalić, czy istnieje **niezależny od GitHuba** szyfrowany backup obu repo z pełną historią.
- [ ] Wykonać i zweryfikować kopię Home Assistant oraz lokalnych plików UTM/`launchd` poza MacBookiem.
- [ ] Ustalić dokładne zależności integracji Tuya Developer, Setti+ i ENGO; spisać konfigurację scen, bramek i termin ważności IoT Core.
- [ ] Zweryfikować backup/odzyskanie sejfu haseł oraz kont usług z 2FA i oddzielnymi kodami awaryjnymi.
- [ ] Zrobić próbę odtworzenia bez połączenia z produkcyjnym kotłem, z potwierdzeniem integralności danych, historii i braku ujawnienia sekretów.

## 8. Dokumenty szczegółowe

- [Architektura całego systemu](JAK-DZIALA-SYSTEM-OGRZEWANIA.md)
- [Prywatny dziennik eksperymentów](PRYWATNY-DZIENNIK-EKSPERYMENTOW.md)
- [Prywatna synchronizacja gazomierza](PRYWATNA-SYNCHRONIZACJA-GAZU.md)
- [Szyfrowana historia HA](INTEGRACJA-HA-SZYFROWANA-1-9.md)
- [Home Assistant na Sony Bravia/Tailscale](HOME-ASSISTANT-SONY-BRAVIA-TAILSCALE-2026-11-20.md)
- [Monitoring dodatkowych urządzeń](MONITORING-URZADZEN-LAZIENKA.md)
- [Prywatne archiwum analityczne](ARCHIWUM-ANALITYCZNE-PROJEKT.md)
- [Procedura pierwszego odczytu projektu w nowym czacie](START-TUTAJ-NOWY-CZAT.md)

**Granica dokumentu:** to publiczna mapa odbudowy **bez danych wrażliwych**. Właściwy prywatny inwentarz kont, urządzeń, identyfikatorów, konfiguracji hosta i lokalizacji kopii powinien pozostać w zaszyfrowanym zasobie z ograniczonym dostępem, a sekrety wyłącznie w sejfie haseł.
