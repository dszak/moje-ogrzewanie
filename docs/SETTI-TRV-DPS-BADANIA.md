# SETTI+ TRV001 — rozpoznawanie danych DPS

> Etap badawczy, 18 listopada 2026 r. Kod w `scripts/trv_dps_history.py` jest niezależnym modułem **wyłącznie do odczytu** i nie działa jeszcze w produkcyjnym moście `setti_bridge.py`. Nie zmienia nastaw ani nie steruje kotłem.

## Wynik badań na ośmiu rzeczywistych głowicach

Mostek SETTI+ ma już jedną używaną sesję chmury. `session.devices()` zwraca komplet danych i identyfikuje osiem głowic `TRV1`–`TRV8`, typ `wk`. Dotychczas publikowane są do Home Assistant/GitHuba tylko temperatura (DPS 102), nastawa (103), korekta (27) i surowy tryb (3).

Dla wszystkich G1–G8 zidentyfikowano 32 klucze DPS. W szczególności `119`, `120`, `121`, `122` to pola tekstowe. **DPS 119** został zweryfikowany na wszystkich ośmiu głowicach jako **kanoniczny Base64 zawierający dokładnie 24 bajty z zakresu 0–100**. Porównanie G5 (salon, zwykle ok. 70–75) z G6 (salon, same zera) jest zgodne z wykresami SETTI+. To silna przesłanka, że zapis dotyczy historycznego wskaźnika otwarcia mechanizmu, ale nie dowód pomiaru przepływu wody.

Użytkownik obserwował, że podczas pojedynczego 7-minutowego cyklu ENGO grzejniki G3 i G4 w kuchni stawały się gorące tylko u góry po stronie zasilania, mimo wcześniejszego DPS 119 równego zero, a G5 pozostawał zimny. Dlatego **nie wolno nazywać pojedynczej wartości historycznej bieżącym ON/OFF ani na jej podstawie sterować kotłem**.

Nie potwierdzono jeszcze przesunięcia / strefy czasowej indeksów 0–23, zasad uzupełniania godzin bieżących, znaczenia agregatów 120–122, jednostek innych pól ani wiarygodnego stanu zaworu w danej sekundzie. Pola 0–100 mogą odzwierciedlać pozycję silnika, ale nie są automatycznie procentem mocy, przepływu ani czasu pracy kotła.

## Dokumentacja wariantu Zigbee

Oficjalna dokumentacja [Zigbee2MQTT Saswell SEA801/SEA802](https://www.zigbee2mqtt.io/devices/SEA801-Zigbee_SEA802-Zigbee.html) wymienia **SETTI+ TRV001** jako produkt white-label; w takim wariancie Zigbee2MQTT udostępnia `heating` oraz `climate.running_state` (`idle`/`heat`), `battery_low`, `anti_scaling` itd. **Nie znaczy to, że obecna bramka SETTI+ i mostek chmurowy udostępniają te same pola**; nie ma obecnie danych `zigbee2mqtt/...` w HA. Zmiana koordynatora/parowania nie jest częścią eksperymentu.

[Mapa DPS konkretnego produktu `_TZE200_9m4kmbfu`](https://gist.github.com/alufers/05a15106d71b78af35dd90c0989dbac9) wskazuje:
- `3`: surowy stan pracy `work_state` (obecna wartość `standy`, bez interpretacji)
- `8`, `10`, `40`, `101`, `106`, `108`, `130`: pola logiczne wymagające walidacji semantyki
- `104`: `Heating Time`; w jednym porównaniu G5/G6 oba wynosiły 0, zatem **nie jest potwierdzonym wskaźnikiem bieżącego położenia**
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

## Plan weryfikacji, zanim włączymy do aplikacji

1. Zweryfikować parser i testy offline, zabezpieczyć prywatną ścieżkę archiwum, dostęp i retencję.
2. **Nie** uruchamiać drugiej sesji SETTI+. Po zgodzie operatora dodać wywołanie `make_snapshot(devices)` do istniejącej pętli mostka i najpierw jednorazowo sprawdzić poprawność lokalnego zapisu. Restart mostka wyłącznie w kontrolowanym momencie.
3. Sprawdzić kolejność godzin: porównać indeksy DPS119 z wykresem SETTI+ przez pełną dobę, datę lokalną `Europe/Warsaw` i zmianę czasu. Niezebrane godziny oznaczać jako **nieznane**, nie jako pewne 0.
4. Osobno ocenić DPS3/104/105 i format 110–118/120–122. Dopiero po potwierdzeniu mapować `heating`/otwarcie na nową encję HA.
5. Docelowe dane archiwalne przekazywać przez szyfrowaną historię HA lub **prywatne** repozytorium; w publicznym `glowice.json` nie ujawniać historii gospodarstwa. W aplikacji osobno prezentować bieżący stan, historyczny wskaźnik zaworu, ENGO (żądanie), temperatury i jakość danych.

**Zasada:** WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ. Komfort i bezpieczeństwo przed optymalizacją; żadnych automatycznych zmian nastaw na podstawie niepotwierdzonego parametru.
