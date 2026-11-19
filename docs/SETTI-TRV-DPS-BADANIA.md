# SETTI+ TRV001 — rozpoznawanie danych DPS

> Stan badań: **19 listopada 2026 r.** Moduł `scripts/trv_dps_history.py` pozostaje niezależnym prototypem (nie jest wywoływany przez produkcyjny mostek). **Działający mostek `setti_bridge.py` już samodzielnie zapisuje prywatne obserwacje DPS 119 i statusów głowic** do lokalnych plików JSONL. Nie uruchamiać drugiej sesji Tuya ani nie dublować zapisów. Żaden z tych mechanizmów nie steruje kotłem.

## Wynik badań na ośmiu rzeczywistych głowicach

Mostek SETTI+ ma już jedną używaną sesję chmury. `session.devices()` zwraca komplet danych i identyfikuje osiem głowic `TRV1`–`TRV8`, typ `wk`. Dotychczas publikowane są do Home Assistant/GitHuba tylko temperatura (DPS 102), nastawa (103), korekta (27) i surowy tryb (3).

Dla wszystkich G1–G8 zidentyfikowano 32 klucze DPS. W szczególności `119`, `120`, `121`, `122` to pola tekstowe. **DPS 119** został zweryfikowany na wszystkich ośmiu głowicach jako **kanoniczny Base64 zawierający dokładnie 24 bajty z zakresu 0–100**. Porównania z ekranami aplikacji SETTI+ potwierdzają, że **DPS 119 odpowiada godzinowym słupkom wykresu „Czas ogrzewania (%)”** (obserwowano zgodność niskich wartości, zera i 100). Jest to zgodność danych wyświetlanych, **nie dowód, że procent to bieżąca pozycja zaworu, czas fizycznego przepływu wody albo czas pracy palnika**.

W badaniu fizycznego nagrzewania grzejników zanotowano przypadki, gdy historyczny DPS 119 pozostawał równy zero, mimo obserwowanego dopływu ciepła. Dane, które grzejniki i w których chwilach dotyczyły obserwacji, są przechowywane tylko prywatnie. Dlatego **nie wolno nazywać pojedynczej wartości historycznej bieżącym ON/OFF ani na jej podstawie sterować kotłem**.

Sekwencja zmian indeksów wskazuje z dużą pewnością, że **indeks 0 odpowiada przedziałowi 00:00–01:00, indeks 1 — 01:00–02:00 itd., a wartość pojawia się po zakończeniu godziny** w strefie lokalnej. Potrzebne jest jeszcze potwierdzenie na pełnej dobie, po północy i przy zmianie czasu (23/25 godzin). Niezapisane/przyszłe godziny muszą być oznaczane jako **nieznane**, nie jako pewne 0. Nadal nieustalone: algorytm procentów, znaczenie DPS 120–122 i wiarygodny stan zaworu w konkretnej chwili.

## Identyfikacja produktu i weryfikacja kodu ZHA (19.11.2026)

**Potwierdzone lokalnie, tylko do odczytu:** osiem głowic G1–G8 zgłasza ten sam `product_id = 9m4kmbfu`. Odczyt pochodzi z **istniejącej sesji** `session.devices()` mostka SETTI+, bez ponownego parowania i bez zmian nastaw. Nie jest to indywidualny identyfikator urządzenia, lecz identyfikator produktu wspólny dla wszystkich ośmiu głowic. Przy odczycie potwierdzono obecność pól `category`, `dps`, `id`, `local_key`, `product_id`, `uuid`; wartości sekretów i unikalnych identyfikatorów **nie zostały opublikowane**. Lokalny plik `trv-product-ids.json` zawiera wyłącznie produktowe PID, a `trv-device-field-names.json` — nazwy pól.

**Dopasowanie do źródeł:** [Blakadder — SETTI+ TRV001](https://zigbee.blakadder.com/SETTI_TRV001.html) podaje `_TZE200_9m4kmbfu`; kod [ZHA `zhaquirks/tuya/tuya_trv.py`](https://github.com/zigpy/zha-device-handlers/blob/dev/zhaquirks/tuya/tuya_trv.py) ma `.applies_to("_TZE200_9m4kmbfu", "TS0601")` **w tym samym bloku mapowania**, w którym figurują następujące DP:

| DP | Interpretacja ZHA | Zestawienie z dotychczasowym odczytem przez SETTI+/Tuya |
| --- | --- | --- |
| 3 | `running_state`; kod ZHA oczekuje wartości logicznej i zamienia ją na `heat/idle` | Chmura zwraca tekst `standy`; brak poprawnego bieżącego stanu w naszych badaniach |
| 101 | `system_mode` (`heat/off`) | Chmura zwracała stale `true`; nie jest to stan przepływu ani pozycja zaworu |
| **104** | **`valve_position`, `int16s`, `divisor=10`, jednostka %** | **904 lokalne odczyty chmurowe = 0**, również przy fizycznym nagrzewaniu; nie uznawać za wiarygodny live procent otwarcia |
| 105 | `battery_low` | Interpretacja możliwa wg ZHA, wymagane osobne sprawdzenie w kanale chmurowym |
| 102 / 103 | Temperatura głowicy / nastawa | Potwierdzone lokalnie w istniejącym moście |

**Granica wiarygodności:** dopasowanie PID oraz mapy ZHA dotyczy protokołu urządzenia obsługiwanego przez ZHA i **nie dowodzi**, że fabryczna bramka SETTI+ udostępnia przez chmurę identyczne, aktualne i prawidłowo przeliczone stany. `DPS 104 = 0` nie dowodzi fizycznego zamknięcia zaworu. Nie zmieniać bramki ani nie wdrażać sterowania na podstawie tych pól. Odpowiedź producenta na pytanie o bieżący % otwarcia jest nadal oczekiwana.

## Dokumentacja wariantu Zigbee

Oficjalna dokumentacja [Zigbee2MQTT Saswell SEA801/SEA802](https://www.zigbee2mqtt.io/devices/SEA801-Zigbee_SEA802-Zigbee.html) wymienia **SETTI+ TRV001** jako produkt white-label; w takim wariancie Zigbee2MQTT udostępnia `heating` oraz `climate.running_state` (`idle`/`heat`), `battery_low`, `anti_scaling` itd. **Nie znaczy to, że obecna bramka SETTI+ i mostek chmurowy udostępniają te same pola**; nie ma obecnie danych `zigbee2mqtt/...` w HA. Zmiana koordynatora/parowania nie jest częścią eksperymentu.

[Mapa DPS konkretnego produktu `_TZE200_9m4kmbfu`](https://gist.github.com/alufers/05a15106d71b78af35dd90c0989dbac9) wskazuje:
- `3`: surowy stan pracy `work_state` (obecna wartość `standy`, bez interpretacji)
- `8`, `10`, `40`, `101`, `106`, `108`, `130`: pola logiczne wymagające walidacji semantyki
- `104`: opisywany w mapach społecznościowych niejednolicie (m.in. `Heating Time` / `valve_position` w różnych wariantach integracji). **W długotrwałym lokalnym odczycie chmurowym parametr pozostawał równy 0 na wszystkich głowicach**, także podczas rzeczywistego nagrzewania grzejników; nie sprawdził się jako bieżące położenie zaworu. Liczby i historia odczytów wyłącznie w prywatnym protokole.
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

- **DPS 3, 101, 104 i 108:** w lokalnej serii obserwacji statusów wszystkich głowic nie zanotowano zmian (`3=standy`, `101=true`, `104=0`, `108=false`). Nie wolno traktować tych stałych wartości jako sygnału bieżącego `otwarte/zamknięte`.
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
