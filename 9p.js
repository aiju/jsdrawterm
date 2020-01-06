"use strict";

const Enoent = 'no such file or directory';

const QTDIR = 0x80;
function Qid(path, vers, type) {
	this.path = path;
	this.vers = vers;
	this.type = type;
}
function Fid(n, old) {
	this.n = n;
	this.opened = false;
	if(old)
		this.file = old.file;
}
var allocpath = 0;
function File(name, type, parent) {
	this.name = name;
	this.qid = new Qid(allocpath++, 0, type);
	this.sub = [];
	this.parent = parent;
	if(parent !== null)
		parent.sub[name] = this;
}
File.prototype.walk = function(name){
	if(name == '..')
		return this.parent;
	if(name in this.sub)
		return this.sub[name];
	return new Error(Enoent);
};
File.prototype.open = function(fid, mode){
}
File.prototype.read = function(fid, data, mode){
	return '';
}
File.prototype.write = function(fid, data, mode){
	return new Error('no writes');
}

const root = new File('/', QTDIR, null);
root.parent = root;
const dev = new File('dev', QTDIR, root);

var currentline = '';
const inputQueue = new Packet();
function addinput(s){
	currentline += s;
	document.getElementById('console').innerHTML += s;
	document.getElementById('console').setSelectionRange(document.getElementById('console').innerHTML.length, -1);
	document.getElementById('console').scrollTop = 99999;
	if(s.indexOf('\n') >= 0){
		let n = currentline.indexOf('\n');
		inputQueue.write(new TextEncoder('utf-8').encode(currentline.substring(0,n+1)));
		currentline = currentline.substring(n+1);
	}
}
function input(event){
	if(event.key.length == 1)
		addinput(event.key);
	else switch(event.key){
	case 'Enter':
		addinput('\n');
		break;
	case 'Backspace':
		if(currentline.length > 0){
			currentline = currentline.substring(0, currentline.length - 1);
			document.getElementById('console').innerHTML = document.getElementById('console').innerHTML.substring(0, document.getElementById('console').innerHTML.length - 1);
			document.getElementById('console').setSelectionRange(document.getElementById('console').innerHTML.length, -1);
			document.getElementById('console').scrollTop = 99999;
		}
		break;
	default:
		return true;
	}
	return false;
}
const devcons = new File('cons', 0, dev);
devcons.read = function(fid, count, offset){
	return inputQueue.read(b => b.length > 0 ? Math.min(b.length, count) : -1);
}
devcons.write = function(fid, data, offset){
	document.getElementById('console').innerHTML += new TextDecoder('utf-8').decode(data);
	document.getElementById('console').setSelectionRange(document.getElementById('console').innerHTML.length, -1);
	document.getElementById('console').scrollTop = 99999;
};

