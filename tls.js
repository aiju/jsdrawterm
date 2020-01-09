"use strict";

function tlsClient(chan, psk) {
	const RandomSize = 32;
	const MasterSecretSize = 48;
	const MAXFRAG = 16384;
	const DigestStateSize = 336;

	const FChangeCipherSpec = 20;
	const FAlert = 21;
	const FHandshake = 22;
	const FApplicationData = 23;
	const Fragment = Struct([
		'type', U8,
		'version', U16,
		'fragment', OpaqueVector(U16)
	]);
	const AAD = Struct([
		'recnum', U64,
		'type', U8,
		'version', U16,
		'length', U16
	]);
	const HClientHello = 1;
	const ClientHello = Struct([
		'client_version', U16,
		'random', Bytes(RandomSize),
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
		'random', Bytes(RandomSize),
		'session_id', Vector(U8, U8),
		'cipher_suite', U16,
		'compression_method', U8,
		'extensions', Optional(Vector(U16, Struct([
			'type', U16,
			'data', Vector(U8, U16)
		])))
	]);
	const HServerHelloDone = 14;
	const ServerHelloDone = Struct([]);
	const HClientKeyExchange = 16;
	const ClientKeyExchange = Struct([
		'psk_identity', VariableString(U16)
	]);
	const HFinished = 20;
	const Finished = Struct([
		'verify_data', Bytes(12)
	]);
	const Handshake = Struct([
		'msg_type', U8,
		null, Length(U24, Select(o => o.msg_type, {
			1: ClientHello,
			2: ServerHello,
			14: ServerHelloDone,
			16: ClientKeyExchange,
			20: Finished
		}))
	]);

	let crandom = function(){
		var s;
		s = new Uint8Array(RandomSize);
		let t = Date.now() / 1000 | 0;
		s[0] = t >> 24; s[1] = t >> 16; s[2] = t >> 8; s[3] = t;
		window.crypto.getRandomValues(s.subarray(4));
		return s;
	}();
	let srandom;

	function nullCipher() { }
	nullCipher.prototype.decrypt = function(f){};
	nullCipher.prototype.encrypt = function(f){};
	function aeadChacha20Poly1305(mackey, key, iv){
		this.iv = iv;
		this.iv_array = () => Module.HEAPU8.subarray(this.iv, this.iv+12);
		this.state = C.mallocz(26 * 4, 1);
		C.setupChachastate(this.state, key, 32, iv, 12, 20);
	}
	aeadChacha20Poly1305.mac_key_length = 0;
	aeadChacha20Poly1305.enc_key_length = 32;
	aeadChacha20Poly1305.fixed_iv_length = 12;
	aeadChacha20Poly1305.prototype.decrypt = function(f){
		let nonce = new Uint8Array(12);
		for(var i = 0; i < 12; i++)
			nonce[i] = f.recnum / 2**(8*(11-i)) & 255 ^ this.iv_array()[i];
		C.chacha_setiv(this.state, nonce);
		f.length -= 16;
		let aad = pack(AAD, f).data();
		f.fragment = withBuf(f.fragment.length, (buf, buf_array) => {
			buf_array().set(f.fragment);
			if(C.ccpoly_decrypt(buf, f.length, aad, aad.length, buf + f.length, this.state) < 0)
				throw new Error("bad MAC");
			return buf_array().slice(0, f.length);
		});
	};
	aeadChacha20Poly1305.prototype.encrypt = function(f){
		let nonce = new Uint8Array(12);
		for(var i = 0; i < 12; i++)
			nonce[i] = f.recnum / 2**(8*(11-i)) & 255 ^ this.iv_array()[i];
		C.chacha_setiv(this.state, nonce);
		let aad = pack(AAD, f).data();
		f.fragment = withBuf(f.fragment.length + 16, (buf, buf_array) => {
			buf_array().set(f.fragment);
			C.ccpoly_encrypt(buf, f.fragment.length, aad, aad.length, buf + f.fragment.length, this.state);
			return buf_array().slice();
		});
	};

	var handshake = new Packet();
	var application = new Packet();
	var rxCipher = new nullCipher();
	var txCipher = new nullCipher();
	var nextTxCipher = null;
	var nextRxCipher = null;
	var masterSecret;
	var sessionKeys;
	var txRecNum;
	var rxRecNum;
	var handhash = C.mallocz(DigestStateSize*2, 1);
	var closed = false;
	
	function calcMasterSecret() {
		masterSecret = C.mallocz(MasterSecretSize, 1);
		var n = psk.length;
		withBuf(2 * n + 4, (buf, buf_array) => 
		withBuf(2 * RandomSize, (seed, seed_array) => {
			{
				let a = buf_array();
				a[0] = n >> 8;
				a[1] = n;
				a[n+2] = n >> 8;
				a[n+3] = n;
				a.set(psk, n+4);
			}
			seed_array().set(crandom);
			seed_array().set(srandom, RandomSize);
			let label = 'master secret';
			C.p_sha256(masterSecret, MasterSecretSize, buf, 2 * n + 4, label, label.length, seed, 2 * RandomSize);
		}));
		psk.fill(0);
	}
	function calcSessionKeys(mac_key_length, enc_key_length, fixed_iv_length) {
		var n = 2 * mac_key_length + 2 * enc_key_length + 2 * fixed_iv_length;
		if(sessionKeys !== undefined){
			C.memset(sessionKeys.buf, 0, sessionKeys.length);
			C.free(sessionKeys.buf);
		}
		let buf = C.mallocz(n, 1);
		sessionKeys = {
			length: n,
			buf: buf,
			cMACkey: buf,
			sMACkey: buf + mac_key_length,
			cKey: buf + 2 * mac_key_length,
			sKey: buf + 2 * mac_key_length + enc_key_length,
			cIV: buf + 2 * mac_key_length + 2 * enc_key_length,
			sIV: buf + 2 * mac_key_length + 2 * enc_key_length + fixed_iv_length
		};
		let label = 'key expansion';
		withBuf(2 * RandomSize, (seed, seed_array) => {
			seed_array().set(srandom);
			seed_array().set(crandom, RandomSize);
			C.p_sha256(sessionKeys.buf, n, masterSecret, MasterSecretSize, label, label.length, seed, 2 * RandomSize);
		});	
	}
	
	function botch() {
		throw new Error("TLS botch");
	}
	function alert(f) {
		var alerts = {
			0: 'close notify',
			1: 'unexpected message',
			20: 'bad record MAC',
			22: 'record overflow',
			30: 'decompression failure',
			40: 'handshake failure',
			42: 'bad certificate',
			43: 'unsupported certificate',
			44: 'certificate revoked',
			45: 'certificate expired',
			46: 'certificate unknown',
			47: 'illegal parameter',
			48: 'unknown ca',
			49: 'access denied',
			50: 'decode error',
			51: 'decrypt error',
			70: 'protocol version',
			71: 'insufficient security',
			80: 'internal error',
			90: 'user canceled',
			100: 'no renegotiation',
			110: 'unsupported extension',
		};
		if(f.length != 2) botch();
		if(!(f[1] in alerts)) botch();
		switch(f[0]){
		case 1:
			console.log('TLS ALERT: WARNING: ' + alerts[f[1]]);
			break;
		case 2:
			throw new Error('TLS ALERT: FATAL: ' + alerts[f[1]]);
		}
	}
	function recvFragment() {
		function recLen(b) {
			if(b.length < 5) return -1;
			return 5 + (b[3] << 8 | b[4]);
		}
		chan.read(recLen)
			.then(b => {
				if(b === undefined) return;
				let r = unpack(Fragment, b);
				if(r.version != 0x0303) botch();
				r.recnum = rxRecNum++;
				r.length = r.fragment.length;
				rxCipher.decrypt(r);
				switch(r.type){
				case FApplicationData: application.write(r.fragment); break;
				case FHandshake: handshake.write(r.fragment); break;
				case FChangeCipherSpec:
					if(nextRxCipher === null) botch();
					rxCipher = new nextRxCipher(sessionKeys.sMACkey, sessionKeys.sKey, sessionKeys.sIV);
					nextRxCipher = null;
					rxRecNum = 0;
					break;
				case FAlert: 
					if(r.fragment.length == 2 && r.fragment[0] == 1 && r.fragment[1] == 0){
						return sendData(new VBuffer(new Uint8Array([1,0])))
							.then(() => {
								handshake.close();
								application.close();
								chan.close();
							});
					}
					alert(r.fragment);
					break;
				default: throw new Error("TLS unknown protocol " + r.type.toString());
				}
				return recvFragment();
			});
	}
	function recvHandshake() {
		function handLen(b) {
			if(b.length < 4) return -1;
			return 4 + (b[1] << 16 | b[2] << 8 | b[3]);
		}
		return handshake.read(handLen).then(b => {
			if(b[0] != HFinished)
				C.sha2_256(b, b.length, 0, handhash);
			return unpack(Handshake, b)
		});
	}
	function sendData(b, type) {
		let p = Promise.resolve();
		for(var n = 0; n < b.p; n += MAXFRAG){
			let i = n;
			let e = n+MAXFRAG > b.p ? b.p : n+MAXFRAG;
			p = p.then(() => {
				var f = {
					type: type,
					version: 0x0303,
					fragment: b.a.subarray(i, e),
					length: e - i,
					recnum: txRecNum++
				};
				txCipher.encrypt(f);
				return chan.write(pack(Fragment, f).data());
			});
		}
		return p;
	}
	function sendHandshake(data) {
		var b = pack(Handshake, data);
		C.sha2_256(b.data(), b.p, 0, handhash);
		return sendData(b, FHandshake);
	}
	function sendClientHello() {
		return sendHandshake({
			msg_type: HClientHello,
			client_version: 0x0303,
			gmx_unix_time: Date.now() / 1000 | 0,
			random: crandom,
			session_id: [],
			cipher_suites: [0xccab],
			compression_methods: [0],
			extensions: []
		});
	}
	function recvServerHello() {
		return recvHandshake().then(m => {
			if(m.msg_type != HServerHello) botch();
			if(m.server_version != 0x0303) botch();
			if(m.session_id.length != 0) botch();
			if(m.cipher_suite != 0xccab) botch();
			if(m.compression_method != 0) botch();
			srandom = m.random;
			nextTxCipher = nextRxCipher = aeadChacha20Poly1305;
		});
	}
	function recvServerHelloDone() {
		return recvHandshake().then(m => {
			if(m.msg_type != HServerHelloDone) botch();
		});
	}

	function sendClientKeyExchange() {
		return sendHandshake({
			msg_type: HClientKeyExchange,
			psk_identity: "p9secret"
		});
	}
	function sendChangeCipherSpec() {
		var p = new VBuffer();
		p.put([1]);
		return sendData(p, FChangeCipherSpec)
			.then(() => {
				if(nextTxCipher === null) botch();
				txCipher = new nextTxCipher(sessionKeys.cMACkey, sessionKeys.cKey, sessionKeys.cIV);
				nextTxCipher = null;
				txRecNum = 0;
			});
	}
	function verifyData(label) {
		return withBuf(32, (hash, hash_array) => 
		withBuf(12, (data, data_array) => {
			C.memmove(handhash + DigestStateSize, handhash, DigestStateSize);
			C.sha2_256([], 0, hash, handhash + DigestStateSize);
			C.p_sha256(data, 12, masterSecret, MasterSecretSize, label, label.length, hash, 32);
			return data_array().slice();
		}));
	}
	function sendFinished() {
		return sendHandshake({
			msg_type: HFinished,
			verify_data: verifyData('client finished')
		});
	}
	function recvFinished() {
		return recvHandshake().then(m => {
			if(m.msg_type != HFinished) botch();
			let data = verifyData('server finished');
			if(data.length !== m.verify_data.length) botch();
			for(var i = 0; i < data.length; i++)
				if(data[i] != m.verify_data[i])
					botch();
		});
	}
	function runHandshake() {
		return sendClientHello()
			.then(recvServerHello)
			.then(recvServerHelloDone)
			.then(sendClientKeyExchange)
			.then(() => {
				calcMasterSecret();
				calcSessionKeys(nextTxCipher.mac_key_length, nextTxCipher.enc_key_length, nextTxCipher.fixed_iv_length);
			})
			.then(sendChangeCipherSpec)
			.then(sendFinished)
			.then(recvFinished);
	}
	function TlsConn() { }
	TlsConn.prototype.read = function(check) {
		return application.read(check);
	};
	TlsConn.prototype.write = function(b) {
		if(!(b instanceof VBuffer)) b = new VBuffer(b);
		return sendData(b, FApplicationData);
	};

	recvFragment();
	return runHandshake().then(() => new TlsConn());
}
