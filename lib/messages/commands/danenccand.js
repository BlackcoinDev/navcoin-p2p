'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('@aguycalled/bitcore-lib');
var utils = require('../utils');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;
var BufferUtil = bitcore.util.buffer;
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;

/**
 * A message to confirm that a connection is still valid.
 * @param {Number} arg - A nonce for the Ping message
 * @param {Object=} options
 * @extends Message
 * @constructor
 */
function DanEncCand(arg, options) {
  Message.call(this, options);
  this.command = 'danenccand';
  if (!arg) {
    arg = {};
  }
  this.pk = arg.pk || new Buffer(0);
  this.sessionId = arg.sessionId || new Buffer(0);
  this.vData = arg.vData || new Buffer(0);
}
inherits(DanEncCand, Message);

DanEncCand.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  this.pk = parser.readVarLengthBuffer();
  this.sessionId = parser.readVarLengthBuffer();

  if (this.sessionId.length > 48)
  {
    this.vData = Buffer.from(this.sessionId);
    this.sessionId = Buffer.from([]);
  } else {
    this.vData = parser.readVarLengthBuffer();
  }

  utils.checkFinished(parser);
};

DanEncCand.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeVarintNum(this.pk.length);
  bw.write(this.pk);
  if (this.sessionId.length > 0) {
    bw.writeVarintNum(this.sessionId.length);
    bw.write(this.sessionId);
  }
  bw.writeVarintNum(this.vData.length);
  bw.write(this.vData);
  return bw.concat();
};

module.exports = DanEncCand;
