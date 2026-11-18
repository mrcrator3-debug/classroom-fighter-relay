// Classroom Fighter relay: a tiny WebSocket relay with no dependencies. Run: node relay.js
// Deploy it on any host with Node 18+ in a region near your players (e.g. Sydney).
const http=require('http'),crypto=require('crypto');
const rooms=new Map(); // CODE -> {h: client|null, g: Set<client>}
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/plain'});r.end('classroom fighter relay ok')});
function send(sock,str,op){if(sock.destroyed)return;const p=Buffer.from(str||''),o=op||0x81;let h;
 if(p.length<126)h=Buffer.from([o,p.length]);else if(p.length<65536){h=Buffer.alloc(4);h[0]=o;h[1]=126;h.writeUInt16BE(p.length,2)}else{h=Buffer.alloc(10);h[0]=o;h[1]=127;h.writeBigUInt64BE(BigInt(p.length),2)}
 try{sock.write(Buffer.concat([h,p]))}catch(e){}}
function parse(c,cb){for(;;){const b=c.buf;if(b.length<2)return;const op=b[0]&15,mk=b[1]&128;let len=b[1]&127,off=2;
 if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);off=4}else if(len===127){if(b.length<10)return;len=Number(b.readBigUInt64BE(2));off=10}
 const key=mk?b.slice(off,off+4):null;if(mk)off+=4;if(b.length<off+len)return;
 const pl=Buffer.from(b.slice(off,off+len));if(key)for(let i=0;i<pl.length;i++)pl[i]^=key[i&3];c.buf=b.slice(off+len);
 if(op===1)cb(pl.toString());else if(op===8){c.sock.end();return}else if(op===9)send(c.sock,pl.toString(),0x8A)}}
srv.on('upgrade',(req,sock)=>{
 const u=new URL(req.url,'http://x'),m=u.pathname.match(/^\/room\/([A-Za-z0-9]{1,16})$/),key=req.headers['sec-websocket-key'];
 if(!m||!key){sock.destroy();return}
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
 sock.setNoDelay(true);sock.on('error',()=>{});
 const code=m[1].toUpperCase(),role=u.searchParams.get('r')==='h'?'h':'g',c={sock,buf:Buffer.alloc(0),dead:false};let room=rooms.get(code);
 if(role==='h'){if(room&&room.h){send(sock,'{"t":"taken"}');sock.end();return}if(!room){room={h:null,g:new Set()};rooms.set(code,room)}room.h=c}
 else{if(!room||!room.h){send(sock,'{"t":"nohost"}');sock.end();return}room.g.add(c)}
 sock.on('data',d=>{c.buf=Buffer.concat([c.buf,d]);if(c.buf.length>1e6){sock.destroy();return}
  parse(c,msg=>{if(role==='h'){for(const g of room.g)send(g.sock,msg)}else if(room.h)send(room.h.sock,msg)})});
 sock.on('close',()=>{if(c.dead)return;c.dead=true;if(role==='h'){if(room.h===c){room.h=null;for(const g of room.g)g.sock.destroy();room.g.clear()}}else room.g.delete(c);if(!room.h&&!room.g.size&&rooms.get(code)===room)rooms.delete(code)});
});
setInterval(()=>{for(const r of rooms.values()){if(r.h)send(r.h.sock,'',0x89);for(const g of r.g)send(g.sock,'',0x89)}},25000);
srv.listen(process.env.PORT||8787,()=>console.log('relay listening on',process.env.PORT||8787));
