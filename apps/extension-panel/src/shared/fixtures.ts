import type { PubSubSnapshotMessage, Snapshot } from './openapi'

export const fixtureSnapshot: Snapshot = {
  channelId: '484239140',
  saveHash: 'fixture-1836-01-02',
  seq: 1,
  updatedAt: new Date().toISOString(),
  ui: {
    guiScale: 1.3,
    skinTheme: 'gui_skin_base',
    streamAspectRatio: 1.6,
  },
  countries: [
    { tag: 'GBR', score: 1, rank: 'great_power', prestige: 544, gdp: 24298716, treasury: 1207668, marketId: '0' },
    { tag: 'FRA', score: 2, rank: 'great_power', prestige: 405, gdp: 27300000, treasury: 1016893, marketId: '2' },
    { tag: 'RUS', score: 3, rank: 'great_power', prestige: 389, gdp: 29700000, treasury: 862110, marketId: '3' },
    { tag: 'PRU', score: 4, rank: 'great_power', prestige: 177, gdp: 11000000, treasury: 329000, marketId: '4' },
    { tag: 'AUS', score: 5, rank: 'great_power', prestige: 148, gdp: 10400000, treasury: 267000, marketId: '5' },
    { tag: 'TUR', score: 6, rank: 'major_power', prestige: 143, gdp: 10400000, treasury: 190000, marketId: '6' },
    { tag: 'USA', score: 7, rank: 'major_power', prestige: 126, gdp: 14900000, treasury: 725000, marketId: '7' },
    { tag: 'SWE', score: 8, rank: 'major_power', prestige: 68, gdp: 2500000, treasury: 224000, marketId: '8' },
    { tag: 'NET', score: 9, rank: 'major_power', prestige: 68, gdp: 2200000, treasury: 512000, marketId: '9' },
    { tag: 'BRZ', score: 10, rank: 'minor_power', prestige: 62, gdp: 4000000, treasury: 318000, marketId: '10' },
  ],
}

export function fixtureMessage(): string {
  const message: PubSubSnapshotMessage = {
    type: 'vic3:snapshot',
    payload: fixtureSnapshot,
  }
  return JSON.stringify(message)
}
