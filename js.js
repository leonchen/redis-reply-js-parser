var events = require("events"),
    util   = require("../util");

exports.name = "js";
exports.debug_mode = false;

function JSParser(options) {
  this.name = exports.name;
  this.options = options || {};
  this.encoding = options.encoding || "utf8";
  this.buffering = options.return_buffers;
  this.reset();
}

util.inherits(JSParser, events.EventEmitter);
exports.Parser = JSParser;

JSParser.prototype.execute = function (buffer) {
  this.buffer = this.buffer ? Buffer.concat([this.buffer.slice(this.offset), buffer]) : buffer;
  this.offset = 0;
  this.bl = this.buffer.length;

  while (this.getLine()) {
    this.parseLine();
  }
};


JSParser.prototype.reset = function () {
  this.c = null; // control char
  this.dl = null; // bulk data length
  this.ds = null; // data start
  this.de = null; // data end
  this.mr = null; // multi reply
};


JSParser.prototype.getLine = function () {
  if (this.dl !== null) {
    var dataLineEnd = this.dl+this.offset+2;
    if (dataLineEnd <= this.bl) {
      this.c = null;
      this.ds = this.offset;
      this.de = dataLineEnd-2;
      this.offset = dataLineEnd;
      return true;
    } else {
      return false;
    }
  }
  var o = this.offset;
  while (o < this.bl) {
    if (this.buffer[o] === 13 && this.buffer[o+1] === 10) {
      this.c = this.buffer[this.offset];
      this.ds = this.offset + 1;
      this.de = o;
      this.offset = o+2;
      return true;
    }
    o++;
  }
  return false;
};


JSParser.prototype.parseLine = function () {
  if (this.mr === null && this.dl === null) {
    this.parseNew();
  } else if (this.mr) {
    this.parseMulti();
  } else {
    this.sendReply();
  }
};


JSParser.prototype.parseNew = function () {
  if (this.c === 43) return this.sendReply(); // +
  if (this.c === 45) return this.replyError(); // -
  if (this.c === 58) return this.sendIntReply(); // :
  if (this.c === 36) { // $
    var s = this.getInt();
    if (s < 0) {
      this.sendReplyAs(null);
    } else {
      this.dl = s;
    }
    return;
  }
  if (this.c === 42) { // *
    var s = this.getInt();
    if (s < 0) {
      this.sendReplyAs(null);
    } else if (s === 0) {
      this.sendReplyAs([]);
    } else {
      this.mr = new M(s);
    }
    return;
  }
  return this.parserError("invalid reply");
};


JSParser.prototype.parseMulti = function () {
  // reading bulk data
  if (this.c === null) {
    this.mr.push(this.getReply());
    this.dl = null;
  // start new data
  } else {
    if (this.c === 43 || this.c === 45) { // +/-
      this.mr.push(this.getReply());
    } else if (this.c === 58) { // :
      this.mr.push(this.getInt());
    } else if (this.c === 36) { // $
      var s = this.getInt();
      if (s < 0) {
        this.mr.push(null);
      } else {
        this.dl = s;
        return;
      }
    } else if (this.c === 42) { // *
      var s = this.getInt();
      if (s < 0) {
        this.mr.push(null);
      } else if (s === 0) {
        this.mr.push([]);
      } else {
        var m = new M(s);
        this.mr.pushM(m);
        this.mr = m;
        return;
      }
    } else {
      return this.parserError("invalid multi-bulk replies");
    }
  }

  while (this.mr.isFull()) {
    if (this.mr.p === null) {
      return this.sendReplyAs(this.mr.d);
    } else {
      this.mr.p.d[this.mr.pi] = this.mr.d;
      this.mr = this.mr.p;
    }
  }
};

JSParser.prototype.parserError = function (m) {
  this.emit("error", new Error(m));
  this.reset();
};

JSParser.prototype.replyError = function () {
  this.emit("reply error", this.getString());
  this.reset();
};

JSParser.prototype.sendReply = function () {
  this.emit("reply", this.getReply());
  this.reset();
};

JSParser.prototype.sendReplyAs = function (d) {
  this.emit("reply", d);
  this.reset();
};

JSParser.prototype.sendIntReply = function () {
  this.emit("reply", this.buffering ? this.buffer.slice(this.ds, this.de) : this.getInt());
  this.reset();
};

JSParser.prototype.getReply = function () {
  return this.buffering ? this.buffer.slice(this.ds, this.de) : this.buffer.toString(this.encoding, this.ds, this.de);
};

JSParser.prototype.getInt = function () {
  return parseInt(this.getString());
};

JSParser.prototype.getString = function () {
  var s = "", i;
  for (i=this.ds; i<=this.de; i++) {
    s += String.fromCharCode(this.buffer[i]);
  }
  return s;
};


var M = function (l) {
  this.l = l;
  this.i = -1;
  this.d = [];
  this.p = null;
  this.pi = -1;
};
M.prototype.push = function (v) {
  this.d.push(v);
  this.i++;
};
M.prototype.pushM = function (m) {
  this.d.push(m);
  this.i++;
  m.p = this;
  m.pi = this.i;
};
M.prototype.isFull = function () {
  return this.l-1 === this.i;
};
