# Moje Ogrzewanie

Prosty dziennik komfortu i zużycia gazu. Zachowuje sześć pomieszczeń, osiem głowic, drzwi, ENGO Smart, nastawę kotła, cele temperatury, pomiary Setti+, warunki i licznik gazu, eksperymenty oraz historię. Temperatura zewnętrzna dla Katowic jest pobierana automatycznie z Open-Meteo; odczyty gazomierza i nastawy wpisuje się ręcznie, a aktualne pomiary Setti+ aplikacja pobiera z publicznego pliku JSON w gałęzi `setti-data`. Aplikacja nie steruje urządzeniami.

## Wersja 1.2 · Gaz i pogoda

Zakładka **Gaz i pogoda** pobiera temperaturę godzinową dla Katowic z Open-Meteo (dane modelowe, nie pomiary stacji), po uruchomieniu aplikacji i na żądanie. Archiwum obejmuje do roku wstecz, w miarę dostępności API i internetu. Dane pogodowe i odczyty użytkownika pozostają lokalnie w aplikacji.

- Jednorazowy import historii ORLEN: skopiuj wiersze `RRRR-MM-DD;nowy;100` (lub `stary` dla poprzedniego gazomierza) do pola **Wklej wiele odczytów ORLEN**. Brak dokładnej godziny jest zapisywany jako 12:00 i statystyki takiej doby są orientacyjne. Import dopisuje dane, nie zastępuje poprzednich wpisów.
- Dwa odczyty z tego samego licznika dają m³ w okresie i m³/dobę; nigdy nie odejmuje się odczytów różnych liczników.
- Przy ≥75% dostępności godzin pomiarowych pokazuje średnią temperaturę zewnętrzną i m³ na stopniodzień przy **stałej temperaturze odniesienia 21,5°C**. Wskaźnik nie oznacza sprawności pieca ani nie rozdziela podgrzewania wody i ogrzewania.
- Historię zmian nastawy ENGO wprowadza się oddzielnym formularzem z datą, np. zmiana w czasie eksperymentu. Nie są pobierane dane z ENGO ani z ORLEN.
- Offline dotychczasowe dane działają dalej. Nowej pogody ani nowych pomiarów Setti+ aplikacja nie pobierze bez internetu.
- Automatyczne pomiary Setti+ służą tylko do odczytu; po 20 minutach od ostatniej synchronizacji oznaczane są jako nieaktualne. Można nadal wprowadzać własne pomiary ręcznie.
- Przy nowym bieżącym odczycie gazu (nie przy imporcie ORLEN) aplikacja zapisuje lokalnie także migawkę sześciu pomiarów Setti+, jeśli są aktualne. Czas synchronizacji nie jest gwarantowanym czasem fizycznego pomiaru.
- Publiczne temperatury i wilgotność są odczytywane z `https://raw.githubusercontent.com/dszak/moje-ogrzewanie/setti-data/pomiary.json` bez jakichkolwiek tokenów w aplikacji. GitHub ani MacBook nie otrzymują historii gazu.

## Wersja 1.3.1 · czytelna historia gazu na telefonie

Na ekranach o szerokości do 640 px historia odczytów gazomierza jest wyświetlana jako karty z datą, wartością w m³, źródłem i — jeśli dostępne — rozwijanymi pomiarami sześciu pomieszczeń. Na większych ekranach pozostaje tabela z możliwością przewijania poziomego. Zmiana dotyczy tylko wyglądu: nie modyfikuje formatu danych, klucza zapisu ani historii.

## Wersja 1.4.0 · panel ogrzewania i bezpieczne poprawki

Zakładka **Panel ogrzewania** łączy w jednym widoku temperaturę i wilgotność w sześciu pomieszczeniach, osiem głowic TRV001 oraz ręcznie zapisane wartości ENGO i kotła. Pomiary Setti+ są pobierane tylko do odczytu z `pomiary.json`, a głowice z publicznego `https://raw.githubusercontent.com/dszak/moje-ogrzewanie/setti-data/glowice.json`.

- Każda z ośmiu głowic pokazuje temperaturę przy głowicy, temperaturę zadaną, kalibrację i dosłowną wartość `mode_raw`. Dane głowic nie są tożsame z temperaturą pomieszczenia. Nieaktualne odczyty są oznaczone, a stare nie są udawane jako bieżące.
- Głowice i czujniki odświeżają się przy uruchomieniu, co 5 minut oraz na żądanie, bez tokenów i logowania do Setti+/Tuya.
- ENGO Smart i temperatura kotła pozostają **wpisami ręcznymi**. Panel nie wydaje żadnych poleceń urządzeniom.
- Odczyty gazu z formularza i historii mogą być indywidualnie **edytowane lub usuwane** po potwierdzeniu. Każda poprawka jest odnotowana w historii zmian. W przypadku połączonej obserwacji pogody usunięcie jej wartości gazu pozostawia pozostałe informacje pogodowe.
- Nowe odczyty gazu są potwierdzane przed zapisaniem. Import ORLEN nadal tylko dopisuje dane bez zastępowania istniejących.
- Zakładka Gaz i pogoda posiada osobne **porównania dobowe**, wyszukujące odczyt najbliższy 24 godzinom wstecz (przyjmowany odstęp: 18–30 godzin), nawet jeśli wystąpiły pomiary pośrednie. Porównanie odbywa się wyłącznie między odczytami tego samego gazomierza. Krótsze niż 18 godzin okresy prezentują przeliczenie m³/dobę z oznaczeniem **szac.**; jest to tempo orientacyjne, nie obserwacja całej doby.
- Pogoda jest odświeżana po otwarciu aplikacji, po jej przywróceniu na ekran i po ponownym połączeniu z internetem — jeżeli poprzednie pobranie było co najmniej 12 godzin wcześniej. Przycisk ręczny pozostaje jako opcja awaryjna.
- Tekst i opisy na telefonie zostały powiększone, a panel korzysta z czytelnych kart bez wykresów.
- Nie zmieniono klucza zapisu `moje-ogrzewanie-data-v1`, struktury lokalnych danych, istniejących pomieszczeń, identyfikatorów ani dotychczasowej historii. GitHub nie otrzymuje prywatnych odczytów gazu.

