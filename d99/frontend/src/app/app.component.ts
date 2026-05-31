import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

interface SNP {
  pos: number;
  ref: string;
  alt: string;
  align_pos: number;
}

interface AlignmentResult {
  alignment: {
    reference: string;
    sample: string;
  };
  comparison: {
    reference: string;
    sample: string;
    status: string;
  }[];
  score: number;
  stats: {
    matches: number;
    mismatches: number;
    gaps: number;
    total_length: number;
    identity: number;
    snps_count: number;
  };
  snps: SNP[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  reference = 'ATCGATCGATCG';
  sample = 'ATCGAAGCTCG';
  result: AlignmentResult | null = null;
  loading = false;
  error = '';

  constructor(private http: HttpClient) {}

  alignSequences() {
    if (!this.reference.trim() || !this.sample.trim()) {
      this.error = '请输入两个DNA序列';
      return;
    }

    this.loading = true;
    this.error = '';
    this.result = null;

    this.http.post<AlignmentResult>('http://localhost:5000/api/align', {
      reference: this.reference.trim().toUpperCase(),
      sample: this.sample.trim().toUpperCase()
    }).subscribe({
      next: (data) => {
        this.result = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || '比对失败，请检查服务器连接';
        this.loading = false;
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'match': return 'match';
      case 'mismatch': return 'mismatch';
      case 'gap': return 'gap';
      default: return '';
    }
  }

  loadExample() {
    this.reference = 'ATCGATCGATCGATCG';
    this.sample = 'ATCGAAGCTCGATC';
  }

  clear() {
    this.reference = '';
    this.sample = '';
    this.result = null;
    this.error = '';
  }

  downloadVCF() {
    if (!this.reference.trim() || !this.sample.trim()) {
      this.error = '请先输入两个DNA序列';
      return;
    }

    this.http.post('http://localhost:5000/api/download_vcf', {
      reference: this.reference.trim().toUpperCase(),
      sample: this.sample.trim().toUpperCase()
    }, { responseType: 'blob' }).subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'variants.vcf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        },
        error: (err) => {
          this.error = 'VCF文件下载失败，请检查服务器连接';
        }
      });
  }
}
