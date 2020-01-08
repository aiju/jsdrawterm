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

const Ticketreq = Struct([
	'type', U8,
	'authid', FixedString(ANAMELEN),
	'authdom', FixedString(DOMLEN),
	'chal', Bytes(CHALLEN),
	'hostid', FixedString(ANAMELEN),
	'uid', FixedString(ANAMELEN),
	'paky', Bytes(PAKYLEN)
]);
const Ticket = Struct([
	'num', U8,
	'chal', Bytes(CHALLEN),
	'cuid', FixedString(ANAMELEN),
	'suid', FixedString(ANAMELEN),
	'key', Bytes(NONCELEN)
]);
const Authenticator = Struct([
	'num', U8,
	'chal', Bytes(CHALLEN),
	'rand', Bytes(NONCELEN)
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
	return withBufP(TICKETLEN, (buf, buf_array) => {
		buf_array.set(b);
		if(C.form1M2B(buf, TICKETLEN, key) < 0)
			throw new Error("?password mismatch with auth server");
		return unpack(Ticket, buf_array.slice());
	});
}

function convA2M(s, key)
{
	return withBuf(AUTHENTLEN, (buf, buf_array) => {
		buf_array.set(pack(Authenticator, s).data());
		C.form1B2M(buf, 1 + CHALLEN + NONCELEN, key);
		return buf_array.slice();
	});
}

function convM2A(b, key)
{
	return withBuf(AUTHENTLEN, (buf, buf_array) => {
		buf_array.set(b);
		if(C.form1M2B(buf, AUTHENTLEN, key) < 0)
			throw new Error("?you and auth server agree about password. ?server is confused.");
		return unpack(Authenticator, buf_array.slice());
	});
}

function getastickets(authkey, tr)
{
	return withBufP(PAKYLEN, (ybuf, ybuf_array) =>
	withBufP(PAKPRIVSZ, priv => {
		return dial("ws://localhost:1235").then(chan => {
			tr.type = AuthPAK;
			return chan.write(pack(Ticketreq, tr).data())
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
				return chan.write(pack(Ticketreq, tr).data());
			}).then(() => asrdresp(chan, 0)
			).then(() => chan.read(b=>2*TICKETLEN)
			);
		});
	}));
}

function dp9ik(chan, dom) {
	var crand, cchal;
	var tr;
	var authkey, auth;
	var sticket, cticket;
		
	return withBufP(AUTHKEYSZ, authkey => {
		crand = new Uint8Array(2*NONCELEN);
		cchal = new Uint8Array(CHALLEN);
		window.crypto.getRandomValues(crand);
		window.crypto.getRandomValues(cchal);
		
		return chan.write(cchal)
		.then(() => chan.read(b=>Ticketreq.len))
		.then(b => {
			tr = unpack(Ticketreq, b);
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
			return chan.write(convA2M(auth, cticket.key));
		}).then(() => chan.read(b=>AUTHENTLEN))
		.then(b => {
			auth = convM2A(b, cticket.key);
			if(auth.num != AuthAs || tsmemcmp(auth.chal, cchal, CHALLEN) != 0)
				throw new Error("protocol botch");
			crand.subarray(NONCELEN).set(auth.rand);
			var ai = {
				suid: cticket.suid,
				cuid: cticket.cuid,
			};
			ai.secret = withBuf(256, (secret, secret_buf) => {
				C.hkdf_x_plan9(crand, cticket.key, secret);
				return secret_buf.slice();
			});
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
		});
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

function rcpu() {
	const script = 
"syscall fversion 0 65536 buf 256 >/dev/null >[2=1]\n" + 
"mount -nc /fd/0 /mnt/term || exit\n" + 
"bind -q /mnt/term/dev/cons /dev/cons\n" + 
"if(test -r /mnt/term/dev/kbd){\n" + 
"	</dev/cons >/dev/cons >[2=1] aux/kbdfs -dq -m /mnt/term/dev\n" + 
"	bind -q /mnt/term/dev/cons /dev/cons\n" + 
"}\n" + 
"</dev/cons >/dev/cons >[2=1] service=cpu rc -li\n" + 
"echo -n hangup >/proc/$pid/notepg\n";
	var chan;
	
	return dial("ws://localhost:1234")
	.then(rawchan => p9any(rawchan).then(ai => tlsClient(rawchan, ai.secret)))
	.then(chan_ => chan = chan_)
	.then(() => chan.write(new TextEncoder("utf-8").encode(script.length + "\n" + script)))
	.then(() => NineP(chan));
}

function main() {
	devdraw();
	devcons();
	rcpu();
};
