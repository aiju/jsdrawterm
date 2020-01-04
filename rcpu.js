"use strict";

const ANAMELEN = 28;
const AERRLEN = 64;
const DOMLEN = 48;
const DESKEYLEN = 7;
const AESKEYLEN = 16;
const CHALLEN = 8;
const NETCHLEN = 16;
const CONFIGLEN = 16;
const SECRETLEN = 32;
const PASSWDLEN = 28;
const NONCELEN = 32;
const PAKKEYLEN = 32;
const PAKSLEN = (448+7)/8|0;
const PAKPLEN = 4 * PAKSLEN;
const PAKHASHLEN = 2 * PAKPLEN;
const PAKXLEN = PAKSLEN;
const PAKYLEN = PAKSLEN;

const AuthTreq = 1;
const AuthChal = 2;
const AuthPass = 3;
const AuthOK = 4;
const AuthErr = 5;
const AuthMod = 6;
const AuthOKvar = 9;
const AuthPAK = 19;
const AuthTs = 64;
const AuthTc = 65;
const AuthAs = 66;
const AuthAc = 67;
const AuthTp = 68;

const PAKPRIVSZ = 4 + PAKXLEN + PAKYLEN;
const AUTHKEYSZ = DESKEYLEN + AESKEYLEN + PAKKEYLEN + PAKHASHLEN;

const TICKETLEN = 12 + CHALLEN + 2 * ANAMELEN + NONCELEN + 16;
const AUTHENTLEN = 12 + CHALLEN + NONCELEN + 16;

var C;

function Socket(ws) {
	this.ws = ws;
	this.error = null;
	this.queue = [];
	this.readers = [];
	let s = this;
	this.ws.onmessage = function(event) {
		s.queue.push(new Uint8Array(event.data));
		while(s.readers.length != 0 && s.readers[0]())
			s.readers.shift();
	};
	this.ws.onerror = function(err) {
		s.error = new Error(err);
		while(s.readers.length != 0)
			s.readers.shift()();
	};
}
Socket.prototype.read = function(test) {
	let s = this;
	let buf = new Uint8Array();
	function tryread(resolve, reject){
		if(s.error){
			reject(s.error);
			return true;
		}else{
			while(s.queue.length != 0){
				var nbuf = new Uint8Array(buf.length + s.queue[0].length);
				nbuf.set(buf);
				nbuf.set(s.queue[0], buf.length);
				for(var i = buf.length + 1; i <= nbuf.length; i++)
					if(test(nbuf.subarray(0, i))){
						if(i < nbuf.length)
							s.queue[0] = s.queue[0].subarray(i - buf.length);
						else
							s.queue.shift();
						resolve(nbuf.subarray(0, i));
						return true;
					}
				buf = nbuf;
				s.queue.shift();
			}
			return false;
		}
	}
	return new Promise((resolve, reject) => {
		if(!tryread(resolve, reject))
			s.readers.push(() => tryread(resolve, reject));
	});
};
Socket.prototype.readn = function(n) {
	if(n <= 0) return Promise.resolve(new Uint8Array());
	return this.read(b => b.length == n);
};
Socket.prototype.write = function(buf) {
	this.ws.send(buf);
	return Promise.resolve(buf.length);
}
function dial(str) {
	return new Promise((resolve, reject) => {
		var ws = new WebSocket(str);
		ws.binaryType = 'arraybuffer';
		ws.onopen = () => resolve(new Socket(ws));
		ws.onerror = reject;
	});
}

