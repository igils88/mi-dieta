/* ============================================================
   data.js — Dietas de Ismael (semanas 1 a 10)
   ------------------------------------------------------------
   Transcritas de los PDF del nutricionista: las comidas y cenas
   vienen de la versión digitalizada; desayuno, media mañana,
   merienda y notas, de la hoja manuscrita.

   Un plato puede llevar `dia` (0 = lunes … 6 = domingo) cuando
   la dieta lo fija a un día concreto. El resto se reparten
   libres y se pueden arrastrar.
   ============================================================ */

/* ---------- Secciones del supermercado ---------- */
const SECCIONES = {
  carniceria: { nombre: 'Carnicería y charcutería', icono: '🥩' },
  pescaderia: { nombre: 'Pescadería',               icono: '🐟' },
  fruteria:   { nombre: 'Frutería y verdura',       icono: '🥦' },
  lacteos:    { nombre: 'Lácteos y huevos',         icono: '🥚' },
  despensa:   { nombre: 'Despensa',                 icono: '🫒' },
  otros:      { nombre: 'Otros',                    icono: '🛒' },
};

/* ---------- Clasificación automática de ingredientes ---------- */
const CLASIFICACION = {
  carniceria: ['pollo', 'pavo', 'ternera', 'solomillo', 'lomo', 'cerdo', 'lechal', 'entrecot', 'jamón',
               'york', 'lacón', 'hamburguesa', 'salchichas', 'conejo', 'caldo', 'consomé'],
  pescaderia: ['pescado', 'merluza', 'salmón', 'atún', 'bacalao', 'lubina', 'dorada', 'gambas',
               'langostinos', 'sepia', 'calamar', 'pulpo', 'marisco', 'gulas', 'boquerones',
               'mejillones', 'ventresca', 'sardinas', 'anchoas'],
  fruteria:   ['ensalada', 'lechuga', 'canónigos', 'brotes', 'escarola', 'endibias', 'rúcula',
               'tomate', 'pepino', 'cebolla', 'pimiento', 'calabacín', 'berenjena', 'brócoli',
               'espinacas', 'judías', 'zanahoria', 'champiñones', 'setas', 'espárragos', 'trigueros',
               'aguacate', 'alcachofas', 'puerro', 'coliflor', 'verduras', 'fruta', 'piña', 'kiwis',
               'naranjas', 'mandarinas', 'patata', 'maíz'],
  lacteos:    ['huevo', 'claras', 'yogur', 'queso', 'burgos', 'philadelphia', 'leche', 'margarina'],
  despensa:   ['arroz', 'pasta', 'quinoa', 'lentejas', 'garbanzos', 'alubias', 'legumbres', 'pan',
               'biscotes', 'molde', 'aceite', 'mermelada', 'café', 'especias', 'vinagre'],
};

/* ---------- Normas generales (iguales en todas las dietas) ---------- */
const NORMAS = [
  'Beber 2 litros de agua al día (muy importante).',
  'Comer 5 comidas al día (hasta 7 según necesidad), dejando una hora entre comidas y no pasando más de 4 entre ellas.',
  'Pesar los alimentos una vez cocinados.',
  'Sí a ajo, perejil y especias.',
  'Cocinar según gusto: cocido, plancha, horno o frito con aceite de oliva limpio.',
  'Bebidas permitidas: infusiones, café solo, Coca-Cola Light, Nestea sin azúcar. Aquarius libre.',
  'Un día libre a la semana.',
  'Andar 1 hora diaria.',
  'Pesarse sólo la mañana del día libre.',
];

/* ---------- Atajo para escribir platos ---------- */
const p = (id, titulo, ingredientes, dia = null) => ({ id, titulo, detalle: '', ingredientes, dia });

/* ============================================================
   Las 9 dietas del plan
   ============================================================ */

