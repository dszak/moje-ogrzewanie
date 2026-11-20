# Home Assistant na Sony Bravia przez Tailscale — wdrożenie i automatyczny start

> **Stan: 20 listopada 2026 r.** Zapis faktycznie przeprowadzonych prób. To **osobna ścieżka wyświetlania interfejsu Home Assistant** na telewizorze, niezależna od autorskiej PWA „Moje Ogrzewanie” w TV Bro i synchronizacji gazomierza przez Cloudflare Worker.
>
> **Publiczna dokumentacja celowo pomija** rzeczywiste adresy IP urządzeń, adres HTTPS prywatnej sieci Tailscale, identyfikatory urządzeń i szczegółową konfigurację użytkownika. Pełny dziennik wdrożenia, ścieżki lokalnych plików, adresy i procedura odtworzenia znajdują się w **prywatnym** repozytorium: [WDROZENIE-HA-UTM-TAILSCALE-SONY-2026-11-20.md](https://github.com/dszak/moje-ogrzewanie-archiwum/blob/main/badania/WDROZENIE-HA-UTM-TAILSCALE-SONY-2026-11-20.md).

## 1. Rezultat — potwierdzony testem po restarcie

**Sony Bravia otwiera panel Home Assistant w TV Bro przez prywatne HTTPS.** Po restarcie MacBooka i zalogowaniu do macOS wystartowały samoczynnie maszyna Home Assistant w UTM, lokalne przekierowanie Python oraz Tailscale. Użytkownik potwierdził, że panel w telewizorze działa **bez ręcznego uruchamiania Terminala**. W TV Bro zapisano zakładkę do **głównego adresu HTTPS**, bez tymczasowych parametrów logowania.

Nie oznacza to pracy 24/7 ani przetestowania działania podczas uśpienia MacBooka. Nie testowano też pełnego samonaprawiania po wylogowaniu z Tailscale, utracie Wi-Fi, awarii VM czy dużej aktualizacji macOS.

## 2. Architektura dwóch odrębnych torów

**Tor Home Assistant — nowy:**

```text
Sony Bravia (Android TV)
  TV Bro + oddzielne konto HA bez uprawnień administratora
         |
         | prywatne HTTPS w sieci Tailscale (Serve; bez Funnel)
         v
MacBook Air z Tailscale
  Tailscale Serve (TLS / reverse proxy)
         |
         | HTTP do loopbacku MacBooka
         v
  127.0.0.1:8123 — lokalny Python TCP proxy
         |
         | HTTP do sieci współdzielonej UTM (NAT)
         v
UTM / Home Assistant OS (HTTP port 80)
         |
         v
Interfejs HA: przegląd, obszary, urządzenia, monitoring ogrzewania
```

**Tor autorskiej aplikacji „Moje Ogrzewanie” — wcześniejszy i niezależny:** GitHub Pages/PWA na iPhonie i TV Bro; migawki Setti+ z GitHuba, zaszyfrowana historia HA, ręczne odczyty gazomierza synchronizowane do prywatnego archiwum przez Cloudflare Worker. **Nie mylić** tego z bezpośrednim interfejsem HA otwieranym przez Tailscale.

## 3. Kolejność wykonanych prac (20.11.2026)

1. **Identyfikacja adresów i portów.** Panel HA działał na MacBooku przez wewnętrzny adres maszyny UTM i port HTTP **80**. UTM pokazał tryb **Sieć współdzielona**; Sony i MacBook były w tej samej sieci Wi-Fi, ale telewizor nie mógł bezpośrednio dotrzeć do sieci gościa UTM. Próba przez nieistniejący serwer na porcie 8123 MacBooka zakończyła się błędem.
2. **Weryfikacja możliwości MacBooka.** Nie było poleceń `socat` ani `brew`; dostępny był Python **3.9.6**. Zapytanie `curl` do HA zwróciło **HTTP 200**.
3. **Pierwszy test przekierowania.** Tymczasowy serwer TCP Python, nasłuchujący na adresie MacBooka w sieci Wi-Fi i przepuszczający wyłącznie połączenia z IP telewizora, doprowadził do wyświetlenia ekranu logowania HA. Nie użyto tego nieszyfrowanego wariantu do właściwego logowania.
4. **Sieć prywatna.** Na Android TV zainstalowano Tailscale z Google Play, zatwierdzono systemowe połączenie VPN i dodano telewizor przez QR/konto użytkownika. Na MacBooku zainstalowano Tailscale Standalone; wymagane było ręczne zatwierdzenie **Network Extension** w ustawieniach macOS. Oba urządzenia wyświetliły status **Connected** w tej samej sieci Tailscale, bez włączania Exit Node.
5. **Tailscale CLI i Serve.** W ustawieniach Tailscale aktywowano integrację poleceń Terminala; `tailscale status` pokazało dwa urządzenia. Z poziomu panelu konta włączono **Tailscale Serve**, **nie** Funnel.
6. **Ograniczenie proxy do MacBooka.** Poprzedni proces Pythona zatrzymano. Nowy TCP proxy nasłuchiwał tylko na `127.0.0.1:8123`, po czym uruchomiono `tailscale serve --bg http://127.0.0.1:8123` i otrzymano prywatny adres HTTPS.
7. **Naprawa błędu HTTP 400.** Home Assistant odrzucał żądania z reverse proxy. Jego dziennik wskazał **konkretny adres bramy sieci UTM**; w **Ustawienia → System → Sieć → Serwer HTTP → Odwrotne proxy** włączono **Ufaj X-Forwarded-For** i dodano jako zaufane **wyłącznie to jedno IP (/32)**. Po zapisaniu, restarcie HA i zatwierdzeniu konfiguracji ekran logowania działał przez HTTPS.
8. **Oddzielne konto TV.** Utworzono użytkownika `tv-wsalonie` (nazwa wyświetlana „Telewizor Salon”), aktywnego, bez uprawnień administratora; „Tylko dostęp lokalny” pozostało wyłączone z uwagi na reverse proxy. Konto przetestowano na MacBooku w oknie incognito.
9. **Diagnostyka logowania na TV.** W TV Bro pojawił się komunikat *Unable to connect to Home Assistant* z odliczaniem. Ostatecznie użytkownik ustalił, że przy wklejaniu adresu pilotem Google TV z iPhone'a dochodził długi dodatkowy fragment URL (prawdopodobnie parametry autoryzacji). Po usunięciu dodatku i wpisaniu **samego bazowego URL HTTPS** panel zalogował się i działał. Nie wykazano błędu WebSocket ani konieczności modyfikacji kodu proxy.
10. **Autostart przekierowania.** Kod Pythona zapisano na MacBooku do odrębnego skryptu. Utworzono użytkownika-usługę `launchd` o etykiecie `pl.mojeogrzewanie.ha-proxy`: `RunAtLoad=true`, `KeepAlive=true`, `ThrottleInterval=15`, osobne logi stdout/stderr. Skrypt przeszedł `py_compile`, plik plist — `plutil -lint`. Po zatrzymaniu wcześniejszego procesu usługę uruchomiono przez `launchctl bootstrap`, a `launchctl print` zwrócił `state = running` i PID działającego serwera; panel TV nadal działał.
11. **Autostart Tailscale i UTM.** Ponieważ przełącznik *Start at login* w Tailscale sam się wyłączał, aplikację dodano ręcznie do macOS **Otwieraj przy logowaniu**. Istniejąca wcześniej aplikacja/skrypt **„Uruchom Home Assistant”** była już na tej liście i służyła do startu VM; jej kodu podczas tego wdrożenia **nie zmieniano ani nie audytowano**.
12. **Kontrolowany test restartu.** Najpierw wyłączono **cały Home Assistant OS**, a nie tylko ponownie uruchomiono aplikację; UTM potwierdził status **Zatrzymana**, a przy niedostępnym backendzie HTTPS zwracał **502** (oczekiwane). Następnie ponownie uruchomiono MacBooka i zalogowano do macOS. UTM uruchomił VM automatycznie, a użytkownik potwierdził działający panel HA na Sony Bravia bez otwierania Terminala.

## 4. Mechanizmy startowe, które trzeba zachować

| Element | Mechanizm | Potwierdzenie |
| --- | --- | --- |
| Home Assistant OS | UTM; wcześniejszy element logowania „Uruchom Home Assistant” | VM uruchomiła się samoczynnie po restarcie |
| Lokalny TCP proxy | Użytkownik macOS / `launchd`, etykieta `pl.mojeogrzewanie.ha-proxy` | `state = running`, po restarcie panel dostępny |
| Tailscale | Aplikacja dodana ręcznie do elementów logowania macOS | Oba urządzenia wcześniej Connected; po restarcie panel osiągalny |
| Tailscale Serve | Konfiguracja `serve --bg`, prywatne HTTPS | `tailscale serve status` i panel na TV |
| TV Bro | Zakładka z **bazowym** URL HTTPS i konto bez administratora | Zalogowany panel, także po restarcie MacBooka |

**Odporność:** `launchd` uruchamia i pilnuje samego TCP proxy. Nie jest to mechanizm wybudzania MacBooka ani nadzorca zdrowia HA/UTM/Tailscale. MacBook musi pozostać włączony, zalogowany i nieuśpiony, a gość UTM uruchomiony, aby telewizor otrzymywał bieżący obraz.

## 5. Bezpieczeństwo i ograniczenia

- **Nie otwierano portów routera. Nie uruchamiano Tailscale Funnel.** Dostęp przez Serve jest przeznaczony wyłącznie dla urządzeń uprawnionych w prywatnej sieci Tailscale.
- **HTTPS szyfruje połączenie TV ↔ MacBook.** Połączenie MacBook ↔ HA w odseparowanej sieci UTM nadal jest lokalnym **HTTP**, a nie end-to-end HTTPS aż do HA.
- Python nasłuchuje na **loopback**, nie na domowym interfejsie Wi-Fi. Odrzucono starsze przekierowanie słuchające w LAN.
- Zaufanie `X-Forwarded-For` ograniczono do jednego wskazanego przez dziennik IP (/32); nie dodawano całej podsieci.
- Konto HA bez administratora **nie oznacza trybu tylko do odczytu**: może nadal obsługiwać udostępnione mu encje. Nie prezentować panelu TV jako bezwarunkowo pasywnego.
- W repozytoriach nie zapisywać haseł HA, QR/kodów parowania, tokenów ani kopii sesji przeglądarki. W publicznym dokumencie nie ujawniać prywatnej domeny tailnet ani adresów urządzeń.
- Interfejs Tailscale/HA na TV i autorska PWA w TV Bro mają **różne konta, źródła danych i mechanizmy aktualizacji**.

## 6. Procedura diagnostyczna (bez sekretów)

- Gdy panel TV przestanie działać, kolejno sprawdzić: UTM/HA uruchomione → bezpośredni panel HA na MacBooku → nasłuch `127.0.0.1:8123` → `launchctl print gui/$(id -u)/pl.mojeogrzewanie.ha-proxy` → `tailscale status` → `tailscale serve status` → połączenie TV w Tailscale → **bazowy** adres HTTPS w TV Bro.
- **HTTP 400** po uruchomieniu HTTPS: przejrzeć dziennik Home Assistant pod kątem odrzucenia reverse proxy; nie dodawać do zaufanych wszystkich podsieci.
- **HTTP 502**: serwer pośredniczący działa, ale backend HA/UTM może być wyłączony lub niedostępny — oczekiwane podczas świadomego wyłączenia VM.
- **Pętla ponownego łączenia w TV Bro**: najpierw sprawdzić, czy w zakładce/pasku wpisano wyłącznie bazowy URL, bez `/auth/authorize?... `; nie zmieniać pochopnie sieci czy WebSocket.
- Zrzut procesów `lsof` i stanu `launchctl` służy diagnozie, ale PID **nie jest stały**. Nie utrwalać PID jako procedury startowej.

## 7. Co dalej?

1. **Wykonano 20.11.2026:** ukończono widoki **„Cały system”** (szczegółowa analiza sześciu pomieszczeń i ośmiu głowic) oraz **„TV — Przegląd ogrzewania”** (temperatury, wilgotności, ENGO i żądanie ON/OFF). Działanie na Sony Bravia zostało potwierdzone przez użytkownika; szczegóły i granice testu: [dokumentacja gotowych widoków](WIDOKI-HA-CALY-SYSTEM-I-TV-2026-11-20.md).
2. Sprawdzić wpływ **uśpienia MacBooka**, zerwania Wi-Fi, wyłączenia TV oraz ponownych sesji Tailscale; na razie potwierdzono jeden restart MacBooka.
3. Zweryfikować odporność istniejącego automatu „Uruchom Home Assistant” i aktualizację stanów po rzeczywistych błędach usług.
4. Utrzymywać odrębne kopie kodu proxy i pliku plist na prywatnym nośniku / w prywatnej dokumentacji; dokument GitHub nie instaluje ich automatycznie na MacBooku.
5. Nie mieszać tego etapu z testem **13. rzeczywistego odczytu gazomierza**, który dotyczy innego toru synchronizacji.

**Powiązane dokumenty:** [architektura całego projektu](JAK-DZIALA-SYSTEM-OGRZEWANIA.md) · [drogowskaz nowego czatu](START-TUTAJ-NOWY-CZAT.md) · [synchronizacja gazomierza](PRYWATNA-SYNCHRONIZACJA-GAZU.md).
