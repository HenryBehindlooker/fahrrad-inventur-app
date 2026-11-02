import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize, partGroupKey, groupParts, formatInvNr, parseNumber, toCSV, CATEGORIES, categoryInfo, computeStats, matchesQuery,
} from '../../web/js/model.js';

test('normalize ignoriert Groß-/Kleinschreibung, Leerzeichen, Akzente', () => {
  assert.equal(normalize('Shimano 600 AX'), normalize('shimano 600ax'));
  assert.equal(normalize('Motobécane'), 'motobecane');
  assert.equal(normalize('Weiß'), 'weiss');
});

test('Kategorie-IDs sind eindeutig', () => {
  const ids = CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(categoryInfo('gibtsnicht').id, 'sonstiges/sonstiges');
});

test('partGroupKey: Teilenummer hat Vorrang, sonst Hersteller + Modell', () => {
  const a = { category: 'schaltung/schaltwerk', manufacturer: 'Shimano', model: '600 Arabesque', ref: 'RD-6207' };
  const b = { category: 'schaltung/schaltwerk', manufacturer: 'SHIMANO', model: 'Arabesque', ref: 'rd 6207' };
  assert.equal(partGroupKey(a), partGroupKey(b));
  const c = { category: 'schaltung/schaltwerk', manufacturer: 'Shimano', model: '600 arabesque' };
  const d = { category: 'schaltung/schaltwerk', manufacturer: 'shimano', model: '600Arabesque' };
  assert.equal(partGroupKey(c), partGroupKey(d));
  assert.notEqual(partGroupKey(c), partGroupKey({ ...c, category: 'schaltung/umwerfer' }));
  assert.equal(partGroupKey({ category: 'bremsen/felgenbremse', manufacturer: 'Weinmann' }), null);
});

test('groupParts fasst gleiche Teile über Räder und Lager zusammen', () => {
  const parts = [
    { id: 1, bikeId: 'A', category: 'bremsen/felgenbremse', manufacturer: 'Weinmann', model: '999' },
    { id: 2, bikeId: 'B', category: 'bremsen/felgenbremse', manufacturer: 'weinmann', model: '999' },
    { id: 3, bikeId: null, status: 'lager', category: 'bremsen/felgenbremse', manufacturer: 'Weinmann', model: '999', quantity: 2 },
    { id: 4, bikeId: 'A', category: 'sitz/sattel', manufacturer: 'Brooks', model: 'B17' },
  ];
  const groups = groupParts(parts);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 4);
  assert.equal(groups[0].onBikes, 2);
  assert.equal(groups[0].inStock, 2);
  // Einzelnes Teil mit Menge >= 2 bildet ebenfalls eine Gruppe
  assert.equal(groupParts([{ category: 'antrieb/kette', manufacturer: 'KMC', model: 'Z50', quantity: 3, status: 'lager' }]).length, 1);
});

test('Inventarnummern und Zahlen', () => {
  assert.equal(formatInvNr('R', 7), 'R-0007');
  assert.equal(parseNumber('1.234,50 €'), 1234.5);
  assert.equal(parseNumber('99.9'), 99.9);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
});

test('CSV: Semikolon, Quoting, BOM, deutsches Dezimalkomma', () => {
  const csv = toCSV([{ a: 'x;y', b: 1.5 }, { a: 'Er sagte "hi"', b: null }], [
    { label: 'A', get: (r) => r.a }, { label: 'B', get: (r) => r.b },
  ]);
  assert.ok(csv.startsWith('﻿'));
  assert.deepEqual(csv.slice(1).split('\r\n'), ['A;B', '"x;y";1,5', '"Er sagte ""hi""";']);
});

test('Statistik', () => {
  const s = computeStats(
    [{ id: 'A', status: 'lager', estimatedValue: 100, type: 'Rennrad' }, { id: 'B', status: 'verkauft', salePrice: 250, purchasePrice: 50 }],
    [{ bikeId: 'A', category: 'sitz/sattel' }, { bikeId: null, status: 'lager', value: 20, quantity: 2, category: 'sitz/sattel' }],
  );
  assert.equal(s.bikeCount, 2);
  assert.equal(s.activeBikeCount, 1);
  assert.equal(s.stockPartCount, 2);
  assert.equal(s.stockValue, 140);
  assert.equal(s.salesTotal, 250);
});

test('Suche', () => {
  assert.ok(matchesQuery({ manufacturer: 'Peugeot', model: 'PX-10' }, 'px10', ['manufacturer', 'model']));
  assert.ok(!matchesQuery({ manufacturer: 'Peugeot' }, 'gazelle', ['manufacturer']));
});

import { extractInvNr, bikeCalc, stockCandidates, daysBetween } from '../../web/js/model.js';

test('extractInvNr liest Etiketten-Links, Kurzformen und Eingaben', () => {
  assert.equal(extractInvNr('https://x.github.io/app/#/inv/R-0012'), 'R-0012');
  assert.equal(extractInvNr('FIR:t-0003'), 'T-0003');
  assert.equal(extractInvNr('r0007'), 'R-0007');
  assert.equal(extractInvNr('AR-00012'), null);
  assert.equal(extractInvNr('hallo'), null);
});

test('bikeCalc: Kosten, Erlös, Gewinn', () => {
  const c = bikeCalc({ purchasePrice: 50, salePrice: 300, status: 'verkauft', tasks: [{ hours: 2, partsCost: 40, done: true }, { hours: 1 }] }, 30);
  assert.deepEqual([c.cost, c.revenue, c.margin, c.openTasks, c.realized], [180, 300, 120, 1, true]);
  const open = bikeCalc({ purchasePrice: 20, estimatedValue: 100, status: 'lager' }, 30);
  assert.deepEqual([open.revenue, open.margin, open.realized], [100, 80, false]);
  assert.equal(bikeCalc({ status: 'lager' }).margin, null);
});

test('stockCandidates: gleiche Kategorie vor gleichem Bereich, nur Lagerteile', () => {
  const parts = [
    { id: 'a', category: 'bremsen/bremshebel', status: 'lager' },
    { id: 'b', category: 'bremsen/felgenbremse', status: 'lager', condition: 3 },
    { id: 'c', category: 'bremsen/felgenbremse', status: 'lager', condition: 1 },
    { id: 'd', category: 'bremsen/felgenbremse', bikeId: 'X', status: 'verbaut' },
    { id: 'e', category: 'sitz/sattel', status: 'lager' },
    { id: 'f', category: 'bremsen/felgenbremse', status: 'verkauft' },
  ];
  assert.deepEqual(stockCandidates(parts, 'bremsen/felgenbremse').map((p) => p.id), ['c', 'b', 'a']);
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-01-01T00:00:00Z', '2026-01-31T12:00:00Z'), 30);
  assert.equal(daysBetween(null), null);
});
