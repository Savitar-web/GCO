import {useState} from 'react'
import type {Color,PieceStyle} from './chessEngine'
export const DEFAULT_PIECES:Record<Color,PieceStyle>={w:{design:'byron',color:'#f4f1e9',particleColor:'#49dcff',effect:'none'},b:{design:'byron',color:'#242424',particleColor:'#ff648c',effect:'none'}}
export function loadPieceStyles():Record<Color,PieceStyle>{try{return {...DEFAULT_PIECES,...JSON.parse(localStorage.getItem('gco:piece-styles')||'{}')}}catch{return DEFAULT_PIECES}}
export function usePieceStyles(){const [styles,setStyles]=useState(loadPieceStyles);return [styles,(next:Record<Color,PieceStyle>)=>{setStyles(next);localStorage.setItem('gco:piece-styles',JSON.stringify(next))}] as const}
