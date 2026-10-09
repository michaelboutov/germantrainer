// The built-in vocabulary + the little "morphology engine" (conjugation, Partizip II) that turns it into
// endless exercises. The AI adds more words on top — everything ends up in the same word list.

export const TOPICS = {
  Essen:    { ru: 'Еда и напитки',        emoji: '🍎' },
  Haus:     { ru: 'Дом и вещи',           emoji: '🏠' },
  Menschen: { ru: 'Семья и люди',         emoji: '👨‍👩‍👧' },
  Stadt:    { ru: 'Город и транспорт',    emoji: '🚆' },
  Körper:   { ru: 'Тело',                 emoji: '🖐️' },
  Arbeit:   { ru: 'Работа и учёба',       emoji: '💼' },
  Natur:    { ru: 'Природа и животные',   emoji: '🌳' },
  Kleidung: { ru: 'Одежда',               emoji: '👕' },
  Zeit:     { ru: 'Время и праздники',    emoji: '⏰' },
  Verben:   { ru: 'Глаголы',              emoji: '🏃' },
  Adjektive:{ ru: 'Прилагательные',       emoji: '🌈' },
  Phrasen:  { ru: 'Фразы на каждый день', emoji: '💬' },
  KI:       { ru: 'Новые слова от ИИ',    emoji: '✨' },
};

