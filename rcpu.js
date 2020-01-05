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

function Packet(data) {
	this.data = new Uint8Array(data);
	this.readers = [];
}
Packet.prototype.nbread = function(check) {
	var n = check(this.data);
	if(typeof n !== 'number') throw new Error("NOPE");
	if(n < 0 || n > this.data.length)
		return null;
	var r = this.data.subarray(0,n);
	this.data = this.data.subarray(n);
	return r;
}
Packet.prototype.readerr = function(check) {
	var b = this.nbread(check);
	if(b === null) throw new Error("EOF");
	return b;
}
Packet.prototype.read = function(check) {
	var tryread = resolve => () => {
		let b = this.nbread(check);
		if(b === null)
			return false;
		resolve(b);
		return true;
	};
	return new Promise((resolve, reject) => {
		if(!tryread(resolve)())
			this.readers.push(tryread(resolve));
	});
}
Packet.prototype.write = function(b) {
	var n = new Uint8Array(this.data.length + b.length);
	n.set(this.data, 0);
	n.set(b, this.data.length);
	this.data = n;
	while(this.readers.length > 0 && this.readers[0]())
		this.readers.shift();
}

function Socket(ws) {
	this.ws = ws;
	this.packet = new Packet();
	this.ws.onmessage = event => {
		this.packet.write(new Uint8Array(event.data));
	};
}
Socket.prototype.read = function(check) {
	return this.packet.read(check);
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
	function strcheck(b) {
		let n = b.indexOf(0);
		if(n < 0) return -1;
		return n + 1;
	}
	return chan.read(strcheck).then(from_cstr);
}
function Struct(fmt){
	return {
		read: stream => {
			var p = Promise.resolve();
			let out = {};
			for(var i = 0; i < fmt.length; i += 2){
				let n = fmt[i];
				let fn = fmt[i+1];
				p = p.then(() => fn.read(stream).then(s => out[n] = s));
			}
			return p.then(() => out);
		},
		write: (stream, obj) => {
			var p = Promise.resolve();
			let put = v => stream.write(v);
			for(var i = 0; i < fmt.length; i += 2){
				let v = obj[fmt[i]];
				let fn = fmt[i+1];
				p = p.then(() => fn.write(stream, v));
			}
			return p;
		}
	};
}
function Uint8(n) {
	if(n === undefined){
		return {
			read: stream => stream.read(b=>1).then(x => x[0]),
			write: (stream, val) => stream.write(new Uint8Array([val]))
		};
	}
	return {
		read: stream => stream.read(b=>n),
		write: (stream, val) => stream.write(val)
	};
}
function FixedString(n) {
	return {
		read: stream => stream.read(b=>n).then(from_cstr),
		write: (stream, val) => stream.write(to_cstr(val, n))
	};
}
const Ticketreq = Struct([
	'type', Uint8(),
	'authid', FixedString(ANAMELEN),
	'authdom', FixedString(DOMLEN),
	'chal', Uint8(CHALLEN),
	'hostid', FixedString(ANAMELEN),
	'uid', FixedString(ANAMELEN),
	'paky', Uint8(PAKYLEN)
]);
const Ticket = Struct([
	'num', Uint8(),
	'chal', Uint8(CHALLEN),
	'cuid', FixedString(ANAMELEN),
	'suid', FixedString(ANAMELEN),
	'key', Uint8(NONCELEN)
]);
const Authenticator = Struct([
	'num', Uint8(),
	'chal', Uint8(CHALLEN),
	'rand', Uint8(NONCELEN)
]);

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
	return chan.read(b=>1).then(c => {
		switch(c[0]){
		case AuthOK:
			return chan.read(b=>len);
		case AuthErr:
			return chan.read(b=>64).then(e => {throw new Error("remote: " + from_cstr(e))});
		case AuthOKvar:
			return chan.read(b=>5).then(b => {
				var n = from_cstr(b)|0;
				if(n <= 0 || n > len)
					throw new Error("AS protocol botch");
				return chan.read(b=>n)
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
		return Ticket.read(new Packet(buf_array))
		.finally(() => C.free(buf));
	});
}

function convA2M(s, key)
{
	var buf = C.mallocz(AUTHENTLEN, 1);
	var buf_array = Module.HEAPU8.subarray(buf, buf+AUTHENTLEN);
	var p = new Packet();
	return Authenticator.write(p, s)
	.then(() => {
		buf_array.set(p.data);
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
		return Authenticator.read(new Packet(buf_array))
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
		return Ticketreq.write(chan, tr)
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
			return Ticketreq.write(chan, tr);
		}).then(() => asrdresp(chan, 0)
		).then(() => chan.read(b=>2*TICKETLEN)
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
	.then(() => Ticketreq.read(chan))
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
	.then(() => chan.read(b=>AUTHENTLEN))
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
	
	return readstr(chan).then(str => {
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
	}).then(() => dp9ik(chan, dom));
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
	.then(chan => p9any(chan)
		.then(ai => tlsClient(chan, ai)));
};