function NineP(chan){
	const Eduptag = new Error('duplicate tag');
	const Enoauth = new Error('authentication not required');
	const Enofid = new Error('no such fid');
	
	const $Tversion = 100;
	const $Rversion = 101;
	const $Tauth =  102;
	const $Rauth = 103;
	const $Tattach = 104;
	const $Rattach = 105;
	const $Terror = 106; /* illegal */
	const $Rerror = 107;
	const $Tflush = 108;
	const $Rflush = 109;
	const $Twalk =  110;
	const $Rwalk = 111;
	const $Topen =  112;
	const $Ropen = 113;
	const $Tcreate = 114;
	const $Rcreate = 115;
	const $Tread =  116;
	const $Rread = 117;
	const $Twrite = 118;
	const $Rwrite = 119;
	const $Tclunk = 120;
	const $Rclunk = 121;
	const $Tremove = 122;
	const $Rremove = 123;
	const $Tstat =  124;
	const $Rstat = 125;
	const $Twstat = 126;
	const $Rwstat = 127;
	
	const NOTAG = 65535;
	const NOFID = -1;
	const minMsize = 256;
	const maxMsize = 1048576;
	
	var msize;
	
	function botch() {
		throw new Error("9P botch");
	}
	
	const string = String(u16);
	const qid = Struct(['type', u8, 'vers', u32, 'path', u64]);
	const Tversion = Struct(['msize', u32, 'version', string]);
	const Rversion = Tversion;
	const Tattach = Struct(['fid', u32, 'afid', u32, 'uname', string,'aname', string]);
	const Rattach = Struct(['qid', qid]);
	const Rerror = Struct(['ename', string]);
	const Twalk = Struct(['fid', u32, 'newfid', u32, 'wname', Array(u16, string)]);
	const Rwalk = Struct(['wqid', Array(u16, qid)]);
	const Tclunk = Struct(['fid', u32]);
	const Rclunk = Struct([]);
	const Topen = Struct(['fid', u32, 'mode', u8]);
	const Ropen = Struct(['qid', qid, 'iounit', u32]);
	const Tcreate = Struct(['fid', u32, 'name', string, 'perm', u32, 'mode', u8]);
	const Rcreate = Struct(['qid', qid, 'iounit', u32]);
	const Twrite = Struct(['fid', u32, 'offset', u64, 'data', OpaqueVector(u32)]);
	const Rwrite = Struct(['count', u32]);
	const Tread = Struct(['fid', u32, 'offset', u64, 'count', u32]);
	const Rread = Struct(['data', OpaqueVector(u32)]);

	const Msg9P = Length(u32, Struct([
		'type', u8,
		'tag', u16,
		null, Select(o => o.type, {
			100: Tversion,
			101: Rversion,
			104: Tattach,
			105: Rattach,
			107: Rerror,
			110: Twalk,
			111: Rwalk,
			112: Topen,
			113: Ropen,
			120: Tclunk,
			121: Rclunk,
			114: Tcreate,
			115: Rcreate,
			118: Twrite,
			119: Rwrite,
			116: Tread,
			117: Rread
		})
	]), 4);
	
	function recvMsg() {
		function msglen(b) {
			if(b.length < 4) return -1;
			return b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24;
		}
		return chan.read(msglen)
			.then(b => unpack(Msg9P, b));
	}
	function sendMsg(m) {
		console.log('-> ', m);
		var b = pack(Msg9P, m);
		return chan.write(b);
	}
	function version() {
		return recvMsg().then(m => {
			if(m.type != $Tversion || m.tag != NOTAG)
				botch();
			if(m.msize < minMsize)
				botch();
			msize = Math.min(m.msize, maxMsize);
			if(m.version != '9P2000' && !m.version.startswith('9P2000.'))
				botch();
			return sendMsg({
				type: $Rversion,
				tag: NOTAG,
				msize: msize,
				version: '9P2000'});
		});
	}

	var tags = {};
	var fids = {};
	function Req(msg) {
		this.tag = msg.tag;
		this.ifcall = msg;
		this.ofcall = {
			type: msg.type | 1,
			tag: msg.tag
		};
		this.responded = false;
	}
	Req.prototype.respond = function(ename) {
		if(this.responded)
			throw new Error("9P: request answered twice");
		this.responded = true;
		delete tags[this.tag];
		if(ename === undefined || ename === null)
			return sendMsg(this.ofcall);
		else
			return sendMsg({type: $Rerror, tag: this.tag, ename: ename.toString()});
	}
	function newReq(m) {
		if(m.tag in tags){
			console.log('9P: duplicate tag ' + m.tag);
			return null;
		}
		var req = new Req(m);
		tags[m.tag] = req;
		return req;
	}
	function attach(req) {
		if(req.ifcall.afid != -1)
			return req.respond(Enoauth);
		if(req.ifcall.fid in fids)
			return req.respond(Edupfid);
		req.fid = new Fid(req.ifcall.fid);
		fids[req.ifcall.fid] = req.fid;
		req.fid.file = root;
		req.ofcall.qid = req.fid.file.qid;
		req.respond();
	}
	function walk(req) {
		if(req.ifcall.fid !== req.ifcall.newfid && req.ifcall.newfid in fids)
			return req.respond(Edupfid);
		if(req.fid.opened)
			return req.respond('cannot clone open fid');
		if((req.fid.file.qid.type & QTDIR) == 0 && req.ifcall.wname.length > 0)
			return req.respond('cannot walk file');
		let nfid = new Fid(req.ifcall.newfid, req.fid);
		var p = Promise.resolve(false);
		req.ofcall.wqid = [];
		for(var i = 0; i < req.ifcall.wname.length; i++){
			let name = req.ifcall.wname[i];
			p = p.then(abort => {
				if(abort) return true;
				return Promise.resolve(nfid.file.walk(name)).then(e => {
					if(e instanceof Error){
						if(i == 0)
							return req.respond(e).then(true);
						return req.respond().then(true);
					}
					nfid.file = e;
					req.ofcall.wqid.push(nfid.file.qid);
					return false;
				});
			});
		}
		p.then(abort => {if(!abort){
			fids[req.ifcall.newfid] = nfid;
			return req.respond();
		}});
		return p;
	}
	function clunk(req) {
		delete fids[req.fid.n];
		req.respond();
	}
	function open(req) {
		return Promise.resolve(req.fid.file.open(req.fid, req.ifcall.mode))
		.then(e => {
			if(e !== null && e !== undefined)
				return req.respond(e);
			req.fid.opened = true;
			req.fid.mode = req.ifcall.mode;
			req.ofcall.qid = req.fid.file.qid;
			req.ofcall.iounit = 0;
			return req.respond();
		});
	}
	function write(req) {
		return Promise.resolve(req.fid.file.write(req.fid, req.ifcall.data, req.ifcall.offset))
		.then(e => {
			if(e instanceof Error)
				return req.respond(e);
			if(typeof(e) == 'number'){
				req.ofcall.count = e;
				return req.respond();
			}
			if(e === undefined){
				req.ofcall.count = req.ifcall.data.length;
				return req.respond();
			}
			throw new Error('write should return undefined, error or number');
		});
	}
	function read(req) {
		return Promise.resolve(req.fid.file.read(req.fid, req.ifcall.count, req.ifcall.offset))
		.then(e => {
			if(e instanceof Error)
				return req.respond(e);
			if(typeof(e) == 'string'){
				req.ofcall.data = new TextEncoder('utf-8').encode(e);
				return req.respond();
			}
			if(e instanceof Uint8Array){
				req.ofcall.data = e;
				return req.respond();
			}
			throw new Error('read should return error, string or Uint8Array');
		});
	}
	function srv() {
		return recvMsg().then(m => {
			console.log('<- ', m);
			let req = newReq(m);
			if(req === null)
				return sendMsg({type: $Rerror, tag: m.tag, ename: Eduptag});
			if('fid' in m && m.type != $Tattach){
				req.fid = fids[m.fid];
				if(req.fid === undefined)
					return req.respond(Enofid);
			}
			switch(m.type){
			case $Tattach: attach(req); break;
			case $Twalk: walk(req); break;
			case $Tclunk: clunk(req); break;
			case $Topen: open(req); break;
			case $Tcreate: return req.respond('no create');
			case $Twrite: write(req); break;
			case $Tread: read(req); break;
			default: botch();
			}
		}).then(srv);
	}
	
	return version()
		.then(srv);
}
