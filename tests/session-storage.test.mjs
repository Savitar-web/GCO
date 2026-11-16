import test from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
globalThis.indexedDB = indexedDB
const values = new Map()
globalThis.localStorage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
const {sessionStorage} = await import('../src/core/cloud/sessionStorage.ts')
test('A session survives preference loss and explicit logout removes both copies',async()=>{
 await sessionStorage.setItem('sdk-session','{"refresh_token":"test"}')
 values.clear()
 assert.equal(await sessionStorage.getItem('sdk-session'),'{"refresh_token":"test"}')
 await sessionStorage.removeItem('sdk-session')
 assert.equal(await sessionStorage.getItem('sdk-session'),null)
})
