"use strict";

const Enoent = 'no such file or directory';

const QTDIR = 0x80;
function Qid(path, vers, type) {
	this.path = path;
	this.vers = vers;
	this.type = type;
}
function Stat() {
	this.type = 0;
	this.dev = 0;
	this.qid = new Qid(0,0,0);
	this.mode = 0o664;
	this.atime = Date.now()/1000|0;
	this.mtime = Date.now()/1000|0;
	this.length = 0;
	this.name = '';
	this.uid = 'drawterm';
	this.gid = 'drawterm';
	this.muid = 'drawterm';
}
function Fid(n, old) {
	this.n = n;
	this.opened = false;
	this.diroffset = 0;
	this.direntries = [];
	if(old)
		this.file = old.file;
}
var allocpath = 0;
function File(name, type, parent) {
	this.name = name;
	this.qid = new Qid(allocpath++, 0, type);
	this.sub = {};
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
File.prototype.read = function(fid, count, offset){
	return new Error('no reads');
}
File.prototype.dirread = function() {
	var l = [], x;
	for(x in this.sub)
		l.push(this.sub[x].stat());
	return l;
}
File.prototype.write = function(fid, data, mode){
	return new Error('no writes');
}
File.prototype.stat = function(fid){
	let s = new Stat();
	s.name = this.name;
	s.qid = this.qid;
	if((s.qid.type & QTDIR) != 0)
		s.mode |= 0o111;
	return s;
};
File.prototype.wstat = function(fid, stat){
	return new Error('no wstat');
};
File.prototype.clunk = function(fid){
};
File.prototype.remove = function(fid){
	return new Error('no remove');
};

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
const devnull = new File('null', 0, dev);
devnull.read = function(fid, count, offset){return '';}
devnull.write = function(fid, data, offset){}
const devzero = new File('zero', 0, dev);
devzero.read = function(fid, count, offset){return new Uint8Array(count);}
devzero.write = function(fid, data, offset){}

var mousereaders = [];
const devmouse = new File('mouse', 0, dev);
devmouse.read = function(fid, count, offset){
	return new Promise(function(resolve, reject){
		mousereaders.push(s => resolve(s.substr(0, count)));
	});
}
function mouse(event){
	let f = mousereaders.shift();
	if(f === undefined) return;
	let rect = canvas.getBoundingClientRect()
	let s = 'm' + [
			event.clientX - rect.left,
			event.clientY - rect.top,
			event.buttons & 1 | event.buttons >> 1 & 2 | event.buttons << 1 & 4,
			event.timeStamp|0
		].map(s => s.toString().padStart(11)).join(' ') + ' ';
	f(s);
}

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
	
	const string = VariableString(u16);
	const qid = Struct(['type', u8, 'vers', u32, 'path', u64]);
	const dirstat = Length(u16, Struct([
		'type', u16,
		'dev', u32,
		'qid', qid,
		'mode', u32,
		'atime', u32,
		'mtime', u32,
		'length', u64,
		'name', string,
		'uid', string,
		'gid', string,
		'muid', string
	]));
	const Tversion = Struct(['msize', u32, 'version', string]);
	const Rversion = Tversion;
	const Tauth = Struct(['afid', u32, 'uname', u32, 'aname', u32]);
	const Rauth = Struct(['aqid', qid]);
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
	const Tstat = Struct(['fid', u32]);
	const Rstat = Struct(['stat', Length(u16, dirstat)]);
	const Tremove = Tclunk;
	const Rremove = Rclunk;
	const Twstat = Struct(['fid', u32, 'stat', Length(u16, dirstat)]);
	const Rwstat = Rclunk;
	const Tflush = Struct(['oldtag', u16]);
	const Rflush = Rclunk;

	const Msg9P = Length(u32, Struct([
		'type', u8,
		'tag', u16,
		null, Select(o => o.type, {
			100: Tversion,
			101: Rversion,
			102: Tauth,
			103: Rauth,
			104: Tattach,
			105: Rattach,
			107: Rerror,
			108: Tflush,
			109: Rflush,
			110: Twalk,
			111: Rwalk,
			112: Topen,
			113: Ropen,
			114: Tcreate,
			115: Rcreate,
			116: Tread,
			117: Rread,
			118: Twrite,
			119: Rwrite,
			120: Tclunk,
			121: Rclunk,
			122: Tremove,
			123: Rremove,
			124: Tstat,
			125: Rstat,
			126: Twstat,
			127: Rwstat
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
		//console.log('-> ', m);
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
		return Promise.resolve(req.fid.file.clunk(req.fid)).then(() => {
			delete fids[req.fid.n];
			req.respond();
		});
	}
	function remove(req) {
		return Promise.resolve(req.fid.file.remove(req.fid)).then(e => {
			delete fids[req.fid.n];
			req.respond(e);
		});
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
		if((req.fid.file.qid.type & QTDIR) != 0){
			if(req.ifcall.offset !== 0 && req.ifcall.offset !== req.fid.diroffset)
				return req.respond('no seek on directory');
			return Promise.resolve(req.ifcall.offset == 0 ? req.fid.file.dirread() : req.fid.direntries)
			.then(d => {
				let b = new VBuffer();
				let i, lp;
				for(i = 0; b.p < req.ifcall.count && i < d.length; i++){
					lp = b.p;
					dirstat.put(b, d[i]);
				}
				if(b.p > req.ifcall.count){
					i--;
					b.p = lp;
				}
				req.ofcall.data = b.data();
				d.splice(0, i);
				req.fid.direntries = d;
				return req.respond();
			});
		}else{
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
	}
	function stat(req) {
		return Promise.resolve(req.fid.file.stat(req.fid))
		.then(e => {
			if(e instanceof Error)
				return req.respond(e);
			if(e instanceof Stat){
				req.ofcall.stat = e;
				return req.respond();
			}
			throw new Error('stat should return error or Stat');
		});	
	}
	function wstat(req) {
		return Promise.resolve(req.fid.file.wstat(req.fid, req.ifcall.stat))
		.then(e => {
			if(e instanceof Error)
				return req.respond(e);
			if(e === undefined)
				return req.respond();
			throw new Error('stat should return error or undefined');
		});	
	}
	function srv() {
		return recvMsg().then(m => {
			//console.log('<- ', m);
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
			case $Tauth: req.respond(Enoauth); break;
			case $Twalk: walk(req); break;
			case $Tclunk: clunk(req); break;
			case $Tremove: remove(req); break;
			case $Topen: open(req); break;
			case $Tcreate: return req.respond('no create');
			case $Twrite: write(req); break;
			case $Tread: read(req); break;
			case $Tstat: stat(req); break;
			case $Twstat: wstat(req); break;
			case $Tflush: break;
			default: botch();
			}
		}).then(srv);
	}
	
	return version()
		.then(srv);
}
