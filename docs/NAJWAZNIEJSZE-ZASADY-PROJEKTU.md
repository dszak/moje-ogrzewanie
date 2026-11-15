# Fundamentalne zasady projektu „Moje Ogrzewanie”

> **Status:** nadrzędna karta celu i metodologii projektu. Ta karta ma pierwszeństwo przed pomysłami na dodatkowe ekrany i funkcje. Nie jest potwierdzeniem skuteczności żadnej konkretnej nastawy ani wynikiem badania. Przyjęto wspólnie 15 listopada 2026 r.

## 1. Jedyny cel nadrzędny

**Poznać rzeczywiste zachowanie mieszkania i instalacji, a następnie systematycznie dochodzić do najniższego rozsądnie osiągalnego kosztu utrzymania komfortu cieplnego — bez pogarszania bezpieczeństwa i jakości życia.**

Nie optymalizujemy pojedynczej liczby, np. najniższej nastawy kotła, najmniejszej liczby cykli ENGO albo najmniejszego bezwzględnego zużycia gazu. Oceniamy **komfort i ekonomię łącznie**, z uwzględnieniem zmiennych warunków zewnętrznych.

## 2. Metoda: WIDZIEĆ → OCENIĆ → DZIAŁAĆ → UCZYĆ SIĘ

Metoda „widzieć – ocenić – działać”, zaczerpnięta z tradycji katolickiej nauki społecznej, jest strukturą podejmowania decyzji.

1. **WIDZIEĆ:** gromadzić rzeczywiste pomiary, ich źródła, zakres, jakość, luki oraz warunki, w jakich powstały. Rozróżniać odczyty automatyczne i ręczne.
2. **OCENIĆ:** odróżniać fakt pomiarowy od interpretacji i hipotezy. Sprawdzać zależności, czynniki zakłócające i wcześniejsze wyniki; określać niepewność.
3. **DZIAŁAĆ:** przyjmować jedno z trzech rozstrzygnięć: **zachować ustawienia**, **zebrać więcej danych** albo **przeprowadzić jeden kontrolowany eksperyment**. Zmiana wymaga świadomej decyzji użytkownika.
4. **UCZYĆ SIĘ:** zapisywać wynik, porównanie z punktem odniesienia, warunki zastosowania, poziom pewności oraz konsekwencję dla kolejnych decyzji. Każda nowa analiza powinna odwoływać się do tego dorobku.

**Reguła główna:** każdy eksperyment ma albo poprawić działanie ogrzewania, albo dostarczyć konkretnej nowej wiedzy potrzebnej do lepszej kolejnej decyzji.

## 3. Zakaz kręcenia się w kółko

- Nie proponować ponownie tej samej próby na tych samych warunkach bez uzasadnienia nowymi danymi, nowym pytaniem badawczym lub zmianą warunków.
- Zapisywać **wyniki pozytywne, negatywne i nierozstrzygnięte**. Nie usuwać wiedzy o nieudanych eksperymentach.
- Przed każdą rekomendacją sprawdzić: **co już wiemy, co wcześniej odrzuciliśmy, co działało, w jakich warunkach i co pozostaje nieznane**.
- Jeśli istniejące dane wystarczają do pozostawienia nastaw, nie wymuszać eksperymentu. Jeśli dane nie pozwalają na wniosek, nie udawać pewności.
- Nie mylić kolejnych pomiarów z postępem: postęp to poprawa wyników **lub** uzasadnione zmniejszenie niepewności.

## 4. Model cieplny mieszkania — wiedza kumulowana

Stopniowo budować empiryczny opis zależności:

- **temperatura zasilania kotła ↔ oddawanie ciepła przez grzejniki ↔ utrzymywanie komfortu ↔ gaz**;
- **ENGO ↔ czas zapotrzebowania ↔ temperatura referencyjnego pomieszczenia ↔ niedogrzanie pozostałych pomieszczeń**;
- **czujniki Setti+ ↔ głowice grzejnikowe ↔ rzeczywiste temperatury pomieszczeń**;
- **warunki pogodowe ↔ straty i tempo wychładzania ↔ potrzebne zasilanie**;
- **bezwładność cieplna ↔ nocne obniżenia ↔ czas powrotu do komfortu**;
- **dodatkowe źródła ciepła, wietrzenie, ciepła woda ↔ pozorny wpływ zmian nastaw**.

Model może być prosty; jego wiarygodność musi wynikać z danych, a nie z etykiety „AI”. Osobno dokumentować pomieszczenia i warunki, w których wnioski są prawdziwe.

## 5. Dwa równorzędne kryteria efektywności

**Komfort:** realne temperatury względem celów, czas niedogrzania lub przegrzewania, stabilność, odczucia użytkownika i dostępność ciepła we wszystkich pomieszczeniach.

**Ekonomia:** gaz na porównywalną jednostkę czasu i warunki pogodowe, a gdy dostępne — koszty energii. Rozróżniać ogrzewanie pomieszczeń od ciepłej wody i innych odbiorników. Nie przedstawiać surowego spadku m³ jako dowodu poprawy sprawności.

Eksperyment uznać za korzystny ekonomicznie **tylko po porównaniu wystarczająco podobnych okresów, z oceną komfortu i niepewności**. Wyciąganie wniosków z nieporównywalnej pogody lub zbyt krótkich okresów jest niedopuszczalne.

