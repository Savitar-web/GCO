import assert from 'node:assert/strict'
import test from 'node:test'
import { accountSnapshot, combineAccountSnapshots, snapshotSignatures } from '../src/core/cloud/accountSnapshot.ts'

const profile = 'gco:profile'
const progress = 'gco:progress'
const encode = (attempts, history) => JSON.stringify({ 'logica:test': { totalAttempts: attempts, history } })

test('Account snapshot includes game and profile data but excludes local media and auth', () => {
  const records = { [profile]: '{"name":"Ana"}', 'gco:despejes-progress:ice': '{"level":8}', 'gco:music-favorites': '[]', 'gco:nutricion:sort': 'titulo', 'sb-token': 'secret' }
  const storage = { length: Object.keys(records).length, key: index => Object.keys(records)[index], getItem: key => records[key] }
  assert.deepEqual(Object.keys(accountSnapshot(storage)).sort(), ['gco:despejes-progress:ice', profile])
})

test('Simultaneous progress on two devices merges attempts and history', () => {
  const base = { [progress]: encode(4, []) }
  const local = { [progress]: encode(5, [{ at: '2026-11-09T12:00:00Z', level: 3 }]) }
  const remote = { [progress]: encode(6, [{ at: '2026-11-09T11:00:00Z', level: 2 }]) }
  const merged = JSON.parse(combineAccountSnapshots(local, remote, base)[progress])['logica:test']
  assert.equal(merged.totalAttempts, 7)
  assert.deepEqual(merged.history.map(entry => entry.level), [3, 2])
})

test('A reconnect restores remote changes and uploads local profile edits made offline', () => {
  const base = { [profile]: '{"name":"Ana"}' }
  const remote = { [profile]: '{"name":"Ana María"}' }
  const signatures = snapshotSignatures(base)
  assert.deepEqual(combineAccountSnapshots(base, remote, null, signatures), remote)
  const edited = { [profile]: '{"name":"Ana","avatarFrame":"neon"}' }
  assert.deepEqual(combineAccountSnapshots(edited, remote, null, signatures), edited)
})
