# Baza wiedzy technicznej — nie odkrywać ogrzewania od nowa

> Stan przeglądu źródeł: 15.11.2026. Źródła publiczne, bez prywatnych pomiarów i informacji o mieszkaniu. Weryfikować przed istotną decyzją techniczną. Dokument rozwija [najważniejsze zasady projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md).

## Podstawowa reguła epistemiczna

**Dwa odrębne zasoby wiedzy:**

1. **Ustalenia z literatury i danych technicznych** — fizyka ogrzewania, ograniczenia regulatorów, normy, badania terenowe. Pozwalają sformułować uzasadnione hipotezy, wskazać najbardziej obiecujące kierunki badań i uniknąć błędów metodologicznych.
2. **Ustalenia empiryczne dotyczące konkretnej instalacji** — pomiary, opis warunków, porównania, wyniki udanych i nieudanych prób. Tylko one mogą potwierdzić, czy w tej instalacji osiągnięto korzyść i w jakich warunkach.

Nie traktować żadnego uśrednionego wskaźnika oszczędności z internetu jako wyniku lokalnego eksperymentu. Źródła i data przeglądu muszą podróżować z eksportem do ChatGPT.

## Źródła wstępne i ich zastosowanie

### 1. BRÖTJE QWHC 20/24 — producent

