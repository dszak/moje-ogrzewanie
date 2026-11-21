# 2026-11-21 — Synchronizacja nastawy CO i monitoring ENGO

Ten wpis uzupełnia [opis widoków Home Assistant z 20 listopada](WIDOKI-HA-CALY-SYSTEM-I-TV-2026-11-20.md). Zgodnie z [zasadami projektu](NAJWAZNIEJSZE-ZASADY-PROJEKTU.md) oddzielamy ręczne nastawy, pomiary i okresy bez danych.

## Ręczna nastawa CO

„Moje Ogrzewanie” zapisuje ręcznie wpisaną nastawę CO w jednym prywatnym rejestrze Home Assistanta. Widoki „Cały system” i „TV — Przegląd ogrzewania” odczytują tę samą encję. Karta kotła pokazuje wpis użytkownika. Temperatura wody na zasilaniu i nastawa CWU są odrębnymi wartościami.

Zmianę aplikacji scalono w [PR #32](https://github.com/dszak/moje-ogrzewanie/pull/32). [Wdrożenie GitHub Pages](https://github.com/dszak/moje-ogrzewanie/actions/runs/44905250611) zakończyło się pomyślnie. Opublikowane pliki były zgodne z przetestowaną paczką.

## Statystyki ENGO

Panel obejmuje ruchome okno ostatnich 24 godzin. Pokazuje czas ON, OFF i brak danych w godzinach i minutach. Udziały są liczone z czasu obserwacji, a średnie długości ON i OFF z pełnych cykli. ON oznacza żądanie ciepła przez ENGO. Stan palnika pozostaje poza zakresem tego sygnału.

Po uruchomieniu Home Assistant może potwierdzić stan bezpośrednio z termostatu w sieci lokalnej. Obserwacja wznawia się od chwili odpowiedzi. Przy braku spójnego odczytu monitoring czeka na świeże zdarzenie ENGO, a luka pozostaje w historii.

## Wyniki testów

| Test | Wynik |
|---|---|
| Aplikacja i trwałość zapisu | Przeszły 93 testy Node i 3 testy trwałego zapisu. Sprawdzono ponowne uruchomienie, utratę łączności i ochronę przed nadpisaniem nowszego wpisu. |
| Zapis z fizycznego iPhone’a | Ręczny wpis dotarł do Home Assistanta. Karta widoku TV w Chrome pokazała tę samą wartość, a „Cały system” odczytywał tę samą encję. Ekranu fizycznej Bravii w tym teście nie sprawdzano. |
| Okno 24 h | Przeszły scenariusze pełnego okna, braku danych na jego początku, przerwy podczas zmiany stanu, kontrolowanego restartu, awarii, starego raportu po przerwie i całkowitego braku danych. |
| Rzeczywisty restart Home Assistanta | Restart rozpoczął się o 14:13:57. O 14:14:24 odczyt lokalny potwierdził ON bez czekania na przełączenie. Historia zachowała wcześniejszą lukę. |
| Naturalne przełączenie ENGO | ENGO zgłosił OFF o 14:27:52, a Home Assistant zapisał zmianę o 14:27:58. Przybyło jedno zakończenie ON. Liczba pełnych cykli i czas bez danych pozostały bez zmian. |
| Powrót odczytów Setti+ | Po planowej synchronizacji o 14:21:59 wrócił komplet danych z sześciu czujników pokojowych i ośmiu głowic. |

Godziny podano w czasie polskim. Nastawy kotła i ENGO oraz automatyka ogrzewania pozostały bez zmian.