### Zaplanowane oddzielnie na wersję 1.5.0

Interaktywne oznaczanie drzwi na lokalnej mapie mieszkania oraz trzy poziomy subiektywnego komfortu (obniżony komfort, optymalnie, przegrzanie). Te funkcje wymagają osobnego projektu interfejsu i testów bezpiecznej rozbudowy zapisu — **nie są jeszcze wprowadzone**.

## Uruchomienie i publikacja

Aplikacja nie wymaga instalowania bibliotek. Podgląd: `python3 -m http.server 8765 --directory public`. Otwórz `http://localhost:8765`.

Publikacja wymaga uprzedniej zgody właściciela. Proponowana nazwa repozytorium: `moje-ogrzewanie`.
Po utworzeniu repozytorium włączyć Settings → Pages → Source: GitHub Actions. Wysłać sprawdzoną wersję na gałąź `main`. Workflow sprawdza testy, przygotowuje wyłącznie dozwolone pliki z `public/` i publikuje Pages. Adres należy odczytać z zakończonego wdrożenia, nie zgadywać.

## Kolejne aktualizacje

1. Użytkownik opisuje zmianę w tym projekcie, z dostępem agenta do repozytorium GitHub.
2. Agent przygotowuje gałąź, poprawkę, testy i propozycję zmian (pull request).
3. Użytkownik zatwierdza konkretną wersję. Dopiero wtedy agent scala ją do `main`.
4. GitHub Actions automatycznie sprawdza i publikuje wersję. Agent weryfikuje wynik i podaje adres.
5. Aplikacja pobiera aktualizację w tle. Należy zamknąć wszystkie jej karty i ponownie otworzyć aplikację, aby włączyć nową wersję.

Nigdy nie publikować prywatnych kopii, planu mieszkania ani pierwotnego ZIP-a. Dostęp do GitHub musi umożliwiać zapis; samo odczytywanie repozytorium nie wystarczy. Zgoda na pierwszą publikację nie jest zgodą na dowolne przyszłe aktualizacje.

## Dane i kopie

Dane są lokalne; GitHub otrzymuje kod, nie wpisy użytkownika. Brak analityki i zewnętrznych bibliotek. Publiczny kod nie zawiera dokładnego adresu, geometrii mieszkania ani planu. Zakładka Mapa pozwala dodać lokalny plik SVG/PNG/JPEG (do 2 MB), zawarty następnie w kopii JSON.

- Ustawienia → Pobierz kopię JSON: zapisz w Plikach / iCloud, najlepiej po każdym eksperymencie. CSV zawiera tylko pomiary, nie pełną kopię.
- Ustawienia → Wczytaj kopię JSON: po potwierdzeniu zastępuje dane, zachowując poprzedni poprawny zapis jako lokalną kopię odzyskiwania.
- Lokalna kopia odzyskiwania powstaje przy zmianie danych, o ile wystarczy pamięci. Nie zastępuje pliku poza przeglądarką.
- Aktualizacje pod tym samym adresem zachowują klucz i format danych. Nie zmieniać domeny ani adresu instalacji bez planu migracji.
- Wersja 1.0 jest zgodna z importem. Gdy działała pod innym adresem lub jako plik, wyeksportuj z niej JSON i zaimportuj do nowej aplikacji. Paczka ZIP nie zawiera historii przechowywanej w przeglądarce.
- Safari i aplikacja z ekranu początkowego mogą korzystać z odrębnego zapisu. W razie potrzeby przenieś dane kopią JSON.
- Pamięć przeglądarki nie gwarantuje przetrwania czyszczenia danych, utraty telefonu ani usunięcia aplikacji. Przycisk „Chroń zapis na urządzeniu” wysyła prośbę; przeglądarka może odmówić.
- Nie ma synchronizacji między urządzeniami. Publiczne aplikacje pod tym samym hostem Pages współdzielą pochodzenie przeglądarki; na tym hoście utrzymuj tylko zaufany kod.

## iPhone

Po publikacji otwórz HTTPS w Safari → Udostępnij → Do ekranu początkowego (włącz otwieranie jako aplikacja, jeśli widoczne) → Dodaj. Uruchom z nowej ikony, zapisz testowy pomiar i kopię JSON. Zamknij i otwórz ponownie; potem sprawdź tryb samolotowy. Pierwsze otwarcie musi odbyć się online.

Przygotowano manifest, ikony, obszary bezpieczne ekranu, pola 16 px, przyciski dotykowe i pamięć offline. Test na prawdziwym iPhonie i test publicznego wdrożenia pozostają do wykonania po zatwierdzeniu publikacji.

## Weryfikacja

`node --test tests/*.test.cjs`

`python3 scripts/check.py`

`python3 scripts/package.py`

Testy obejmują funkcje ogrzewania, zachowanie danych, import starej wersji, uszkodzone kopie, brak miejsca, konflikt kart, odzyskiwanie i historię. Pakiet publikacyjny powstaje w `dist/`; kopie użytkownika są wykluczone.

Dokumentacja: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [instalacja na iPhonie](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios), [trwałość pamięci WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/).