// ── nouns: [article, word, plural|null, русский, emoji|null, topic, level]
const N = [
  // Essen
  ['der', 'Apfel', 'Äpfel', 'яблоко', '🍎', 'Essen', 'a1'], ['das', 'Brot', 'Brote', 'хлеб', '🍞', 'Essen', 'a1'],
  ['der', 'Käse', null, 'сыр', '🧀', 'Essen', 'a1'], ['die', 'Milch', null, 'молоко', '🥛', 'Essen', 'a1'],
  ['das', 'Wasser', null, 'вода', '💧', 'Essen', 'a1'], ['der', 'Kaffee', null, 'кофе', '☕', 'Essen', 'a1'],
  ['der', 'Tee', null, 'чай', '🍵', 'Essen', 'a1'], ['das', 'Ei', 'Eier', 'яйцо', '🥚', 'Essen', 'a1'],
  ['die', 'Banane', 'Bananen', 'банан', '🍌', 'Essen', 'a1'], ['die', 'Tomate', 'Tomaten', 'помидор', '🍅', 'Essen', 'a1'],
  ['die', 'Kartoffel', 'Kartoffeln', 'картофель', '🥔', 'Essen', 'a1'], ['der', 'Fisch', 'Fische', 'рыба', '🐟', 'Essen', 'a1'],
  ['das', 'Fleisch', null, 'мясо', '🥩', 'Essen', 'a1'], ['der', 'Kuchen', 'Kuchen', 'пирог, торт', '🍰', 'Essen', 'a1'],
  ['die', 'Suppe', 'Suppen', 'суп', '🍲', 'Essen', 'a1'], ['der', 'Salat', 'Salate', 'салат', '🥗', 'Essen', 'a1'],
  ['die', 'Zitrone', 'Zitronen', 'лимон', '🍋', 'Essen', 'a2'], ['die', 'Orange', 'Orangen', 'апельсин', '🍊', 'Essen', 'a1'],
  ['der', 'Reis', null, 'рис', '🍚', 'Essen', 'a1'], ['die', 'Flasche', 'Flaschen', 'бутылка', '🍾', 'Essen', 'a1'],
  ['die', 'Tasse', 'Tassen', 'чашка', null, 'Essen', 'a1'], ['der', 'Löffel', 'Löffel', 'ложка', '🥄', 'Essen', 'a2'],
  ['das', 'Messer', 'Messer', 'нож', '🔪', 'Essen', 'a2'], ['die', 'Gabel', 'Gabeln', 'вилка', '🍴', 'Essen', 'a2'],
  ['der', 'Teller', 'Teller', 'тарелка', '🍽️', 'Essen', 'a2'], ['das', 'Eis', null, 'мороженое', '🍦', 'Essen', 'a1'],
  ['die', 'Erdbeere', 'Erdbeeren', 'клубника', '🍓', 'Essen', 'a2'], ['die', 'Butter', null, 'масло', '🧈', 'Essen', 'a1'],
  // Haus
  ['das', 'Haus', 'Häuser', 'дом', '🏠', 'Haus', 'a1'], ['die', 'Wohnung', 'Wohnungen', 'квартира', '🏢', 'Haus', 'a1'],
  ['das', 'Zimmer', 'Zimmer', 'комната', null, 'Haus', 'a1'], ['die', 'Küche', 'Küchen', 'кухня', '🍳', 'Haus', 'a1'],
  ['das', 'Bad', 'Bäder', 'ванная', '🛁', 'Haus', 'a1'], ['das', 'Bett', 'Betten', 'кровать', '🛏️', 'Haus', 'a1'],
  ['der', 'Tisch', 'Tische', 'стол', null, 'Haus', 'a1'], ['der', 'Stuhl', 'Stühle', 'стул', '🪑', 'Haus', 'a1'],
  ['das', 'Fenster', 'Fenster', 'окно', '🪟', 'Haus', 'a1'], ['die', 'Tür', 'Türen', 'дверь', '🚪', 'Haus', 'a1'],
  ['die', 'Lampe', 'Lampen', 'лампа', '💡', 'Haus', 'a1'], ['das', 'Sofa', 'Sofas', 'диван', '🛋️', 'Haus', 'a1'],
  ['der', 'Schrank', 'Schränke', 'шкаф', '🗄️', 'Haus', 'a2'], ['der', 'Schlüssel', 'Schlüssel', 'ключ', '🔑', 'Haus', 'a1'],
  ['der', 'Garten', 'Gärten', 'сад', '🏡', 'Haus', 'a1'], ['die', 'Treppe', 'Treppen', 'лестница', '🪜', 'Haus', 'a2'],
  ['der', 'Spiegel', 'Spiegel', 'зеркало', '🪞', 'Haus', 'a2'], ['das', 'Telefon', 'Telefone', 'телефон', '☎️', 'Haus', 'a1'],
  ['der', 'Computer', 'Computer', 'компьютер', '💻', 'Haus', 'a1'], ['das', 'Handy', 'Handys', 'мобильный телефон', '📱', 'Haus', 'a1'],
  ['der', 'Fernseher', 'Fernseher', 'телевизор', '📺', 'Haus', 'a1'], ['die', 'Uhr', 'Uhren', 'часы', '🕐', 'Haus', 'a1'],
  ['das', 'Buch', 'Bücher', 'книга', '📖', 'Haus', 'a1'], ['die', 'Zeitung', 'Zeitungen', 'газета', '📰', 'Haus', 'a1'],
  ['der', 'Brief', 'Briefe', 'письмо', '✉️', 'Haus', 'a1'], ['die', 'Tasche', 'Taschen', 'сумка', '👜', 'Haus', 'a1'],
  ['der', 'Koffer', 'Koffer', 'чемодан', '🧳', 'Haus', 'a2'], ['der', 'Regenschirm', 'Regenschirme', 'зонт', '☂️', 'Haus', 'a2'],
  // Menschen
  ['der', 'Vater', 'Väter', 'отец', '👨', 'Menschen', 'a1'], ['die', 'Mutter', 'Mütter', 'мать', '👩', 'Menschen', 'a1'],
  ['der', 'Bruder', 'Brüder', 'брат', '👦', 'Menschen', 'a1'], ['die', 'Schwester', 'Schwestern', 'сестра', '👧', 'Menschen', 'a1'],
  ['das', 'Kind', 'Kinder', 'ребёнок', '🧒', 'Menschen', 'a1'], ['der', 'Freund', 'Freunde', 'друг', '🧑‍🤝‍🧑', 'Menschen', 'a1'],
  ['die', 'Freundin', 'Freundinnen', 'подруга', '👭', 'Menschen', 'a1'], ['der', 'Mann', 'Männer', 'мужчина, муж', '🧔', 'Menschen', 'a1'],
  ['die', 'Frau', 'Frauen', 'женщина, жена', '👩‍🦰', 'Menschen', 'a1'], ['das', 'Baby', 'Babys', 'младенец', '👶', 'Menschen', 'a1'],
  ['die', 'Oma', 'Omas', 'бабушка', '👵', 'Menschen', 'a1'], ['der', 'Opa', 'Opas', 'дедушка', '👴', 'Menschen', 'a1'],
  ['der', 'Lehrer', 'Lehrer', 'учитель', '👨‍🏫', 'Menschen', 'a1'], ['die', 'Lehrerin', 'Lehrerinnen', 'учительница', '👩‍🏫', 'Menschen', 'a1'],
  ['der', 'Arzt', 'Ärzte', 'врач', '👨‍⚕️', 'Menschen', 'a1'], ['der', 'Nachbar', 'Nachbarn', 'сосед', null, 'Menschen', 'a2'],
  ['der', 'Gast', 'Gäste', 'гость', null, 'Menschen', 'a2'], ['der', 'Mensch', 'Menschen', 'человек', '🧍', 'Menschen', 'a1'],
  // Stadt
  ['die', 'Stadt', 'Städte', 'город', '🏙️', 'Stadt', 'a1'], ['die', 'Straße', 'Straßen', 'улица', '🛣️', 'Stadt', 'a1'],
  ['der', 'Bahnhof', 'Bahnhöfe', 'вокзал', '🚉', 'Stadt', 'a1'], ['der', 'Zug', 'Züge', 'поезд', '🚆', 'Stadt', 'a1'],
  ['der', 'Bus', 'Busse', 'автобус', '🚌', 'Stadt', 'a1'], ['das', 'Auto', 'Autos', 'машина', '🚗', 'Stadt', 'a1'],
  ['das', 'Fahrrad', 'Fahrräder', 'велосипед', '🚲', 'Stadt', 'a1'], ['das', 'Flugzeug', 'Flugzeuge', 'самолёт', '✈️', 'Stadt', 'a1'],
  ['der', 'Flughafen', 'Flughäfen', 'аэропорт', '🛫', 'Stadt', 'a2'], ['die', 'Brücke', 'Brücken', 'мост', '🌉', 'Stadt', 'a2'],
  ['der', 'Park', 'Parks', 'парк', '🌳', 'Stadt', 'a1'], ['die', 'Schule', 'Schulen', 'школа', '🏫', 'Stadt', 'a1'],
  ['das', 'Krankenhaus', 'Krankenhäuser', 'больница', '🏥', 'Stadt', 'a2'], ['die', 'Apotheke', 'Apotheken', 'аптека', '💊', 'Stadt', 'a2'],
  ['der', 'Supermarkt', 'Supermärkte', 'супермаркет', '🛒', 'Stadt', 'a1'], ['das', 'Restaurant', 'Restaurants', 'ресторан', null, 'Stadt', 'a1'],
  ['das', 'Café', 'Cafés', 'кафе', null, 'Stadt', 'a1'], ['das', 'Kino', 'Kinos', 'кинотеатр', '🎬', 'Stadt', 'a1'],
  ['die', 'Bank', 'Banken', 'банк', '🏦', 'Stadt', 'a1'], ['die', 'Post', null, 'почта', '📮', 'Stadt', 'a1'],
  ['das', 'Hotel', 'Hotels', 'отель', '🏨', 'Stadt', 'a1'], ['das', 'Museum', 'Museen', 'музей', '🏛️', 'Stadt', 'a2'],
  ['die', 'Kirche', 'Kirchen', 'церковь', '⛪', 'Stadt', 'a2'], ['der', 'Markt', 'Märkte', 'рынок', null, 'Stadt', 'a2'],
  // Körper
  ['der', 'Kopf', 'Köpfe', 'голова', null, 'Körper', 'a1'], ['die', 'Hand', 'Hände', 'рука (кисть)', '🖐️', 'Körper', 'a1'],
  ['das', 'Auge', 'Augen', 'глаз', '👁️', 'Körper', 'a1'], ['das', 'Ohr', 'Ohren', 'ухо', '👂', 'Körper', 'a1'],
  ['die', 'Nase', 'Nasen', 'нос', '👃', 'Körper', 'a1'], ['der', 'Mund', 'Münder', 'рот', '👄', 'Körper', 'a1'],
  ['der', 'Fuß', 'Füße', 'нога (ступня)', '🦶', 'Körper', 'a1'], ['das', 'Herz', 'Herzen', 'сердце', '❤️', 'Körper', 'a1'],
  ['der', 'Zahn', 'Zähne', 'зуб', '🦷', 'Körper', 'a2'], ['das', 'Bein', 'Beine', 'нога', '🦵', 'Körper', 'a1'],
  ['der', 'Arm', 'Arme', 'рука', '💪', 'Körper', 'a1'], ['der', 'Bauch', 'Bäuche', 'живот', null, 'Körper', 'a2'],
  // Arbeit
  ['der', 'Stift', 'Stifte', 'ручка (пишущая)', '🖊️', 'Arbeit', 'a1'], ['der', 'Bleistift', 'Bleistifte', 'карандаш', '✏️', 'Arbeit', 'a1'],
  ['das', 'Heft', 'Hefte', 'тетрадь', '📓', 'Arbeit', 'a1'], ['das', 'Papier', 'Papiere', 'бумага', '📄', 'Arbeit', 'a1'],
  ['die', 'Prüfung', 'Prüfungen', 'экзамен', '📝', 'Arbeit', 'a2'], ['das', 'Büro', 'Büros', 'офис', '💼', 'Arbeit', 'a1'],
  ['der', 'Chef', 'Chefs', 'начальник', null, 'Arbeit', 'a1'], ['der', 'Kollege', 'Kollegen', 'коллега', null, 'Arbeit', 'a2'],
  ['die', 'Frage', 'Fragen', 'вопрос', '❓', 'Arbeit', 'a1'], ['die', 'Antwort', 'Antworten', 'ответ', '💬', 'Arbeit', 'a1'],
  ['das', 'Wort', 'Wörter', 'слово', '🔤', 'Arbeit', 'a1'], ['die', 'Aufgabe', 'Aufgaben', 'задание', '📋', 'Arbeit', 'a2'],
  // Natur
  ['der', 'Hund', 'Hunde', 'собака', '🐕', 'Natur', 'a1'], ['die', 'Katze', 'Katzen', 'кошка', '🐈', 'Natur', 'a1'],
  ['der', 'Vogel', 'Vögel', 'птица', '🐦', 'Natur', 'a1'], ['das', 'Pferd', 'Pferde', 'лошадь', '🐴', 'Natur', 'a1'],
  ['die', 'Kuh', 'Kühe', 'корова', '🐄', 'Natur', 'a1'], ['das', 'Schwein', 'Schweine', 'свинья', '🐖', 'Natur', 'a2'],
  ['der', 'Baum', 'Bäume', 'дерево', '🌳', 'Natur', 'a1'], ['die', 'Blume', 'Blumen', 'цветок', '🌸', 'Natur', 'a1'],
  ['der', 'Berg', 'Berge', 'гора', '⛰️', 'Natur', 'a1'], ['der', 'See', 'Seen', 'озеро', '🏞️', 'Natur', 'a1'],
  ['das', 'Meer', 'Meere', 'море', '🌊', 'Natur', 'a1'], ['der', 'Fluss', 'Flüsse', 'река', '🏞️', 'Natur', 'a1'],
  ['die', 'Sonne', 'Sonnen', 'солнце', '☀️', 'Natur', 'a1'], ['der', 'Mond', 'Monde', 'луна', '🌙', 'Natur', 'a1'],
  ['der', 'Stern', 'Sterne', 'звезда', '⭐', 'Natur', 'a1'], ['der', 'Regen', null, 'дождь', '🌧️', 'Natur', 'a1'],
  ['der', 'Schnee', null, 'снег', '❄️', 'Natur', 'a1'], ['der', 'Wind', 'Winde', 'ветер', '💨', 'Natur', 'a1'],
  // Kleidung
  ['die', 'Hose', 'Hosen', 'брюки', '👖', 'Kleidung', 'a1'], ['das', 'Hemd', 'Hemden', 'рубашка', '👔', 'Kleidung', 'a1'],
  ['das', 'Kleid', 'Kleider', 'платье', '👗', 'Kleidung', 'a1'], ['der', 'Schuh', 'Schuhe', 'ботинок, туфля', '👟', 'Kleidung', 'a1'],
  ['die', 'Jacke', 'Jacken', 'куртка', '🧥', 'Kleidung', 'a1'], ['der', 'Mantel', 'Mäntel', 'пальто', null, 'Kleidung', 'a2'],
  ['die', 'Mütze', 'Mützen', 'шапка', '🧢', 'Kleidung', 'a2'], ['der', 'Hut', 'Hüte', 'шляпа', '🎩', 'Kleidung', 'a2'],
  ['die', 'Brille', 'Brillen', 'очки', '👓', 'Kleidung', 'a1'], ['die', 'Socke', 'Socken', 'носок', '🧦', 'Kleidung', 'a2'],
  ['der', 'Pullover', 'Pullover', 'свитер', '🧶', 'Kleidung', 'a1'], ['das', 'T-Shirt', 'T-Shirts', 'футболка', '👕', 'Kleidung', 'a1'],
  // Zeit
  ['der', 'Tag', 'Tage', 'день', '📅', 'Zeit', 'a1'], ['die', 'Woche', 'Wochen', 'неделя', '🗓️', 'Zeit', 'a1'],
  ['der', 'Monat', 'Monate', 'месяц', '📆', 'Zeit', 'a1'], ['das', 'Jahr', 'Jahre', 'год', '🎆', 'Zeit', 'a1'],
  ['die', 'Stunde', 'Stunden', 'час', '⏰', 'Zeit', 'a1'], ['die', 'Minute', 'Minuten', 'минута', '⏱️', 'Zeit', 'a1'],
  ['der', 'Morgen', 'Morgen', 'утро', '🌅', 'Zeit', 'a1'], ['der', 'Abend', 'Abende', 'вечер', '🌆', 'Zeit', 'a1'],
  ['die', 'Nacht', 'Nächte', 'ночь', '🌃', 'Zeit', 'a1'], ['das', 'Wochenende', 'Wochenenden', 'выходные', '🎉', 'Zeit', 'a1'],
  ['der', 'Urlaub', 'Urlaube', 'отпуск', '🏖️', 'Zeit', 'a1'], ['der', 'Geburtstag', 'Geburtstage', 'день рождения', '🎂', 'Zeit', 'a1'],
];

