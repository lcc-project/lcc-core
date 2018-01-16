import Time from './time'
import Block from './block'
import Config from './config'
import Util from './util'
import Log from './log'
import Transaction from './transaction'
import BigNumber from 'bignumber.js'

class Mining {
  init (addon) {
    this.addon = addon
    this.status = false
    this.txList = []
    this.txTreeList = []
    this.txTreeRoot = ''
    this.timestamp = Time.utc().toString()
    this.txFee = 0
    this.timer = {}
    this.defaultDifficulty = Config.data.defaultDifficulty
    this.mining = {
      difficulty: this.defaultDifficulty,
      startTime: 0,
      version: Config.data.network.version,
      address: '',
      prev: Block.lastHash,
      line: this.addon.hardwareConcurrency(),
      height: Block.height
    }
  }

  async getFindBlock () {
    this.stop()
    let blockData = this.addon.getFind()
    let block = {
      hash: blockData[0].toLowerCase(),
      nonce: blockData[1],
      difficulty: blockData[2],
      prev_block_hash: blockData[3],
      height: Number(blockData[4]),
      timestamp: Number(blockData[5]),
      version: blockData[6]
    }
    block.tx = this.txList
    block.merkle_root = this.txTreeRoot
    await Block.put(block)
    Log.insert(JSON.stringify(block))
    this.start()
  }

  async updateTxList (tx) {
    if (tx) {
      if (this.txTreeList.indexOf(tx.hash) > -1) return false
      this.txFee = Util.fixedNumber(this.txFee + tx.amount.in - tx.amount.out)
      let coinbase = Transaction.generateCoinbase(this.mining.address, this.timestamp, this.txFee, Config.data.coinbase)
      this.txList[0] = coinbase
      this.txTreeList[0] = coinbase.hash
      this.txList.push(tx)
      this.txTreeList.push(tx.hash)
      if (this.mining.height < 3100) {
        this.txTreeRoot = Transaction.merkleRootOld(this.txTreeList)
      } else {
        this.txTreeRoot = Transaction.merkleRoot(this.txTreeList)
      }
    } else {
      let treeList = [null]
      let txList = [null]
      let fee = 0
      let rtxList = await Transaction.getAllRTX()
      let rtxListLength = rtxList.length
      for (let i = 0; i < rtxListLength; i++) {
        fee = Util.fixedNumber(fee + rtxList[i].amount.in - rtxList[i].amount.out)
        txList.push(rtxList[i])
        treeList.push(rtxList[i].hash)
      }
      this.txFee = fee
      let coinbase = Transaction.generateCoinbase(this.mining.address, this.timestamp, fee, Config.data.coinbase)
      treeList[0] = coinbase.hash
      txList[0] = coinbase
      this.txList = txList
      this.txTreeList = treeList
      if (this.mining.height < 3100) {
        this.txTreeRoot = Transaction.merkleRootOld(treeList)
      } else {
        this.txTreeRoot = Transaction.merkleRoot(treeList)
      }
    }
    this.addon.setTreeRoot(this.txTreeRoot)
  }

  async start (address = this.mining.address) {
    this.stop()
    await this.updateTxList()
    this.status = true
    this.mining.startTime = Time.utc()
    this.mining.address = address
    this.addon.start(this.mining.prev, this.mining.difficulty, this.mining.height.toString(), this.mining.startTime.toString(), this.mining.version, this.txTreeRoot, this.mining.line)
    this.timer.findBlock = setInterval(() => {
      if (this.addon.find()) this.getFindBlock()
    }, 1000)
    this.timer.updateTimestamp = setInterval(() => {
      this.timestamp = Time.utc().toString()
      this.addon.setTimestamp(this.timestamp)
    }, 5000)
  }

  getCount () {
    return this.addon.count()
  }

  getStatus () {
    return {
      status: this.status,
      startTime: this.mining.startTime,
      line: this.mining.line,
      runTime: this.status ? Time.utc() - this.mining.startTime : 0,
      height: this.mining.height,
      total: this.getCount(),
      prev: this.mining.prev,
      address: this.mining.address,
      difficulty: new BigNumber('0x' + this.defaultDifficulty).div('0x' + this.mining.difficulty).toFixed(0)
    }
  }

  stop () {
    clearInterval(this.timer.findBlock)
    clearInterval(this.timer.updateTimestamp)
    this.addon.clear()
    this.status = false
  }

  setMiningData () {
    let startStatus = false
    if (this.status) {
      startStatus = true
      this.stop()
    }
    this.mining.height = Block.height + 1
    this.mining.prev = Block.lastHash
    this.mining.difficulty = Block.difficulty
    if (startStatus) {
      setTimeout(() => {
        this.start()
      }, 1000)
    }
  }

  setLine (line) {
    this.mining.line = line
  }

  getHash (block, height, prev) {
    if (height < 3100) {
      return this.addon.verifyOld(block.nonce, block.difficulty, prev, height, block.timestamp, block.version).toLowerCase()
    }
    return this.addon.verify(block.nonce, block.difficulty, prev, height, block.timestamp, block.version, block.merkle_root).toLowerCase()
  }

  hardwareConcurrency () {
    return this.addon.hardwareConcurrency()
  }
}
export default new Mining()
