import { defineStore } from 'pinia';
import { io } from 'socket.io-client';

class Operation {
  constructor(retain = 0, insert = '', deleteOp = 0, userId = null) {
    this.retain = retain;
    this.insert = insert;
    this.delete = deleteOp;
    this.userId = userId;
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
}

export const useDocumentStore = defineStore('document', {
  state: () => ({
    socket: null,
    docId: null,
    userId: null,
    userName: '',
    content: '',
    version: 0,
    users: [],
    connected: false,
    pendingOperations: [],
    acknowledgedVersion: 0
  }),

  actions: {
    connect() {
      this.socket = io('http://localhost:4000', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
      
      this.socket.on('connect', () => {
        this.connected = true;
        console.log('Connected to server, socket id:', this.socket.id);
        
        if (this.docId && this.userName) {
          this.joinDocument(this.docId, this.userName);
        }
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('Disconnected from server');
      });

      this.socket.on('document-state', (state) => {
        console.log('Received document state:', state);
        this.content = state.content;
        this.version = state.version;
        this.acknowledgedVersion = state.version;
        this.users = state.users;
        this.userId = state.userId;
        this.pendingOperations = [];
        console.log('My user ID:', this.userId);
      });

      this.socket.on('operation', ({ operation, version, userId }) => {
        console.log('Received operation from', userId, 'my id:', this.userId);
        
        if (userId === this.userId) {
          console.log('Skipping own operation');
          if (this.pendingOperations.length > 0) {
            this.pendingOperations.shift();
          }
          return;
        }
        
        const op = new Operation(
          operation.retain,
          operation.insert,
          operation.delete,
          userId
        );

        for (let i = 0; i < this.pendingOperations.length; i++) {
          const { op1Prime } = Operation.transform(this.pendingOperations[i], op);
          this.pendingOperations[i] = op1Prime;
        }

        const newContent = op.apply(this.content);
        console.log('Content changed from', this.content.length, 'to', newContent.length);
        this.content = newContent;
        this.version = version;
      });

      this.socket.on('ack', ({ version }) => {
        this.acknowledgedVersion = version;
        if (this.pendingOperations.length > 0) {
          this.pendingOperations.shift();
        }
        console.log('Operation acknowledged, version:', version);
      });

      this.socket.on('user-joined', ({ userId, userName, users }) => {
        console.log('User joined:', userName, userId);
        this.users = users;
      });

      this.socket.on('user-left', ({ userId, users }) => {
        console.log('User left:', userId);
        this.users = users;
      });

      this.socket.on('selection-update', ({ userId, selection, users }) => {
        const user = this.users.find(u => u.id === userId);
        if (user) {
          user.selection = selection;
        }
      });
    },

    joinDocument(docId, userName) {
      this.docId = docId;
      this.userName = userName;
      console.log('Joining document', docId, 'as', userName);
      this.socket.emit('join-document', { docId, userName });
    },

    sendOperation(operation) {
      this.pendingOperations.push(operation);
      this.socket.emit('operation', {
        operation: {
          retain: operation.retain,
          insert: operation.insert,
          delete: operation.delete
        },
        version: this.version
      });
    },

    sendSelectionUpdate(selection) {
      this.socket.emit('selection-update', { selection });
    },

    Operation
  }
});