export const NOUNS = N.map(([art, de, pl, ru, emoji, topic, lvl]) => ({ id: `n:${de}`, kind: 'n', art, de, pl, ru, emoji, topic, lvl }));

// ── verbs: [infinitive, русский, opts, level]
//   opts: du / er / ich / ihr (irregular present), pp (Partizip II), aux 's' (sein; default haben),
//         sep + base (separable verb built from a base verb), hidden (only a building block)
const V = [
  ['machen', 'делать', {}, 'a1'], ['spielen', 'играть', {}, 'a1'], ['lernen', 'учить, изучать', {}, 'a1'], ['kaufen', 'покупать', {}, 'a1'],
  ['wohnen', 'жить (проживать)', {}, 'a1'], ['arbeiten', 'работать', {}, 'a1'], ['kochen', 'готовить (еду)', {}, 'a1'], ['hören', 'слушать, слышать', {}, 'a1'],
  ['sagen', 'сказать', {}, 'a1'], ['fragen', 'спрашивать', {}, 'a1'], ['lieben', 'любить', {}, 'a1'], ['brauchen', 'нуждаться, нужно', {}, 'a1'],
  ['suchen', 'искать', {}, 'a1'], ['tanzen', 'танцевать', {}, 'a1'], ['reisen', 'путешествовать', { aux: 's' }, 'a1'], ['besuchen', 'посещать, навещать', { pp: 'besucht' }, 'a1'],
  ['bezahlen', 'платить', { pp: 'bezahlt' }, 'a1'], ['studieren', 'учиться в вузе', { pp: 'studiert' }, 'a1'], ['telefonieren', 'звонить, говорить по телефону', { pp: 'telefoniert' }, 'a2'],
  ['öffnen', 'открывать', {}, 'a1'], ['warten', 'ждать', {}, 'a1'], ['antworten', 'отвечать', {}, 'a1'], ['lachen', 'смеяться', {}, 'a2'],
  ['zeigen', 'показывать', {}, 'a1'], ['glauben', 'верить, думать', {}, 'a2'], ['kosten', 'стоить', {}, 'a1'], ['leben', 'жить (существовать)', {}, 'a1'],
  ['putzen', 'чистить, убирать', {}, 'a2'], ['packen', 'упаковывать', {}, 'a2'], ['duschen', 'принимать душ', {}, 'a2'], ['schenken', 'дарить', {}, 'a2'],
  ['holen', 'приносить, забирать', {}, 'a2'], ['legen', 'класть', {}, 'a2'], ['stellen', 'ставить', {}, 'a2'], ['malen', 'рисовать', {}, 'a2'],
  ['feiern', 'праздновать', {}, 'a2'], ['frühstücken', 'завтракать', {}, 'a1'], ['erklären', 'объяснять', { pp: 'erklärt' }, 'a2'], ['erzählen', 'рассказывать', { pp: 'erzählt' }, 'a2'],
  ['gehen', 'идти, ходить', { pp: 'gegangen', aux: 's' }, 'a1'], ['kommen', 'приходить', { pp: 'gekommen', aux: 's' }, 'a1'], ['bleiben', 'оставаться', { pp: 'geblieben', aux: 's' }, 'a1'],
  ['fahren', 'ехать', { du: 'fährst', er: 'fährt', pp: 'gefahren', aux: 's' }, 'a1'], ['schlafen', 'спать', { du: 'schläfst', er: 'schläft', pp: 'geschlafen' }, 'a1'],
  ['laufen', 'бежать, ходить пешком', { du: 'läufst', er: 'läuft', pp: 'gelaufen', aux: 's' }, 'a1'], ['tragen', 'носить, нести', { du: 'trägst', er: 'trägt', pp: 'getragen' }, 'a2'],
  ['lesen', 'читать', { du: 'liest', er: 'liest', pp: 'gelesen' }, 'a1'], ['sehen', 'видеть, смотреть', { du: 'siehst', er: 'sieht', pp: 'gesehen' }, 'a1'],
  ['essen', 'есть', { du: 'isst', er: 'isst', pp: 'gegessen' }, 'a1'], ['geben', 'давать', { du: 'gibst', er: 'gibt', pp: 'gegeben' }, 'a1'],
  ['nehmen', 'брать', { du: 'nimmst', er: 'nimmt', pp: 'genommen' }, 'a1'], ['sprechen', 'говорить', { du: 'sprichst', er: 'spricht', pp: 'gesprochen' }, 'a1'],
  ['helfen', 'помогать', { du: 'hilfst', er: 'hilft', pp: 'geholfen' }, 'a1'], ['treffen', 'встречать', { du: 'triffst', er: 'trifft', pp: 'getroffen' }, 'a2'],
  ['trinken', 'пить', { pp: 'getrunken' }, 'a1'], ['schreiben', 'писать', { pp: 'geschrieben' }, 'a1'], ['finden', 'находить', { pp: 'gefunden' }, 'a1'],
  ['singen', 'петь', { pp: 'gesungen' }, 'a1'], ['schwimmen', 'плавать', { pp: 'geschwommen', aux: 's' }, 'a1'], ['fliegen', 'летать', { pp: 'geflogen', aux: 's' }, 'a1'],
  ['sitzen', 'сидеть', { pp: 'gesessen' }, 'a2'], ['stehen', 'стоять', { pp: 'gestanden' }, 'a2'], ['liegen', 'лежать', { pp: 'gelegen' }, 'a2'],
  ['schneiden', 'резать', { pp: 'geschnitten' }, 'a2'], ['werden', 'становиться', { ich: 'werde', du: 'wirst', er: 'wird', pp: 'geworden', aux: 's' }, 'a1'],
  ['wissen', 'знать (факт)', { ich: 'weiß', du: 'weißt', er: 'weiß', ihr: 'wisst', pp: 'gewusst' }, 'a1'], ['denken', 'думать', { pp: 'gedacht' }, 'a2'],
  ['bringen', 'приносить', { pp: 'gebracht' }, 'a2'], ['kennen', 'знать (кого-то)', { pp: 'gekannt' }, 'a1'], ['rufen', 'звать, кричать', { pp: 'gerufen' }, 'a2'],
  ['waschen', 'мыть', { du: 'wäschst', er: 'wäscht', pp: 'gewaschen' }, 'a2'], ['halten', 'держать, останавливаться', { du: 'hältst', er: 'hält', pp: 'gehalten' }, 'a2'],
  ['verstehen', 'понимать', { pp: 'verstanden' }, 'a1'], ['vergessen', 'забывать', { du: 'vergisst', er: 'vergisst', pp: 'vergessen' }, 'a2'],
  ['bekommen', 'получать', { pp: 'bekommen' }, 'a1'], ['beginnen', 'начинать', { pp: 'begonnen' }, 'a2'], ['gefallen', 'нравиться', { du: 'gefällst', er: 'gefällt', pp: 'gefallen' }, 'a2'],
  ['lassen', 'позволять, оставлять', { du: 'lässt', er: 'lässt', pp: 'gelassen' }, 'a2'], ['fallen', 'падать', { du: 'fällst', er: 'fällt', pp: 'gefallen', aux: 's' }, 'a2'],
  // separable
  ['aufstehen', 'вставать', { base: 'stehen', sep: 'auf', aux: 's' }, 'a1'], ['einkaufen', 'делать покупки', { base: 'kaufen', sep: 'ein' }, 'a1'],
  ['anrufen', 'звонить', { base: 'rufen', sep: 'an' }, 'a1'], ['mitkommen', 'идти вместе', { base: 'kommen', sep: 'mit', aux: 's' }, 'a1'],
  ['ankommen', 'прибывать', { base: 'kommen', sep: 'an', aux: 's' }, 'a1'], ['abfahren', 'отправляться', { base: 'fahren', sep: 'ab', aux: 's' }, 'a1'],
  ['einsteigen', 'садиться (в транспорт)', { base: 'steigen', sep: 'ein', aux: 's' }, 'a1'], ['aussteigen', 'выходить (из транспорта)', { base: 'steigen', sep: 'aus', aux: 's' }, 'a1'],
  ['fernsehen', 'смотреть телевизор', { base: 'sehen', sep: 'fern' }, 'a1'], ['aufräumen', 'убирать (порядок)', { base: 'räumen', sep: 'auf' }, 'a2'],
  ['anfangen', 'начинать', { base: 'fangen', sep: 'an' }, 'a1'], ['einladen', 'приглашать', { base: 'laden', sep: 'ein' }, 'a1'],
  ['mitnehmen', 'брать с собой', { base: 'nehmen', sep: 'mit' }, 'a2'], ['abholen', 'забирать (кого-то)', { base: 'holen', sep: 'ab' }, 'a2'],
  ['aufwachen', 'просыпаться', { base: 'wachen', sep: 'auf', aux: 's' }, 'a2'], ['umziehen', 'переезжать', { base: 'ziehen', sep: 'um', aux: 's' }, 'a2'],
  ['ausgehen', 'выходить гулять', { base: 'gehen', sep: 'aus', aux: 's' }, 'a2'], ['anziehen', 'надевать', { base: 'ziehen', sep: 'an' }, 'a2'],
  // building blocks only (not offered as vocabulary)
  ['steigen', '', { pp: 'gestiegen', aux: 's', hidden: true }, 'a2'], ['räumen', '', { hidden: true }, 'a2'],
  ['fangen', '', { du: 'fängst', er: 'fängt', pp: 'gefangen', hidden: true }, 'a2'], ['laden', '', { du: 'lädst', er: 'lädt', pp: 'geladen', hidden: true }, 'a2'],
  ['wachen', '', { hidden: true }, 'a2'], ['ziehen', '', { pp: 'gezogen', hidden: true }, 'a2'],
];
const VMAP = Object.fromEntries(V.map(([inf, ru, o, lvl]) => [inf, { inf, ru, lvl, ...o }]));

