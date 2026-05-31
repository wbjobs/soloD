import sys
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QPushButton, QFileDialog, QTableWidget, QTableWidgetItem, 
                             QTabWidget, QLabel, QSplitter, QHeaderView, QMessageBox)
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont
from packet_analyzer import PacketAnalyzer


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.analyzer = PacketAnalyzer()
        self.init_ui()
        
    def init_ui(self):
        self.setWindowTitle('网络数据包分析工具')
        self.setGeometry(100, 100, 1400, 900)
        
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        main_layout = QVBoxLayout(central_widget)
        
        button_layout = QHBoxLayout()
        self.open_btn = QPushButton('打开 pcap/pcapng 文件')
        self.open_btn.setFont(QFont('Arial', 10))
        self.open_btn.setMinimumHeight(40)
        self.open_btn.clicked.connect(self.open_file)
        button_layout.addWidget(self.open_btn)
        button_layout.addStretch()
        
        main_layout.addLayout(button_layout)
        
        self.file_label = QLabel('未加载文件')
        self.file_label.setFont(QFont('Arial', 9))
        main_layout.addWidget(self.file_label)
        
        splitter = QSplitter(Qt.Vertical)
        
        self.tab_widget = QTabWidget()
        
        self.packet_table = QTableWidget()
        self.setup_packet_table()
        self.tab_widget.addTab(self.packet_table, '数据包列表')
        
        self.ip_table = QTableWidget()
        self.setup_ip_table()
        self.tab_widget.addTab(self.ip_table, 'IP通信统计')
        
        self.detail_table = QTableWidget()
        self.setup_detail_table()
        self.tab_widget.addTab(self.detail_table, 'TCP/UDP详细信息')
        
        splitter.addWidget(self.tab_widget)
        
        self.stats_label = QLabel('统计信息：等待加载文件...')
        self.stats_label.setFont(QFont('Arial', 10))
        splitter.addWidget(self.stats_label)
        
        splitter.setSizes([700, 50])
        
        main_layout.addWidget(splitter)
        
    def setup_packet_table(self):
        headers = ['序号', '时间', '源IP', '目的IP', '协议', '源端口', '目的端口', '长度']
        self.packet_table.setColumnCount(len(headers))
        self.packet_table.setHorizontalHeaderLabels(headers)
        header = self.packet_table.horizontalHeader()
        for i in range(len(headers)):
            header.setSectionResizeMode(i, QHeaderView.ResizeToContents)
    
    def setup_ip_table(self):
        headers = ['IP地址', '发送数据包', '接收数据包', '总计']
        self.ip_table.setColumnCount(len(headers))
        self.ip_table.setHorizontalHeaderLabels(headers)
        header = self.ip_table.horizontalHeader()
        for i in range(len(headers)):
            header.setSectionResizeMode(i, QHeaderView.Stretch)
    
    def setup_detail_table(self):
        headers = ['序号', '源IP:端口', '目的IP:端口', '协议', 'TCP标志', 'TCP序列号', 'TCP确认号', 'TCP窗口', 'UDP长度']
        self.detail_table.setColumnCount(len(headers))
        self.detail_table.setHorizontalHeaderLabels(headers)
        header = self.detail_table.horizontalHeader()
        for i in range(len(headers)):
            header.setSectionResizeMode(i, QHeaderView.ResizeToContents)
    
    def open_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            '选择pcap文件',
            '',
            'PCAP Files (*.pcap *.pcapng);;All Files (*)'
        )
        
        if file_path:
            success, msg = self.analyzer.load_pcap(file_path)
            if success:
                self.file_label.setText(f'已加载: {file_path}')
                self.populate_tables()
                self.update_stats()
                QMessageBox.information(self, '成功', msg)
            else:
                QMessageBox.critical(self, '错误', msg)
    
    def populate_tables(self):
        packets = self.analyzer.get_packet_list()
        ip_stats = self.analyzer.get_ip_statistics()
        
        self.packet_table.setRowCount(len(packets))
        for row, pkt in enumerate(packets):
            self.packet_table.setItem(row, 0, QTableWidgetItem(str(pkt['no'])))
            self.packet_table.setItem(row, 1, QTableWidgetItem(pkt['time']))
            self.packet_table.setItem(row, 2, QTableWidgetItem(pkt['src_ip']))
            self.packet_table.setItem(row, 3, QTableWidgetItem(pkt['dst_ip']))
            self.packet_table.setItem(row, 4, QTableWidgetItem(pkt['protocol']))
            self.packet_table.setItem(row, 5, QTableWidgetItem(pkt['src_port']))
            self.packet_table.setItem(row, 6, QTableWidgetItem(pkt['dst_port']))
            self.packet_table.setItem(row, 7, QTableWidgetItem(str(pkt['length'])))
        
        self.ip_table.setRowCount(len(ip_stats))
        for row, stat in enumerate(ip_stats):
            self.ip_table.setItem(row, 0, QTableWidgetItem(stat['ip']))
            self.ip_table.setItem(row, 1, QTableWidgetItem(str(stat['sent'])))
            self.ip_table.setItem(row, 2, QTableWidgetItem(str(stat['received'])))
            self.ip_table.setItem(row, 3, QTableWidgetItem(str(stat['total'])))
        
        tcp_udp_packets = [p for p in packets if p['protocol'] in ['TCP', 'UDP']]
        self.detail_table.setRowCount(len(tcp_udp_packets))
        for row, pkt in enumerate(tcp_udp_packets):
            src = f"{pkt['src_ip']}:{pkt['src_port']}" if pkt['src_port'] else pkt['src_ip']
            dst = f"{pkt['dst_ip']}:{pkt['dst_port']}" if pkt['dst_port'] else pkt['dst_ip']
            self.detail_table.setItem(row, 0, QTableWidgetItem(str(pkt['no'])))
            self.detail_table.setItem(row, 1, QTableWidgetItem(src))
            self.detail_table.setItem(row, 2, QTableWidgetItem(dst))
            self.detail_table.setItem(row, 3, QTableWidgetItem(pkt['protocol']))
            self.detail_table.setItem(row, 4, QTableWidgetItem(pkt['tcp_flags']))
            self.detail_table.setItem(row, 5, QTableWidgetItem(pkt['tcp_seq']))
            self.detail_table.setItem(row, 6, QTableWidgetItem(pkt['tcp_ack']))
            self.detail_table.setItem(row, 7, QTableWidgetItem(pkt['tcp_window']))
            self.detail_table.setItem(row, 8, QTableWidgetItem(pkt['udp_length']))
    
    def update_stats(self):
        packets = self.analyzer.get_packet_list()
        proto_stats = self.analyzer.get_protocol_stats()
        ip_stats = self.analyzer.get_ip_statistics()
        
        proto_str = ', '.join([f'{k}:{v}' for k, v in proto_stats.items()])
        stats_text = (f'总计: {len(packets)} 个数据包 | '
                     f'协议统计: {proto_str} | '
                     f'活跃IP数: {len(ip_stats)}')
        self.stats_label.setText(stats_text)


def main():
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    window = MainWindow()
    window.show()
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
