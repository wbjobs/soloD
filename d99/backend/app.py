from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def needleman_wunsch(seq1, seq2, match=1, mismatch=-1, gap=-2):
    m, n = len(seq1), len(seq2)
    score_matrix = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        score_matrix[i][0] = i * gap
    for j in range(n + 1):
        score_matrix[0][j] = j * gap
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if seq1[i-1] == seq2[j-1]:
                diagonal = score_matrix[i-1][j-1] + match
            else:
                diagonal = score_matrix[i-1][j-1] + mismatch
            
            up = score_matrix[i-1][j] + gap
            left = score_matrix[i][j-1] + gap
            score_matrix[i][j] = max(diagonal, up, left)
    
    align1, align2 = '', ''
    i, j = m, n
    
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            current_match = seq1[i-1] == seq2[j-1]
            expected_score = score_matrix[i-1][j-1] + (match if current_match else mismatch)
            if score_matrix[i][j] == expected_score:
                align1 = seq1[i-1] + align1
                align2 = seq2[j-1] + align2
                i -= 1
                j -= 1
                continue
        
        if i > 0 and score_matrix[i][j] == score_matrix[i-1][j] + gap:
            align1 = seq1[i-1] + align1
            align2 = '-' + align2
            i -= 1
        else:
            align1 = '-' + align1
            align2 = seq2[j-1] + align2
            j -= 1
    
    return align1, align2, score_matrix[m][n]

def validate_dna(sequence):
    valid_nucleotides = {'A', 'T', 'C', 'G'}
    sequence = sequence.upper().strip()
    for nucleotide in sequence:
        if nucleotide not in valid_nucleotides:
            return False, f"Invalid nucleotide: {nucleotide}"
    return True, sequence

def detect_snps(align_ref, align_sample):
    """检测单核苷酸多态性(SNP)
    返回变异位点列表，不包括插入缺失(indels)"""
    snps = []
    pos_ref = 0
    
    for i, (a, b) in enumerate(zip(align_ref, align_sample)):
        if a != '-':
            pos_ref += 1
        
        if a != '-' and b != '-' and a != b:
            snps.append({
                'pos': pos_ref,
                'ref': a,
                'alt': b,
                'align_pos': i + 1
            })
    
    return snps

def generate_vcf(ref_seq, sample_seq, snps):
    """生成VCF格式文件内容"""
    from datetime import datetime
    
    vcf_lines = [
        '##fileformat=VCFv4.3',
        f'##fileDate={datetime.now().strftime("%Y%m%d")}',
        '##source=DNA_Alignment_Tool',
        f'##reference=Input_Sequence',
        '##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">',
        '##INFO=<ID=TYPE,Number=1,Type=String,Description="Variant Type">',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
        '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE'
    ]
    
    for snp in snps:
        info = f'DP=10;TYPE=SNP'
        line = f'seq1\t{snp["pos"]}\t.\t{snp["ref"]}\t{snp["alt"]}\t.\tPASS\t{info}\tGT\t1/1'
        vcf_lines.append(line)
    
    if not snps:
        vcf_lines.append('# No variants detected')
    
    return '\n'.join(vcf_lines)

@app.route('/api/align', methods=['POST'])
def align_sequences():
    try:
        data = request.get_json()
        ref_seq = data.get('reference', '').upper()
        sample_seq = data.get('sample', '').upper()
        
        ref_valid, ref_result = validate_dna(ref_seq)
        if not ref_valid:
            return jsonify({'error': f'Reference sequence: {ref_result}'}), 400
        
        sample_valid, sample_result = validate_dna(sample_seq)
        if not sample_valid:
            return jsonify({'error': f'Sample sequence: {sample_result}'}), 400
        
        if not ref_seq or not sample_seq:
            return jsonify({'error': 'Both sequences are required'}), 400
        
        align1, align2, score = needleman_wunsch(ref_result, sample_result)
        
        matches = 0
        mismatches = 0
        gaps = 0
        comparison = []
        
        for a, b in zip(align1, align2):
            if a == b:
                matches += 1
                status = 'match'
            elif a == '-' or b == '-':
                gaps += 1
                status = 'gap'
            else:
                mismatches += 1
                status = 'mismatch'
            
            comparison.append({
                'reference': a,
                'sample': b,
                'status': status
            })
        
        snps = detect_snps(align1, align2)
        
        return jsonify({
            'alignment': {
                'reference': align1,
                'sample': align2
            },
            'comparison': comparison,
            'score': score,
            'stats': {
                'matches': matches,
                'mismatches': mismatches,
                'gaps': gaps,
                'total_length': len(align1),
                'identity': round(matches / len(align1) * 100, 2) if len(align1) > 0 else 0,
                'snps_count': len(snps)
            },
            'snps': snps
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download_vcf', methods=['POST'])
def download_vcf():
    try:
        data = request.get_json()
        ref_seq = data.get('reference', '').upper()
        sample_seq = data.get('sample', '').upper()
        
        ref_valid, ref_result = validate_dna(ref_seq)
        if not ref_valid:
            return jsonify({'error': f'Reference sequence: {ref_result}'}), 400
        
        sample_valid, sample_result = validate_dna(sample_seq)
        if not sample_valid:
            return jsonify({'error': f'Sample sequence: {sample_result}'}), 400
        
        align1, align2, _ = needleman_wunsch(ref_result, sample_result)
        snps = detect_snps(align1, align2)
        vcf_content = generate_vcf(ref_result, sample_result, snps)
        
        response = app.response_class(
            response=vcf_content,
            mimetype='text/plain',
            headers={'Content-Disposition': 'attachment; filename=variants.vcf'}
        )
        return response
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
