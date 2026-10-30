import {soundCard,soundColor,soundFail,soundSuccess,unlockAudio} from '@/core/audio/uiSounds'
export function gameSound(kind:'card'|'color'|'win'|'loss'='card') {
  if(localStorage.getItem('gco:game-sound')==='off')return
  unlockAudio()
  if(kind==='color')soundColor(3);else if(kind==='win')soundSuccess();else if(kind==='loss')soundFail();else soundCard()
}
