import level from 'level'
import path from 'path'
import fs from 'fs-extra'
import Config from './config'
let databasePath = path.join(Config.dir, '/database')
fs.ensureDirSync(databasePath)
let databaseObject = {
  init: () => {
    databaseObject.block = new Database('block')
    databaseObject.wallet = new Database('wallet')
    databaseObject.tx = new Database('transaction')
    databaseObject.utxo = new Database('utxo')
    databaseObject.rtx = new Database('readytransaction')
    databaseObject.rtxin = new Database('readytransactionin')
  },
  close: async () => {
    await databaseObject.block.close()
    await databaseObject.wallet.close()
    await databaseObject.tx.close()
    await databaseObject.utxo.close()
    await databaseObject.rtx.close()
    await databaseObject.rtxin.close()
  },
  block: null,
  wallet: null,
  tx: null,
  utxo: null,
  rtx: null,
  rtxin: null
}
const databaseActions = {
  getForKey: (db, key) => {
    return new Promise((resolve, reject) => {
      db.get(key, (err, value) => {
        if (err) resolve(null)
        else resolve(value)
      })
    })
  },
  delForKey: (db, key) => {
    return new Promise((resolve, reject) => {
      db.del(key, (err) => {
        if (err) resolve(false)
        else resolve(true)
      })
    })
  },
  putData: (db, key, value) => {
    return new Promise((resolve, reject) => {
      db.put(key, value, (err) => {
        if (err) resolve(null)
        else resolve(value)
      })
    })
  },
  clearData: (db, key, value) => {
    return new Promise((resolve, reject) => {
      let batchList = []
      db.createKeyStream()
        .on('data', key => {
          batchList.push({
            type: 'del',
            key: key
          })
        })
        .on('end', async () => {
          await db.batch(batchList)
          resolve(true)
        })
    })
  },
  batchData: (db, list) => {
    return new Promise((resolve, reject) => {
      db.batch(list, err => {
        if (err) resolve(false)
        resolve(true)
      })
    })
  },
  read: (db, start, limit = 1000) => {
    return new Promise((resolve, reject) => {
      let readList = []
      db.createReadStream({
        gt: start,
        limit: limit
      })
        .on('data', data => {
          readList.push(data)
        })
        .on('error', err => {
          console.log(err)
          resolve(false)
        })
        .on('close', () => {
          resolve(readList)
        })
    })
  },
  getAll: (db) => {
    return new Promise((resolve, reject) => {
      let list = []
      db.createReadStream()
        .on('data', function (data) {
          list.push(data.value)
        })
        .on('end', function (data) {
          resolve(list)
        })
    })
  },
  close: (db) => {
    return new Promise((resolve, reject) => {
      db.close(err => {
        if (err) resolve(false)
        resolve(true)
      })
    })
  }
}
class Database {
  constructor (name) {
    this.name = name
    this.db = level(path.join(databasePath, `/${name}`), {
      createIfMissing: true,
      valueEncoding: 'json'
    })
  }
  put (key, data) {
    return databaseActions.putData(this.db, key, data)
  }
  get (key) {
    return databaseActions.getForKey(this.db, key)
  }
  del (key) {
    return databaseActions.delForKey(this.db, key)
  }
  getAll () {
    return databaseActions.getAll(this.db)
  }
  batch (list) {
    return databaseActions.batchData(this.db, list)
  }
  read (start, limit) {
    return databaseActions.read(this.db, start, limit)
  }
  clear () {
    return databaseActions.clearData(this.db)
  }
  close () {
    return databaseActions.close(this.db)
  }
}
export default databaseObject
