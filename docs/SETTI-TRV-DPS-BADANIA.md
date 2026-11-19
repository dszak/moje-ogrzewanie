# SETTI+ TRV001 — rozpoznawanie danych DPS

> Stan badań: **19 listopada 2026 r.** Moduł `scripts/trv_dps_history.py` pozostaje niezależnym prototypem (nie jest wywoływany przez produkcyjny mostek). **Działający mostek `setti_bridge.py` już samodzielnie zapisuje prywatne obserwacje DPS 119 i statusów głowic** do lokalnych plików JSONL. Nie uruchamiać drugiej sesji Tuya ani nie dublować zapisów. Żaden z tych mechanizmów nie steruje kotłem.

## Wynik badań na ośmiu rzeczywistych głowicach

Mostek SETTI+ ma już jedną używaną sesję chmury. `session.devices()` zwraca komplet danych i identyfikuje osiem głowic `TRV1`–`TRV8`, typ `wk`. Dotychczas publikowane są do Home Assistant/GitHuba tylko temperatura (DPS 102), nastawa (103), korekta (27) i surowy tryb (3).

Dla wszystkich G1–G8 zidentyfikowano 32 klucze DPS. W szczególności `119`, `120`, `121`, `122` to pola tekstowe. **DPS 119** został zweryfikowany na wszystkich ośmiu głowicach jako **kanoniczny Base64 zawierający dokładnie 24 bajty z zakresu 0–100**. Porównania z ekranami aplikacji SETTI+ potwierdzają, że **DPS 119 odpowiada godzinowym słupkom wykresu „Czas ogrzewania (%)”** (obserwowano zgodność niskich wartości, zera i 100). Jest to zgodność danych wyświetlanych, **nie dowód, że procent to bieżąca pozycja zaworu, czas fizycznego przepływu wody albo czas pracy palnika**.

Użytkownik obserwował, że podczas pojedynczego 7-minutowego cyklu ENGO grzejniki G3 i G4 w kuchni stawały się gorące tylko u góry po stronie zasilania, mimo wcześniejszego DPS 119 równego zero, a G5 pozostawał zimny. Dlatego **nie wolno nazywać pojedynczej wartości historycznej bieżącym ON/OFF ani na jej podstawie sterować kotłem**.

Sekwencja zmian indeksów wskazuje z dużą pewnością, że **indeks 0 odpowiada przedziałowi 00:00–01:00, indeks 1 — 01:00–02:00 itd., a wartość pojawia się po zakończeniu godziny** w strefie lokalnej. Potrzebne jest jeszcze potwierdzenie na pełnej dobie, po północy i przy zmianie czasu (23/25 godzin). Niezapisane/przyszłe godziny muszą być oznaczane jako **nieznane**, nie jako pewne 0. Nadal nieustalone: algorytm procentów, znaczenie DPS 120–122 i wiarygodny stan zaworu w konkretnej chwili.

## Dokumentacja wariantu Zigbee

