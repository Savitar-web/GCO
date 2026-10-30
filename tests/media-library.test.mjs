import 'fake-indexeddb/auto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importTrackFile, listTracks, getTrackBlob, createPlaylist, savePlaylist, listPlaylists, saveBook, getBook } from '../src/core/storage/mediaLibrary.ts'

globalThis.Audio = class {
  duration = 1.25
  set src(value) { if (value) queueMicrotask(() => this.onloadedmetadata?.()) }
  removeAttribute() {}
  load() {}
}
test('Concurrent imports preserve every audio blob and pre-existing playlists', async () => {
  const original = await importTrackFile(new File(['old-audio'], 'legacy.mp3', { type: 'audio/mpeg' }))
  const playlist = await createPlaylist('Lista existente')
  await savePlaylist({ ...playlist, trackIds: [original.id] })
  const imported = await Promise.all(Array.from({ length: 16 }, (_, index) => importTrackFile(new File([`audio-${index}`], `track-${index}.mp3`, { type: 'audio/mpeg' }))))
  assert.equal((await listTracks()).length, 17)
  assert.equal(new Set(imported.map(track => track.id)).size, 16)
  assert.equal(await (await getTrackBlob(original.blobKey)).text(), 'old-audio')
  for (const [index, track] of imported.entries()) {
    assert.equal(await (await getTrackBlob(track.blobKey)).text(), `audio-${index}`)
    assert.equal(track.durationMs, 1250)
  }
  assert.deepEqual((await listPlaylists())[0].trackIds, [original.id])
})
test('Metadata and audio save together; empty files do not create tracks', async () => {
  const track = await importTrackFile(new File(['music'], 'test.mp3'), { title: 'Mi título', artist: 'Mi artista', album: 'Mi álbum' })
  assert.equal(track.title, 'Mi título'); assert.equal(track.album, 'Mi álbum')
  const before = (await listTracks()).length
  await assert.rejects(importTrackFile(new File([], 'empty.mp3')))
  assert.equal((await listTracks()).length, before)
})
test('Reader updates preserve book author, cover, folder and creation date', async () => {
  const book = await saveBook({ title: 'Libro', text: 'Texto original', author: 'Autor', coverDataUrl: 'data:image/png;base64,test', folderId: 'existing-folder' })
  await saveBook({ id: book.id, title: book.title, text: book.text, position: 7, bookmarks: [{ id: 'mark', charIndex: 7, label: 'Nota', createdAt: new Date().toISOString() }] })
  const saved = await getBook(book.id)
  assert.equal(saved.author, book.author); assert.equal(saved.coverDataUrl, book.coverDataUrl); assert.equal(saved.folderId, book.folderId); assert.equal(saved.createdAt, book.createdAt)
  assert.equal(saved.position, 7); assert.equal(saved.bookmarks.length, 1)
})
