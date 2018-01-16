import Time from './time'
import EventEmitter from 'events'
import Database from './database'
import Datastore from './datastore'
import Crypto from './crypto'
import Block from './block'
import Util from './util'
import Socket from './tcp'
import Config from './config'
import Transaction from './transaction'
import fs from 'fs'
import eccrypto from 'eccrypto'
import SafeBuffer from 'safe-buffer'
import QRCode from 'qrcode'
const Buffer = SafeBuffer.Buffer

class Wallet extends EventEmitter {
  constructor () {
    super()
    this.addressList = []
    this.walletList = []
    this.walletUTXO = {}
    this.walletAmount = {}
    this.walletWaitAmount = {}
    this.scanLock = false
  }

  async walletTxPage (size, page) {
    return Datastore.tx.page({}, { height: -1 }, page, size)
  }

  async loadWallet () {
    let list = await Database.wallet.getAll()
    let addressList = []
    let walletLength = list.length
    for (let i = 0; i < walletLength; i++) {
      addressList.push(list[i].address)
    }
    this.addressList = addressList
    this.walletList = list
    let addressLength = this.addressList.length
    for (let i = 0; i < addressLength; i++) {
      this.walletAmount[this.addressList[i]] = 0
      this.walletWaitAmount[this.addressList[i]] = 0
      this.walletUTXO[this.addressList[i]] = {}
    }
    await this.loadStoreWalletAmount()
    this.updateWalletStatus()
  }

  clearAddressUtxo () {
    let addressLength = this.addressList.length
    for (let i = 0; i < addressLength; i++) {
      this.walletAmount[this.addressList[i]] = 0
      this.walletWaitAmount[this.addressList[i]] = 0
      this.walletUTXO[this.addressList[i]] = {}
    }
  }

  async updateWalletStatus () {
    await this.updateStoreWalletAmount()
    this.emit('update')
  }

  async scanWalletTx () {
    if (this.scanLock || this.addressList.length === 0) return false
    this.clearAddressUtxo()
    this.scanLock = true
    await Datastore.tx.remove({})
    await Datastore.utxo.remove({})
    this.emit('scan-wallet-lock')
    let nowBlock = null
    let txLength = 0
    let i = 0
    let sendScanStatusTimer = setInterval(() => {
      this.emit('scan-wallet-status', (i / Block.height) * 100)
    }, 1000)
    for (i = 0; i < Block.height; i++) {
      nowBlock = await Database.block.get(i)
      if (!nowBlock) {
        await Block.delBefore(i)
        break
      }
      txLength = nowBlock.tx.length
      for (let j = 0; j < txLength; j++) {
        let tx = await Transaction.get(nowBlock.tx[j])
        await this.scanTransaction(tx, nowBlock)
      }
    }
    clearInterval(sendScanStatusTimer)
    this.emit('scan-wallet-unlock')
    this.updateWalletStatus()
    this.scanLock = false
  }

  async scanBlock (block, updateStatus = true) {
    if (this.scanLock || this.addressList.length === 0) return false
    this.scanLock = true
    let txLength = block.tx.length
    for (let i = 0; i < txLength; i++) {
      let tx = await Transaction.get(block.tx[i])
      await this.scanTransaction(tx, block)
    }
    this.scanLock = false
    if (updateStatus) this.updateWalletStatus()
  }

  async delStoreForBlock (height) {
    await Datastore.tx.remove({
      height: height
    })
    let addressListLength = this.addressList.length
    for (let i = 0; i < addressListLength; i++) {
      for (let hash in this.walletUTXO[this.addressList[i]]) {
        if (this.walletUTXO[this.addressList[i]][hash].height === height) {
          delete this.walletUTXO[this.addressList[i]][hash]
        }
      }
    }
    this.updateWalletStatus()
  }

  async delStoreForTx (hash) {
    await Datastore.tx.remove({
      hash: hash
    })
  }

