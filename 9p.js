var Qid = ["i1:type", "i4:ver", "i8:path"];
var QTDIR = 0x80;
var debug9p = 0;

var packets = {
	100: {name: "Tversion", fmt: ["i4:size", "i1:type", "i2:tag", "i4:msize", "S2:version"], handler: Tversion},
	101: {name: "Rversion", fmt: ["i4:size", "i1:type", "i2:tag", "i4:msize", "S2:version"]},
	102: {name: "Tauth", fmt: ["i4:size", "i1:type", "i2:tag", "S2:uname", "S2:aname"], handler: Tauth},
	104: {name: "Tattach", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid", "i4:afid", "S2:uname", "S2:aname"], handler: Tattach},
	105: {name: "Rattach", fmt: ["i4:size", "i1:type", "i2:tag", "b13:qid"]},
	107: {name: "Rerror", fmt: ["i4:size", "i1:type", "i2:tag", "S2:ename"]},
	108: {name: "Tflush", fmt: ["i4:size", "i1:type", "i2:tag", "i2:oldtag"], handler: Tflush},
	109: {name: "Rflush", fmt: ["i4:size", "i1:type", "i2:tag"]},
	110: {name: "Twalk", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid", "i4:newfid", "i2:nwname", "R:wname"], handler: Twalk},
	111: {name: "Rwalk", fmt: ["i4:size", "i1:type", "i2:tag", "i2:nwqid", "R:qids"]},
	112: {name: "Topen", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid", "i1:mode"], handler: Topen},
	113: {name: "Ropen", fmt: ["i4:size", "i1:type", "i2:tag", "b13:qid", "i4:iounit"]},
	114: {name: "Tcreate", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid", "S2:name", "i4:perm", "i1:mode"], handler: Tcreate},
	116: {name: "Tread", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid", "i8:offset", "i4:count"], handler: Tread},
	117: {name: "Rread", fmt: ["i4:size", "i1:type", "i2:tag", "S4:data"]},
	118: {name: "Twrite", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid", "i8:offset", "S4:data"], handler: Twrite},
	119: {name: "Rwrite", fmt: ["i4:size", "i1:type", "i2:tag", "i4:count"]},
	120: {name: "Tclunk", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid"], handler: Tclunk},
	121: {name: "Rclunk", fmt: ["i4:size", "i1:type", "i2:tag"]},
	122: {name: "Tremove", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid"], handler: Tremove},
	124: {name: "Tstat", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid"], handler: Tstat},
	125: {name: "Rstat", fmt: ["i4:size", "i1:type", "i2:tag", "S2:stat"]},
	126: {name: "Twstat", fmt: ["i4:size", "i1:type", "i2:tag", "i4:fid", "S2:stat"], handler: Twstat}
};

var fids = {};
var tree = {name: "/", qid: {type: QTDIR, ver: 0, path: 0}, children: {}, nchildren: []};
var tagflush = {};
var lastqid = 0;
tree.parent = tree;
var msgtype = {};
for(i in packets)
	msgtype[packets[i].name] = i;

function got9praw() {
	var header, packet, t;

	if(cpubuf < 7)
		return -1;
	header = unpack(cpubuf, ["i4:size", "i1:type", "i2:tag"]);
	if(cpubuf.length < header.size)
		return -1;
	t = packets[header.type];
	if(t == undefined)
		fatal("unknown message type " + header.type);
	packet = unpack(cpubuf.substring(0, header.size), t.fmt);
	cpubuf = cpubuf.substring(header.size);
	if(debug9p)
		print("<- " + JSON.stringify(packet) + "\n");
	t.handler(packet);
	return 1;
}

function send9p(p) {
	p.size = 0;
	p.size = pack(p, packets[p.type].fmt).length;
	if(debug9p)
		print("-> " + JSON.stringify(p) + " " + btoa(pack(p, packets[p.type].fmt)) + "\n");
	conn.send(btoa(pack(p, packets[p.type].fmt)));
}

function error9p(tag, s) {
	send9p({type: msgtype.Rerror, tag:tag, ename:s})
}

function Tversion(p) {
	p.type = msgtype.Rversion;
	send9p(p);
}

function Tauth(p) {
	error9p(p.tag, "no auth necessary");
}

function Tattach(p) {
	if(fids[p.fid] != undefined)
		return error9p(p.tag, "fid already in use");
	fids[p.fid] = {f: tree, open: false};
	send9p({type: msgtype.Rattach, tag: p.tag, qid: pack(tree.qid, Qid)});
}

function Twalk(p) {
	var f, i, s, n, qids;

	if(fids[p.fid] == undefined)
		return error9p(p.tag, "fid not in use");
	if(fids[p.newfid] != undefined)
		return error9p(p.tag, "fid already in use");
	f = fids[p.fid].f;
	s = p.wname;
	qids = "";
	for(i = 0; i < p.nwname; qids += pack(f.qid, Qid), i++){
		n = unpack(s, ["S2:p"]).p;
		s = s.substring(2 + n.length);
		if(n == ".")
			continue;
		if(n == ".."){
			f = f.parent;
			continue;
		}
		if((f.qid.type & QTDIR) == 0){
			if(i == 0)
				return error9p(p.tag, "not a directory");
			return send9p({type: msgtype.Rwalk, tag: p.tag, nwqid: i, qids: qids});
		}
		if(f.children[n] == undefined){
			if(i == 0)
				return error9p(p.tag, "no such file or directory");
			return send9p({type: msgtype.Rwalk, tag: p.tag, nwqid: i, qids: qids});
		}
		f = f.children[n];
	}
	fids[p.newfid] = {f: f, open: false};
	send9p({type: msgtype.Rwalk, tag: p.tag, nwqid: i, qids: qids});
}

function Tclunk(p) {
	if(fids[p.fid].open == true && fids[p.fid].f.close != undefined)
		fids[p.fid].f.close(fids[p.fid]);
	fids[p.fid] = undefined;
	send9p({type: msgtype.Rclunk, tag: p.tag});
}

function Topen(p) {
	var f, s;

	if(fids[p.fid] == undefined)
		return error9p(p.tag, "no such fid");
	f = fids[p.fid].f;
	if(f.open != undefined){
		s = f.open(fids[p.fid]);
		if(s != undefined && s != "")
			return error9p(p.tag, s);
	}
	if(fids[p.fid].f.qid.type & QTDIR){
		if((p.mode & 3) != 0)
			return error9p(p.tag, "permission denied");
		fids[p.fid].bloc = 0;
		fids[p.fid].nloc = 0;
		fids[p.fid].open = true;
		return send9p({type: msgtype.Ropen, tag: p.tag, qid: pack(f.qid, Qid), iounit: 0})
	}
	switch(p.mode & 3){
	case 2:
		if(f.write == undefined)
			return error9p(p.tag, "permission denied");
	case 0:
		if(f.read == undefined)
			return error9p(p.tag, "permission denied");
		break;
	case 1:
		if(f.write == undefined)
			return error9p(p.tag, "permission denied");
		break;
	case 3:
		return error9p(p.tag, "permission denied");
	}
	fids[p.fid].open = true;
	send9p({type: msgtype.Ropen, tag: p.tag, qid: pack(f.qid, Qid), iounit: 0})
}

function Tcreate(p) {
	error9p(p.tag, "create prohibited");
}

function Tremove(p) {
	if(fids[p.fid].open == true && fids[p.fid].f.close != undefined)
		fids[p.fid].f.close(fids[p.fid]);
	fids[p.fid] = undefined;
	error9p(p.tag, "remove prohibited");
}

function Twstat(p) {
	error9p(p.tag, "wstat prohibited");
}

function invalidop(f, p) {
	error9p(p.tag, "no.");
}

function Tread(p) {
	var f, s;

	f = fids[p.fid];
	if(f == undefined)
		return error9p(p.tag, "no such fid");
	if(f.open != true)
		return error9p(p.tag, "fid not open");
	if(f.f.qid.type & QTDIR){
		if(p.offset == 0)
			f.bloc = f.nloc = 0;
		if(p.offset != f.bloc)
			return error9p(p.tag, "seek in directory illegal");
		if(p.count < 2)
			return error9p(p.tag, "read too short");
		if(f.nloc >= f.f.nchildren.length)
			return send9p({type: msgtype.Rread, tag: p.tag, data: ""})
		s = dirent(f.f.nchildren[f.nloc]);
		if(p.count < s.length)
			return send9p({type: msgtype.Rread, tag: p.tag, data: s.substring(0, 2)});
		f.bloc += s.length;
		f.nloc++;
		return send9p({type: msgtype.Rread, tag: p.tag, data: s});
	}
	if(f.f.read == undefined)
		return error9p(p.tag, "permission denied");
	f.f.read(f, p)
}

function Twrite(p) {
	if(fids[p.fid] == undefined)
		return error9p(p.tag, "no such fid");
	if(fids[p.fid].open != true)
		return error9p(p.tag, "fid not open");
	if(fids[p.fid].f.write == undefined)
		return error9p(p.tag, "permission denied");
	fids[p.fid].f.write(fids[p.fid], p)
}

function dirent(f) {
	s = {"type":0, "dev":0, "qid": pack(f.qid, Qid), "mode": 0, "atime":0, "mtime":0, "length":0, "name":f.name, "uid":"js", "gid":"js", "muid":"js"};
	s.atime = s.mtime = new Date().getTime() / 1000;
	if(f.qid.type & QTDIR)
		s.mode |= 0111;
	if(f.write)
		s.mode |= 0222;
	if(f.read)
		s.mode |= 0444;
	if(f.qid.type & QTDIR)
		s.mode |= 0x80000000;
	s = pack(s, ["i2:type", "i4:dev", "b13:qid", "i4:mode", "i4:atime", "i4:mtime", "i8:length", "S2:name", "S2:uid", "S2:gid", "S2:muid"]);
	return pack({a:s.length}, ["i2:a"]) + s;
}

function Tstat(p) {
	var s, f;

	if(fids[p.fid] == undefined)
		return error9p(p.tag, "no such fid");
	f = fids[p.fid].f;
	s = dirent(f);
	send9p({type: msgtype.Rstat, tag: p.tag, stat: s});
}

function Tflush(p) {
	if(tagflush[p.oldtag] != undefined){
		tagflush[p.oldtag](p.oldtag);
		tagflush[p.oldtag] = undefined;
	}
	error9p(p.oldtag, "interrupted")
	send9p({type: msgtype.Rflush, tag: p.tag})
}

function lookupfile(path, last) {
	var f, s, n, x;

	f = tree;
	s = path.split('/');
	for(x in s){
		if(!last && x == s.length - 1)
			break;
		n = s[x];
		if(n == "" || n == ".")	
			continue;
		if(n == "..")
			f = f.parent;
		else {
			f = f.children[n];
			if(f == undefined)
				throw path + " not found";
		}
	}
	return f;
}

function mkdir(path) {
	var f, n;
	
	f = lookupfile(path, 0);
	path = path.split('/');
	n = path[path.length - 1];
	f.children[n] = {name: n, parent: f, children: {}, nchildren: [], qid: {type: QTDIR, ver: 0, path: ++lastqid}};
	f.nchildren.push(f.children[n]);
}

function mkfile(path, open, read, write, close) {
	var f, n;
	
	f = lookupfile(path, 0);
	path = path.split('/');
	n = path[path.length - 1];
	f.children[n] = {name: n, parent: f, qid: {type: 0, ver: 0, path: ++lastqid}, open: open, read: read, write: write, close: close};
	f.nchildren.push(f.children[n]);
}

function respond(p, n) {
	tagflush[p.tag] = undefined;
	switch(p.type){
	case 116:
		send9p({type: msgtype.Rread, tag: p.tag, data: n});
		break;
	case 118:
		if(n < 0)
			n = p.data.length;
		send9p({type: msgtype.Rwrite, tag: p.tag, count: n});
		break;
	default:
		throw "respond does not handle " + p.type;
	}
}

function readstr(p, n) {
	return send9p({type: msgtype.Rread, tag: p.tag, data: n.substr(p.offset, p.count)})
}

function onflush(t, f) {
	tagflush[t] = f;
}

mkdir("/dev");
mkfile("/dev/cons", undefined, function(f, p) { readterminal(p.count, function(l) {respond(p, l);}, p.tag); }, function(f, p) { writeterminal(p.data); respond(p, -1); });
mkfile("/dev/consctl", undefined, invalidop, function(f, p) { if(p.data.substr(0, 5) == "rawon") rawmode = true; if(p.data.substr(0, 5) == "rawoff") rawmode = false; respond(p, -1); }, function(f) { rawmode = false; });
mkfile("/dev/cpunote", undefined, function(f, p) { onnote.push(function(l) { respond(p, l);}); });
mkfile("/dev/js", function(f, p){ f.text = ""; }, undefined, function(f, p) { f.text += p.data; respond(p, -1); }, function(f, p) { eval(f.text); });
