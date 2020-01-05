"use strict";

function VBuffer(data) {
	if(data === undefined){
		this.a = new Uint8Array(256);
		this.p = 5;
	}else{
		this.a = data;
		this.p = data.length;
	}
	this.rp = 0;
}
VBuffer.prototype.embiggen = function() {
	let n = new Uint8Array(2*this.a.length);
	n.subarray(0, this.a.length).set(this.a);
	this.a = n;
};
VBuffer.prototype.put = function(b) {
	while(this.p + b.length > this.a.length)
		this.embiggen();
	this.a.set(b, this.p);
	this.p += b.length;
};
VBuffer.prototype.get = function(n) {
	if(this.rp + n > this.p)
		throw new Error("EOF");
	let r = this.a.subarray(this.rp, this.rp + n);
	this.rp += n;
	return r;
};
function Bytes(n) {
	return {
		put: (b,c) => b.put(c),
		get: b => b.get(n)
	};
};
const U8 = {
	put: (b,c) => b.put([c]),
	get: b => b.get(1)[0]
};
const U16 = {
	put: (b,c) => b.put([c>>8,c]),
	get: b => { let x = b.get(2); return x[0] << 8 | x[1]; }
};
const U24 = {
	put: (b,c) => b.put([c>>16,c>>8,c]),
	get: b => { let x = b.get(3); return x[0] << 16 | x[1] << 8 | x[2]; }
};
const U32 = {
	put: (b,c) => b.put([c>>24,c>>16,c>>8,c]),
	get: b => { let x = b.get(4); return x[0] << 24 | x[1] << 16 | x[2] << 8 | x[3]; }
};
function Struct(s) {
	return {
		put: (b,o) => {
			for(var i = 0; i < s.length; i += 2){
				let n = s[i];
				let fn = s[i+1];
				if(n === null)
					fn.put(b, o, o);
				else
					fn.put(b, o[n], o);
			}
		},
		get: b => {
			let o = {};
			for(var i = 0; i < s.length; i += 2){
				let n = s[i];
				let fn = s[i+1];
				if(n == null)
					Object.assign(o, fn.get(b, o));
				else
					o[n] = fn.get(b, o);
			}
			return o;
		}
	};
}
function Length(count,data) {
	return {
		put: (b,l,o) => {
			let p0 = b.p;
			count.put(b, 0);
			let p1 = b.p;
			data.put(b, l, o);
			let p2 = b.p;
			b.p = p0;
			count.put(b, p2 - p1, o);
			b.p = p2;
		},
		get: (b,o) => {
			let c = count.get(b, o);
			let e = b.rp + c;
			let op = b.p;
			b.p = e;
			let l = data.get(b, o);
			b.p = op;
			return l;
		}
	};
}
function Vector(count,data) {
	return {
		put: (b,l,o) => {
			let p0 = b.p;
			count.put(b, 0);
			let p1 = b.p;
			for(var i = 0; i < l.length; i++)
				data.put(b, l[i], o);
			let p2 = b.p;
			b.p = p0;
			count.put(b, p2 - p1, o);
			b.p = p2;
		},
		get: (b,o) => {
			let l = [];
			let c = count.get(b, o);
			let e = b.rp + c;
			let op = b.p;
			b.p = e;
			while(b.rp < e)
				l.push(data.get(b, o));
			b.p = op;
			return l;
		}
	};
}
function OpaqueVector(count) {
	return {
		put: (b,l) => {
			count.put(b, l.length);
			b.put(l);
		},
		get: b => {
			let l = count.get(b);
			return b.get(l);
		}
	}
}
function Optional(data) {
	return {
		put: (b,c) => {if(c !== null) data.put(b, c);},
		get: b => {if(b.p === b.rp) return null; return data.get(b);}
	};
}
function Select(fn, data) {
	return {
		put: (b,c,o) => {
			let n = fn(o);
			if(!(n in data)) throw new Error("Select: not found: " + n);
			data[n].put(b,c,o);
		},
		get: (b,o) => {
			let n = fn(o);
			if(!(n in data)) throw new Error("Select: not found: " + n);
			return data[n].get(b,o);
		}
	};
}
const FHandshake = 22;
const Fragment = Struct([
	'type', U8,
	'version', U16,
	'fragment', OpaqueVector(U16)
]);
const HClientHello = 1;
const ClientHello = Struct([
	'client_version', U16,
	'gmx_unix_time', U32,
	'random', Bytes(28),
	'session_id', Vector(U8, U8),
	'cipher_suites', Vector(U16, U16),
	'compression_methods', Vector(U8, U8),
	'extensions', Vector(U16, Struct([
		'type', U16,
		'data', Vector(U8, U16)
	]))
]);
const HServerHello = 2;
const ServerHello = Struct([
	'server_version', U16,
	'gmx_unix_time', U32,
	'random', Bytes(28),
	'session_id', Vector(U8, U8),
	'cipher_suite', U16,
	'compression_method', U8,
	'extensions', Optional(Vector(U16, Struct([
		'type', U16,
		'data', Vector(U8, U16)
	])))
]);
const Handshake = Struct([
	'msg_type', U8,
	null, Length(U24, Select(o => o.msg_type, {
		1: ClientHello,
		2: ServerHello
	}))
]);

function tlsClient(chan, authinfo) {
	const MAXFRAG = 16384;
	var handshake = new Packet();

	function recvFragment() {
		function recLen(b) {
			if(b.length < 5) return -1;
			return 5 + (b[3] << 16 | b[4]);
		}
		return chan.read(recLen)
			.then(b => {
				let r = Fragment.get(new VBuffer(b));
				if(r.version != 0x0303) throw new Error("TLS botch");
				switch(r.type){
				case FHandshake: handshake.write(r.fragment); break;
				default: throw new Error("TLS unknown protocol " + r.type.toString());
				}
			}).then(recvFragment);
	}
	function recvHandshake() {
		function handLen(b) {
			if(b.length < 4) return -1;
			return b[1] << 16 | b[2] << 8 | b[3];
		}
		return handshake.read(handLen)
			.then(b => {
				let r = Handshake.get(new VBuffer(b));
				console.log(r);
			});
	}
	function sendData(b, type) {
		let p = Promise.resolve();
		for(var n = 5; n < b.p; n += MAXFRAG){
			let i = n;
			let e = n+MAXFRAG > b.p ? b.p : n+MAXFRAG;
			p = p.then(() => {
				b.a[i - 5] = type;
				b.a[i - 4] = 3;
				b.a[i - 3] = 3;
				b.a[i - 2] = e - i >> 8;
				b.a[i - 1] = e - i;
				return chan.write(b.a.subarray(i - 5, e));
			});
		}
		return p;
	}
	function sendHandshake(data) {
		let b = new VBuffer();
		Handshake.put(b, data);
		return sendData(b, FHandshake);
	}
	function sendClientHello() {
		return sendHandshake({
			msg_type: HClientHello,
			client_version: 0x0303,
			gmx_unix_time: Date.now() / 1000 | 0,
			random: new Uint8Array(28),
			session_id: [],
			cipher_suites: [0xccab],
			compression_methods: [0],
			extensions: []
		});
	}

	recvFragment();
	return sendClientHello()
		.then(recvHandshake);
}
