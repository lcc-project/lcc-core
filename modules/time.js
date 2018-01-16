import moment from 'moment'
class Time {
  constructor () {
    this.status = false
    this.offset = 0
  }
  getOffset () {
  }
  now () {
    return moment(Date.now() + this.offset).valueOf()
  }
  fromNow (time) {
    return moment(time + this.offset).fromNow()
  }
  utc () {
    return moment(Date.now() + this.offset).utc().valueOf()
  }
  format (time = Date.now()) {
    if (typeof time !== 'number') return 'N/A'
    return moment(time).format('YYYY-MM-DD HH:mm:ss')
  }
  setOffset (offset) {
    if (isNaN(offset) || offset === 0 || offset === Infinity) return false
    this.offset = Number(offset)
  }
  data () {
    let now = Date.now()
    let m = moment(now + this.offset)
    return {
      offset: Math.round(this.offset),
      local: m.format('YYYY-MM-DD HH:mm:ss'),
      utc: m.utc().format('YYYY-MM-DD HH:mm:ss')
    }
  }
}

export default new Time()
