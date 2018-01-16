import Mining from './mining'
class Util {
  blockTest (block, height, prev) {
    return Mining.checksums(block.nonce, block.difficulty, prev, height, block.timestamp, block.maker_hash, block.verison)
  }
  fixedNumberOld (num) {
    return Number((Math.floor(num * 100) / 100).toFixed(2))
  }
  fixedNumberFour (num) {
    if (typeof num !== 'number') num = Number(num)
    return Number((Math.round(num * 10000) / 10000).toFixed(4))
  }
  fixedNumber (num) {
    if (typeof num !== 'number') num = Number(num)
    return Number((Math.round(num * 1000000) / 1000000).toFixed(6))
  }
}
export default new Util()
