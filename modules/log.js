import fs from 'fs'
import path from 'path'
import moment from 'moment'
import Time from './time'
import Config from './config'
class Log {
  constructor () {
    this.path = path.join(Config.dir, '/logs')
    if (process.platform === 'win32') this.lineBreak = '\r\n'
    else this.lineBreak = '\n'
    this.readDir()
    this.logStatus = false
  }
  readDir () {
    fs.readdir(this.path, (error, files) => {
      if (error) this.createDir()
    })
  }
  createDir () {
    return new Promise((resolve, reject) => {
      fs.mkdir(this.path, error => {
        if (error) {
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }
  createFile (filename) {
    return new Promise((resolve, reject) => {
      fs.writeFile(this.path + '/' + filename + '.txt', '', async (error) => {
        if (error) {
          await this.createDir()
        }
        resolve(true)
      })
    })
  }
  insert (message) {
    if (!this.logStatus) return false
    let now = moment(Time.now())
    let filename = now.format('YYYYMMDD')
    let time = now.format('Z YYYY-MM-DD HH:mm:ss.ssss')
    fs.appendFile(this.path + '/' + filename + '.txt', `${time} ${message}\n`, async (error) => {
      if (error) {
        let createFile = await this.createFile(filename)
        if (createFile) this.insert(message)
      }
    })
  }
}

export default new Log()