const DIETAS = [

  /* ---------------- Dieta 1 · semanas 1 y 2 ---------------- */
  {
    id: 'd1',
    nombre: 'Dieta 1',
    subtitulo: 'Semanas 1 y 2',
    notas: '3 o 5 biscotes en todas las cenas.',
    fijos: {
      desayuno: 'Café + pan integral con pavo, o con tomate y aceite, o con Philadelphia light',
      media_manana: 'Fruta sin mezclar (no higos, uvas ni plátanos)',
      merienda: 'Yogures proteínas',
    },
    comidas: [
      p('d1c1', 'Pasta con verduras y gambas',            ['pasta', 'verduras', 'gambas']),
      p('d1c2', 'Ensalada completa con huevo y atún',     ['ensalada', 'huevos', 'atún natural']),
      p('d1c3', 'Judías verdes y pescado blanco',         ['judías verdes', 'pescado blanco']),
      p('d1c4', 'Lentejas con verduras y pollo',          ['lentejas', 'verduras', 'pollo']),
      p('d1c5', 'Arroz + atún + tortilla francesa',       ['arroz', 'atún natural', 'huevos']),
      p('d1c6', 'Puré + pollo plancha',                   ['verduras', 'pollo']),
    ],
    cenas: [
      p('d1n1', 'Pescado blanco',                         ['pescado blanco', 'biscotes']),
      p('d1n2', 'Jamón y tomate',                         ['jamón', 'tomate', 'biscotes']),
      p('d1n3', 'Pavo y aguacate',                        ['pavo', 'aguacate', 'biscotes']),
      p('d1n4', 'Tortilla francesa con gambas',           ['huevos', 'gambas', 'biscotes']),
      p('d1n5', 'Gulas con gambas',                       ['gulas', 'gambas', 'biscotes']),
      p('d1n6', 'Tomate + huevo + atún',                  ['tomate', 'huevos', 'atún natural', 'biscotes']),
    ],
  },

  /* ---------------- Dieta 2 · semana 3 ---------------- */
  {
    id: 'd2',
    nombre: 'Dieta 2',
    subtitulo: 'Semana 3',
    notas: '',
    fijos: {
      desayuno: 'Café + pan de molde integral con aceite o margarina',
      media_manana: 'Fruta (no higos, uvas ni plátanos)',
      merienda: 'Yogures desnatados',
    },
    comidas: [
      p('d2c1', 'Canónigos, tomate y ternera',                      ['canónigos', 'tomate', 'ternera']),
      p('d2c2', 'Trigueros y pescado',                              ['espárragos trigueros', 'pescado']),
      p('d2c3', 'Canónigos, quinoa y solomillo de cerdo o lomo',    ['canónigos', 'quinoa', 'solomillo de cerdo']),
      p('d2c4', 'Calabacín y pollo asado o hamburguesa de pollo',   ['calabacín', 'pollo']),
      p('d2c5', 'Champiñones y pescado',                            ['champiñones', 'pescado']),
      p('d2c6', 'Canónigos y pollo plancha',                        ['canónigos', 'pollo']),
    ],
    cenas: [
      p('d2n1', 'Pollo plancha o asado',                            ['pollo']),
      p('d2n2', 'Pavo y 3 biscotes',                                ['pavo', 'biscotes']),
      p('d2n3', 'Sepia o lacón',                                    ['sepia', 'lacón']),
      p('d2n4', 'Tortilla francesa de trigueros, champi o calabacín', ['huevos', 'espárragos trigueros', 'champiñones', 'calabacín']),
      p('d2n5', 'Pescado blanco y canónigos',                       ['pescado blanco', 'canónigos']),
      p('d2n6', 'Tortilla francesa de trigueros, champi o calabacín', ['huevos', 'espárragos trigueros', 'champiñones', 'calabacín']),
    ],
  },

  /* ---------------- Dieta 3 · semana 4 ---------------- */
  {
    id: 'd3',
    nombre: 'Dieta 3',
    subtitulo: 'Semana 4',
    notas: '',
    fijos: {
      desayuno: 'Café + pan integral con pavo, margarina o aceite, o tortilla con 5 claras',
      media_manana: 'Pavo, jamón o yogures',
      merienda: 'Pavo, jamón o yogures',
    },
    comidas: [
      p('d3c1', 'Brócoli y pescado blanco',                 ['brócoli', 'pescado blanco']),
      p('d3c2', 'Caldo y solomillo de cerdo',               ['caldo', 'solomillo de cerdo']),
      p('d3c3', 'Pollo asado',                              ['pollo']),
      p('d3c4', 'Champiñones y ternera',                    ['champiñones', 'ternera']),
      p('d3c5', 'Trigueros, huevo y gambas o atún',         ['espárragos trigueros', 'huevos', 'gambas', 'atún natural']),
      p('d3c6', 'Caldo y pescado',                          ['caldo', 'pescado']),
    ],
    cenas: [
      p('d3n1', 'Pulpo, marisco o lechal',                  ['pulpo', 'marisco', 'lechal']),
      p('d3n2', 'Tortilla con jamón, pavo o gambas',        ['huevos', 'jamón', 'pavo', 'gambas']),
      p('d3n3', 'Pavo y queso de Burgos',                   ['pavo', 'queso de burgos']),
      p('d3n4', 'Pescado',                                  ['pescado']),
      p('d3n5', 'Espinacas y pollo plancha',                ['espinacas', 'pollo']),
      p('d3n6', 'Tortilla con jamón, pavo o gambas',        ['huevos', 'jamón', 'pavo', 'gambas']),
    ],
  },

  /* ---------------- Dieta 4 · semana 5 ---------------- */
  {
    id: 'd4',
    nombre: 'Dieta 4',
    subtitulo: 'Semana 5',
    notas: '',
    fijos: {
      desayuno: 'Café + pan integral con margarina, pavo o tortilla de 5 claras',
      media_manana: 'Fruta o zumo de tomate',
      merienda: 'Como la media mañana',
    },
    comidas: [
      p('d4c1', 'Arroz con verduras',                       ['arroz', 'verduras']),
      p('d4c2', 'Lentejas con verduras',                    ['lentejas', 'verduras']),
      p('d4c3', 'Judías verdes y solomillo de cerdo',       ['judías verdes', 'solomillo de cerdo']),
      p('d4c4', 'Puré y pescado blanco',                    ['verduras', 'pescado blanco']),
      p('d4c5', 'Alcachofas y 2 huevos',                    ['alcachofas', 'huevos']),
      p('d4c6', 'Canónigos y pollo plancha',                ['canónigos', 'pollo']),
    ],
    cenas: [
      p('d4n1', 'Tortilla de champiñones',                  ['huevos', 'champiñones']),
      p('d4n2', 'Tomate y atún',                            ['tomate', 'atún natural']),
      p('d4n3', 'Tortilla de champiñones',                  ['huevos', 'champiñones']),
      p('d4n4', 'Hamburguesas de pollo',                    ['hamburguesa de pollo']),
      p('d4n5', 'Brócoli y queso de Burgos',                ['brócoli', 'queso de burgos']),
      p('d4n6', 'Cualquier alimento del mar',               ['pescado', 'marisco']),
    ],
  },

  /* ---------------- Dieta 5 · semana 6 ---------------- */
  {
    id: 'd5',
    nombre: 'Dieta 5',
    subtitulo: 'Semana 6',
    notas: 'Las cenas se hacen en el orden de la lista.',
    fijos: {
      desayuno: 'Café + 2 o 4 biscotes con pavo, mermelada light o Philadelphia light',
      media_manana: 'Fruta (no higos, uvas ni plátanos)',
      merienda: 'Kiwis, piña, naranjas o mandarinas',
    },
    comidas: [
      p('d5c1', 'Verdura, fruta y huevo',                   ['verduras', 'fruta', 'huevos']),
      p('d5c2', 'Tomate y pescado blanco',                  ['tomate', 'pescado blanco']),
      p('d5c3', 'Verdura, fruta y huevo',                   ['verduras', 'fruta', 'huevos']),
      p('d5c4', 'Canónigos y pollo plancha',                ['canónigos', 'pollo']),
      p('d5c5', 'Lentejas con verduras',                    ['lentejas', 'verduras']),
      p('d5c6', 'Brotes, tomate, huevo y 1-2 de piña',      ['brotes', 'tomate', 'huevos', 'piña']),
    ],
    cenas: [
      p('d5n1', 'Pollo plancha',                            ['pollo']),
      p('d5n2', 'Ternera',                                  ['ternera']),
      p('d5n3', 'Verduras plancha y pescado blanco',        ['verduras', 'pescado blanco']),
      p('d5n4', 'Pescado',                                  ['pescado']),
      p('d5n5', 'Espárragos y 2 huevos',                    ['espárragos', 'huevos']),
      p('d5n6', 'Ensalada y pavo',                          ['ensalada', 'pavo']),
    ],
  },

  /* ---------------- Dieta 6 · semana 7 ---------------- */
  {
    id: 'd6a',
    nombre: 'Dieta 6 · semana 7',
    subtitulo: 'Semana 7',
    notas: 'Las cenas son como las comidas, en el orden que quieras. Sustituye el arroz y las lentejas de la cena por pescado, tortilla con pavo o sepia.',
    fijos: {
      desayuno: 'Café + pan integral con pavo, tortilla con 5 claras, margarina o tomate',
      media_manana: 'Piña, naranjas, zumo de tomate o yogures',
      merienda: 'Como la media mañana',
    },
    comidas: [
      p('d6ac1', 'Alcachofas, espinacas o brócoli con pescado blanco o pollo', ['alcachofas', 'espinacas', 'brócoli', 'pescado blanco', 'pollo']),
      p('d6ac2', 'Lentejas con verduras y 1 o 2 huevos',    ['lentejas', 'verduras', 'huevos']),
      p('d6ac3', 'Alcachofas, espinacas o brócoli con pescado blanco o pollo', ['alcachofas', 'espinacas', 'brócoli', 'pescado blanco', 'pollo']),
      p('d6ac4', 'Brotes, tomate y 2-4 latas de atún',      ['brotes', 'tomate', 'atún natural']),
      p('d6ac5', 'Arroz con verduras y pollo',              ['arroz', 'verduras', 'pollo']),
      p('d6ac6', 'Consomé y ternera',                       ['consomé', 'ternera']),
    ],
    cenas: [
      p('d6an1', 'Pescado, tortilla con pavo o sepia',      ['pescado', 'huevos', 'pavo', 'sepia']),
      p('d6an2', 'Consomé y ternera',                       ['consomé', 'ternera']),
      p('d6an3', 'Pescado, tortilla con pavo o sepia',      ['pescado', 'huevos', 'pavo', 'sepia']),
      p('d6an4', 'Alcachofas, espinacas o brócoli con pescado blanco o pollo', ['alcachofas', 'espinacas', 'brócoli', 'pescado blanco', 'pollo']),
      p('d6an5', 'Alcachofas, espinacas o brócoli con pescado blanco o pollo', ['alcachofas', 'espinacas', 'brócoli', 'pescado blanco', 'pollo']),
      p('d6an6', 'Brotes, tomate y 2-4 latas de atún',      ['brotes', 'tomate', 'atún natural']),
    ],
  },

  /* ---------------- Dieta 6 · semana 8 ---------------- */
  {
    id: 'd6b',
    nombre: 'Dieta 6 · semana 8',
    subtitulo: 'Semana 8',
    notas: 'Miércoles, jueves y viernes van fijos; el resto los colocas donde quieras.',
    fijos: {
      desayuno: 'Café + pan integral con pavo, tortilla con 5 claras, margarina o tomate',
      media_manana: 'Piña, naranjas, zumo de tomate o yogures',
      merienda: 'Como la media mañana',
    },
    comidas: [
      p('d6bc1', 'Pescado azul',                            ['pescado azul'], 2),
      p('d6bc2', 'Ternera',                                 ['ternera'], 3),
      p('d6bc3', 'Pollo asado',                             ['pollo'], 4),
      p('d6bc4', 'Consomé y ternera',                       ['consomé', 'ternera']),
      p('d6bc5', 'Arroz con verduras y pollo',              ['arroz', 'verduras', 'pollo']),
      p('d6bc6', 'Brotes, tomate y 2-4 latas de atún',      ['brotes', 'tomate', 'atún natural']),
    ],
    cenas: [
      p('d6bn1', 'Pulpo, solomillo de cerdo, tortilla con atún, pescado o sepia', ['pulpo', 'solomillo de cerdo', 'huevos', 'atún natural', 'pescado', 'sepia'], 2),
      p('d6bn2', 'Pulpo, solomillo de cerdo, tortilla con atún, pescado o sepia', ['pulpo', 'solomillo de cerdo', 'huevos', 'atún natural', 'pescado', 'sepia'], 3),
      p('d6bn3', 'Pulpo, solomillo de cerdo, tortilla con atún, pescado o sepia', ['pulpo', 'solomillo de cerdo', 'huevos', 'atún natural', 'pescado', 'sepia'], 4),
      p('d6bn4', 'Consomé y ternera',                       ['consomé', 'ternera']),
      p('d6bn5', 'Brotes, tomate y 2-4 latas de atún',      ['brotes', 'tomate', 'atún natural']),
      p('d6bn6', 'Pescado, tortilla con pavo o sepia',      ['pescado', 'huevos', 'pavo', 'sepia']),
    ],
  },

  /* ---------------- Dieta 7 · semana 9 ---------------- */
  {
    id: 'd7',
    nombre: 'Dieta 7',
    subtitulo: 'Semana 9',
    notas: '',
    fijos: {
      desayuno: 'Café + pan integral con pavo',
      media_manana: 'Fruta, pavo o yogures',
      merienda: 'Yogures o pavo',
    },
    comidas: [
      p('d7c1', 'Sepia',                                    ['sepia']),
      p('d7c2', 'Entrecot',                                 ['entrecot']),
      p('d7c3', 'Entrecot',                                 ['entrecot']),
      p('d7c4', 'Pollo asado',                              ['pollo']),
      p('d7c5', 'Pescado',                                  ['pescado']),
      p('d7c6', 'Solomillo o lechal',                       ['solomillo de cerdo', 'lechal']),
    ],
    cenas: [
      p('d7n1', 'Lomo, tomate y 2 biscotes',                ['lomo', 'tomate', 'biscotes']),
      p('d7n2', 'Tomate y pollo plancha',                   ['tomate', 'pollo']),
      p('d7n3', 'Pollo plancha, tomate y 2 biscotes',       ['pollo', 'tomate', 'biscotes']),
      p('d7n4', 'Tortilla, atún y 2 biscotes',              ['huevos', 'atún natural', 'biscotes']),
      p('d7n5', 'Canónigos, 2-3 atún y 2 biscotes',         ['canónigos', 'atún natural', 'biscotes']),
      p('d7n6', 'Tortilla, atún y 2 biscotes',              ['huevos', 'atún natural', 'biscotes']),
    ],
  },

  /* ---------------- Dieta 8 · semana 10 ---------------- */
  {
    id: 'd8',
    nombre: 'Dieta 8',
    subtitulo: 'Semana 10',
    notas: '',
    fijos: {
      desayuno: 'Cortado + 2 o 3 biscotes integrales con pavo, york, jamón o Philadelphia light',
      media_manana: 'York, lomo, jamón o pavo',
      merienda: '3 días como la media mañana y 3 días yogures',
    },
    comidas: [
      p('d8c1', 'Caldo y 4 de lomo',                        ['caldo', 'lomo']),
      p('d8c2', 'Brotes y pollo asado',                     ['brotes', 'pollo']),
      p('d8c3', 'Caldo y pescado o ternera',                ['caldo', 'pescado', 'ternera']),
      p('d8c4', 'Espárragos y pescado blanco o pavo',       ['espárragos', 'pescado blanco', 'pavo']),
      p('d8c5', 'Brotes y 2-3 de atún',                     ['brotes', 'atún natural']),
      p('d8c6', 'Brotes y 2-3 de atún',                     ['brotes', 'atún natural']),
    ],
    cenas: [
      p('d8n1', 'Brotes y salmón ahumado',                  ['brotes', 'salmón ahumado']),
      p('d8n2', 'Solomillo, asado, plancha o ternera',      ['solomillo de cerdo', 'ternera']),
      p('d8n3', 'Tortilla de atún o pavo',                  ['huevos', 'atún natural', 'pavo']),
      p('d8n4', 'Solomillo, asado, plancha o ternera',      ['solomillo de cerdo', 'ternera']),
      p('d8n5', 'Brotes y salmón ahumado',                  ['brotes', 'salmón ahumado']),
      p('d8n6', 'Tortilla de atún o pavo',                  ['huevos', 'atún natural', 'pavo']),
    ],
  },
];

/* ============================================================
   Secuencia del plan: qué dieta toca en cada semana (1 a 10)
   ============================================================ */
const SECUENCIA = ['d1', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6a', 'd6b', 'd7', 'd8'];
