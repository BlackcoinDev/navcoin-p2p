'use strict';

var bitcore = require('@aguycalled/bitcore-lib');
var Inventory = require('../inventory');

function builder(options) {
  /* jshint maxstatements: 20 */
  /* jshint maxcomplexity: 10 */

  if (!options) {
    options = {};
  }

  if (!options.network) {
    options.network = bitcore.Networks.defaultNetwork;
  }

  options.Block = options.Block || bitcore.Block;
  options.BlockHeader = options.BlockHeader || bitcore.BlockHeader;
  options.Transaction = options.Transaction || bitcore.Transaction;
  options.MerkleBlock = options.MerkleBlock || bitcore.MerkleBlock;
  options.protocolVersion = options.protocolVersion || 70001;

  var exported = {
    constructors: {
      Block: options.Block,
      BlockHeader: options.BlockHeader,
      Transaction: options.Transaction,
      MerkleBlock: options.MerkleBlock
    },
    defaults: {
      protocolVersion: options.protocolVersion,
      network: options.network
    },
    inventoryCommands: [
      'getdata',
      'inv',
      'notfound'
    ],
    commandsMap: {
      version: 'Version',
      verack: 'VerAck',
      ping: 'Ping',
      pong: 'Pong',
      block: 'Block',
      tx: 'Transaction',
      getdata: 'GetData',
      headers: 'Headers',
      notfound: 'NotFound',
      inv: 'Inventory',
      addr: 'Addresses',
      alert: 'Alert',
      reject: 'Reject',
      merkleblock: 'MerkleBlock',
      filterload: 'FilterLoad',
      filteradd: 'FilterAdd',
      filterclear: 'FilterClear',
      getblocks: 'GetBlocks',
      getheaders: 'GetHeaders',
      mempool: 'MemPool',
      getaddr: 'GetAddr',
      sendheaders: 'SendHeaders',
      enccand: 'EncCand',
      danenccand: 'DanEncCand',
      aggsess: 'AggSess',
      daggsess: 'DAggSess'
    },
    commands: {}
  };

  exported.add = function(key, Command) {
    exported.commands[key] = function(obj) {
      return new Command(obj, options);
    };

    exported.commands[key]._constructor = Command;

    exported.commands[key].fromBuffer = function(buffer) {
      var message = exported.commands[key]();
      message.setPayload(buffer);
      return message;
    };
  };

  Object.keys(exported.commandsMap).forEach(function(key) {
    exported.add(key, require('./commands/' + key));
  });

  exported.inventoryCommands.forEach(function(command) {

    // add forTransaction methods
    exported.commands[command].forTransaction = function forTransaction(hash) {
      return new exported.commands[command]([Inventory.forTransaction(hash)]);
    };

    // add forDandelionTransaction methods
    exported.commands[command].forDandelionTransaction = function forDandelionTransaction(hash) {
      return new exported.commands[command]([Inventory.forDandelionTransaction(hash)]);
    };

    // add forBlock methods
    exported.commands[command].forBlock = function forBlock(hash) {
      return new exported.commands[command]([Inventory.forBlock(hash)]);
    };

    // add forFilteredBlock methods
    exported.commands[command].forFilteredBlock = function forFilteredBlock(hash) {
      return new exported.commands[command]([Inventory.forFilteredBlock(hash)]);
    };

    // add forFilteredBlock methods
    exported.commands[command].forEncCand = function forEncCand(hash) {
      return new exported.commands[command]([Inventory.forEncCand(hash)]);
    };

    // add forFilteredBlock methods
    exported.commands[command].forDandelionEncCand = function forDandelionEncCand(hash) {
      return new exported.commands[command]([Inventory.forDandelionEncCand(hash)]);
    };

    // add forFilteredBlock methods
    exported.commands[command].forAggSession = function forAggSession(hash) {
      return new exported.commands[command]([Inventory.forAggSession(hash)]);
    };

    // add forFilteredBlock methods
    exported.commands[command].forDandelionAggSession = function forDandelionAggSession(hash) {
      return new exported.commands[command]([Inventory.forDandelionAggSession(hash)]);
    };

  });

  return exported;

}

module.exports = builder;
