import {BYRON_SPRITES} from './byronSprites'

// Hold decoded images for the session so opening a board or its preview does not
// need an image request or first-use decoding.
const decoded:HTMLImageElement[]=[]
let ready:Promise<void>|undefined
export function preloadChessPieces():Promise<void>{
  ready??=Promise.all(Object.values(BYRON_SPRITES).map(src=>{
    const image=new Image()
    decoded.push(image)
    image.src=src
    return typeof image.decode==='function'?image.decode().catch(()=>undefined):Promise.resolve()
  })).then(()=>undefined)
  return ready
}