Oficjalna dokumentacja [Zigbee2MQTT Saswell SEA801/SEA802](https://www.zigbee2mqtt.io/devices/SEA801-Zigbee_SEA802-Zigbee.html) wymienia **SETTI+ TRV001** jako produkt white-label; w takim wariancie Zigbee2MQTT udostępnia `heating` oraz `climate.running_state` (`idle`/`heat`), `battery_low`, `anti_scaling` itd. **Nie znaczy to, że obecna bramka SETTI+ i mostek chmurowy udostępniają te same pola**; nie ma obecnie danych `zigbee2mqtt/...` w HA. Zmiana koordynatora/parowania nie jest częścią eksperymentu.

[Mapa DPS konkretnego produktu `_TZE200_9m4kmbfu`](https://gist.github.com/alufers/05a15106d71b78af35dd90c0989dbac9) wskazuje:
- `3`: surowy stan pracy `work_state` (obecna wartość `standy`, bez interpretacji)
- `8`, `10`, `40`, `101`, `106`, `108`, `130`: pola logiczne wymagające walidacji semantyki
- `104`: opisywany w mapach społecznościowych niejednolicie (m.in. `Heating Time` / `valve_position` w różnych wariantach integracji). **W aktualnym odczycie chmurowym wszystkie 904 wartości z 113 migawek × 8 głowic wyniosły 0**, także podczas rzeczywistego nagrzewania grzejników; parametr nie sprawdził się jako bieżące położenie zaworu.
- `105`: alarm baterii; surowy kod/typ wymaga sprawdzenia
- `110`, `112`–`114`: historia temperatury zadanej
- `115`–`118`: historia temperatury zmierzonej
- `119`–`122`: historia otwarcia silnika zaworu (dzień/tydzień/miesiąc/rok)
- `123`–`129`: dane harmonogramów; **nie publikować bez uzasadnienia, nawet w wersji tylko do odczytu**

## Moduł badawczy na gałęzi

`scripts/trv_dps_history.py`:
1. Przyjmuje wyłącznie **już pobrany** słownik `devices`; sam nie loguje się i nie wysyła żadnych żądań do Tuya.
2. Waliduje dokładnie jedną głowicę na indeks G1–G8.
3. Dekoduje DPS 119 jako 24 wartości 0–100; błędy i brak danych **nie stają się zerem**.
4. Zwraca wyłącznie zatwierdzone pola skalarne i zdekodowaną historię, bez kluczy i identyfikatorów.
5. Opcjonalnie dopisuje ustrukturyzowane migawki JSONL do lokalnego pliku, z prawami dostępu `0600`; ścieżkę wybiera świadomie operator **poza folderem publicznego repozytorium**.

Testy offline: `python3 -m unittest discover -s tests -p 'test_trv_dps_history.py' -v`. Dane testowe są syntetyczne.

## Wyniki uzupełniające i nierozstrzygnięte problemy (19.11.2026)

- **DPS 3, 101, 104 i 108:** w 84 obserwacjach statusów wszystkich głowic nie zanotowano zmian (`3=standy`, `101=true`, `104=0`, `108=false`). Nie wolno traktować tych stałych wartości jako sygnału bieżącego `otwarte/zamknięte`.
- **DPS 119:** przy fizycznej obserwacji ciepłego grzejnika w trakcie żądania ogrzewania, odpowiadający mu wskaźnik za zamkniętą godzinę pozostawał 0. **Zero nie potwierdza zamkniętego zaworu ani braku przepływu**. Dane i znaczniki czasu z poszczególnych głowic są w prywatnej dokumentacji, nie publikujemy ich w tym repozytorium.
- **Niezależne kanały obserwacji:** stan ENGO ON/OFF (żądanie c.o.), temperatura głowicy, temperatura pokojowa, DPS 119 (historia) oraz fizyczna temperatura grzejnika to odrębne wielkości. Żadna z nich pojedynczo nie stanowi pomiaru rzeczywistej pracy palnika.
- **Wysłano pytanie do producenta SETTI+** o możliwość odczytu bieżącego otwarcia zaworu 0–100% przez oryginalną bramkę/Tuya i identyfikator właściwego DPS. Odpowiedź oczekiwana, **nie zakładać istnienia takiego DPS**.

## Stan wdrożenia i dalsze kroki

1. Zachować istniejący pasywny zapis w jednej sesji Tuya; **nie wdrażać równolegle prototypu**, jeżeli dublowałby to samo.
2. Przed uznaniem osi czasu DPS 119 za ostateczną zweryfikować północ i zmianę czasu `Europe/Warsaw` oraz odróżnić wartości niewypełnione od rzeczywistych zer.
3. Oczekiwać na odpowiedź producenta o bieżącym stanie zaworu; do tego czasu **nie sterować kotłem na podstawie DPS 119 ani DPS 104**. Nie powtarzać bez celu prób z nastawami.
4. Jeśli odpowiedź wykaże dostępny sygnał, przetestować go **tylko do odczytu** w istniejącej sesji i zestawić z fizycznym zachowaniem grzejnika; nie utożsamiać deklarowanego otwarcia z pomiarem przepływu.
5. Szczegółowe dzienne historie głowic przechowywać **prywatnie**; publiczne `glowice.json` pozostaje tylko migawką stanu bez historii gospodarstwa.

**Zasada:** WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ. Komfort i bezpieczeństwo przed optymalizacją; żadnych automatycznych zmian nastaw na podstawie niepotwierdzonego parametru.
