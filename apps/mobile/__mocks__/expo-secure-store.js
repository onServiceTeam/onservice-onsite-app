const memory = new Map();
module.exports = {
  getItemAsync: jest.fn((key) => Promise.resolve(memory.get(key) ?? null)),
  setItemAsync: jest.fn((key, value) => { memory.set(key, value); return Promise.resolve(); }),
  deleteItemAsync: jest.fn((key) => { memory.delete(key); return Promise.resolve(); }),
};
