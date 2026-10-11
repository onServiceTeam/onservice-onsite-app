class MMKV {
  constructor() {
    this.store = new Map();
  }
  set(k, v) {
    this.store.set(k, v);
  }
  getString(k) {
    const v = this.store.get(k);
    return typeof v === 'string' ? v : undefined;
  }
  getBoolean(k) {
    const v = this.store.get(k);
    return typeof v === 'boolean' ? v : undefined;
  }
  getNumber(k) {
    const v = this.store.get(k);
    return typeof v === 'number' ? v : undefined;
  }
  contains(k) {
    return this.store.has(k);
  }
  remove(k) {
    return this.store.delete(k);
  }
  clearAll() {
    this.store.clear();
  }
  getAllKeys() {
    return Array.from(this.store.keys());
  }
}
module.exports = { createMMKV: () => new MMKV() };
