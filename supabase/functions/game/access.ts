export function privateChessAccess(user:{email?:string|null;email_confirmed_at?:string|null}){return user.email?.toLowerCase()==='savitarxeno@gmail.com'&&!!user.email_confirmed_at}
