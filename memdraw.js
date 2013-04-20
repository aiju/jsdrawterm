function rw(r) {
	return r[2] - r[0];
}

function rh(r) {
	return r[3] - r[1];
}

function min(a, b) {
	return (a > b) ? b : a;
}

function max(a, b) {
	return (a > b) ? a : b;
}

function intersect(r, s) {
	return [max(r[0], s[0]), max(r[1], s[1]), min(r[2], s[2]), min(r[3], s[3])];
}

function offset(r, p) {
	return [r[0] + p[0], r[1] + p[1], r[2] + p[0], r[3] + p[1]];
}

function allocimg(rect, fill, repl) {
	i = {r: rect, clipr: [0,0,65535,65535], repl: repl};
	i.data = canv.createImageData(rw(i.r), rh(i.r));
	n = rw(i.r) * rh(i.r);
	for(j = 0; j < n; j++){
		i.data.data[4 * j] = fill[0];
		i.data.data[4 * j + 1] = fill[1];
		i.data.data[4 * j + 2] = fill[2];
		i.data.data[4 * j + 3] = fill[3];
	}
	return i;
}

function memdraw(dst, r, src, sp, mask, mp, op) {
	var spr, dx, dy, sx, sy, d, s, doff, soff;

	mask = undefined;
	spr = [sp[0] + r[0], sp[1] + r[1]];
	r = intersect(r, dst.r);
	r = intersect(r, offset(src.clipr, spr));
	if(src.repl == 0)
		r = intersect(r, offset(src.r, spr));
	if(mask != undefined){
//		throw "mask unimplemented";
		r = intersect(r, offset(mask.clipr, mp));
		if(mask.repl == 0)
			r = intersect(r, offset(mask.r, mp));
	}

	d = dst.data.data;
	s = src.data.data;
	for(dy = r[1], sy = sp[1]; dy < r[3]; dy++, sy++){
		if(sy == src.data.height)
			sy -= src.data.height;
		for(dx = r[0], sx = sp[0]; dx < r[2]; dx++, sx++){
			if(sx == src.data.width)
				sx -= src.data.width;
			doff = (dy * dst.data.width + dx) * 4;
			soff = (sy * src.data.width + sx) * 4;
			d[doff++] = s[soff++];
			d[doff++] = s[soff++];
			d[doff++] = s[soff++];
			d[doff++] = s[soff++];
		}
	}
}

function testdraw() {
	var a, b;

	a = allocimg([0, 0, 200, 200], [0,0,0,255], 0);
	b = allocimg([0, 0, 8, 8], [255,0,0,255], 1);
	c = allocimg([0, 0, 4, 4], [0,255,0,255], 0);
	memdraw(b, b.r, c, [0, 0])
	memdraw(b, [4, 4, 8, 8], c, [0, 0])
	memdraw(a, a.r, b, [0, 0])
	canv.putImageData(a.data, 0, 0)
}