export const PRON = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];
export const PRON_KEYS = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];

const stemOf = (inf) => (inf.endsWith('en') ? inf.slice(0, -2) : inf.slice(0, -1));
const needsE = (stem) => /[dt]$/.test(stem) || /[bcdfgkpstvwxz]n$/.test(stem) || /[bcdfgkpstvwxz]m$/.test(stem) || /chn$/.test(stem);

/** Präsens of a verb → { ich, du, er, wir, ihr, sie } (+ sep for separable verbs). */
export function conjugate(inf) {
  const v = VMAP[inf];
  if (!v) throw new Error('unknown verb ' + inf);
  if (v.base) { const f = conjugate(v.base); return { ...f, sep: v.sep }; }
  const stem = stemOf(inf);
  const e = needsE(stem);
  const duReg = /[sßxz]$/.test(stem) ? `${stem}t` : e ? `${stem}est` : `${stem}st`;
  const erReg = e ? `${stem}et` : `${stem}t`;
  return { ich: v.ich || `${stem}e`, du: v.du || duReg, er: v.er || erReg, wir: inf, ihr: v.ihr || erReg, sie: inf };
}

const NO_GE = /^(be|ver|er|ent|zer|ge|miss)/;
/** Partizip II ('gemacht', 'aufgestanden', 'besucht'). */
export function participle(inf) {
  const v = VMAP[inf];
  if (!v) throw new Error('unknown verb ' + inf);
  if (v.base) return v.sep + participle(v.base);
  if (v.pp) return v.pp;
  const stem = stemOf(inf);
  const t = needsE(stem) ? 'et' : 't';
  if (/ieren$/.test(inf) || NO_GE.test(inf)) return `${stem}${t}`;
  return `ge${stem}${t}`;
}
export const auxOf = (inf) => (VMAP[inf]?.aux === 's' ? 'sein' : 'haben');
export const isSeparable = (inf) => !!VMAP[inf]?.sep;

