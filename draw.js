var drawmsg = {
	A: {fmt: ["i4:id", "i4:imageid", "i4:fillid", "i1:public"], handler: drawallocscreen},
	b: {fmt: ["i4:id", "i4:screenid", "i1:refresh", "b4:chan", "i1:repl", "b16:r", "b16:clipr", "b4:color"], handler: drawallocate},
	d: {fmt: ["i4:dstid", "i4:srcid", "i4:maskid", "b16:dstr", "b8:srcp", "b8:maskp"], handler: drawdraw},
	f: {fmt: ["i4:id"], handler: drawfree},
	n: {fmt: ["i4:id", "S1:n"], handler: drawname},
	y: {fmt: ["i4:id", "b16:r", "R:buf"], handler: drawload},
};

var disp = {id: 0, r: [0, 0, 500, 500], chan: "r8g8b8a8", repl: 0, refresh: 0};
disp.clipr = disp.r;
var pub = {"noborder.screen.0": disp};
var screens = {};
var conns = [];
var mouse = [0, 0, 0, 0];
var canv;
var starttime = new Date().getTime();
var onmouse = [];

function punpack(b) {
	var a;

	a = unpack(b, ["i4:x", "i4:y"]);
	return [a.x, a.y];
}

function runpack(b) {
	var a;

	a = unpack(b, ["j4:minx", "j4:miny", "j4:maxx", "j4:maxy"]);
	return [a.minx, a.miny, a.maxx, a.maxy];
}

function newconn() {
	var i;

	for(x in conns)
		if(conns[x].used != true){
			conns[x].used = true;
			conns[x].img = disp;
			conns[x].imgs = {0: disp};
			return conns[x];
		}
	i = conns.length;
	conns.push({id: i, img: disp, used: true, imgs: {0: disp}});
	mkdir("/dev/draw/" + i);
	lookupfile("/dev/draw/" + i, true).id = i;
	mkfile("/dev/draw/" + i + "/ctl", undefined, drawctlread, undefined);
	mkfile("/dev/draw/" + i + "/data", undefined, invalidop, drawdatawrite);
	mkfile("/dev/draw/" + i + "/colormap", undefined, undefined, undefined);
	mkfile("/dev/draw/" + i + "/refresh", undefined, invalidop, undefined);
	return conns[i];
}

function drawnewopen(f) {
	if(canv == undefined){
		canv = document.getElementById('draw').getContext('2d');
		if(canv == undefined)
			return "no canvas";
		disp.data = canv.getImageData(0, 0, canv.canvas.width, canv.canvas.height);
	}
	f.f = lookupfile("/dev/draw/" + newconn().id + "/ctl", true);
	return "";
}

function drawctlread(f, p) {
	var id, c, i;

	id = f.f.parent.id;
	c = conns[id];
	i = c.img;
	a = [id, i.id, i.chan, i.repl].concat(i.r).concat(i.clipr);
	for(x in a){
		a[x] = String(a[x]).substring(0, 11);
		if(a[x].length < 11)
			a[x] = Array(12 - a[x].length).join(' ') + a[x];
	}
	readstr(p, a.join(' ')+' ');
}

function drawdatawrite(f, p) {
	var t, s, m;

	t = p.data[0];
	if(drawmsg[t] == undefined){
		writeterminal("unknown message " + t + "\n");
		return error9p(p.tag, "unknown message " + t);
	}
	m = unpack(p.data.substring(1), drawmsg[t].fmt);
//	print(t + " " + JSON.stringify(m) + "\n");
	s = drawmsg[t].handler(conns[f.f.parent.id], m);
	if(s != "" && s != undefined)
		return error9p(p.tag, s);
	respond(p, -1);
}

