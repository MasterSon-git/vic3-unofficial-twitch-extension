import type { PubSubSnapshotMessage, Snapshot } from './openapi'

export const fixtureSnapshot: Snapshot = {
  q: 1,
  d: Math.floor(Date.now() / 1000),
  u: {
    g: 1.3,
    k: 'gui_skin_base',
    a: 1.6,
  },
  c: [
    { t: 'GBR', s: 1, r: 'great_power', p: 544, g: 24298716, l: 10.2, o: 25951649, x: 1207668, m: '0' },
    { t: 'FRA', s: 2, r: 'great_power', p: 405, g: 27300000, l: 11.1, o: 34500000, x: 1016893, m: '2' },
    { t: 'RUS', s: 3, r: 'great_power', p: 389, g: 29700000, l: 9.3, o: 55900000, x: 862110, m: '3' },
    { t: 'PRU', s: 4, r: 'great_power', p: 177, g: 11000000, l: 10.2, o: 14000000, x: 329000, m: '4' },
    { t: 'AUS', s: 5, r: 'great_power', p: 148, g: 10400000, l: 7.6, o: 20700000, x: 267000, m: '5' },
    { t: 'TUR', s: 6, r: 'major_power', p: 143, g: 10400000, l: 6.8, o: 19100000, x: 190000, m: '6' },
    { t: 'USA', s: 7, r: 'major_power', p: 126, g: 14900000, l: 10.2, o: 15600000, x: 725000, m: '7' },
    { t: 'SWE', s: 8, r: 'major_power', p: 68, g: 2500000, l: 10.8, o: 2790000, x: 224000, m: '8' },
    { t: 'NET', s: 9, r: 'major_power', p: 68, g: 2200000, l: 10.5, o: 2770000, x: 512000, m: '9' },
    { t: 'BRZ', s: 10, r: 'minor_power', p: 62, g: 4000000, l: 8.2, o: 4040000, x: 318000, m: '10' },
  ],
}

export function fixtureMessage(): string {
  const message: PubSubSnapshotMessage = {
    t: 'vic3:snapshot',
    v: 1,
    p: fixtureSnapshot,
  }
  return JSON.stringify(message)
}