  async scanTransaction (tx, block) {
    let outShowAll = false
    let push = false
    let outLength = tx.out.length
    if (!tx.coinbase) {
      let inAddress = {}
      let showInput = []
      let inLength = tx.in.length
      for (let j = 0; j < inLength; j++) {
        let prevTx = await Transaction.get(tx.in[j].prev_out.hash)
        if (prevTx) {
          let outValue = prevTx.out[tx.in[j].prev_out.index]
          if (inAddress[outValue.script.value]) {
            inAddress[outValue.script.value] = inAddress[outValue.script.value] + outValue.value
          } else {
            inAddress[outValue.script.value] = outValue.value
          }
          if (this.walletUTXO[outValue.script.value] && this.walletUTXO[outValue.script.value][`${tx.in[j].prev_out.hash}#${tx.in[j].prev_out.index}`]) {
            delete this.walletUTXO[outValue.script.value][`${tx.in[j].prev_out.hash}#${tx.in[j].prev_out.index}`]
          }
          if (this.addressList.indexOf(outValue.script.value) > -1) {
            outShowAll = true
            push = true
          }
        }
      }
      for (let i in inAddress) {
        showInput.push({
          value: Util.fixedNumber(inAddress[i]),
          address: i
        })
      }
      tx.in = showInput
    } else {
      if (!block) {
        block = await Database.block.get(tx.height)
      }
      tx.timestamp = block.timestamp
    }
    let showOut = []
    for (let i = 0; i < outLength; i++) {
      let outValue = tx.out[i]
      if (outValue.script.action === 'address') {
        if (this.addressList.indexOf(outValue.script.value) > -1) {
          showOut.push(tx.out[i])
          this.walletUTXO[outValue.script.value][`${tx.hash}#${i}`] = {
            hash: tx.hash,
            index: i,
            height: tx.height,
            amount: outValue.value
          }
          push = true
        } else if (outShowAll) {
          showOut.push(tx.out[i])
        }
      }
    }
    tx.out = showOut
    if (push) {
      tx.showAll = false
      tx.time = Time.format(tx.timestamp)
      Datastore.tx.insert(tx)
    }
  }

  async addStoreWalletAmount (address, amount) {
    const data = await Datastore.wallet.findOne(address)
    if (data) {
      await Datastore.wallet.update({
        address: address,
        amount: Util.fixedNumber(data.amount + amount)
      })
    } else {
      await Datastore.wallet.insert({
        address: address,
        amount: Util.fixedNumber(amount)
      })
    }
  }

  async loadStoreWalletAmount () {
    const addressListLength = this.addressList.length
    for (let i = 0; i < addressListLength; i++) {
      const data = await Datastore.utxo.findOne({
        address: this.addressList[i]
      })
      if (data) {
        this.walletAmount[this.addressList[i]] = data.amount
        this.walletWaitAmount[this.addressList[i]] = data.amountWait
        this.walletUTXO[this.addressList[i]] = data.list
      }
    }
  }

  async updateStoreWalletAmount () {
    const addressListLength = this.addressList.length
    for (let i = 0; i < addressListLength; i++) {
      let amount = 0
      let amountWait = 0
      for (let hash in this.walletUTXO[this.addressList[i]]) {
        if (Block.height - this.walletUTXO[this.addressList[i]][hash].height > 4) {
          amount += this.walletUTXO[this.addressList[i]][hash].amount
        } else {
          amountWait += this.walletUTXO[this.addressList[i]][hash].amount
        }
      }
      amount = Util.fixedNumber(amount)
      amountWait = Util.fixedNumber(amountWait)
      this.walletAmount[this.addressList[i]] = amount
      this.walletWaitAmount[this.addressList[i]] = amountWait
      const listHash = Crypto.SHA256(JSON.stringify(this.walletUTXO[this.addressList[i]]))
      const data = await Datastore.utxo.findOne({
        address: this.addressList[i]
      })
      if (!data) {
        await Datastore.utxo.insert({
          address: this.addressList[i],
          listHash: listHash,
          list: this.walletUTXO[this.addressList[i]],
          amount: amount,
          amountWait: amountWait
        })
      } else if (data.listHash !== listHash) {
        await Datastore.utxo.update({
          address: this.addressList[i]
        }, {
          address: this.addressList[i],
          listHash: listHash,
          list: this.walletUTXO[this.addressList[i]],
          amount: amount,
          amountWait: amountWait
        })
      }
    }
  }