function from_cstr(b) {
	var n = b.indexOf(0);
	if(n >= 0)
		b = b.subarray(b, n);
	return new TextDecoder("utf-8").decode(b);
}
function to_cstr(b,n) {
	var b = new TextEncoder("utf-8").encode(b);
	if(b.length >= n) return b.subarray(0, n);
	var c = new Uint8Array(n);
	c.set(b);
	return c;
}
function readstr(chan) {
	return chan.read(b => b[b.length - 1] == 0).then(from_cstr);
}
function structRead(stream, fmt){
	var p = Promise.resolve();
	let get = t => stream.read(t);
	let out = {};
	for(var i = 0; i < fmt.length; i += 2){
		let n = fmt[i];
		let fn = fmt[i+1];
		p = p.then(() => fn.read(get).then(s => out[n] = s));
	}
	return p.then(() => out);
}
function structWrite(stream, fmt, obj){
	var p = Promise.resolve();
	let put = v => stream.write(v);
	for(var i = 0; i < fmt.length; i += 2){
		let v = obj[fmt[i]];
		let fn = fmt[i+1];
		p = p.then(() => fn.write(put, v));
	}
	return p;
}
function BufStream(buf) {
	var p = 0;
	return {read: test => new Promise((resolve, reject) => {
			for(var n = 1; p + n <= buf.length; n++){
				let a = buf.subarray(p, p + n);
				if(test(a)){
					p += n;
					return resolve(a.slice());
				}
			}
			reject(new Error('EOF in BufStream'));
		}),
		write: v => {
			buf.subarray(p, p + v.length).set(v);
			p += v.length;
		}};
}
function Uint8(n) {
	if(n === undefined){
		return {
			read: get => get(buf => buf.length == 1).then(x => x[0]),
			write: (put, val) => put(new Uint8Array([val]))
		};
	}
	return {
		read: get => get(buf => buf.length == n),
		write: (put, val) => put(val)
	};
}
function FixedString(n) {
	return {
		read: get => get(buf => buf.length == n).then(from_cstr),
		write: (put, val) => put(to_cstr(val, n))
	};
}
const Ticketreq = [
	'type', Uint8(),
	'authid', FixedString(ANAMELEN),
	'authdom', FixedString(DOMLEN),
	'chal', Uint8(CHALLEN),
	'hostid', FixedString(ANAMELEN),
	'uid', FixedString(ANAMELEN),
	'paky', Uint8(PAKYLEN)
];
const Ticket = [
	'num', Uint8(),
	'chal', Uint8(CHALLEN),
	'cuid', FixedString(ANAMELEN),
	'suid', FixedString(ANAMELEN),
	'key', Uint8(NONCELEN)
];
const Authenticator = [
	'num', Uint8(),
	'chal', Uint8(CHALLEN),
	'rand', Uint8(NONCELEN)
];

function tsmemcmp(a, b, n)
{
	var diff;
	
	diff = 0;
	for(var i = 0; i < n; i++)
		diff |= a[i] != b[i];
	return diff;
}

function asrdresp(chan, len)
{
	return chan.readn(1).then(c => {
		switch(c[0]){
		case AuthOK:
			return chan.readn(len);
		case AuthErr:
			return chan.readn(64).then(e => {throw new Error("remote: " + from_cstr(e))});
		case AuthOKvar:
			return chan.readn(5).then(b => {
				var n = from_cstr(b)|0;
				if(n <= 0 || n > len)
					throw new Error("AS protocol botch");
				return chan.readn(n)
			});
		default:
			throw new Error("AS protocol botch");
		}
	});
}

function convM2T(b, key)
{
	var buf = C.mallocz(TICKETLEN, 1);
	var buf_array = Module.HEAPU8.subarray(buf, buf+TICKETLEN);
	buf_array.set(b);
	return Promise.resolve().then(() => {
		if(C.form1M2B(buf, TICKETLEN, key) < 0)
			throw new Error("?password mismatch with auth server");
		return structRead(BufStream(buf_array), Ticket)
		.finally(() => C.free(buf));
	});
}

function convA2M(s, key)
{
	var buf = C.mallocz(AUTHENTLEN, 1);
	var buf_array = Module.HEAPU8.subarray(buf, buf+AUTHENTLEN);
	return structWrite(BufStream(buf_array), Authenticator, s)
	.then(() => {
		C.form1B2M(buf, 1 + CHALLEN + NONCELEN, key);
		return buf_array.slice();
	}).finally(() => C.free(buf));
}

function convM2A(b, key)
{
	var buf = C.mallocz(AUTHENTLEN, 1);
	var buf_array = Module.HEAPU8.subarray(buf, buf+AUTHENTLEN);
	buf_array.set(b);
	return Promise.resolve().then(() => {
		if(C.form1M2B(buf, AUTHENTLEN, key) < 0)
			throw new Error("?you and auth server agree about password. ?server is confused.");
		return structRead(BufStream(buf_array), Authenticator)
		.finally(() => C.free(buf));
	});
}

function getastickets(authkey, tr)
{
	var ybuf = C.mallocz(PAKYLEN, 1);
	var ybuf_array = Module.HEAPU8.subarray(ybuf, ybuf+PAKYLEN);
	var priv = C.mallocz(PAKPRIVSZ, 1);
	
	return dial("ws://localhost:1235").then(chan => {
		tr.type = AuthPAK;
		return structWrite(chan, Ticketreq, tr)
		.then(() => {
			C.authpak_new(priv, authkey, ybuf, 1);
			return chan.write(ybuf_array);
		}).then(() => asrdresp(chan, 2*PAKYLEN)
		).then(buf => {
			tr.paky.set(buf.subarray(0, PAKYLEN));
			ybuf_array.set(buf.subarray(PAKYLEN));
			if(C.authpak_finish(priv, authkey, ybuf))
				throw new Error("getastickets failure");
			tr.type = AuthTreq;
			return structWrite(chan, Ticketreq, tr);
		}).then(() => asrdresp(chan, 0)
		).then(() => chan.readn(2*TICKETLEN)
		);
	}).finally(() => {
		C.free(priv);
		C.free(ybuf);
	});
}

