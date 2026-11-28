# Plan kopii awaryjnych i odtwarzania

Stan przeglądu 28 listopada 2026 r. Pakiety zewnętrzne przeszły kontrolę integralności i odczytu. Pełne odtworzenie systemu na świeżym hoście czeka na odrębną próbę. [Mapa systemu](JAK-DZIALA-SYSTEM-OGRZEWANIA.md).

## Co zabezpieczyć

| Składnik | Minimalny komplet do odtworzenia |
| --- | --- |
| HAOS, MQTT i Recorder | Natywna kopia HA, pakiet awaryjny do odszyfrowania, konfiguracja integracji i widoków, historia Recorder, ustawienia i uprawnienia MQTT. Zapis zespołu VM wystarczy do odtworzenia parametrów świeżego HAOS ARM64. |
| ENGO Bridge | Dokładna wersja monitoringowa, źródła i obraz ARM64, spójna kopia SQLite uwzględniająca WAL, manifest tematów i encji, konfiguracja i udokumentowana wersja powrotu. |
| SETTI+ i publikatory | Wersjonowany zestaw faktycznie uruchamianych skryptów wraz z zależnościami, pliki startu usług macOS i ich harmonogramy, prywatne mapowania i dostęp do odtworzenia sesji. Zabezpiecz osobno szyfrator migawki, eksporter HA i monitoring ich świeżości. |
| GitHub, Pages i PWA | Kod i historia właściwych gałęzi, ustawienia Pages i workflow, oczyszczona gałąź z dwoma szyfrogramami, prywatne dane i rewizje gazu oraz dziennika. Dodatkowo zachowaj JSON z telefonu dla danych zapisanych lokalnie lub oczekujących na wysłanie. |
| Cloudflare Worker | Aktywna wersja i deployment, dokładny artefakt, ustawienia zgodności środowiska, nazwy bindingów, trasy i przypisane uprawnienia. Przygotuj ostatnią zgodną wersję wycofania obsługującą obie trasy. |
| Tailscale i panel HA | Konfiguracja prywatnego udostępnienia, proxy i reguł dostępu, autostart, konto o ograniczonych uprawnieniach i zakładki TV. |
| iCloud | Osobne szyfrowane pakiety awaryjne, manifest SHA-256 i instrukcja odczytu. Ewidencja zawiera zakres, datę i ostatni potwierdzony odczyt. |

**Integralność kopii.** Zweryfikuj SHA-256 pliku w niezależnej lokalizacji, odszyfrowanie i wewnętrzny manifest. Dla bazy SQLite użyj udokumentowanej spójnej kopii i kontroli integralności po otwarciu. Potwierdzone odszyfrowanie pakietu jest pierwszym sprawdzeniem. Odbiór działającego systemu wymaga próby odtworzenia.

**Uprawnienia i odzyskiwanie.** Spisuj cel poświadczenia, miejsce odzyskania, właściciela i zakres dostępu. Wartości trzymaj w sejfie lub szyfrowanej konfiguracji. Przygotuj sposób dostępu do kont i kopii bez utraconego MacBooka lub telefonu, w tym 2FA i materiały awaryjne. Klucz kopii i pakiet awaryjny HA przechowuj oddzielnie od odpowiadającego im archiwum. Klucze ról odczytu i zapisu są odrębne. Utracony klucz urządzenia wymaga odzyskania z sejfu lub uzgodnionej rotacji. Hash klucza i eksport JSON aplikacji nie wystarczają do odzyskania wszystkich poświadczeń.

## Kolejność odtwarzania

1. **Zapisz stan i datę kopii.** Zabezpiecz nowsze dane oraz oczekujące zmiany aplikacji. Ogrzewanie lokalne z regulatorem i odbiornikiem może pracować podczas odbudowy monitoringu.
2. **Uruchom świeży HAOS ARM64 w izolacji.** Weryfikuj kopię w labie z osobnym brokerem, danymi syntetycznymi i zablokowanym dostępem do produkcyjnych urządzeń, kont integracji, usług publikacji i tailnetu. Przed włączeniem sieci i dodatków sprawdź, czy odzyskana konfiguracja może wysyłać ruch do produkcji.
3. **Przywróć HA i historię.** Odtwórz Core, Recorder, konfigurację Mosquitto, dashboardy i niezbędne dodatki. Potwierdź zgodność identyfikatorów, odczyt historii i oznaczenie luki po przerwie. Odtwórz ENGO Bridge w wersji monitoringowej i sprawdź SQLite oraz MQTT na danych testowych.
4. **Odtwórz usługi macOS.** Uruchamiaj po jednej roli z przypiętą wersją kodu i konfiguracją. Zweryfikuj komplet SETTI+, klucze i czasy źródłowe dla obu szyfrogramów, harmonogram i kolejność analityki. Publikacje laboratoryjne kieruj wyłącznie do atrapy lub oddzielnego archiwum testowego.
5. **Sprawdź aplikację, prywatną synchronizację i TV.** Zweryfikuj odszyfrowanie po ponownym otwarciu PWA i zachowanie niewysłanych danych. Przy odtwarzaniu Workera sprawdź obie trasy i role na oddzielnym archiwum. Zapis testowy przeprowadź wyłącznie tam. Panel TV zweryfikuj przez prywatny dostęp i konto o ograniczonych uprawnieniach.
6. **Przygotuj odbiór i osobną decyzję produkcyjną.** Zapisz czas odtworzenia, najnowszy odzyskany odczyt, zauważone luki i wyniki. Po zatwierdzeniu przełączenia weryfikuj tor od naturalnego zdarzenia i stanu w HA do nowego szyfrogramu oraz widoku PWA i panelu TV.

## Wycofanie i dalsze utrzymanie

- **Pojedyncza awaria.** Przywróć wyłącznie dotkniętą warstwę. W pierwszej kolejności zabezpiecz przyrost danych od momentu utworzenia kopii. Sprawdź po powrocie zakres historii i publikacje.
- **GitHub Pages i gałąź danych.** Użyj udokumentowanego dobrego wydania oraz oczyszczonej kopii bieżącej gałęzi danych. Starsza kopia zawierająca jawną historię służy wyłącznie prywatnemu odzyskiwaniu.
- **Cloudflare.** Zgodna wersja powrotu obsługuje oba interfejsy i aktualne schematy danych. Rozstrzygnij konflikty w kolejce klienta przed jakąkolwiek operacją nadpisania archiwum.
- **HA i mostki.** Weryfikuj historię SQLite oraz zgodność MQTT na kopii. Pozostaw lokalny regulator i zabezpieczenia kotła poza zakresem zmian. Posłuż się prywatną procedurą konkretnego wydania przy planowaniu przełączenia.
- **Przed pełną próbą.** Potwierdź dostępność niezależnej kopii, odzyskanie poświadczeń, zasoby hosta, izolację i możliwość przerwania próby bez wpływu na produkcję. Po istotnej zmianie odnotuj, które składniki kopii i próby wymagają ponownej weryfikacji.

Szczegółowe wersje, konfiguracje, ścieżki operacyjne i dowody odbioru pozostają w prywatnym inwentarzu instalacji. [Przewodnik kopii Home Assistant](https://www.home-assistant.io/common-tasks/general/backups/) · [Zasady projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md).