/** Break a Partizip II into word-building tiles: gemacht → ge · mach · t ;  aufgestanden → auf · ge · stand · en */
export function participleParts(inf) {
  const pp = participle(inf);
  const v = VMAP[inf];
  const parts = [];
  let rest = pp;
  if (v.sep) { parts.push(v.sep); rest = rest.slice(v.sep.length); }
  const ins = /^(be|ver|er|ent|zer|miss)/.exec(rest);
  if (rest.startsWith('ge')) { parts.push('ge'); rest = rest.slice(2); }
  else if (ins) { parts.push(ins[1]); rest = rest.slice(ins[1].length); }
  const end = /(et|en|t)$/.exec(rest);
  if (end && rest.length > end[1].length) { parts.push(rest.slice(0, -end[1].length), end[1]); } else parts.push(rest);
  return parts.filter(Boolean);
}

export const VERBS = V.filter(([, , o]) => !o.hidden).map(([inf, ru, o, lvl]) => ({
  id: `v:${inf}`, kind: 'v', de: inf, ru, lvl, topic: 'Verben', sep: o.sep || null, aux: o.aux === 's' ? 'sein' : 'haben',
  pp: participle(inf), forms: conjugate(inf),
}));

// ── modal verbs + sein/haben (fully explicit)
export const MODALS = {
  sein:    { ru: 'быть', pres: ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'], pret: ['war', 'warst', 'war', 'waren', 'wart', 'waren'] },
  haben:   { ru: 'иметь', pres: ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'], pret: ['hatte', 'hattest', 'hatte', 'hatten', 'hattet', 'hatten'] },
  können:  { ru: 'мочь, уметь', pres: ['kann', 'kannst', 'kann', 'können', 'könnt', 'können'], pret: ['konnte', 'konntest', 'konnte', 'konnten', 'konntet', 'konnten'] },
  müssen:  { ru: 'быть должным', pres: ['muss', 'musst', 'muss', 'müssen', 'müsst', 'müssen'], pret: ['musste', 'musstest', 'musste', 'mussten', 'musstet', 'mussten'] },
  wollen:  { ru: 'хотеть', pres: ['will', 'willst', 'will', 'wollen', 'wollt', 'wollen'], pret: ['wollte', 'wolltest', 'wollte', 'wollten', 'wolltet', 'wollten'] },
  dürfen:  { ru: 'мочь (разрешено)', pres: ['darf', 'darfst', 'darf', 'dürfen', 'dürft', 'dürfen'], pret: ['durfte', 'durftest', 'durfte', 'durften', 'durftet', 'durften'] },
  sollen:  { ru: 'следует', pres: ['soll', 'sollst', 'soll', 'sollen', 'sollt', 'sollen'], pret: ['sollte', 'solltest', 'sollte', 'sollten', 'solltet', 'sollten'] },
  möchten: { ru: 'хотел бы', pres: ['möchte', 'möchtest', 'möchte', 'möchten', 'möchtet', 'möchten'], pret: null },
};

export const POSSESSIVE = [['ich', 'mein'], ['du', 'dein'], ['er', 'sein'], ['sie', 'ihr'], ['wir', 'unser'], ['ihr', 'euer'], ['Sie', 'Ihr']];
export const REFLEXIVE = [['ich', 'mich'], ['du', 'dich'], ['er/sie/es', 'sich'], ['wir', 'uns'], ['ihr', 'euch'], ['sie/Sie', 'sich']];

// ── adjectives: [positive, comparative, superlative, русский, level]
const A = [
  ['klein', 'kleiner', 'am kleinsten', 'маленький', 'a1'], ['groß', 'größer', 'am größten', 'большой', 'a1'], ['alt', 'älter', 'am ältesten', 'старый', 'a1'],
  ['jung', 'jünger', 'am jüngsten', 'молодой', 'a1'], ['schnell', 'schneller', 'am schnellsten', 'быстрый', 'a1'], ['langsam', 'langsamer', 'am langsamsten', 'медленный', 'a1'],
  ['teuer', 'teurer', 'am teuersten', 'дорогой', 'a1'], ['billig', 'billiger', 'am billigsten', 'дешёвый', 'a1'], ['schön', 'schöner', 'am schönsten', 'красивый', 'a1'],
  ['hoch', 'höher', 'am höchsten', 'высокий', 'a2'], ['nah', 'näher', 'am nächsten', 'близкий', 'a2'], ['gut', 'besser', 'am besten', 'хороший', 'a1'],
  ['viel', 'mehr', 'am meisten', 'много', 'a1'], ['gern', 'lieber', 'am liebsten', 'охотно', 'a1'], ['kalt', 'kälter', 'am kältesten', 'холодный', 'a1'],
  ['warm', 'wärmer', 'am wärmsten', 'тёплый', 'a1'], ['lang', 'länger', 'am längsten', 'длинный', 'a1'], ['kurz', 'kürzer', 'am kürzesten', 'короткий', 'a1'],
  ['stark', 'stärker', 'am stärksten', 'сильный', 'a2'], ['hell', 'heller', 'am hellsten', 'светлый', 'a2'], ['dunkel', 'dunkler', 'am dunkelsten', 'тёмный', 'a2'],
  ['leicht', 'leichter', 'am leichtesten', 'лёгкий', 'a1'], ['schwer', 'schwerer', 'am schwersten', 'тяжёлый, трудный', 'a1'], ['neu', 'neuer', 'am neuesten', 'новый', 'a1'],
  ['früh', 'früher', 'am frühesten', 'ранний', 'a2'], ['wichtig', 'wichtiger', 'am wichtigsten', 'важный', 'a1'], ['gesund', 'gesünder', 'am gesündesten', 'здоровый', 'a2'],
  ['arm', 'ärmer', 'am ärmsten', 'бедный', 'a2'], ['interessant', 'interessanter', 'am interessantesten', 'интересный', 'a1'], ['freundlich', 'freundlicher', 'am freundlichsten', 'дружелюбный', 'a2'],
];
export const ADJECTIVES = A.map(([pos, comp, sup, ru, lvl]) => ({ id: `a:${pos}`, kind: 'a', de: pos, comp, sup, ru, lvl, topic: 'Adjektive' }));

// ── everyday phrases (listening / speaking / translation-building): [German, русский, level]
const P = [
  ['Guten Morgen! Wie geht es Ihnen?', 'Доброе утро! Как Ваши дела?', 'a1'],
  ['Ich heiße Anna und komme aus Russland.', 'Меня зовут Анна, я из России.', 'a1'],
  ['Ich wohne seit zwei Jahren in Berlin.', 'Я живу в Берлине уже два года.', 'a2'],
  ['Entschuldigung, wo ist der Bahnhof?', 'Извините, где вокзал?', 'a1'],
  ['Ich hätte gern einen Kaffee, bitte.', 'Мне, пожалуйста, чашку кофе.', 'a1'],
  ['Wie viel kostet das?', 'Сколько это стоит?', 'a1'],
  ['Können Sie das bitte wiederholen?', 'Можете повторить, пожалуйста?', 'a1'],
  ['Ich verstehe das nicht ganz.', 'Я не совсем это понимаю.', 'a1'],
  ['Sprechen Sie bitte langsamer.', 'Говорите, пожалуйста, медленнее.', 'a1'],
  ['Was machst du am Wochenende?', 'Что ты делаешь на выходных?', 'a1'],
  ['Ich möchte einen Tisch für zwei Personen reservieren.', 'Я хотел бы забронировать столик на двоих.', 'a2'],
  ['Die Rechnung, bitte.', 'Счёт, пожалуйста.', 'a1'],
  ['Ich habe Kopfschmerzen und Fieber.', 'У меня болит голова и температура.', 'a2'],
  ['Wann fährt der nächste Zug nach München?', 'Когда отправляется следующий поезд в Мюнхен?', 'a2'],
  ['Gibt es hier ein Hotel in der Nähe?', 'Есть ли здесь поблизости отель?', 'a2'],
  ['Das schmeckt mir sehr gut.', 'Мне это очень нравится (на вкус).', 'a1'],
  ['Ich lerne Deutsch, weil ich in Deutschland arbeiten möchte.', 'Я учу немецкий, потому что хочу работать в Германии.', 'a2'],
  ['Es tut mir leid, ich habe mich verspätet.', 'Мне жаль, я опоздал.', 'a2'],
  ['Kannst du mir bitte helfen?', 'Ты можешь мне помочь?', 'a1'],
  ['Ich freue mich auf den Urlaub.', 'Я радуюсь предстоящему отпуску.', 'a2'],
  ['Gestern bin ich ins Kino gegangen.', 'Вчера я ходил в кино.', 'a2'],
  ['Wo kann ich ein Ticket kaufen?', 'Где можно купить билет?', 'a1'],
  ['Ich brauche einen Termin beim Arzt.', 'Мне нужна запись к врачу.', 'a2'],
  ['Wie spät ist es?', 'Который час?', 'a1'],
  ['Das Wetter ist heute wunderschön.', 'Сегодня чудесная погода.', 'a1'],
  ['Ich rufe dich später an.', 'Я позвоню тебе позже.', 'a1'],
  ['Hast du Lust, mit mir spazieren zu gehen?', 'Хочешь пойти со мной погулять?', 'a2'],
  ['Ich bin müde, deshalb gehe ich früh ins Bett.', 'Я устал, поэтому ложусь спать пораньше.', 'a2'],
  ['Der Zug hat zehn Minuten Verspätung.', 'Поезд опаздывает на десять минут.', 'a2'],
  ['Wir treffen uns um halb acht vor dem Kino.', 'Мы встречаемся в половине восьмого перед кинотеатром.', 'a2'],
  ['Ich komme aus Russland und lerne seit einem Jahr Deutsch.', 'Я из России и учу немецкий уже год.', 'a2'],
  ['Könnten Sie mir bitte den Weg zeigen?', 'Не могли бы Вы показать мне дорогу?', 'a2'],
  ['Am Wochenende besuche ich meine Großeltern.', 'На выходных я навещаю бабушку и дедушку.', 'a2'],
  ['Ich habe leider keine Zeit.', 'К сожалению, у меня нет времени.', 'a1'],
  ['Danke schön, das ist sehr nett von Ihnen.', 'Большое спасибо, это очень мило с Вашей стороны.', 'a1'],
  ['Ich möchte lieber Tee als Kaffee.', 'Я бы предпочёл чай, а не кофе.', 'a2'],
  ['Heute Abend koche ich für meine Freunde.', 'Сегодня вечером я готовлю для друзей.', 'a2'],
  ['Wo wohnst du und was machst du beruflich?', 'Где ты живёшь и кем работаешь?', 'a2'],
  ['Das Zimmer ist klein, aber sehr gemütlich.', 'Комната маленькая, но очень уютная.', 'a2'],
];
export const PHRASES = P.map(([de, ru, lvl], i) => ({ id: `p:${i}`, kind: 'p', de, ru, lvl, topic: 'Phrasen' }));

/** Every built-in word as one list (the vocabulary deck). */
export const WORDS = [...NOUNS, ...VERBS, ...ADJECTIVES, ...PHRASES];
export const WORD_BY_ID = Object.fromEntries(WORDS.map((w) => [w.id, w]));

/** "der Tisch" / "kaufen" / "klein" — how a word is shown to the learner. */
export const label = (w) => (w.kind === 'n' ? `${w.art} ${w.de}` : w.de);
export const ARTICLE_COLOR = { der: '#4a7dff', die: '#ff5d73', das: '#22b58a' };
