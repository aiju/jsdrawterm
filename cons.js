var consbuf = "";
var unread = "";
var backlog = "";
var online = [];
var onnote = [];
var rawmode = false;
var holdmode = false;

function fromutf8(s) {
	return decodeURIComponent(escape(s));
}

function toutf8(s) {
	return unescape(encodeURIComponent(s));
}


function
writeterminal(msg)
{
	var ta = document.getElementById("terminal");
	backlog += msg;
	ta.firstChild.nodeValue = fromutf8(backlog + consbuf) + "\u2588";
	ta.scrollTop = ta.scrollHeight;
}

function
print(msg)
{
	writeterminal(toutf8(msg));
}

function
flush() {
	if(holdmode && !rawmode){
		writeterminal("");
		return;
	}
	unread += consbuf;
	if(!rawmode)
		backlog += consbuf;
	consbuf = "";
	writeterminal("");
	if(online.length > 0)
		online.shift()(consbuf);
	while(unread != "" && online.length > 0)
		online.shift()(consbuf);
}

function
note(s)
{
	while(onnote.length > 0)
		onnote.shift()(s);
}

function
addchar(c)
{
	if(c == 127){
		note("interrupt");
		return;
	}
	if(c == 8){
		consbuf = consbuf.substring(0, consbuf.length - 1);
		writeterminal("");
		return;
	}
	if(c == 23){
		consbuf = consbuf.substring(0, consbuf.lastIndexOf(' '));
		writeterminal("");
		return;
	}
	if(c == 21){
		consbuf = consbuf.substring(0, consbuf.lastIndexOf('\n'));
		writeterminal("");
		return;
	}
	if(c == 4){
		flush();
		return;
	}
	if(c == 13){
		consbuf += "\n";
		flush();
		return;
	}
	if(c == 27){
		holdmode = !holdmode;
		if(holdmode){
			var ta = document.getElementById("terminal");
			ta.style.backgroundColor = 'black';
			ta.style.color = 'white';
		} else {
			var ta = document.getElementById("terminal");
			ta.style.backgroundColor = 'white';
			ta.style.color = 'black';
			if(consbuf != "")
				flush();
		}
		return;
	}
	consbuf += toutf8(String.fromCharCode(c));
	if(rawmode)
		flush();
	else
		writeterminal("");
}

function
readterminal(c, f, t)
{
	if(unread != ""){
		f(unread.substring(0, c));
		unread = unread.substring(c);
	} else {
		if(t != undefined){
			var l = online.length;
			onflush(t, function() { online.splice(l, 1); });
		}
		online.push(function() { f(unread.substring(0, c)); unread = unread.substring(c); })
	}
}
