import crypto from 'crypto'
import SafeBuffer from 'safe-buffer'
import BaseX from 'base-x'
const Buffer = SafeBuffer.Buffer
const Base62 = BaseX('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
const Base58 = BaseX('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789')
const DESEncrypt = (text, password) => {
  password = password.length >= 24 ? password.slice(0, 24) : password.concat('D'.repeat(24 - password.length))
  let cipheriv = crypto.createCipher('des-ede3', new Buffer(password))
  let data = cipheriv.update(text, 'utf8', 'base64')
  data += cipheriv.final('base64')
  return data
}
const DESDecrypt = (text, password) => {
  password = password.length >= 24 ? password.slice(0, 24) : password.concat('D'.repeat(24 - password.length))
  let cipheriv = crypto.createDecipher('des-ede3', new Buffer(password))
  let data = ''
  try {
    data += cipheriv.update(text, 'base64', 'utf8')
    data += cipheriv.final('utf8')
  } catch (error) {
    return false
  }
  return data
}
const SHA512 = (text, out = 'hex') => {
  text = text.toString()
  return crypto.createHash('sha512').update(text).digest(out)
}
export default {
  randomBytes: (byte) => crypto.randomBytes(byte),
  SHA256: (text, out = 'hex') => {
    text = text.toString()
    if (out === '') {
      return crypto.createHash('sha256').update(text).digest()
    } else {
      return crypto.createHash('sha256').update(text).digest(out)
    }
  },
  base62: {
    encode: (text) => {
      let buffer = new Buffer(text, 'base64')
      return Base62.encode(buffer)
    },
    decode: (text) => {
      let buffer = Base62.decode(text)
      return buffer.toString('base64')
    }
  },
  base58: {
    encode: (text) => {
      let buffer = new Buffer(text, 'base64')
      return Base58.encode(buffer)
    },
    decode: (text) => {
      let buffer = Base58.decode(text)
      return buffer.toString('base64')
    }
  },
  RIPEMD160: (text, out = 'hex') => {
    text = text.toString()
    return crypto.createHash('ripemd160').update(text).digest(out)
  },
  whirlpool: (text, out = 'hex') => {
    text = text.toString()
    return crypto.createHash('whirlpool').update(text).digest(out)
  },
  encrypt: (text, password) => {
    let count
    let length = password.length
    let suffixLength = 0
    let data = text
    password = SHA512(password)
    count = Math.ceil(length / 24)
    suffixLength = 24 - (length % 24)
    for (let i = 0; i < suffixLength; i++) {
      password += 'D'
    }
    for (let i = 0; i < count; i++) {
      let now = (i + 1) * 24
      data = DESEncrypt(data, password.slice(now - 24, now))
    }
    return data
  },
  decrypt: (text, password) => {
    let count
    let length = password.length
    let suffixLength = 0
    let data = text
    password = SHA512(password)
    count = Math.ceil(length / 24)
    suffixLength = 24 - (length % 24)
    for (let i = 0; i < suffixLength; i++) {
      password += 'D'
    }
    for (let i = count; i > 0; i--) {
      let now = i * 24
      data = DESDecrypt(data, password.slice(now - 24, now))
    }
    return data
  }
}