  async getWalletAmount () {
    const addressListLength = this.addressList.length
    for (let i = 0; i < addressListLength; i++) {
      let data = await Datastore.wallet.findOne(this.addressList[i])
      if (data && data.amount > 0) {
        this.walletAmount[this.addressList[i]] = data.amount
      } else {
        this.walletAmount[this.addressList[i]] = 0
      }
    }
  }

  async importWalletFile (walletFilePath) {
    const data = fs.readFileSync(walletFilePath)
    if (!data) {
      return {
        status: 0,
        message: '磁盘读写错误'
      }
    }
    const WalletObject
    try {
      WalletObject = JSON.parse(data)
    } catch (error) {
      return {
        status: 0,
        message: '钱包文件错误或已损坏'
      }
    }
    if (!WalletObject.public || !WalletObject.private) {
      return {
        status: 0,
        message: '钱包文件错误或已损坏'
      }
    }
    await this.putWallet(WalletObject)
    return {
      status: 1,
      message: '钱包已导入'
    }
  }

  async exportWalletFile (savepath, address) {
    const wallet = await Database.wallet.get(address)
    return new Promise((resolve, reject) => {
      fs.writeFile(savepath, JSON.stringify(wallet), (error) => {
        if (error) {
          resolve('磁盘读写错误')
        }
        resolve('钱包导出成功')
      })
    })
  }

  generateAddress (publicKey) {
    const publicKeyReverse = publicKey.split('').reverse().join('')
    const address = Crypto.SHA256(publicKey, 'hex') + Crypto.whirlpool(publicKeyReverse, 'hex')
    address = Crypto.SHA256(address, 'hex')
    address = Crypto.SHA256(address, 'base64')
    address = Crypto.base58.encode(address)
    return address
  }

  generateAddressQrcode (data) {
    return new Promise(function (resolve, reject) {
      QRCode.toDataURL(data, {
        margin: 0
      }, function (error, url) {
        if (error) {
          reject(error)
        } else {
          resolve(url)
        }
      })
    })
  }

  async createWallet (password) {
    let privateKey = Crypto.randomBytes(32)
    let privateKeyString = privateKey.toString('hex')
    let publicKey = eccrypto.getPublic(privateKey)
    let publicKeyString = publicKey.toString('hex')
    let publicAddress = this.generateAddress(publicKeyString)
    let secret = false
    if (password !== '') {
      secret = true
      privateKeyString = Crypto.encrypt(privateKeyString, password)
    }
    await this.putWallet({
      secret: secret,
      public: publicKeyString,
      private: privateKeyString,
      address: publicAddress
    })
  }

  async putWallet (wallet) {
    await Database.wallet.put(wallet.address, wallet)
    await this.loadWallet()
  }

  async deleteWallet (address) {
    await Database.wallet.del(address)
    await this.loadWallet()
  }

  async messageSignature (address, message, password = '') {
    let walletData = await Database.wallet.get(address)
    let walletPrivate
    if (walletData.secret) {
      walletPrivate = Crypto.decrypt(walletData.private, password)
    } else {
      walletPrivate = walletData.private
    }
    if (!walletPrivate) {
      return {
        status: 0,
        message: '签名失败'
      }
    }
    let signature
    try {
      walletPrivate = new Buffer(walletPrivate, 'hex')
      let testp = eccrypto.getPublic(walletPrivate)
      let msg = Crypto.SHA256(message, '')
      signature = await eccrypto.sign(walletPrivate, msg)
    } catch (error) {
      return {
        status: 0,
        message: '签名失败',
        error: error
      }
    }
    return {
      status: 1,
      data: signature.toString('hex') + '@' + walletData.public
    }
  }

