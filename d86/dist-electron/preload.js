"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  getRecords: (limit) => electron.ipcRenderer.invoke("get-records", limit),
  getRecordDetail: (id) => electron.ipcRenderer.invoke("get-record-detail", id),
  deleteRecord: (id) => electron.ipcRenderer.invoke("delete-record", id),
  clearRecords: () => electron.ipcRenderer.invoke("clear-records"),
  getStats: () => electron.ipcRenderer.invoke("get-stats"),
  getSettings: () => electron.ipcRenderer.invoke("get-settings"),
  updateSettings: (settings) => electron.ipcRenderer.invoke("update-settings", settings),
  getMonitorStatus: () => electron.ipcRenderer.invoke("get-monitor-status"),
  onNewRecord: (callback) => {
    electron.ipcRenderer.on("new-record", (_, record) => callback(record));
  },
  removeNewRecordListener: () => {
    electron.ipcRenderer.removeAllListeners("new-record");
  }
});
