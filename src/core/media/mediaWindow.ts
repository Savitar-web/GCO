import {Capacitor,registerPlugin} from '@capacitor/core'
export const MediaWindow=registerPlugin<{enterPip(options:{width:number;height:number}):Promise<{entered:boolean}>;setAutoPip(options:{enabled:boolean}):Promise<void>;openOverlaySettings():Promise<void>;overlayStatus():Promise<{granted:boolean}>}>('MediaWindow')
export function nativeMediaWindow(){return Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('MediaWindow')}