[Oficjalna karta QWHC 20–30](https://www.broetje.pl/produkty/kotly-kondensacyjne/qwhc-20-30/).

- Model QWHC 20/24 to **kondensacyjny kocioł dwufunkcyjny**, producent podaje moc cieplną c.o. 20 kW. Ogrzewanie oraz podgrzewanie ciepłej wody użytkowej mają różne funkcje.
- Dlatego badania efektywności kondensacji są **istotne dla tego typu kotła**. Należy rozróżniać nastawy temperatury zasilania c.o. i c.w.u.
- Ograniczenia: sama tabliczka znamionowa nie mówi, z jaką mocą pracuje konkretny kocioł, jaką ma temperaturę powrotu ani czy palnik moduluje poprawnie. Serwisowe zmiany mocy, układu gazowego i zabezpieczeń są zadaniem uprawnionego serwisu.

### 2. ENGO E901WiFi — producent

[Oficjalna karta E901-WIFI](https://engocontrols.com/produkt/e901-wifi/).

- Odbiornik działa przez przekaźnik NO/COM; regulator wspiera **algorytm TPI albo histerezę**. Tryb aktywny w konkretnej instalacji trzeba osobno sprawdzić.
- Zarejestrowane przełączenia ENGO to **zapotrzebowanie regulatora**, nie dowód ciągłej pracy palnika. Zwłaszcza przy TPI cykliczne zapotrzebowanie może być zamierzoną strategią regulacji.
- Badanie powinno rozróżniać: stan ENGO, rzeczywistą pracę palnika, temperaturę przy czujniku sterującym i pozostałe pomieszczenia.

### 3. Nesta — terenowe badanie zaleceń temperatury zasilania

[Nesta, 2023 — The impact of boiler optimisation on gas consumption and household comfort](https://www.nesta.org.uk/report/the-impact-of-boiler-optimisation-on-gas-consumption-and-household-comfort/).

- Randomizowane badanie z udziałem ok. 61 tys. użytkowników aplikacji pomiarowej: **sezonowo dostosowywane zalecenia** obniżania temperatury zasilania przyniosły niewielkie, ale statystycznie istotne zmniejszenie dobowego zużycia gazu w porównaniu z grupą kontrolną; nie stwierdzono istotnej różnicy w zgłaszanym dyskomforcie.
- Oddzielić **wpływ udzielenia porady** od rzeczywistego oszczędzania każdego domu. Nie wszyscy odbiorcy musieli zastosować sugerowane nastawy.
- Badania popularnego przypadku 80→60°C **nie można użyć jako prognozy procentowej dla kotła, który już pracuje przy znacznie niższej temperaturze zasilania**.
- Inspiracja: testy w porównywalnych warunkach pogodowych i stałym komforcie; nie automatyczne obniżanie temperatury dla wszystkich lokali.

### 4. Energy Saving Trust — praktyka temperatury zasilania

[Energy Saving Trust, „Should I turn my boiler's flow temperature down?”](https://energysavingtrust.org.uk/should-i-turn-boilers-flow-temperature-down/).

- Niższa temperatura powrotu w kotle kondensacyjnym może poprawiać wykorzystanie ciepła spalin; jednocześnie niższa temperatura zasilania obniża oddawanie ciepła przez grzejniki.
- Eksperyment jest korzystny tylko wtedy, gdy utrzymuje komfort i daje wiarygodną poprawę kosztową; nie robić zmian przed sprawdzeniem typu kotła i oddzielnego sterowania CWU.
- Jeśli ogrzewanie nie wyrabia podczas mrozów, należy zrezygnować z testowej nastawy lub przywrócić bezpieczną bazę.

### 5. CIBSE — oddawanie ciepła przez grzejniki

[CIBSE Journal, 2022: radiator output versus flow/return/room temperature](https://portfolio.cpl.co.uk/CIBSE/202204/48/).

- Moc grzejnika nie jest stałą liczbą: zależy od temperatury wody na zasilaniu, temperatury powrotu, temperatury powietrza i parametrów danego modelu.
- Niezbędne dane do obliczania mocy: typ/model i jego moc nominalna według EN 442, parametry wody i straty ciepła pomieszczenia. Same wymiary mogą być niewystarczające.
- Przed obniżeniem temperatury wody sprawdzić, które pomieszczenie staje się „ograniczeniem” całej instalacji.

### 6. Citizens Advice — głowice i regulator pokojowy

[Citizens Advice — Save money heating your home](https://www.citizensadvice.org.uk/consumer/energy/energy-supply/save-energy-at-home/heat-your-home-efficiently/).

- Jeśli głowica w pomieszczeniu głównego termostatu zamknie grzejnik przed osiągnięciem nastawy termostatu, żądanie grzania może się nadmiernie wydłużać.
- Odwrotny problem: gdy pomieszczenie z termostatem dogrzewa się szybciej niż inne, termostat może zakończyć zapotrzebowanie, pozostawiając pokoje niedogrzane.
- Weryfikacja polega na analizie danych głowic, nastaw i temperatur w sześciu pomieszczeniach, nie na losowym kręceniu zaworami.
- Układ obejścia, przepływu i równoważenia hydraulicznego wymaga fachowego sprawdzenia.

### 7. ASHRAE — normalizacja gazu względem pogody

[ASHRAE Handbook, Energy Use and Management](https://handbook.ashrae.org/Handbooks/A15/SI/A15_CH36/a15_ch36_si.aspx).

- Do porównywania energii używa się stopniodni ogrzewania oraz statystycznych modeli zużycia w zależności od temperatury.
- **Punkt równowagi cieplnej budynku** nie musi być równy temperaturze ustawionej na termostacie. Zwykłe „m³ / stopniodzień” przy nieznanym punkcie bazowym to wskaźnik pomocniczy, nie dowód oszczędności.
- Przed wyznaczaniem oszczędności potrzebna odpowiednio długa seria pomiarów, kontrole jakości, oznaczenie CWU, porównanie podobnych okresów i informacja o niepewności.

### 8. PN-EN 12831-1:2017-08 — projektowe straty ciepła

[PKN — zakres normy](https://sklep.pkn.pl/pn-en-12831-1-2017-08e.html).

- Norma dotyczy wyznaczania projektowego obciążenia cieplnego pomieszczeń i budynków.
- To podstawa do oceny, czy moc grzejników jest wystarczająca wobec strat ciepła i wentylacji.
- Bez danych o przegrodach, oknach, wentylacji i parametrach grzejników nie wolno tworzyć pozornie precyzyjnego projektu.

### 9. Energy Saving Trust — izolacja strychu

[Energy Saving Trust — How to insulate a loft](https://energysavingtrust.org.uk/how-to-insulate-a-loft).

- Izolacja stropu nad pomieszczeniami wpływa na ich straty cieplne.
- Nie stosować procentów utraty ciepła typowych dla **całkowicie nieocieplonych dachów** do budynków o innym stanie izolacji.
- Różnice między pomieszczeniami mogą wynikać z lokalnego docieplenia, wentylacji i zysków ciepła — nie tylko z ustawień grzejników.

## SETTI+ TRV001 — interpretacja historii DPS (uzupełnienie 19.11.2026)

**Źródła:** [dokumentacja Zigbee2MQTT dla wariantu SEA801/SEA802](https://www.zigbee2mqtt.io/devices/SEA801-Zigbee_SEA802-Zigbee.html), [społecznościowa mapa DPS wariantu `_TZE200_9m4kmbfu`](https://gist.github.com/alufers/05a15106d71b78af35dd90c0989dbac9) oraz **osobne wyniki badań własnych** w [SETTI-TRV-DPS-BADANIA.md](SETTI-TRV-DPS-BADANIA.md). Nazwy i znaczenia pól z różnych integracji Zigbee/chmury mogą się różnić; nie przenosić automatycznie mapowania.

- **DPS 119**: 24 wartości 0–100 zakodowane jako kanoniczny Base64; odpowiadają godzinowym słupkom **„Czas ogrzewania (%)”** w aplikacji SETTI+. Prawdopodobne mapowanie indeksów 0–23 do kolejnych zakończonych godzin doby wymaga jeszcze weryfikacji północy i zmiany czasu.
- Nie udowodniono, czy wartość procentowa oznacza średnią pozycję napędu, udział czasu aktywności, czy inną miarę wewnętrznego algorytmu. **Nie jest to potwierdzony pomiar przepływu, obecnego stanu zaworu ani pracy kotła.** W szczególności **0% nie dowodzi, że grzejnik pozostaje zimny**.
- **Identyfikacja wariantu:** wszystkie 8 głowic zgłosiło w istniejącej sesji SETTI+ ten sam **Product ID `9m4kmbfu`**. Odpowiada on wariantowi `_TZE200_9m4kmbfu` wskazanemu przez [Blakadder](https://zigbee.blakadder.com/SETTI_TRV001.html) i objętemu [mapowaniem ZHA](https://github.com/zigpy/zha-device-handlers/blob/dev/zhaquirks/tuya/tuya_trv.py). W mapie ZHA **DP 104 = `valve_position` w %, po przeliczeniu ÷10; DP 3 = `running_state`**, a DP 101 = tryb pracy. Jest to **mapowanie Zigbee ZHA**, nie automatyczny opis danych z chmurowej bramki SETTI+.
- **DPS 104** raportował w dotychczasowym kanale chmurowym wartość stałą także podczas obserwowanego nagrzewania grzejników — **nie stosować jako bieżącego procentu otwarcia** bez nowego dowodu. Podobnie nie interpretować stałych `DPS 3=standy`, `101=true` ani `108=false` jako bieżącego ON/OFF zaworu.
- Głównego termostatu ENGO, głowic TRV, czujników pokojowych, pracy palnika i przepływu nie łączy prosty odpowiednik liczbowy. Obserwacje z działania regulatora i temperatury powierzchni są potrzebne do oceny korelacji, ale nie zastąpią pomiaru położenia zaworu.
- **Aktualny stan otwarcia G1–G8 pozostaje nierozstrzygnięty.** Pytanie do producenta SETTI+ o sygnał dostępny przez oryginalną bramkę/Tuya zostało wysłane; nie zmieniać sposobu parowania i nie sterować kotłem na podstawie niezweryfikowanego DPS.

Ten rozdział opisuje **wnioski i ograniczenia**, a nie publikuje historii pomiarów konkretnego gospodarstwa. Szczegółowe znaczniki czasu, zestawienia i wyniki negatywne są przechowywane wyłącznie w prywatnym archiwum.

## Hierarchia badań — oparta na wiedzy, nie na zgadywaniu

1. **Jakość pomiarów i baza:** rejestrować jednocześnie gaz, pogodę, temperatury pomieszczeń, nastawy i zakłócenia. Wykrywać przerwy danych. Zanim porównamy koszty, ustalić okresy porównywalne.
2. **Sterowanie i głowice:** analiza powiązania termostatu ENGO z głowicami, potencjalnego niedogrzania odległych pomieszczeń i TPI/histerezy. Najpierw diagnoza, potem ewentualna jedna bezpieczna korekta.
3. **Temperatura zasilania:** eksperyment z niższą temperaturą dopiero po udokumentowaniu komfortu bazowego, mocy emiterów i warunków przerwania; pogoda musi być porównywalna lub modelowana.
4. **Straty i bezwładność:** analiza tempo wychładzania oraz izolacji przegród; nie mylić okresów użytkowania dodatkowych źródeł ciepła z naturalnym wychładzaniem.
5. **Harmonogram, obniżenia nocne:** dopiero gdy rozumiemy, jak szybko lokal się wychładza i ponownie nagrzewa oraz czy mieszkańcy odczuwają dyskomfort. Nie zakładać z góry dużych oszczędności.

**Z każdego tematu wybieramy kolejny eksperyment tylko wtedy, gdy dane, poprzednie wnioski i rzeczywisty problem uzasadniają jego wartość.**

## Obowiązek dla ChatGPT

Przy każdej nowej analizie z pakietu JSON:

1. Najpierw odtworzyć *trwałą kartę projektu*, historię decyzji i wyniki eksperymentów, również negatywnych.
2. Dopiero potem zestawić je z **zewnętrzną wiedzą techniczną**, wskazać źródło, warunki jej zastosowania i ewentualne rozbieżności.
3. Wyraźnie odróżniać „literatura sugeruje” od „pomiary tego mieszkania potwierdziły”.
4. Nie wracać do sprawdzonych już nastaw bez nowego uzasadnienia.
5. Wybierać pojedynczy następny krok, którego użyteczność da się zweryfikować w mierzalnym eksperymencie.

---

## Uzupełnienie: diagnostyka, pomiary i bezpieczne eksperymenty (18.11.2026)

Poniższe wskazówki są **metodyką badania**, nie potwierdzeniem usterek ani sprawności konkretnej instalacji. Wnioski wymagają lokalnych pomiarów; przed decyzją techniczną sprawdzić dokumentację aktualnego modelu urządzenia.

### A. Głowice termostatyczne, korekty temperatury i równoważenie

- Odróżniać **temperaturę przy głowicy**, **temperaturę czujnika pokojowego**, **nastawę głowicy**, **otwarcie zaworu** oraz **rzeczywisty przepływ wody**. Sama różnica wskazań nie dowodzi błędnej kalibracji.
- Rozdzielić **kalibrację skoku napędu TRV**, **korektę wskazania temperatury** i **hydrauliczne równoważenie instalacji**. To trzy odmienne czynności o różnych celach.
- Gdy w jednym pomieszczeniu pracuje kilka grzejników, nie wymagać identycznej temperatury ich powierzchni ani identycznych nastaw za wszelką cenę. Celem jest równomierny komfort i właściwa moc cieplna przy danej pogodzie.
- Test porównawczy: przy udokumentowanym żądaniu ENGO zapisać temperatury pokoju i przy głowicach, nastawy, stan otwarcia (jeśli faktycznie dostępny), reakcję każdego grzejnika i czas; następnie sprawdzić, czy obserwowane różnice wynikają z zaworu czy z przepływu.
- Nie wykonywać losowych zmian zaworów powrotnych lub wstępnych nastaw. Jeżeli diagnoza wskazuje problem hydrauliczny, plan i wykonanie regulacji powierzyć fachowcowi z zachowaniem minimalnego przepływu wymaganego przez kocioł.

### B. Regulator ENGO, palnik i kocioł kondensacyjny

- Algorytm TPI lub histerezę w ENGO **sprawdzić w konkretnej konfiguracji**. Cykle wyjścia ENGO nie potwierdzają startów, modulacji ani czasu pracy palnika.
- Rozróżniać: żądanie c.o., faktyczną aktywność palnika, tryb c.w.u., temperaturę zasilania i powrotu, stan pompy, ciśnienie wody oraz ewentualne ograniczenia i blokady.
- Nie wnioskować o sprawności kondensacji z samej zadanej temperatury zasilania. Temperatury powrotu, warunki pracy i obciążenie są niezbędne do rzetelniejszej oceny.
- Pomiar gazu obejmuje również c.w.u.; krótkie pobory ciepłej wody i przerwy w pomiarach mogą zniekształcać interpretację krótkich cykli.
- Dokumentować parametry z zakresu dostępnego użytkownikowi; **nastawy spalania, gazu, mocy palnika i zabezpieczeń są zastrzeżone dla uprawnionego serwisu**.

### C. Wilgotność, wentylacja i straty przez przegrody

- Łączyć pomiary °C i %RH z miejscem czujnika, czasem kąpieli, pracą osuszacza, wietrzeniem i temperaturą powierzchni chłodnych przegród.
- Temperatura powietrza i wilgotność względna nie wystarczą do rozpoznania pleśni — znaczenie mają m.in. punkt rosy, wilgotność przy powierzchni, wentylacja i długotrwałość warunków.
- Przy porównywaniu pokoi uwzględnić niejednakową izolację stropu/strychu, powierzchnię zewnętrznych przegród, sąsiadów i nasłonecznienie. Nie przypisywać całej różnicy głowicom.

### D. Reguły czasu i porównywania danych

- Dobę lokalną definiować od **00:00 do następnej 00:00 w strefie Europe/Warsaw**; w dniach zmiany czasu może ona mieć 23 lub 25 godzin. Bieżący dzień jest niepełny i nie może być przedstawiany jako ukończony.
- Dla ENGO i temperatur pochodzących ze zdarzeń stanowych obliczać czas trwania stanu z granic przedziałów, nie z liczby zapisanych rekordów. Przerwa o nieznanym stanie nie jest automatycznie OFF.
- **Udział ON** = potwierdzony czas żądania c.o. / odpowiednio zdefiniowany czas obserwacji; osobno pokazywać pokrycie danych i to, czy mianownik obejmuje całą dobę czy tylko jej fragment.
- Odczyty gazomierza w odstępach 18–30 h normalizować jawnie do m³/24h jako **średnią z tego okresu**, nie nazywać ich rzeczywistym zużyciem pełnej doby kalendarzowej.
- Eksperymenty porównywać po uwzględnieniu pogody, c.w.u., zakłóceń i kompletności danych. W razie braku odpowiedniego punktu odniesienia wynik pozostaje nierozstrzygnięty.

### E. Dodatkowe kierunki badań

- Rozważyć opłacalność lokalnego docieplenia, wymiany lub zwiększenia grzejników, dodatkowych czujników i pomiarów rzeczywistej pracy palnika **dopiero po określeniu problemu, spodziewanego efektu i kosztu wdrożenia**.
- Dla modernizacji odróżniać koszt inwestycji, zmianę komfortu, spodziewane i potwierdzone oszczędności oraz okres zwrotu (z niepewnością).
- Opis schematów i kontroli jakości danych znajduje się w [projekcie archiwum analitycznego](ARCHIWUM-ANALITYCZNE-PROJEKT.md).

> Data dopisania metodyki nie oznacza ponownej weryfikacji wszystkich zewnętrznych źródeł przywołanych w starszych częściach dokumentu.
