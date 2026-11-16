import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('src/features/games/chess/chatMedia.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {validChatMessage,voiceMime}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const message={id:'verified-message',text:'Hola',seat:1,at:Date.now()};
test('Chat rejects invalid seats, empty text and attachments outside the current room',()=>{
 assert.ok(validChatMessage(message,'room',2));
 for(const invalid of [{...message,seat:2},{...message,seat:-1},{...message,text:' '},{...message,text:'x'.repeat(701)},{...message,at:NaN}])assert.ok(!validChatMessage(invalid,'room',2));
 const attachment={...message,text:'',media:{kind:'image',mime:'image/webp',path:'room/member/file.webp'}};
 assert.ok(validChatMessage(attachment,'room',2));
 for(const path of ['other/member/file.webp','room/../other/file.webp','room/member/../../file.webp','https://example.com/image.webp'])assert.ok(!validChatMessage({...attachment,media:{...attachment.media,path}},'room',2));
});
test('Voice encoding selects a supported format and handles missing recording support',()=>{
 const original=globalThis.MediaRecorder;
 try{delete globalThis.MediaRecorder;assert.equal(voiceMime(),'');globalThis.MediaRecorder={isTypeSupported:type=>type.includes('opus')};assert.equal(voiceMime(),'audio/webm;codecs=opus');globalThis.MediaRecorder={isTypeSupported:type=>type==='audio/mp4'};assert.equal(voiceMime(),'audio/mp4');globalThis.MediaRecorder={isTypeSupported:()=>false};assert.equal(voiceMime(),'')}finally{if(original)globalThis.MediaRecorder=original;else delete globalThis.MediaRecorder}
});