## 6. Protokół każdego eksperymentu

Przed: identyfikator, hipoteza, uzasadnienie wynikające z wcześniejszych analiz, **jedna zmienna**, stan odniesienia, zapisane nastawy, pogoda, plan czasu oraz z góry określone kryteria sukcesu i warunki wycofania.

W trakcie: pomiary z sygnaturą czasu, zużycie gazu, pogoda, komfort, zdarzenia zakłócające, kompletność danych; nie wprowadzać nieodnotowanych zmian równoległych.

Po: różnica względem adekwatnego punktu odniesienia, skorygowana o możliwe czynniki zakłócające, wniosek **korzystny / niekorzystny / nierozstrzygnięty**, stopień pewności, nowe ustalenia, aktualizacja hipotez i rekomendacja następnego kroku.

**Nie wskazywać „najlepszej konfiguracji” bez określenia pogody, warunków, komfortu i siły dowodów.** Można posiadać kilka najlepszych sprawdzonych konfiguracji dla różnych zakresów warunków.

## 7. Prawidłowe rozumienie danych

- Zdarzenia ENGO to **zgłoszenie zapotrzebowania**, a nie pomiar czasu pracy palnika czy zużycia gazu.
- Historia Setti+/Home Assistant może zapisywać **zmiany wartości**, nie wszystkie fizyczne pomiary; przerwy należy oznaczać i sprawdzać.
- Temperatury przy głowicy i w oddalonym czujniku nie są tożsame.
- Odczyty gazomierza obejmują również CWU i inne odbiorniki, jeśli instalacja je zasila.
- Pogoda modelowa nie jest pomiarem stacji przy mieszkaniu.
- Nie przypisywać przyczynowości tylko na podstawie korelacji, jednej doby czy jednego krótkiego cyklu.
- Nie szacować sprawności kotła z samych temperatur pomieszczeń lub sygnału ENGO.
- Bezpieczeństwo kotła gazowego, instalacji i uprawnienia serwisowe mają pierwszeństwo przed oszczędnościami.

## 8. Trwała pamięć projektu i niezależność od czatu

**Prawdziwym źródłem ciągłości ma być prywatny zapis w aplikacji i przenośny pakiet wiedzy, a nie domniemana pamięć modelu ChatGPT.**

Każdy raport do analizy w nowej rozmowie powinien odtwarzać:

1. **Kartę instalacji i mieszkania** — elementy, ograniczenia, konfigurację i cele komfortu, z możliwością korekty przez użytkownika.
2. **Obowiązujące ustalenia** — stan wiedzy: fakt / hipoteza / wynik eksperymentu; dowody, daty, pewność i granice zastosowania.
3. **Dziennik decyzji i eksperymentów** — w tym wyniki wcześniejsze niż zakres wybranych pomiarów oraz powody odrzucenia rozwiązań.
4. **Wynik najlepiej sprawdzonych konfiguracji** dla danych warunków, z kryteriami oraz informacją, czy wniosek został potwierdzony.
5. **Bieżące dane pomiarowe** wraz z jakością, lukami i opisem działania czujników.
6. **Następny otwarty problem badawczy** i logicznie wynikający z historii krok.

Nowa rozmowa powinna móc zrozumieć cel, dotychczasową wiedzę i priorytet kolejnej decyzji na podstawie **samego eksportu**, bez ponownego opowiadania historii.

W aplikacji potrzebny jest bezpieczny, kontrolowany przez użytkownika mechanizm **importu propozycji wniosków z ChatGPT po obejrzeniu podglądu i zatwierdzeniu**. Nigdy nie nadpisywać niejawnie wcześniejszych dowodów.

Nie publikować prywatnych danych mieszkania, map, adresu, odczytów gazomierza ani osobistych notatek w publicznym GitHubie. Kod aplikacji nie steruje bezpośrednio kotłem, ENGO ani głowicami.

## 9. Jak mierzymy, czy projekt naprawdę się rozwija?

Regularnie sprawdzamy:

- Czy mamy **wiarygodniejsze dane** i mniejszą liczbę krytycznych luk?
- Czy znamy **warunki brzegowe** dotychczasowych konfiguracji?
- Czy ustalenia są **powtarzalne**, czy tylko przypadkowe?
- Czy udokumentowaliśmy wpływ zmian na **komfort i znormalizowane zużycie**?
- Czy kolejne decyzje realnie **wynikają z poprzednich**, zamiast zaczynać od zera?
- Czy rekomendacje są bardziej precyzyjne i mniej ryzykowne niż na początku?

**Nie obiecywać ciągłej poprawy przy każdym eksperymencie.** Obiecywać uczciwe pomiary, rozumowanie, zachowanie wiedzy i racjonalne podejmowanie decyzji. Wartość projektu ujawni się w skumulowanej poprawie w trakcie sezonów grzewczych.

---

**Zasada końcowa:** „Nie chodzi o to, żeby stale coś przestawiać. Chodzi o to, żeby coraz lepiej rozumieć instalację i wyciskać z niej najwięcej pod względem komfortu i ekonomii — na podstawie dowodów, bez kręcenia się w kółko”.