function dp9ik(chan, dom) {
	var crand, cchal;
	var tr;
	var authkey;
	var sticket, cticket;
		
	authkey = C.mallocz(AUTHKEYSZ, 1);
	crand = new Uint8Array(2*NONCELEN);
	cchal = new Uint8Array(CHALLEN);
	window.crypto.getRandomValues(crand);
	window.crypto.getRandomValues(cchal);
	
	return chan.write(cchal)
	.then(() => structRead(chan, Ticketreq))
	.then(tr0 => {
		tr = tr0;
		tr.hostid = 'glenda';
		tr.uid = 'glenda';
		C.passtokey(authkey, password);
		C.authpak_hash(authkey, tr.uid);
		return getastickets(authkey, tr);
	}).then(tbuf => {
		sticket = tbuf.subarray(TICKETLEN);
		let k = Module.HEAPU8.subarray(authkey + AESKEYLEN + DESKEYLEN, authkey + AESKEYLEN + DESKEYLEN + PAKKEYLEN);
		return convM2T(tbuf.subarray(0, TICKETLEN), k);
	}).then(tick => {
		cticket = tick;
		return chan.write(tr.paky);
	}).then(() => chan.write(sticket))
	.then(() => {
		let auth = {num: AuthAc, rand: crand.subarray(0, NONCELEN), chal: tr.chal};
		return convA2M(auth, cticket.key);
	}).then(m => chan.write(m))
	.then(() => chan.readn(AUTHENTLEN))
	.then(b => convM2A(b, cticket.key))
	.then(auth => {
		if(auth.num != AuthAs || tsmemcmp(auth.chal, cchal, CHALLEN) != 0)
			throw new Error("protocol botch");
		crand.subarray(NONCELEN).set(auth.rand);
		var secret = C.mallocz(256, 1);
		C.hkdf_x_plan9(crand, cticket.key, secret);
		var ai = {
			suid: cticket.suid,
			cuid: cticket.cuid,
			secret: Module.HEAPU8.slice(secret, secret + 256)
		};
		C.free(secret);
		return ai;
	})
	.finally(() => {
		if(cticket){
			cticket.key.fill(0);
			cticket.chal.fill(0);
		}
		if(sticket)
			sticket.fill(0);
		C.memset(authkey, 0, AUTHKEYSZ);
		crand.fill(0);
		cchal.fill(0);
		C.free(authkey);
	});
}

function p9any(chan) {
	var v2, dom;
	
	readstr(chan).then(str => {
		v2 = str.startsWith("v2 ");
		if(v2)
			str = str.substr(4);
		var doms = str
			.split(' ')
			.filter(s => s.startsWith('dp9ik@'))
			.map(s => s.substr(6));
		if(doms.length === 0)
			throw new Error("server did not offer dp9ik");
		dom = doms[0];
		return chan.write(new TextEncoder("utf-8").encode('dp9ik ' + dom + '\0'));
	}).then(() => {
		if(v2)
			return readstr(chan).then(s => {
				if(s != 'OK')
					throw new Error('did not get OK in p9any: got ' + s);
			});
	}).then(() => dp9ik(chan, dom))
	.then(console.log);
}

Module['onRuntimeInitialized'] = () => {
	C = {
		mallocz: Module.cwrap('mallocz', 'number', ['number', 'number']),
		free: Module.cwrap('free', null, ['number']),
		passtokey: Module.cwrap('passtokey', null, ['number', 'string']),
		authpak_hash: Module.cwrap('authpak_hash', null, ['number', 'string']),
		authpak_new: Module.cwrap('authpak_new', null, ['number', 'number', 'number', 'number']),
		authpak_finish: Module.cwrap('authpak_finish', 'number', ['number', 'number', 'number']),
		form1M2B: Module.cwrap('form1M2B', 'number', ['number', 'number', 'array']),
		form1B2M: Module.cwrap('form1B2M', 'number', ['number', 'number', 'array']),
		hkdf_x_plan9: Module.cwrap('hkdf_x_plan9', null, ['array', 'array', 'number']),
		memset: Module.cwrap('memset', null, ['number', 'number', 'number'])
	};
	dial("ws://localhost:1234")
	.then(chan => p9any(chan));
};
