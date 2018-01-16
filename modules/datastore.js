import Datastore from 'nedb'
import Config from './config'
import path from 'path'
import fs from 'fs-extra'
let datastorePath = path.join(Config.dir, '/datastore')
fs.ensureDirSync(datastorePath)
let datastoreObject = {
  init: () => {
    datastoreObject.tx = new Database('tx')
    datastoreObject.utxo = new Database('utxo')
    datastoreObject.wallet = new Database('wallet')
    datastoreObject.config = new Database('config')
  },
  tx: null,
  wallet: null,
  utxo: null,
  config: null
}
class Database {
  constructor (name) {
    this.db = new Datastore({
      autoload: true,
      filename: path.join(datastorePath, `/${name}.db`)
    })
  }
  findOne (query) {
    return new Promise((resolve, reject) => {
      this.db.findOne(query, (err, docs) => {
        if (err) resolve(false)
        resolve(docs)
      })
    })
  }
  find (query) {
    return new Promise((resolve, reject) => {
      this.db.find(query, (err, docs) => {
        if (err) resolve(false)
        resolve(docs)
      })
    })
  }
  page (query, sort, page, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.find(query).sort(sort).skip((page - 1) * limit).limit(limit).exec((err, docs) => {
        if (err) resolve(false)
        resolve(docs)
      })
    })
  }
  insert (doc) {
    return new Promise((resolve, reject) => {
      this.db.insert(doc, (err, newDoc) => {
        if (err) resolve(false)
        resolve(newDoc)
      })
    })
  }
  update (query, update, options = {}) {
    return new Promise((resolve, reject) => {
      this.db.update(query, update, options, (err, numReplaced) => {
        if (err) resolve(false)
        resolve(numReplaced)
      })
    })
  }
  remove (query, options = { multi: true }) {
    return new Promise((resolve, reject) => {
      this.db.remove(query, options, (err, numRemoved) => {
        if (err) resolve(false)
        resolve(numRemoved)
      })
    })
  }
  count (query) {
    return new Promise((resolve, reject) => {
      this.db.count(query, (err, count) => {
        if (err) resolve(false)
        resolve(count)
      })
    })
  }
  ensureIndex (options) {
    return new Promise((resolve, reject) => {
      this.db.ensureIndex(options, (err) => {
        if (err) resolve(false)
        resolve(true)
      })
    })
  }
  removeIndex (field) {
    return new Promise((resolve, reject) => {
      this.db.removeIndex(field, (err) => {
        if (err) resolve(false)
        resolve(true)
      })
    })
  }
}
export default datastoreObject
