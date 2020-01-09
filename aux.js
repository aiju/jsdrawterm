"use strict";

var C;

var mallocs = {};
function record_malloc(v, n, stack){
	mallocs[v] = {n: n, stack: stack.split('\n').splice(1)};
}
function record_free(v){
	delete mallocs[v];
}
function malloc_info(topdown){
	function subdiv(x){
		var t = {me: [], sub: 0};
		for(var a in x){
			let m = x[a];
			t.sub += m.n;
			if(m.stack.length == 0)
				t.me.push(m.n);
			else{
				let h = m.stack[topdown ? m.stack.length - 1 : 0];
				if(!(h in t)) t[h] = {};
				t[h][a] = {n: m.n, stack: topdown ? m.stack.slice(0, m.stack.length - 1) : m.stack.slice(1)};
			}
		}
		for(var a in t){
			if(a != 'me' && a != 'sub')
				t[a] = subdiv(t[a]);
		}
		return t;
	}
	return subdiv(mallocs);
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
		memset: Module.cwrap('memset', null, ['number', 'number', 'number']),
		memmove: Module.cwrap('memmove', null, ['number', 'number', 'number']),
		p_sha256: Module.cwrap('p_sha256', null, ['number', 'number', 'number', 'number', 'string', 'number', 'number', 'number']),
		chacha_setiv: Module.cwrap('chacha_setiv', null, ['number', 'array']),
		ccpoly_encrypt: Module.cwrap('ccpoly_encrypt', null, ['number', 'number', 'array', 'number', 'number', 'number']),
		ccpoly_decrypt: Module.cwrap('ccpoly_encrypt', 'number', ['number', 'number', 'array', 'number', 'number', 'number']),
		setupChachastate: Module.cwrap('setupChachastate', null, ['number', 'number', 'number', 'number', 'number', 'number']),
		sha2_256: Module.cwrap('sha2_256', 'number', ['array', 'number', 'number', 'number']),
		memimageinit: Module.cwrap('memimageinit', null, []),
		memlalloc: Module.cwrap('memlalloc', 'number', ['number', 'number', 'number', 'number', 'number']),
		allocmemimage: Module.cwrap('allocmemimage', 'number', ['number', 'number']),
		memfillcolor: Module.cwrap('memfillcolor', null, ['number', 'number']),
		memload: Module.cwrap('memload', 'number', ['number', 'number', 'number', 'number', 'number']),
		memunload: Module.cwrap('memunload', 'number', ['number', 'number', 'number', 'number']),
		memdraw: Module.cwrap('memdraw', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number']),
		byteaddr: Module.cwrap('byteaddr', null, ['number', 'number']),
		memlalloc: Module.cwrap('memlalloc', null, ['number', 'number', 'number', 'number', 'number']),
		rerrstr: Module.cwrap('rerrstr', null, ['number', 'number']),
		memimageflags: Module.cwrap('memimageflags', 'number', ['number', 'number', 'number']),
		memldelete: Module.cwrap('memldelete', null, ['number']),
		freememimage: Module.cwrap('freememimage', null, ['number']),
		memlorigin: Module.cwrap('memlorigin', null, ['number', 'number', 'number']),
		memellipse: Module.cwrap('memellipse', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
		memarc: Module.cwrap('memellipse', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
		memline: Module.cwrap('memline', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
		mempoly: Module.cwrap('mempoly', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']),
		memfillpoly: Module.cwrap('memfillpoly', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number']),
		memltofrontn: Module.cwrap('memltofrontn', null, ['number', 'number']),
		memltorearn: Module.cwrap('memltofrontn', null, ['number', 'number']),
		record_malloc: record_malloc,
		record_free: record_free,
	};
	main();
};

function withBuf(n, f) {
	var t = C.mallocz(n, 1);
	var t_array = Module.HEAPU8.subarray(t, t + n);
	try{
		var r = f(t, t_array);
		return r;
	}finally{
		C.memset(t, 0, n);
		C.free(t);
	}
}
function withBufP(n, f){
	var t = C.mallocz(n, 1);
	var t_array = Module.HEAPU8.subarray(t, t + n);
	return Promise.resolve(f(t, t_array)).finally(() => {
		C.memset(t, 0, n);
		C.free(t);
	});
}
function errstr() {
	return withBuf(256, buf => {
		C.rerrstr(buf, 256);
		return UTF8ToString(buf, 256);
	});
}

function Packet(data) {
	this.data = new Uint8Array(data);
	this.closed = false;
	this.readers = [];
}
Packet.prototype.nbread = function(check) {
	if(this.closed) return undefined;
	var n = check(this.data);
	if(typeof n !== 'number') throw new Error("NOPE");
	if(n < 0 || n > this.data.length)
		return null;
	var r = this.data.subarray(0,n);
	this.data = this.data.subarray(n);
	return r;
}
Packet.prototype.readerr = function(check) {
	if(this.closed) throw new Error("closed");
	var b = this.nbread(check);
	if(b === null) throw new Error("EOF");
	return b;
}
Packet.prototype.read = function(check) {
	if(this.closed) return undefined;
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
	if(this.closed) throw new Error("closed");
	var n = new Uint8Array(this.data.length + b.length);
	n.set(this.data, 0);
	n.set(b, this.data.length);
	this.data = n;
	while(this.readers.length > 0 && this.readers[0]())
		this.readers.shift();
}
Packet.prototype.close = function() {
	this.closed = true;
	while(this.readers > 0)
		this.readers.shift()();
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
Socket.prototype.close = function(buf) {
	this.ws.close();
	this.packet.close();
}
function dial(str) {
	return new Promise((resolve, reject) => {
		var ws = new WebSocket(str);
		ws.binaryType = 'arraybuffer';
		ws.onopen = () => resolve(new Socket(ws));
		ws.onerror = reject;
	});
}
function readstr(chan) {
	function strcheck(b) {
		let n = b.indexOf(0);
		if(n < 0) return -1;
		return n + 1;
	}
	return chan.read(strcheck).then(from_cstr);
}
function VBuffer(data) {
	if(data === undefined){
		this.a = new Uint8Array(256);
		this.p = 0;
	}else{
		this.a = data;
		this.p = data.length;
	}
	this.rp = 0;
}
VBuffer.prototype.data = function() {
	return this.a.subarray(0, this.p);
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
function pack(type, data) {
	let b = new VBuffer();
	type.put(b, data);
	return b;
}
function unpack(type, data) {
	return type.get(new VBuffer(data));
}
function Bytes(n) {
	return {
		put: (b,c) => {
			if(c.length !== n)
				throw new Error("length error");
			b.put(c);
		},
		get: b => b.get(n),
		len: n
	};
};
const u8 = {
	put: (b,c) => b.put([c]),
	get: b => b.get(1)[0],
	len: 1
};
const u16 = {
	put: (b,c) => b.put([c,c>>8]),
	get: b => { let x = b.get(2); return x[1] << 8 | x[0]; },
	len: 2
};
const u24 = {
	put: (b,c) => b.put([c,c>>8,c>>16]),
	get: b => { let x = b.get(3); return x[2] << 16 | x[1] << 8 | x[0]; },
	len: 3
};
const u32 = {
	put: (b,c) => b.put([c,c>>8,c>>16,c>>24]),
	get: b => { let x = b.get(4); return x[3] << 24 | x[2] << 16 | x[1] << 8 | x[0]; },
	len: 4
};
const u64 = {
	put: (b,c) => {
		let a = new Uint8Array(8);
		for(var i = 0; i < 8; i++)
			a[i] = c / 2**(8*i);
		b.put(a);
	},
	get: b => { let x = b.get(8); return x[3] << 24 | x[2] << 16 | x[1] << 8 | x[0]; },
	len: 8
	/*TODO*/
};
const U8 = u8;
const U16 = {
	put: (b,c) => b.put([c>>8,c]),
	get: b => { let x = b.get(2); return x[0] << 8 | x[1]; },
	len: 2
};
const U24 = {
	put: (b,c) => b.put([c>>16,c>>8,c]),
	get: b => { let x = b.get(3); return x[0] << 16 | x[1] << 8 | x[2]; },
	len: 3
};
const U32 = {
	put: (b,c) => b.put([c>>24,c>>16,c>>8,c]),
	get: b => { let x = b.get(4); return x[0] << 24 | x[1] << 16 | x[2] << 8 | x[3]; },
	len: 4
};
const U64 = {
	put: (b,c) => {
		let a = new Uint8Array(8);
		for(var i = 0; i < 8; i++)
			a[7-i] = c / 2**(8*i);
		b.put(a);
	},
	len: 8
};
function Struct(s) {
	return {
		put: (b,o) => {
			for(var i = 0; i < s.length; i += 2){
				let n = s[i];
				let fn = s[i+1];
				if(n === null)
					fn.put(b, o, o);
				else{
					if(!(n in o))
						throw new Error('field ' + n + ' not found');
					fn.put(b, o[n], o);
				}
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
		},
		len: (()=>{
			let n = 0;
			for(let i = 0; i < s.length; i += 2)
				n += s[i+1].len;
			return n;
		})()
	};
}
function Length(count,data,offset) {
	if(offset === undefined) offset = 0;
	return {
		put: (b,l,o) => {
			let p0 = b.p;
			count.put(b, 0);
			let p1 = b.p;
			data.put(b, l, o);
			let p2 = b.p;
			b.p = p0;
			count.put(b, p2 - p1 + offset, o);
			b.p = p2;
		},
		get: (b,o) => {
			let c = count.get(b, o) - offset;
			let e = b.rp + c;
			let op = b.p;
			if(b.p < e) throw new Error("short record");
			b.p = e;
			let l = data.get(b, o);
			if(b.rp !== e) throw new Error("short record");
			b.p = op;
			return l;
		}
	};
}
function NArray(count,data) {
	return {
		put: (b,l,o) => {
			count.put(b, l.length);
			for(var i = 0; i < l.length; i++)
				data.put(b, l[i], o);
		},
		get: (b,o) => {
			let l = [];
			let c = count.get(b, o);
			for(var i = 0; i < c; i++)
				l.push(data.get(b, o));
			return l;
		}
	};
}
function FnArray(countfn,data) {
	return {
		put: (b,l,o) => {
			if(l.length !== countfn(o))
				throw new Error('inconsistent object');
			for(var i = 0; i < l.length; i++)
				data.put(b, l[i], o);
		},
		get: (b,o) => {
			let l = [];
			let c = countfn(o);
			for(var i = 0; i < c; i++)
				l.push(data.get(b, o));
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
			if(b.p < e) throw new Error("short record");
			b.p = e;
			while(b.rp < e)
				l.push(data.get(b, o));
			if(b.rp !== e) throw new Error("short record");
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
function FixedString(n) {
	return {
		put: (b,c) => b.put(to_cstr(c, n)),
		get: b => from_cstr(b.get(n)),
		len: n
	};
}
function VariableString(count) {
	return {
		put: (b,c) => OpaqueVector(count).put(b, new TextEncoder("utf-8").encode(c)),
		get: b => new TextDecoder("utf-8").decode(OpaqueVector(count).get(b))
	};
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