function drawallocate(c, p) {
	var i, j, n;

	if(c.imgs[p.id] != undefined) return "id " + p.id + " already in use";
	i = {id: p.id, refresh: p.refresh, r: runpack(p.r), clipr: runpack(p.clipr), chan: p.chan};
	if(p.screenid != 0){
		i.screen = screens[p.screenid];
		if(i.screen == undefined) return "id " + p.screenid + " not in use";
		i.screen.win.push(i);
	}
	i.data = canv.createImageData(rw(i.r), rh(i.r));
	n = rw(i.r) * rh(i.r);
	for(j = 0; j < n; j++){
		i.data.data[4 * j] = p.color.charCodeAt(3);
		i.data.data[4 * j + 1] = p.color.charCodeAt(2);
		i.data.data[4 * j + 2] = p.color.charCodeAt(1);
		i.data.data[4 * j + 3] = p.color.charCodeAt(0);
	}
	c.imgs[p.id] = i;
}

function drawallocscreen(c, p) {
	if(screens[p.id] != undefined) return "id " + p.id + " already in use";
	if(c.imgs[p.imageid] == undefined) return "id " + p.imageid + " not in use";
	if(c.imgs[p.fillid] == undefined) return "id " + p.fillid + " not in use";
	screens[p.id] = {image: c.imgs[p.imageid], fill: c.imgs[p.fillid], public: p.public, win: []};
}

function drawfree(c, p) {
	c.imgs[p.id] = undefined;
}

function drawload(c, p) {
	var im, d, i, j, k, l, r;

	i = c.imgs[p.id];
	if(i == undefined) return "id + " + p.id + " not in use";
	r = runpack(p.r);
	d = i.data.data;
	k = 0;
	for(i = r[1]; i < r[3]; i++)
		for(j = r[0]; j < r[2]; j++)
			for(l = 0; l < 3; l++)
				d[4 * (d.width * i + j) + l] = p.buf[k++];
}

function drawname(c, p) {
	if(c.imgs[p.id] != undefined) return "id " + p.id + " already in use";
	if(pub[p.n] == undefined) return "no such image " + p.n;
	c.imgs[p.id] = pub[p.n];
}

function dstflush(dst) {
	var s;

	s = dst.screen;
	if(s != undefined){
		memdraw(s.image, s.image.r, s.fill, [0, 0], undefined, undefined, 11);
		for(x in s.win)
			memdraw(s.image, s.image.r, s.win[x], [0, 0], undefined, undefined, 11);
		dstflush(s.image);
	}
	if(dst == disp)
		canv.putImageData(dst.data, 0, 0);
}

function drawdraw(c, p) {
	var dst, src;

	dst = c.imgs[p.dstid];
	if(dst == undefined) return "id " + p.dstid + " not in use";
	src = c.imgs[p.srcid];
	if(src == undefined) return "id " + p.srcid + " not in use";
	mask = c.imgs[p.maskid];
	memdraw(dst, runpack(p.dstr), src, punpack(p.srcp), mask, punpack(p.maskp), 11);
	dstflush(dst);
}

mkfile("/dev/winname", undefined, function(f, p) { readstr(p, "noborder.screen.0"); }, undefined);
mkfile("/dev/cursor", undefined, function(){}, function(f, p) {respond(p, -1);});
mkdir("/dev/draw");
mkfile("/dev/draw/new", drawnewopen, drawctlread, invalidop);

function mousechange(k, e) {
	var c, n;

	c = document.getElementById('draw');
	mouse = [e.clientX - c.offsetLeft, e.clientY - c.offsetLeft, mouse[2], new Date().getTime() - starttime];
	switch(k){
	case 1: mouse[2] |= (1<<e.button); break;
	case 2: mouse[2] &= ~(1<<e.button); break;
	}
	n = onmouse.length;
	while(n--)
		onmouse.shift()();
}

function
mouseread(f, p)
{
	var s, i;

	if(f.mouse != mouse) {
		s = f.mouse = mouse;
		for(i in s){
			s[i] = String(s[i]).substring(0, 11);
			if(s[i].length < 11)
				s[i] = Array(12 - s[i].length).join(' ') + s[i];
		}
		s = 'm' + s.join(' ') + ' ';
		respond(p, s);
	} else {
		var l = onmouse.length;
		onflush(p.tag, function() { onmouse.splice(l, 1); });
		onmouse.push(function() { mouseread(f, p); })
	}
}

mkfile("/dev/mouse", undefined, mouseread, function(f, p) {respond(p, -1);});
