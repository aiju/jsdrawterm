var cpubuf;
var oncpumsg;
var authdom;
var conn;
var state;

var TicketReq = ["i1:type","s28:authid","s48:authdom","b8:chal","s28:hostid","s28:uid"];
var Ticket = ["i1:num","b8:chal","s28:cuid","s28:suid","B7:key"];
var Authenticator = ["i1:num","b8:chal","i4:id"];

function fatal(msg) {
	throw msg;
}

function randomdata(n) {
	var s, i;

	s = "";
	for(i = 0; i < n; i++)
		s += String.fromCharCode(Math.floor(Math.random() * 256));
	return s;
}

function newWebSocket(url) {
	if(window.WebSocket != undefined)
		return new WebSocket(url);
	if(window.MozWebSocket != undefined)
		return new MozWebSocket(url);
	fatal("no websockets");
}

function unpack(data, fmt) {
	var x,s,t,n,i,l,r,p,v;

	i = 0;
	r = {};
	for(x in fmt){
		s = fmt[x].split(':', 2);
		t = s[0];
		n = s[1];
		l = parseInt(t.substring(1))
		t = t.substring(0, 1);
		if(t == "R"){
			r[n] = data.substring(i);
			break;
		}
		s = data.substring(i, i+l);
		i += l;
		switch(t){
		case "i":
			v = 0;
			for(p = s.length - 1; p >= 0; p--){
				v *= 256;
				v += s.charCodeAt(p);
			}
			r[n] = v;
			break;
		case "j":
			v = 0;
			for(p = s.length - 1; p >= 0; p--){
				v *= 256;
				v += s.charCodeAt(p);
			}
			p = 1 << (s.length * 8 - 1);
			if((v & p) != 0){
				v &= ~p;
				v = - 1 - v;
			}
			r[n] = v;
			break;
		case "s":
			v = s.indexOf(String.fromCharCode(0));
			if(v < 0)
				r[n] = s;
			else
				r[n] = s.substring(0, v);
			break;
		case "S":
			v = 0;
			for(p = s.length - 1; p >= 0; p--){
				v *= 256;
				v += s.charCodeAt(p);
			}
			r[n] = data.substr(i, v);
			i += v;
			break;
		case "b":
			r[n] = s;
			break;
		case "B":
			r[n] = Array(l);
			for(p = 0; p < l; p++)
				r[n][p] = s.charCodeAt(p);
			break;
		default:
			throw "unknown type " + t + " used with unpack";
		}
	}
	return r;
}

function pack(data, fmt) {
	var r,s,t,n,l,v;

	r = "";
	for(x in fmt){
		s = fmt[x].split(':', 2);
		t = s[0];
		n = s[1];
		l = parseInt(t.substring(1))
		t = t.substring(0, 1);
		s = data[n];
		if(s == undefined)
			throw "undefined field " + n + " in pack";
		switch(t){
		case "i":
			for(p = 0; p < l; p++){
				r += String.fromCharCode(s & 0xFF);
				s >>>= 8;
			}
			break;
		case "s":
		case "b":
			if(s.length > l)
				r += s.substring(0, l);
			else{
				r += s;
				if(s.length < l)
					r += Array(l - s.length + 1).join("\0");
			}
			break;
		case "S":
			v = s.length;
			for(p = 0; p < l; p++){
				r += String.fromCharCode(v & 0xFF);
				v >>>= 8;
			}
			r += s;
			break;
		case "R":
			r += s;
			break;
		default:
			throw "unknown type " + t + " used with pack";
		}
	}
	return r;
}

function startauth() {
	cpubuf = "";
	conn = newWebSocket("ws://phicode.de:8080/ncpu");
	conn.onmessage = function(evt) {
		cpubuf += window.atob(evt.data);
		if(oncpumsg)
			while(cpubuf != "" && oncpumsg() > 0)
				;
	}
	conn.onerror = fatal;
	conn.onopen = function(evt) {
		var cticket, cchal;

		state = 0;
		oncpumsg = function() {
			var i, s, arr, arr2;

			switch(state){
			case 0: case 1: case 4: case 5:
				i = cpubuf.indexOf(String.fromCharCode(0));
				if(i < 0)
					return -1;
				s = cpubuf.substring(0, i);
				cpubuf = cpubuf.substring(i+1);
				break;
			case 2:
				i = 141;
				if(cpubuf.length < i)
					return -1;
				s = cpubuf.substring(0, i);
				cpubuf = cpubuf.substring(i);
				break;
			case 3:
				i = 13;
				if(cpubuf.length < i)
					return -1;
				s = cpubuf.substring(0, i);
				cpubuf = cpubuf.substring(i);
				break;
			}
			switch(state){
			case 0:
				state++;
				if(s != "")
					fatal(s);
				break;
			case 1:
				state++;
				arr = s.split(' ');
				for(i = 0; i < arr.length; i++){
					arr2 = arr[i].split('@');
					if(arr2[0] == 'p9sk1'){
						conn.send(window.btoa(arr2[0] + ' ' + arr2[1] + '\0'));
						cchal = randomdata(8);
						conn.send(window.btoa(cchal));
						authdom=arr2[1];
						break;
					}
				}
				if(!authdom)
					fatal("p9sk1 not available");
				writeterminal('dom: ' + authdom + '\n');
				break;
			case 2:
				var chal;

				state++;
				s = unpack(s, TicketReq);
				s.type = 1;
				s.hostid = "foo";
				s.uid = "foo";
				chal = s.chal;
				s = pack(s, TicketReq);
				authconn = newWebSocket("ws://phicode.de:8080/auth");
				authconn.onmessage = function(evt) {
					var buf, sticket;

					authconn.close()
					buf = atob(evt.data);
					if(buf.length < 145)
						fatal("AS ticket too short");
					if(buf.charCodeAt(0) != 4)
						fatal("AS protocol botch " + buf.charCodeAt(0));
					cticket = unpack(decrypt(passtokey("password"), buf.substr(1, 72)), Ticket);
					if(cticket.num != 65)
						fatal("wrong password");
					sticket = buf.substr(73, 72);
					conn.send(btoa(sticket + encrypt(cticket.key, pack({num:67, chal:chal, id:0}, Authenticator))));
				}
				authconn.onopen = function() {
					authconn.send(btoa(s));
				}
				break;
			case 3:
				state++;
				s = unpack(decrypt(cticket.key, s), Authenticator);
				if(s.num != 66 || s.chal != cchal || s.id != 0)
					fatal("cpu auth protocol botch");
				conn.send(btoa("! /bin/rc\0"));
				conn.send(btoa("NO\0"));
				break;
			case 4:
				state++;
				if(s != "FS")
					fatal("want FS got " + s);
				break;
			case 5:
				state++;
				oncpumsg = got9praw;
				if(s != "/")
					fatal("want / got " + s);
				conn.send(btoa("OK"));
			}
			return 1;
		}
		conn.send(window.btoa("p9\0"));
	}
}
