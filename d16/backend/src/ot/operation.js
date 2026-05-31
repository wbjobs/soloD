class Operation {
  constructor(retain = 0, insert = '', deleteOp = 0, userId = null) {
    this.retain = retain;
    this.insert = insert;
    this.delete = deleteOp;
    this.userId = userId;
    this.timestamp = Date.now();
  }

  static insert(position, text, userId) {
    return new Operation(position, text, 0, userId);
  }

  static delete(position, length, userId) {
    return new Operation(position, '', length, userId);
  }

  isInsert() {
    return this.insert.length > 0;
  }

  isDelete() {
    return this.delete > 0;
  }

  isNoop() {
    return !this.isInsert() && !this.isDelete();
  }

  apply(document) {
    if (this.isNoop()) {
      return document;
    }

    let result = '';
    result += document.slice(0, this.retain);
    result += this.insert;
    result += document.slice(this.retain + this.delete);
    return result;
  }

  static transform(op1, op2) {
    if (op1.isInsert() && op2.isInsert()) {
      return Operation.transformInsertInsert(op1, op2);
    }
    if (op1.isInsert() && op2.isDelete()) {
      return Operation.transformInsertDelete(op1, op2);
    }
    if (op1.isDelete() && op2.isInsert()) {
      return Operation.transformDeleteInsert(op1, op2);
    }
    if (op1.isDelete() && op2.isDelete()) {
      return Operation.transformDeleteDelete(op1, op2);
    }
    return Operation.transformRetain(op1, op2);
  }

  static transformInsertInsert(op1, op2) {
    if (op1.retain < op2.retain) {
      return {
        op1Prime: new Operation(op1.retain, op1.insert, 0, op1.userId),
        op2Prime: new Operation(op2.retain + op1.insert.length, op2.insert, 0, op2.userId)
      };
    } else if (op1.retain > op2.retain) {
      return {
        op1Prime: new Operation(op1.retain + op2.insert.length, op1.insert, 0, op1.userId),
        op2Prime: new Operation(op2.retain, op2.insert, 0, op2.userId)
      };
    } else {
      if (op1.userId < op2.userId) {
        return {
          op1Prime: new Operation(op1.retain, op1.insert, 0, op1.userId),
          op2Prime: new Operation(op2.retain + op1.insert.length, op2.insert, 0, op2.userId)
        };
      } else {
        return {
          op1Prime: new Operation(op1.retain + op2.insert.length, op1.insert, 0, op1.userId),
          op2Prime: new Operation(op2.retain, op2.insert, 0, op2.userId)
        };
      }
    }
  }

  static transformInsertDelete(op1, op2) {
    if (op1.retain <= op2.retain) {
      return {
        op1Prime: new Operation(op1.retain, op1.insert, 0, op1.userId),
        op2Prime: new Operation(op2.retain + op1.insert.length, '', op2.delete, op2.userId)
      };
    } else if (op1.retain >= op2.retain + op2.delete) {
      return {
        op1Prime: new Operation(op1.retain - op2.delete, op1.insert, 0, op1.userId),
        op2Prime: new Operation(op2.retain, '', op2.delete, op2.userId)
      };
    } else {
      const insertInDeleteRange = op1.retain - op2.retain;
      return {
        op1Prime: new Operation(op2.retain, op1.insert, 0, op1.userId),
        op2Prime: new Operation(op2.retain, '', insertInDeleteRange, op2.userId)
      };
    }
  }

  static transformDeleteInsert(op1, op2) {
    if (op2.retain <= op1.retain) {
      return {
        op1Prime: new Operation(op1.retain + op2.insert.length, '', op1.delete, op1.userId),
        op2Prime: new Operation(op2.retain, op2.insert, 0, op2.userId)
      };
    } else if (op2.retain >= op1.retain + op1.delete) {
      return {
        op1Prime: new Operation(op1.retain, '', op1.delete, op1.userId),
        op2Prime: new Operation(op2.retain - op1.delete, op2.insert, 0, op2.userId)
      };
    } else {
      const insertInDeleteRange = op2.retain - op1.retain;
      return {
        op1Prime: new Operation(op1.retain, '', insertInDeleteRange, op1.userId),
        op2Prime: new Operation(op1.retain, op2.insert, 0, op2.userId)
      };
    }
  }

  static transformDeleteDelete(op1, op2) {
    if (op1.retain + op1.delete <= op2.retain) {
      return {
        op1Prime: new Operation(op1.retain, '', op1.delete, op1.userId),
        op2Prime: new Operation(op2.retain - op1.delete, '', op2.delete, op2.userId)
      };
    } else if (op2.retain + op2.delete <= op1.retain) {
      return {
        op1Prime: new Operation(op1.retain - op2.delete, '', op1.delete, op1.userId),
        op2Prime: new Operation(op2.retain, '', op2.delete, op2.userId)
      };
    } else if (op1.retain <= op2.retain) {
      const overlapStart = op2.retain;
      const overlapEnd = Math.min(op1.retain + op1.delete, op2.retain + op2.delete);
      const overlap = overlapEnd - overlapStart;
      
      const op1DeleteBeforeOverlap = op2.retain - op1.retain;
      const op1DeleteAfterOverlap = Math.max(0, (op1.retain + op1.delete) - (op2.retain + op2.delete));
      
      return {
        op1Prime: new Operation(op1.retain, '', op1DeleteBeforeOverlap + op1DeleteAfterOverlap, op1.userId),
        op2Prime: new Operation(op2.retain, '', Math.max(0, op2.delete - overlap), op2.userId)
      };
    } else {
      const overlapStart = op1.retain;
      const overlapEnd = Math.min(op2.retain + op2.delete, op1.retain + op1.delete);
      const overlap = overlapEnd - overlapStart;
      
      const op2DeleteBeforeOverlap = op1.retain - op2.retain;
      const op2DeleteAfterOverlap = Math.max(0, (op2.retain + op2.delete) - (op1.retain + op1.delete));
      
      return {
        op1Prime: new Operation(op1.retain, '', Math.max(0, op1.delete - overlap), op1.userId),
        op2Prime: new Operation(op2.retain, '', op2DeleteBeforeOverlap + op2DeleteAfterOverlap, op2.userId)
      };
    }
  }

  static transformRetain(op1, op2) {
    if (op1.isInsert()) {
      if (op2.retain >= op1.retain) {
        return {
          op1Prime: op1,
          op2Prime: new Operation(op2.retain + op1.insert.length, '', op2.delete, op2.userId)
        };
      }
    }
    if (op2.isInsert()) {
      if (op1.retain >= op2.retain) {
        return {
          op1Prime: new Operation(op1.retain + op2.insert.length, '', op1.delete, op1.userId),
          op2Prime: op2
        };
      }
    }
    return { op1Prime: op1, op2Prime: op2 };
  }

  clone() {
    return new Operation(this.retain, this.insert, this.delete, this.userId);
  }

  toString() {
    return `Operation(retain=${this.retain}, insert='${this.insert}', delete=${this.delete}, user=${this.userId})`;
  }
}

module.exports = Operation;
