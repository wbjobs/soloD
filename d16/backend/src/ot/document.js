const Operation = require('./operation');

class Document {
  constructor(id, initialContent = '') {
    this.id = id;
    this.content = initialContent;
    this.version = 0;
    this.history = [];
    this.users = new Map();
  }

  addUser(userId, userName) {
    this.users.set(userId, { 
      id: userId, 
      name: userName, 
      selection: { anchor: 0, head: 0 }
    });
    return this.getUsers();
  }

  removeUser(userId) {
    this.users.delete(userId);
    return this.getUsers();
  }

  updateSelection(userId, selection) {
    const user = this.users.get(userId);
    if (user) {
      user.selection = selection;
    }
    return this.getUsers();
  }

  getUsers() {
    return Array.from(this.users.values());
  }

  applyOperation(operation, expectedVersion) {
    let op = operation;

    if (expectedVersion < this.version) {
      op = this.transformAgainstHistory(operation, expectedVersion);
    }

    const newContent = op.apply(this.content);
    if (newContent === this.content && op.isNoop()) {
      return {
        content: this.content,
        version: this.version,
        operation: new Operation()
      };
    }

    this.content = newContent;
    this.history.push({
      operation: op,
      version: this.version
    });
    this.version++;

    return {
      content: this.content,
      version: this.version,
      operation: op
    };
  }

  transformAgainstHistory(operation, fromVersion) {
    let transformedOp = operation.clone();
    
    const startIdx = Math.max(0, fromVersion);
    for (let i = startIdx; i < this.history.length; i++) {
      const historyOp = this.history[i].operation;
      const { op1Prime } = Operation.transform(transformedOp, historyOp);
      transformedOp = op1Prime;
    }

    return transformedOp;
  }

  getState() {
    return {
      id: this.id,
      content: this.content,
      version: this.version,
      users: this.getUsers()
    };
  }

  getHistory() {
    return this.history.map(h => ({
      version: h.version,
      operation: h.operation.toString(),
      userId: h.operation.userId
    }));
  }
}

module.exports = Document;