  async messageVerification (publicString, message, signature) {
    try {
      let pub = new Buffer(publicString, 'hex')
      let msg = Crypto.SHA256(message, '')
      let sig = new Buffer(signature, 'hex')
      await eccrypto.verify(pub, msg, sig)
      return true
    } catch (error) {
      return false
    }
  }

  async submitTransaction (wallet, address, fee, password) {
    let walletData = await Database.wallet.get(wallet)
    let RTXList = await Transaction.getAllRTX()
    let RTXListLength = RTXList.length
    for (let i = 0; i < RTXListLength; i++) {
      let input = RTXList[i].in
      for (let i = input.length; i--;) {
        let prevTx = await Transaction.get(input[i].prev_out.hash)
        if (prevTx.out[input[i].prev_out.index].script.action === 'address' && prevTx.out[input[i].prev_out.index].script.value === walletData.address) {
          return {
            status: 0,
            message: '交易发布失败，内存中已有等待的交易'
          }
        }
      }
    }
    fee = Util.fixedNumber(fee)
    if (fee < 0.1) {
      return {
        status: 0,
        message: '手续费不可少于 0.1'
      }
    }
    let amount = 0
    let inputs = []
    let outputs = []
    let totalIn = 0
    let totalOut = 0
    for (let hash in this.walletUTXO[walletData.address]) {
      let prevUTXO = await Database.utxo.get(hash)
      if (!prevUTXO) {
        return {
          status: 0,
          message: '发送的交易已被使用'
        }
      }
      let script = await this.messageSignature(walletData.address, hash, password)
      if (script.status === 0) {
        return script
      }
      inputs.push({
        prev_out: {
          hash: this.walletUTXO[walletData.address][hash].hash,
          index: this.walletUTXO[walletData.address][hash].index
        },
        script: script.data
      })
      totalIn += this.walletUTXO[walletData.address][hash].amount
    }
    let addressLength = address.length
    for (let i = 0; i < addressLength; i++) {
      let addressAmount = Util.fixedNumber(address[i].amount)
      if (addressAmount && address[i].address !== '') {
        if (addressAmount < 0.000001) {
          return {
            status: 0,
            message: '输出不可少于 0.000001'
          }
        }
        outputs.push({
          value: addressAmount,
          script: {
            action: 'address',
            value: address[i].address.replace(/\s/g, '')
          }
        })
        amount += addressAmount
        totalOut += addressAmount
      }
    }
    let totalMoney = Util.fixedNumber(amount + fee)
    let myOutMoney = Util.fixedNumber(totalIn - totalMoney)
    if (!this.walletAmount[walletData.address] || totalIn < totalMoney) {
      return {
        status: 0,
        message: '可使用金额不足'
      }
    }
    if (myOutMoney > 0) {
      outputs.push({
        value: myOutMoney,
        script: {
          action: 'address',
          value: walletData.address
        }
      })
      totalOut += myOutMoney
    }
    let content = {
      version: Config.data.version,
      timestamp: Time.utc(),
      amount: {
        in: Util.fixedNumber(totalIn),
        out: Util.fixedNumber(totalOut)
      },
      in: inputs,
      out: outputs
    }
    let hash = Transaction.getHash(content)
    content.hash = hash
    let verifyTx = await Transaction.verifyTx(content)
    if (!verifyTx) {
      return {
        status: 0,
        message: '发送失败'
      }
    }
    Socket.sendNewTx(content)
    Transaction.putRTX(content)
    return {
      status: 1,
      message: '交易已发送',
      data: content
    }
  }
}
export default new Wallet()
